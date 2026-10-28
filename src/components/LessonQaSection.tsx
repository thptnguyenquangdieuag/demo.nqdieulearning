import React, { useState, useEffect, useCallback } from 'react';
import { User, Course, Lesson, QaQuestion, QaAnswer } from '../types';
import {
  MessageSquare,
  Send,
  ThumbsUp,
  CornerDownRight,
  UserCheck,
  Award,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  MessageCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { getStoredQaQuestions, saveStoredQaQuestions, fetchQaQuestionsFromApi } from '../lib/storage';

interface LessonQaSectionProps {
  course: Course;
  currentLesson: Lesson;
  currentLessonIdx: number;
  currentUser: User;
}


export const LessonQaSection: React.FC<LessonQaSectionProps> = ({
  course,
  currentLesson,
  currentLessonIdx,
  currentUser,
}) => {

  const [questions, setQuestions] = useState<QaQuestion[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';
  const isTeacher = currentUser?.role === 'TEACHER';

  const isCourseAuthor = React.useMemo(() => {
    if (isAdmin) return true;
    if (!isTeacher) return false;
    const cleanUser = String(currentUser.idUser || '').toLowerCase().trim();
    const cleanName = String(currentUser.hoTen || '').toLowerCase().trim();
    const cleanUsername = String(currentUser.username || '').toLowerCase().trim();

    const cAuthorId = String(course.authorId || '').toLowerCase().trim();
    const cAuthorName = String(course.authorName || '').toLowerCase().trim();

    if (cAuthorId && (cAuthorId === cleanUser || cAuthorId === cleanUsername)) return true;
    if (cAuthorName && cleanName && cAuthorName === cleanName) return true;
    return false;
  }, [isAdmin, isTeacher, currentUser, course]);

  // Load and filter questions for this course and lesson
  const loadQuestions = useCallback(() => {
    const all = getStoredQaQuestions();
    const filtered = all
      .filter((q) => q && !String(q.id || '').startsWith('q_sample_') && q.authorId !== 'student_sample_1')
      .filter(
        (q) => String(q.courseId) === String(course.courseId) && Number(q.lessonIdx) === Number(currentLessonIdx)
      );

    setQuestions(filtered);
  }, [course.courseId, currentLessonIdx]);

  useEffect(() => {
    loadQuestions();
    fetchQaQuestionsFromApi(course.courseId, currentLessonIdx).then(() => {
      loadQuestions();
    });

    const handleQaEvent = () => {
      loadQuestions();
    };

    window.addEventListener('lms-qa-updated', handleQaEvent);
    return () => {
      window.removeEventListener('lms-qa-updated', handleQaEvent);
    };
  }, [loadQuestions, course.courseId, currentLessonIdx]);

  const saveQuestions = (updatedLessonQuestions: QaQuestion[]) => {
    setQuestions(updatedLessonQuestions);
    const all = getStoredQaQuestions();
    const others = all.filter(
      (q) => !(String(q.courseId) === String(course.courseId) && Number(q.lessonIdx) === Number(currentLessonIdx))
    );
    const newAll = [...updatedLessonQuestions, ...others];
    saveStoredQaQuestions(newAll);
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const isTeacherOrAdmin = currentUser.role === 'TEACHER' || currentUser.role === 'ADMIN';

    const newQ: QaQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      courseId: course.courseId,
      courseTitle: course.title,
      lessonIdx: currentLessonIdx,
      lessonTitle: currentLesson.title,
      authorId: currentUser.idUser,
      authorName: currentUser.hoTen || currentUser.username,
      authorRole: isTeacherOrAdmin ? (currentUser.role as 'TEACHER' | 'ADMIN') : 'STUDENT',
      authorClass: currentUser.chiDoan,
      content: newQuestionText.trim(),
      createdAt: 'Vừa xong',
      likes: 0,
      likedBy: [],
      answers: [],
    };

    const updated = [newQ, ...questions];
    saveQuestions(updated);
    setNewQuestionText('');

    try {
      await fetch('/api/qa/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newQ }),
      });
    } catch {
      // Fallback already saved locally
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLikeQuestion = async (qId: string) => {
    const targetQ = questions.find((q) => q.id === qId);
    if (!targetQ) return;

    const likedBy = targetQ.likedBy || [];
    const isLiked = likedBy.includes(currentUser.idUser);
    const newLikes = isLiked ? targetQ.likes - 1 : targetQ.likes + 1;
    const newLikedBy = isLiked
      ? likedBy.filter((id) => id !== currentUser.idUser)
      : [...likedBy, currentUser.idUser];

    const updated = questions.map((q) => {
      if (q.id === qId) {
        return { ...q, likes: Math.max(0, newLikes), likedBy: newLikedBy };
      }
      return q;
    });

    saveQuestions(updated);

    try {
      await fetch('/api/qa/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: qId, userId: currentUser.idUser }),
      });
    } catch {
      // ignore
    }
  };

  const handleLikeAnswer = async (qId: string, aId: string) => {
    const updated = questions.map((q) => {
      if (q.id === qId) {
        const updatedAnswers = q.answers.map((ans) => {
          if (ans.id === aId) {
            const likedBy = ans.likedBy || [];
            const isLiked = likedBy.includes(currentUser.idUser);
            const newLikes = isLiked ? ans.likes - 1 : ans.likes + 1;
            const newLikedBy = isLiked
              ? likedBy.filter((id) => id !== currentUser.idUser)
              : [...likedBy, currentUser.idUser];
            return { ...ans, likes: Math.max(0, newLikes), likedBy: newLikedBy };
          }
          return ans;
        });
        return { ...q, answers: updatedAnswers };
      }
      return q;
    });

    saveQuestions(updated);

    try {
      await fetch('/api/qa/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: qId, answerId: aId, userId: currentUser.idUser }),
      });
    } catch {
      // ignore
    }
  };

  const handleCreateAnswer = async (qId: string) => {
    const text = replyTextMap[qId] || '';
    if (!text.trim()) return;

    if (isTeacher && !isCourseAuthor && !isAdmin) {
      alert('Bạn chỉ có quyền trả lời và giải đáp câu hỏi trên các khóa học do bạn tạo!');
      return;
    }

    const isTeacherOrAdmin = currentUser.role === 'TEACHER' || currentUser.role === 'ADMIN';

    const newAns: QaAnswer = {
      id: `a_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      authorId: currentUser.idUser,
      authorName: currentUser.hoTen || currentUser.username,
      authorRole: isTeacherOrAdmin ? (currentUser.role as 'TEACHER' | 'ADMIN') : 'STUDENT',
      authorClass: currentUser.chiDoan,
      content: text.trim(),
      createdAt: 'Vừa xong',
      likes: 0,
      likedBy: [],
    };

    const updated = questions.map((q) => {
      if (q.id === qId) {
        return { ...q, answers: [...q.answers, newAns] };
      }
      return q;
    });

    saveQuestions(updated);
    setReplyTextMap({ ...replyTextMap, [qId]: '' });
    setActiveReplyId(null);

    try {
      await fetch('/api/qa/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: qId, answer: newAns }),
      });
    } catch {
      // ignore
    }
  };

  return (
    <div className="mt-8 bg-white rounded-2xl border border-blue-100 shadow-md p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 text-blue-700 rounded-2xl border border-blue-200/80">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              GÓC HỎI ĐÁP (Q&A) BÀI HỌC
              <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 rounded-full">
                {questions.length} câu hỏi
              </span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Thắc mắc về Bài {currentLessonIdx + 1}: <span className="font-semibold text-slate-700">{currentLesson.title}</span>? Đặt câu hỏi bên dưới để Giáo viên & bạn học cùng giải đáp!
            </p>
          </div>
        </div>
      </div>

      {/* Ask Question Form */}
      <form onSubmit={handleCreateQuestion} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
        <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-blue-600" />
          <span>Đặt câu hỏi mới cho bài học này:</span>
        </label>
        <div className="relative">
          <textarea
            rows={3}
            value={newQuestionText}
            onChange={(e) => setNewQuestionText(e.target.value)}
            placeholder="Nhập câu hỏi hoặc nội dung bạn chưa hiểu cần được giải đáp..."
            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none font-medium"
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500 font-medium">
            Đăng bởi: <strong className="text-slate-800">{currentUser.hoTen}</strong> ({currentUser.chiDoan || 'Học sinh'})
          </span>
          <button
            type="submit"
            disabled={!newQuestionText.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Gửi câu hỏi</span>
          </button>
        </div>
      </form>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.length === 0 ? (
          <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
            <MessageCircle className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-600">
              Chưa có câu hỏi nào cho bài học này
            </p>
            <p className="text-[11px] text-slate-400">
              Hãy là người đầu tiên đặt câu hỏi để cùng thảo luận và học tập!
            </p>
          </div>
        ) : (
          questions.map((q) => {
            const isQTeacher = q.authorRole === 'TEACHER' || q.authorRole === 'ADMIN';
            const isQLiked = (q.likedBy || []).includes(currentUser.idUser);

            return (
              <div
                key={q.id}
                className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5 transition-all hover:border-slate-300"
              >
                {/* Question Author Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-full aspect-square flex items-center justify-center font-bold text-xs overflow-hidden shrink-0 ${
                        isQTeacher
                          ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {(q as any).authorAvatar ? (
                        <img
                          src={(q as any).authorAvatar}
                          alt={q.authorName}
                          className="w-full h-full object-cover rounded-full aspect-square"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        q.authorName ? q.authorName.charAt(0).toUpperCase() : 'U'
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900">{q.authorName}</span>
                        {isQTeacher ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-extrabold border border-blue-200">
                            <ShieldCheck className="w-3 h-3 text-blue-600" />
                            Giáo viên
                          </span>
                        ) : (
                          q.authorClass && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {q.authorClass}
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {q.createdAt}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleLikeQuestion(q.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                      isQLiked
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <ThumbsUp className={`w-3.5 h-3.5 ${isQLiked ? 'text-blue-600 fill-blue-600' : ''}`} />
                    <span>{q.likes}</span>
                  </button>
                </div>

                {/* Question Content */}
                <p className="text-xs text-slate-800 leading-relaxed font-medium pl-10">
                  {q.content}
                </p>

                {/* Answers List */}
                {q.answers.length > 0 && (
                  <div className="pl-6 sm:pl-10 space-y-2.5 pt-2 border-t border-slate-100">
                    {q.answers.map((ans) => {
                      const isATeacher = ans.authorRole === 'TEACHER' || ans.authorRole === 'ADMIN';
                      const isALiked = (ans.likedBy || []).includes(currentUser.idUser);

                      return (
                        <div
                          key={ans.id}
                          className={`p-3 rounded-xl border space-y-2 ${
                            isATeacher
                              ? 'bg-blue-50/70 border-blue-200/90 shadow-2xs'
                              : 'bg-slate-50 border-slate-200/70'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CornerDownRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <div
                                className={`w-6 h-6 rounded-full aspect-square flex items-center justify-center font-bold text-[10px] overflow-hidden shrink-0 ${
                                  isATeacher
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-indigo-100 text-indigo-800'
                                }`}
                              >
                                {(ans as any).authorAvatar ? (
                                  <img
                                    src={(ans as any).authorAvatar}
                                    alt={ans.authorName}
                                    className="w-full h-full object-cover rounded-full aspect-square"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  ans.authorName ? ans.authorName.charAt(0).toUpperCase() : 'A'
                                )}
                              </div>
                              <span className="font-bold text-xs text-slate-900">
                                {ans.authorName}
                              </span>
                              {isATeacher && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-bold">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Trả lời chính thức
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">
                                {ans.createdAt}
                              </span>
                            </div>

                            <button
                              onClick={() => handleLikeAnswer(q.id, ans.id)}
                              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 border cursor-pointer ${
                                isALiked
                                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <ThumbsUp className={`w-3 h-3 ${isALiked ? 'text-blue-600 fill-blue-600' : ''}`} />
                              <span>{ans.likes}</span>
                            </button>
                          </div>

                          <p className="text-xs text-slate-800 pl-6 leading-relaxed font-medium">
                            {ans.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply Toggle / Input Box */}
                <div className="pl-6 sm:pl-10 pt-1">
                  {isTeacher && !isCourseAuthor ? (
                    <div className="text-[11px] font-semibold text-slate-500 italic flex items-center gap-1.5 py-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Chỉ Giáo viên phụ trách khóa học ({course.authorName || 'tác giả'}) hoặc Quản trị viên mới có quyền giải đáp câu hỏi này.
                      </span>
                    </div>
                  ) : activeReplyId === q.id ? (
                    <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <textarea
                        rows={2}
                        value={replyTextMap[q.id] || ''}
                        onChange={(e) => setReplyTextMap({ ...replyTextMap, [q.id]: e.target.value })}
                        placeholder="Nhập câu trả lời hoặc thảo luận..."
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none font-medium"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveReplyId(null)}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCreateAnswer(q.id)}
                          disabled={!replyTextMap[q.id]?.trim()}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>Trả lời</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setActiveReplyId(q.id)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <CornerDownRight className="w-3.5 h-3.5" />
                      <span>Trả lời câu hỏi này</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
