import React, { useState, useEffect } from 'react';
import { Course, User } from '../types';
import { X, Trophy, Medal, Award, Clock, RotateCcw, Search, RefreshCw, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { formatDurationSec } from '../lib/storage';

export interface LeaderboardItem {
  rank?: number;
  idUser: string;
  hoTen: string;
  chiDoan: string;
  quizScore: number | null;
  durationSec?: number;
  quizAttempts: number;
  completedLessons: number;
  totalLessons: number;
  status: string;
}

interface LeaderboardModalProps {
  isOpen: boolean;
  course: Course | null;
  currentUser?: User | null;
  onClose: () => void;
}

export function sortLeaderboardItems(items: LeaderboardItem[]): LeaderboardItem[] {
  const sorted = [...items].sort((a, b) => {
    const aHasScore = a.quizScore !== null && a.quizScore !== undefined;
    const bHasScore = b.quizScore !== null && b.quizScore !== undefined;

    if (aHasScore && !bHasScore) return -1;
    if (!aHasScore && bHasScore) return 1;
    if (!aHasScore && !bHasScore) {
      if (b.completedLessons !== a.completedLessons) {
        return b.completedLessons - a.completedLessons;
      }
      return (a.hoTen || '').localeCompare(b.hoTen || '');
    }

    // Tiêu chí 1: Điểm số (Ưu tiên cao nhất)
    const scoreA = Number(a.quizScore) || 0;
    const scoreB = Number(b.quizScore) || 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    // Tiêu chí 2: Thời gian làm bài (Xét khi điểm bằng nhau, ít thời gian hơn xếp trên)
    const durA = a.durationSec && a.durationSec > 0 ? a.durationSec : 999999;
    const durB = b.durationSec && b.durationSec > 0 ? b.durationSec : 999999;
    if (durA !== durB) {
      return durA - durB;
    }

    // Tiêu chí 3: Số lần làm bài (Xét khi điểm và thời gian bằng nhau, ít số lần thử hơn xếp trên)
    const attA = a.quizAttempts || 99;
    const attB = b.quizAttempts || 99;
    if (attA !== attB) {
      return attA - attB;
    }

    return (a.hoTen || '').localeCompare(b.hoTen || '');
  });

  return sorted.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  course,
  currentUser,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [rawStudents, setRawStudents] = useState<LeaderboardItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [passingScore, setPassingScore] = useState(80);

  const fetchLeaderboardData = async () => {
    if (!course?.courseId) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/leaderboard/${course.courseId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.students)) {
          setRawStudents(data.students);
          if (data.passingScore !== undefined) {
            setPassingScore(data.passingScore);
          }
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Leaderboard API unavailable, falling back to local calculation');
    }

    // Fallback: try teacher stats endpoint or local data
    try {
      const res = await fetch(`/api/teacher/stats/${course.courseId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.students)) {
          setRawStudents(data.students);
          if (data.passingScore !== undefined) {
            setPassingScore(data.passingScore);
          }
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Teacher stats API also unavailable');
    }

    setLoading(false);
  };

  useEffect(() => {
    if (isOpen && course) {
      fetchLeaderboardData();
    }
  }, [isOpen, course?.courseId]);

  if (!isOpen || !course) return null;

  const sortedList = sortLeaderboardItems(rawStudents);

  const filteredList = sortedList.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (item.hoTen || '').toLowerCase().includes(term) ||
      (item.chiDoan || '').toLowerCase().includes(term) ||
      (item.idUser || '').toLowerCase().includes(term)
    );
  });

  // Top 3 Podium
  const top1 = sortedList[0] && sortedList[0].quizScore !== null ? sortedList[0] : null;
  const top2 = sortedList[1] && sortedList[1].quizScore !== null ? sortedList[1] : null;
  const top3 = sortedList[2] && sortedList[2].quizScore !== null ? sortedList[2] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[min(92vh,560px)] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <Trophy className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg leading-tight flex items-center gap-2">
                BẢNG XẾP HẠNG KHÓA HỌC
              </h3>
              <p className="text-[11px] text-amber-100 font-medium line-clamp-1">
                {course.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-xl transition-colors cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Criteria Explanation Banner */}
        <div className="bg-amber-50/80 border-b border-amber-200/80 px-4 py-2 text-xs text-amber-900 shrink-0">
          <div className="font-bold flex items-center gap-1.5 mb-1 text-amber-950 text-[11px]">
            <HelpCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            Quy tắc xếp hạng (Xét ưu tiên theo 3 tiêu chí):
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 text-[10px] font-medium pt-0.5">
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-amber-200 shadow-2xs">
              <span className="font-extrabold text-amber-700 shrink-0">1.</span>
              <span><strong>Điểm số:</strong> Cao nhất xếp trên</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-amber-200 shadow-2xs">
              <span className="font-extrabold text-amber-700 shrink-0">2.</span>
              <span><strong>Thời gian thi:</strong> Nhanh hơn xếp trên</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-amber-200 shadow-2xs">
              <span className="font-extrabold text-amber-700 shrink-0">3.</span>
              <span><strong>Số lần thi:</strong> Ít thử hơn xếp trên</span>
            </div>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên học viên, lớp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <button
            onClick={fetchLeaderboardData}
            disabled={loading}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`} />
            Làm mới
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3.5 sm:p-4 space-y-4 overflow-y-auto flex-1">
          {/* Top 3 Podium Cards */}
          {(top1 || top2 || top3) && !searchTerm && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3 items-end pt-1 pb-1">
              {/* Rank 2 (Silver) */}
              {top2 ? (
                <div className="order-2 md:order-1 bg-gradient-to-b from-slate-50 to-slate-100 border border-slate-300 p-3 rounded-xl shadow-xs text-center relative flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-slate-200 border border-slate-400 text-slate-700 font-extrabold text-xs flex items-center justify-center absolute -top-3 shadow-2xs">
                    2
                  </div>
                  <Medal className="w-6 h-6 text-slate-400 mb-0.5 mt-0.5" />
                  <div className="font-bold text-slate-900 text-xs line-clamp-1">{top2.hoTen}</div>
                  <div className="text-[10px] text-slate-500 font-semibold mb-1.5">{top2.chiDoan}</div>
                  <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 w-full space-y-0.5">
                    <div className="text-xs font-black text-slate-800">{top2.quizScore} điểm</div>
                    <div className="text-[9px] text-slate-500 flex items-center justify-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                      {formatDurationSec(top2.durationSec)} ({top2.quizAttempts || 1} lần)
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hidden md:block order-2"></div>
              )}

              {/* Rank 1 (Gold) */}
              {top1 && (
                <div className="order-1 md:order-2 bg-gradient-to-b from-amber-50 to-amber-100/90 border-2 border-amber-400 p-3.5 rounded-xl shadow-sm text-center relative flex flex-col items-center scale-102 z-10">
                  <div className="w-7 h-7 rounded-full bg-amber-400 text-amber-950 font-black text-xs flex items-center justify-center absolute -top-3.5 shadow-xs border border-amber-200">
                    1
                  </div>
                  <Trophy className="w-7 h-7 text-amber-500 mb-0.5 mt-0.5" />
                  <div className="font-extrabold text-amber-950 text-xs sm:text-sm line-clamp-1">{top1.hoTen}</div>
                  <div className="text-[10px] text-amber-800 font-bold mb-1.5">{top1.chiDoan}</div>
                  <div className="bg-white border border-amber-200/80 rounded-lg px-2.5 py-1 w-full space-y-0.5 shadow-2xs">
                    <div className="text-sm font-black text-amber-600">{top1.quizScore} điểm</div>
                    <div className="text-[9px] text-amber-900 font-medium flex items-center justify-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-amber-600" />
                      {formatDurationSec(top1.durationSec)} ({top1.quizAttempts || 1} lần thi)
                    </div>
                  </div>
                </div>
              )}

              {/* Rank 3 (Bronze) */}
              {top3 ? (
                <div className="order-3 bg-gradient-to-b from-amber-50/50 to-orange-100/60 border border-amber-600/40 p-3 rounded-xl shadow-xs text-center relative flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-amber-600 text-white font-extrabold text-xs flex items-center justify-center absolute -top-3 shadow-2xs">
                    3
                  </div>
                  <Award className="w-6 h-6 text-amber-700 mb-0.5 mt-0.5" />
                  <div className="font-bold text-slate-900 text-xs line-clamp-1">{top3.hoTen}</div>
                  <div className="text-[10px] text-slate-500 font-semibold mb-1.5">{top3.chiDoan}</div>
                  <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 w-full space-y-0.5">
                    <div className="text-xs font-black text-slate-800">{top3.quizScore} điểm</div>
                    <div className="text-[9px] text-slate-500 flex items-center justify-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                      {formatDurationSec(top3.durationSec)} ({top3.quizAttempts || 1} lần)
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hidden md:block order-3"></div>
              )}
            </div>
          )}

          {/* Full Table */}
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-600" />
              Đang tải dữ liệu bảng xếp hạng...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <Trophy className="w-10 h-10 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-700">Chưa có học viên nào tham gia hoặc có kết quả thi</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-3 px-3 text-center w-14">Hạng</th>
                      <th className="py-3 px-3">Họ và Tên</th>
                      <th className="py-3 px-3">Lớp / Chi đoàn</th>
                      <th className="py-3 px-3 text-center">Điểm Thi</th>
                      <th className="py-3 px-3 text-center">Thời Gian Thi</th>
                      <th className="py-3 px-3 text-center">Số Lần Thi</th>
                      <th className="py-3 px-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredList.map((st) => {
                      const isCurrentUser = currentUser && (
                        String(currentUser.idUser).toLowerCase() === String(st.idUser).toLowerCase() ||
                        (currentUser.hoTen && currentUser.hoTen === st.hoTen)
                      );

                      let rankBadge = <span className="font-bold text-slate-600">#{st.rank}</span>;
                      if (st.rank === 1) {
                        rankBadge = (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-xs">
                            1
                          </span>
                        );
                      } else if (st.rank === 2) {
                        rankBadge = (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-slate-800 font-extrabold text-xs shadow-xs">
                            2
                          </span>
                        );
                      } else if (st.rank === 3) {
                        rankBadge = (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-600 text-white font-extrabold text-xs shadow-xs">
                            3
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={st.idUser}
                          className={`hover:bg-amber-50/40 transition-colors ${
                            isCurrentUser ? 'bg-amber-50/80 font-semibold' : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-bold">{rankBadge}</td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {st.hoTen}
                              {isCurrentUser && (
                                <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                                  Bạn
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-medium">{st.chiDoan}</td>
                          <td className="py-3 px-3 text-center">
                            {st.quizScore !== null ? (
                              <span className="font-black text-blue-700 text-sm">
                                {st.quizScore}đ
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Chưa thi</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {st.quizScore !== null ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {formatDurationSec(st.durationSec)}
                              </span>
                            ) : (
                              <span className="text-slate-400">--</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {st.quizScore !== null ? (
                              <span className="font-semibold text-slate-700">
                                {st.quizAttempts || 1} lần
                              </span>
                            ) : (
                              <span className="text-slate-400">--</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {st.status === 'ĐẠT' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3" /> ĐẠT
                              </span>
                            ) : st.status === 'CHƯA ĐẠT' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg text-[11px] font-bold border border-rose-300">
                                <AlertCircle className="w-3 h-3" /> CHƯA ĐẠT
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium border border-slate-200">
                                Đang học
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
