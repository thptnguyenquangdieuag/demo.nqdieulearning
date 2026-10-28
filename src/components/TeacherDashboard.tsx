import React, { useState, useEffect, useMemo } from 'react';
import { Course, User, ResetPasswordRequest, PendingRegistration } from '../types';
import { CourseEditorModal } from './CourseEditorModal';
import { TeacherStatsModal } from './TeacherStatsModal';
import { TeacherAiModal } from './TeacherAiModal';
import { LmsReportModal } from './LmsReportModal';
import { TeacherQaModal } from './TeacherQaModal';
import { AdminDataManagementModal } from './AdminDataManagementModal';
import { AccountManagementModal } from './AccountManagementModal';
import { ServerManagementView } from './ServerManagementView';
import { NotificationCenterModal } from './NotificationCenterModal';
import { SchoolIllustration } from './SchoolIllustration';
import { TeacherOverviewAnalytics } from './TeacherOverviewAnalytics';
import { StudentLeaderboardView } from './StudentLeaderboardView';
import { LearningGamesView } from './LearningGamesView';
import {
  Plus,
  BookOpen,
  Edit,
  BarChart2,
  Trash2,
  Award,
  Users,
  UserCheck,
  Sparkles,
  Clock,
  BookCheck,
  TrendingUp,
  BarChart3,
  MessageSquare,
  RefreshCw,
  GraduationCap,
  Megaphone,
  Search,
  Filter,
  Layers,
  CheckCircle2,
  Info,
  ShieldAlert,
  Server,
  Activity,
  Lock,
} from 'lucide-react';
import { getCourseTimeStatus, formatDateTimeDisplay } from '../lib/courseTime';
import {
  getStoredCourses,
  saveStoredCourses,
  deleteStoredCertificatesByCourse,
  deleteStoredCourseDataCascade,
  getStoredAccounts,
  getStoredQuizStatus,
  getStoredProgress,
  getStoredEnrollments,
  getStoredResetPasswordRequests,
  getStoredPendingRegistrations,
  getStoredQaQuestions,
  fetchQaQuestionsFromApi,
  fetchPendingSummaryFromApi,
} from '../lib/storage';

interface TeacherDashboardProps {
  courses: Course[];
  currentUser: User | null;
  onRefreshCourses: () => void;
  onOpenAccountsModal?: () => void;
  onOpenNotificationsManager?: () => void;
  onCourseSaved?: (course: Course) => void;
  onToggleTeacherTestingMode?: () => void;
  activeTab?: string;
  onSelectTab?: (tab: any, extraData?: any) => void;
  onOpenCourseEditor?: (course?: Course | null) => void;
  onStartLearning?: (courseId: string) => void;
  onOpenCourseDetail?: (courseId: string) => void;
  notificationSubTab?: 'NOTIFICATIONS' | 'NOTICE_BOARD';
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  courses,
  currentUser,
  onRefreshCourses,
  onOpenAccountsModal,
  onOpenNotificationsManager,
  onCourseSaved,
  onToggleTeacherTestingMode,
  activeTab = 'overview',
  onSelectTab,
  onOpenCourseEditor,
  onStartLearning,
  onOpenCourseDetail,
  notificationSubTab,
}) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [courseToEdit, setCourseToEdit] = useState<Course | null>(null);

  const [statsOpen, setStatsOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourseTitle, setSelectedCourseTitle] = useState('');

  const [teacherAiOpen, setTeacherAiOpen] = useState(false);
  const [lmsReportOpen, setLmsReportOpen] = useState(false);
  const [qaModalOpen, setQaModalOpen] = useState(false);
  const [adminDataModalOpen, setAdminDataModalOpen] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';

  // Sub-tabs for Quản trị area ("1. Cấp & Quản lý tài khoản", "2. Quản lý server", "3. Nâng cao")
  const [adminSubTab, setAdminSubTab] = useState<'ACCOUNTS' | 'SERVER' | 'ADVANCED'>(
    activeTab === 'adminData' ? 'ADVANCED' : activeTab === 'server' ? 'SERVER' : 'ACCOUNTS'
  );

  useEffect(() => {
    if (activeTab === 'adminData') {
      setAdminSubTab('ADVANCED');
    } else if (activeTab === 'server') {
      setAdminSubTab('SERVER');
    } else if (activeTab === 'accounts') {
      setAdminSubTab('ACCOUNTS');
    }
  }, [activeTab]);

  // Filters for course list
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'ALL' | '10' | '11' | '12'>('ALL');
  const [timeStatusFilter, setTimeStatusFilter] = useState<'ALL' | 'ACTIVE' | 'NOT_STARTED' | 'ENDED'>('ALL');

  const [studentCount, setStudentCount] = useState<number>(0);
  const [teacherCount, setTeacherCount] = useState<number>(0);
  const [avgScore, setAvgScore] = useState<string>('0.0/10');
  const [attendanceRate, setAttendanceRate] = useState<string>('0.0%');
  const [pendingResetCount, setPendingResetCount] = useState<number>(0);
  const [pendingRegCount, setPendingRegCount] = useState<number>(0);
  const [pendingQaCount, setPendingQaCount] = useState<number>(0);

  const ownedCourses = useMemo(() => {
    return courses.filter((c) => {
      if (isAdmin) return true;
      if (!currentUser) return false;

      const cleanUser = String(currentUser.idUser || '').toLowerCase().trim();
      const cleanName = String(currentUser.hoTen || currentUser.fullName || '').toLowerCase().trim();
      const cAuthorId = String(c.authorId || '').toLowerCase().trim();
      const cAuthorName = String(c.authorName || '').toLowerCase().trim();

      if (cAuthorId) {
        return cAuthorId === cleanUser;
      }
      if (cAuthorName && cleanName) {
        return cAuthorName === cleanName;
      }
      return true;
    });
  }, [courses, isAdmin, currentUser]);

  const checkPendingRequests = async () => {
    try {
      const summary = await fetchPendingSummaryFromApi(currentUser?.role);
      if (summary) {
        setPendingResetCount(summary.pendingResetCount);
        setPendingRegCount(summary.pendingRegCount);
        return;
      }
    } catch {}

    // Fallback if network offline
    const resetItems = getStoredResetPasswordRequests();
    const pendingReset = resetItems.filter((r) => {
      if (r.status !== 'PENDING') return false;
      if (isAdmin) return true;
      return r.role === 'STUDENT';
    });
    setPendingResetCount(pendingReset.length);

    const regItems = getStoredPendingRegistrations();
    const pendingReg = regItems.filter((p) => {
      if (p.status !== 'PENDING') return false;
      if (isAdmin) return true;
      return p.role === 'STUDENT';
    });
    setPendingRegCount(pendingReg.length);
  };

  const checkPendingQa = async () => {
    try {
      let allQ = getStoredQaQuestions();
      try {
        const apiQ = await fetchQaQuestionsFromApi();
        if (apiQ && apiQ.length > 0) allQ = apiQ;
      } catch {}

      const unanswered = allQ.filter((q) => {
        if (!isAdmin && ownedCourses.length > 0) {
          const myCourseIds = new Set(ownedCourses.map((c) => c.courseId));
          if (!myCourseIds.has(q.courseId)) return false;
        }
        const hasTeacherAns = (q.answers || []).some(
          (a) => a.authorRole === 'TEACHER' || a.authorRole === 'ADMIN'
        );
        return !hasTeacherAns;
      });

      setPendingQaCount(unanswered.length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    checkPendingRequests();
    checkPendingQa();

    const handleUpdate = () => {
      checkPendingRequests();
      checkPendingQa();
    };

    window.addEventListener('reset-requests-updated', handleUpdate);
    window.addEventListener('lms-qa-updated', handleUpdate);
    const interval = setInterval(() => {
      checkPendingRequests();
      checkPendingQa();
    }, 5000);

    return () => {
      window.removeEventListener('reset-requests-updated', handleUpdate);
      window.removeEventListener('lms-qa-updated', handleUpdate);
      clearInterval(interval);
    };
  }, [currentUser?.idUser, isAdmin, ownedCourses.length]);

  const totalPendingCount = pendingResetCount + pendingRegCount;

  useEffect(() => {
    const loadStats = async () => {
      let accountsData = getStoredAccounts();
      try {
        const res = await fetch('/api/accounts');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.students)) setStudentCount(data.students.length);
          if (Array.isArray(data.teachers)) setTeacherCount(data.teachers.length);
          if (Array.isArray(data.students) && Array.isArray(data.teachers)) {
            accountsData = { students: data.students, teachers: data.teachers };
          }
        } else {
          setStudentCount(accountsData.students.length);
          setTeacherCount(accountsData.teachers.length);
        }
      } catch {
        setStudentCount(accountsData.students.length);
        setTeacherCount(accountsData.teachers.length);
      }

      const allStudents = accountsData.students || [];
      const quizStatus = getStoredQuizStatus();
      const progress = getStoredProgress();
      const allEnroll = getStoredEnrollments();

      const targetCourses = isAdmin ? courses : ownedCourses;
      const targetCourseIds = targetCourses.map((c) => String(c.courseId));
      const targetCourseIdSet = new Set(targetCourseIds);

      // Calculate total registered students for this teacher's courses
      const enrolledStudentIds = new Set<string>();
      allStudents.forEach((student) => {
        const sId = String(student.idUser).trim().toLowerCase();
        const rawId = String(student.idUser).trim();
        const enrolledList: string[] = allEnroll[rawId] || allEnroll[sId] || [];
        const sProgObj = (progress[rawId] || progress[sId] || {}) as Record<string, any>;
        const sQuizObj = (quizStatus[rawId] || quizStatus[sId] || {}) as Record<string, any>;

        let isEnrolled = false;
        targetCourseIds.forEach((cId: string) => {
          if (enrolledList.includes(cId)) isEnrolled = true;
          const cp = sProgObj[cId];
          const cq = sQuizObj[cId];
          if (cp && Object.keys(cp).length > 0) isEnrolled = true;
          if (cq && Object.keys(cq).length > 0) isEnrolled = true;
        });

        if (isEnrolled) {
          enrolledStudentIds.add(sId);
        }
      });

      // Also check any extra student keys in enrollments/progress/quizStatus
      Object.entries(allEnroll).forEach(([uId, cList]) => {
        if (Array.isArray(cList) && cList.some((cId) => targetCourseIdSet.has(String(cId)))) {
          enrolledStudentIds.add(String(uId).trim().toLowerCase());
        }
      });
      Object.entries(progress).forEach(([uId, cMap]) => {
        if (cMap && typeof cMap === 'object') {
          Object.keys(cMap).forEach((cId) => {
            if (targetCourseIdSet.has(String(cId))) {
              enrolledStudentIds.add(String(uId).trim().toLowerCase());
            }
          });
        }
      });
      Object.entries(quizStatus).forEach(([uId, cMap]) => {
        if (cMap && typeof cMap === 'object') {
          Object.keys(cMap).forEach((cId) => {
            if (targetCourseIdSet.has(String(cId))) {
              enrolledStudentIds.add(String(uId).trim().toLowerCase());
            }
          });
        }
      });

      if (!isAdmin) {
        setStudentCount(enrolledStudentIds.size);
      }

      const scores: number[] = [];
      allStudents.forEach((student) => {
        const sId = String(student.idUser).trim().toLowerCase();
        targetCourses.forEach((c) => {
          const courseId = String(c.courseId);
          const sQuizObj = (quizStatus[student.idUser] && quizStatus[student.idUser][courseId]) ||
            (quizStatus[sId] && quizStatus[sId][courseId]) || {};
          const sProgObj = (progress[student.idUser] && progress[student.idUser][courseId]) ||
            (progress[sId] && progress[sId][courseId]) || {};

          let sc: number | null = null;
          if (sQuizObj.lastScore !== undefined && sQuizObj.lastScore !== null) {
            sc = Number(sQuizObj.lastScore);
          } else if (sProgObj['QUIZ_SUBMITTED']?.score !== undefined) {
            sc = Number(sProgObj['QUIZ_SUBMITTED'].score);
          }

          if (sc !== null && !isNaN(sc) && sc >= 0) {
            const score10 = sc > 10 ? sc / 10 : sc;
            scores.push(score10);
          }
        });
      });

      if (scores.length === 0) {
        Object.entries(quizStatus).forEach(([uId, userCourseMap]) => {
          if (userCourseMap && typeof userCourseMap === 'object') {
            Object.entries(userCourseMap).forEach(([cId, item]: [string, any]) => {
              if (targetCourseIdSet.has(String(cId))) {
                if (item?.lastScore !== undefined && item?.lastScore !== null) {
                  const s = Number(item.lastScore);
                  if (!isNaN(s)) scores.push(s > 10 ? s / 10 : s);
                }
              }
            });
          }
        });
      }

      if (scores.length > 0) {
        const sum = scores.reduce((acc, curr) => acc + curr, 0);
        const avg = sum / scores.length;
        setAvgScore(`${avg.toFixed(1)}/10`);
      } else {
        setAvgScore('0.0/10');
      }

      // Compute Attendance/Completion Rate
      let totalLessonSlots = 0;
      let totalCompletedLessons = 0;

      targetCourses.forEach((c) => {
        const numLessons = (c.lessons || []).length;
        if (numLessons > 0) {
          allStudents.forEach((student) => {
            const sId = String(student.idUser).trim().toLowerCase();
            const sProgObj = (progress[student.idUser] && progress[student.idUser][c.courseId]) ||
              (progress[sId] && progress[sId][c.courseId]) || {};

            const isEnrolled = (allEnroll[student.idUser] || allEnroll[sId] || []).includes(c.courseId) ||
              Object.keys(sProgObj).length > 0;

            if (isAdmin || isEnrolled) {
              totalLessonSlots += numLessons;
              (c.lessons || []).forEach((lesson) => {
                if (sProgObj[lesson.lessonId]?.completed || sProgObj[lesson.lessonId]?.isCompleted) {
                  totalCompletedLessons += 1;
                }
              });
            }
          });
        }
      });

      if (totalLessonSlots > 0) {
        const rate = (totalCompletedLessons / totalLessonSlots) * 100;
        setAttendanceRate(`${rate.toFixed(1)}%`);
      } else {
        setAttendanceRate('0.0%');
      }
    };

    loadStats();

    const handleDataUpdated = () => {
      loadStats();
    };

    window.addEventListener('accounts-updated', handleDataUpdated);
    window.addEventListener('courses-updated', handleDataUpdated);
    window.addEventListener('lms-progress-updated', handleDataUpdated);
    window.addEventListener('lms-quiz-updated', handleDataUpdated);
    window.addEventListener('enrollments-updated', handleDataUpdated);

    return () => {
      window.removeEventListener('accounts-updated', handleDataUpdated);
      window.removeEventListener('courses-updated', handleDataUpdated);
      window.removeEventListener('lms-progress-updated', handleDataUpdated);
      window.removeEventListener('lms-quiz-updated', handleDataUpdated);
      window.removeEventListener('enrollments-updated', handleDataUpdated);
    };
  }, [courses, ownedCourses, isAdmin]);

  // Listen to open modals triggered from Sidebar or external
  useEffect(() => {
    const handleOpenAi = () => {
      if (onSelectTab) onSelectTab('ai');
      else setTeacherAiOpen(true);
    };
    const handleOpenReports = () => {
      if (onSelectTab) onSelectTab('reports');
      else setLmsReportOpen(true);
    };
    const handleOpenQa = () => {
      if (onSelectTab) onSelectTab('qa');
      else setQaModalOpen(true);
    };
    const handleOpenAdminData = () => {
      if (onSelectTab) onSelectTab('adminData');
      else setAdminDataModalOpen(true);
    };
    const handleOpenCreateCourse = (e?: any) => {
      const targetCourse = e?.detail?.course || null;
      setCourseToEdit(targetCourse);
      if (onOpenCourseEditor) onOpenCourseEditor(targetCourse);
      else if (onSelectTab) onSelectTab('createCourse', targetCourse);
      else setEditorOpen(true);
    };

    window.addEventListener('open-teacher-ai-modal', handleOpenAi);
    window.addEventListener('open-lms-report-modal', handleOpenReports);
    window.addEventListener('open-teacher-qa-modal', handleOpenQa);
    window.addEventListener('open-admin-data-modal', handleOpenAdminData);
    window.addEventListener('open-create-course-modal', handleOpenCreateCourse);

    return () => {
      window.removeEventListener('open-teacher-ai-modal', handleOpenAi);
      window.removeEventListener('open-lms-report-modal', handleOpenReports);
      window.removeEventListener('open-teacher-qa-modal', handleOpenQa);
      window.removeEventListener('open-admin-data-modal', handleOpenAdminData);
      window.removeEventListener('open-create-course-modal', handleOpenCreateCourse);
    };
  }, [onSelectTab, onOpenCourseEditor]);

  const handleOpenCreate = () => {
    setCourseToEdit(null);
    if (onOpenCourseEditor) {
      onOpenCourseEditor(null);
    } else if (onSelectTab) {
      onSelectTab('createCourse', null);
    } else {
      setEditorOpen(true);
    }
  };

  const handleOpenEdit = (course: Course) => {
    setCourseToEdit(course);
    if (onOpenCourseEditor) {
      onOpenCourseEditor(course);
    } else if (onSelectTab) {
      onSelectTab('createCourse', course);
    } else {
      setEditorOpen(true);
    }
  };

  const handleOpenStats = (course: Course) => {
    setSelectedCourseId(course.courseId);
    setSelectedCourseTitle(course.title);
    setStatsOpen(true);
  };

  const handleDeleteCourse = async (courseId: string, title: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa khóa học "${title}"?\n\nCẢNH BÁO: Toàn bộ tiến độ học tập, bài thi trắc nghiệm, điểm số và giấy chứng nhận của học sinh thuộc khóa học này cũng sẽ bị xóa vĩnh viễn.`)) return;

    // Xóa ngay tiến độ, điểm số, bài thi và giấy chứng nhận của khóa học trong bộ nhớ cục bộ
    deleteStoredCourseDataCascade(courseId);

    let apiHandled = false;
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userObj: currentUser }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        apiHandled = true;
        const stored = getStoredCourses();
        const updated = stored.filter((c) => c.courseId !== courseId);
        saveStoredCourses(updated);
        deleteStoredCourseDataCascade(courseId);
        alert(data.message || `Đã xóa khóa học "${title}" và toàn bộ tiến độ, điểm số, giấy chứng nhận liên quan!`);
        onRefreshCourses();
      }
    } catch {
      // fallback
    }

    if (!apiHandled) {
      const stored = getStoredCourses();
      const updated = stored.filter((c) => c.courseId !== courseId);
      saveStoredCourses(updated);
      deleteStoredCourseDataCascade(courseId);
      alert(`Đã xóa khóa học "${title}" và toàn bộ tiến độ học tập, điểm số, giấy chứng nhận liên quan.`);
      onRefreshCourses();
    }
  };

  // Filter courses by Grade, Time Status, and Search query
  const filteredCourses = useMemo(() => {
    return ownedCourses.filter((c) => {
      // Grade filter
      if (gradeFilter !== 'ALL') {
        const titleUpper = (c.title || '').toUpperCase();
        const descUpper = (c.description || '').toUpperCase();
        const gradeKey = `KHỐI ${gradeFilter}`;
        const gradeKey2 = `LỚP ${gradeFilter}`;
        const gradeKey3 = `K${gradeFilter}`;
        const hasGrade =
          titleUpper.includes(gradeKey) ||
          titleUpper.includes(gradeKey2) ||
          titleUpper.includes(gradeKey3) ||
          descUpper.includes(gradeKey) ||
          descUpper.includes(gradeKey2);
        if (!hasGrade) return false;
      }

      // Time status filter
      if (timeStatusFilter !== 'ALL') {
        const timeStatus = getCourseTimeStatus(c);
        if (timeStatus !== timeStatusFilter) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          (c.title || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          (c.authorName || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [ownedCourses, gradeFilter, timeStatusFilter, searchQuery]);

  const teacherStudentCount = studentCount > 0 ? studentCount : 38;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* 1. TAB: TỔNG QUAN */}
      {activeTab === 'overview' && (
        <>
          {/* Welcome Banner Box (Compact & Polished) */}
          <div className="bg-white rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 border border-slate-200/90 shadow-xs relative overflow-hidden flex items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl z-10 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-lg sm:text-xl select-none">👋</span>
                <h2 className="text-sm sm:text-base md:text-lg font-black text-slate-900 tracking-tight truncate">
                  Xin chào, {isAdmin ? 'Quản trị viên' : 'Thầy / Cô'}
                  {currentUser?.hoTen || currentUser?.fullName ? ` ${currentUser.hoTen || currentUser.fullName}` : ''}!
                </h2>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium leading-normal truncate">
                Cập nhật nhanh tình hình học tập và các hoạt động của hệ thống NQDIEU LEARNING.
              </p>
            </div>

            {/* School Illustration Graphic on the right (Compact) */}
            <div className="shrink-0 self-center hidden sm:block">
              <SchoolIllustration className="w-24 sm:w-32 md:w-36 h-auto drop-shadow-2xs" />
            </div>
          </div>

          {/* Bento KPI Stat Metric Cards */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'md:grid-cols-3 xl:grid-cols-5' : 'md:grid-cols-2 xl:grid-cols-4'} gap-2.5 sm:gap-3.5 transition-all duration-300`}>
            {/* Card 1: Tổng Học sinh (Blue Accent) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between space-y-2.5 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-[#0B4D9C] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Users className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight block truncate">
                    {studentCount}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 block truncate">
                    {isAdmin ? 'Học sinh toàn trường' : 'Tổng học sinh'}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-500 min-w-0">
                <span className="shrink-0 text-blue-600">➔</span>
                <span className="truncate">{isAdmin ? 'Tổng học sinh toàn trường' : 'Học sinh đăng ký khóa học của bạn'}</span>
              </div>
            </div>

            {/* Card 2: Tổng Giáo viên (Only for Admin) */}
            {isAdmin && (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between space-y-2.5 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <UserCheck className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight block truncate">
                      {teacherCount}
                    </span>
                    <span className="text-[11px] sm:text-xs font-bold text-slate-500 block truncate">
                      Giáo viên quản lý
                    </span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold text-emerald-700 min-w-0">
                  <span className="shrink-0">★</span>
                  <span className="truncate">Đã kích hoạt tài khoản</span>
                </div>
              </div>
            )}

            {/* Card 3: Khóa học hiện có (Teal Accent) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:shadow-md hover:border-teal-300 transition-all flex flex-col justify-between space-y-2.5 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <BookCheck className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight block truncate">
                    {isAdmin ? courses.length : ownedCourses.length}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 block truncate">Khóa học hiện có</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold text-teal-700 min-w-0">
                <span className="shrink-0">★</span>
                <span className="truncate">{isAdmin ? 'Toàn bộ chuyên đề' : 'Khóa học bạn phụ trách'}</span>
              </div>
            </div>

            {/* Card 4: Điểm kiểm tra TB (Violet Accent) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:shadow-md hover:border-violet-300 transition-all flex flex-col justify-between space-y-2.5 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Award className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight block truncate">
                    {avgScore}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 block truncate">Điểm kiểm tra TB</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold text-violet-700 min-w-0">
                <span className="shrink-0">★</span>
                <span className="truncate">Dựa trên bài nộp thực tế</span>
              </div>
            </div>

            {/* Card 5: Tỷ lệ Chuyên cần (Amber Accent) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between space-y-2.5 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle2 className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight block truncate">
                    {attendanceRate}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 block truncate">Tỷ lệ Chuyên cần</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold text-amber-700 min-w-0">
                <span className="shrink-0 text-amber-600">➔</span>
                <span className="truncate">Tỷ lệ hoàn thành bài học thực tế</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 2. TAB: QUẢN LÝ KHÓA HỌC */}
      {activeTab === 'manageCourses' && (
        <div className="bg-white rounded-3xl px-5 sm:px-6 py-2.5 min-h-[65px] border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-500 tracking-tight uppercase">
              Quản lý Khóa học & Học Liệu
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm khóa học mới</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab?.('ai')}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span>Trợ lý AI tạo khóa học</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. TAB: THÔNG BÁO & BẢN TIN */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* Inline Notification & Notice Board Workspace */}
          <NotificationCenterModal
            isInline={true}
            currentUser={currentUser}
            courses={courses}
            mode="MANAGEMENT"
            initialSubTab={notificationSubTab}
            onClose={() => onSelectTab?.('overview')}
            onOpenCourse={(cId) => {
              if (onStartLearning) onStartLearning(cId);
            }}
            onOpenAccountManagement={() => onSelectTab?.('accounts')}
          />
        </div>
      )}

      {/* 4. TAB: GÓC HỎI ĐÁP */}
      {activeTab === 'qa' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl px-5 sm:px-6 py-2.5 min-h-[65px] border border-slate-200/90 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 shadow-2xs shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 tracking-tight uppercase">
                Góc Hỏi đáp (Q&A)
              </h2>
            </div>
          </div>

          <TeacherQaModal
            isInline={true}
            currentUser={currentUser}
            courses={courses}
            onClose={() => onSelectTab?.('overview')}
          />
        </div>
      )}

      {/* 5. TAB: BÁO CÁO */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl px-5 sm:px-6 py-2.5 min-h-[65px] border border-slate-200/90 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-2xs shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 tracking-tight uppercase">
                Báo cáo & Phân tích Hệ thống NQDIEU LEARNING
              </h2>
            </div>
          </div>

          <LmsReportModal
            isInline={true}
            currentUser={currentUser}
            courses={courses}
            onClose={() => onSelectTab?.('overview')}
          />
        </div>
      )}

      {/* TAB: BẢNG XẾP HẠNG (Dành cho Giáo viên & Admin) */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <StudentLeaderboardView
            currentUser={currentUser}
            courses={courses}
          />
        </div>
      )}

      
      {/* TAB: TRÒ CHƠI ÔN TẬP */}
      {activeTab === 'games' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <LearningGamesView
            currentUser={currentUser}
            courses={courses}
          />
        </div>
      )}

      {/* 6. TAB: TRỢ LÝ AI */}
      {activeTab === 'ai' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl px-4 sm:px-5 py-2 min-h-[48px] border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-2xs shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-sm sm:text-base font-black bg-clip-text text-transparent bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 tracking-tight uppercase">
                TRỢ LÝ NQDIEU AI • HỖ TRỢ GIẢNG DẠY & QUẢN LÝ KHÓA HỌC
              </h2>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-lg text-[11px] font-bold text-amber-800 shrink-0">
              <Sparkles className="w-3 h-3 text-amber-600" />
              <span>Mô hình Gemini AI Thế hệ mới</span>
            </div>
          </div>

          <TeacherAiModal
            isInline={true}
            onClose={() => onSelectTab?.('overview')}
            onCourseCreated={(newCourse) => {
              if (onCourseSaved) onCourseSaved(newCourse);
              onRefreshCourses();
              onSelectTab?.('manageCourses');
            }}
            onOpenCourseEditor={(prefilledCourse) => {
              setCourseToEdit(prefilledCourse);
              setEditorOpen(true);
            }}
          />
        </div>
      )}

      {/* 7. TAB: QUẢN TRỊ (Gồm 3 mục con: 1. Cấp & Quản lý tài khoản, 2. Quản lý server, 3. Nâng cao) */}
      {(activeTab === 'accounts' || activeTab === 'admin' || activeTab === 'adminData' || activeTab === 'server') && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Top Sub-Navigation Tabs Bar (chỉ hiển thị cho Admin để chuyển đổi giữa 3 mục Quản trị) */}
          {isAdmin ? (
            <div className="bg-white rounded-3xl px-5 sm:px-6 py-2.5 min-h-[65px] border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 shadow-2xs shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-indigo-900 to-blue-900 tracking-tight uppercase">
                    Quản trị Hệ thống
                  </h2>
                </div>
              </div>

              {/* Sub-Tab Switcher Buttons (1. Cấp tài khoản | 2. Quản lý server | 3. Nâng cao) */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 border border-slate-200 rounded-xl w-full md:w-auto">
                {/* 1. Cấp & Quản lý tài khoản */}
                <button
                  type="button"
                  onClick={() => setAdminSubTab('ACCOUNTS')}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-extrabold text-xs transition-all cursor-pointer ${
                    adminSubTab === 'ACCOUNTS'
                      ? 'bg-white text-[#0B4D9C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>1. Cấp & Quản lý tài khoản</span>
                  {totalPendingCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-black rounded-full bg-rose-500 text-white animate-pulse">
                      {totalPendingCount}
                    </span>
                  )}
                </button>

                {/* 2. Quản lý lưu trữ & Máy chủ */}
                <button
                  type="button"
                  onClick={() => setAdminSubTab('SERVER')}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-extrabold text-xs transition-all cursor-pointer ${
                    adminSubTab === 'SERVER'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-blue-700 hover:text-blue-900 hover:bg-blue-100/60'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>2. Quản lý database</span>
                  <span className={`text-[8px] px-1 py-0.5 rounded font-black uppercase flex items-center gap-0.5 ${
                    adminSubTab === 'SERVER' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
                  }`}>
                  </span>
                </button>

                {/* 3. Đồng bộ & Dữ liệu */}
                <button
                  type="button"
                  onClick={() => setAdminSubTab('ADVANCED')}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-extrabold text-xs transition-all cursor-pointer ${
                    adminSubTab === 'ADVANCED'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100/60'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>3. Đồng bộ & Dữ liệu</span>
                  <span className={`text-[8px] px-1 py-0.5 rounded font-black uppercase ${
                    adminSubTab === 'ADVANCED' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl px-5 sm:px-6 py-2.5 min-h-[65px] border border-slate-200/90 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 shadow-2xs shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <h2 className="text-lg sm:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-indigo-900 to-blue-900 tracking-tight uppercase">
                  Quản lý Tài khoản Học sinh
                </h2>
              </div>
            </div>
          )}

          {/* Sub-Tab 1: Cấp & Quản lý tài khoản */}
          {(adminSubTab === 'ACCOUNTS' || !isAdmin) && (
            <div className="space-y-6">
              {/* Inline Account Management Workspace */}
              <AccountManagementModal
                isInline={true}
                currentUser={currentUser}
                onClose={() => onSelectTab?.('overview')}
                onRefreshData={() => {
                  checkPendingRequests();
                  checkPendingQa();
                }}
              />
            </div>
          )}

          {/* Sub-Tab 2: Quản lý server (Thông số máy chủ, cơ sở dữ liệu, hạn mức & số lần còn lại - Chỉ Xem) */}
          {adminSubTab === 'SERVER' && isAdmin && (
            <div className="space-y-6">
              <ServerManagementView
                courses={courses}
                currentUser={currentUser}
              />
            </div>
          )}

          {/* Sub-Tab 3: Nâng cao (Quản trị dữ liệu & dọn dẹp hệ thống) */}
          {adminSubTab === 'ADVANCED' && isAdmin && (
            <div className="space-y-6">
              {/* Inline Admin Data Workspace */}
              <AdminDataManagementModal
                isInline={true}
                currentUser={currentUser}
                courses={courses}
                onClose={() => setAdminSubTab('ACCOUNTS')}
                onDataPurged={() => {
                  onRefreshCourses();
                  setAdminSubTab('ACCOUNTS');
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* 8. OVERVIEW TAB: ANALYTICS, CHARTS & LEADERBOARD */}
      {activeTab === 'overview' && currentUser && (
        <TeacherOverviewAnalytics
          currentUser={currentUser}
          courses={courses}
          onOpenCourseDetail={onOpenCourseDetail}
        />
      )}

      {/* 9. MANAGE COURSES TAB: COURSE LIST, FILTER BAR & ACTION CARDS */}
      {activeTab === 'manageCourses' && (
        <>
          {/* FILTER BAR ROW */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Left group: 1. DANH SÁCH KHÓA HỌC -> 2. Hiển thị n/n khóa học -> 3. TRẠNG THÁI */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 flex-1">
              <span className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider shrink-0">
                DANH SÁCH KHÓA HỌC
              </span>

              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs shrink-0">
                Hiển thị: <strong className="text-blue-900 font-extrabold">{filteredCourses.length}</strong> / {ownedCourses.length} Khóa học
              </span>

              {/* Filter: Lọc theo Trạng thái */}
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="course-status-select" className="text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">
                  TRẠNG THÁI:
                </label>
                <select
                  id="course-status-select"
                  value={timeStatusFilter}
                  onChange={(e) => setTimeStatusFilter(e.target.value as any)}
                  aria-label="Lọc theo trạng thái khóa học"
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang mở</option>
                  <option value="NOT_STARTED">Sắp mở</option>
                  <option value="ENDED">Đã kết thúc</option>
                </select>
              </div>
            </div>

            {/* Right group: Search Box */}
            <div className="relative w-full md:w-64 lg:w-72 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên khóa học, tác giả..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>
          </div>

          {/* COURSE LIST CARDS */}
          {filteredCourses.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-500 space-y-3 shadow-xs">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-800 text-base">Chưa tìm thấy khóa học nào phù hợp</p>
              <p className="text-xs text-slate-400">
                Thử thay đổi bộ lọc tìm kiếm trạng thái khóa học hoặc từ khóa tìm kiếm.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCourses.map((c) => (
                <div
                  key={c.courseId}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-blue-300 transition-all p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="flex gap-3.5">
                    <img
                      src={c.imageUrl || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500'}
                      alt={c.title}
                      className="w-20 h-20 rounded-xl object-cover bg-blue-50 border border-slate-100 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="min-w-0 flex-grow">
                      <h4 className="font-extrabold text-slate-900 text-sm line-clamp-2 leading-snug">
                        {c.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1 font-medium">
                        Giáo viên: {c.authorName || 'Tổ Chuyên Môn'}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold">
                          <BookOpen className="w-3 h-3 text-blue-600" />
                          {c.lessons?.length || 0} bài học
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold">
                          <Award className="w-3 h-3 text-amber-500" />
                          {c.quizConfig?.enabled !== false ? 'Có trắc nghiệm' : 'Không thi'}
                        </span>
                        {getCourseTimeStatus(c) === 'NOT_STARTED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Sắp mở
                          </span>
                        )}
                        {getCourseTimeStatus(c) === 'ACTIVE' && (c.startDate || c.endDate) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold">
                            <Clock className="w-3 h-3 text-emerald-600" />
                            Đang mở
                          </span>
                        )}
                        {getCourseTimeStatus(c) === 'ENDED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-200 text-slate-700 border border-slate-300 text-[11px] font-bold">
                            <Clock className="w-3 h-3 text-slate-500" />
                            Đã kết thúc
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {(c.startDate || c.endDate) && (
                    <div className="bg-amber-50/80 border border-amber-200/70 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-amber-900 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">
                        {c.startDate && c.endDate
                          ? `${formatDateTimeDisplay(c.startDate)} - ${formatDateTimeDisplay(c.endDate)}`
                          : c.startDate
                          ? `Mở từ ${formatDateTimeDisplay(c.startDate)}`
                          : `Hạn đến ${formatDateTimeDisplay(c.endDate)}`}
                      </span>
                    </div>
                  )}

                  {/* Action Buttons in "Quản lý Khóa học" tab */}
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(c)}
                      className="py-2 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 border border-blue-200 hover:border-blue-300 shadow-2xs active:scale-95 cursor-pointer"
                      title="Chỉnh sửa nội dung khóa học"
                    >
                      <Edit className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Sửa</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenStats(c)}
                      className="py-2 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 border border-indigo-200 hover:border-indigo-300 shadow-2xs active:scale-95 cursor-pointer"
                      title="Xem thống kê kết quả học sinh"
                    >
                      <BarChart2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>Thống kê</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCourse(c.courseId, c.title)}
                      className="py-2 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 border border-rose-200 hover:border-rose-300 shadow-2xs active:scale-95 cursor-pointer"
                      title="Xóa khóa học"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals triggered by actions */}
      <CourseEditorModal
        isOpen={editorOpen}
        courseToEdit={courseToEdit}
        currentUser={currentUser}
        onClose={() => setEditorOpen(false)}
        onSaveSuccess={(savedCourse) => {
          setEditorOpen(false);
          if (savedCourse && onCourseSaved) {
            onCourseSaved(savedCourse);
          }
          onRefreshCourses();
        }}
      />

      <TeacherStatsModal
        isOpen={statsOpen}
        courseId={selectedCourseId}
        courseTitle={selectedCourseTitle}
        onClose={() => setStatsOpen(false)}
      />
    </div>
  );
};
