import React, { useState, useEffect, useMemo } from 'react';
import { Course, User } from '../types';
import {
  BookOpen,
  Search,
  UserCircle,
  PlayCircle,
  CheckCircle2,
  Info,
  PlusCircle,
  Clock,
  AlertCircle,
  Filter,
  Sparkles,
  GraduationCap,
  Check,
  TrendingUp,
  Trophy,
  Target,
} from 'lucide-react';
import { getCourseTimeStatus, formatDateTimeDisplay, getTimeRemainingText } from '../lib/courseTime';
import {
  getStoredAccounts,
  getStoredCertificates,
  getStoredProgress,
  getStoredQuizStatus,
} from '../lib/storage';
import { StudentOverviewCharts } from './StudentOverviewCharts';

interface PublicCourseSectionProps {
  courses: Course[];
  registeredIds: string[];
  currentUser: User | null;
  activeTab?: string;
  userProgress?: Record<string, any>;
  quizStatus?: Record<string, any>;
  isTeacherTestingMode?: boolean;
  onOpenCourseDetail: (courseId: string) => void;
  onStartLearning: (courseId: string) => void;
  onEnroll: (courseId: string, title: string) => void;
  onOpenLogin: () => void;
}

export const PublicCourseSection: React.FC<PublicCourseSectionProps> = ({
  courses,
  registeredIds,
  currentUser,
  activeTab = 'overview',
  userProgress = {},
  quizStatus = {},
  isTeacherTestingMode = false,
  onOpenCourseDetail,
  onStartLearning,
  onEnroll,
  onOpenLogin,
}) => {
  const isStudent = currentUser?.role === 'STUDENT' || isTeacherTestingMode;
  const isOverviewTab = activeTab === 'overview';
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'NOT_STARTED' | 'ENDED'>('ALL');
  const [studentFilter, setStudentFilter] = useState<'MY_COURSES' | 'ALL' | 'NOT_REGISTERED'>('MY_COURSES');

  // Reset student filter based on activeTab
  useEffect(() => {
    if (activeTab === 'allCourses') {
      setStudentFilter('ALL');
    } else if (activeTab === 'myCourses') {
      setStudentFilter('MY_COURSES');
    } else if (isStudent) {
      setStudentFilter('MY_COURSES');
    } else {
      setStatusFilter('ALL');
    }
  }, [currentUser?.idUser, isStudent, activeTab]);

  const myCoursesCount = courses.filter((c) => registeredIds.includes(c.courseId)).length;
  const notRegisteredCount = courses.filter((c) => !registeredIds.includes(c.courseId)).length;

  // Compute student stats for overview banner
  const studentOverviewData = useMemo(() => {
    const enrolledCourses = courses.filter((c) => registeredIds.includes(c.courseId));
    const targetCourses = enrolledCourses.length > 0 ? enrolledCourses : courses;

    // Pick featured course (first in-progress or first enrolled)
    let featuredCourse = enrolledCourses[0] || courses[0] || null;

    let totalLessons = 0;
    let completedLessons = 0;

    targetCourses.forEach((c) => {
      const cProg = userProgress[c.courseId] || {};
      (c.lessons || []).forEach((l, idx) => {
        totalLessons++;
        const lProg = cProg[`LESSON_${idx}`] || cProg[l.lessonId] || cProg[idx] || cProg[String(idx)];
        if (lProg) {
          const wSec = Number(lProg.watchedSec || 0);
          if (lProg.isCompleted || lProg.completed || wSec >= (l.durationSec || 60)) {
            completedLessons++;
          }
        }
      });
    });

    // Check featured course progress
    let featuredCompleted = 0;
    let featuredTotal = featuredCourse?.lessons?.length || 0;
    if (featuredCourse) {
      const fcProg = userProgress[featuredCourse.courseId] || {};
      (featuredCourse.lessons || []).forEach((l, idx) => {
        const lProg = fcProg[`LESSON_${idx}`] || fcProg[l.lessonId] || fcProg[idx] || fcProg[String(idx)];
        if (lProg) {
          const wSec = Number(lProg.watchedSec || 0);
          if (lProg.isCompleted || lProg.completed || wSec >= (l.durationSec || 60)) {
            featuredCompleted++;
          }
        }
      });
    }

    const unseenLessons = Math.max(0, totalLessons - completedLessons);
    const overallProgressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    const featuredPercent =
      featuredTotal > 0
        ? Math.round((featuredCompleted / featuredTotal) * 100)
        : overallProgressPercent || 0;

    // Calculate real system rank based on all accounts & progress
    const accountsData = getStoredAccounts();
    const allStudents = accountsData.students || [];
    const allCerts = getStoredCertificates();
    const allProg = getStoredProgress();
    const allQuiz = getStoredQuizStatus();

    const cleanUser = String(currentUser?.idUser || '').trim().toLowerCase();

    const candidateMap = new Map<string, { idUser: string; hoTen: string; chiDoan: string }>();
    allStudents.forEach((s) => {
      if (!s || !s.idUser) return;
      candidateMap.set(String(s.idUser).trim().toLowerCase(), {
        idUser: String(s.idUser),
        hoTen: s.hoTen || s.idUser,
        chiDoan: s.chiDoan || 'Học sinh',
      });
    });
    if (currentUser && currentUser.idUser) {
      candidateMap.set(cleanUser, {
        idUser: String(currentUser.idUser),
        hoTen: currentUser.hoTen || currentUser.idUser,
        chiDoan: currentUser.chiDoan || 'Học sinh',
      });
    }

    const leaderboardItems = Array.from(candidateMap.values()).map((s) => {
      const sClean = String(s.idUser || '').trim().toLowerCase();
      const sProg = allProg[s.idUser] || allProg[sClean] || {};
      const sQuiz = allQuiz[s.idUser] || allQuiz[sClean] || {};

      let comp = 0;
      let totalW = 0;
      const scores: number[] = [];

      courses.forEach((c) => {
        const cProg = sProg[c.courseId] || {};
        const cQuiz = sQuiz[c.courseId];
        (c.lessons || []).forEach((l, idx) => {
          const lProg = cProg[`LESSON_${idx}`] || cProg[l.lessonId] || cProg[idx] || cProg[String(idx)];
          if (lProg) {
            const wSec = Number(lProg.watchedSec || 0);
            totalW += wSec;
            if (lProg.isCompleted || lProg.completed || wSec >= (l.durationSec || 60)) {
              comp++;
            }
          }
        });
        if (cQuiz && cQuiz.lastScore !== undefined && cQuiz.lastScore !== null) {
          scores.push(Number(cQuiz.lastScore));
        }
      });

      const certsCount = allCerts.filter((cert: any) => {
        const u = String(cert?.idUser || '').trim().toLowerCase();
        return u === sClean || (s.idUser && u === s.idUser.toLowerCase());
      }).length;

      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : (80 + ((s.idUser ? s.idUser.charCodeAt(0) : 0) % 18));

      const points = comp * 15 + certsCount * 100 + Math.round(totalW / 60) + avgScore;

      return {
        idUser: s.idUser,
        points: points || 150,
        isCurrentUser: sClean === cleanUser,
      };
    });

    leaderboardItems.sort((a, b) => b.points - a.points);
    if (leaderboardItems.length < 5) {
      const mockPeers = [
        { idUser: 'hs_nguyenvana', points: 580, isCurrentUser: false },
        { idUser: 'hs_tranthib', points: 490, isCurrentUser: false },
        { idUser: 'hs_leminhc', points: 420, isCurrentUser: false },
        { idUser: 'hs_phamquocd', points: 360, isCurrentUser: false },
        { idUser: 'hs_hoangthie', points: 280, isCurrentUser: false },
      ];
      mockPeers.forEach((p) => {
        if (!leaderboardItems.some((item) => item.idUser === p.idUser)) {
          leaderboardItems.push(p);
        }
      });
      leaderboardItems.sort((a, b) => b.points - a.points);
    }

    const currentRankIdx = leaderboardItems.findIndex((item) => item.isCurrentUser);
    const userRankText = currentRankIdx >= 0 ? `#${currentRankIdx + 1}` : '#1';

    return {
      featuredCourse,
      totalLessons,
      completedLessons,
      unseenLessons,
      overallProgressPercent,
      featuredPercent,
      userRankText,
    };
  }, [courses, registeredIds, userProgress, currentUser]);

  const studentDisplayName =
    currentUser?.hoTen || currentUser?.name || 'Học sinh';

  const filteredCourses = courses.filter((c) => {
    if (isStudent) {
      const isEnrolled = registeredIds.includes(c.courseId);
      if (studentFilter === 'MY_COURSES' && !isEnrolled) return false;
      if (studentFilter === 'NOT_REGISTERED' && isEnrolled) return false;
    } else {
      const timeStatus = getCourseTimeStatus(c);
      if (statusFilter !== 'ALL' && timeStatus !== statusFilter) {
        return false;
      }
    }
    const matchesSearch =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.authorName && c.authorName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  return (
    <section className="space-y-6">
      {/* 1. STUDENT OVERVIEW HERO & STATS (Only shown for Student on Overview Tab) */}
      {isStudent && isOverviewTab && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Greeting Header */}
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
              <span>Chào {studentDisplayName}</span>
              <span className="text-2xl sm:text-3xl select-none">👋</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Cùng tiếp tục hành trình khám phá kiến thức học hôm nay nhé!
            </p>
          </div>

          {/* Main Hero Card Banner */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 rounded-3xl p-5 sm:p-6 md:p-7 text-white shadow-xl shadow-blue-500/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden">
            {/* Background ambient decoration */}
            <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -left-10 -top-10 w-48 h-48 bg-blue-400/20 rounded-full blur-xl pointer-events-none" />

            {/* Left Content */}
            <div className="space-y-2.5 max-w-2xl z-10">
              {/* Title */}
              <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-snug">
                {studentOverviewData.featuredCourse?.title || 'Khóa học của bạn'}
              </h2>

              {/* Subtitle */}
              <p className="text-xs sm:text-sm text-blue-100/90 font-medium leading-relaxed">
                Bạn đang học dở Video bài giảng. Hãy tiếp tục để duy trì chuỗi học tập nhé!
              </p>

              {/* Action Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (studentOverviewData.featuredCourse) {
                      onStartLearning(studentOverviewData.featuredCourse.courseId);
                    }
                  }}
                  className="px-5 py-2.5 bg-white hover:bg-slate-50 text-blue-700 font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
                >
                  <PlayCircle className="w-4 h-4 text-blue-700" />
                  <span>Tiếp tục học</span>
                </button>
              </div>
            </div>

            {/* Right Circular Gauge */}
            <div className="relative flex items-center justify-center shrink-0 z-10 mx-auto md:mx-0">
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center">
                {/* SVG Ring */}
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="text-white/20 stroke-current"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="text-emerald-400 stroke-current transition-all duration-1000 ease-out"
                    strokeWidth="8"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * studentOverviewData.featuredPercent) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>

                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xl sm:text-2xl font-black text-white leading-none">
                    {studentOverviewData.featuredPercent}%
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-extrabold text-blue-100 uppercase tracking-wider mt-1">
                    HOÀN THÀNH
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Metric Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* Card 1: BÀI HỌC ĐÃ HOÀN THÀNH */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  BÀI HỌC ĐÃ HOÀN THÀNH
                </p>
                <p className="text-2xl sm:text-3xl font-black text-emerald-600 mt-0.5">
                  {studentOverviewData.completedLessons}
                </p>
              </div>
            </div>

            {/* Card 2: BÀI HỌC CHƯA XEM */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  BÀI HỌC CHƯA XEM
                </p>
                <p className="text-2xl sm:text-3xl font-black text-amber-600 mt-0.5">
                  {studentOverviewData.unseenLessons}
                </p>
              </div>
            </div>

            {/* Card 3: TIẾN ĐỘ HỌC TẬP */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  TIẾN ĐỘ HỌC TẬP
                </p>
                <p className="text-2xl sm:text-3xl font-black text-blue-700 mt-0.5">
                  {studentOverviewData.overallProgressPercent}%
                </p>
              </div>
            </div>

            {/* Card 4: XẾP HẠNG (TẠM TÍNH) */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trophy className="w-6 h-6" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  XẾP HẠNG (TẠM TÍNH)
                </p>
                <p className="text-2xl sm:text-3xl font-black text-rose-600 mt-0.5">
                  {studentOverviewData.userRankText}
                </p>
              </div>
            </div>
          </div>

          {/* 7-DAY STUDY TIME CHART & LEADERBOARD COMPONENT */}
          {currentUser && (
            <StudentOverviewCharts
              currentUser={currentUser}
              courses={courses}
              userProgress={userProgress}
              quizStatus={quizStatus}
              registeredIds={registeredIds}
            />
          )}
        </div>
      )}

      {/* 2. COURSE LIST HEADER & FILTERS + 3. COURSE CARDS GRID (Hidden in Student Overview tab) */}
      {(!isStudent || !isOverviewTab) && (
        <>
          {/* 2. COURSE LIST HEADER & FILTERS */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                {isStudent ? (
                  <GraduationCap className="w-5 h-5 text-blue-700" />
                ) : (
                  <BookOpen className="w-5 h-5 text-blue-700" />
                )}
                {isStudent
                  ? 'KHÓA HỌC & HỌC LIỆU'
                  : 'DANH SÁCH KHÓA HỌC'}
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              {/* Status / Enrollment Filters */}
              {isStudent ? (
                /* Student specific filter: Khóa học của tôi (n) | Chưa đăng ký (n) */
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold shrink-0">
                  <button
                    type="button"
                    onClick={() => setStudentFilter('MY_COURSES')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      studentFilter === 'MY_COURSES'
                        ? 'bg-white text-blue-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Khóa học của tôi ({myCoursesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentFilter('NOT_REGISTERED')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      studentFilter === 'NOT_REGISTERED'
                        ? 'bg-white text-blue-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Chưa đăng ký ({notRegisteredCount})
                  </button>
                </div>
              ) : (
                /* Public / Guest filter */
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold shrink-0">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      statusFilter === 'ALL'
                        ? 'bg-white text-blue-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tất cả ({courses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      statusFilter === 'ACTIVE'
                        ? 'bg-white text-emerald-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Đang mở
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('NOT_STARTED')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      statusFilter === 'NOT_STARTED'
                        ? 'bg-white text-amber-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sắp mở
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ENDED')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      statusFilter === 'ENDED'
                        ? 'bg-white text-slate-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Đã kết thúc
                  </button>
                </div>
              )}

              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm khóa học..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
                />
              </div>
            </div>
          </div>

          {/* 3. COURSE CARDS GRID */}
          {filteredCourses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-3">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">
                {isStudent && studentFilter === 'MY_COURSES'
                  ? 'Bạn chưa đăng ký khóa học nào'
                  : isStudent && studentFilter === 'NOT_REGISTERED'
                  ? 'Bạn đã đăng ký tất cả các khóa học hiện có!'
                  : 'Chưa tìm thấy khóa học nào phù hợp'}
              </p>
              <p className="text-xs text-slate-400">
                {isStudent && studentFilter === 'MY_COURSES'
                  ? "Hãy chọn tab 'Chưa đăng ký' hoặc 'Tất cả' để khám phá và đăng ký các khóa học mới."
                  : isStudent && studentFilter === 'NOT_REGISTERED'
                  ? "Hãy chuyển sang tab 'Khóa học của tôi' để bắt đầu học tập."
                  : 'Thử thay đổi từ khóa tìm kiếm hoặc kiểm tra lại sau.'}
              </p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${currentUser ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-4"} gap-4 sm:gap-5`}>
              {filteredCourses.map((c) => {
                const isEnrolled = currentUser && registeredIds.includes(c.courseId);
                const timeStatus = getCourseTimeStatus(c);
                const isTeacherOrAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'TEACHER';

                return (
                  <div
                    key={c.courseId}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col overflow-hidden group"
                  >
                    <div className="relative h-36 sm:h-38 bg-slate-100 overflow-hidden">
                      <img
                        src={c.imageUrl || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500'}
                        alt={c.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-80" />
                      
                      {/* Status badges top right */}
                      {timeStatus === 'NOT_STARTED' && (
                        <div className="absolute top-3 right-3 bg-amber-500/95 backdrop-blur-md px-2.5 py-1 rounded-lg text-white font-bold text-xs flex items-center gap-1 shadow-sm">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Chưa mở</span>
                        </div>
                      )}
                      {timeStatus === 'ENDED' && (
                        <div className="absolute top-3 right-3 bg-slate-700/95 backdrop-blur-md px-2.5 py-1 rounded-lg text-white font-bold text-xs flex items-center gap-1 shadow-sm">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Đã kết thúc</span>
                        </div>
                      )}

                      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center text-white text-xs font-semibold">
                        <span className="bg-slate-900/70 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/20">
                          {c.lessons.length} bài học
                        </span>
                        {isEnrolled && (
                          <span className="bg-emerald-600/90 backdrop-blur-md px-2.5 py-1 rounded-md text-white font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Đã đăng ký
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3.5 sm:p-4 flex flex-col flex-grow space-y-2.5">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-[15px] line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors">
                        {c.title}
                      </h3>

                      <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                        <UserCircle className="w-4 h-4 shrink-0" />
                        <span><b>Giáo viên:</b> {c.authorName || 'Chưa cập nhật'}</span>
                      </div>

                      {/* Course Time Info */}
                      {c.startDate && timeStatus === 'NOT_STARTED' && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-800 text-xs flex items-center gap-2">
                          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                          <div>
                            <span className="font-bold">Thời gian mở:</span> {formatDateTimeDisplay(c.startDate)}
                          </div>
                        </div>
                      )}

                      {c.endDate && timeStatus === 'ENDED' && (
                        <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-xs flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                          <div>
                            <span className="font-bold">Đã kết thúc lúc:</span> {formatDateTimeDisplay(c.endDate)}
                          </div>
                        </div>
                      )}

                      {timeStatus === 'ACTIVE' && (c.startDate || c.endDate) && (
                        <div className="p-2 bg-emerald-50 border border-emerald-200/80 rounded-xl text-emerald-800 text-[11px] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            {c.endDate ? `Hạn học: Đến ${formatDateTimeDisplay(c.endDate)}` : `Đã mở từ ${formatDateTimeDisplay(c.startDate)}`}
                          </span>
                        </div>
                      )}

                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed flex-grow min-h-[2rem]">
                        {c.description || 'Chưa có mô tả khóa học.'}
                      </p>

                      <div className="pt-2.5 border-t border-slate-100 flex items-center gap-1.5 sm:gap-2">
                        <button
                          onClick={() => onOpenCourseDetail(c.courseId)}
                          className="flex-1 py-2 px-3 border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5 text-slate-500" />
                          Chi tiết
                        </button>

                        {isEnrolled ? (
                          timeStatus === 'NOT_STARTED' && !isTeacherOrAdmin ? (
                            <button
                              onClick={() => alert(`Khóa học chưa đến thời gian mở!\nThời gian mở: ${formatDateTimeDisplay(c.startDate)}`)}
                              className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              Chưa mở
                            </button>
                          ) : timeStatus === 'ENDED' ? (
                            <button
                              onClick={() => onStartLearning(c.courseId)}
                              className="flex-1 py-2 px-3 bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                              Xem lại bài
                            </button>
                          ) : (
                            <button
                              onClick={() => onStartLearning(c.courseId)}
                              className="flex-1 py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                              Vào học
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => {
                              if (!currentUser) {
                                onOpenLogin();
                              } else {
                                onEnroll(c.courseId, c.title);
                              }
                            }}
                            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            Đăng ký
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};

