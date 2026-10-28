import React, { useState, useMemo } from 'react';
import { Course, User } from '../types';
import {
  Trophy,
  Crown,
  Medal,
  Award,
  Search,
  BookOpen,
  Sparkles,
  Clock,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  UserCheck,
  LayoutGrid,
  Table,
  Filter,
  Leaf,
  FlaskConical,
  Star,
  Flame,
  ChevronDown,
  GraduationCap,
  Sparkle,
} from 'lucide-react';
import {
  getStoredAccounts,
  getStoredCertificates,
  getStoredQuizStatus,
  getStoredProgress,
  AccountItem,
} from '../lib/storage';

interface StudentLeaderboardViewProps {
  currentUser: User;
  courses: Course[];
  userProgress?: Record<string, any>;
  quizStatus?: Record<string, any>;
  registeredIds?: string[];
  onStartLearning?: (courseId: string) => void;
}

export const StudentLeaderboardView: React.FC<StudentLeaderboardViewProps> = ({
  currentUser,
  courses,
  userProgress = {},
  quizStatus = {},
  registeredIds = [],
  onStartLearning,
}) => {
  // View mode: 'CARDS' (Dạng 1 - Thẻ màu sắc) | 'PODIUM_TABLE' (Dạng 2 - Bục & Bảng chi tiết)
  const [viewMode, setViewMode] = useState<'CARDS' | 'PODIUM_TABLE'>('CARDS');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [accountsState, setAccountsState] = useState<{ teachers: AccountItem[]; students: AccountItem[] }>(() => getStoredAccounts());
  const [dataVersion, setDataVersion] = useState<number>(0);

  React.useEffect(() => {
    const refreshAccounts = async () => {
      try {
        const res = await fetch('/api/accounts');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.students) && Array.isArray(data.teachers)) {
            setAccountsState({ teachers: data.teachers, students: data.students });
            return;
          }
        }
      } catch {}
      setAccountsState(getStoredAccounts());
    };

    refreshAccounts();

    const handleDataChanged = () => {
      refreshAccounts();
      setDataVersion((v) => v + 1);
    };

    window.addEventListener('accounts-updated', handleDataChanged);
    window.addEventListener('courses-updated', handleDataChanged);
    window.addEventListener('lms-progress-updated', handleDataChanged);
    window.addEventListener('lms-quiz-updated', handleDataChanged);
    window.addEventListener('enrollments-updated', handleDataChanged);

    return () => {
      window.removeEventListener('accounts-updated', handleDataChanged);
      window.removeEventListener('courses-updated', handleDataChanged);
      window.removeEventListener('lms-progress-updated', handleDataChanged);
      window.removeEventListener('lms-quiz-updated', handleDataChanged);
      window.removeEventListener('enrollments-updated', handleDataChanged);
    };
  }, []);

  const cleanUser = String(currentUser.idUser || '').trim().toLowerCase();
  const isTeacherOrAdmin = currentUser.role === 'TEACHER' || currentUser.role === 'ADMIN';

  // Compute leaderboard ranking based on selected course filter
  const { fullLeaderboard, userRankIndex, myRankData, activeCourseTitle } = useMemo(() => {
    const allStudents = accountsState.students || [];
    const allCerts = getStoredCertificates();
    const allQuiz = getStoredQuizStatus();

    const inScopeCourses =
      selectedCourseFilter === 'ALL'
        ? courses
        : courses.filter((c) => c.courseId === selectedCourseFilter);

    const foundCourse =
      selectedCourseFilter !== 'ALL'
        ? courses.find((c) => c.courseId === selectedCourseFilter)
        : null;

    // Collect all candidate students
    const candidateMap = new Map<string, { idUser: string; hoTen: string; chiDoan: string }>();

    allStudents.forEach((s) => {
      candidateMap.set(s.idUser.toLowerCase().trim(), {
        idUser: s.idUser,
        hoTen: s.hoTen || s.idUser,
        chiDoan: s.chiDoan || 'Chưa phân lớp',
      });
    });

    if (currentUser && !isTeacherOrAdmin && !candidateMap.has(cleanUser)) {
      candidateMap.set(cleanUser, {
        idUser: currentUser.idUser,
        hoTen: currentUser.hoTen || currentUser.idUser,
        chiDoan: currentUser.chiDoan || '12A1',
      });
    }

    const allProgressMap = getStoredProgress();

    const leaderboardItems = Array.from(candidateMap.values()).map((s) => {
      const sClean = s.idUser.toLowerCase().trim();
      const sProg = sClean === cleanUser ? userProgress : (allProgressMap[s.idUser] || allProgressMap[sClean] || {});
      const sQuiz = allQuiz[s.idUser] || allQuiz[sClean] || {};

      let completedLessons = 0;
      let totalLessonsInScope = 0;
      let totalWatchedSec = 0;
      const scores: number[] = [];

      inScopeCourses.forEach((c) => {
        const cProg = sProg[c.courseId] || {};
        const cQuiz = sQuiz[c.courseId];
        const numLessons = (c.lessons || []).length;
        totalLessonsInScope += numLessons;

        (c.lessons || []).forEach((l, idx) => {
          const lProg = cProg[`LESSON_${idx}`] || cProg[l.lessonId];
          if (lProg) {
            const wSec = Number(lProg.watchedSec || 0);
            totalWatchedSec += wSec;
            if (lProg.isCompleted || lProg.completed || wSec >= (l.durationSec || 60)) {
              completedLessons++;
            }
          }
        });

        if (cQuiz) {
          const score = typeof cQuiz === 'number' ? cQuiz : Number(cQuiz.lastScore || cQuiz.firstScore || 0);
          if (score > 0) scores.push(score);
        }
      });

      const certsCount = allCerts.filter((cert: any) => {
        const u = String(cert.idUser || '').trim().toLowerCase();
        const matchesUser = u === sClean || u === s.idUser.toLowerCase();
        if (!matchesUser) return false;
        if (selectedCourseFilter !== 'ALL') {
          return cert.courseId === selectedCourseFilter;
        }
        return true;
      }).length;

      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

      const totalStudyMins = Math.round(totalWatchedSec / 60);

      // Base points calculation purely from actual progress
      const points =
        selectedCourseFilter === 'ALL'
          ? completedLessons * 25 + certsCount * 120 + Math.round(totalWatchedSec / 45) + (avgScore > 0 ? avgScore * 2 : 0)
          : completedLessons * 25 + certsCount * 120 + Math.round(totalWatchedSec / 45) + (avgScore > 0 ? avgScore * 2 : 0);

      return {
        idUser: s.idUser,
        hoTen: s.hoTen,
        chiDoan: s.chiDoan,
        avatar: (s as any).avatar || (s as any).avatarUrl || '',
        completedLessons,
        totalLessonsInScope,
        certsCount,
        avgScore,
        totalStudyMins,
        points,
        isCurrentUser: sClean === cleanUser,
      };
    });

    leaderboardItems.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      if (b.completedLessons !== a.completedLessons) return b.completedLessons - a.completedLessons;
      return a.hoTen.localeCompare(b.hoTen);
    });

    const currentRankIdx = leaderboardItems.findIndex((item) => item.isCurrentUser);
    const myData =
      currentRankIdx >= 0
        ? leaderboardItems[currentRankIdx]
        : leaderboardItems[0] || {
            idUser: currentUser.idUser,
            hoTen: currentUser.hoTen || currentUser.idUser,
            chiDoan: currentUser.chiDoan || '10A1',
            completedLessons: 0,
            totalLessonsInScope: inScopeCourses.reduce((acc, c) => acc + (c.lessons || []).length, 0),
            certsCount: 0,
            avgScore: 0,
            totalStudyMins: 0,
            points: 0,
            isCurrentUser: false,
          };

    return {
      fullLeaderboard: leaderboardItems,
      userRankIndex: currentRankIdx >= 0 ? currentRankIdx + 1 : 1,
      myRankData: myData,
      activeCourseTitle: foundCourse ? foundCourse.title : 'Tất cả Khóa học',
    };
  }, [cleanUser, currentUser, courses, selectedCourseFilter, userProgress, isTeacherOrAdmin, accountsState, dataVersion]);

  const filteredLeaderboard = useMemo(() => {
    if (!searchTerm.trim()) return fullLeaderboard;
    const term = searchTerm.toLowerCase().trim();
    return fullLeaderboard.filter(
      (item) =>
        item.hoTen.toLowerCase().includes(term) ||
        item.chiDoan.toLowerCase().includes(term) ||
        item.idUser.toLowerCase().includes(term)
    );
  }, [fullLeaderboard, searchTerm]);

  // Top 3 Podium
  const top1 = fullLeaderboard[0] || null;
  const top2 = fullLeaderboard[1] || null;
  const top3 = fullLeaderboard[2] || null;

  // Helper for color styles in View 1 (Card View)
  const getCardStyle = (rank: number) => {
    if (rank === 1) {
      return {
        bg: 'bg-[#FBD44C] hover:bg-[#FACC15]',
        text: 'text-slate-900',
        icon: <Crown className="w-5 h-5 text-amber-900 shrink-0" />,
        avatarBg: 'bg-white text-slate-900',
        scoreColor: 'text-slate-950',
      };
    }
    if (rank === 2) {
      return {
        bg: 'bg-[#7BE0CA] hover:bg-[#63D8C0]',
        text: 'text-slate-900',
        icon: <Leaf className="w-5 h-5 text-teal-900 shrink-0" />,
        avatarBg: 'bg-white text-slate-900',
        scoreColor: 'text-slate-950',
      };
    }
    if (rank === 3) {
      return {
        bg: 'bg-[#D3C7F5] hover:bg-[#C5B5F2]',
        text: 'text-slate-900',
        icon: <Sparkles className="w-5 h-5 text-purple-900 shrink-0" />,
        avatarBg: 'bg-white text-slate-900',
        scoreColor: 'text-slate-950',
      };
    }
    if (rank === 4) {
      return {
        bg: 'bg-[#7DD3FC] hover:bg-[#38BDF8]',
        text: 'text-slate-900',
        icon: <FlaskConical className="w-5 h-5 text-sky-900 shrink-0" />,
        avatarBg: 'bg-white text-slate-900',
        scoreColor: 'text-slate-950',
      };
    }
    if (rank === 5) {
      return {
        bg: 'bg-[#FBCFE8] hover:bg-[#F472B6]',
        text: 'text-slate-900',
        icon: <Star className="w-5 h-5 text-pink-900 shrink-0" />,
        avatarBg: 'bg-white text-slate-900',
        scoreColor: 'text-slate-950',
      };
    }
    if (rank === 6) {
      return {
        bg: 'bg-[#FED7AA] hover:bg-[#FB923C]',
        text: 'text-slate-900',
        icon: <Flame className="w-5 h-5 text-orange-900 shrink-0" />,
        avatarBg: 'bg-white text-slate-900',
        scoreColor: 'text-slate-950',
      };
    }
    return {
      bg: 'bg-slate-100 hover:bg-slate-200/90',
      text: 'text-slate-800',
      icon: <Award className="w-5 h-5 text-slate-600 shrink-0" />,
      avatarBg: 'bg-white text-slate-700',
      scoreColor: 'text-slate-900',
    };
  };

  const getInitialLetter = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return 'A';
    const last = parts[parts.length - 1];
    return last.charAt(0).toUpperCase() || 'A';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Top Header Banner with exact 65px target height, uppercase gradient title, specialized icon & no subtitle */}
      <div className="bg-white rounded-2xl sm:rounded-3xl min-h-[65px] px-4 sm:px-6 py-2 border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Specialized gradient icon badge */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
            <Trophy className="w-5 h-5 text-white drop-shadow-xs" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider bg-gradient-to-r from-[#0B4D9C] via-blue-600 to-amber-500 bg-clip-text text-transparent leading-none">
              BẢNG XẾP HẠNG
            </h2>
          </div>
        </div>

        {/* Top Right Controls: View Switcher & Course Filter */}
        <div className="flex flex-wrap items-center gap-2.5 self-stretch sm:self-auto">
          {/* 2 View Modes Toggle */}
          <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                viewMode === 'CARDS'
                  ? 'bg-white text-[#0B4D9C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Dạng 1: Thẻ xếp hạng màu sắc"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Dạng thẻ màu</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('PODIUM_TABLE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                viewMode === 'PODIUM_TABLE'
                  ? 'bg-white text-[#0B4D9C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Dạng 2: Bục vinh danh & Bảng chi tiết"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Dạng bục & bảng</span>
            </button>
          </div>

          {/* Filter by Course selector */}
          <div className="relative">
            <div className="flex items-center gap-1.5 bg-white px-3.5 py-1.5 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-300">
              <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedCourseFilter}
                onChange={(e) => setSelectedCourseFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-4 appearance-none"
              >
                <option value="ALL">Tất cả Khóa học</option>
                {courses.map((c) => (
                  <option key={c.courseId} value={c.courseId}>
                    {c.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none -ml-3" />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DẠNG 1: THẺ XẾP HẠNG MÀU SẮC (Ảnh 1) */}
      {/* ========================================================================= */}
      {viewMode === 'CARDS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Blue Highlight Header Card ("VỊ TRÍ CỦA BẠN" hoặc "HỌC SINH DẪN ĐẦU") */}
          <div className="bg-[#1D4ED8] rounded-3xl p-4 sm:p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {/* Yellow Square Badge */}
              <div className="w-12 h-12 rounded-2xl bg-[#F59E0B] text-slate-950 flex items-center justify-center font-black text-xl shadow-inner shrink-0">
                #{userRankIndex}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-white/90">
                    {isTeacherOrAdmin ? 'HỌC SINH DẪN ĐẦU' : 'VỊ TRÍ CỦA BẠN'}
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/20 text-white">
                    {myRankData.chiDoan || '10A1'}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white mt-0.5">
                  {myRankData.hoTen || currentUser.hoTen || currentUser.idUser}
                </h3>
              </div>
            </div>

            {/* Right dark blue metrics box */}
            <div className="bg-[#1E40AF]/90 border border-white/10 rounded-2xl px-5 py-2.5 flex items-center justify-around sm:justify-end gap-5 sm:gap-7 self-stretch md:self-auto">
              <div className="text-center">
                <p className="text-[10px] uppercase font-bold text-white/70 tracking-wider">
                  ĐIỂM THI ĐUA
                </p>
                <p className="text-lg sm:text-xl font-black text-[#FDE047] mt-0.5">
                  {myRankData.points}
                </p>
              </div>
              <div className="w-px h-7 bg-white/15" />
              <div className="text-center">
                <p className="text-[10px] uppercase font-bold text-white/70 tracking-wider">
                  BÀI HOÀN THÀNH
                </p>
                <p className="text-lg sm:text-xl font-black text-white mt-0.5">
                  {myRankData.completedLessons} bài
                </p>
              </div>
              <div className="w-px h-7 bg-white/15" />
              <div className="text-center">
                <p className="text-[10px] uppercase font-bold text-white/70 tracking-wider">
                  THỜI GIAN HỌC
                </p>
                <p className="text-lg sm:text-xl font-black text-[#86EFAC] mt-0.5">
                  {myRankData.totalStudyMins}p
                </p>
              </div>
            </div>
          </div>

          {/* Search bar inside Card View */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Tìm kiếm theo tên học sinh, chi đoàn..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          {/* List of Colorful Ranking Cards matching reference Image 1 */}
          <div className="space-y-3 pt-1">
            {filteredLeaderboard.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center text-slate-500 border border-slate-200">
                <Trophy className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-bold text-sm">Chưa tìm thấy học sinh nào phù hợp bộ lọc.</p>
              </div>
            ) : (
              filteredLeaderboard.map((student, idx) => {
                const rank = idx + 1;
                const style = getCardStyle(rank);
                const initial = getInitialLetter(student.hoTen);

                return (
                  <div
                    key={student.idUser}
                    className={`${style.bg} ${style.text} rounded-2xl sm:rounded-3xl p-3 sm:p-4 transition-all duration-200 flex items-center justify-between gap-3 shadow-xs hover:shadow-md hover:scale-[1.008] cursor-default`}
                  >
                    {/* Left: Icon + Avatar + Student Name & Class */}
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      {/* Rank Icon */}
                      <div className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center shrink-0">
                        {style.icon}
                      </div>

                      {/* Avatar Circle with Photo or Initial */}
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full aspect-square ${style.avatarBg} flex items-center justify-center font-black text-sm sm:text-base shadow-xs shrink-0 overflow-hidden ring-1 ring-black/10`}
                      >
                        {student.avatar ? (
                          <img
                            src={student.avatar}
                            alt={student.hoTen}
                            className="w-full h-full object-cover rounded-full aspect-square"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          initial
                        )}
                      </div>

                      {/* Name & Class */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-sm sm:text-base truncate tracking-tight">
                            {student.hoTen}
                          </h4>
                          {student.isCurrentUser && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-900 text-white">
                              Bạn
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs font-bold opacity-80 truncate">
                          {student.chiDoan} • {student.completedLessons} bài hoàn thành
                        </p>
                      </div>
                    </div>

                    {/* Right: Big Score and "ĐIỂM" label */}
                    <div className="text-right shrink-0 pr-2 sm:pr-4">
                      <div className={`text-xl sm:text-2xl font-black ${style.scoreColor} leading-none`}>
                        {student.points}
                      </div>
                      <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider opacity-75 mt-0.5">
                        ĐIỂM
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DẠNG 2: BỤC VINH DANH TOP 3 & BẢNG CHI TIẾT (Ảnh 2) */}
      {/* ========================================================================= */}
      {viewMode === 'PODIUM_TABLE' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top 3 Podium (Rank 2 Silver on left, Rank 1 Gold center elevated, Rank 3 Bronze on right) */}
          {!searchTerm && (top1 || top2 || top3) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-3 pb-1">
              {/* Top 2: Silver */}
              {top2 ? (
                <div className="order-2 md:order-1 bg-slate-50/80 border-2 border-slate-200 p-5 rounded-3xl shadow-sm text-center relative flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-slate-300 text-slate-700 font-extrabold text-xs flex items-center justify-center absolute -top-4 shadow-sm">
                    2
                  </div>
                  <Medal className="w-8 h-8 text-slate-400 mb-1 mt-1" />
                  <div className="font-bold text-slate-900 text-sm line-clamp-1">{top2.hoTen}</div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-3">{top2.chiDoan}</div>
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 w-full space-y-0.5">
                    <div className="text-base font-black text-slate-800">{top2.points} điểm thi đua</div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {top2.completedLessons} bài • ĐTB: {top2.avgScore}đ
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hidden md:block order-2" />
              )}

              {/* Top 1: Gold (Elevated & Golden Border) */}
              {top1 && (
                <div className="order-1 md:order-2 bg-gradient-to-b from-amber-50/70 to-yellow-100/80 border-2 border-amber-400 p-6 rounded-3xl shadow-md text-center relative flex flex-col items-center md:scale-105 z-10">
                  <div className="w-10 h-10 rounded-full bg-amber-400 text-amber-950 font-black text-sm flex items-center justify-center absolute -top-5 shadow-md border-2 border-amber-200">
                    1
                  </div>
                  <Trophy className="w-10 h-10 text-amber-500 mb-1 mt-1" />
                  <div className="font-black text-amber-950 text-base line-clamp-1">{top1.hoTen}</div>
                  <div className="text-xs text-amber-800 font-bold mb-3">{top1.chiDoan}</div>
                  <div className="bg-white border border-amber-300 rounded-2xl px-4 py-2.5 w-full space-y-0.5 shadow-2xs">
                    <div className="text-lg font-black text-amber-600">{top1.points} điểm thi đua</div>
                    <div className="text-[11px] text-amber-900 font-medium">
                      {top1.completedLessons} bài hoàn thành • ĐTB: {top1.avgScore}đ
                    </div>
                  </div>
                </div>
              )}

              {/* Top 3: Bronze */}
              {top3 ? (
                <div className="order-3 bg-amber-50/30 border-2 border-amber-600/30 p-5 rounded-3xl shadow-sm text-center relative flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-amber-600 text-white font-extrabold text-xs flex items-center justify-center absolute -top-4 shadow-sm">
                    3
                  </div>
                  <Award className="w-8 h-8 text-amber-700 mb-1 mt-1" />
                  <div className="font-bold text-slate-900 text-sm line-clamp-1">{top3.hoTen}</div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-3">{top3.chiDoan}</div>
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 w-full space-y-0.5">
                    <div className="text-base font-black text-slate-800">{top3.points} điểm thi đua</div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {top3.completedLessons} bài • ĐTB: {top3.avgScore}đ
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hidden md:block order-3" />
              )}
            </div>
          )}

          {/* Quy tắc xếp hạng thi đua (Rules Banner) matching Image 2 */}
          <div className="bg-[#FFFBEB] border border-amber-200 rounded-2xl px-5 py-3 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <HelpCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Quy tắc xếp hạng thi đua:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-medium text-slate-700">
              <span className="bg-white px-3 py-1 rounded-xl border border-amber-200 shadow-2xs font-semibold">
                <strong>Bài học hoàn thành:</strong> +25 điểm/bài
              </span>
              <span className="bg-white px-3 py-1 rounded-xl border border-amber-200 shadow-2xs font-semibold">
                <strong>Chứng chỉ đạt:</strong> +120 điểm
              </span>
              <span className="bg-white px-3 py-1 rounded-xl border border-amber-200 shadow-2xs font-semibold">
                <strong>Điểm bài thi:</strong> Nhân hệ số 2
              </span>
            </div>
          </div>

          {/* DANH SÁCH CHI TIẾT XẾP HẠNG (Table with Search) matching Image 2 */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-800 text-sm sm:text-base flex items-center gap-2">
                <span>DANH SÁCH CHI TIẾT XẾP HẠNG</span>
                <span className="text-xs font-normal text-slate-500">
                  ({filteredLeaderboard.length} học sinh)
                </span>
              </h3>

              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo tên học sinh, lớp..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-extrabold text-[11px]">
                    <th className="py-3 px-4 w-16 text-center">HẠNG</th>
                    <th className="py-3 px-4">HỌC SINH</th>
                    <th className="py-3 px-4">LỚP</th>
                    <th className="py-3 px-4 text-center">TIẾN ĐỘ BÀI HỌC</th>
                    <th className="py-3 px-4 text-center">ĐTB BÀI THI</th>
                    <th className="py-3 px-4 text-center">THỜI GIAN HỌC</th>
                    <th className="py-3 px-4 text-right">ĐIỂM THI ĐUA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeaderboard.map((student, idx) => {
                    const rank = idx + 1;
                    return (
                      <tr
                        key={student.idUser}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          student.isCurrentUser ? 'bg-blue-50/70 font-semibold' : ''
                        }`}
                      >
                        {/* Rank Badge */}
                        <td className="py-3.5 px-4 text-center">
                          {rank === 1 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-xs">
                              1
                            </span>
                          ) : rank === 2 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-extrabold text-xs shadow-xs">
                              2
                            </span>
                          ) : rank === 3 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-600 text-white font-extrabold text-xs shadow-xs">
                              3
                            </span>
                          ) : (
                            <span className="text-slate-500 font-bold">#{rank}</span>
                          )}
                        </td>

                        {/* Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            {student.avatar ? (
                              <div className="w-6 h-6 rounded-full aspect-square overflow-hidden shrink-0 ring-1 ring-slate-200">
                                <img
                                  src={student.avatar}
                                  alt={student.hoTen}
                                  className="w-full h-full object-cover rounded-full aspect-square"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            ) : null}
                            <span
                              className={`font-bold ${
                                student.isCurrentUser ? 'text-blue-900' : 'text-slate-900'
                              }`}
                            >
                              {student.hoTen}
                            </span>
                            {student.isCurrentUser && (
                              <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-[#0B4D9C] font-extrabold text-[10px]">
                                Bạn
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Class */}
                        <td className="py-3.5 px-4 text-slate-600 font-bold">
                          {student.chiDoan}
                        </td>

                        {/* Lessons */}
                        <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                          {selectedCourseFilter !== 'ALL' && student.totalLessonsInScope > 0 ? (
                            <span>
                              {student.completedLessons}/{student.totalLessonsInScope} bài hoàn thành{' '}
                              <span className="text-[11px] font-medium text-slate-500">
                                ({Math.round((student.completedLessons / student.totalLessonsInScope) * 100)}%)
                              </span>
                            </span>
                          ) : (
                            <span>{student.completedLessons} bài hoàn thành</span>
                          )}
                        </td>

                        {/* Test score */}
                        <td className="py-3.5 px-4 text-center font-extrabold text-emerald-600">
                          {student.avgScore}đ
                        </td>

                        {/* Study time */}
                        <td className="py-3.5 px-4 text-center text-slate-600 font-medium">
                          {student.totalStudyMins} phút
                        </td>

                        {/* Points */}
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-black text-amber-600 text-sm">
                            {student.points} pts
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
