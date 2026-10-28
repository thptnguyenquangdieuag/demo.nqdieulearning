import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { User, Course, ResetPasswordRequest, PendingRegistration } from './types';
import { AppSidebar, SidebarTabId } from './components/AppSidebar';
import { AppTopHeader } from './components/AppTopHeader';
import { Footer } from './components/Footer';
import { PublicCourseSection } from './components/PublicCourseSection';
import { CourseDetailModal } from './components/CourseDetailModal';
import { LoginModal } from './components/LoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { TeacherDashboard } from './components/TeacherDashboard';
import { LearningWorkspace } from './components/LearningWorkspace';
import { AccountManagementModal } from './components/AccountManagementModal';
import { StudentAchievementsModal } from './components/StudentAchievementsModal';
import { CongratulationModal } from './components/CongratulationModal';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { TeacherQaModal } from './components/TeacherQaModal';
import { LmsReportModal } from './components/LmsReportModal';
import { TeacherAiModal } from './components/TeacherAiModal';
import { AdminDataManagementModal } from './components/AdminDataManagementModal';
import { ProfileUpdateModal } from './components/ProfileUpdateModal';
import { CourseEditorModal } from './components/CourseEditorModal';
import { StudentLeaderboardView } from './components/StudentLeaderboardView';
import { LearningGamesView } from './components/LearningGamesView';
import { checkNewAchievementsAndCertificates, BadgeItem } from './lib/achievements';
import { checkAndDispatchCourseNotifications, checkAndDispatchAccountNotifications } from './lib/notificationEngine';
import { checkSupabaseConnection } from './lib/supabaseClient';
import { BootSplashScreen, BootSyncStep } from './components/BootSplashScreen';
import { generateTeacherUsername, generateStudentUsername } from './lib/accountGenerator';
import { IssuedCertificate } from './types';
import { GraduationCap, RefreshCw, Megaphone } from 'lucide-react';

import { SyncNotificationToast, notifySyncStatus, clearSyncToasts } from './components/SyncNotificationToast';
import { getCourseTimeStatus, formatDateTimeDisplay } from './lib/courseTime';
import { DEFAULT_ADMIN_USER, DEFAULT_COURSES } from './defaultData';
import {
  getStoredCourses,
  hydrateStorageFromServer,
  getStoredNotifications,
  saveStoredCourses,
  getStoredEnrollments,
  saveStoredEnrollment,
  getStoredProgress,
  saveStoredProgress,
  getStoredQuizStatus,
  saveStoredQuizResult,
  getStoredAccounts,
  saveStoredAccounts,
  getStoredAdminProfile,
  saveStoredAdminProfile,
  getStoredPendingRegistrations,
  saveAllStoredPendingRegistrations,
  getStoredResetPasswordRequests,
  saveAllStoredResetPasswordRequests,
  getStoredQaQuestions,
  saveStoredQaQuestions,
  getStoredCertificates,
  saveStoredCertificate,
  getUserLocalEnrollments,
  getUserLocalProgress,
  getUserLocalQuizStatus,
  deleteStoredCertificateForUserCourse,
  deleteStoredQuizStatus,
  deleteStoredQuizProgress,
  flushAllStoredDataToSupabase,
  fetchQaQuestionsFromApi,
  fetchPendingSummaryFromApi,
  isStorageHydrated,
  AccountItem,
} from './lib/storage';
import { clearSyncQueue, hasPendingQueue, getSyncQueue, getSyncQueueCount } from './lib/syncQueue';

export const INITIAL_BOOT_STEPS: BootSyncStep[] = [
  { id: 'connect', label: 'Kết nối cơ sở dữ liệu Supabase Cloud', status: 'in_progress', detail: 'Supabase PostgreSQL' },
  { id: 'accounts', label: 'Nạp danh sách Chi đoàn, Giáo viên & Học sinh', status: 'waiting', detail: 'Tài khoản & phân quyền' },
  { id: 'courses', label: 'Nạp Khóa học, Bài học & Đề thi SĐB', status: 'waiting', detail: 'Tài nguyên bài giảng' },
  { id: 'progress', label: 'Đồng bộ Tiến độ học tập & Điểm số', status: 'waiting', detail: 'Bộ nhớ đám mây' },
  { id: 'ready', label: 'Khởi động giao diện LMS', status: 'waiting', detail: 'Vercel Platform' },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('nq_auth_user');
      }
      const saved = sessionStorage.getItem('nq_auth_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  const [loginOpen, setLoginOpen] = useState(false);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [profileUpdateOpen, setProfileUpdateOpen] = useState(false);
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const [achievementsModalOpen, setAchievementsModalOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [notificationsModalMode, setNotificationsModalMode] = useState<'PERSONAL_ONLY' | 'MANAGEMENT'>('PERSONAL_ONLY');
  const [notificationSubTab, setNotificationSubTab] = useState<'NOTIFICATIONS' | 'NOTICE_BOARD'>('NOTIFICATIONS');
  const [qaModalOpen, setQaModalOpen] = useState(false);
  const [reportsModalOpen, setReportsModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [adminDataModalOpen, setAdminDataModalOpen] = useState(false);
  const [courseEditorOpen, setCourseEditorOpen] = useState(false);
  const [courseToEdit, setCourseToEdit] = useState<Course | null>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [detailCourseId, setDetailCourseId] = useState<string | null>(null);
  const [activeLearningCourseId, setActiveLearningCourseId] = useState<string | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [registeredIds, setRegisteredIds] = useState<string[]>([]);
  const [userProgress, setUserProgress] = useState<Record<string, any>>({});
  const [quizStatus, setQuizStatus] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [isServerConnected, setIsServerConnected] = useState<boolean>(true);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(true);
  const isGoogleSheetsConnected = isSupabaseConnected;

  // Boot & Startup Synchronization State for Vercel Cloud
  const [isBooting, setIsBooting] = useState<boolean>(true);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [bootProgress, setBootProgress] = useState<number>(10);
  const [bootStatusMessage, setBootStatusMessage] = useState<string>('Đang khởi động hệ thống...');
  const [bootSubMessage, setBootSubMessage] = useState<string>('Khởi tạo kết nối Supabase Cloud & Vercel Platform');
  const [bootSteps, setBootSteps] = useState<BootSyncStep[]>(INITIAL_BOOT_STEPS);
  const hasBootRunRef = useRef(false);

  // Sidebar Layout States
  const [activeTab, setActiveTab] = useState<SidebarTabId>('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);

  // Pending counts for sidebar badges
  const [pendingResetCount, setPendingResetCount] = useState(0);
  const [pendingRegCount, setPendingRegCount] = useState(0);
  const [pendingQaCount, setPendingQaCount] = useState(0);

  // Teacher Test Student Mode States
  const [isTeacherTestingMode, setIsTeacherTestingMode] = useState<boolean>(false);
  const [testUserProgress, setTestUserProgress] = useState<Record<string, any>>({});
  const [testQuizStatus, setTestQuizStatus] = useState<Record<string, any>>({});
  const [testRegisteredIds, setTestRegisteredIds] = useState<string[]>([]);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const formatSyncTime = (date: Date = new Date()) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => formatSyncTime());

  const isAdmin = currentUser?.role === 'ADMIN';

  // Keep authenticated user in sync with sessionStorage across profile edits
  useEffect(() => {
    if (currentUser) {
      try {
        sessionStorage.setItem('nq_auth_user', JSON.stringify(currentUser));
      } catch {}
    }
  }, [currentUser]);

  // Ultra-fast Pending counts for Badges via lightweight endpoint
  const refreshPendingCounts = useCallback(async () => {
    if (!currentUser) return;
    try {
      const summary = await fetchPendingSummaryFromApi(currentUser.role);
      if (summary) {
        setPendingResetCount(summary.pendingResetCount);
        setPendingRegCount(summary.pendingRegCount);
        setPendingQaCount(summary.pendingQaCount);
        return;
      }

      // Fallback to stored items if API is offline
      const resetItems = getStoredResetPasswordRequests();
      const pReset = resetItems.filter((r) => {
        if (r.status !== 'PENDING') return false;
        if (isAdmin) return true;
        return r.role === 'STUDENT';
      });
      setPendingResetCount(pReset.length);

      const regItems = getStoredPendingRegistrations();
      const pReg = regItems.filter((p) => {
        if (p.status !== 'PENDING') return false;
        if (isAdmin) return true;
        return p.role === 'STUDENT';
      });
      setPendingRegCount(pReg.length);

      const allQ = getStoredQaQuestions();
      const unanswered = allQ.filter((q) => {
        const hasTeacherAns = (q.answers || []).some(
          (a) => a.authorRole === 'TEACHER' || a.authorRole === 'ADMIN'
        );
        return !hasTeacherAns;
      });
      setPendingQaCount(unanswered.length);
    } catch {}
  }, [currentUser, isAdmin]);

  useEffect(() => {
    refreshPendingCounts();
    const interval = setInterval(refreshPendingCounts, 8000);
    window.addEventListener('reset-requests-updated', refreshPendingCounts);
    window.addEventListener('lms-qa-updated', refreshPendingCounts);
    window.addEventListener('pending-registrations-updated', refreshPendingCounts);

    return () => {
      clearInterval(interval);
      window.removeEventListener('reset-requests-updated', refreshPendingCounts);
      window.removeEventListener('lms-qa-updated', refreshPendingCounts);
      window.removeEventListener('pending-registrations-updated', refreshPendingCounts);
    };
  }, [refreshPendingCounts]);

  // High-Speed Unified App State Bootstrap (Parallelized single round-trip <25ms)
  const loadAppState = async (userOverride?: User | null) => {
    const userToQuery = userOverride !== undefined ? userOverride : currentUser;
    const uId = userToQuery ? userToQuery.idUser : '';
    const uRole = userToQuery ? userToQuery.role : '';
    const cleanU = uId ? uId.trim().toLowerCase() : '';

    try {
      const url = `/api/app-state?userId=${encodeURIComponent(uId)}&role=${encodeURIComponent(uRole)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setIsServerConnected(true);
          const apiCourses = (Array.isArray(data.courses) ? data.courses : [])
            .filter((c: any) => c && c.courseId && c.courseId !== 'course_demo_01');
          setCourses(apiCourses);
          hydrateStorageFromServer({ ...data, accounts: { teachers: data.teachers || [], students: data.students || [] } });

          // Kiểm tra và kết hợp danh sách đăng ký từ Server, Giấy chứng nhận và Bộ nhớ cục bộ
          const certList: any[] = Array.isArray(data.certificates)
            ? data.certificates
            : getStoredCertificates();

          if (Array.isArray(data.certificates) && cleanU) {
            const serverCertCourseIds = new Set(
              data.certificates
                .filter((c: any) => String(c?.idUser || '').trim().toLowerCase() === cleanU)
                .map((c: any) => String(c?.courseId))
            );
            const cachedCerts = getStoredCertificates();
            cachedCerts.forEach((c: any) => {
              if (String(c?.idUser || '').trim().toLowerCase() === cleanU && !serverCertCourseIds.has(String(c?.courseId))) {
                deleteStoredCertificateForUserCourse(cleanU, c.courseId);
              }
            });
          }

          const studentCerts = certList.filter((c: any) => {
            if (!c || !cleanU) return false;
            const cUser = String(c.idUser || '').trim().toLowerCase();
            const cName = String(c.studentName || '').trim().toLowerCase();
            const uName = userToQuery?.hoTen ? String(userToQuery.hoTen).trim().toLowerCase() : '';
            return cUser === cleanU || cUser === cleanU.replace(/^hs\./, '') || (uName && cName === uName);
          });

          const certCourseIds = studentCerts.map((c: any) => String(c.courseId)).filter(Boolean);
          const localEnrolls = cleanU ? getUserLocalEnrollments(cleanU) : [];
          const combinedRegisteredIds = Array.from(new Set([
            ...(data.registeredIds || []),
            ...certCourseIds,
            ...localEnrolls,
          ]));
          setRegisteredIds(combinedRegisteredIds);

          const localProgress = cleanU ? getUserLocalProgress(cleanU) : {};
          const localQuiz = cleanU ? getUserLocalQuizStatus(cleanU) : {};

          // Clean up stale local quiz records for courses where server has no quiz and student has no certificate
          if (cleanU) {
            apiCourses.forEach((c: any) => {
              const cId = String(c?.courseId);
              const hasServerQuiz = Boolean(
                data.userProgress?.[cId]?.['QUIZ_SUBMITTED'] ||
                data.userProgress?.[cId]?.['QUIZ'] ||
                data.quizStatus?.[cId]
              );
              const hasCert = studentCerts.some((cert: any) => String(cert.courseId) === cId);
              if (!hasServerQuiz && !hasCert) {
                if (localProgress[cId]) {
                  delete localProgress[cId]['QUIZ_SUBMITTED'];
                  delete localProgress[cId]['QUIZ'];
                  delete localProgress[cId]['quiz_submitted'];
                  delete localProgress[cId]['quiz'];
                }
                delete localQuiz[cId];
                deleteStoredQuizProgress(cleanU, cId);
                deleteStoredQuizStatus(cleanU, cId);
              }
            });
          }

          const mergedUserProgress = { ...localProgress, ...(data.userProgress || {}) };
          const mergedQuizStatus = { ...localQuiz, ...(data.quizStatus || {}) };

          // Nếu học sinh đã có giấy chứng nhận cho khóa học, tự động khôi phục và đảm bảo đã đạt
          studentCerts.forEach((c: any) => {
            const cId = String(c.courseId);
            if (!cId) return;
            const certScore = Number(c.score || 100);
            const currentQ = mergedQuizStatus[cId] || {};
            const qObj = {
              ...currentQ,
              score: Math.max(Number(currentQ.score || 0), certScore),
              lastScore: Math.max(Number(currentQ.lastScore || 0), certScore),
              bestScore: Math.max(Number(currentQ.bestScore || 0), certScore),
              passed: true,
              status: 'ĐẠT',
              isCompleted: true,
              attempts: Math.max(Number(currentQ.attempts || 1), 1),
              updatedAt: c.issueDate || currentQ.updatedAt || new Date().toISOString(),
            };
            mergedQuizStatus[cId] = qObj;
            if (!mergedUserProgress[cId]) mergedUserProgress[cId] = {};
            mergedUserProgress[cId]['QUIZ_SUBMITTED'] = qObj;
            mergedUserProgress[cId]['QUIZ'] = qObj;

            const targetCourse = apiCourses.find((course: any) => String(course.courseId) === cId);
            if (targetCourse && Array.isArray(targetCourse.lessons)) {
              targetCourse.lessons.forEach((l: any, idx: number) => {
                const dur = Number(l.durationSec || 60);
                const lessonKey = `LESSON_${idx}`;
                mergedUserProgress[cId][lessonKey] = {
                  watchedSec: dur,
                  isCompleted: true,
                  completed: true,
                  ...(mergedUserProgress[cId][lessonKey] || {}),
                };
                if (l.exerciseConfig && l.exerciseConfig.enabled) {
                  const exKey = `LESSON_EXERCISE_${idx}`;
                  const exPass = Number(l.exerciseConfig.passingScore || 80);
                  const currentEx = mergedUserProgress[cId][exKey] || {};
                  mergedUserProgress[cId][exKey] = {
                    attempts: Math.max(Number(currentEx.attempts || 1), 1),
                    score: Math.max(Number(currentEx.score || 100), exPass),
                    lastScore: Math.max(Number(currentEx.lastScore || 100), exPass),
                    bestScore: Math.max(Number(currentEx.bestScore || 100), exPass),
                    passed: true,
                    status: 'ĐẠT',
                    isCompleted: true,
                    ...currentEx,
                  };
                }
              });
            }
          });

          setUserProgress(mergedUserProgress);
          setQuizStatus(mergedQuizStatus);

          if (data.admin) {
            saveStoredAdminProfile(data.admin);
            if (currentUser) {
              const currentId = currentUser.idUser.toLowerCase();
              const isCurAdmin = currentUser.role === 'ADMIN' || currentId === 'admin.c3nguyenquangdieu' || currentId === 'admin';
              if (isCurAdmin) {
                const av = data.admin.avatar || data.admin.avatarUrl || '';
                if (av && (currentUser.avatar !== av || currentUser.avatarUrl !== av)) {
                  const updated: User = {
                    ...currentUser,
                    avatar: av,
                    avatarUrl: av,
                    hoTen: data.admin.hoTen || currentUser.hoTen,
                    chiDoan: data.admin.chiDoan || currentUser.chiDoan,
                  };
                  setCurrentUser(updated);
                }
              }
            }
          }

          if (Array.isArray(data.teachers) || Array.isArray(data.students)) {
            const demoAccountIds = new Set(['gv.demo', 'gv.mai', 'hs.demo', 'hs.nam']);
            const tList: AccountItem[] = (data.teachers || [])
              .filter((t: any) => t && !demoAccountIds.has(String(t.idUser || '').toLowerCase()))
              .map((t: any) => ({ ...t, role: 'TEACHER' }));
            const sList: AccountItem[] = (data.students || [])
              .filter((s: any) => s && !demoAccountIds.has(String(s.idUser || '').toLowerCase()))
              .map((s: any) => ({ ...s, role: 'STUDENT' }));
            saveStoredAccounts(tList, sList);
            if (currentUser) {
              const currentId = currentUser.idUser.toLowerCase();
              const isCurAdmin = currentUser.role === 'ADMIN' || currentId === 'admin.c3nguyenquangdieu' || currentId === 'admin';
              if (!isCurAdmin) {
                const myAccount = [...tList, ...sList].find((a) => a.idUser.toLowerCase() === currentId);
                if (myAccount && (myAccount.avatar || myAccount.avatarUrl)) {
                  const av = myAccount.avatar || myAccount.avatarUrl;
                  if (currentUser.avatar !== av || currentUser.avatarUrl !== av) {
                    const updated: User = {
                      ...currentUser,
                      avatar: av,
                      avatarUrl: av,
                      hoTen: myAccount.hoTen || currentUser.hoTen,
                      chiDoan: myAccount.chiDoan || currentUser.chiDoan,
                    };
                    setCurrentUser(updated);
                  }
                }
              }
            }
          }

          if (Array.isArray(data.pendingRegistrations) && data.pendingRegistrations.length > 0) {
            saveAllStoredPendingRegistrations(data.pendingRegistrations);
          }

          if (data.pendingSummary) {
            setPendingRegCount(Number(data.pendingSummary.pendingRegCount || 0));
            setPendingResetCount(Number(data.pendingSummary.pendingResetCount || 0));
            setPendingQaCount(Number(data.pendingSummary.unansweredQaCount || 0));
          }
          return;
        }
      }
    } catch (err) {
      console.warn('Không thể tải dữ liệu Supabase:', err);
    } finally {
      setLoading(false);
    }

    // Phục hồi từ bộ nhớ cục bộ thay vì xóa trắng
    const storedCourses = getStoredCourses();
    if (storedCourses.length > 0) setCourses(storedCourses);
    if (cleanU) {
      setRegisteredIds(getUserLocalEnrollments(cleanU));
      setUserProgress(getUserLocalProgress(cleanU));
      setQuizStatus(getUserLocalQuizStatus(cleanU));
    }

  };

  const fetchCoursesData = loadAppState;

  const performFullSync = async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {

      const res = await fetch('/api/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courses: [],
          teachers: [],
          students: [],
          pendingRegistrations: [],
        }),
      });

      if (res.ok) {
        setIsServerConnected(true);
        await loadAppState();
        const updatedTime = formatSyncTime();
        setLastSyncTime(updatedTime);
        if (!silent) {
          notifySyncStatus('success', 'Đồng bộ thành công', 'Dữ liệu đã được cập nhật đầy đủ và nhanh chóng về máy chủ.');
        }
      } else {
        if (!silent) {
          notifySyncStatus('warning', 'Đồng bộ không thành công', 'Không thể kết nối máy chủ để lưu dữ liệu.');
        }
      }
    } catch (err) {
      console.error('Sync error:', err);
      if (!silent) {
        notifySyncStatus('error', 'Lỗi đồng bộ', 'Không thể kết nối máy chủ.');
      }
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  const handleToggleTeacherTestingMode = () => {
    if (isTeacherTestingMode) {
      setIsTeacherTestingMode(false);
      setTestUserProgress({});
      setTestQuizStatus({});
      setTestRegisteredIds([]);
      setActiveLearningCourseId(null);
      notifySyncStatus(
        'success',
        'Đã trở về vai trò Giáo viên',
        'Các kết quả học và làm bài thi thử nghiệm đã được XÓA hoàn toàn khỏi hệ thống.'
      );
    } else {
      setIsTeacherTestingMode(true);
      setTestUserProgress({});
      setTestQuizStatus({});
      setTestRegisteredIds(courses.map((c) => c.courseId));
      setActiveLearningCourseId(null);
      notifySyncStatus(
        'warning',
        'Đang ở chế độ Thử nghiệm Học sinh',
        'Bạn đang trải nghiệm khóa học dưới vai trò Học sinh. Mọi kết quả học và bài thi sẽ TỰ ĐỘNG XÓA khi bạn trở về vai trò Giáo viên.'
      );
    }
  };

  const checkServerConnectivity = async () => {
    try {
      const res = await fetch('/api/ping', { method: 'GET' });
      setIsServerConnected(res.ok);
    } catch {
      setIsServerConnected(false);
    }
  };

  const checkSheetsConnectivity = useCallback(async () => {
    try {
      const res = await checkSupabaseConnection();
      setIsSupabaseConnected(res.connected);
    } catch {
      setIsSupabaseConnected(false);
    }
  }, []);

  useEffect(() => {
    const handleQuizResetEvent = (e: any) => {
      const { idUser, courseId } = e.detail || {};
      const cleanTargetUser = String(idUser || '').trim().toLowerCase();
      const currentU = String(currentUser?.idUser || '').trim().toLowerCase();

      if (!cleanTargetUser || cleanTargetUser === currentU) {
        if (courseId) {
          setUserProgress((prev) => {
            const next = { ...prev };
            if (next[courseId]) {
              const cp = { ...next[courseId] };
              delete cp['QUIZ_SUBMITTED'];
              delete cp['QUIZ'];
              delete cp['quiz_submitted'];
              delete cp['quiz'];
              next[courseId] = cp;
            }
            return next;
          });
          setQuizStatus((prev) => {
            const next = { ...prev };
            delete next[courseId];
            return next;
          });
        }
      }
    };

    window.addEventListener('student-quiz-reset', handleQuizResetEvent);
    return () => window.removeEventListener('student-quiz-reset', handleQuizResetEvent);
  }, [currentUser?.idUser]);

  const performBootSync = useCallback(async () => {
    setIsBooting(true);
    setBootProgress(15);
    // Giai đoạn đầu: Hiển thị thông điệp chung: "Đang kết nối, vui lòng chờ..."
    setBootStatusMessage('Đang kết nối, vui lòng chờ...');
    setBootSubMessage('Đang kiểm tra kết nối hệ thống máy chủ và Supabase Cloud...');

    try {
      // Giai đoạn 1: Thiết lập kết nối máy chủ & Supabase Cloud
      let isConnected = false;
      let attempts = 0;
      while (!isConnected && attempts < 12) {
        attempts++;
        try {
          const pingRes = await fetch('/api/ping');
          if (pingRes.ok) {
            isConnected = true;
            setIsServerConnected(true);
          }
        } catch (_e) {
          // Waiting for server to finish starting up
        }
        if (!isConnected) {
          setBootProgress(Math.min(32, 14 + attempts * 2));
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      try {
        const supCheck = await checkSupabaseConnection();
        if (supCheck.connected) {
          setIsSupabaseConnected(true);
          setIsServerConnected(true);
        }
      } catch (e) {
        console.warn('Supabase initial connection probe error:', e);
      }

      // Sau khi kết nối máy chủ Supabase thành công: Tự động chuyển thông điệp sang: "Đang tải dữ liệu, vui lòng chờ..."
      setBootProgress(38);
      setBootStatusMessage('Đang tải dữ liệu, vui lòng chờ...');
      setBootSubMessage('Tự động đồng bộ tài khoản Giáo viên, Học sinh từ Supabase Cloud...');

      let pulledData: any = null;
      try {
        const cloudRes = await fetch('/api/admin/cloud-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'google-sheets-get-all' }),
        });
        if (cloudRes.ok) {
          const resJson = await cloudRes.json();
          if (resJson && resJson.data) {
            pulledData = resJson.data;
          }
        }
      } catch (cloudErr) {
        console.warn('Backend cloud-sync get-all fetch error:', cloudErr);
      }

      if (pulledData && (Array.isArray(pulledData.teachers) || Array.isArray(pulledData.students))) {
        const demoAccountIds = new Set(['gv.demo', 'gv.mai', 'hs.demo', 'hs.nam']);
        const curAcc = getStoredAccounts();
        const tMap = new Map<string, any>();
        (curAcc.teachers || []).forEach((t: any) => {
          if (t?.idUser && !demoAccountIds.has(String(t.idUser).toLowerCase())) {
            tMap.set(String(t.idUser).toLowerCase(), t);
          }
        });
        const existingTIds = new Set<string>(Array.from(tMap.keys()));

        (pulledData.teachers || []).forEach((t: any) => {
          let idUser = String(t?.idUser || '').trim();
          if (demoAccountIds.has(idUser.toLowerCase())) return;
          const hoTen = String(t?.hoTen || '').trim();
          const chiDoan = String(t?.chiDoan || t?.toChuyenMon || t?.department || '').trim();
          if (!idUser && hoTen) {
            idUser = generateTeacherUsername(hoTen, chiDoan, existingTIds);
            existingTIds.add(idUser.toLowerCase());
          }
          if (idUser && !demoAccountIds.has(idUser.toLowerCase())) {
            const key = idUser.toLowerCase();
            const existing = tMap.get(key) || {};
            tMap.set(key, {
              ...existing,
              ...t,
              idUser: idUser,
              hoTen: hoTen || existing.hoTen || idUser,
              chiDoan: chiDoan || existing.chiDoan || 'Giáo viên',
              defaultPass: t.defaultPass || existing.defaultPass || '123',
              role: 'TEACHER',
            });
          }
        });

        const sMap = new Map<string, any>();
        (curAcc.students || []).forEach((s: any) => {
          if (s?.idUser && !demoAccountIds.has(String(s.idUser).toLowerCase())) {
            sMap.set(String(s.idUser).toLowerCase(), s);
          }
        });
        const existingSIds = new Set<string>(Array.from(sMap.keys()));

        (pulledData.students || []).forEach((s: any) => {
          let idUser = String(s?.idUser || '').trim();
          if (demoAccountIds.has(idUser.toLowerCase())) return;
          const hoTen = String(s?.hoTen || '').trim();
          const chiDoan = String(s?.chiDoan || '').trim();
          const khoi = String(s?.khoi || '').trim();
          if (!idUser && hoTen) {
            idUser = generateStudentUsername(hoTen, chiDoan || khoi, existingSIds);
            existingSIds.add(idUser.toLowerCase());
          }
          if (idUser && !demoAccountIds.has(idUser.toLowerCase())) {
            const key = idUser.toLowerCase();
            const existing = sMap.get(key) || {};
            sMap.set(key, {
              ...existing,
              ...s,
              idUser: idUser,
              hoTen: hoTen || existing.hoTen || idUser,
              chiDoan: chiDoan || existing.chiDoan || 'Học sinh',
              khoi: khoi || existing.khoi || '12',
              defaultPass: s.defaultPass || existing.defaultPass || '123',
              role: 'STUDENT',
            });
          }
        });

        saveStoredAccounts(Array.from(tMap.values()), Array.from(sMap.values()));

        if (Array.isArray(pulledData.admins) && pulledData.admins.length > 0) {
          const pulledAdmin = pulledData.admins[0];
          if (pulledAdmin) {
            const curAdmin = getStoredAdminProfile();
            const av = pulledAdmin.avatar || pulledAdmin.avatarUrl;
            saveStoredAdminProfile({
              ...curAdmin,
              avatar: av || curAdmin.avatar,
              avatarUrl: av || curAdmin.avatarUrl,
              customPass: pulledAdmin.customPass || curAdmin.customPass,
            });
          }
        }

        window.dispatchEvent(new Event('accounts-updated'));
      }

      setBootProgress(65);
      setBootSubMessage('Cập nhật nội dung khóa học, bài học và đề thi trực tuyến...');

      if (pulledData && Array.isArray(pulledData.courses)) {
        const cleanCourses = pulledData.courses.filter((c: any) => c && c.courseId && c.courseId !== 'course_demo_01');
        saveStoredCourses(cleanCourses);
        setCourses(cleanCourses);
        window.dispatchEvent(new Event('courses-updated'));
      }

      if (pulledData) {
        if (Array.isArray(pulledData.enrollments) && pulledData.enrollments.length > 0) {
          pulledData.enrollments.forEach((e: any) => {
            if (e?.idUser && e?.courseId && e?.courseId !== 'course_demo_01') {
              saveStoredEnrollment(e.idUser, e.courseId);
            }
          });
        }
        if (Array.isArray(pulledData.progress) && pulledData.progress.length > 0) {
          pulledData.progress.forEach((p: any) => {
            if (p?.idUser && p?.courseId && p?.lessonKey && p?.courseId !== 'course_demo_01') {
              saveStoredProgress(p.idUser, p.courseId, p.lessonKey, p.progressData);
            }
          });
        }
        if (Array.isArray(pulledData.resetPasswordRequests) && pulledData.resetPasswordRequests.length > 0) {
          saveAllStoredResetPasswordRequests(pulledData.resetPasswordRequests);
        }
        if (Array.isArray(pulledData.pendingRegistrations) && pulledData.pendingRegistrations.length > 0) {
          saveAllStoredPendingRegistrations(pulledData.pendingRegistrations);
        }
        if (Array.isArray(pulledData.qaQuestions) && pulledData.qaQuestions.length > 0) {
          saveStoredQaQuestions(pulledData.qaQuestions);
        }
        if (Array.isArray(pulledData.certificates) && pulledData.certificates.length > 0) {
          pulledData.certificates.forEach((cert: any) => {
            if (cert && cert.courseId !== 'course_demo_01') {
              saveStoredCertificate(cert);
            }
          });
        }
      }

      setBootProgress(85);
      setBootSubMessage('Đang đồng bộ tiến độ học tập & dữ liệu hệ thống...');

      await loadAppState();

      setBootProgress(100);
      setBootSubMessage('Hệ thống NQDieu LMS trên Supabase Cloud đã sẵn sàng');
      setLastSyncTime(formatSyncTime());

      // Hiển thị hoàn tất trước khi chuyển sang giao diện chính
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (bootErr) {
      console.warn('Boot sync error, attempting local load:', bootErr);
      await loadAppState();
      setBootProgress(100);
    } finally {
      setIsBooting(false);
      setIsSyncing(false);
    }
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      // 1. Đồng bộ dữ liệu lên máy chủ Supabase ngay
      const pushOk = await flushAllStoredDataToSupabase();
      if (!pushOk) {
        console.warn('Lưu trữ Supabase có thể chưa hoàn tất, đang thử nạp lại...');
      }

      // 2. Lấy dữ liệu từ máy chủ Supabase về Vercel / Client
      await loadAppState(currentUser || undefined);

      const syncTimeStr = formatSyncTime();
      setLastSyncTime(syncTimeStr);
      notifySyncStatus(
        'success',
        'Đã đồng bộ với máy chủ Supabase',
        'Dữ liệu học tập đã được lưu ngay lên Supabase và dữ liệu mới nhất đã được nạp về hệ thống thành công.'
      );
    } catch (err: any) {
      console.error('Lỗi khi bấm Đồng bộ:', err);
      notifySyncStatus(
        'error',
        'Lỗi đồng bộ Supabase',
        'Không thể đồng bộ với máy chủ Supabase: ' + (err?.message || err)
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Tự động lưu về máy chủ Supabase 5 phút / lần (chu kỳ 300.000 ms)
  useEffect(() => {
    if (!currentUser) return;

    const autoSyncInterval = setInterval(async () => {
      try {
        console.log('[Auto-Sync] Tự động lưu dữ liệu về máy chủ Supabase 5 phút / lần...');
        const ok = await flushAllStoredDataToSupabase();
        if (ok) {
          const syncTimeStr = formatSyncTime();
          setLastSyncTime(syncTimeStr);
          console.log('[Auto-Sync] Đã tự động lưu thành công lúc:', syncTimeStr);
        }
      } catch (err) {
        console.warn('[Auto-Sync] Cảnh báo khi tự động lưu về Supabase:', err);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(autoSyncInterval);
  }, [currentUser]);

  useEffect(() => {
    if (!hasBootRunRef.current) {
      hasBootRunRef.current = true;
      performBootSync();
    }

    checkServerConnectivity();
    checkSheetsConnectivity();

    const connectivityInterval = setInterval(() => {
      checkServerConnectivity();
      checkSheetsConnectivity();
    }, 20000);

    const handleSheetsConfigUpdated = () => {
      checkSheetsConnectivity();
    };
    window.addEventListener('google-sheets-config-updated', handleSheetsConfigUpdated);

    const handleAccountsUpdated = () => {
      if (!currentUser) return;
      const stored = getStoredAccounts();
      const cleanId = currentUser.idUser.toLowerCase();
      const found = [...stored.teachers, ...stored.students].find(
        (a) => a.idUser.toLowerCase() === cleanId
      );
      if (found) {
        const av = found.avatar || found.avatarUrl || '';
        if (currentUser.avatar !== av || (found.hoTen && found.hoTen !== currentUser.hoTen)) {
          const updated: User = {
            ...currentUser,
            avatar: av,
            avatarUrl: av,
            hoTen: found.hoTen || currentUser.hoTen,
            chiDoan: found.chiDoan || currentUser.chiDoan,
          };
          setCurrentUser(updated);
        }
      }
    };
    window.addEventListener('accounts-updated', handleAccountsUpdated);

    return () => {
      clearInterval(connectivityInterval);
      window.removeEventListener('google-sheets-config-updated', handleSheetsConfigUpdated);
      window.removeEventListener('accounts-updated', handleAccountsUpdated);
    };
  }, [currentUser?.idUser, currentUser?.role, checkSheetsConnectivity]);

  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    try {
      sessionStorage.setItem('nq_auth_user', JSON.stringify(user));
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('nq_auth_user');
      }
    } catch {}
    setActiveTab('overview');
    setActiveLearningCourseId(null);
    setDetailCourseId(null);

    // Refresh state and progress for this user immediately from Supabase
    await loadAppState(user);

    if (user.isFirstLogin) {
      setChangePassOpen(true);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Yêu cầu: Hệ thống chỉ đăng xuất khi dữ liệu đã được lưu vào supabase thành công
      const syncOk = await flushAllStoredDataToSupabase();
      if (!syncOk) {
        throw new Error('Máy chủ Supabase chưa xác nhận lưu trữ thành công.');
      }

      clearSyncToasts();
      clearSyncQueue();
      try {
        sessionStorage.removeItem('nq_auth_user');
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem('nq_auth_user');
        }
      } catch {}

      setUserProgress({});
      setQuizStatus({});
      setRegisteredIds([]);
      setCurrentUser(null);
      setActiveLearningCourseId(null);
      setDetailCourseId(null);
      setActiveTab('overview');

      notifySyncStatus(
        'success',
        'Đã lưu & Đăng xuất thành công',
        'Dữ liệu học tập đã được lưu an toàn lên máy chủ Supabase trước khi đăng xuất.'
      );
    } catch (err: any) {
      console.error('Lỗi khi đăng xuất:', err);
      notifySyncStatus(
        'error',
        'Chưa thể đăng xuất',
        'Không thể lưu dữ liệu lên máy chủ Supabase (' + (err?.message || 'Lỗi mạng') + '). Để bảo toàn dữ liệu học tập của bạn, hệ thống chưa cho phép đăng xuất. Vui lòng thử lại!'
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleEnroll = async (courseId: string, title: string) => {
    if (!currentUser) {
      setLoginOpen(true);
      return;
    }

    if (isTeacherTestingMode) {
      setTestRegisteredIds((prev) => (prev.includes(courseId) ? prev : [...prev, courseId]));
      alert(`[THỬ NGHIỆM] Đã đăng ký tạm thời khóa học "${title}". Kết quả học thử sẽ không lưu vào hệ thống.`);
      return;
    }

    let apiHandled = false;
    try {
      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idUser: currentUser.idUser,
          courseId,
          courseName: title,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(data.message);
          saveStoredEnrollment(currentUser.idUser, courseId);
          setRegisteredIds((prev) => (prev.includes(courseId) ? prev : [...prev, courseId]));
          fetchCoursesData();
          apiHandled = true;
        } else {
          alert(data.message || 'Đăng ký thất bại!');
          apiHandled = true;
        }
      } else {
        notifySyncStatus('warning', 'Đăng ký chưa đồng bộ máy chủ', `Không thể lưu đăng ký khóa học "${title}" lên máy chủ. Dữ liệu tạm thời lưu trên trình duyệt.`);
      }
    } catch (err) {
      console.warn('Backend API /api/enroll unavailable, registering locally.');
      notifySyncStatus('warning', 'Đăng ký chưa đồng bộ máy chủ', `Lỗi kết nối máy chủ khi đăng ký "${title}". Dữ liệu đã được lưu tạm thời trong LocalStorage.`);
    }

    if (!apiHandled) {
      saveStoredEnrollment(currentUser.idUser, courseId);
      setRegisteredIds((prev) => (prev.includes(courseId) ? prev : [...prev, courseId]));
      alert(`Đăng ký khóa học "${title}" thành công (Đã lưu tạm thời trên thiết bị này)!`);
    }
  };

  const handleSaveProgress = async (
    lessonIndex: string | number,
    progressData: any,
    detailResult: any = []
  ) => {
    if (!currentUser || !activeLearningCourseId) return;

    if (isTeacherTestingMode) {
      if (lessonIndex === 'QUIZ' || lessonIndex === 'QUIZ_SUBMITTED') {
        const currentQStatus = testQuizStatus[activeLearningCourseId] || {};
        const prevAttempts = typeof currentQStatus === 'number' ? 1 : (currentQStatus.attempts || 0);
        const nextAttempt = typeof progressData === 'object' && progressData !== null && progressData.attempts !== undefined
          ? Math.max(1, Number(progressData.attempts))
          : (prevAttempts + 1);
        const updatedQStatus = {
          attempts: nextAttempt,
          lastScore: typeof progressData === 'object' ? (progressData.lastScore ?? progressData.score ?? 0) : Number(progressData) || 0,
          durationSec: typeof progressData === 'object' ? progressData.durationSec : 0,
          detail: Array.isArray(detailResult) ? detailResult : [],
        };

        setTestQuizStatus((prev) => ({
          ...prev,
          [activeLearningCourseId]: updatedQStatus,
        }));

        setTestUserProgress((prev) => ({
          ...prev,
          [activeLearningCourseId]: {
            ...(prev[activeLearningCourseId] || {}),
            QUIZ_SUBMITTED: updatedQStatus,
            QUIZ: updatedQStatus,
          },
        }));
      } else if (typeof lessonIndex === 'string' && lessonIndex.startsWith('LESSON_EXERCISE_')) {
        const scoreNum = Number(progressData) || 0;
        const lessonIdxStr = lessonIndex.replace('LESSON_EXERCISE_', '');
        const lIdx = parseInt(lessonIdxStr, 10);
        const activeC = courses.find((c) => c.courseId === activeLearningCourseId);
        const exCfg = activeC?.lessons?.[lIdx]?.exerciseConfig;
        const passScore = exCfg?.passingScore !== undefined ? Number(exCfg.passingScore) : 80;
        const exObj = {
          lastScore: scoreNum,
          passed: scoreNum >= passScore,
          detail: detailResult || [],
        };

        setTestUserProgress((prev) => ({
          ...prev,
          [activeLearningCourseId]: {
            ...(prev[activeLearningCourseId] || {}),
            [lessonIndex]: exObj,
          },
        }));
      } else {
        setTestUserProgress((prev) => {
          const courseProg = prev[activeLearningCourseId] || {};
          const key = typeof lessonIndex === 'number' ? `LESSON_${lessonIndex}` : lessonIndex;
          return {
            ...prev,
            [activeLearningCourseId]: {
              ...courseProg,
              [key]: progressData,
            },
          };
        });
      }
      return;
    }

    let finalPayloadData = progressData;

    if (lessonIndex === 'QUIZ' || lessonIndex === 'QUIZ_SUBMITTED') {
      const currentQStatus = quizStatus[activeLearningCourseId] || userProgress[activeLearningCourseId]?.['QUIZ_SUBMITTED'] || userProgress[activeLearningCourseId]?.['QUIZ'] || {};
      const prevAttempts = Math.max(
        typeof currentQStatus === 'number' ? 1 : (currentQStatus.attempts || 0),
        typeof userProgress[activeLearningCourseId]?.['QUIZ_SUBMITTED'] === 'object'
          ? (userProgress[activeLearningCourseId]?.['QUIZ_SUBMITTED']?.attempts || 0)
          : 0,
        typeof userProgress[activeLearningCourseId]?.['QUIZ'] === 'object'
          ? (userProgress[activeLearningCourseId]?.['QUIZ']?.attempts || 0)
          : 0
      );
      const scoreNum = typeof progressData === 'object' && progressData !== null
        ? Number(progressData.lastScore ?? progressData.score ?? progressData.quizScore ?? 0)
        : Number(progressData) || 0;
      const durationSec = typeof progressData === 'object' && progressData !== null ? Number(progressData.durationSec || 0) : 0;
      const violations = typeof progressData === 'object' && progressData !== null ? Number(progressData.violations ?? progressData.cheatWarnings ?? 0) : 0;
      const existingFirstScore = typeof currentQStatus === 'object' && currentQStatus !== null ? currentQStatus.firstScore : undefined;

      const activeC = courses.find((c) => c.courseId === activeLearningCourseId);
      const rawPassing = activeC?.quizConfig?.passingScore !== undefined ? Number(activeC.quizConfig.passingScore) : 80;
      const p1Score = Number(activeC?.quizConfig?.p1?.totalScore || 0);
      const p2Count = Number(activeC?.quizConfig?.p2?.count || activeC?.quizConfig?.p2?.bank?.length || 0);
      const p2Score = p2Count * (activeC?.quizConfig?.p2?.scores?.s4 || 1.0);
      const p3Score = Number(activeC?.quizConfig?.p3?.totalScore || 0);
      const quizMaxPoints = (p1Score + p2Score + p3Score) > 0 ? (p1Score + p2Score + p3Score) : 10;
      const passScore = (quizMaxPoints <= 10 && rawPassing > 10)
        ? Math.round(((rawPassing / 100) * quizMaxPoints) * 10) / 10
        : rawPassing;

      const isPassed = typeof progressData === 'object' && progressData?.passed !== undefined
        ? Boolean(progressData.passed)
        : scoreNum >= passScore;

      const prevScores: number[] = Array.isArray(currentQStatus?.scores)
        ? currentQStatus.scores
        : (currentQStatus?.lastScore !== undefined ? [Number(currentQStatus.lastScore)] : []);
      const newScores = [...prevScores, scoreNum];

      const nextAttempt = typeof progressData === 'object' && progressData !== null && progressData?.attempts !== undefined
        ? Math.max(1, Number(progressData.attempts))
        : (prevAttempts + 1);

      const prevHistory: any[] = Array.isArray(currentQStatus?.attemptsHistory)
        ? currentQStatus.attemptsHistory
        : [];
      const lastHistory = prevHistory[prevHistory.length - 1];
      const isDuplicate = lastHistory && (
        lastHistory.attempt === nextAttempt ||
        (lastHistory.submittedAt && Math.abs(new Date().getTime() - new Date(lastHistory.submittedAt).getTime()) < 5000)
      );
      const newHistory = isDuplicate
        ? prevHistory
        : [
            ...prevHistory,
            {
              attempt: nextAttempt,
              score: scoreNum,
              passed: isPassed,
              violations,
              durationSec,
              submittedAt: new Date().toISOString(),
            },
          ];

      const bestScore = Math.max(...newScores, scoreNum);

      // Theo yêu cầu:
      // "Đối với kết quả làm bài thu hoạch cuối khóa chỉ lưu số lần làm bài, kết quả làm bài mỗi lần + đạt / chưa đạt + số lần vi phạm để làm căn cứu cấp giấy chứng nhận (không lưu các dữ liệu khác như để học sinh làm ...)"
      const updatedQStatus = {
        attempts: nextAttempt,
        lastScore: scoreNum,
        score: scoreNum,
        firstScore: existingFirstScore !== undefined ? existingFirstScore : scoreNum,
        bestScore,
        scores: newScores,
        attemptsHistory: newHistory,
        passed: isPassed,
        status: isPassed ? 'ĐẠT' : 'CHƯA ĐẠT',
        violations,
        isCompleted: true,
        updatedAt: new Date().toISOString(),
      };
      finalPayloadData = updatedQStatus;

      setQuizStatus((prev) => ({
        ...prev,
        [activeLearningCourseId]: updatedQStatus,
      }));

      setUserProgress((prev) => ({
        ...prev,
        [activeLearningCourseId]: {
          ...(prev[activeLearningCourseId] || {}),
          QUIZ_SUBMITTED: updatedQStatus,
          QUIZ: updatedQStatus,
        },
      }));

      saveStoredQuizResult(currentUser.idUser, activeLearningCourseId, updatedQStatus);
      saveStoredProgress(currentUser.idUser, activeLearningCourseId, 'QUIZ_SUBMITTED', updatedQStatus);
    } else if (typeof lessonIndex === 'string' && lessonIndex.startsWith('LESSON_EXERCISE_')) {
      const scoreNum = typeof progressData === 'object' && progressData !== null
        ? Number(progressData.lastScore ?? progressData.score ?? progressData.quizScore ?? 0)
        : Number(progressData) || 0;
      const lessonIdxStr = lessonIndex.replace('LESSON_EXERCISE_', '');
      const lIdx = parseInt(lessonIdxStr, 10);
      const activeC = courses.find((c) => c.courseId === activeLearningCourseId);
      const exCfg = activeC?.lessons?.[lIdx]?.exerciseConfig;
      const rawPassing = exCfg?.passingScore !== undefined ? Number(exCfg.passingScore) : 80;
      const exP1 = Number(exCfg?.p1?.totalScore || 0);
      const exP2Count = Number(exCfg?.p2?.count || exCfg?.p2?.bank?.length || 0);
      const exP2 = exP2Count * (exCfg?.p2?.scores?.s4 || 1.0);
      const exP3 = Number(exCfg?.p3?.totalScore || 0);
      const exMax = (exP1 + exP2 + exP3) > 0 ? (exP1 + exP2 + exP3) : 10;
      const passScore = (exMax <= 10 && rawPassing > 10)
        ? Math.round(((rawPassing / 100) * exMax) * 10) / 10
        : rawPassing;

      const isPassed = typeof progressData === 'object' && progressData?.passed !== undefined
        ? Boolean(progressData.passed)
        : scoreNum >= passScore;

      // Theo yêu cầu:
      // "Đối với kết quả bài tập củng cố chỉ lưu kết quả bài làm hiện tại + đạt/chưa đạt (chỉ lưu điểm để làm căn cứ cấp giấy chứng nhận không cần lưu các dữ liệu khác)"
      const exObj = {
        score: scoreNum,
        lastScore: scoreNum,
        passed: isPassed,
        status: isPassed ? 'ĐẠT' : 'CHƯA ĐẠT',
        isCompleted: true,
        updatedAt: new Date().toISOString(),
      };
      finalPayloadData = exObj;

      setUserProgress((prev) => ({
        ...prev,
        [activeLearningCourseId]: {
          ...(prev[activeLearningCourseId] || {}),
          [lessonIndex]: exObj,
        },
      }));

      saveStoredProgress(currentUser.idUser, activeLearningCourseId, lessonIndex, exObj);
    } else {
      let finalMergedData = progressData;

      setUserProgress((prev) => {
        const courseProg = prev[activeLearningCourseId] || {};
        const key = typeof lessonIndex === 'number' ? `LESSON_${lessonIndex}` : lessonIndex;
        const existingData = courseProg[key] || {};

        if (typeof progressData === 'object' && progressData !== null) {
          const oldWatched = typeof existingData === 'object' && existingData !== null ? Number(existingData.watchedSec || 0) : 0;
          const newWatched = Number(progressData.watchedSec || 0);
          const maxWatched = Math.max(oldWatched, newWatched);
          const isCompleted = Boolean((existingData && existingData.isCompleted) || progressData.isCompleted);

          finalMergedData = {
            ...(typeof existingData === 'object' ? existingData : {}),
            ...progressData,
            watchedSec: maxWatched,
            isCompleted,
          };
        }

        return {
          ...prev,
          [activeLearningCourseId]: {
            ...courseProg,
            [key]: finalMergedData,
          },
        };
      });

      finalPayloadData = finalMergedData;

      if (typeof lessonIndex === 'number' || (typeof lessonIndex === 'string' && lessonIndex.startsWith('LESSON_'))) {
        saveStoredProgress(currentUser.idUser, activeLearningCourseId, lessonIndex, finalMergedData);
      }
    }

    try {
      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idUser: currentUser.idUser,
          courseId: activeLearningCourseId,
          lessonIndex,
          progressData: finalPayloadData,
          detailResult,
        }),
      });
      if (res.ok) {
        if (lessonIndex === 'QUIZ' || lessonIndex === 'QUIZ_SUBMITTED') {
          notifySyncStatus(
            'success',
            'Đã lưu kết quả bài thu hoạch',
            'Kết quả bài thu hoạch cuối khóa đã được đồng bộ lên máy chủ thành công.'
          );
        } else if (typeof lessonIndex === 'string' && lessonIndex.startsWith('LESSON_EXERCISE_')) {
          notifySyncStatus(
            'success',
            'Đã lưu kết quả bài tập',
            'Kết quả bài tập củng cố đã được đồng bộ lên máy chủ thành công.'
          );
        }
      } else {
        notifySyncStatus('warning', 'Tiến độ chưa đồng bộ máy chủ', 'Lỗi lưu tiến độ bài học lên máy chủ. Đã lưu tạm thời trong bộ nhớ trình duyệt.');
      }
    } catch (err) {
      console.warn('Backend API /api/progress unavailable, saved progress locally.', err);
      notifySyncStatus('warning', 'Tiến độ chưa đồng bộ máy chủ', 'Không thể kết nối máy chủ để lưu tiến độ. Đã lưu tạm thời trong LocalStorage.');
    }

    if (
      lessonIndex === 'QUIZ' ||
      lessonIndex === 'QUIZ_SUBMITTED' ||
      (typeof lessonIndex === 'string' && lessonIndex.includes('EXERCISE'))
    ) {
      fetchCoursesData();
    }
  };

  const handleCourseSaved = (savedCourse: Course) => {
    setCourses((prev) => {
      const existingIdx = prev.findIndex((c) => c.courseId === savedCourse.courseId);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = savedCourse;
        return next;
      }
      return [savedCourse, ...prev];
    });


  };

  const activeCourse = courses.find((c) => c.courseId === activeLearningCourseId);
  const detailCourse = courses.find((c) => c.courseId === detailCourseId);

  const effectiveUserProgress = isTeacherTestingMode ? testUserProgress : userProgress;
  const effectiveQuizStatus = isTeacherTestingMode ? testQuizStatus : quizStatus;
  const effectiveRegisteredIds = useMemo(() => {
    if (isTeacherTestingMode) {
      return testRegisteredIds.length > 0 ? testRegisteredIds : courses.map((c) => c.courseId);
    }
    return registeredIds;
  }, [isTeacherTestingMode, testRegisteredIds, courses, registeredIds]);

  const [congratulationData, setCongratulationData] = useState<{
    isOpen: boolean;
    badge?: BadgeItem | null;
    certificate?: IssuedCertificate | null;
  }>({ isOpen: false });

  const [storageReady, setStorageReady] = useState(() => isStorageHydrated());

  useEffect(() => {
    const handleHydrated = () => setStorageReady(true);
    window.addEventListener('storage-hydrated', handleHydrated);
    if (isStorageHydrated()) setStorageReady(true);
    return () => window.removeEventListener('storage-hydrated', handleHydrated);
  }, []);

  // Auto-check for newly achieved badges or certificates
  // Chỉ kiểm tra khi hệ thống đã tải xong dữ liệu từ Supabase (storageReady và không trong trạng thái booting)
  useEffect(() => {
    if (storageReady && !isBooting && !loading && currentUser?.idUser && courses.length > 0) {
      const { newBadges, newCertificates } = checkNewAchievementsAndCertificates(
        currentUser,
        courses,
        effectiveUserProgress,
        effectiveQuizStatus,
        effectiveRegisteredIds
      );

      if (newBadges.length > 0 || newCertificates.length > 0) {
        setCongratulationData({
          isOpen: true,
          badge: newBadges[0] || null,
          certificate: newCertificates[0] || null,
        });
      }
    }
  }, [
    storageReady,
    isBooting,
    loading,
    currentUser?.idUser,
    courses,
    effectiveUserProgress,
    effectiveQuizStatus,
    effectiveRegisteredIds,
  ]);

  // Auto-check notifications & unread count
  useEffect(() => {
    const updateUnread = () => {
      const all = getStoredNotifications();
      if (!currentUser) {
        setUnreadNotifCount(0);
        return;
      }
      const cleanId = String(currentUser.idUser || '').trim().toLowerCase();
      const role = currentUser.role;
      const userNotifs = all.filter((n: any) => {
        const rec = String(n.recipientId || '').trim().toLowerCase();
        if (rec === cleanId) return true;
        if (rec === 'all') return true;
        if (rec === 'students' && role === 'STUDENT') return true;
        if (rec === 'teachers' && (role === 'TEACHER' || role === 'ADMIN')) return true;
        return false;
      });
      const unread = userNotifs.filter((n: any) => !n.isRead).length;
      setUnreadNotifCount((prev) => (prev !== unread ? unread : prev));
    };

    if (currentUser?.idUser) {
      checkAndDispatchAccountNotifications(currentUser);
      if (courses.length > 0) {
        checkAndDispatchCourseNotifications(courses, currentUser);
      }
    }
    updateUnread();

    const handleUpdate = () => {
      if (currentUser?.idUser) {
        checkAndDispatchAccountNotifications(currentUser);
      }
      updateUnread();
    };

    window.addEventListener('lms-notifications-updated', handleUpdate);
    window.addEventListener('pending-registrations-updated', handleUpdate);
    window.addEventListener('reset-requests-updated', handleUpdate);
    const interval = setInterval(handleUpdate, 10000);
    return () => {
      window.removeEventListener('lms-notifications-updated', handleUpdate);
      window.removeEventListener('pending-registrations-updated', handleUpdate);
      window.removeEventListener('reset-requests-updated', handleUpdate);
      clearInterval(interval);
    };
  }, [currentUser?.idUser, currentUser?.role, courses]);

  const isTeacherOrAdmin =
    currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'TEACHER');

  const showTeacherDashboard = isTeacherOrAdmin && !isTeacherTestingMode;

  const handleStartLearning = async (courseId: string) => {
    const target = courses.find((c) => c.courseId === courseId);
    if (target) {
      const status = getCourseTimeStatus(target);
      const isTeacher = currentUser?.role === 'ADMIN' || currentUser?.role === 'TEACHER';
      if (status === 'NOT_STARTED' && !isTeacher) {
        alert(`Khóa học chưa đến thời gian mở!\nThời gian mở: ${formatDateTimeDisplay(target.startDate)}`);
        return;
      }
    }

    // Always fetch latest progress from server for the student
    if (currentUser?.idUser && !isTeacherTestingMode) {
      try {
        const res = await fetch(`/api/progress?idUser=${encodeURIComponent(currentUser.idUser)}&courseId=${encodeURIComponent(courseId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.progress)) {
            const courseProg: Record<string, any> = {};
            let hasServerQuiz = false;
            data.progress.forEach((p: any) => {
              if (p && p.lessonKey) {
                let pData = p.progressData;
                if (typeof pData === 'string') {
                  try { pData = JSON.parse(pData); } catch {}
                }
                courseProg[p.lessonKey] = pData;
                if (p.lessonKey === 'QUIZ_SUBMITTED' || p.lessonKey === 'QUIZ') {
                  hasServerQuiz = true;
                }
              }
            });

            setUserProgress((prev) => {
              const currentCourseProg = { ...(prev[courseId] || {}) };
              if (!hasServerQuiz) {
                delete currentCourseProg['QUIZ_SUBMITTED'];
                delete currentCourseProg['QUIZ'];
                delete currentCourseProg['quiz_submitted'];
                delete currentCourseProg['quiz'];
                deleteStoredQuizProgress(currentUser.idUser, courseId);
                deleteStoredQuizStatus(currentUser.idUser, courseId);
              }
              return {
                ...prev,
                [courseId]: {
                  ...currentCourseProg,
                  ...courseProg,
                },
              };
            });

            if (!hasServerQuiz) {
              setQuizStatus((prev) => {
                const next = { ...prev };
                delete next[courseId];
                return next;
              });

              // Check certificate for this course on server and clear if revoked
              fetch(`/api/certificates?idUser=${encodeURIComponent(currentUser.idUser)}&courseId=${encodeURIComponent(courseId)}`)
                .then((r) => r.ok ? r.json() : null)
                .then((cData) => {
                  if (cData && cData.success && !cData.certificate) {
                    deleteStoredCertificateForUserCourse(currentUser.idUser, courseId);
                    setRegisteredIds((prev) => prev.filter((id) => id !== courseId || getUserLocalEnrollments(currentUser.idUser).includes(courseId)));
                  }
                })
                .catch(() => {});
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load fresh progress on start learning:', e);
      }
    }

    setActiveLearningCourseId(courseId);
  };

  // Handler for selecting tabs in Sidebar
  const handleSelectTab = (tabId: SidebarTabId, extraData?: any) => {
    if (tabId === 'overview') {
      setActiveTab('overview');
      setActiveLearningCourseId(null);
    } else if (tabId === 'manageCourses') {
      setActiveTab('manageCourses');
      setActiveLearningCourseId(null);
    } else if (tabId === 'myCourses' || tabId === 'allCourses') {
      setActiveTab(tabId);
      setActiveLearningCourseId(null);
    } else if (tabId === 'testingMode') {
      handleToggleTeacherTestingMode();
    } else if (tabId === 'achievements') {
      setActiveTab('achievements');
      setActiveLearningCourseId(null);
    } else if (tabId === 'games') {
      setActiveTab('games');
      setActiveLearningCourseId(null);
    } else if (tabId === 'leaderboard') {
      setActiveTab('leaderboard');
      setActiveLearningCourseId(null);
    } else if (tabId === 'notifications') {
      setActiveTab('notifications');
      setActiveLearningCourseId(null);
    } else if (tabId === 'qa') {
      setActiveTab('qa');
      setActiveLearningCourseId(null);
    } else if (tabId === 'reports') {
      setActiveTab('reports');
      setActiveLearningCourseId(null);
    } else if (tabId === 'ai') {
      setActiveTab('ai');
      setActiveLearningCourseId(null);
    } else if (tabId === 'admin') {
      setActiveTab('admin');
      setActiveLearningCourseId(null);
    } else if (tabId === 'accounts') {
      setActiveTab('accounts');
      setActiveLearningCourseId(null);
    } else if (tabId === 'adminData') {
      setActiveTab('adminData');
      setActiveLearningCourseId(null);
    } else if (tabId === 'server') {
      setActiveTab('server');
      setActiveLearningCourseId(null);
    } else if (tabId === 'createCourse') {
      setCourseToEdit(extraData || null);
      setCourseEditorOpen(true);
    }
  };

  if (isBooting) {
    return (
      <BootSplashScreen
        progress={bootProgress}
        statusMessage={bootStatusMessage}
        subMessage={bootSubMessage}
        isCompleted={bootProgress >= 100}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/70 text-slate-800 font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* 1. Left Sidebar Navigation - ONLY WHEN LOGGED IN */}
      {currentUser && (
        <AppSidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          currentUser={currentUser}
          isTeacherTestingMode={isTeacherTestingMode}
          pendingCounts={{
            totalPending: pendingResetCount + pendingRegCount,
            pendingReset: pendingResetCount,
            pendingReg: pendingRegCount,
            pendingQa: pendingQaCount,
            unreadNotif: unreadNotifCount,
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isMobileOpen={isSidebarMobileOpen}
          onCloseMobile={() => setIsSidebarMobileOpen(false)}
          onOpenLogin={() => setLoginOpen(true)}
          onOpenProfileUpdate={() => setProfileUpdateOpen(true)}
        />
      )}

      {/* 2. Main Content Wrapper that shifts with Sidebar */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          !currentUser ? 'pl-0' : isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64 xl:pl-72'
        }`}
      >
        {/* Top Header Bar */}
        <AppTopHeader
          currentUser={currentUser}
          onOpenLogin={() => setLoginOpen(true)}
          onOpenChangePass={() => setChangePassOpen(true)}
          onOpenProfileUpdate={() => setProfileUpdateOpen(true)}
          onOpenAchievements={() => {
            if (activeLearningCourseId) {
              setActiveLearningCourseId(null);
            }
            setActiveTab('achievements');
          }}
          onOpenNotifications={() => {
            setNotificationSubTab('NOTIFICATIONS');
            if (activeLearningCourseId) {
              setActiveLearningCourseId(null);
            }
            setActiveTab('notifications');
          }}
          unreadNotificationCount={unreadNotifCount}
          onLogout={handleLogout}
          isServerConnected={isServerConnected}
          isGoogleSheetsConnected={isGoogleSheetsConnected}
          onOpenDataManagement={() => setAdminDataModalOpen(true)}
          onManualSync={handleManualSync}
          isSyncing={isSyncing}
          lastSyncTime={lastSyncTime}
          onToggleSidebarMobile={() => setIsSidebarMobileOpen(!isSidebarMobileOpen)}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebarCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isTeacherTestingMode={isTeacherTestingMode}
          onToggleTeacherTestingMode={handleToggleTeacherTestingMode}
        />

        {/* Main Canvas Workspace Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-5 pb-12 sm:pb-16 transition-all duration-300">
          {/* Banner Announcement when Teacher is in Test Mode */}
          {isTeacherTestingMode && (
            <div className="bg-amber-500 text-slate-950 p-4 rounded-2xl mb-6 shadow-md border border-amber-400 flex items-center justify-between gap-3 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-950/10 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6 text-slate-950" />
                </div>
                <div>
                  <div className="font-extrabold text-sm sm:text-base flex items-center gap-2 flex-wrap">
                    <span>CHẾ ĐỘ THỬ NGHIỆM VAI TRÒ HỌC SINH</span>
                    <span className="text-[10px] bg-slate-950 text-amber-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Dành cho Giáo viên
                    </span>
                  </div>
                  <p className="text-xs text-slate-900 font-medium">
                    Bạn đang trải nghiệm khóa học dưới vai trò Học sinh. Mọi kết quả học và bài thi thử nghiệm sẽ <strong className="underline decoration-slate-950 underline-offset-2">TỰ ĐỘNG XÓA KHỎI HỆ THỐNG</strong> ngay khi bạn trở về vai trò Giáo viên.
                  </p>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-24 text-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-[#0B4D9C] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="font-semibold text-sm">Đang tải dữ liệu hệ thống NQDIEU LEARNING...</p>
            </div>
          ) : activeLearningCourseId && activeCourse && currentUser ? (
            /* Learning & Exam Workspace View */
            <LearningWorkspace
              course={activeCourse}
              currentUser={currentUser}
              userProgress={effectiveUserProgress}
              quizStatus={effectiveQuizStatus}
              onBackToDashboard={() => setActiveLearningCourseId(null)}
              onSaveProgress={handleSaveProgress}
            />
          ) : showTeacherDashboard ? (
            /* Teacher / Admin Management View (Tab "Tổng quan") */
            <TeacherDashboard
              courses={courses}
              currentUser={currentUser}
              onRefreshCourses={fetchCoursesData}
              onCourseSaved={handleCourseSaved}
              onOpenAccountsModal={() => setAccountsModalOpen(true)}
              onOpenNotificationsManager={() => {
                setNotificationSubTab('NOTIFICATIONS');
                setActiveTab('notifications');
              }}
              onToggleTeacherTestingMode={handleToggleTeacherTestingMode}
              activeTab={activeTab}
              onSelectTab={handleSelectTab}
              onOpenCourseEditor={(course) => {
                setCourseToEdit(course || null);
                setCourseEditorOpen(true);
              }}
              onStartLearning={handleStartLearning}
              onOpenCourseDetail={(id) => setDetailCourseId(id)}
              notificationSubTab={notificationSubTab}
            />
          ) : activeTab === 'notifications' ? (
            /* Student Notifications & Notice Board Tab View */
            <NotificationCenterModal
              isInline={true}
              currentUser={currentUser}
              courses={courses}
              initialSubTab={notificationSubTab}
              onClose={() => setActiveTab('overview')}
              onOpenCourse={(cId) => handleStartLearning(cId)}
              onOpenAchievements={() => setActiveTab('achievements')}
              onOpenAccountManagement={() => setAccountsModalOpen(true)}
            />
          ) : activeTab === 'achievements' && currentUser ? (
            /* Student Achievements Seamless Tab View */
            <StudentAchievementsModal
              isInline={true}
              isOpen={true}
              currentUser={currentUser}
              courses={courses}
              userProgress={effectiveUserProgress}
              quizStatus={effectiveQuizStatus}
              registeredIds={effectiveRegisteredIds}
              onClose={() => setActiveTab('overview')}
            />
          ) : activeTab === 'games' ? (
            /* Learning Games View (Student, Teacher, Guest) */
            <LearningGamesView
              currentUser={currentUser}
              courses={courses}
              onOpenLogin={() => setLoginOpen(true)}
            />
          ) : activeTab === 'leaderboard' && currentUser ? (
            /* Student Leaderboard Dedicated Tab View */
            <StudentLeaderboardView
              currentUser={currentUser}
              courses={courses}
              userProgress={effectiveUserProgress}
              quizStatus={effectiveQuizStatus}
              registeredIds={effectiveRegisteredIds}
              onStartLearning={handleStartLearning}
            />
          ) : (
            /* Student / Public View */
            <PublicCourseSection
              courses={courses}
              registeredIds={effectiveRegisteredIds}
              currentUser={currentUser}
              activeTab={activeTab}
              userProgress={effectiveUserProgress}
              quizStatus={effectiveQuizStatus}
              isTeacherTestingMode={isTeacherTestingMode}
              onOpenCourseDetail={(id) => setDetailCourseId(id)}
              onStartLearning={handleStartLearning}
              onEnroll={handleEnroll}
              onOpenLogin={() => setLoginOpen(true)}
            />
          )}
        </main>

        {/* Footer */}
        <Footer isCollapsed={isSidebarCollapsed} hasUser={!!currentUser} />
      </div>

      {/* Global Modals */}
      <CourseDetailModal
        isOpen={!!detailCourseId}
        course={detailCourse || null}
        registeredIds={effectiveRegisteredIds}
        userProgress={effectiveUserProgress}
        quizStatus={effectiveQuizStatus}
        currentUser={currentUser}
        onClose={() => setDetailCourseId(null)}
        onStartLearning={handleStartLearning}
        onEnroll={handleEnroll}
      />

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <ChangePasswordModal
        isOpen={changePassOpen}
        currentUser={currentUser}
        isFirstLogin={currentUser?.isFirstLogin}
        onSuccess={() => {
          setChangePassOpen(false);
          if (currentUser) {
            const updated = { ...currentUser, isFirstLogin: false };
            setCurrentUser(updated);
          }
        }}
        onClose={() => setChangePassOpen(false)}
      />

      <ProfileUpdateModal
        isOpen={profileUpdateOpen}
        onClose={() => setProfileUpdateOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={(updated) => {
          setCurrentUser(updated);
        }}
      />

      <AccountManagementModal
        isOpen={accountsModalOpen}
        currentUser={currentUser}
        onClose={() => setAccountsModalOpen(false)}
        onRefreshData={fetchCoursesData}
      />

      {/* Teacher Q&A Modal Box */}
      <TeacherQaModal
        isOpen={qaModalOpen}
        onClose={() => setQaModalOpen(false)}
        currentUser={currentUser}
        courses={courses}
      />

      {/* LMS Analytics & Report Modal Box */}
      <LmsReportModal
        isOpen={reportsModalOpen}
        onClose={() => setReportsModalOpen(false)}
        currentUser={currentUser}
        courses={courses}
      />

      {/* Teacher AI Assistant Modal Box */}
      <TeacherAiModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onCourseCreated={(newCourse) => {
          handleCourseSaved(newCourse);
          fetchCoursesData();
        }}
        onOpenCourseEditor={(prefilledCourse) => {
          setAiModalOpen(false);
          setCourseToEdit(prefilledCourse);
          setCourseEditorOpen(true);
        }}
      />

      {/* Admin Data Management & Clean-up Modal Box */}
      {isAdmin && (
        <AdminDataManagementModal
          isOpen={adminDataModalOpen}
          onClose={() => setAdminDataModalOpen(false)}
          currentUser={currentUser}
          courses={courses}
          onDataPurged={fetchCoursesData}
        />
      )}

      {/* Course Editor Modal Box */}
      <CourseEditorModal
        isOpen={courseEditorOpen}
        courseToEdit={courseToEdit}
        currentUser={currentUser}
        onClose={() => {
          setCourseEditorOpen(false);
          setCourseToEdit(null);
        }}
        onSaveSuccess={(savedCourse) => {
          setCourseEditorOpen(false);
          setCourseToEdit(null);
          if (savedCourse) {
            handleCourseSaved(savedCourse);
          }
          fetchCoursesData();
        }}
      />

      <StudentAchievementsModal
        isOpen={achievementsModalOpen}
        onClose={() => setAchievementsModalOpen(false)}
        currentUser={currentUser}
        courses={courses}
        userProgress={effectiveUserProgress}
        quizStatus={effectiveQuizStatus}
        registeredIds={effectiveRegisteredIds}
      />

      <CongratulationModal
        isOpen={congratulationData.isOpen}
        onClose={() => setCongratulationData({ isOpen: false })}
        badge={congratulationData.badge}
        certificate={congratulationData.certificate}
      />

      <NotificationCenterModal
        isOpen={notificationsModalOpen}
        onClose={() => setNotificationsModalOpen(false)}
        currentUser={currentUser}
        courses={courses}
        mode={notificationsModalMode}
        onOpenCourse={(cId) => {
          setNotificationsModalOpen(false);
          handleStartLearning(cId);
        }}
        onOpenAchievements={() => {
          setNotificationsModalOpen(false);
          if (activeLearningCourseId) {
            setActiveLearningCourseId(null);
          }
          setActiveTab('achievements');
        }}
        onOpenAccountManagement={() => {
          setNotificationsModalOpen(false);
          setAccountsModalOpen(true);
        }}
      />

      {/* Logout Supabase Saving Overlay */}
      {isLoggingOut && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-white">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-400/30 shadow-inner">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white tracking-tight">Đang lưu dữ liệu lên máy chủ Supabase...</h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
                Hệ thống đang đồng bộ toàn bộ tiến độ học tập, bài tập củng cố và điểm số lên máy chủ Supabase trước khi đăng xuất an toàn. Vui lòng không đóng trình duyệt.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 py-2 px-3 rounded-xl border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span>Đang xác nhận với máy chủ Supabase...</span>
            </div>
          </div>
        </div>
      )}

      {/* Sync Notification Toast */}
      <SyncNotificationToast />
    </div>
  );
}
