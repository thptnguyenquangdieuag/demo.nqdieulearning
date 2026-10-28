import React, { useState, useEffect } from 'react';
import { Course, Lesson, CourseQuizConfig, LessonExerciseConfig, User, CertificateConfig } from '../types';
import { parseDocxFile } from '../lib/docxParser';
import { X, Plus, Trash2, CheckCircle2, AlertCircle, Save, BookOpen, FileCheck2, Download, Award, Upload, Eye, Image as ImageIcon, ExternalLink, Sparkles, Video, Globe, Link } from 'lucide-react';
import { CertificateView } from './CertificateView';
import { TeacherAiModal } from './TeacherAiModal';
import { getStoredCourses, saveStoredCourses } from '../lib/storage';
import { formatForDatetimeLocalInput } from '../lib/courseTime';

import { notifySyncStatus } from './SyncNotificationToast';

interface CourseEditorModalProps {
  isOpen?: boolean;
  courseToEdit: Course | null;
  currentUser: User | null;
  onClose: () => void;
  onSaveSuccess: (course?: Course) => void;
  isInline?: boolean;
}

const defaultExerciseConfig: LessonExerciseConfig = {
  enabled: false,
  durationMin: 10,
  maxAttempts: 999,
  passingScore: 80,
  p1: { enabled: true, count: 0, totalScore: 0, bank: [] },
  p2: { enabled: false, count: 0, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] },
  p3: { enabled: false, count: 0, totalScore: 0, bank: [] },
};

export const CourseEditorModal: React.FC<CourseEditorModalProps> = ({
  isOpen = true,
  courseToEdit,
  currentUser,
  onClose,
  onSaveSuccess,
  isInline = false,
}) => {
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enableQuiz, setEnableQuiz] = useState(true);
  const [quizConfig, setQuizConfig] = useState<CourseQuizConfig>({
    enabled: true,
    durationMin: 15,
    maxAttempts: 1,
    passingScore: 80,
    p1: { enabled: true, count: 0, totalScore: 0, bank: [] },
    p2: { enabled: false, count: 0, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] },
    p3: { enabled: false, count: 0, totalScore: 0, bank: [] },
  });

  const [certConfig, setCertConfig] = useState<CertificateConfig>({
    enabled: true,
    parentOrganization: 'ĐOÀN TNCS HỒ CHÍ MINH',
    organization: 'TRƯỜNG THPT NGUYỄN QUANG DIÊU',
    signerTitle: 'GIÁO VIÊN',
    signerName: currentUser?.fullName || currentUser?.hoTen || '',
    signatureImage: '',
    logoImage: '',
    bgTheme: 'blue_gold',
    bgCustomImage: '',
  });
  const [onlineMeetingConfig, setOnlineMeetingConfig] = useState({
    enabled: false,
    platform: 'google_meet' as 'google_meet' | 'ms_teams' | 'zoom' | 'other',
    meetingUrl: '',
    title: '',
    scheduleTime: '',
    note: '',
  });
  const [showCertPreview, setShowCertPreview] = useState(false);
  const [teacherAiOpen, setTeacherAiOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [p1Status, setP1Status] = useState('');
  const [p2Status, setP2Status] = useState('');
  const [p3Status, setP3Status] = useState('');

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'signatureImage' | 'logoImage' | 'bgCustomImage') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setCertConfig((prev) => ({ ...prev, [field]: result }));
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (isOpen) {
      setMsg({ type: '', text: '' });
      setP1Status('');
      setP2Status('');
      setP3Status('');

      if (courseToEdit) {
        setCourseId(courseToEdit.courseId);
        setTitle(courseToEdit.title || '');
        setDescription(courseToEdit.description || '');
        setImageUrl(courseToEdit.imageUrl || '');
        setStartDate(formatForDatetimeLocalInput(courseToEdit.startDate));
        setEndDate(formatForDatetimeLocalInput(courseToEdit.endDate));
        setLessons(courseToEdit.lessons ? JSON.parse(JSON.stringify(courseToEdit.lessons)) : []);
        
        const q = courseToEdit.quizConfig || {};
        setEnableQuiz(q.enabled !== false);
        setQuizConfig({
          enabled: q.enabled !== false,
          durationMin: q.durationMin || 15,
          maxAttempts: q.maxAttempts || 1,
          passingScore: q.passingScore !== undefined ? q.passingScore : 80,
          p1: q.p1 || { enabled: true, count: 0, totalScore: 0, bank: [] },
          p2: q.p2 || { enabled: false, count: 0, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] },
          p3: q.p3 || { enabled: false, count: 0, totalScore: 0, bank: [] },
        });

        const cert = courseToEdit.certificateConfig || {};
        setCertConfig({
          enabled: cert.enabled !== false,
          parentOrganization: cert.parentOrganization || 'ĐOÀN TNCS HỒ CHÍ MINH',
          organization: cert.organization || 'TRƯỜNG THPT NGUYỄN QUANG DIÊU',
          signerTitle: cert.signerTitle || 'GIÁO VIÊN',
          delegateTitle: cert.delegateTitle || '',
          signerName: cert.signerName || currentUser?.fullName || currentUser?.hoTen || courseToEdit.authorName || '',
          signatureImage: cert.signatureImage || '',
          logoImage: cert.logoImage || '',
          bgTheme: cert.bgTheme || 'blue_gold',
          bgCustomImage: cert.bgCustomImage || '',
          certNumberSuffix: cert.certNumberSuffix || 'GCN/ĐTN',
        });

        const om = courseToEdit.onlineMeetingConfig || {};
        const isOmEnabled = om.enabled === true || (Boolean(om.meetingUrl && om.meetingUrl.trim()) && om.enabled !== false);
        setOnlineMeetingConfig({
          enabled: isOmEnabled,
          platform: om.platform || 'google_meet',
          meetingUrl: om.meetingUrl || '',
          title: om.title || '',
          scheduleTime: om.scheduleTime || '',
          note: om.note || '',
        });
      } else {
        setCourseId('');
        setTitle('');
        setDescription('');
        setImageUrl('');
        setStartDate('');
        setEndDate('');
        setLessons([]);
        setEnableQuiz(true);
        setQuizConfig({
          enabled: true,
          durationMin: 15,
          maxAttempts: 1,
          passingScore: 80,
          p1: { enabled: true, count: 0, totalScore: 0, bank: [] },
          p2: { enabled: false, count: 0, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] },
          p3: { enabled: false, count: 0, totalScore: 0, bank: [] },
        });

        setCertConfig({
          enabled: true,
          parentOrganization: 'ĐOÀN TNCS HỒ CHÍ MINH',
          organization: 'TRƯỜNG THPT NGUYỄN QUANG DIÊU',
          signerTitle: 'GIÁO VIÊN',
          delegateTitle: '',
          signerName: currentUser?.fullName || currentUser?.hoTen || '',
          signatureImage: '',
          logoImage: '',
          bgTheme: 'blue_gold',
          bgCustomImage: '',
          certNumberSuffix: 'GCN/ĐTN',
        });

        setOnlineMeetingConfig({
          enabled: false,
          platform: 'google_meet',
          meetingUrl: '',
          title: '',
          scheduleTime: '',
          note: '',
        });
      }
    }
  }, [isOpen, courseToEdit, currentUser]);

  if (!isOpen) return null;

  const downloadSampleWord = (partNum: 1 | 2 | 3) => {
    let content = '';
    let filename = `File_Word_Mau_Phan_${partNum}.doc`;

    if (partNum === 1) {
      content = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>File Word Mau - Phan 1</title></head>
<body>
<h3>FILE MAU CAU HOI TRAC NGHIEM PHAN 1 (NHIEU LUA CHON)</h3>
<p><i>(Huong dan: Danh dau * hoac gach chan o dau dap an DUNG)</i></p>
<br/>
<p><b>Cau 1:</b> Nguyen tu Clo (Z = 17) co so electron o lop ngoai cung la bao nhieu?</p>
<p>A. 5</p>
<p><b>*B. 7</b></p>
<p>C. 8</p>
<p>D. 2</p>
<br/>
<p><b>Cau 2:</b> Trong bang tuan hoan nguyen to hoa hoc, nguyen to Natri (Na, Z = 11) thuoc chu ky may?</p>
<p>A. Chu ky 1</p>
<p>B. Chu ky 2</p>
<p><b>*C. Chu ky 3</b></p>
<p>D. Chu ky 4</p>
</body>
</html>`;
    } else if (partNum === 2) {
      content = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>File Word Mau - Phan 2</title></head>
<body>
<h3>FILE MAU CAU HOI TRAC NGHIEM PHAN 2 (DUNG / SAI)</h3>
<p><i>(Huong dan: Danh dau * hoac gach chan o nhung y DUNG. Y khong co * hoac gach chan la SAI)</i></p>
<br/>
<p><b>Cau 1:</b> Cho nguyen to Clo (Z = 17). Cho biet tinh dung/sai cua cac phat bieu sau:</p>
<p><b>*A. Cau hinh electron nguyen tu Clo la 1s2 2s2 2p6 3s2 3p5.</b></p>
<p>B. Nguyen tu Clo co 5 electron o lop ngoai cung.</p>
<p><b>*C. Clo la mot phi kim hoat dong manh.</b></p>
<p>D. Clo thuoc chu ky 2 trong bang tuan hoan.</p>
</body>
</html>`;
    } else if (partNum === 3) {
      content = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>File Word Mau - Phan 3</title></head>
<body>
<h3>FILE MAU CAU HOI TRAC NGHIEM PHAN 3 (TRA LOI NGAN)</h3>
<p><i>(Huong dan: Ghi *Dap an: &lt;Gia tri&gt; o dong tiep theo ngay sau cau hoi)</i></p>
<br/>
<p><b>Cau 1:</b> Nguyen tu Kali (Z = 19) co bao nhieu lop electron?</p>
<p><b>*Dap an: 4</b></p>
<br/>
<p><b>Cau 2:</b> Tinh khoi luong nguyen tu trung binh cua Clo biet 35Cl chiem 75% va 37Cl chiem 25% (nhap gia tri so thap phan).</p>
<p><b>*Dap an: 35.5</b></p>
</body>
</html>`;
    }

    const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const handleAddLesson = () => {
    setLessons([
      ...lessons,
      {
        title: '',
        videoUrl: '',
        docUrl: '',
        pptUrl: '',
        duration: 1,
        exerciseConfig: JSON.parse(JSON.stringify(defaultExerciseConfig)),
      },
    ]);
  };

  const handleRemoveLesson = (idx: number) => {
    setLessons(lessons.filter((_, i) => i !== idx));
  };

  const handleLessonChange = (idx: number, field: keyof Lesson, value: any) => {
    const updated = [...lessons];
    updated[idx] = { ...updated[idx], [field]: value };
    setLessons(updated);
  };

  const handleParseLessonWordFile = async (
    lessonIdx: number,
    partNum: 1 | 2 | 3,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const questions = await parseDocxFile(file, partNum);
      setLessons((prevLessons) => {
        const updated = [...prevLessons];
        const curLesson = updated[lessonIdx];
        const ex: LessonExerciseConfig = curLesson.exerciseConfig
          ? JSON.parse(JSON.stringify(curLesson.exerciseConfig))
          : JSON.parse(JSON.stringify(defaultExerciseConfig));

        ex.enabled = true;

        if (partNum === 1) {
          ex.p1 = {
            ...ex.p1,
            enabled: true,
            bank: questions,
            count: ex.p1?.count || questions.length,
            totalScore: (ex.p1?.totalScore && Number(ex.p1.totalScore) > 0) ? ex.p1.totalScore : 10,
          };
        } else if (partNum === 2) {
          ex.p2 = { ...ex.p2, enabled: true, bank: questions, count: ex.p2?.count || questions.length };
        } else if (partNum === 3) {
          ex.p3 = {
            ...ex.p3,
            enabled: true,
            bank: questions,
            count: ex.p3?.count || questions.length,
            totalScore: (ex.p3?.totalScore && Number(ex.p3.totalScore) > 0) ? ex.p3.totalScore : 3,
          };
        }

        updated[lessonIdx] = { ...curLesson, exerciseConfig: ex };
        return updated;
      });
    } catch (err: any) {
      alert(`Lỗi đọc file Word: ${err.message || 'Không thể đọc'}`);
    }
  };

  const handleParseFinalWordFile = async (e: React.ChangeEvent<HTMLInputElement>, partNum: 1 | 2 | 3) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (partNum === 1) setP1Status('Đang đọc file Word...');
    if (partNum === 2) setP2Status('Đang đọc file Word...');
    if (partNum === 3) setP3Status('Đang đọc file Word...');

    try {
      const questions = await parseDocxFile(file, partNum);
      setQuizConfig((prev) => {
        const next = { ...prev };
        if (partNum === 1) {
          next.p1 = {
            ...next.p1,
            bank: questions,
            count: next.p1?.count || questions.length,
            totalScore: (next.p1?.totalScore && Number(next.p1.totalScore) > 0)
              ? next.p1.totalScore
              : (next.p2?.enabled || next.p3?.enabled) ? 3 : 10,
          };
        }
        if (partNum === 2) {
          next.p2 = { ...next.p2, bank: questions, count: next.p2?.count || questions.length };
        }
        if (partNum === 3) {
          next.p3 = {
            ...next.p3,
            bank: questions,
            count: next.p3?.count || questions.length,
            totalScore: (next.p3?.totalScore && Number(next.p3.totalScore) > 0) ? next.p3.totalScore : 3,
          };
        }
        return next;
      });

      const successText = `Đã tải thành công ${questions.length} câu hỏi.`;
      if (partNum === 1) setP1Status(successText);
      if (partNum === 2) setP2Status(successText);
      if (partNum === 3) setP3Status(successText);
    } catch (err: any) {
      const errText = `Lỗi đọc file: ${err.message || 'Không thể đọc'}`;
      if (partNum === 1) setP1Status(errText);
      if (partNum === 2) setP2Status(errText);
      if (partNum === 3) setP3Status(errText);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });

    if (!title.trim()) {
      setMsg({ type: 'error', text: 'Vui lòng nhập Tên khóa học!' });
      return;
    }

    if (startDate && endDate) {
      const startT = new Date(startDate).getTime();
      const endT = new Date(endDate).getTime();
      if (!isNaN(startT) && !isNaN(endT) && startT >= endT) {
        setMsg({ type: 'error', text: 'Thời gian kết thúc phải diễn ra sau thời gian mở khóa học!' });
        return;
      }
    }

    // Lessons validation
    if (lessons.length > 0) {
      for (let i = 0; i < lessons.length; i++) {
        const l = lessons[i];
        if (!l.title.trim()) {
          setMsg({ type: 'error', text: `Bài ${i + 1} chưa có tên bài học!` });
          return;
        }
      }
    }

    setSaving(true);

    const finalCourseId = courseId || courseToEdit?.courseId || `KH_${Date.now()}`;

    const courseData: Course = {
      courseId: finalCourseId,
      title,
      description,
      imageUrl,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      authorId: currentUser?.idUser || courseToEdit?.authorId || 'gv.nguyenphucnguyen',
      authorName: currentUser?.hoTen || courseToEdit?.authorName || currentUser?.idUser || 'Giáo viên',
      lessons,
      quizConfig: {
        ...quizConfig,
        enabled: enableQuiz,
      },
      certificateConfig: certConfig,
      onlineMeetingConfig,
    };

    const payload = {
      courseData,
      userObj: currentUser,
      author: currentUser,
    };

    setSaving(true);
    let apiHandled = false;

    try {
      const res = await fetch('/api/courses/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          apiHandled = true;
          const savedCourse: Course = data.course || courseData;

          // Sync with LocalStorage
          const stored = getStoredCourses();
          const existingIdx = stored.findIndex((c) => c.courseId === savedCourse.courseId);
          if (existingIdx >= 0) {
            stored[existingIdx] = savedCourse;
          } else {
            stored.unshift(savedCourse);
          }
          saveStoredCourses(stored);

          notifySyncStatus(
            'success',
            'Lưu khóa học thành công',
            `Khóa học "${savedCourse.title}" đã được lưu và cập nhật ngay lập tức trên hệ thống.`
          );
          onSaveSuccess(savedCourse);
          onClose();
        } else {
          setMsg({ type: 'error', text: data.message || 'Lỗi khi lưu khóa học' });
          apiHandled = true;
        }
      }
    } catch (err: any) {
      console.warn('Backend API /api/courses/save unavailable, saving course locally.');
      notifySyncStatus('warning', 'Khóa học chưa đồng bộ máy chủ', 'Không thể kết nối máy chủ để lưu khóa học. Khóa học đã được lưu tạm thời trên trình duyệt (LocalStorage).');
    } finally {
      setSaving(false);
    }

    if (!apiHandled) {
      const stored = getStoredCourses();
      const existingIdx = stored.findIndex((c) => c.courseId === finalCourseId);
      if (existingIdx >= 0) {
        stored[existingIdx] = courseData;
      } else {
        stored.unshift(courseData);
      }
      saveStoredCourses(stored);

      notifySyncStatus(
        'warning',
        'Đã lưu trên thiết bị',
        `Khóa học "${courseData.title}" đã được lưu tạm thời trên thiết bị này và sẽ tự động đồng bộ máy chủ.`
      );
      onSaveSuccess(courseData);
      onClose();
    }
  };

  if (!isOpen && !isInline) return null;

  const modalInner = (
    <>
      <div className={`bg-white w-full ${isInline ? 'rounded-2xl shadow-sm border border-slate-200/90 max-h-[calc(100vh-80px)]' : 'max-w-4xl h-[min(90vh,560px)] max-h-[92vh] rounded-2xl shadow-2xl border border-slate-100'} overflow-hidden flex flex-col animate-in fade-in duration-200`}>
      {/* Header */}
      <div className="px-4 sm:px-5 py-2.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-600 rounded-xl shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base">
              {courseToEdit ? 'CHỈNH SỬA KHÓA HỌC' : 'TẠO KHÓA HỌC MỚI'}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400 line-clamp-1">
              Nhập thông tin khóa học, các bài học và thiết lập bài kiểm tra
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTeacherAiOpen(true)}
            className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border border-indigo-400/30"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>Trợ lý AI</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Đóng (Về tổng quan)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {msg.text && (
            <div
              className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
                msg.type === 'error'
                  ? 'bg-rose-50 border border-rose-200 text-rose-700'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              }`}
            >
              {msg.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              {msg.text}
            </div>
          )}

          {/* SECTION 1: Course Info */}
          <div className="space-y-4 border-b border-slate-100 pb-5">
            <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2 text-blue-700">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
                1
              </span>
              Thông tin chung
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên khóa học <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Hóa học 10 - Chương 1: Cấu tạo nguyên tử"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Link ảnh bìa khóa học (Tùy chọn)
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/photo-..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mô tả khóa học
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả ngắn gọn về khóa học..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Thời gian mở khóa học (Tùy chọn)
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
                />
                <p className="text-[11px] text-slate-500 mt-1">Trước thời gian này học sinh không thể vào khóa học</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Thời gian kết thúc khóa học (Tùy chọn)
                </label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
                />
                <p className="text-[11px] text-slate-500 mt-1">Sau thời gian này học sinh chỉ xem lại bài học, không thể làm bài kiểm tra mới</p>
              </div>
            </div>
          </div>

          {/* SECTION 2: Online Meeting Link (Google Meet, MS Teams, Zoom) */}
          <div className="space-y-4 border-b border-slate-100 pb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2 text-indigo-700">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  Phòng học Online (Google Meet, MS Teams, Zoom)
                </h4>
                <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-100">
                  Tích hợp trực tiếp
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlineMeetingConfig.enabled}
                  onChange={(e) =>
                    setOnlineMeetingConfig((prev) => ({
                      ...prev,
                      enabled: e.target.checked,
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ms-2 text-xs font-bold text-slate-700">
                  {onlineMeetingConfig.enabled ? 'Đang bật' : 'Đang tắt'}
                </span>
              </label>
            </div>

            <p className="text-xs text-slate-500">
              Cung cấp đường link phòng học trực tuyến (Google Meet, MS Teams, Zoom). Tính năng này hoạt động độc lập, cho phép học sinh vào phòng học bất cứ lúc nào mà không cần học bài trước.
            </p>

            {onlineMeetingConfig.enabled && (
              <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nền tảng phòng học
                    </label>
                    <select
                      value={onlineMeetingConfig.platform || 'google_meet'}
                      onChange={(e) =>
                        setOnlineMeetingConfig((prev) => ({
                          ...prev,
                          platform: e.target.value as any,
                        }))
                      }
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                    >
                      <option value="google_meet">🟢 Google Meet</option>
                      <option value="ms_teams">🟣 Microsoft Teams</option>
                      <option value="zoom">🔵 Zoom Meeting</option>
                      <option value="other">🌐 Link / Nền tảng khác</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tên phòng học / Tiêu đề
                    </label>
                    <input
                      type="text"
                      value={onlineMeetingConfig.title || ''}
                      onChange={(e) =>
                        setOnlineMeetingConfig((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      placeholder="VD: Phòng học trực tuyến Google Meet"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Link phòng học Online (URL) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={onlineMeetingConfig.meetingUrl || ''}
                      onChange={(e) =>
                        setOnlineMeetingConfig((prev) => ({
                          ...prev,
                          meetingUrl: e.target.value,
                        }))
                      }
                      placeholder="https://meet.google.com/abc-defg-hij hoặc https://teams.microsoft.com/... hoặc https://zoom.us/j/..."
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Lịch học trực tuyến (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={onlineMeetingConfig.scheduleTime || ''}
                      onChange={(e) =>
                        setOnlineMeetingConfig((prev) => ({
                          ...prev,
                          scheduleTime: e.target.value,
                        }))
                      }
                      placeholder="VD: Thứ 2 & Thứ 4 từ 19h30 - 21h00"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ghi chú / Passcode (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={onlineMeetingConfig.note || ''}
                      onChange={(e) =>
                        setOnlineMeetingConfig((prev) => ({
                          ...prev,
                          note: e.target.value,
                        }))
                      }
                      placeholder="VD: Mật khẩu Zoom: 123456 - Vui lòng bật camera khi học"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: Lesson Content */}
          <div className="space-y-4 border-b border-slate-100 pb-5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2 text-blue-700">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
                    3
                  </span>
                  Nội dung các bài học
                </h4>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  Không bắt buộc
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddLesson}
                className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 border border-blue-200"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm bài học
              </button>
            </div>

            {lessons.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-1">
                <p className="text-xs font-semibold text-slate-600">
                  Chưa có bài học lý thuyết nào.
                </p>
                <p className="text-[11px] text-slate-400">
                  Bấm "Thêm bài học" để thêm video/tài liệu và bài tập củng cố cho từng bài học.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {lessons.map((l, idx) => {
                  const ex = l.exerciseConfig || defaultExerciseConfig;
                  return (
                    <div
                      key={idx}
                      className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3 relative group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-slate-800">
                          Bài {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLesson(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <input
                        type="text"
                        required
                        value={l.title}
                        onChange={(e) => handleLessonChange(idx, 'title', e.target.value)}
                        placeholder="Tên bài học"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="url"
                          value={l.videoUrl || ''}
                          onChange={(e) => handleLessonChange(idx, 'videoUrl', e.target.value)}
                          placeholder="Link Video (YouTube/MP4)"
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                        <input
                          type="url"
                          value={l.docUrl || ''}
                          onChange={(e) => handleLessonChange(idx, 'docUrl', e.target.value)}
                          placeholder="Link File Tài liệu (PDF/Drive)"
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                        <input
                          type="url"
                          value={l.pptUrl || ''}
                          onChange={(e) => handleLessonChange(idx, 'pptUrl', e.target.value)}
                          placeholder="Link Slide PPT / Google Slides"
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs font-semibold text-slate-600 shrink-0">
                          Thời gian học tối thiểu (phút):
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={l.duration !== undefined ? l.duration : 1}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            handleLessonChange(idx, 'duration', isNaN(val) || val < 0 ? 0 : val);
                          }}
                          className="w-24 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                        />
                        {Number(l.duration) === 0 ? (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            ✓ Không yêu cầu tích lũy thời gian học
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            (Nhập 0 nếu không yêu cầu tích lũy thời gian)
                          </span>
                        )}
                      </div>

                      {/* Lesson Exercise Configuration */}
                      <div className="pt-3 border-t border-slate-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`lesson_ex_enable_${idx}`}
                            checked={ex.enabled}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              handleLessonChange(idx, 'exerciseConfig', {
                                ...ex,
                                enabled: isChecked,
                              });
                            }}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                          <label
                            htmlFor={`lesson_ex_enable_${idx}`}
                            className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5"
                          >
                            <FileCheck2 className="w-3.5 h-3.5 text-indigo-600" />
                            Bài tập củng cố cho Bài {idx + 1} (nếu có)
                          </label>
                        </div>

                        {ex.enabled && (
                          <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                  Thời gian (phút)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={ex.durationMin || 10}
                                  onChange={(e) => {
                                    handleLessonChange(idx, 'exerciseConfig', {
                                      ...ex,
                                      durationMin: parseInt(e.target.value) || 10,
                                    });
                                  }}
                                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                  Điểm đạt (≥)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={ex.passingScore ?? 80}
                                  onChange={(e) => {
                                    handleLessonChange(idx, 'exerciseConfig', {
                                      ...ex,
                                      passingScore: parseFloat(e.target.value) || 80,
                                    });
                                  }}
                                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-bold text-indigo-700"
                                />
                              </div>
                            </div>

                            {/* Part 1 */}
                            <div className="p-2.5 bg-white border border-slate-200 rounded-md space-y-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`l_${idx}_p1_en`}
                                  checked={ex.p1?.enabled !== false}
                                  onChange={(e) => {
                                    const p1 = ex.p1 || { count: 0, totalScore: 0, bank: [] };
                                    handleLessonChange(idx, 'exerciseConfig', {
                                      ...ex,
                                      p1: { ...p1, enabled: e.target.checked },
                                    });
                                  }}
                                />
                                <label htmlFor={`l_${idx}_p1_en`} className="font-bold text-xs text-slate-800">
                                  Phần 1: Trắc nghiệm nhiều lựa chọn
                                </label>
                              </div>

                              {ex.p1?.enabled !== false && (
                                <div className="space-y-2 pl-5">
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="number"
                                      placeholder="Số câu rút"
                                      value={ex.p1?.count || ''}
                                      onChange={(e) => {
                                        const p1 = ex.p1 || { enabled: true, totalScore: 0, bank: [] };
                                        handleLessonChange(idx, 'exerciseConfig', {
                                          ...ex,
                                          p1: { ...p1, count: parseInt(e.target.value) || 0 },
                                        });
                                      }}
                                      className="px-2 py-1 text-xs border border-slate-200 rounded-md"
                                    />
                                    <input
                                      type="number"
                                      placeholder="Tổng điểm phần 1"
                                      value={ex.p1?.totalScore || ''}
                                      onChange={(e) => {
                                        const p1 = ex.p1 || { enabled: true, count: 0, bank: [] };
                                        handleLessonChange(idx, 'exerciseConfig', {
                                          ...ex,
                                          p1: { ...p1, totalScore: parseFloat(e.target.value) || 0 },
                                        });
                                      }}
                                      className="px-2 py-1 text-xs border border-slate-200 rounded-md"
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <label className="text-[11px] text-slate-600 font-medium shrink-0">File Word (.docx):</label>
                                      <input
                                        type="file"
                                        accept=".docx"
                                        onChange={(e) => handleParseLessonWordFile(idx, 1, e)}
                                        className="text-xs text-slate-500"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => downloadSampleWord(1)}
                                      className="px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors shrink-0 flex items-center gap-1 shadow-sm"
                                    >
                                      <Download className="w-3 h-3" />
                                      Tải file Word mẫu
                                    </button>
                                  </div>
                                  {ex.p1?.bank?.length > 0 && (
                                    <div className="text-[11px] text-emerald-600 font-medium">
                                      Ngân hàng có: <b>{ex.p1.bank.length}</b> câu
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Part 2 */}
                            <div className="p-2.5 bg-white border border-slate-200 rounded-md space-y-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`l_${idx}_p2_en`}
                                  checked={ex.p2?.enabled || false}
                                  onChange={(e) => {
                                    const p2 = ex.p2 || { count: 0, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] };
                                    handleLessonChange(idx, 'exerciseConfig', {
                                      ...ex,
                                      p2: { ...p2, enabled: e.target.checked },
                                    });
                                  }}
                                />
                                <label htmlFor={`l_${idx}_p2_en`} className="font-bold text-xs text-slate-800">
                                  Phần 2: Trắc nghiệm Đúng / Sai
                                </label>
                              </div>

                              {ex.p2?.enabled && (
                                <div className="space-y-2 pl-5">
                                  <input
                                    type="number"
                                    placeholder="Số câu rút"
                                    value={ex.p2?.count || ''}
                                    onChange={(e) => {
                                      const p2 = ex.p2 || { enabled: true, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] };
                                      handleLessonChange(idx, 'exerciseConfig', {
                                        ...ex,
                                        p2: { ...p2, count: parseInt(e.target.value) || 0 },
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md"
                                  />

                                  <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80 space-y-1.5">
                                    <div className="text-[11px] font-bold text-slate-700">Thang điểm chấm (cho 1 câu hỏi):</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      <div>
                                        <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Đúng 1 ý</label>
                                        <input
                                          type="number"
                                          step="0.05"
                                          placeholder="0.1"
                                          value={ex.p2?.scores?.s1 !== undefined ? ex.p2.scores.s1 : 0.1}
                                          onChange={(e) => {
                                            const p2 = ex.p2 || { enabled: true, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] };
                                            const currentScores = p2.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
                                            const val = parseFloat(e.target.value);
                                            handleLessonChange(idx, 'exerciseConfig', {
                                              ...ex,
                                              p2: { ...p2, scores: { ...currentScores, s1: isNaN(val) ? 0 : val } },
                                            });
                                          }}
                                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-800"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Đúng 2 ý</label>
                                        <input
                                          type="number"
                                          step="0.05"
                                          placeholder="0.25"
                                          value={ex.p2?.scores?.s2 !== undefined ? ex.p2.scores.s2 : 0.25}
                                          onChange={(e) => {
                                            const p2 = ex.p2 || { enabled: true, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] };
                                            const currentScores = p2.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
                                            const val = parseFloat(e.target.value);
                                            handleLessonChange(idx, 'exerciseConfig', {
                                              ...ex,
                                              p2: { ...p2, scores: { ...currentScores, s2: isNaN(val) ? 0 : val } },
                                            });
                                          }}
                                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-800"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Đúng 3 ý</label>
                                        <input
                                          type="number"
                                          step="0.05"
                                          placeholder="0.5"
                                          value={ex.p2?.scores?.s3 !== undefined ? ex.p2.scores.s3 : 0.5}
                                          onChange={(e) => {
                                            const p2 = ex.p2 || { enabled: true, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] };
                                            const currentScores = p2.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
                                            const val = parseFloat(e.target.value);
                                            handleLessonChange(idx, 'exerciseConfig', {
                                              ...ex,
                                              p2: { ...p2, scores: { ...currentScores, s3: isNaN(val) ? 0 : val } },
                                            });
                                          }}
                                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-800"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Đúng 4 ý</label>
                                        <input
                                          type="number"
                                          step="0.05"
                                          placeholder="1.0"
                                          value={ex.p2?.scores?.s4 !== undefined ? ex.p2.scores.s4 : 1.0}
                                          onChange={(e) => {
                                            const p2 = ex.p2 || { enabled: true, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] };
                                            const currentScores = p2.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
                                            const val = parseFloat(e.target.value);
                                            handleLessonChange(idx, 'exerciseConfig', {
                                              ...ex,
                                              p2: { ...p2, scores: { ...currentScores, s4: isNaN(val) ? 0 : val } },
                                            });
                                          }}
                                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-800"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <label className="text-[11px] text-slate-600 font-medium shrink-0">File Word (.docx):</label>
                                      <input
                                        type="file"
                                        accept=".docx"
                                        onChange={(e) => handleParseLessonWordFile(idx, 2, e)}
                                        className="text-xs text-slate-500"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => downloadSampleWord(2)}
                                      className="px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors shrink-0 flex items-center gap-1 shadow-sm"
                                    >
                                      <Download className="w-3 h-3" />
                                      Tải file Word mẫu
                                    </button>
                                  </div>
                                  {ex.p2?.bank?.length > 0 && (
                                    <div className="text-[11px] text-emerald-600 font-medium">
                                      Ngân hàng có: <b>{ex.p2.bank.length}</b> câu
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Part 3 */}
                            <div className="p-2.5 bg-white border border-slate-200 rounded-md space-y-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`l_${idx}_p3_en`}
                                  checked={ex.p3?.enabled || false}
                                  onChange={(e) => {
                                    const p3 = ex.p3 || { count: 0, totalScore: 0, bank: [] };
                                    handleLessonChange(idx, 'exerciseConfig', {
                                      ...ex,
                                      p3: { ...p3, enabled: e.target.checked },
                                    });
                                  }}
                                />
                                <label htmlFor={`l_${idx}_p3_en`} className="font-bold text-xs text-slate-800">
                                  Phần 3: Câu trả lời ngắn
                                </label>
                              </div>

                              {ex.p3?.enabled && (
                                <div className="space-y-2 pl-5">
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="number"
                                      placeholder="Số câu rút"
                                      value={ex.p3?.count || ''}
                                      onChange={(e) => {
                                        const p3 = ex.p3 || { enabled: true, totalScore: 0, bank: [] };
                                        handleLessonChange(idx, 'exerciseConfig', {
                                          ...ex,
                                          p3: { ...p3, count: parseInt(e.target.value) || 0 },
                                        });
                                      }}
                                      className="px-2 py-1 text-xs border border-slate-200 rounded-md"
                                    />
                                    <input
                                      type="number"
                                      placeholder="Tổng điểm phần 3"
                                      value={ex.p3?.totalScore || ''}
                                      onChange={(e) => {
                                        const p3 = ex.p3 || { enabled: true, count: 0, bank: [] };
                                        handleLessonChange(idx, 'exerciseConfig', {
                                          ...ex,
                                          p3: { ...p3, totalScore: parseFloat(e.target.value) || 0 },
                                        });
                                      }}
                                      className="px-2 py-1 text-xs border border-slate-200 rounded-md"
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <label className="text-[11px] text-slate-600 font-medium shrink-0">File Word (.docx):</label>
                                      <input
                                        type="file"
                                        accept=".docx"
                                        onChange={(e) => handleParseLessonWordFile(idx, 3, e)}
                                        className="text-xs text-slate-500"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => downloadSampleWord(3)}
                                      className="px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors shrink-0 flex items-center gap-1 shadow-sm"
                                    >
                                      <Download className="w-3 h-3" />
                                      Tải file Word mẫu
                                    </button>
                                  </div>
                                  {ex.p3?.bank?.length > 0 && (
                                    <div className="text-[11px] text-emerald-600 font-medium">
                                      Ngân hàng có: <b>{ex.p3.bank.length}</b> câu
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 4: Final Quiz Config */}
          <div className="space-y-4 border-b border-slate-100 pb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2 text-blue-700">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                    4
                  </span>
                  Bài kiểm tra cuối khóa
                </h4>
                <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2.5 py-0.5 rounded-full border border-blue-100">
                  Đánh giá & Xếp loại
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="enableQuiz"
                  checked={enableQuiz}
                  onChange={(e) => setEnableQuiz(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ms-2 text-xs font-bold text-slate-700">
                  {enableQuiz ? 'Đang bật' : 'Đang tắt'}
                </span>
              </label>
            </div>

            {enableQuiz && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Thời gian (phút)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={quizConfig.durationMin}
                      onChange={(e) =>
                        setQuizConfig({
                          ...quizConfig,
                          durationMin: parseInt(e.target.value) || 15,
                        })
                      }
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Số lần làm tối đa
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={quizConfig.maxAttempts}
                      onChange={(e) =>
                        setQuizConfig({
                          ...quizConfig,
                          maxAttempts: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Điểm đạt (≥)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={quizConfig.passingScore}
                      onChange={(e) =>
                        setQuizConfig({
                          ...quizConfig,
                          passingScore: parseFloat(e.target.value) || 80,
                        })
                      }
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-blue-700"
                    />
                  </div>
                </div>

                {/* Final Quiz Part 1 */}
                <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="final_p1_enable"
                      checked={quizConfig.p1.enabled}
                      onChange={(e) =>
                        setQuizConfig({
                          ...quizConfig,
                          p1: { ...quizConfig.p1, enabled: e.target.checked },
                        })
                      }
                    />
                    <label htmlFor="final_p1_enable" className="font-bold text-xs text-slate-800">
                      Phần 1: Trắc nghiệm nhiều lựa chọn
                    </label>
                  </div>

                  {quizConfig.p1.enabled && (
                    <div className="space-y-2 pl-6">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Số câu rút"
                          value={quizConfig.p1.count || ''}
                          onChange={(e) =>
                            setQuizConfig({
                              ...quizConfig,
                              p1: { ...quizConfig.p1, count: parseInt(e.target.value) || 0 },
                            })
                          }
                          className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg"
                        />
                        <input
                          type="number"
                          placeholder="Tổng điểm phần 1"
                          value={quizConfig.p1.totalScore || ''}
                          onChange={(e) =>
                            setQuizConfig({
                              ...quizConfig,
                              p1: { ...quizConfig.p1, totalScore: parseFloat(e.target.value) || 0 },
                            })
                          }
                          className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 min-w-0">
                          <label className="text-xs text-slate-600 font-medium shrink-0">Tải File Word (.docx):</label>
                          <input
                            type="file"
                            accept=".docx"
                            onChange={(e) => handleParseFinalWordFile(e, 1)}
                            className="text-xs text-slate-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadSampleWord(1)}
                          className="px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors shrink-0 flex items-center gap-1 shadow-sm"
                        >
                          <Download className="w-3 h-3" />
                          Tải file Word mẫu
                        </button>
                      </div>
                      {p1Status && <div className="text-xs font-semibold text-emerald-600">{p1Status}</div>}
                      {quizConfig.p1.bank.length > 0 && (
                        <div className="text-xs text-slate-500">
                          Ngân hàng hiện có: <b>{quizConfig.p1.bank.length}</b> câu
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Final Quiz Part 2 */}
                <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="final_p2_enable"
                      checked={quizConfig.p2.enabled}
                      onChange={(e) =>
                        setQuizConfig({
                          ...quizConfig,
                          p2: { ...quizConfig.p2, enabled: e.target.checked },
                        })
                      }
                    />
                    <label htmlFor="final_p2_enable" className="font-bold text-xs text-slate-800">
                      Phần 2: Trắc nghiệm Đúng / Sai
                    </label>
                  </div>

                  {quizConfig.p2.enabled && (
                    <div className="space-y-2 pl-6">
                      <input
                        type="number"
                        placeholder="Số câu rút"
                        value={quizConfig.p2.count || ''}
                        onChange={(e) =>
                          setQuizConfig({
                            ...quizConfig,
                            p2: { ...quizConfig.p2, count: parseInt(e.target.value) || 0 },
                          })
                        }
                        className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg"
                      />

                      <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80 space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-700">Thang điểm chấm (cho 1 câu hỏi):</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Đúng 1 ý</label>
                            <input
                              type="number"
                              step="0.05"
                              placeholder="0.1"
                              value={quizConfig.p2.scores?.s1 !== undefined ? quizConfig.p2.scores.s1 : 0.1}
                              onChange={(e) => {
                                const currentScores = quizConfig.p2.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
                                const val = parseFloat(e.target.value);
                                setQuizConfig({
                                  ...quizConfig,
                                  p2: {
                                    ...quizConfig.p2,
                                    scores: { ...currentScores, s1: isNaN(val) ? 0 : val },
                                  },
                                });
                              }}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Đúng 2 ý</label>
                            <input
                              type="number"
                              step="0.05"
                              placeholder="0.25"
                              value={quizConfig.p2.scores?.s2 !== undefined ? quizConfig.p2.scores.s2 : 0.25}
                              onChange={(e) => {
                                const currentScores = quizConfig.p2.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
                                const val = parseFloat(e.target.value);
                                setQuizConfig({
                                  ...quizConfig,
                                  p2: {
                                    ...quizConfig.p2,
                                    scores: { ...currentScores, s2: isNaN(val) ? 0 : val },
                                  },
                                });
                              }}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Đúng 3 ý</label>
                            <input
                              type="number"
                              step="0.05"
                              placeholder="0.5"
                              value={quizConfig.p2.scores?.s3 !== undefined ? quizConfig.p2.scores.s3 : 0.5}
                              onChange={(e) => {
                                const currentScores = quizConfig.p2.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
                                const val = parseFloat(e.target.value);
                                setQuizConfig({
                                  ...quizConfig,
                                  p2: {
                                    ...quizConfig.p2,
                                    scores: { ...currentScores, s3: isNaN(val) ? 0 : val },
                                  },
                                });
                              }}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Đúng 4 ý</label>
                            <input
                              type="number"
                              step="0.05"
                              placeholder="1.0"
                              value={quizConfig.p2.scores?.s4 !== undefined ? quizConfig.p2.scores.s4 : 1.0}
                              onChange={(e) => {
                                const currentScores = quizConfig.p2.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
                                const val = parseFloat(e.target.value);
                                setQuizConfig({
                                  ...quizConfig,
                                  p2: {
                                    ...quizConfig.p2,
                                    scores: { ...currentScores, s4: isNaN(val) ? 0 : val },
                                  },
                                });
                              }}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-800"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 min-w-0">
                          <label className="text-xs text-slate-600 font-medium shrink-0">Tải File Word (.docx):</label>
                          <input
                            type="file"
                            accept=".docx"
                            onChange={(e) => handleParseFinalWordFile(e, 2)}
                            className="text-xs text-slate-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadSampleWord(2)}
                          className="px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors shrink-0 flex items-center gap-1 shadow-sm"
                        >
                          <Download className="w-3 h-3" />
                          Tải file Word mẫu
                        </button>
                      </div>
                      {p2Status && <div className="text-xs font-semibold text-emerald-600">{p2Status}</div>}
                      {quizConfig.p2.bank.length > 0 && (
                        <div className="text-xs text-slate-500">
                          Ngân hàng hiện có: <b>{quizConfig.p2.bank.length}</b> câu
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Final Quiz Part 3 */}
                <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="final_p3_enable"
                      checked={quizConfig.p3.enabled}
                      onChange={(e) =>
                        setQuizConfig({
                          ...quizConfig,
                          p3: { ...quizConfig.p3, enabled: e.target.checked },
                        })
                      }
                    />
                    <label htmlFor="final_p3_enable" className="font-bold text-xs text-slate-800">
                      Phần 3: Câu trả lời ngắn
                    </label>
                  </div>

                  {quizConfig.p3.enabled && (
                    <div className="space-y-2 pl-6">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Số câu rút"
                          value={quizConfig.p3.count || ''}
                          onChange={(e) =>
                            setQuizConfig({
                              ...quizConfig,
                              p3: { ...quizConfig.p3, count: parseInt(e.target.value) || 0 },
                            })
                          }
                          className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg"
                        />
                        <input
                          type="number"
                          placeholder="Tổng điểm phần 3"
                          value={quizConfig.p3.totalScore || ''}
                          onChange={(e) =>
                            setQuizConfig({
                              ...quizConfig,
                              p3: { ...quizConfig.p3, totalScore: parseFloat(e.target.value) || 0 },
                            })
                          }
                          className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 min-w-0">
                          <label className="text-xs text-slate-600 font-medium shrink-0">Tải File Word (.docx):</label>
                          <input
                            type="file"
                            accept=".docx"
                            onChange={(e) => handleParseFinalWordFile(e, 3)}
                            className="text-xs text-slate-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadSampleWord(3)}
                          className="px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors shrink-0 flex items-center gap-1 shadow-sm"
                        >
                          <Download className="w-3 h-3" />
                          Tải file Word mẫu
                        </button>
                      </div>
                      {p3Status && <div className="text-xs font-semibold text-emerald-600">{p3Status}</div>}
                      {quizConfig.p3.bank.length > 0 && (
                        <div className="text-xs text-slate-500">
                          Ngân hàng hiện có: <b>{quizConfig.p3.bank.length}</b> câu
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: Certificate Config */}
          <div className="space-y-4 border-b border-slate-100 pb-5">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2 text-blue-700">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">
                  5
                </span>
                <Award className="w-4 h-4 text-amber-600" />
                Cấp Giấy chứng nhận hoàn thành khóa học
              </h4>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={certConfig.enabled}
                  onChange={(e) => setCertConfig({ ...certConfig, enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                <span className="ml-2 text-xs font-bold text-slate-700">
                  {certConfig.enabled ? 'Đang BẬT' : 'Đang TẮT'}
                </span>
              </label>
            </div>

            {certConfig.enabled && (
              <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 space-y-4 animate-in fade-in duration-200">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <p className="text-xs text-amber-900 font-medium">
                    Thiết lập thông tin hiển thị trên Giấy chứng nhận cấp tự động cho học viên khi hoàn thành khóa học.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCertPreview(true)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Xem trước Giấy chứng nhận
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tên Đơn vị chủ quản
                    </label>
                    <input
                      type="text"
                      value={certConfig.parentOrganization}
                      onChange={(e) => setCertConfig({ ...certConfig, parentOrganization: e.target.value })}
                      placeholder="VD: ĐOÀN TNCS HỒ CHÍ MINH"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tên Đơn vị trực tiếp
                    </label>
                    <input
                      type="text"
                      value={certConfig.organization}
                      onChange={(e) => setCertConfig({ ...certConfig, organization: e.target.value })}
                      placeholder="VD: TRƯỜNG THPT NGUYỄN QUANG DIÊU"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ký hiệu / Hậu tố Số Giấy chứng nhận
                    </label>
                    <input
                      type="text"
                      value={certConfig.certNumberSuffix || ''}
                      onChange={(e) => setCertConfig({ ...certConfig, certNumberSuffix: e.target.value })}
                      placeholder="Mặc định: GCN/ĐTN (VD: GCN-ĐTN, GCN-THPT,...)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Chức vụ người ký
                    </label>
                    <input
                      type="text"
                      value={certConfig.signerTitle}
                      onChange={(e) => setCertConfig({ ...certConfig, signerTitle: e.target.value })}
                      placeholder="Mặc định: GIÁO VIÊN (hoặc HIỆU TRƯỞNG, BÍ THƯ ĐOÀN TRƯỜNG)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Chức vụ người ký thay (nếu có)
                    </label>
                    <input
                      type="text"
                      value={certConfig.delegateTitle || ''}
                      onChange={(e) => setCertConfig({ ...certConfig, delegateTitle: e.target.value })}
                      placeholder="VD: KT. BÍ THƯ, TL. HIỆU TRƯỜNG (Tùy chọn)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Họ tên người ký
                    </label>
                    <input
                      type="text"
                      value={certConfig.signerName || ''}
                      onChange={(e) => setCertConfig({ ...certConfig, signerName: e.target.value })}
                      placeholder={`Để trống sẽ lấy tên người tạo (${currentUser?.fullName || currentUser?.hoTen || 'Giáo viên'})`}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>

                  {/* Logo upload */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Logo đơn vị (Tùy chọn)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFileUpload(e, 'logoImage')}
                        className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200"
                      />
                      {certConfig.logoImage && (
                        <div className="flex items-center gap-1.5 bg-white p-1 rounded border border-slate-200">
                          <img src={certConfig.logoImage} alt="Logo preview" className="h-6 object-contain" />
                          <button
                            type="button"
                            onClick={() => setCertConfig({ ...certConfig, logoImage: '' })}
                            className="text-rose-500 hover:text-rose-700 text-xs font-bold p-0.5"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Signature upload */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ảnh chữ ký người ký (Tùy chọn)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFileUpload(e, 'signatureImage')}
                        className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200"
                      />
                      {certConfig.signatureImage && (
                        <div className="flex items-center gap-1.5 bg-white p-1 rounded border border-slate-200">
                          <img src={certConfig.signatureImage} alt="Signature preview" className="h-6 object-contain" />
                          <button
                            type="button"
                            onClick={() => setCertConfig({ ...certConfig, signatureImage: '' })}
                            className="text-rose-500 hover:text-rose-700 text-xs font-bold p-0.5"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Logo Size Control */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kích thước Logo đơn vị
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCertConfig({ ...certConfig, logoSize: Math.max(40, (certConfig.logoSize || 96) - 10) })}
                        className="w-8 h-8 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min="40"
                        max="250"
                        step="5"
                        value={certConfig.logoSize || 96}
                        onChange={(e) => setCertConfig({ ...certConfig, logoSize: Number(e.target.value) })}
                        className="w-full accent-amber-600 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => setCertConfig({ ...certConfig, logoSize: Math.min(250, (certConfig.logoSize || 96) + 10) })}
                        className="w-8 h-8 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        +
                      </button>
                      <span className="text-xs font-bold text-slate-800 w-12 text-right shrink-0">
                        {certConfig.logoSize || 96}px
                      </span>
                    </div>
                  </div>

                  {/* Signature Size Control */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kích thước Ảnh chữ ký người ký
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCertConfig({ ...certConfig, signatureSize: Math.max(40, (certConfig.signatureSize || 80) - 10) })}
                        className="w-8 h-8 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min="40"
                        max="250"
                        step="5"
                        value={certConfig.signatureSize || 80}
                        onChange={(e) => setCertConfig({ ...certConfig, signatureSize: Number(e.target.value) })}
                        className="w-full accent-amber-600 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => setCertConfig({ ...certConfig, signatureSize: Math.min(250, (certConfig.signatureSize || 80) + 10) })}
                        className="w-8 h-8 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        +
                      </button>
                      <span className="text-xs font-bold text-slate-800 w-12 text-right shrink-0">
                        {certConfig.signatureSize || 80}px
                      </span>
                    </div>
                  </div>

                  {/* Font Size Scale Control */}
                  <div className="sm:col-span-2 bg-amber-100/60 p-3 rounded-xl border border-amber-200/80">
                    <label className="block text-xs font-bold text-amber-950 mb-1">
                      🔤 Kích thước chữ trên giấy chứng nhận
                    </label>
                    <p className="text-[11px] text-amber-900/80 mb-2">
                      Tăng giảm kích thước chữ trên giấy chứng nhận (không làm thay đổi vị trí cố định của Tên đơn vị, Ký hiệu, Chức danh người ký, v.v.).
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setCertConfig({ ...certConfig, fontSizeScale: Math.max(70, (certConfig.fontSizeScale || 100) - 5) })}
                        className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-bold text-amber-950 hover:bg-amber-50 shadow-2xs shrink-0 cursor-pointer text-xs"
                      >
                        - Giảm chữ
                      </button>
                      <input
                        type="range"
                        min="70"
                        max="150"
                        step="5"
                        value={certConfig.fontSizeScale || 100}
                        onChange={(e) => setCertConfig({ ...certConfig, fontSizeScale: Number(e.target.value) })}
                        className="w-full accent-amber-600 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => setCertConfig({ ...certConfig, fontSizeScale: Math.min(150, (certConfig.fontSizeScale || 100) + 5) })}
                        className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-bold text-amber-950 hover:bg-amber-50 shadow-2xs shrink-0 cursor-pointer text-xs"
                      >
                        + Tăng chữ
                      </button>
                      <span className="text-xs font-bold text-amber-900 bg-amber-200/80 px-2.5 py-1 rounded-lg shrink-0">
                        {certConfig.fontSizeScale || 100}%
                      </span>
                    </div>
                  </div>

                  {/* Custom Background Upload */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Khung / Ảnh nền Giấy chứng nhận tùy chỉnh (Mặc định AI tự thiết kế khung viền Xanh Vàng sang trọng)
                    </label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFileUpload(e, 'bgCustomImage')}
                        className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200"
                      />
                      {certConfig.bgCustomImage && (
                        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200">
                          <ImageIcon className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs text-emerald-700 font-bold">Đã tải ảnh nền</span>
                          <button
                            type="button"
                            onClick={() => setCertConfig({ ...certConfig, bgCustomImage: '' })}
                            className="text-rose-500 hover:text-rose-700 text-xs font-bold px-1"
                          >
                            Xóa ảnh nền
                          </button>
                        </div>
                      )}
                      <a
                        href="https://drive.google.com/drive/folders/1nXmtqxVtpWQhVwDRM4nT5f8fEKMK4K7a?usp=sharing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-all shadow-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                        Tùy chọn: Tải ảnh phông nền mẫu
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs transition-colors"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Đang lưu...' : 'Lưu khóa học'}
          </button>
        </div>
      </div>

      {/* Certificate Preview Modal */}
      {showCertPreview && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[60] flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 w-full max-w-5xl rounded-2xl sm:rounded-3xl p-2 sm:p-4 shadow-2xl relative max-h-[98vh] flex flex-col overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowCertPreview(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 p-2 bg-slate-800 text-slate-300 hover:text-white rounded-full hover:bg-slate-700 transition-colors border border-slate-600 shadow-md cursor-pointer"
              title="Đóng xem trước"
            >
              <X className="w-5 h-5" />
            </button>
            <CertificateView
              previewConfig={certConfig}
              previewCourseTitle={title || 'Tên khóa học mẫu'}
              previewStudentName={currentUser?.fullName || currentUser?.hoTen || 'NGUYỄN VĂN A'}
              previewStudentClass={currentUser?.className || currentUser?.chiDoan || '10A1'}
              previewSignerName={certConfig.signerName || currentUser?.fullName || currentUser?.hoTen || 'Giáo viên hướng dẫn'}
              onClose={() => setShowCertPreview(false)}
            />
          </div>
        </div>
      )}

      {/* Teacher AI Modal */}
      <TeacherAiModal
        isOpen={teacherAiOpen}
        initialTab="CREATE_COURSE"
        onClose={() => setTeacherAiOpen(false)}
        onOpenCourseEditor={(prefilledCourse) => {
          setTeacherAiOpen(false);
          setCourseId(prefilledCourse.courseId);
          setTitle(prefilledCourse.title || '');
          setDescription(prefilledCourse.description || '');
          setImageUrl(prefilledCourse.imageUrl || '');
          setStartDate(formatForDatetimeLocalInput(prefilledCourse.startDate));
          setEndDate(formatForDatetimeLocalInput(prefilledCourse.endDate));
          setLessons(prefilledCourse.lessons ? JSON.parse(JSON.stringify(prefilledCourse.lessons)) : []);

          const q = prefilledCourse.quizConfig || {};
          setEnableQuiz(q.enabled !== false);
          setQuizConfig({
            enabled: q.enabled !== false,
            durationMin: q.durationMin || 15,
            maxAttempts: q.maxAttempts || 1,
            passingScore: q.passingScore !== undefined ? q.passingScore : 80,
            p1: q.p1 || { enabled: true, count: 0, totalScore: 0, bank: [] },
            p2: q.p2 || { enabled: false, count: 0, scores: { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 }, bank: [] },
            p3: q.p3 || { enabled: false, count: 0, totalScore: 0, bank: [] },
          });

          const cert = prefilledCourse.certificateConfig || {};
          setCertConfig({
            enabled: cert.enabled !== false,
            parentOrganization: cert.parentOrganization || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG',
            organization: cert.organization || 'TRƯỜNG THPT NGUYỄN QUANG DIÊU',
            signerTitle: cert.signerTitle || 'HIỆU TRƯỜNG',
            delegateTitle: cert.delegateTitle || '',
            signerName: cert.signerName || currentUser?.fullName || currentUser?.hoTen || prefilledCourse.authorName || '',
            signatureImage: cert.signatureImage || '',
            logoImage: cert.logoImage || '',
            bgTheme: cert.bgTheme || 'blue_sky',
            bgCustomImage: cert.bgCustomImage || '',
            certNumberSuffix: cert.certNumberSuffix || 'NQD-AI',
          });

          const om = prefilledCourse.onlineMeetingConfig || {};
          const isOmEnabled = om.enabled === true || (Boolean(om.meetingUrl && om.meetingUrl.trim()) && om.enabled !== false);
          setOnlineMeetingConfig({
            enabled: isOmEnabled,
            platform: om.platform || 'google_meet',
            meetingUrl: om.meetingUrl || '',
            title: om.title || '',
            scheduleTime: om.scheduleTime || '',
            note: om.note || '',
          });
        }}
        onCourseCreated={(newCourse) => {
          setTeacherAiOpen(false);
          onSaveSuccess(newCourse);
        }}
      />
    </>
  );

  return isInline ? (
    <div className="w-full animate-in fade-in duration-200">{modalInner}</div>
  ) : (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {modalInner}
    </div>
  );
};
