import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  FileCheck,
  FileText,
  Upload,
  Download,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  BookOpen,
  Wand2,
  AlertCircle,
  MessageSquare,
  PlusCircle,
  Send,
  Bot,
  User,
  Award,
  Calendar,
  Layers,
  HelpCircle
} from 'lucide-react';
import mammoth from 'mammoth';
import { generateExamDocxBlob, generateCourseTemplateDocxBlob } from '../lib/wordExporter';
import { Course, Lesson } from '../types';
import { getStoredCourses, saveStoredCourses } from '../lib/storage';

interface TeacherAiModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onCourseCreated?: (course: Course) => void;
  onOpenCourseEditor?: (course: Course) => void;
  initialTab?: TeacherAiTab;
  isInline?: boolean;
}

export type TeacherAiTab = 'CHAT_AI' | 'CREATE_COURSE' | 'STANDARDIZE' | 'GENERATE';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  time: string;
}

interface ParsedCourseData {
  title: string;
  description: string;
  imageUrl: string;
  startDate: string;
  endDate: string;
  onlineMeetingConfig?: {
    enabled?: boolean;
    platform?: 'google_meet' | 'ms_teams' | 'zoom' | 'other';
    meetingUrl?: string;
    title?: string;
    scheduleTime?: string;
    note?: string;
  };
  lessons: Array<{
    title: string;
    videoUrl?: string;
    docUrl?: string;
    pptUrl?: string;
    durationMin?: number;
  }>;
  certificateConfig?: {
    enabled?: boolean;
    parentOrganization?: string;
    organization?: string;
    certNumberSuffix?: string;
    signerTitle?: string;
    delegateTitle?: string;
    signerName?: string;
  };
}

const SAMPLE_COURSE_TEXT = `I. THÔNG TIN CHUNG
Tên khóa học*: Ôn tập Hóa học 12 - Chương 1: Este & Lipit
Link ảnh bìa khóa học: https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=800&q=80
Mô tả khóa học: Khóa học tóm tắt toàn bộ lý thuyết trọng tâm và các dạng bài tập phân loại Este - Lipit cho học sinh khối 12.
Thời gian mở khóa học: 2026-08-01
Thời gian kết thúc khóa học: 2026-12-31

II. PHÒNG HỌC ONLINE (GOOGLE MEET, MS TEAMS, ZOOM)
Nền tảng phòng học: Google Meet
Tên phòng học / Tiêu đề: Lớp học trực tuyến Hóa 12 - Ôn tập Este Lipit
Link phòng học Online (URL) *: https://meet.google.com/abc-defg-hij
Lịch học trực tuyến (Tùy chọn): Tối thứ 3 & thứ 5 (19h30 - 21h00)
Ghi chú / Passcode (Tùy chọn): Mật khẩu: 123456

III. NỘI DUNG CÁC BÀI HỌC
1. Bài 1
Tên bài học: Bài 1. Khái niệm, Danh pháp và Tính chất hóa học của Este
Link Video (Youtube/MP4): https://www.youtube.com/watch?v=dQw4w9WgXcQ
Link File Tài liệu (PDF/Drive): https://drive.google.com/file/d/1sample_document/view
Link Slide PPT / Google Slides: https://docs.google.com/presentation/d/1sample_slide/edit
Thời gian học tối thiểu (phút): 45

2. Bài 2
Tên bài học: Bài 2. Cấu tạo, Tính chất và Phản ứng Thủy phân của Lipit
Link Video (Youtube/MP4): https://www.youtube.com/watch?v=dQw4w9WgXcQ
Link File Tài liệu (PDF/Drive): https://drive.google.com/file/d/2sample_document/view
Link Slide PPT / Google Slides: https://docs.google.com/presentation/d/2sample_slide/edit
Thời gian học tối thiểu (phút): 40

V. CẤP GIẤY CHỨNG NHẬN HOÀN THÀNH KHÓA HỌC
Tên Đơn vị chủ quản: SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG
Tên Đơn vị trực tiếp: TRƯỜNG THPT NGUYỄN QUANG DIÊU
Ký hiệu / Hậu tố Số Giấy chứng nhận: NQD-HH12
Chức vụ người ký: HIỆU TRƯỜNG
Chức vụ người ký thay (nếu có): KT. HIỆU TRƯỜNG - PHÓ HIỆU TRƯỜNG
Họ tên người ký: Nguyễn Văn A`;

const SUGGESTED_QUESTIONS = [
  '📘 Cách tạo nhanh khóa học từ file Word?',
  '📝 Cách chuẩn hóa đề thi có đáp án (*)?',
  '📑 Cho tôi xem cấu trúc file Word mẫu tạo khóa học',
  '🎓 Quy trình tự động cấp Giấy chứng nhận?',
  '📊 Cách nhập danh sách tài khoản học sinh từ Excel?'
];

export const TeacherAiModal: React.FC<TeacherAiModalProps> = ({
  isOpen = true,
  onClose,
  onCourseCreated,
  onOpenCourseEditor,
  initialTab,
  isInline = false,
}) => {
  const [activeTab, setActiveTab] = useState<TeacherAiTab>(initialTab || 'CHAT_AI');

  useEffect(() => {
    if ((isOpen || isInline) && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, isInline, initialTab]);

  // Common States
  const [fileInputName, setFileInputName] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultText, setResultText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Chat AI States
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'ai',
      text: 'Xin chào Thầy/Cô! Em là Trợ lý ảo NQDieu AI. Em sẵn sàng tư vấn, giải đáp thắc mắc và hỗ trợ Thầy/Cô sử dụng hệ thống NQDIEU LEARNING, tạo nhanh khóa học từ file Word, chuẩn hóa đề thi và biên soạn tài liệu giảng dạy.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Quick Course Creator States
  const [courseInputText, setCourseInputText] = useState<string>('');
  const [parsedCourse, setParsedCourse] = useState<ParsedCourseData | null>(null);
  const [isSavingCourse, setIsSavingCourse] = useState<boolean>(false);
  const [courseSuccessMsg, setCourseSuccessMsg] = useState<string>('');

  // Config States for Generate Exam
  const [subject, setSubject] = useState<string>('Toán học');
  const [grade, setGrade] = useState<string>('Khối 12');
  const [numPart1, setNumPart1] = useState<number>(10);
  const [numPart2, setNumPart2] = useState<number>(2);
  const [numPart3, setNumPart3] = useState<number>(2);
  const [levelRatio, setLevelRatio] = useState<string>('40% Nhận biết, 30% Thông hiểu, 20% Vận dụng, 10% Vận dụng cao');

  useEffect(() => {
    if (activeTab === 'CHAT_AI') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  if (!isOpen) return null;

  // File Upload Handler (Word .docx or .txt)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'EXAM' | 'COURSE') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileInputName(file.name);
    setErrorMsg('');

    try {
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (target === 'EXAM') {
          setRawText(result.value);
        } else {
          setCourseInputText(result.value);
        }
      } else if (file.name.endsWith('.txt')) {
        const text = await file.text();
        if (target === 'EXAM') {
          setRawText(text);
        } else {
          setCourseInputText(text);
        }
      } else {
        setErrorMsg('Vui lòng chọn định dạng file Word (.docx) hoặc file văn bản (.txt)');
      }
    } catch (err: any) {
      console.error('Lỗi đọc file:', err);
      setErrorMsg('Không thể đọc dữ liệu file. Vui lòng kiểm tra lại file Word!');
    }
  };

  // Chat AI Handler
  const handleSendChatMessage = async (customQuery?: string) => {
    const textToSend = (customQuery || chatInput).trim();
    if (!textToSend || isProcessing) return;

    const userMsgId = 'msg-' + Date.now();
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!customQuery) setChatInput('');
    setIsProcessing(true);

    try {
      const response = await fetch('/api/teacher-ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'TEACHER_CHAT_AI',
          contentText: textToSend,
          history: chatMessages.slice(-6).map((m) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            sender: m.sender,
            text: m.text,
          })),
        }),
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch (parseErr) {
        data = { success: false, message: `Lỗi máy chủ (${response.status})` };
      }

      if (response.ok && data.success && data.outputText) {
        const aiMsg: ChatMessage = {
          id: 'msg-ai-' + Date.now(),
          sender: 'ai',
          text: data.outputText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorAiMsg: ChatMessage = {
          id: 'msg-ai-err-' + Date.now(),
          sender: 'ai',
          text: 'Rất tiếc: ' + (data.message || 'Chưa thể xử lý yêu cầu lúc này. Vui lòng thử lại!'),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages((prev) => [...prev, errorAiMsg]);
      }
    } catch (err: any) {
      console.error('Chat AI Error:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          id: 'msg-ai-err-' + Date.now(),
          sender: 'ai',
          text: 'Lỗi kết nối máy chủ AI: ' + (err?.message || 'Vui lòng kiểm tra lại mạng hoặc thử lại sau vài giây!'),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Client-side parser fallback helper for Course Content
  const parseCourseContentFromText = (text: string): Course => {
    const getVal = (labels: string[]): string => {
      for (const label of labels) {
        const reg = new RegExp(`(?:${label})\\s*[:：]\\s*(.*)`, 'i');
        const m = text.match(reg);
        if (m && m[1] && m[1].trim()) {
          return m[1].trim();
        }
      }
      return '';
    };

    const title = getVal(['Tên khóa học\\*?', 'Tên khóa học', 'Tên khoá học\\*?', 'Tên khoá học', 'Tên bài giảng']) || 'Khóa học mới từ file tài liệu';
    const imageUrl = getVal(['Link ảnh bìa khóa học', 'Link ảnh bìa', 'Ảnh bìa', 'Hình ảnh']) || 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=800&q=80';
    const description = getVal(['Mô tả khóa học', 'Mô tả khoá học', 'Mô tả']) || 'Khóa học được khởi tạo tự động từ file Word / văn bản cấu trúc.';

    let startDate = getVal(['Thời gian mở khóa học', 'Thời gian mở', 'Ngày bắt đầu', 'Bắt đầu']);
    if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) {
      startDate = new Date().toISOString().split('T')[0];
    } else {
      startDate = startDate.substring(0, 10);
    }

    let endDate = getVal(['Thời gian kết thúc khóa học', 'Thời gian kết thúc', 'Ngày kết thúc', 'Kết thúc']);
    if (!endDate || !/^\d{4}-\d{2}-\d{2}/.test(endDate)) {
      endDate = '2026-12-31';
    } else {
      endDate = endDate.substring(0, 10);
    }

    // II. Online Meeting
    const meetingPlatformRaw = getVal(['Nền tảng phòng học', 'Nền tảng', 'Hệ thống phòng học']);
    const meetingTitle = getVal(['Tên phòng học / Tiêu đề', 'Tên phòng học', 'Tiêu đề phòng học']);
    const meetingUrl = getVal(['Link phòng học Online \\(URL\\) \\*?', 'Link phòng học Online', 'Link phòng học', 'Link Zoom', 'Link Meet']);
    const meetingSchedule = getVal(['Lịch học trực tuyến \\(Tùy chọn\\)', 'Lịch học trực tuyến', 'Lịch học']);
    const meetingNote = getVal(['Ghi chú / Passcode \\(Tùy chọn\\)', 'Ghi chú / Passcode', 'Passcode', 'Ghi chú']);

    let platform: 'google_meet' | 'ms_teams' | 'zoom' | 'other' = 'google_meet';
    const pLower = (meetingPlatformRaw + ' ' + meetingUrl).toLowerCase();
    if (pLower.includes('teams') || pLower.includes('microsoft')) platform = 'ms_teams';
    else if (pLower.includes('zoom')) platform = 'zoom';
    else if (pLower.includes('meet') || pLower.includes('google')) platform = 'google_meet';
    else if (meetingPlatformRaw) platform = 'other';

    const isOnlineEnabled = Boolean(meetingUrl.trim() || meetingTitle.trim() || meetingPlatformRaw.trim());

    // III. Lessons
    const lessonsList: Lesson[] = [];
    const lessonBlocks = text.split(/(?=(?:^\s*(?:\d+\.\s*)?Bài\s+\d+|Tên bài học\s*[:：]))/im);

    for (const block of lessonBlocks) {
      if (!block.toLowerCase().includes('tên bài học') && !block.toLowerCase().includes('bài ')) continue;

      const bVal = (labels: string[]): string => {
        for (const label of labels) {
          const reg = new RegExp(`(?:${label})\\s*[:：]\\s*(.*)`, 'i');
          const m = block.match(reg);
          if (m && m[1] && m[1].trim()) {
            return m[1].trim();
          }
        }
        return '';
      };

      let lTitle = bVal(['Tên bài học', 'Tên bài']);
      if (!lTitle) {
        const matchHeader = block.match(/(?:^\s*(?:\d+\.\s*)?(Bài\s+\d+[:\s\-\.].*))/im);
        if (matchHeader && matchHeader[1]) {
          lTitle = matchHeader[1].trim();
        }
      }

      if (!lTitle) continue;

      const videoUrl = bVal(['Link Video \\(Youtube/MP4\\)', 'Link Video', 'Video']);
      const docUrl = bVal(['Link File Tài liệu \\(PDF/Drive\\)', 'Link File Tài liệu', 'Link Tài liệu', 'Tài liệu']);
      const pptUrl = bVal(['Link Slide PPT / Google Slides', 'Link Slide PPT', 'Link Slide', 'Slide']);
      const durationMinRaw = bVal(['Thời gian học tối thiểu \\(phút\\)', 'Thời gian học tối thiểu', 'Thời gian học', 'Số phút']);
      const durationMin = parseInt(durationMinRaw, 10) || 45;

      lessonsList.push({
        title: lTitle,
        videoUrl,
        docUrl,
        pptUrl,
        duration: durationMin * 60,
      });
    }

    if (lessonsList.length === 0) {
      lessonsList.push({
        title: 'Bài 1. Nội dung tổng hợp khóa học',
        videoUrl: '',
        docUrl: '',
        pptUrl: '',
        duration: 2700,
      });
    }

    // V. Certificate
    const parentOrg = getVal(['Tên Đơn vị chủ quản', 'Đơn vị chủ quản']) || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG';
    const org = getVal(['Tên Đơn vị trực tiếp', 'Đơn vị trực tiếp']) || 'TRƯỜNG THPT NGUYỄN QUANG DIÊU';
    const certSuffix = getVal(['Ký hiệu / Hậu tố Số Giấy chứng nhận', 'Ký hiệu / Hậu tố', 'Hậu tố Số Giấy chứng nhận']) || 'NQD-AI';
    const signerTitle = getVal(['Chức vụ người ký', 'Người ký']) || 'HIỆU TRƯỜNG';
    const delegateTitle = getVal(['Chức vụ người ký thay \\(nếu có\\)', 'Chức vụ người ký thay', 'Ký thay']);
    const signerName = getVal(['Họ tên người ký', 'Họ và tên người ký']) || 'Giáo viên THPT Nguyễn Quang Diêu';

    return {
      courseId: 'COURSE_' + Date.now(),
      title,
      description,
      imageUrl,
      startDate,
      endDate,
      authorId: 'TEACHER_NQD',
      authorName: 'Giáo viên THPT Nguyễn Quang Diêu',
      lessons: lessonsList,
      quizConfig: {
        enabled: true,
        durationMin: 15,
        maxAttempts: 3,
        passingScore: 5,
        p1: { enabled: true, count: 5, totalScore: 10, bank: [] },
        p2: { enabled: false, count: 0, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] },
        p3: { enabled: false, count: 0, totalScore: 0, bank: [] },
      },
      onlineMeetingConfig: {
        enabled: isOnlineEnabled,
        platform,
        meetingUrl,
        title: meetingTitle || `Phòng học trực tuyến ${title}`,
        scheduleTime: meetingSchedule,
        note: meetingNote,
      },
      certificateConfig: {
        enabled: true,
        parentOrganization: parentOrg,
        organization: org,
        certNumberSuffix: certSuffix,
        signerTitle,
        delegateTitle,
        signerName,
        bgTheme: 'blue_sky',
      },
    };
  };

  // Quick Course Creator AI Handler - Extract Preview
  const handleParseCourseFromDoc = async () => {
    if (!courseInputText.trim()) {
      setErrorMsg('Vui lòng chọn file Word hoặc dán văn bản thông tin khóa học!');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');
    setCourseSuccessMsg('');

    try {
      const response = await fetch('/api/teacher-ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'CREATE_COURSE_FROM_DOC',
          contentText: courseInputText,
        }),
      });

      const data = await response.json();

      if (data.success && data.outputText) {
        let jsonStr = data.outputText.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1].trim();
        }

        try {
          const parsed: ParsedCourseData = JSON.parse(jsonStr);
          setParsedCourse(parsed);
        } catch (pErr) {
          console.warn('Failed to parse AI JSON response, falling back:', pErr);
          const fallbackCourse = parseCourseContentFromText(courseInputText);
          setParsedCourse({
            title: fallbackCourse.title,
            description: fallbackCourse.description,
            imageUrl: fallbackCourse.imageUrl,
            startDate: fallbackCourse.startDate || '',
            endDate: fallbackCourse.endDate || '',
            onlineMeetingConfig: {
              enabled: fallbackCourse.onlineMeetingConfig?.enabled,
              platform: fallbackCourse.onlineMeetingConfig?.platform,
              meetingUrl: fallbackCourse.onlineMeetingConfig?.meetingUrl,
              title: fallbackCourse.onlineMeetingConfig?.title,
              scheduleTime: fallbackCourse.onlineMeetingConfig?.scheduleTime,
              note: fallbackCourse.onlineMeetingConfig?.note,
            },
            lessons: fallbackCourse.lessons.map((l) => ({
              title: l.title,
              videoUrl: l.videoUrl,
              docUrl: l.docUrl,
              pptUrl: l.pptUrl,
              durationMin: Math.round(l.duration / 60),
            })),
            certificateConfig: {
              enabled: true,
              parentOrganization: fallbackCourse.certificateConfig?.parentOrganization || '',
              organization: fallbackCourse.certificateConfig?.organization || '',
              certNumberSuffix: fallbackCourse.certificateConfig?.certNumberSuffix || '',
              signerTitle: fallbackCourse.certificateConfig?.signerTitle || '',
              delegateTitle: fallbackCourse.certificateConfig?.delegateTitle || '',
              signerName: fallbackCourse.certificateConfig?.signerName || '',
            },
          });
        }
      } else {
        const fallbackCourse = parseCourseContentFromText(courseInputText);
        setParsedCourse({
          title: fallbackCourse.title,
          description: fallbackCourse.description,
          imageUrl: fallbackCourse.imageUrl,
          startDate: fallbackCourse.startDate || '',
          endDate: fallbackCourse.endDate || '',
          onlineMeetingConfig: {
            enabled: fallbackCourse.onlineMeetingConfig?.enabled,
            platform: fallbackCourse.onlineMeetingConfig?.platform,
            meetingUrl: fallbackCourse.onlineMeetingConfig?.meetingUrl,
            title: fallbackCourse.onlineMeetingConfig?.title,
            scheduleTime: fallbackCourse.onlineMeetingConfig?.scheduleTime,
            note: fallbackCourse.onlineMeetingConfig?.note,
          },
          lessons: fallbackCourse.lessons.map((l) => ({
            title: l.title,
            videoUrl: l.videoUrl,
            docUrl: l.docUrl,
            pptUrl: l.pptUrl,
            durationMin: Math.round(l.duration / 60),
          })),
          certificateConfig: {
            enabled: true,
            parentOrganization: fallbackCourse.certificateConfig?.parentOrganization || '',
            organization: fallbackCourse.certificateConfig?.organization || '',
            certNumberSuffix: fallbackCourse.certificateConfig?.certNumberSuffix || '',
            signerTitle: fallbackCourse.certificateConfig?.signerTitle || '',
            delegateTitle: fallbackCourse.certificateConfig?.delegateTitle || '',
            signerName: fallbackCourse.certificateConfig?.signerName || '',
          },
        });
      }
    } catch (err: any) {
      console.warn('AI network error, using client parser:', err);
      const fallbackCourse = parseCourseContentFromText(courseInputText);
      setParsedCourse({
        title: fallbackCourse.title,
        description: fallbackCourse.description,
        imageUrl: fallbackCourse.imageUrl,
        startDate: fallbackCourse.startDate || '',
        endDate: fallbackCourse.endDate || '',
        onlineMeetingConfig: {
          enabled: fallbackCourse.onlineMeetingConfig?.enabled,
          platform: fallbackCourse.onlineMeetingConfig?.platform,
          meetingUrl: fallbackCourse.onlineMeetingConfig?.meetingUrl,
          title: fallbackCourse.onlineMeetingConfig?.title,
          scheduleTime: fallbackCourse.onlineMeetingConfig?.scheduleTime,
          note: fallbackCourse.onlineMeetingConfig?.note,
        },
        lessons: fallbackCourse.lessons.map((l) => ({
          title: l.title,
          videoUrl: l.videoUrl,
          docUrl: l.docUrl,
          pptUrl: l.pptUrl,
          durationMin: Math.round(l.duration / 60),
        })),
        certificateConfig: {
          enabled: true,
          parentOrganization: fallbackCourse.certificateConfig?.parentOrganization || '',
          organization: fallbackCourse.certificateConfig?.organization || '',
          certNumberSuffix: fallbackCourse.certificateConfig?.certNumberSuffix || '',
          signerTitle: fallbackCourse.certificateConfig?.signerTitle || '',
          delegateTitle: fallbackCourse.certificateConfig?.delegateTitle || '',
          signerName: fallbackCourse.certificateConfig?.signerName || '',
        },
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm & Open Course Editor Modal (Pre-filled for Teacher Review)
  const handleConfirmCourseAndOpenEditor = async () => {
    if (!courseInputText.trim()) {
      setErrorMsg('Vui lòng chọn file Word hoặc dán văn bản thông tin khóa học!');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');

    let courseObj: Course | null = null;

    if (parsedCourse) {
      const lessonsFormatted: Lesson[] = (parsedCourse.lessons || []).map((l, idx) => ({
        title: l.title || `Bài ${idx + 1}`,
        videoUrl: l.videoUrl || '',
        docUrl: l.docUrl || '',
        pptUrl: l.pptUrl || '',
        duration: (l.durationMin || 45) * 60,
      }));

      courseObj = {
        courseId: 'COURSE_' + Date.now(),
        title: parsedCourse.title || 'Khóa học mới từ AI',
        description: parsedCourse.description || 'Khóa học được khởi tạo tự động từ file Word',
        imageUrl: parsedCourse.imageUrl || 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=800&q=80',
        startDate: parsedCourse.startDate || new Date().toISOString().split('T')[0],
        endDate: parsedCourse.endDate || '2026-12-31',
        authorId: 'TEACHER_NQD',
        authorName: 'Giáo viên THPT Nguyễn Quang Diêu',
        lessons: lessonsFormatted,
        quizConfig: {
          enabled: true,
          durationMin: 15,
          maxAttempts: 3,
          passingScore: 5,
          p1: { enabled: true, count: 5, totalScore: 10, bank: [] },
          p2: { enabled: false, count: 0, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] },
          p3: { enabled: false, count: 0, totalScore: 0, bank: [] },
        },
        onlineMeetingConfig: {
          enabled: parsedCourse.onlineMeetingConfig?.enabled ?? Boolean(parsedCourse.onlineMeetingConfig?.meetingUrl),
          platform: parsedCourse.onlineMeetingConfig?.platform || 'google_meet',
          meetingUrl: parsedCourse.onlineMeetingConfig?.meetingUrl || '',
          title: parsedCourse.onlineMeetingConfig?.title || '',
          scheduleTime: parsedCourse.onlineMeetingConfig?.scheduleTime || '',
          note: parsedCourse.onlineMeetingConfig?.note || '',
        },
        certificateConfig: {
          enabled: parsedCourse.certificateConfig?.enabled ?? true,
          parentOrganization: parsedCourse.certificateConfig?.parentOrganization || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG',
          organization: parsedCourse.certificateConfig?.organization || 'TRƯỜNG THPT NGUYỄN QUANG DIÊU',
          certNumberSuffix: parsedCourse.certificateConfig?.certNumberSuffix || 'NQD-AI',
          signerTitle: parsedCourse.certificateConfig?.signerTitle || 'HIỆU TRƯỜNG',
          delegateTitle: parsedCourse.certificateConfig?.delegateTitle || '',
          signerName: parsedCourse.certificateConfig?.signerName || 'Ban BGH Trường THPT NQD',
          bgTheme: 'blue_sky',
        },
      };
    } else {
      courseObj = parseCourseContentFromText(courseInputText);
    }

    setIsProcessing(false);

    if (courseObj) {
      if (onOpenCourseEditor) {
        onOpenCourseEditor(courseObj);
      } else if (onCourseCreated) {
        onCourseCreated(courseObj);
      }
      onClose();
    }
  };

  // Download Course Sample Word Template
  const handleDownloadCourseTemplateDocx = async () => {
    try {
      const blob = await generateCourseTemplateDocxBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Mau_Tao_Khoa_Hoc_LMS_NQDieu.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download template error:', err);
      alert('Không thể tải file mẫu. Vui lòng bấm nút "Nạp dữ liệu mẫu" để copy văn bản mẫu.');
    }
  };

  // Run Standardize / Generate Exam Tasks
  const handleRunExamTask = async (taskType: 'STANDARDIZE_EXAM' | 'GENERATE_EXAM') => {
    if (!rawText.trim()) {
      setErrorMsg('Vui lòng dán văn bản hoặc tải file Word chứa nội dung đề thi / tài liệu!');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');
    setResultText('');

    try {
      const payload: any = {
        taskType,
        contentText: rawText,
      };

      if (taskType === 'GENERATE_EXAM') {
        payload.config = {
          subject,
          grade,
          numPart1,
          numPart2,
          numPart3,
          levelBreakdown: levelRatio,
        };
      }

      const response = await fetch('/api/teacher-ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success && data.outputText) {
        setResultText(data.outputText);
      } else {
        setErrorMsg(data.message || 'Lỗi khi xử lý nhiệm vụ AI!');
      }
    } catch (err: any) {
      console.error('AI Processing Error:', err);
      setErrorMsg('Không thể kết nối máy chủ AI: ' + (err?.message || 'Lỗi hệ thống'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Copy Result Text
  const handleCopyResult = (textToCopy?: string) => {
    const text = textToCopy || resultText;
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download Exam docx
  const handleDownloadExamDocx = async () => {
    if (!resultText) return;
    try {
      const blob = await generateExamDocxBlob(resultText, activeTab === 'STANDARDIZE' ? 'De_Thi_Chuan_Hoa_NQDieu' : 'De_Thi_Bien_Soan_NQDieu');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab === 'STANDARDIZE' ? 'De_Thi_Chuan_Hoa' : 'De_Thi_Bien_Soan'}_${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting docx:', err);
      alert('Có lỗi khi tạo file Word. Bạn có thể bấm "Sao chép" để dán trực tiếp vào Word!');
    }
  };

  if (!isOpen && !isInline) return null;

  const modalInner = (
    <div className={`bg-slate-50 w-full ${isInline ? 'rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden' : 'max-w-5xl h-[min(92vh,550px)] max-h-[94vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden'} flex flex-col`}>
      
      {/* Header Modal - only show if opened in modal popup, hidden in inline mode */}
      {!isInline && (
        <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-950 px-4 sm:px-5 py-2 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-400/20 border border-amber-300/30 rounded-lg text-amber-300 shadow-inner shrink-0">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-xs sm:text-sm tracking-wide text-white">
                  TRỢ LÝ AI NQDIEU • HỖ TRỢ GIẢNG DẠY & QUẢN LÝ LMS
                </h3>
                <span className="px-2 py-0.2 text-[9px] font-bold bg-amber-400 text-slate-900 rounded-full shadow-xs uppercase tracking-wider">
                  CHUYÊN BIỆT GIÁO VIÊN
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-indigo-200 line-clamp-1">
                Tự động tư vấn hệ thống, tạo nhanh khóa học từ file Word, chuẩn hóa đáp án (*) và biên soạn đề thi chuẩn LMS.
              </p>
            </div>
          </div>

          <div className="px-2.5 py-1 bg-gradient-to-r from-amber-400/20 to-orange-400/20 border border-amber-300/40 rounded-full text-[11px] font-bold text-amber-300 flex items-center gap-1 shadow-xs shrink-0">
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>Mô hình Gemini AI</span>
          </div>
        </div>
      )}

        {/* Tab Navigation - Reordered: Chat -> Tạo nhanh khóa học -> Chuẩn hóa -> Tạo đề thi */}
        <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
          <button
            onClick={() => { setActiveTab('CHAT_AI'); setErrorMsg(''); }}
            className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'CHAT_AI'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 bg-slate-100/80 hover:bg-slate-200/80'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat cùng AI</span>
          </button>

          <button
            onClick={() => { setActiveTab('CREATE_COURSE'); setErrorMsg(''); }}
            className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'CREATE_COURSE'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 bg-slate-100/80 hover:bg-slate-200/80'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Tạo nhanh khóa học</span>
            <span className={`text-[9px] px-1 py-0.2 rounded-full font-bold ${activeTab === 'CREATE_COURSE' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Word/AI</span>
          </button>

          <button
            onClick={() => { setActiveTab('STANDARDIZE'); setErrorMsg(''); }}
            className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'STANDARDIZE'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 bg-slate-100/80 hover:bg-slate-200/80'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Chuẩn hóa đề thi thô</span>
          </button>

          <button
            onClick={() => { setActiveTab('GENERATE'); setErrorMsg(''); }}
            className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'GENERATE'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 bg-slate-100/80 hover:bg-slate-200/80'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Tạo đề thi mới từ tài liệu</span>
          </button>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="bg-rose-50 border-b border-rose-200 px-3 py-1.5 flex items-center gap-1.5 text-rose-700 text-xs shrink-0 animate-fade-in">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

        {/* Modal Main Content Container */}
        <div className={`p-2.5 sm:p-3 overflow-x-hidden ${isInline ? 'h-auto' : 'flex-1 overflow-y-auto'}`}>

          {/* ==================== TAB 1: CHAT CÙNG AI ==================== */}
          {activeTab === 'CHAT_AI' && (
            <div className="h-full flex flex-col space-y-2">
              {/* Chat Conversation Box */}
              <div className="flex-1 min-h-[260px] h-[calc(100vh-230px)] max-h-[460px] bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 overflow-y-auto space-y-2 shadow-inner">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.sender === 'ai' && (
                      <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                    )}

                    <div className={`max-w-[85%] space-y-0.5 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`p-2.5 rounded-xl text-xs leading-relaxed shadow-2xs whitespace-pre-wrap ${
                          msg.sender === 'user'
                            ? 'bg-indigo-600 text-white rounded-tr-xs font-medium'
                            : 'bg-slate-100 text-slate-800 border border-slate-200/80 rounded-tl-xs'
                        }`}
                      >
                        {msg.text}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-slate-400 px-1">
                        <span>{msg.time}</span>
                        {msg.sender === 'ai' && (
                          <button
                            onClick={() => handleCopyResult(msg.text)}
                            className="hover:text-indigo-600 flex items-center gap-0.5 cursor-pointer"
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span>Sao chép</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {msg.sender === 'user' && (
                      <div className="w-6 h-6 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                ))}

                {isProcessing && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Bot className="w-3.5 h-3.5 animate-spin" />
                    </div>
                    <div className="bg-slate-100 p-2.5 rounded-xl rounded-tl-xs text-xs text-slate-500 italic flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                      <span>NQDieu AI đang suy nghĩ và trả lời...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-xs shrink-0">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendChatMessage(); }}
                  placeholder="Đặt câu hỏi tư vấn hệ thống LMS, hướng dẫn sử dụng, tạo khóa học, biên soạn đề thi..."
                  className="flex-1 text-xs px-2.5 py-1.5 bg-transparent focus:outline-none text-slate-800 placeholder:text-slate-400 font-medium"
                />
                <button
                  onClick={() => handleSendChatMessage()}
                  disabled={isProcessing || !chatInput.trim()}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Gửi</span>
                </button>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: TẠO NHANH KHÓA HỌC ==================== */}
          {activeTab === 'CREATE_COURSE' && (
            <div className="space-y-2">
              
              {/* Header Banner & Template Download */}
              <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-2 sm:p-2.5 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <h4 className="font-extrabold text-xs sm:text-sm text-white">Tạo nhanh khóa học từ file Word / Văn bản</h4>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-emerald-100/90 max-w-2xl line-clamp-1">
                    Giáo viên tải file Word hoặc dán cấu trúc chuẩn. AI tự phân tích danh sách bài học, link video/tài liệu và cấu hình chứng nhận.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleDownloadCourseTemplateDocx}
                    className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-[11px] rounded-lg shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3 text-emerald-300" />
                    <span>Tải file Word mẫu (.docx)</span>
                  </button>

                  <button
                    onClick={() => setCourseInputText(SAMPLE_COURSE_TEXT)}
                    className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-[11px] rounded-lg shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-slate-950" />
                    <span>Nạp dữ liệu mẫu</span>
                  </button>
                </div>
              </div>

              {/* Input Section Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                
                {/* Left: Document Upload & Input */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5 shadow-xs flex flex-col">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Bước 1: Tải lên file Word hoặc dán văn bản cấu trúc</span>
                  </label>

                  <div className="border border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/50 rounded-lg p-1 text-center transition-colors">
                    <input
                      type="file"
                      accept=".docx, .txt"
                      onChange={(e) => handleFileUpload(e, 'COURSE')}
                      id="file-upload-course"
                      className="hidden"
                    />
                    <label
                      htmlFor="file-upload-course"
                      className="cursor-pointer flex items-center justify-center gap-1.5 text-xs text-slate-700 hover:text-emerald-700 font-bold"
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="truncate">{fileInputName ? `Đã chọn: ${fileInputName}` : 'Tải lên File Word (.docx) thông tin khóa học'}</span>
                    </label>
                  </div>

                  <textarea
                    value={courseInputText}
                    onChange={(e) => setCourseInputText(e.target.value)}
                    placeholder="Dán nội dung văn bản thông tin khóa học theo đúng mẫu tại đây..."
                    className="w-full h-28 sm:h-36 p-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-800 leading-relaxed resize-none overflow-y-auto"
                  />

                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <button
                      onClick={handleParseCourseFromDoc}
                      disabled={isProcessing || !courseInputText.trim()}
                      className="py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Đang phân tích...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span>Phân tích xem trước</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleConfirmCourseAndOpenEditor}
                      disabled={isProcessing || !courseInputText.trim()}
                      className="py-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-98"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Đang chuẩn bị...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3 text-emerald-200" />
                          <span>Xác nhận tạo khóa học</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Right: Parsed Preview & Sync Confirmation */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5 shadow-xs flex flex-col justify-between">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Bước 2: Xem trước thông tin đã trích xuất</span>
                      </span>
                      {parsedCourse && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.2 rounded-full">
                          {parsedCourse.lessons?.length || 0} bài học
                        </span>
                      )}
                    </label>

                    {courseSuccessMsg && (
                      <div className="p-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-bold flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{courseSuccessMsg}</span>
                      </div>
                    )}

                    {parsedCourse ? (
                      <div className="space-y-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200 h-32 sm:h-36 max-h-36 overflow-y-auto text-xs">
                        {/* Title & Description */}
                        <div>
                          <div className="text-[10px] font-extrabold uppercase text-indigo-900 tracking-wider">Tên Khóa Học:</div>
                          <div className="text-xs font-extrabold text-slate-800 mt-0.5">{parsedCourse.title}</div>
                          <p className="text-[11px] text-slate-600 mt-0.5 italic line-clamp-2">{parsedCourse.description}</p>
                        </div>

                        {/* Dates */}
                        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-700 border-t border-slate-200 pt-1">
                          <span className="flex items-center gap-1 text-slate-600">
                            <Calendar className="w-3 h-3 text-indigo-600" />
                            Mở: <b>{parsedCourse.startDate || 'Ngay'}</b>
                          </span>
                          <span className="flex items-center gap-1 text-slate-600">
                            <Calendar className="w-3 h-3 text-rose-600" />
                            Kết thúc: <b>{parsedCourse.endDate || 'Vô thời hạn'}</b>
                          </span>
                        </div>

                        {/* Online Meeting Preview if present */}
                        {parsedCourse.onlineMeetingConfig?.meetingUrl && (
                          <div className="border-t border-slate-200 pt-1 space-y-0.5 text-[11px]">
                            <div className="font-bold text-blue-900">💻 Phòng học Trực tuyến:</div>
                            <div className="text-slate-700 bg-blue-50/60 p-1 rounded border border-blue-200 truncate">
                              {parsedCourse.onlineMeetingConfig.meetingUrl}
                            </div>
                          </div>
                        )}

                        {/* Lessons List Preview */}
                        <div className="border-t border-slate-200 pt-1">
                          <div className="text-[10px] font-extrabold text-slate-800 mb-0.5 flex items-center justify-between">
                            <span>Danh sách bài học ({parsedCourse.lessons?.length || 0}):</span>
                          </div>
                          <div className="space-y-0.5">
                            {parsedCourse.lessons?.map((l, idx) => (
                              <div key={idx} className="bg-white p-1 rounded border border-slate-200 text-[11px] flex items-center justify-between gap-1">
                                <span className="font-bold text-slate-800 truncate">{idx + 1}. {l.title}</span>
                                <span className="text-[10px] text-slate-500 shrink-0">{l.durationMin || 45}p</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Certificate Config Preview */}
                        {parsedCourse.certificateConfig && (
                          <div className="border-t border-slate-200 pt-1 space-y-0.5 text-[11px]">
                            <div className="font-bold text-amber-900 flex items-center gap-1">
                              <Award className="w-3 h-3 text-amber-600" />
                              <span>Giấy chứng nhận:</span>
                            </div>
                            <div className="text-slate-700 bg-amber-50/60 p-1 rounded border border-amber-200 text-[10px]">
                              {parsedCourse.certificateConfig.signerTitle} - {parsedCourse.certificateConfig.signerName} ({parsedCourse.certificateConfig.organization})
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-32 sm:h-36 flex flex-col items-center justify-center text-slate-400 space-y-1 border border-dashed border-slate-200 rounded-lg bg-slate-50 text-center p-2.5">
                        <BookOpen className="w-7 h-7 text-slate-300" />
                        <p className="font-semibold text-xs text-slate-600">Chưa có dữ liệu trích xuất</p>
                        <p className="text-[10px] text-slate-400 max-w-xs">
                          Tải lên file Word hoặc dán văn bản ở Bước 1 và bấm nút "Xác Nhận Tạo Khóa Học".
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Sync Confirmation Button */}
                  <button
                    onClick={handleConfirmCourseAndOpenEditor}
                    disabled={!parsedCourse || isProcessing}
                    className="w-full mt-0.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang chuyển sang giao diện xem lại...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-200" />
                        <span>Xác nhận tạo khóa học (Mở giao diện xem lại & lưu)</span>
                      </>
                    )}
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* ==================== TAB 3: CHUẨN HÓA ĐỀ THI THÔ ==================== */}
          {activeTab === 'STANDARDIZE' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              
              {/* Input Box */}
              <div className="space-y-1.5 flex flex-col">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Nội dung đề thi thô cần chuẩn hóa</span>
                  </label>
                  
                  <button
                    onClick={() => {
                      setRawText(`PHẦN I. Câu hỏi trắc nghiệm nhiều phương án lựa chọn
Câu 1. Công thức phân tử của Este Mety Acrylat là gì?
A. C3H6O2
B. C4H6O2 (Đáp án đúng)
C. C5H8O2
D. C2H4O2

Câu 2. Chất nào sau đây là Lipit?
A. Glucozơ
B. Triolein
C. Saccarozơ
D. Ancol etylic

PHẦN II. Trắc nghiệm đúng sai
Câu 3. Cho hàm số y = f(x) liên tục trên R.
a) Hàm số có tập xác định D = R. (Đúng)
b) Đồ thị hàm số đi qua gốc tọa độ O. (Sai)`);
                    }}
                    className="text-[11px] text-indigo-600 hover:underline font-bold cursor-pointer"
                  >
                    + Dán đề mẫu
                  </button>
                </div>

                {/* Upload File Word Button */}
                <div className="border border-dashed border-slate-300 hover:border-indigo-500 bg-white rounded-lg p-1 text-center transition-colors">
                  <input
                    type="file"
                    accept=".docx, .txt"
                    onChange={(e) => handleFileUpload(e, 'EXAM')}
                    id="file-upload-standardize"
                    className="hidden"
                  />
                  <label
                    htmlFor="file-upload-standardize"
                    className="cursor-pointer flex items-center justify-center gap-1.5 text-xs text-slate-700 hover:text-indigo-700 font-bold"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="truncate">{fileInputName ? `Đã chọn: ${fileInputName}` : 'Tải lên File Word (.docx) chứa đề thi thô'}</span>
                  </label>
                </div>

                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Dán văn bản đề thi thô vào đây (AI sẽ tự động tìm đáp án gạch chân/tô đỏ/in đậm/bảng đáp án để thêm dấu * trước đáp án đúng, tự sửa đứt quãng số câu, chuẩn hóa MathType Unicode)..."
                  className="w-full h-32 sm:h-40 p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-800 leading-relaxed resize-none overflow-y-auto"
                />

                <button
                  onClick={() => handleRunExamTask('STANDARDIZE_EXAM')}
                  disabled={isProcessing || !rawText.trim()}
                  className="w-full py-1.5 bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>NQDieu AI đang phân tích và chuẩn hóa...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Thực hiện chuẩn hóa đề thi & Tạo dấu (*) đáp án</span>
                    </>
                  )}
                </button>
              </div>

              {/* Output Box */}
              <div className="space-y-1.5 flex flex-col">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>KẾT QUẢ ĐỀ THI ĐÃ CHUẨN HÓA (*)</span>
                  </label>

                  {resultText && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyResult()}
                        className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
                      </button>

                      <button
                        onClick={handleDownloadExamDocx}
                        className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-md shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Xuất File Word (.docx)</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="h-44 sm:h-56 bg-white border border-slate-200 rounded-xl p-2.5 overflow-y-auto font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-inner">
                  {resultText ? (
                    resultText
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-1 py-4 text-center">
                      <BookOpen className="w-7 h-7 text-slate-300" />
                      <p className="font-semibold text-slate-500 text-xs">Kết quả đề thi đã chuẩn hóa sẽ hiển thị tại đây.</p>
                      <p className="text-[10px] text-slate-400 max-w-xs">
                        Tự động khắc phục lỗi đứt quãng số câu, định dạng công thức toán Unicode chuẩn MathType không dùng LaTeX, tạo dấu (*) đáp án đúng.
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ==================== TAB 4: TẠO ĐỀ THI MỚI TỪ TÀI LIỆU ==================== */}
          {activeTab === 'GENERATE' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              
              {/* Config & Input Column */}
              <div className="space-y-1.5 flex flex-col">
                <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-indigo-600" />
                    <span>Cấu hình ma trận đề thi:</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <label className="text-[9px] font-semibold text-slate-600 block">Môn học:</label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full px-2 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-semibold text-slate-600 block">Khối lớp:</label>
                      <input
                        type="text"
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        className="w-full px-2 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    <div>
                      <label className="text-[9px] font-semibold text-slate-600 block truncate">Phần I (Nhiều lựa chọn):</label>
                      <input
                        type="number"
                        min={0}
                        max={40}
                        value={numPart1}
                        onChange={(e) => setNumPart1(Number(e.target.value))}
                        className="w-full px-1.5 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded text-center font-bold text-indigo-900"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-semibold text-slate-600 block truncate">Phần II (Đúng/Sai):</label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={numPart2}
                        onChange={(e) => setNumPart2(Number(e.target.value))}
                        className="w-full px-1.5 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded text-center font-bold text-indigo-900"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-semibold text-slate-600 block truncate">Phần III (Trả lời ngắn):</label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={numPart3}
                        onChange={(e) => setNumPart3(Number(e.target.value))}
                        className="w-full px-1.5 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded text-center font-bold text-indigo-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-semibold text-slate-600 block">Tỷ lệ mức độ tư duy:</label>
                    <input
                      type="text"
                      value={levelRatio}
                      onChange={(e) => setLevelRatio(e.target.value)}
                      placeholder="VD: 40% Nhận biết, 30% Thông hiểu, 20% Vận dụng, 10% Vận dụng cao"
                      className="w-full px-2 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800"
                    />
                  </div>
                </div>

                {/* File Upload Box */}
                <div className="border border-dashed border-slate-300 hover:border-indigo-500 bg-white rounded-lg p-1 text-center transition-colors">
                  <input
                    type="file"
                    accept=".docx, .txt"
                    onChange={(e) => handleFileUpload(e, 'EXAM')}
                    id="file-upload-generate"
                    className="hidden"
                  />
                  <label
                    htmlFor="file-upload-generate"
                    className="cursor-pointer flex items-center justify-center gap-1.5 text-xs text-slate-700 hover:text-indigo-700 font-bold"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="truncate">{fileInputName ? `Đã chọn: ${fileInputName}` : 'Tải lên File Word (.docx) bài học'}</span>
                  </label>
                </div>

                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Dán nội dung tài liệu học tập, giáo trình hoặc bản tóm tắt kiến thức vào đây..."
                  className="w-full h-16 sm:h-20 p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-800 leading-relaxed resize-none overflow-y-auto"
                />

                <button
                  onClick={() => handleRunExamTask('GENERATE_EXAM')}
                  disabled={isProcessing || !rawText.trim()}
                  className="w-full py-1.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>NQDieu AI đang biên soạn đề thi mới...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                      <span>Tạo đề thi mới & Xuất file word (.docx)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Output Result Box */}
              <div className="space-y-1.5 flex flex-col">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    <span>ĐỀ THI MỚI BIÊN SOẠN CHUẨN WORD</span>
                  </label>

                  {resultText && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyResult()}
                        className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
                      </button>

                      <button
                        onClick={handleDownloadExamDocx}
                        className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-md shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Xuất File Word (.docx)</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="h-44 sm:h-56 bg-white border border-slate-200 rounded-xl p-2.5 overflow-y-auto font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-inner">
                  {resultText ? (
                    resultText
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-1 py-4 text-center">
                      <BookOpen className="w-7 h-7 text-slate-300" />
                      <p className="font-semibold text-slate-500 text-xs">Đề thi mới biên soạn sẽ hiển thị tại đây.</p>
                      <p className="text-[10px] text-slate-400 max-w-xs">
                        Định dạng chuẩn đáp án <code className="bg-slate-100 px-1 rounded font-bold">*</code>, công thức toán Unicode và sẵn sàng xuất file Word (.docx).
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-4 py-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px]">Trợ lý AI NQDieu đồng hành hỗ trợ Thầy\cô Trường THPT Nguyễn Quang Diêu</span>
          </div>

          {!isInline && (
            <button
              onClick={onClose}
              className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg transition-colors cursor-pointer text-xs"
            >
              Đóng
            </button>
          )}
        </div>

      </div>
    );

  return isInline ? (
    <div className="w-full animate-in fade-in duration-200">{modalInner}</div>
  ) : (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-md animate-fade-in">
      {modalInner}
    </div>
  );
};
