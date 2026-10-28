import React, { useState } from 'react';
import { Course, User } from '../types';
import { X, UserCircle, BookOpen, CheckCircle2, Circle, Award, PlayCircle, FileCheck2, Lock, Clock, Trophy, Video, ExternalLink } from 'lucide-react';
import { getCourseTimeStatus, formatDateTimeDisplay, getTimeRemainingText } from '../lib/courseTime';
import { LeaderboardModal } from './LeaderboardModal';

interface CourseDetailModalProps {
  isOpen: boolean;
  course: Course | null;
  registeredIds: string[];
  userProgress: Record<string, any>;
  quizStatus: Record<string, any>;
  currentUser: User | null;
  onClose: () => void;
  onStartLearning: (courseId: string) => void;
  onEnroll: (courseId: string, title: string) => void;
}

export const CourseDetailModal: React.FC<CourseDetailModalProps> = ({
  isOpen,
  course,
  registeredIds,
  userProgress,
  quizStatus,
  currentUser,
  onClose,
  onStartLearning,
  onEnroll,
}) => {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  if (!isOpen || !course) return null;

  const isEnrolled = registeredIds.includes(course.courseId);
  const progress = userProgress[course.courseId] || {};
  const qStatus = quizStatus[course.courseId] || { attempts: 0, lastScore: 0 };
  const quizConfig = course.quizConfig || {};
  const passingScore = Number(quizConfig.passingScore || 80);
  const hasResult = Number(qStatus.attempts || 0) > 0;
  const isPassed = hasResult && Number(qStatus.lastScore || 0) >= passingScore;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-5 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-blue-200" />
            <h3 className="font-bold text-lg line-clamp-1">{course.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="flex items-center gap-2 text-slate-600 text-sm">
            <UserCircle className="w-4 h-4 text-blue-600" />
            <span>Giáo viên hướng dẫn:</span>
            <strong className="text-blue-700 font-bold">{course.authorName || 'Giáo viên'}</strong>
          </div>

          {/* Course Time Information */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
            <div className="flex items-center justify-between font-bold text-slate-800 border-b border-slate-200 pb-2">
              <span className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                Thời gian diễn ra khóa học
              </span>
              {getCourseTimeStatus(course) === 'NOT_STARTED' && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold text-[11px] border border-amber-300">
                  Sắp mở ({getTimeRemainingText(course.startDate)})
                </span>
              )}
              {getCourseTimeStatus(course) === 'ACTIVE' && (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-bold text-[11px] border border-emerald-300">
                  Đang diễn ra
                </span>
              )}
              {getCourseTimeStatus(course) === 'ENDED' && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-bold text-[11px] border border-slate-300">
                  Đã kết thúc
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200/90 flex flex-col justify-center">
                <span className="text-[11px] font-semibold text-slate-500 mb-0.5">
                  Thời gian bắt đầu:
                </span>
                <span className="font-bold text-slate-900 text-xs sm:text-sm">
                  {course.startDate ? formatDateTimeDisplay(course.startDate) : 'Không giới hạn (Mở tự do)'}
                </span>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200/90 flex flex-col justify-center">
                <span className="text-[11px] font-semibold text-slate-500 mb-0.5">
                  Thời gian kết thúc:
                </span>
                <span className="font-bold text-slate-900 text-xs sm:text-sm">
                  {course.endDate ? formatDateTimeDisplay(course.endDate) : 'Không giới hạn (Mở vĩnh viễn)'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
            <h4 className="font-bold text-slate-800 text-sm mb-1">Mô tả khóa học</h4>
            <p className="text-slate-600 text-sm leading-relaxed">
              {course.description || 'Chưa có mô tả.'}
            </p>
          </div>

          {course.onlineMeetingConfig?.enabled !== false && course.onlineMeetingConfig?.meetingUrl && (
            <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl space-y-2 text-slate-800 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                  <Video className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    {!course.onlineMeetingConfig.title || course.onlineMeetingConfig.title === 'Link tham gia'
                      ? 'Phòng Học Trực Tuyến (Online Class)'
                      : course.onlineMeetingConfig.title}
                  </span>
                </div>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 font-bold text-[10px] rounded-full border border-blue-200/80 uppercase tracking-wider shrink-0">
                  {course.onlineMeetingConfig.platform === 'google_meet'
                    ? 'GOOGLE MEET'
                    : course.onlineMeetingConfig.platform === 'ms_teams'
                    ? 'MICROSOFT TEAMS'
                    : course.onlineMeetingConfig.platform === 'zoom'
                    ? 'ZOOM'
                    : 'LINK TRỰC TUYẾN'}
                </span>
              </div>

              <div className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                <span className="shrink-0">📌</span>
                <div>
                  <strong className="text-slate-800 font-semibold">Lịch học:</strong>{' '}
                  <span>
                    {course.onlineMeetingConfig.scheduleTime || 'Theo lịch dặn dò của giáo viên bộ môn'}
                  </span>
                </div>
              </div>

              {course.onlineMeetingConfig.note && (
                <div className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                  <span className="shrink-0">💡</span>
                  <div>
                    <strong className="text-slate-800 font-semibold">Ghi chú:</strong>{' '}
                    <span>{course.onlineMeetingConfig.note}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              Nội dung các bài học ({course.lessons.length} bài)
            </h4>

            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {course.lessons.map((l, idx) => {
                const pObj = progress[`LESSON_${idx}`] || { watchedSec: 0 };
                const reqSec = (l.duration || 1) >= 30 ? (l.duration || 1) : (l.duration || 1) * 60;
                const isDone = pObj.isCompleted || (pObj.watchedSec && pObj.watchedSec >= reqSec);
                const ex = l.exerciseConfig || {};
                const exProg = progress[`LESSON_EXERCISE_${idx}`] || { attempts: 0, lastScore: 0, passed: false };

                return (
                  <li key={idx} className="p-3.5 bg-white hover:bg-slate-50/80 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800">
                        <strong className="text-blue-700 me-1">Bài {idx + 1}:</strong> {l.title}
                      </span>
                      {isDone ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Đã học
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                          <Circle className="w-3.5 h-3.5 text-slate-400" />
                          Chưa học
                        </span>
                      )}
                    </div>
                    {ex.enabled && (
                      <div className="mt-1.5 ms-4 text-xs flex items-center gap-1.5">
                        <FileCheck2 className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-slate-600">Bài tập củng cố:</span>
                        {exProg.passed ? (
                          <strong className="text-emerald-600 font-bold">Đạt ({exProg.lastScore || 0} điểm)</strong>
                        ) : exProg.attempts > 0 ? (
                          <strong className="text-rose-600 font-bold">Chưa đạt ({exProg.lastScore || 0} điểm)</strong>
                        ) : (
                          <span className="text-slate-400">Chưa làm</span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}

              {quizConfig.enabled !== false && (
                <li className="p-3.5 bg-slate-50 flex items-center justify-between gap-3 font-semibold text-sm">
                  <span className="flex items-center gap-2 text-rose-700 font-bold">
                    <Award className="w-4 h-4 text-rose-600" />
                    Bài kiểm tra cuối khóa
                  </span>
                  {isPassed ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      ĐẠT - {qStatus.lastScore} điểm
                    </span>
                  ) : hasResult ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                      <X className="w-3.5 h-3.5" />
                      CHƯA ĐẠT - {qStatus.lastScore} điểm
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      CHƯA THI
                    </span>
                  )}
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {currentUser ? (
            <button
              onClick={() => setLeaderboardOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-amber-100" />
              Xem bảng xếp hạng
            </button>
          ) : (
            <div className="hidden sm:block" />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              Đóng
            </button>
            {isEnrolled ? (
              getCourseTimeStatus(course) === 'NOT_STARTED' && !(currentUser?.role === 'ADMIN' || currentUser?.role === 'TEACHER') ? (
                <button
                  onClick={() => {
                    alert(`Khóa học chưa đến thời gian mở!\nThời gian mở: ${formatDateTimeDisplay(course.startDate)}`);
                  }}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Clock className="w-4 h-4" />
                  Khóa học chưa mở
                </button>
              ) : (
                <button
                  onClick={() => {
                    onClose();
                    onStartLearning(course.courseId);
                  }}
                  className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <PlayCircle className="w-4 h-4" />
                  {getCourseTimeStatus(course) === 'ENDED' ? 'Xem lại bài học' : 'Vào học ngay'}
                </button>
              )
            ) : (
              <button
                onClick={() => {
                  onEnroll(course.courseId, course.title);
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <FileCheck2 className="w-4 h-4" />
                Đăng ký khóa học
              </button>
            )}
          </div>
        </div>
      </div>

      <LeaderboardModal
        isOpen={leaderboardOpen}
        course={course}
        currentUser={currentUser}
        onClose={() => setLeaderboardOpen(false)}
      />
    </div>
  );
};
