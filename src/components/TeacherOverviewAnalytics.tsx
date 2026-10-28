import React, { useState, useMemo } from 'react';
import { User, Course } from '../types';
import {
  Trophy,
  TrendingUp,
  BarChart2,
  PieChart as PieIcon,
  Award,
  Users,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Flame,
  ArrowUpRight,
  BookOpen,
  Sparkles,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import {
  getStoredAccounts,
  getStoredProgress,
  getStoredQuizStatus,
  getStoredCertificates,
  getStoredEnrollments,
  getStoredDailyStudyLog,
  AccountItem,
} from '../lib/storage';

interface TeacherOverviewAnalyticsProps {
  currentUser: User;
  courses: Course[];
  onOpenCourseDetail?: (courseId: string) => void;
}

export const TeacherOverviewAnalytics: React.FC<TeacherOverviewAnalyticsProps> = ({
  currentUser,
  courses,
  onOpenCourseDetail,
}) => {
  const isAdmin = currentUser.role === 'ADMIN';
  const [leaderboardSearch, setLeaderboardSearch] = useState<string>('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('ALL');
  const [accountsState, setAccountsState] = useState<{ teachers: AccountItem[]; students: AccountItem[] }>(() => getStoredAccounts());
  const [dataVersion, setDataVersion] = useState<number>(0);

  // Load and refresh accounts from server and listen to system mutation events
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

  // Courses managed by this teacher (or all for admin)
  const targetCourses = useMemo(() => {
    if (isAdmin) return courses;
    const authorId = String(currentUser.idUser || '').trim().toLowerCase();
    const authorName = String(currentUser.hoTen || currentUser.fullName || '').trim().toLowerCase();
    return courses.filter((c) => {
      const cAuthor = String(c.authorId || '').trim().toLowerCase();
      const cName = String(c.authorName || '').trim().toLowerCase();
      return (authorId && cAuthor === authorId) || (authorName && cName && (cName === authorName || cName.includes(authorName)));
    });
  }, [courses, currentUser, isAdmin]);

  const effectiveCourses = isAdmin ? courses : (targetCourses.length > 0 ? targetCourses : courses);
  const effectiveCourseIds = useMemo(() => new Set(effectiveCourses.map((c) => String(c.courseId))), [effectiveCourses]);

  // 1. Data calculations strictly from real database/storage records
  const {
    courseCompletionData,
    scoreDistributionData,
    weeklyActivityData,
    allStudentRecords,
    totalQuizzesSubmitted,
    totalCompletedLessonsSystem,
    totalScoresCount,
  } = useMemo(() => {
    const allStudents = accountsState.students || [];
    const allProg = getStoredProgress();
    const allQuiz = getStoredQuizStatus();
    const allCerts = getStoredCertificates();
    const allEnroll = getStoredEnrollments();
    const dailyLogs = getStoredDailyStudyLog();

    // 1. Course Completion & Enrollment Chart Data
    const courseCompList = effectiveCourses.map((c) => {
      const numLessons = (c.lessons || []).length;
      let enrolledCount = 0;
      let completedCount = 0;
      const scores: number[] = [];

      allStudents.forEach((student) => {
        const sId = String(student.idUser).trim().toLowerCase();
        const rawId = String(student.idUser).trim();
        const sProg = (allProg[rawId] && allProg[rawId][c.courseId]) ||
          (allProg[sId] && allProg[sId][c.courseId]) || {};
        const sQuiz = (allQuiz[rawId] && allQuiz[rawId][c.courseId]) ||
          (allQuiz[sId] && allQuiz[sId][c.courseId]);

        // Check enrollment
        const userEnrolledList = allEnroll[rawId] || allEnroll[sId] || [];
        const isEnrolled = userEnrolledList.includes(c.courseId) || Object.keys(sProg).length > 0 || !!sQuiz;

        if (isEnrolled) {
          enrolledCount++;
        }

        // Check completion
        let doneLessons = 0;
        (c.lessons || []).forEach((l, idx) => {
          const lProg = sProg[`LESSON_${idx}`] || sProg[l.lessonId];
          if (lProg && (lProg.isCompleted || lProg.completed || (lProg.watchedSec && lProg.watchedSec >= (l.durationSec || 60)))) {
            doneLessons++;
          }
        });

        if (numLessons > 0 && doneLessons === numLessons) {
          completedCount++;
        }

        if (sQuiz && sQuiz.lastScore !== undefined && sQuiz.lastScore !== null) {
          const sc = Number(sQuiz.lastScore);
          if (!isNaN(sc) && sc >= 0) {
            scores.push(sc > 10 ? sc / 10 : sc);
          }
        }
      });

      const avgCourseScore10 = scores.length > 0
        ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
        : 0;

      const rate = enrolledCount > 0 ? Math.round((completedCount / enrolledCount) * 100) : 0;

      // Truncate course title for chart axis
      const shortTitle = c.title.length > 18 ? c.title.substring(0, 16) + '...' : c.title;

      return {
        courseId: c.courseId,
        fullTitle: c.title,
        name: shortTitle,
        'Đã đăng ký': enrolledCount,
        'Đã hoàn thành': completedCount,
        avgScore: avgCourseScore10,
        rate,
      };
    });

    // 2. Score Distribution (Phân bố điểm thi trắc nghiệm thực tế)
    let countXuatSac = 0; // 9 - 10
    let countGioi = 0;    // 8 - 8.9
    let countKha = 0;     // 6.5 - 7.9
    let countTrungBinh = 0; // 5.0 - 6.4
    let countYeu = 0;     // < 5.0
    let realScoresCount = 0;

    Object.values(allQuiz).forEach((userMap) => {
      if (userMap && typeof userMap === 'object') {
        Object.entries(userMap).forEach(([cId, item]: [string, any]) => {
          if (effectiveCourseIds.has(String(cId))) {
            if (item && item.lastScore !== undefined && item.lastScore !== null) {
              const sc = Number(item.lastScore);
              if (!isNaN(sc)) {
                realScoresCount++;
                const score10 = sc > 10 ? sc / 10 : sc;

                if (score10 >= 9.0) countXuatSac++;
                else if (score10 >= 8.0) countGioi++;
                else if (score10 >= 6.5) countKha++;
                else if (score10 >= 5.0) countTrungBinh++;
                else countYeu++;
              }
            }
          }
        });
      }
    });

    const scoreDistList = [
      {
        name: 'Xuất sắc (9-10đ)',
        value: countXuatSac,
        color: '#10B981',
        percentage: realScoresCount > 0 ? Math.round((countXuatSac / realScoresCount) * 100) : 0,
      },
      {
        name: 'Giỏi (8-8.9đ)',
        value: countGioi,
        color: '#0B4D9C',
        percentage: realScoresCount > 0 ? Math.round((countGioi / realScoresCount) * 100) : 0,
      },
      {
        name: 'Khá (6.5-7.9đ)',
        value: countKha,
        color: '#F59E0B',
        percentage: realScoresCount > 0 ? Math.round((countKha / realScoresCount) * 100) : 0,
      },
      {
        name: 'Trung bình (5-6.4đ)',
        value: countTrungBinh,
        color: '#6366F1',
        percentage: realScoresCount > 0 ? Math.round((countTrungBinh / realScoresCount) * 100) : 0,
      },
      {
        name: 'Cần cố gắng (<5đ)',
        value: countYeu,
        color: '#EF4444',
        percentage: realScoresCount > 0 ? Math.round((countYeu / realScoresCount) * 100) : 0,
      },
    ];

    // 3. Weekly Learning Activity (7 ngày qua thực tế)
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const now = new Date();
    const weeklyList: { day: string; fullDate: string; 'Lượt học': number; 'Bài nộp': number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const isoDate = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      const label = i === 0 ? 'Hôm nay' : dayNames[dayOfWeek];
      const fullDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

      let dayStudySessions = 0;
      let dayQuizCount = 0;

      // Check dailyLogs
      Object.values(dailyLogs).forEach((uLog) => {
        if (uLog && uLog[isoDate]) {
          const secs = Number(uLog[isoDate]);
          if (secs > 0) {
            dayStudySessions += Math.max(1, Math.round(secs / 300));
          }
        }
      });

      // Check quiz submissions on this date if timestamp available
      Object.values(allQuiz).forEach((uMap) => {
        if (uMap && typeof uMap === 'object') {
          Object.entries(uMap).forEach(([cId, item]: [string, any]) => {
            if (effectiveCourseIds.has(String(cId))) {
              if (item?.updatedAt && String(item.updatedAt).startsWith(isoDate)) {
                dayQuizCount++;
              } else if (item?.lastScore !== undefined && i === 0) {
                // If today and no specific date, consider recent activity if not counted
              }
            }
          });
        }
      });

      weeklyList.push({
        day: label,
        fullDate,
        'Lượt học': dayStudySessions,
        'Bài nộp': dayQuizCount,
      });
    }

    // 4. Real student accounts (no fake or seeded students)
    const realStudents = [...allStudents];

    // 5. Total real completed lessons in scope
    let totalLessonsDone = 0;
    realStudents.forEach((student) => {
      const sId = String(student.idUser).trim().toLowerCase();
      const rawId = String(student.idUser).trim();
      const sProg = allProg[rawId] || allProg[sId] || {};
      effectiveCourses.forEach((c) => {
        const cProg = sProg[c.courseId] || {};
        (c.lessons || []).forEach((l, idx) => {
          const lProg = cProg[`LESSON_${idx}`] || cProg[l.lessonId];
          if (lProg && (lProg.isCompleted || lProg.completed || (lProg.watchedSec && lProg.watchedSec >= (l.durationSec || 60)))) {
            totalLessonsDone++;
          }
        });
      });
    });

    return {
      courseCompletionData: courseCompList,
      scoreDistributionData: scoreDistList,
      weeklyActivityData: weeklyList,
      allStudentRecords: realStudents,
      totalQuizzesSubmitted: realScoresCount,
      totalCompletedLessonsSystem: totalLessonsDone,
      totalScoresCount: realScoresCount,
    };
  }, [effectiveCourses, effectiveCourseIds, accountsState, dataVersion]);

  // 2. Compute dynamic leaderboard per course filter based 100% on real data
  const leaderboardData = useMemo(() => {
    const allProg = getStoredProgress();
    const allQuiz = getStoredQuizStatus();
    const allCerts = getStoredCertificates();

    // Determine relevant course subset
    const filteredCourses = selectedCourseFilter === 'ALL'
      ? effectiveCourses
      : effectiveCourses.filter((c) => c.courseId === selectedCourseFilter);

    const list = allStudentRecords.map((s) => {
      const sId = String(s.idUser).trim().toLowerCase();
      const rawId = String(s.idUser).trim();
      const sProg = allProg[rawId] || allProg[sId] || {};
      const sQuiz = allQuiz[rawId] || allQuiz[sId] || {};

      let completedLessons = 0;
      let totalLessonsInScope = 0;
      let totalStudySec = 0;
      const sScores: number[] = [];

      filteredCourses.forEach((c) => {
        const cProg = sProg[c.courseId] || {};
        const cQuiz = sQuiz[c.courseId];
        const numLessons = (c.lessons || []).length;
        totalLessonsInScope += numLessons;

        (c.lessons || []).forEach((l, idx) => {
          const lProg = cProg[`LESSON_${idx}`] || cProg[l.lessonId];
          if (lProg) {
            const wSec = Number(lProg.watchedSec || 0);
            totalStudySec += wSec;
            if (lProg.isCompleted || lProg.completed || wSec >= (l.durationSec || 60)) {
              completedLessons++;
            }
          }
        });

        if (cQuiz && cQuiz.lastScore !== undefined && cQuiz.lastScore !== null) {
          const sc = Number(cQuiz.lastScore);
          if (!isNaN(sc)) {
            sScores.push(sc > 10 ? sc / 10 : sc);
          }
        }
      });

      const certsCount = allCerts.filter((cert: any) => {
        const u = String(cert.idUser || '').trim().toLowerCase();
        const matchesUser = u === sId || u === rawId.toLowerCase();
        if (!matchesUser) return false;
        if (selectedCourseFilter !== 'ALL') {
          return cert.courseId === selectedCourseFilter;
        }
        return true;
      }).length;

      const avgScore10 = sScores.length > 0
        ? Number((sScores.reduce((a, b) => a + b, 0) / sScores.length).toFixed(1))
        : 0;

      const studyMins = Math.round(totalStudySec / 60);

      // Real points calculated purely from real accomplishments
      const points = completedLessons * 20 + certsCount * 100 + studyMins + Math.round(avgScore10 * 10);

      return {
        idUser: s.idUser,
        hoTen: s.hoTen || s.idUser,
        chiDoan: s.chiDoan || 'Chưa xếp lớp',
        completedLessons,
        totalLessonsInScope,
        certsCount,
        avgScore10,
        studyMins,
        points,
      };
    });

    list.sort((a, b) => b.points - a.points || b.completedLessons - a.completedLessons || b.avgScore10 - a.avgScore10);
    return list;
  }, [allStudentRecords, effectiveCourses, selectedCourseFilter, dataVersion]);

  // Filter leaderboard by search keyword
  const filteredLeaderboard = useMemo(() => {
    return leaderboardData.filter((s) => {
      if (leaderboardSearch) {
        const q = leaderboardSearch.toLowerCase();
        const matchesName = (s.hoTen || '').toLowerCase().includes(q);
        const matchesId = (s.idUser || '').toLowerCase().includes(q);
        const matchesClass = (s.chiDoan || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesClass) return false;
      }
      return true;
    });
  }, [leaderboardData, leaderboardSearch]);

  const activeCourseName = useMemo(() => {
    if (selectedCourseFilter === 'ALL') return 'Tất cả khóa học';
    const found = effectiveCourses.find((c) => c.courseId === selectedCourseFilter);
    return found ? found.title : 'Khóa học đã chọn';
  }, [effectiveCourses, selectedCourseFilter]);

  const hasActiveStudents = filteredLeaderboard.some((s) => s.points > 0 || s.completedLessons > 0 || s.avgScore10 > 0);

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
      {/* 1. TOP ANALYTICS HIGHLIGHT KPI TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* KPI 1: BÀI HỌC ĐÃ HOÀN THÀNH */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between hover:shadow-xs transition-shadow">
          <div className="space-y-0.5">
            <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              LƯỢT HOÀN THÀNH BÀI HỌC
            </p>
            <p className="text-xl sm:text-2xl font-black text-emerald-600">
              {totalCompletedLessonsSystem}
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
              Ghi nhận thực tế trên các khóa học phụ trách
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-2xs">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: BÀI KIỂM TRA ĐÃ NỘP */}
        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between hover:shadow-xs transition-shadow">
          <div className="space-y-0.5">
            <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              LƯỢT NỘP BÀI TRẮC NGHIỆM
            </p>
            <p className="text-xl sm:text-2xl font-black text-amber-600">
              {totalQuizzesSubmitted}
            </p>
            <p className="text-[10px] sm:text-[11px] text-amber-700 font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Chấm điểm và xếp hạng tự động</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100 shadow-2xs">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. CHARTS SECTION (2 COLUMNS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* CHART 1: TIẾN ĐỘ & TỶ LỆ HOÀN THÀNH THEO KHÓA HỌC */}
        <div className="bg-white rounded-2xl p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <BarChart2 className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-slate-900">
                  TIẾN ĐỘ & HOÀN THÀNH THEO KHÓA HỌC
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  So sánh số lượng học sinh đăng ký và đã hoàn thành
                </p>
              </div>
            </div>
          </div>

          {courseCompletionData.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-4 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
              <BookOpen className="w-8 h-8 text-slate-300 mb-1.5" />
              <p className="text-xs font-bold text-slate-600">Chưa có khóa học nào</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Tạo khóa học mới để bắt đầu theo dõi tiến độ</p>
            </div>
          ) : (
            <div className="h-48 sm:h-52 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={courseCompletionData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748B', fontSize: 10, fontWeight: 600 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xl text-xs border border-slate-700 space-y-1">
                            <p className="font-bold text-amber-300">{data.fullTitle}</p>
                            <p className="text-slate-200">
                              Đã đăng ký: <strong>{data['Đã đăng ký']} học sinh</strong>
                            </p>
                            <p className="text-emerald-400">
                              Đã hoàn thành: <strong>{data['Đã hoàn thành']} học sinh</strong> ({data.rate}%)
                            </p>
                            <p className="text-blue-300">
                              Điểm thi TB: <strong>{data.avgScore}/10</strong>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '8px', fontSize: '10px', fontWeight: 600 }}
                  />
                  <Bar dataKey="Đã đăng ký" fill="#93C5FD" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Đã hoàn thành" fill="#0B4D9C" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* CHART 2: PHÂN BỐ ĐIỂM THI TRẮC NGHIỆM */}
        <div className="bg-white rounded-2xl p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <PieIcon className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-slate-900">
                  PHÂN BỐ ĐIỂM THI TRẮC NGHIỆM
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Tỷ lệ học sinh đạt các thang điểm Xuất sắc, Giỏi, Khá, TB
                </p>
              </div>
            </div>
          </div>

          {totalScoresCount === 0 ? (
            <div className="h-48 w-full flex flex-col items-center justify-center text-center p-4 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
              <PieIcon className="w-8 h-8 text-slate-300 mb-1.5 stroke-[1.5]" />
              <p className="text-xs font-bold text-slate-600">Chưa có bài thi trắc nghiệm nào</p>
              <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs leading-relaxed">
                Biểu đồ phân bố điểm số sẽ hiển thị tự động ngay khi học sinh hoàn thành và nộp bài kiểm tra.
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <div className="h-48 w-full sm:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={scoreDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {scoreDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xl text-xs border border-slate-700">
                              <p className="font-bold" style={{ color: d.color }}>{d.name}</p>
                              <p className="text-slate-200 mt-0.5">
                                Số lượng: <strong>{d.value} bài ({d.percentage}%)</strong>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Custom Legend breakdown list */}
              <div className="w-full sm:w-1/2 space-y-1.5 text-xs">
                {scoreDistributionData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-1.5 px-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-semibold text-[11px] text-slate-700">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1 font-bold text-[11px]">
                      <span className="text-slate-900">{item.value} bài</span>
                      <span className="text-[10px] text-slate-400 font-normal">({item.percentage}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. CHART 3: HOẠT ĐỘNG HỌC TẬP VÀ NỘP BÀI TRONG TUẦN */}
      <div className="bg-white rounded-2xl p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-slate-900">
                XU HƯỚNG HOẠT ĐỘNG HỌC TẬP & NỘP BÀI (7 NGÀY QUA)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Biểu đồ đo lường mức độ chuyên cần và tương tác của học sinh qua các ngày
              </p>
            </div>
          </div>
        </div>

        <div className="h-48 sm:h-52 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={weeklyActivityData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0B4D9C" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0B4D9C" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorQuizzes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis
                dataKey="day"
                tick={{ fill: '#64748B', fontSize: 11, fontWeight: 600 }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xl text-xs border border-slate-700 space-y-1">
                        <p className="font-bold text-amber-300">
                          {d.day} ({d.fullDate})
                        </p>
                        <p className="text-blue-300">
                          Lượt học & xem bài: <strong>{d['Lượt học']} lượt</strong>
                        </p>
                        <p className="text-emerald-400">
                          Bài kiểm tra đã nộp: <strong>{d['Bài nộp']} bài</strong>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '8px', fontSize: '10px', fontWeight: 600 }} />
              <Area
                type="monotone"
                dataKey="Lượt học"
                stroke="#0B4D9C"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorViews)"
              />
              <Area
                type="monotone"
                dataKey="Bài nộp"
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorQuizzes)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. SECTION: BẢNG XẾP HẠNG HỌC VIÊN THEO KHÓA HỌC */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs space-y-4">
        {/* Leaderboard Header & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100/80 shadow-2xs">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                  BẢNG XẾP HẠNG HỌC VIÊN
                </h3>
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                  Thành tích thực tế
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Xếp hạng thành tích học tập theo từng khóa học hoặc toàn bộ hệ thống ({activeCourseName})
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Filter by Course */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase shrink-0 flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-blue-700" />
                KHÓA HỌC:
              </label>
              <select
                value={selectedCourseFilter}
                onChange={(e) => setSelectedCourseFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer max-w-[200px] truncate"
              >
                <option value="ALL">Tất cả khóa học ({effectiveCourses.length})</option>
                {effectiveCourses.map((c) => (
                  <option key={c.courseId} value={c.courseId}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Box */}
            <div className="relative min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={leaderboardSearch}
                onChange={(e) => setLeaderboardSearch(e.target.value)}
                placeholder="Tìm tên, mã học sinh..."
                className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Top 3 Podium Cards if students have earned points */}
        {hasActiveStudents && filteredLeaderboard.length >= 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* Top 2 */}
            <div className="order-2 sm:order-1 bg-gradient-to-b from-slate-50 to-slate-100/80 p-3 rounded-xl border border-slate-200 flex items-center gap-3 relative overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-slate-300 to-slate-200 text-slate-800 font-black text-sm flex items-center justify-center shadow-2xs shrink-0">
                🥈 #2
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Hạng Nhì</p>
                <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate">{filteredLeaderboard[1].hoTen}</h4>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {filteredLeaderboard[1].chiDoan} • <strong className="text-blue-700">+{filteredLeaderboard[1].points}đ</strong>
                </p>
              </div>
            </div>

            {/* Top 1 */}
            <div className="order-1 sm:order-2 bg-gradient-to-b from-amber-500/10 via-amber-50 to-yellow-50/60 p-3 rounded-xl border border-amber-300 flex items-center gap-3 relative overflow-hidden shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-900 font-black text-base flex items-center justify-center shadow-2xs shrink-0">
                🥇 #1
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider bg-amber-100 px-1.5 py-0.2 rounded-md">
                  Quán Quân
                </span>
                <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate mt-0.5">{filteredLeaderboard[0].hoTen}</h4>
                <p className="text-[11px] text-amber-900 font-bold mt-0.5">
                  {filteredLeaderboard[0].chiDoan} • <strong className="text-amber-600">+{filteredLeaderboard[0].points} điểm</strong>
                </p>
              </div>
            </div>

            {/* Top 3 */}
            <div className="order-3 sm:order-3 bg-gradient-to-b from-amber-50/40 to-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-3 relative overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-700 to-amber-600 text-white font-black text-sm flex items-center justify-center shadow-2xs shrink-0">
                🥉 #3
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Hạng Ba</p>
                <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate">{filteredLeaderboard[2].hoTen}</h4>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {filteredLeaderboard[2].chiDoan} • <strong className="text-blue-700">+{filteredLeaderboard[2].points}đ</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          {filteredLeaderboard.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs font-semibold">
              Không tìm thấy học sinh nào phù hợp với bộ lọc tìm kiếm.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[11px]">
                  <th className="py-2.5 px-3 w-14 text-center">Hạng</th>
                  <th className="py-2.5 px-3">Học sinh</th>
                  <th className="py-2.5 px-3">Lớp / Chi đoàn</th>
                  <th className="py-2.5 px-3 text-center">Tiến độ bài học</th>
                  <th className="py-2.5 px-3 text-center">Điểm trắc nghiệm</th>
                  <th className="py-2.5 px-3 text-center">Thời gian học</th>
                  <th className="py-2.5 px-3 text-right">Điểm thi đua</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeaderboard.slice(0, 25).map((student, idx) => {
                  const rank = idx + 1;
                  return (
                    <tr key={student.idUser} className="hover:bg-slate-50 transition-colors text-slate-700">
                      <td className="py-2.5 px-3 text-center font-bold">
                        {hasActiveStudents && rank === 1 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-900 font-black text-[11px] shadow-2xs">
                            🥇
                          </span>
                        ) : hasActiveStudents && rank === 2 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-slate-300 to-slate-200 text-slate-800 font-black text-[11px] shadow-2xs">
                            🥈
                          </span>
                        ) : hasActiveStudents && rank === 3 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-amber-700 to-amber-600 text-white font-black text-[11px] shadow-2xs">
                            🥉
                          </span>
                        ) : (
                          <span className="text-slate-400 font-extrabold text-xs">#{rank}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold text-[11px] shrink-0">
                            {(student.hoTen || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">{student.hoTen}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{student.idUser}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {student.chiDoan}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                        {selectedCourseFilter !== 'ALL' && student.totalLessonsInScope > 0 ? (
                          <span>
                            {student.completedLessons}/{student.totalLessonsInScope} bài{' '}
                            <span className="text-[11px] font-medium text-slate-500">
                              ({Math.round((student.completedLessons / student.totalLessonsInScope) * 100)}%)
                            </span>
                          </span>
                        ) : (
                          <span>{student.completedLessons} bài hoàn thành</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-extrabold border ${
                          student.avgScore10 >= 8
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : student.avgScore10 >= 5
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : student.avgScore10 > 0
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {student.avgScore10 > 0 ? `${student.avgScore10} / 10` : 'Chưa thi'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-medium text-slate-600">
                        {student.studyMins} phút
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-black text-sm text-amber-600">
                          +{student.points} <span className="text-[10px] font-normal text-slate-400">điểm</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
