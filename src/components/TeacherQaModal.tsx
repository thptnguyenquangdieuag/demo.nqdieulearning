import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Course, User, QaQuestion, QaAnswer } from '../types';
import {
  MessageSquare,
  X,
  Search,
  CheckCircle2,
  Clock,
  Send,
  Trash2,
  ShieldCheck,
  HelpCircle,
  MessageCircle,
  ThumbsUp,
  Filter,
  RefreshCw,
  Sparkles,
  BookOpen,
  UserCheck,
  AlertCircle,
  Check,
} from 'lucide-react';
import {
  getStoredQaQuestions,
  saveStoredQaQuestions,
  fetchQaQuestionsFromApi,
  addNotification,
} from '../lib/storage';

interface TeacherQaModalProps {
  isOpen?: boolean;
  onClose: () => void;
  currentUser: User | null;
  courses: Course[];
  isInline?: boolean;
}

export const TeacherQaModal: React.FC<TeacherQaModalProps> = ({
  isOpen = true,
  onClose,
  currentUser,
  courses,
  isInline = false,
}) => {
  const [questions, setQuestions] = useState<QaQuestion[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNANSWERED' | 'ANSWERED'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'ADMIN';

  // Load all QA questions
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const local = getStoredQaQuestions();
      setQuestions(local);
      const apiQuestions = await fetchQaQuestionsFromApi();
      if (apiQuestions && apiQuestions.length > 0) {
        const clean = apiQuestions.filter((q: any) => q && !String(q.id || '').startsWith('q_sample_') && q.authorId !== 'student_sample_1');
        setQuestions(clean);
      }
    } catch (err) {
      console.warn('Failed to load QA data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Listen to global update event
  useEffect(() => {
    const handleUpdate = () => {
      setQuestions(getStoredQaQuestions());
    };
    window.addEventListener('lms-qa-updated', handleUpdate);
    return () => window.removeEventListener('lms-qa-updated', handleUpdate);
  }, []);

  // Filter courses that teacher owns (or all for Admin)
  const availableCourses = useMemo(() => {
    if (isAdmin) return courses;
    if (!currentUser) return [];
    const cleanUser = String(currentUser.idUser || '').toLowerCase().trim();
    const cleanName = String(currentUser.hoTen || '').toLowerCase().trim();
    const cleanUsername = String(currentUser.username || '').toLowerCase().trim();

    return courses.filter((c) => {
      const cAuthorId = String(c.authorId || '').toLowerCase().trim();
      const cAuthorName = String(c.authorName || '').toLowerCase().trim();
      if (cAuthorId && (cAuthorId === cleanUser || cAuthorId === cleanUsername)) return true;
      if (cAuthorName && cleanName && cAuthorName === cleanName) return true;
      return false;
    });
  }, [courses, isAdmin, currentUser]);

  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach((c) => map.set(c.courseId, c));
    return map;
  }, [courses]);

  // Questions scoped for the current teacher (or all for Admin)
  const scopedQuestions = useMemo(() => {
    if (isAdmin) return questions;
    const allowedCourseIds = new Set(availableCourses.map((c) => String(c.courseId)));
    return questions.filter((q) => allowedCourseIds.has(String(q.courseId)));
  }, [questions, isAdmin, availableCourses]);

  // Filter and sort questions
  const filteredQuestions = useMemo(() => {
    return scopedQuestions.filter((q) => {
      // Course filter
      if (selectedCourseFilter !== 'ALL') {
        if (String(q.courseId) !== String(selectedCourseFilter)) return false;
      }

      // Check if question has a teacher/admin answer
      const hasTeacherAnswer = (q.answers || []).some(
        (a) => a.authorRole === 'TEACHER' || a.authorRole === 'ADMIN'
      );

      if (statusFilter === 'UNANSWERED' && hasTeacherAnswer) return false;
      if (statusFilter === 'ANSWERED' && !hasTeacherAnswer) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const authorMatch = (q.authorName || '').toLowerCase().includes(query);
        const classMatch = (q.authorClass || '').toLowerCase().includes(query);
        const contentMatch = (q.content || '').toLowerCase().includes(query);
        const courseTitleMatch = (q.courseTitle || courseMap.get(q.courseId)?.title || '').toLowerCase().includes(query);
        const lessonTitleMatch = (q.lessonTitle || '').toLowerCase().includes(query);
        return authorMatch || classMatch || contentMatch || courseTitleMatch || lessonTitleMatch;
      }

      return true;
    });
  }, [scopedQuestions, selectedCourseFilter, statusFilter, searchQuery, courseMap]);

  // Metrics (calculated on scoped questions)
  const stats = useMemo(() => {
    const total = scopedQuestions.length;
    let unanswered = 0;
    let answered = 0;

    scopedQuestions.forEach((q) => {
      const hasTeacherAns = (q.answers || []).some(
        (a) => a.authorRole === 'TEACHER' || a.authorRole === 'ADMIN'
      );
      if (hasTeacherAns) {
        answered++;
      } else {
        unanswered++;
      }
    });

    const rate = total > 0 ? Math.round((answered / total) * 100) : 100;
    return { total, unanswered, answered, rate };
  }, [scopedQuestions]);

  // Handlers
  const handleSendReply = async (questionId: string) => {
    const text = (replyTextMap[questionId] || '').trim();
    if (!text || !currentUser || submittingReplyId) return;

    const targetQ = questions.find((q) => q.id === questionId);
    if (!targetQ) return;

    // Check permission: Admin can reply to all; Teacher can only reply to their own courses
    if (!isAdmin) {
      const isOwner = availableCourses.some((c) => String(c.courseId) === String(targetQ.courseId));
      if (!isOwner) {
        alert('Bạn chỉ có quyền trả lời và giải đáp câu hỏi trên các khóa học do bạn tạo!');
        return;
      }
    }

    setSubmittingReplyId(questionId);

    const isTeacherOrAdmin = currentUser.role === 'TEACHER' || currentUser.role === 'ADMIN';

    const newAns: QaAnswer = {
      id: `a_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      authorId: currentUser.idUser,
      authorName: currentUser.hoTen || (isAdmin ? 'Quản trị viên' : 'Giáo viên hướng dẫn'),
      authorRole: isTeacherOrAdmin ? (currentUser.role as 'TEACHER' | 'ADMIN') : 'TEACHER',
      authorClass: isAdmin ? 'BGH / Quản trị viên' : (currentUser.chiDoan || 'Tổ Chuyên môn'),
      content: text,
      createdAt: 'Vừa xong',
      likes: 0,
      likedBy: [],
    };

    // Update local state immediately
    const updated = questions.map((q) => {
      if (q.id === questionId) {
        return {
          ...q,
          answers: [...(q.answers || []), newAns],
        };
      }
      return q;
    });

    setQuestions(updated);
    saveStoredQaQuestions(updated);
    setReplyTextMap({ ...replyTextMap, [questionId]: '' });

    // Bắn thông báo tức thời đến học sinh đã đặt câu hỏi
    if (targetQ.authorId && targetQ.authorId !== currentUser.idUser) {
      addNotification({
        recipientId: targetQ.authorId,
        type: 'QA_ANSWER',
        title: `${currentUser.hoTen || 'Thầy/Cô'} đã trả lời câu hỏi của bạn`,
        message: `Khóa học "${targetQ.courseTitle || 'Khóa học'}": ${text.length > 80 ? text.slice(0, 80) + '...' : text}`,
        linkCourseId: targetQ.courseId,
        linkLessonIdx: targetQ.lessonIdx,
        linkAction: 'open_course',
        createdAt: new Date().toISOString(),
      });
    }

    try {
      await fetch('/api/qa/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, answer: newAns }),
      });
    } catch {
      // Offline fallback
    } finally {
      setSubmittingReplyId(null);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Bạn có chắc chắn muốn XÓA câu hỏi này cùng toàn bộ các câu trả lời liên quan?')) return;

    const updated = questions.filter((q) => q.id !== questionId);
    setQuestions(updated);
    saveStoredQaQuestions(updated);

    try {
      await fetch(`/api/qa/question/${questionId}`, {
        method: 'DELETE',
      });
    } catch {
      // Offline fallback
    }
  };

  const handleDeleteAnswer = async (questionId: string, answerId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa phản hồi này?')) return;

    const updated = questions.map((q) => {
      if (q.id === questionId) {
        return {
          ...q,
          answers: (q.answers || []).filter((a) => a.id !== answerId),
        };
      }
      return q;
    });

    setQuestions(updated);
    saveStoredQaQuestions(updated);

    try {
      await fetch(`/api/qa/answer/${questionId}/${answerId}`, {
        method: 'DELETE',
      });
    } catch {
      // Offline fallback
    }
  };

  const handleApplyTemplate = (questionId: string, templateText: string) => {
    const current = replyTextMap[questionId] || '';
    setReplyTextMap({
      ...replyTextMap,
      [questionId]: current ? `${current}\n${templateText}` : templateText,
    });
  };

  if (!isOpen && !isInline) return null;

  const modalInner = (
    <div className={`bg-white ${isInline ? 'w-full rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden' : 'w-full max-w-5xl h-[min(90vh,560px)] max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col'}`}>
      {/* Modal Header */}
      <div className={`bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white px-4 sm:px-5 py-2.5 flex items-center justify-between shrink-0 shadow-md ${isInline ? 'hidden' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-amber-300 shadow-sm shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black tracking-tight uppercase">
                GÓC HỎI ĐÁP (Q&A) BÀI HỌC
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 shadow-xs uppercase tracking-wide">
                {isAdmin ? 'Quản trị viên' : 'Giáo viên'}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-blue-100/90 font-medium mt-0.5 line-clamp-1">
              {isAdmin
                ? 'Quản trị viên có toàn quyền theo dõi, quản lý và giải đáp mọi thắc mắc trong tất cả khóa học'
                : 'Theo dõi, quản lý và giải đáp thắc mắc học tập của học sinh trong các khóa học do bạn tạo'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer"
            title="Làm mới dữ liệu hỏi đáp"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-600/80 text-white transition-all active:scale-95 cursor-pointer"
            title="Đóng (Về tổng quan)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

        {/* Quick Stats Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 sm:px-6 py-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div className="bg-white p-2.5 px-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Tổng câu hỏi:</span>
            <span className="text-sm font-black text-slate-900">{stats.total}</span>
          </div>

          <div className="bg-white p-2.5 px-3.5 rounded-xl border border-amber-200 bg-amber-50/40 shadow-2xs flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              Chưa giải đáp:
            </span>
            <span className="text-sm font-black text-amber-700">{stats.unanswered}</span>
          </div>

          <div className="bg-white p-2.5 px-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-2xs flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Đã giải đáp:
            </span>
            <span className="text-sm font-black text-emerald-700">{stats.answered}</span>
          </div>

          <div className="bg-white p-2.5 px-3.5 rounded-xl border border-blue-200 bg-blue-50/40 shadow-2xs flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700">Tỷ lệ giải đáp:</span>
            <span className="text-sm font-black text-blue-700">{stats.rate}%</span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-white space-y-3 shrink-0">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tên học sinh, lớp, nội dung câu hỏi, tên bài học..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              />
            </div>

            {/* Course Filter Dropdown */}
            <div className="w-full md:w-64 shrink-0">
              <select
                value={selectedCourseFilter}
                onChange={(e) => setSelectedCourseFilter(e.target.value)}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="ALL">
                  {isAdmin
                    ? `Tất cả khóa học (${availableCourses.length})`
                    : `Tất cả KHÓA HỌC CỦA TÔI (${availableCourses.length})`}
                </option>
                {availableCourses.map((c) => (
                  <option key={c.courseId} value={c.courseId}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Tất cả ({stats.total})</span>
            </button>

            <button
              onClick={() => setStatusFilter('UNANSWERED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                statusFilter === 'UNANSWERED'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Chờ giải đáp ({stats.unanswered})</span>
              {stats.unanswered > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setStatusFilter('ANSWERED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                statusFilter === 'ANSWERED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Đã có giải đáp ({stats.answered})</span>
            </button>
          </div>
        </div>

        {/* Questions Body List */}
        <div className={`p-5 sm:p-6 space-y-5 bg-slate-50/60 ${isInline ? 'h-auto overflow-visible' : 'flex-1 overflow-y-auto'}`}>
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-16 px-4 bg-white rounded-2xl border border-dashed border-slate-200 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
                <MessageCircle className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-slate-800">
                Không tìm thấy câu hỏi nào phù hợp
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {searchQuery || selectedCourseFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm để xem các câu hỏi khác.'
                  : isAdmin
                  ? 'Hiện tại chưa có câu hỏi nào từ học sinh trong hệ thống. Các câu hỏi sẽ hiển thị tự động tại đây!'
                  : availableCourses.length === 0
                  ? 'Bạn chưa tạo khóa học nào hoặc chưa có câu hỏi nào trong các khóa học do bạn phụ trách.'
                  : 'Hiện tại chưa có câu hỏi nào từ học sinh trong các khóa học do bạn tạo. Thắc mắc của học sinh sẽ hiển thị tại đây!'}
              </p>
            </div>
          ) : (
            filteredQuestions.map((q) => {
              const matchedCourse = courseMap.get(q.courseId);
              const courseTitle = q.courseTitle || matchedCourse?.title || `Khóa học #${q.courseId}`;
              const lessonTitle =
                q.lessonTitle ||
                (matchedCourse?.lessons && matchedCourse.lessons[q.lessonIdx]?.title) ||
                `Bài học ${Number(q.lessonIdx ?? 0) + 1}`;

              const teacherAnswers = (q.answers || []).filter(
                (a) => a.authorRole === 'TEACHER' || a.authorRole === 'ADMIN'
              );
              const hasTeacherResponse = teacherAnswers.length > 0;
              const isReplyingThis = submittingReplyId === q.id;

              return (
                <div
                  key={q.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4 transition-all hover:border-blue-300"
                >
                  {/* Context Header: Course & Lesson Tag */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-bold border border-blue-200 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{courseTitle}</span>
                      </span>

                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold">
                        Bài {Number(q.lessonIdx ?? 0) + 1}: {lessonTitle}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasTeacherResponse ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-extrabold rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Đã có giải đáp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 text-[11px] font-extrabold rounded-full border border-amber-200 animate-pulse">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Chờ giải đáp
                        </span>
                      )}

                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="Xóa câu hỏi này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Student Question Card */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-800 font-black text-xs flex items-center justify-center ring-2 ring-indigo-50">
                        {q.authorName ? q.authorName.charAt(0).toUpperCase() : 'S'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900">{q.authorName}</span>
                          {q.authorClass && (
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                              Lớp: {q.authorClass}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {q.createdAt}
                        </span>
                      </div>
                    </div>

                    <div className="pl-11 pr-2">
                      <p className="text-xs sm:text-sm text-slate-800 font-semibold leading-relaxed bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
                        {q.content}
                      </p>
                    </div>
                  </div>

                  {/* Existing Answers List */}
                  {Array.isArray(q.answers) && q.answers.length > 0 && (
                    <div className="pl-6 sm:pl-11 space-y-3 pt-2">
                      <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                        Các phản hồi & giải đáp ({q.answers.length}):
                      </span>

                      {q.answers.map((ans) => {
                        const isTeacherAns = ans.authorRole === 'TEACHER' || ans.authorRole === 'ADMIN';

                        return (
                          <div
                            key={ans.id}
                            className={`p-3.5 rounded-xl border space-y-2 transition-all ${
                              isTeacherAns
                                ? 'bg-blue-50/70 border-blue-200 ring-1 ring-blue-100'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                    isTeacherAns
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-300 text-slate-700'
                                  }`}
                                >
                                  {ans.authorName ? ans.authorName.charAt(0).toUpperCase() : 'G'}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-extrabold text-slate-900">
                                    {ans.authorName}
                                  </span>
                                  {isTeacherAns && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded-full text-[9px] font-extrabold shadow-2xs">
                                      <ShieldCheck className="w-2.5 h-2.5" />
                                      {ans.authorRole === 'ADMIN' ? 'Quản trị viên' : 'Giáo viên'}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-400">
                                    • {ans.createdAt}
                                  </span>
                                </div>
                              </div>

                              <button
                                onClick={() => handleDeleteAnswer(q.id, ans.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-all cursor-pointer"
                                title="Xóa câu trả lời này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <p className="text-xs text-slate-800 font-medium leading-relaxed pl-8">
                              {ans.content}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Teacher Quick Reply Form */}
                  <div className="pl-6 sm:pl-11 pt-2 space-y-2.5">
                    {/* Quick suggested templates */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        Gợi ý nhanh:
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleApplyTemplate(
                            q.id,
                            'Chào em! Thầy/Cô đã xem câu hỏi. Đối với nội dung này, em cần lưu ý xem kỹ tài liệu bài học và thực hành theo các bước hướng dẫn nhé!'
                          )
                        }
                        className="text-[10px] font-semibold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 px-2 py-1 rounded-lg transition-all border border-slate-200 cursor-pointer"
                      >
                        + Hướng dẫn xem tài liệu
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleApplyTemplate(
                            q.id,
                            'Câu hỏi của em rất hay! Để giải quyết vấn đề này, phương pháp tối ưu là...'
                          )
                        }
                        className="text-[10px] font-semibold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 px-2 py-1 rounded-lg transition-all border border-slate-200 cursor-pointer"
                      >
                        + Khen ngợi & Giải thích
                      </button>
                    </div>

                    {/* Reply Textarea */}
                    <div className="relative">
                      <textarea
                        rows={2}
                        value={replyTextMap[q.id] || ''}
                        onChange={(e) =>
                          setReplyTextMap({ ...replyTextMap, [q.id]: e.target.value })
                        }
                        placeholder={`Nhập nội dung giải đáp câu hỏi của em ${q.authorName}...`}
                        className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium resize-none shadow-2xs"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-medium">
                        Trả lời với tư cách:{' '}
                        <strong className="text-blue-700">
                          {currentUser?.hoTen || (isAdmin ? 'Quản trị viên' : 'Giáo viên')}
                        </strong>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleSendReply(q.id)}
                        disabled={!(replyTextMap[q.id] || '').trim() || isReplyingThis}
                        className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Send className={`w-3.5 h-3.5 ${isReplyingThis ? 'animate-spin' : ''}`} />
                        <span>{isReplyingThis ? 'Đang gửi...' : 'Gửi giải đáp'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Mọi câu trả lời của Giáo viên sẽ được làm nổi bật và thông báo ngay đến học sinh.</span>
          </div>

          {!isInline && (
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      {modalInner}
    </div>
  );
};
