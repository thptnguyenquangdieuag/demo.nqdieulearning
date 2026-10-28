import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Course, User, ActiveQuizQuestion, ActiveQuizDetailResult, IssuedCertificate } from '../types';
import { CertificateView } from './CertificateView';
import { AiTutorChat } from './AiTutorChat';
import { LeaderboardModal } from './LeaderboardModal';
import { AttendanceExportModal } from './AttendanceExportModal';
import { LessonQaSection } from './LessonQaSection';
import { getStoredCertificates, saveStoredCertificate, saveStoredDailyStudyTime, deleteStoredCertificateForUserCourse, deleteStoredQuizStatus, deleteStoredQuizProgress } from '../lib/storage';
import { getCourseTimeStatus, formatDateTimeDisplay, getTimeRemainingText } from '../lib/courseTime';
import {
  ArrowLeft,
  ArrowRight,
  PlaySquare,
  FileText,
  Presentation,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Grid3X3,
  CheckCircle2,
  XCircle,
  Award,
  Send,
  HelpCircle,
  PlayCircle,
  Lock,
  FileCheck2,
  BookOpen,
  RotateCcw,
  Trophy,
  Video,
  ExternalLink,
  Bot,
  Sparkles,
  X,
  UserCheck,
  FileSpreadsheet,
} from 'lucide-react';

interface LearningWorkspaceProps {
  course: Course;
  currentUser: User;
  userProgress: Record<string, any>;
  quizStatus: Record<string, any>;
  onBackToDashboard: () => void;
  onSaveProgress: (
    lessonIndex: string | number,
    progressData: any,
    detailResult?: any
  ) => void;
}

export const LearningWorkspace: React.FC<LearningWorkspaceProps> = ({
  course,
  currentUser,
  userProgress,
  quizStatus,
  onBackToDashboard,
  onSaveProgress,
}) => {
  const [currentLessonIdx, setCurrentLessonIdx] = useState(0);
  const [learningMode, setLearningMode] = useState<'VIDEO' | 'DOC' | 'PPT'>('VIDEO');

  // Study timer state
  const [timeWatchedSec, setTimeWatchedSec] = useState(0);
  const [targetDurationSec, setTargetDurationSec] = useState(60);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isWindowActive, setIsWindowActive] = useState(true);

  // Active view: 'STUDY' | 'QUIZ' | 'REVIEW' | 'CERTIFICATE' | 'ONLINE_ROOM'
  const [activeView, setActiveView] = useState<'STUDY' | 'QUIZ' | 'REVIEW' | 'CERTIFICATE' | 'ONLINE_ROOM'>('STUDY');

  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Leaderboard modal state
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [attendanceExportModalOpen, setAttendanceExportModalOpen] = useState(false);
  const [quizStartTimestamp, setQuizStartTimestamp] = useState<number | null>(null);

  // Certificate state
  const [issuedCertificate, setIssuedCertificate] = useState<IssuedCertificate | null>(null);
  const [issuingCert, setIssuingCert] = useState(false);

  // Quiz instruction modal
  const [instructionModalOpen, setInstructionModalOpen] = useState(false);
  const [pendingQuizStart, setPendingQuizStart] = useState<{
    qConfig: any;
    quizType: 'FINAL' | 'EXERCISE';
    lessonIdx: number | null;
  } | null>(null);

  // Attendance state
  const [attendanceCountToday, setAttendanceCountToday] = useState(0);
  const [sessionCheckedIn, setSessionCheckedIn] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const checkAttendanceStatus = async () => {
    if (!currentUser?.idUser || !course?.courseId) return;
    try {
      const res = await fetch(`/api/attendance/check?idUser=${encodeURIComponent(currentUser.idUser)}&courseId=${encodeURIComponent(course.courseId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAttendanceCountToday(data.countToday || 0);
          if (data.countToday >= 3) {
            setSessionCheckedIn(true);
          }
        }
      }
    } catch (err) {
      console.warn('Attendance check failed:', err);
    }
  };

  useEffect(() => {
    checkAttendanceStatus();
  }, [course?.courseId, currentUser?.idUser, activeView]);

  const handleMarkAttendance = async () => {
    if (!currentUser?.idUser || !course?.courseId || attendanceLoading || sessionCheckedIn || attendanceCountToday >= 3) return;

    setAttendanceLoading(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idUser: currentUser.idUser,
          hoTen: currentUser.hoTen,
          chiDoan: currentUser.chiDoan,
          courseId: course.courseId,
        }),
      });
      const data = await res.json();
      setAttendanceLoading(false);
      if (data.success) {
        setAttendanceCountToday(data.countToday);
        setSessionCheckedIn(true);
        alert(`✅ ${data.message}`);
      } else {
        alert(`⚠️ ${data.message || 'Không thể điểm danh!'}`);
        if (data.limitReached) {
          setAttendanceCountToday(3);
          setSessionCheckedIn(true);
        }
      }
    } catch (err) {
      setAttendanceLoading(false);
      alert('⚠️ Đã xảy ra lỗi khi điểm danh!');
    }
  };

  const handleExportAttendanceExcel = async () => {
    if (!course?.courseId) return;
    try {
      const res = await fetch(`/api/attendance/export/${encodeURIComponent(course.courseId)}`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.rows && data.rows.length > 0) {
          const worksheet = XLSX.utils.json_to_sheet(data.rows);
          const cols = [
            { wch: 6 },  // STT
            { wch: 25 }, // Họ tên
            { wch: 15 }, // Lớp
            { wch: 22 }, // Tên tài khoản
          ];
          for (let i = 1; i <= (data.maxSessions || 1); i++) {
            cols.push({ wch: 28 });
          }
          worksheet['!cols'] = cols;

          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'DiemDanh');

          const cleanTitle = (course.title || 'KhoaHoc')
            .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF -]/g, '')
            .trim()
            .replace(/\s+/g, '_');
          const fileName = `Danh_Sach_Diem_Danh_${cleanTitle}.xlsx`;

          XLSX.writeFile(workbook, fileName);
          return;
        } else if (data.message) {
          alert(`⚠️ ${data.message}`);
          return;
        }
      }
      alert('Chưa có dữ liệu điểm danh nào cho khóa học này!');
    } catch (err) {
      console.error('Error exporting attendance excel:', err);
      alert('Không thể xuất file điểm danh!');
    }
  };

  // Interaction tracking state for PDF/PPT reading
  const lastInteractionTimeRef = useRef<number>(Date.now());
  const [lastInteractionTime, setLastInteractionTime] = useState<number>(Date.now());

  const handleUserInteraction = () => {
    const now = Date.now();
    lastInteractionTimeRef.current = now;
    setLastInteractionTime(now);
  };

  // Listen for user interactions when studying (mouse movement, scroll, click, touch, keyboard)
  useEffect(() => {
    if (activeView === 'STUDY') {
      const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart', 'touchmove', 'click'];
      events.forEach((evt) => window.addEventListener(evt, handleUserInteraction, { passive: true }));

      return () => {
        events.forEach((evt) => window.removeEventListener(evt, handleUserInteraction));
      };
    }
  }, [activeView]);

  // Active Quiz State
  const [activeQuizContext, setActiveQuizContext] = useState<{
    type: 'FINAL' | 'EXERCISE';
    lessonIdx: number | null;
    config: any;
  }>({ type: 'FINAL', lessonIdx: null, config: null });

  const [activeQuestions, setActiveQuestions] = useState<ActiveQuizQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, any>>({});
  const [quizTimeLeftSec, setQuizTimeLeftSec] = useState(0);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [isQuizSubmitting, setIsQuizSubmitting] = useState(false);

  // Anti-cheat state
  const [cheatWarnings, setCheatWarnings] = useState(0);
  const [awayTimeSec, setAwayTimeSec] = useState(0);
  const [isUserAway, setIsUserAway] = useState(false);
  const awayTimerRef = useRef<any>(null);

  // Review State
  const [reviewScore, setReviewScore] = useState(0);
  const [reviewDetails, setReviewDetails] = useState<ActiveQuizDetailResult[]>([]);
  const [reviewPassingScore, setReviewPassingScore] = useState(80);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const studyTimerRef = useRef<any>(null);
  const quizTimerRef = useRef<any>(null);

  const currentLesson = (course.lessons && course.lessons.length > 0)
    ? (course.lessons[currentLessonIdx] || course.lessons[0])
    : undefined;

  // Helper embed URL conversion
  const getEmbedUrl = (url?: string) => {
    if (!url) return '';
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
      return match && match[2].length === 11
        ? `https://www.youtube.com/embed/${match[2]}?enablejsapi=1`
        : url;
    }
    if (url.includes('drive.google.com')) {
      return url.replace('/view', '/preview');
    }
    if (url.includes('docs.google.com/presentation')) {
      return url.replace('/pub?', '/embed?').replace('/edit', '/embed');
    }
    return url;
  };

  // Visibility and focus anti-cheat handlers
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleUserAway();
      } else {
        handleUserReturn();
      }
    };

    const handleBlur = () => handleUserAway();
    const handleFocus = () => handleUserReturn();

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isQuizActive, isUserAway]);

  const handleUserAway = () => {
    setIsWindowActive(false);
    if (isQuizActive && !isUserAway) {
      setIsUserAway(true);
      triggerCheatWarning();
    }
  };

  const handleUserReturn = () => {
    setIsWindowActive(true);
    if (isQuizActive && isUserAway) {
      setIsUserAway(false);
      stopAwayTimer();
    }
  };

  // Track watched time ref to prevent state updates inside state setter callbacks
  const timeWatchedSecRef = useRef(timeWatchedSec);
  useEffect(() => {
    timeWatchedSecRef.current = timeWatchedSec;
  }, [timeWatchedSec]);

  const triggerCheatWarning = () => {
    const nextWarnings = cheatWarnings + 1;
    setCheatWarnings(nextWarnings);
    if (nextWarnings > 3) {
      setIsQuizActive(false);
      stopAwayTimer();
      alert(
        'VI PHẠM QUÁ 3 LẦN: Bạn đã thoát khỏi màn hình bài thi quá 3 lần quy định! Hệ thống sẽ tự động thu bài và chấm điểm.'
      );
      setTimeout(() => processQuizSubmission(), 0);
    } else {
      startAwayTimer();
    }
  };

  const startAwayTimer = () => {
    stopAwayTimer();
    setAwayTimeSec(0);
    awayTimerRef.current = setInterval(() => {
      setAwayTimeSec((prev) => {
        const next = prev + 1;
        if (next >= 30) {
          setTimeout(() => {
            setIsQuizActive(false);
            stopAwayTimer();
            alert('TỰ ĐỘNG THU BÀI: Thời gian rời màn hình vượt quá 30 giây! Hệ thống đã tự động khóa bài.');
            processQuizSubmission();
          }, 0);
        }
        return next;
      });
    }, 1000);
  };

  const stopAwayTimer = () => {
    if (awayTimerRef.current) {
      clearInterval(awayTimerRef.current);
      awayTimerRef.current = null;
    }
  };

  // Track last loaded lesson key to avoid resetting timer during active study session
  const lastLoadedLessonKey = useRef<string | null>(null);
  const onSaveProgressRef = useRef(onSaveProgress);
  const currentLessonRef = useRef(currentLesson);
  const currentLessonIdxRef = useRef(currentLessonIdx);
  const courseIdRef = useRef(course?.courseId);
  const userProgressRef = useRef(userProgress);
  const activeViewRef = useRef(activeView);
  const currentUserRef = useRef(currentUser);

  useEffect(() => {
    onSaveProgressRef.current = onSaveProgress;
    currentLessonRef.current = currentLesson;
    currentLessonIdxRef.current = currentLessonIdx;
    courseIdRef.current = course?.courseId;
    userProgressRef.current = userProgress;
    activeViewRef.current = activeView;
    currentUserRef.current = currentUser;
  });

  // Flush latest study progress on unmount, pagehide, or window beforeunload
  useEffect(() => {
    const flushCurrentProgress = () => {
      const vActive = activeViewRef.current;
      const curLesson = currentLessonRef.current;
      const curIdx = currentLessonIdxRef.current;
      const cId = courseIdRef.current;
      const curProgress = userProgressRef.current;
      const watched = timeWatchedSecRef.current;
      const u = currentUserRef.current;

      if (vActive === 'STUDY' && curLesson && cId && (watched > 0 || Number(curLesson.duration) === 0)) {
        const saved = curProgress[cId]?.[`LESSON_${curIdx}`] || {};
        const d = curLesson.duration !== undefined ? Number(curLesson.duration) : 1;
        const reqSec = d === 0 ? 0 : (d >= 30 ? d : d * 60);
        const isDone = Boolean(saved.isCompleted || (reqSec === 0 ? true : watched >= reqSec));
        const pData = {
          watchedSec: watched,
          isCompleted: isDone,
        };

        // 1. Save in local React state and cache
        onSaveProgressRef.current?.(`LESSON_${curIdx}`, pData);

        // 2. Direct beacon / keepalive network call to guarantee server persistence on exit/close
        if (u?.idUser) {
          try {
            const body = JSON.stringify({
              idUser: u.idUser,
              courseId: cId,
              lessonIndex: `LESSON_${curIdx}`,
              progressData: pData,
            });
            if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
              const blob = new Blob([body], { type: 'application/json' });
              navigator.sendBeacon('/api/progress', blob);
            } else {
              fetch('/api/progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                keepalive: true,
              }).catch(() => {});
            }
          } catch {}
        }
      }
    };

    const handleBeforeUnload = () => {
      flushCurrentProgress();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      flushCurrentProgress();
    };
  }, []);

  // Study timer setup & lesson state restoration
  useEffect(() => {
    if (activeView === 'STUDY' && currentLesson) {
      const lessonKey = `${course.courseId}_${currentLessonIdx}`;
      if (lastLoadedLessonKey.current !== lessonKey) {
        // Save previous lesson progress if changing lessons
        if (lastLoadedLessonKey.current && timeWatchedSecRef.current > 0) {
          const parts = lastLoadedLessonKey.current.split('_');
          const oldCourseId = parts[0];
          const oldLessonIdx = parseInt(parts[1], 10);
          if (oldCourseId === course.courseId && !isNaN(oldLessonIdx) && oldLessonIdx !== currentLessonIdx) {
            const oldLesson = course.lessons?.[oldLessonIdx];
            const oldD = oldLesson?.duration !== undefined ? Number(oldLesson.duration) : 1;
            const oldReqSec = oldD === 0 ? 0 : (oldD >= 30 ? oldD : oldD * 60);
            const oldProg = userProgressRef.current[course.courseId]?.[`LESSON_${oldLessonIdx}`] || {};
            onSaveProgressRef.current?.(`LESSON_${oldLessonIdx}`, {
              watchedSec: timeWatchedSecRef.current,
              isCompleted: Boolean(oldProg.isCompleted || (oldReqSec === 0 ? true : timeWatchedSecRef.current >= oldReqSec)),
            });
          }
        }

        lastLoadedLessonKey.current = lessonKey;
        const progress = userProgress[course.courseId] || {};
        const saved = progress[`LESSON_${currentLessonIdx}`] || { watchedSec: 0 };
        setTimeWatchedSec(saved.watchedSec || 0);
      }

      // determine default mode
      if (currentLesson.videoUrl) {
        setLearningMode('VIDEO');
        setIsVideoPlaying(true);
      } else if (currentLesson.docUrl) {
        setLearningMode('DOC');
        setIsVideoPlaying(false);
        handleUserInteraction();
      } else if (currentLesson.pptUrl) {
        setLearningMode('PPT');
        setIsVideoPlaying(false);
        handleUserInteraction();
      }

      const d = currentLesson.duration !== undefined ? Number(currentLesson.duration) : 1;
      // Handle duration 0: no minimum study time required
      const targetSec = d === 0 ? 0 : (d >= 30 ? d : d * 60);
      setTargetDurationSec(targetSec);
    } else if (activeView !== 'STUDY') {
      lastLoadedLessonKey.current = null;
    }
  }, [currentLessonIdx, activeView, course.courseId]);

  useEffect(() => {
    if (activeView === 'STUDY') {
      if (studyTimerRef.current) clearInterval(studyTimerRef.current);

      studyTimerRef.current = setInterval(() => {
        const now = Date.now();
        const secondsSinceLastInteraction = Math.floor((now - lastInteractionTimeRef.current) / 1000);
        const isDocActive = (learningMode === 'VIDEO') || (secondsSinceLastInteraction < 60);

        let canCount = false;
        if (isWindowActive && !document.hidden) {
          if (learningMode === 'VIDEO') {
            // Video mode: counts automatically when watching video and on active screen
            if (isVideoPlaying) canCount = true;
          } else {
            // DOC or PPT mode: requires active user interaction within the last 60 seconds (1 minute)
            if (isDocActive) canCount = true;
          }
        }

        if (canCount) {
          const next = timeWatchedSecRef.current + 1;
          setTimeWatchedSec(next);
          if (currentUser?.idUser) {
            saveStoredDailyStudyTime(currentUser.idUser, 1);
          }
          if (next % 5 === 0 || next >= targetDurationSec) {
            onSaveProgressRef.current(`LESSON_${currentLessonIdx}`, {
              watchedSec: next,
              isCompleted: next >= targetDurationSec,
            });
          }
        }
      }, 1000);

      return () => {
        if (studyTimerRef.current) clearInterval(studyTimerRef.current);
      };
    }
  }, [activeView, learningMode, isVideoPlaying, isWindowActive, currentLessonIdx, targetDurationSec]);

  // Quiz timer
  useEffect(() => {
    if (isQuizActive && quizTimeLeftSec > 0) {
      quizTimerRef.current = setInterval(() => {
        setQuizTimeLeftSec((prev) => {
          if (prev <= 1) {
            clearInterval(quizTimerRef.current);
            setTimeout(() => {
              setIsQuizActive(false);
              stopAwayTimer();
              alert('HẾT GIỜ LÀM BÀI!');
              processQuizSubmission();
            }, 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (quizTimerRef.current) clearInterval(quizTimerRef.current);
      };
    }
  }, [isQuizActive, quizTimeLeftSec]);

  // Trigger MathJax typeset when quiz view or questions change
  useEffect(() => {
    if (activeView === 'QUIZ' || reviewDetails.length > 0) {
      const timer = setTimeout(() => {
        if ((window as any).MathJax?.typesetPromise) {
          (window as any).MathJax.typesetPromise().catch((e: any) => console.warn('MathJax error:', e));
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeView, isQuizActive, activeQuestions, reviewDetails]);

  // Fetch certificate if already issued
  useEffect(() => {
    if (course && currentUser) {
      const localCerts = getStoredCertificates();
      const cleanUser = String(currentUser.idUser || '').trim().toLowerCase();
      const localMatch = localCerts.find(
        (c) => String(c.idUser || '').trim().toLowerCase() === cleanUser && String(c.courseId) === String(course.courseId)
      );
      if (localMatch) {
        setIssuedCertificate(localMatch);
      }

      fetch(`/api/certificates?idUser=${encodeURIComponent(currentUser.idUser)}&courseId=${encodeURIComponent(course.courseId)}`)
        .then((res) => {
          if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
            return res.json();
          }
          return null;
        })
        .then((data) => {
          if (data && data.success) {
            if (data.certificate) {
              setIssuedCertificate(data.certificate);
              saveStoredCertificate(data.certificate);
            } else {
              setIssuedCertificate(null);
              deleteStoredCertificateForUserCourse(currentUser.idUser, course.courseId);
            }
          }
        })
        .catch((e) => console.warn('Lỗi lấy thông tin giấy chứng nhận:', e));
    }
  }, [course?.courseId, currentUser?.idUser]);

  // Course completion state
  const cleanU = String(currentUser?.idUser || '').trim().toLowerCase();
  const courseProgress =
    userProgress[course.courseId] ||
    (cleanU && userProgress[cleanU] && userProgress[cleanU][course.courseId]) ||
    {};

  // Final Quiz Attempt Calculations
  const finalQStatus =
    quizStatus[course.courseId] ||
    (cleanU && quizStatus[cleanU] && quizStatus[cleanU][course.courseId]) ||
    courseProgress['QUIZ_SUBMITTED'] ||
    courseProgress['QUIZ'];

  const areAllLessonsCompleted =
    !course.lessons || course.lessons.length === 0
      ? true
      : course.lessons.every((l, idx) => {
          const pObj =
            courseProgress[`LESSON_${idx}`] ||
            courseProgress[String(idx)] ||
            (l.lessonId && courseProgress[l.lessonId]) ||
            (l.id && courseProgress[l.id]) ||
            { watchedSec: 0 };
          const d = l.duration !== undefined ? Number(l.duration) : 1;
          const reqSec = d === 0 ? 0 : (d >= 30 ? d : d * 60);
          const currentSec =
            idx === currentLessonIdx && activeView === 'STUDY'
              ? Math.max(pObj.watchedSec || 0, timeWatchedSec)
              : pObj.watchedSec || 0;
          return pObj.isCompleted || pObj.completed || reqSec === 0 || currentSec >= reqSec;
        });

  const areAllExercisesPassed =
    !course.lessons || course.lessons.length === 0
      ? true
      : course.lessons.every((l, idx) => {
          const ex = l.exerciseConfig;
          if (!ex || !ex.enabled) return true;
          const exProg = courseProgress[`LESSON_EXERCISE_${idx}`] || {};
          const exPassing = ex.passingScore !== undefined ? Number(ex.passingScore) : 80;
          if (typeof exProg === 'number') {
            return exProg >= exPassing;
          }
          if (exProg.passed !== undefined) {
            return Boolean(exProg.passed);
          }
          const sc = exProg.lastScore ?? exProg.score;
          if (sc !== undefined && sc !== null) {
            return Number(sc) >= exPassing;
          }
          return false;
        });

  const finalQuizMaxScore = (() => {
    const p1 = Number(course.quizConfig?.p1?.totalScore || 0);
    const p2Count = Number(course.quizConfig?.p2?.count || course.quizConfig?.p2?.bank?.length || 0);
    const p2Max = p2Count * (course.quizConfig?.p2?.scores?.s4 || 1.0);
    const p3 = Number(course.quizConfig?.p3?.totalScore || 0);
    const sum = p1 + p2Max + p3;
    return sum > 0 ? sum : 10;
  })();

  const rawFinalPassing = course.quizConfig?.passingScore !== undefined ? Number(course.quizConfig.passingScore) : 80;
  const effectiveFinalPassingScore = (finalQuizMaxScore <= 10 && rawFinalPassing > 10)
    ? Math.round(((rawFinalPassing / 100) * finalQuizMaxScore) * 10) / 10
    : rawFinalPassing;

  const currentFinalScore = typeof finalQStatus === 'number'
    ? finalQStatus
    : finalQStatus?.lastScore !== undefined
    ? Number(finalQStatus.lastScore)
    : finalQStatus?.score !== undefined
    ? Number(finalQStatus.score)
    : finalQStatus?.bestScore !== undefined
    ? Number(finalQStatus.bestScore)
    : 0;

  const isFinalQuizPassed = (() => {
    if (course.quizConfig?.enabled === false) return true;
    if (!finalQStatus) return false;
    if (typeof finalQStatus === 'object' && finalQStatus?.passed !== undefined) {
      return Boolean(finalQStatus.passed);
    }
    return currentFinalScore >= effectiveFinalPassingScore;
  })();

  const finalAttemptsCount = (() => {
    if (!finalQStatus) return 0;
    if (typeof finalQStatus === 'number') return 1;
    if (typeof finalQStatus === 'object') {
      const history = Array.isArray(finalQStatus.attemptsHistory) ? finalQStatus.attemptsHistory : [];
      if (history.length > 0) {
        // Lấy số lần thi thực tế từ lịch sử, loại bỏ trùng lặp nếu có
        const uniqueAttempts = new Set(
          history.map((h: any, idx: number) => (h && typeof h === 'object' && h.attempt !== undefined ? h.attempt : idx))
        );
        return uniqueAttempts.size;
      }
      const scores = Array.isArray(finalQStatus.scores) ? finalQStatus.scores : [];
      if (scores.length > 0) {
        return scores.length;
      }
      if (finalQStatus.attempts !== undefined) {
        return Number(finalQStatus.attempts);
      }
      if (finalQStatus.lastScore !== undefined || finalQStatus.score !== undefined) {
        return 1;
      }
    }
    return 0;
  })();

  const finalMaxAttempts = course.quizConfig?.maxAttempts || 1;
  const hasAttemptedFinalQuiz = finalAttemptsCount > 0;
  const isFinalQuizOutOfAttempts = hasAttemptedFinalQuiz && finalAttemptsCount >= finalMaxAttempts;
  const canRetryFinalQuiz = hasAttemptedFinalQuiz && finalAttemptsCount < finalMaxAttempts;

  const handleRetryFinalQuizWithCertCheck = async () => {
    if (issuedCertificate) {
      const confirmMsg = `Bạn đã được cấp Giấy chứng nhận cho khóa học này.\n\nNếu bạn bấm Thi lại:\n✓ Toàn bộ tiến trình bài học đã học và kết quả bài tập củng cố được GIỮ NGUYÊN.\n✗ Hệ thống sẽ HỦY giấy chứng nhận và kết quả bài kiểm tra cuối khóa hiện tại để bạn có thể vào làm lại bài kiểm tra cuối khóa.\n\nBạn có chắc chắn muốn thi lại không?`;
      if (!confirm(confirmMsg)) return;

      try {
        await fetch('/api/teacher/reset-student-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idUser: currentUser?.idUser,
            courseId: course.courseId,
          }),
        });
      } catch (e) {
        console.warn('Error resetting quiz on student retake:', e);
      }

      if (currentUser?.idUser && course?.courseId) {
        deleteStoredCertificateForUserCourse(currentUser.idUser, course.courseId);
        deleteStoredQuizStatus(currentUser.idUser, course.courseId);
        deleteStoredQuizProgress(currentUser.idUser, course.courseId);
      }
      setIssuedCertificate(null);
    } else if (isFinalQuizPassed) {
      if (
        !confirm(
          `Bạn đã ĐẠT bài kiểm tra cuối khóa (${currentFinalScore} điểm). Bạn có muốn thi lại để cải thiện điểm số không? (Số lần thi còn lại: ${
            finalMaxAttempts - finalAttemptsCount
          })`
        )
      ) {
        return;
      }
    }

    showQuizInstruction(course.quizConfig, 'FINAL', null);
  };

  const handleOpenFinalQuizReview = () => {
    if (finalQStatus) {
      const score = currentFinalScore;
      let detail = Array.isArray(finalQStatus.detail) ? finalQStatus.detail : [];

      if (detail.length === 0 && course.quizConfig) {
        const questions: ActiveQuizDetailResult[] = [];
        if (course.quizConfig.p1?.bank?.length) {
          const drawCount = course.quizConfig.p1.count || course.quizConfig.p1.bank.length;
          const p1Tot = Number(course.quizConfig.p1.totalScore || 0) || ((course.quizConfig.p2?.enabled || course.quizConfig.p3?.enabled) ? 3 : 10);
          const perScore = drawCount > 0 ? p1Tot / drawCount : 1;
          course.quizConfig.p1.bank.slice(0, drawCount).forEach((q: any, qIdx: number) => {
            questions.push({
              part: 1,
              type: 'P1',
              globalIdx: qIdx,
              question: q.question,
              options: q.options || {},
              correct: q.correct,
              score: Math.round(perScore * 100) / 100,
              userAns: q.correct,
              isCorrect: true,
            });
          });
        }
        if (course.quizConfig.p2?.bank?.length) {
          const drawCount = course.quizConfig.p2.count || course.quizConfig.p2.bank.length;
          course.quizConfig.p2.bank.slice(0, drawCount).forEach((q: any, qIdx: number) => {
            questions.push({
              part: 2,
              type: 'P2',
              globalIdx: (course.quizConfig?.p1?.count || 0) + qIdx,
              question: q.question,
              options: q.options || {},
              correctMap: q.correctMap || {},
              scores: course.quizConfig.p2?.scores,
              score: course.quizConfig.p2?.scores?.s4 || 1.0,
              userAns: q.correctMap || {},
              isCorrect: true,
            });
          });
        }
        if (course.quizConfig.p3?.bank?.length) {
          const drawCount = course.quizConfig.p3.count || course.quizConfig.p3.bank.length;
          const p3Tot = Number(course.quizConfig.p3.totalScore || 0) || 3;
          const perScore = drawCount > 0 ? p3Tot / drawCount : 1;
          course.quizConfig.p3.bank.slice(0, drawCount).forEach((q: any, qIdx: number) => {
            questions.push({
              part: 3,
              type: 'P3',
              globalIdx: (course.quizConfig?.p1?.count || 0) + (course.quizConfig?.p2?.count || 0) + qIdx,
              question: q.question,
              correct: q.correct,
              score: Math.round(perScore * 100) / 100,
              userAns: q.correct,
              isCorrect: true,
            });
          });
        }
        detail = questions;
      }

      setActiveQuizContext({
        type: 'FINAL',
        lessonIdx: null,
        config: course.quizConfig,
      });
      setReviewScore(score);
      setReviewDetails(detail);
      setReviewPassingScore(effectiveFinalPassingScore);
      setActiveView('REVIEW');
    } else {
      alert('Chưa có lịch sử làm bài kiểm tra cuối khóa.');
    }
  };

  const isCertificateEligible = areAllLessonsCompleted && areAllExercisesPassed && isFinalQuizPassed;

  const generateLocalCertificate = () => {
    const certCfg = course.certificateConfig || {
      enabled: true,
      parentOrganization: 'ĐOÀN TNCS HỒ CHÍ MINH',
      organization: 'TRƯỜNG THPT NGUYỄN QUANG DIÊU',
      signerTitle: 'GIÁO VIÊN',
    };
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const formattedDateStr = `Tân An, ngày ${day} tháng ${month} năm ${year}`;
    const certId = `CERT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const suffix = certCfg.certNumberSuffix || 'GCN/ĐTN';
    const certificateNumberStr = `01-${suffix}`;

    return {
      certificateId: certId,
      certificateNumberStr,
      idUser: currentUser.idUser,
      studentName: currentUser.hoTen || currentUser.fullName || currentUser.idUser,
      studentClass: currentUser.chiDoan || currentUser.className || '',
      courseId: course.courseId,
      courseTitle: course.title,
      issueDate: now.toISOString(),
      formattedDateStr,
      parentOrganization: certCfg.parentOrganization || 'ĐOÀN TNCS HỒ CHÍ MINH',
      organization: certCfg.organization || 'TRƯỜNG THPT NGUYỄN QUANG DIÊU',
      signerTitle: certCfg.signerTitle || 'GIÁO VIÊN',
      delegateTitle: certCfg.delegateTitle || '',
      signerName: certCfg.signerName || course.authorName || 'Giáo viên hướng dẫn',
      signatureImage: certCfg.signatureImage || '',
      logoImage: certCfg.logoImage || '',
      bgTheme: certCfg.bgTheme || 'blue_gold',
      bgCustomImage: certCfg.bgCustomImage || '',
      certNumberSuffix: suffix,
    };
  };

  const handleViewOrIssueCertificate = async () => {
    if (issuedCertificate) {
      setActiveView('CERTIFICATE');
      return;
    }

    if (getCourseTimeStatus(course) === 'ENDED') {
      alert('Khóa học đã kết thúc! Bạn không thể cấp mới giấy chứng nhận.');
      return;
    }

    if (!isCertificateEligible) {
      let reasons = 'ĐIỀU KIỆN CẤP GIẤY CHỨNG NHẬN:\n\n';
      if (!areAllLessonsCompleted) reasons += '• Chưa xem hết tất cả bài học trong khóa học.\n';
      if (!areAllExercisesPassed) reasons += '• Chưa làm đạt các bài tập củng cố bài học.\n';
      if (!isFinalQuizPassed) reasons += '• Chưa thi đạt bài kiểm tra cuối khóa.\n';
      alert(reasons + '\nVui lòng hoàn thành các yêu cầu trên để nhận giấy chứng nhận!');
      return;
    }

    try {
      setIssuingCert(true);
      let certToUse: any = null;

      try {
        const res = await fetch('/api/certificates/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idUser: currentUser.idUser,
            courseId: course.courseId,
            userObj: currentUser,
          }),
        });

        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const data = await res.json();
          if (data && data.success && data.certificate) {
            certToUse = data.certificate;
          }
        }
      } catch (err) {
        console.warn('Backend API certificate issue failed or offline, generating local certificate:', err);
      }

      if (!certToUse) {
        certToUse = generateLocalCertificate();
      }

      saveStoredCertificate(certToUse);
      setIssuedCertificate(certToUse);
      setActiveView('CERTIFICATE');
    } catch (e: any) {
      alert('Lỗi khi cấp giấy chứng nhận: ' + e.message);
    } finally {
      setIssuingCert(false);
    }
  };

  // Launching Quiz session
  const showQuizInstruction = (
    qConfig: any,
    quizType: 'FINAL' | 'EXERCISE',
    lessonIdx: number | null
  ) => {
    if (getCourseTimeStatus(course) === 'ENDED') {
      alert('Khóa học đã kết thúc! Hệ thống đã đóng tính năng làm bài tập và kiểm tra.');
      return;
    }

    if (quizType === 'FINAL') {
      if (!areAllLessonsCompleted) {
        alert('Cần tích lũy đủ thời gian học tất cả bài học mới được làm bài kiểm tra cuối khóa.');
        return;
      }
      if (isFinalQuizOutOfAttempts) {
        alert(`Bạn đã dùng hết số lần làm bài kiểm tra cuối khóa (${finalAttemptsCount}/${finalMaxAttempts} lần)! Hệ thống chuyển sang màn hình xem lại bài làm.`);
        handleOpenFinalQuizReview();
        return;
      }
    } else if (quizType === 'EXERCISE' && lessonIdx !== null && course.lessons?.[lessonIdx]) {
      const l = course.lessons[lessonIdx];
      const pObj = userProgress[course.courseId]?.[`LESSON_${lessonIdx}`] || { watchedSec: 0 };
      const d = l.duration !== undefined ? Number(l.duration) : 1;
      const reqSec = d === 0 ? 0 : (d >= 30 ? d : d * 60);
      const currentSec =
        lessonIdx === currentLessonIdx && activeView === 'STUDY'
          ? Math.max(pObj.watchedSec || 0, timeWatchedSec)
          : pObj.watchedSec || 0;
      const isDone = reqSec === 0 || pObj.isCompleted || currentSec >= reqSec;

      if (!isDone) {
        alert(
          `Cần hoàn thành thời gian học tích lũy của Bài ${lessonIdx + 1} (${formatTimer(currentSec)}/${formatTimer(reqSec)}) trước khi làm bài tập củng cố.`
        );
        return;
      }
    }
    setPendingQuizStart({ qConfig, quizType, lessonIdx });
    setInstructionModalOpen(true);
  };

  const startQuizSession = (
    qConfig: any,
    quizType: 'FINAL' | 'EXERCISE',
    lessonIdx: number | null
  ) => {
    if (quizType === 'FINAL' && isFinalQuizOutOfAttempts) {
      alert(
        `Bạn đã dùng hết số lần làm bài kiểm tra cuối khóa (${finalAttemptsCount}/${finalMaxAttempts} lần). Không thể bắt đầu bài thi!`
      );
      handleOpenFinalQuizReview();
      return;
    }

    setActiveQuizContext({ type: quizType, lessonIdx, config: qConfig });
    setIsQuizActive(true);
    setIsQuizSubmitting(false);
    setQuizStartTimestamp(Date.now());
    setCheatWarnings(0);
    setAwayTimeSec(0);
    setIsUserAway(false);
    stopAwayTimer();

    const questions: ActiveQuizQuestion[] = [];

    // Part 1
    if (qConfig.p1 && qConfig.p1.enabled && qConfig.p1.bank?.length) {
      const drawCount = qConfig.p1.count || qConfig.p1.bank.length;
      let p1Total = Number(qConfig.p1.totalScore || 0);
      if (p1Total <= 0) {
        p1Total = (qConfig.p2?.enabled || qConfig.p3?.enabled) ? 3.0 : 10.0;
      }
      const perScore = drawCount > 0 ? (p1Total / drawCount) : 1.0;
      const drawP1 = [...qConfig.p1.bank].sort(() => 0.5 - Math.random()).slice(0, drawCount);

      drawP1.forEach((q) => {
        const origOptions = [
          { key: 'A', text: q.options['A'] },
          { key: 'B', text: q.options['B'] },
          { key: 'C', text: q.options['C'] },
          { key: 'D', text: q.options['D'] },
        ].filter((o) => o.text !== undefined);

        const shuffled = [...origOptions].sort(() => 0.5 - Math.random());
        const newOptions: Record<string, string> = {};
        let newCorrect = 'A';

        shuffled.forEach((opt, idx) => {
          const label = String.fromCharCode(65 + idx);
          newOptions[label] = opt.text;
          if (opt.key === q.correct) newCorrect = label;
        });

        questions.push({
          part: 1,
          type: 'P1',
          question: q.question,
          options: newOptions,
          correct: newCorrect,
          score: perScore,
        });
      });
    }

    // Part 2
    if (qConfig.p2 && qConfig.p2.enabled && qConfig.p2.bank?.length) {
      const drawCount = qConfig.p2.count || qConfig.p2.bank.length;
      const drawP2 = [...qConfig.p2.bank].sort(() => 0.5 - Math.random()).slice(0, drawCount);

      drawP2.forEach((q) => {
        const origOptions = [
          { key: 'A', text: q.options['A'], correctVal: q.correctMap['A'] },
          { key: 'B', text: q.options['B'], correctVal: q.correctMap['B'] },
          { key: 'C', text: q.options['C'], correctVal: q.correctMap['C'] },
          { key: 'D', text: q.options['D'], correctVal: q.correctMap['D'] },
        ].filter((o) => o.text !== undefined);

        const shuffled = [...origOptions].sort(() => 0.5 - Math.random());
        const newOptions: Record<string, string> = {};
        const newCorrectMap: Record<string, 'DUNG' | 'SAI'> = {};

        shuffled.forEach((opt, idx) => {
          const label = String.fromCharCode(65 + idx);
          newOptions[label] = opt.text;
          newCorrectMap[label] = opt.correctVal;
        });

        questions.push({
          part: 2,
          type: 'P2',
          question: q.question,
          options: newOptions,
          correctMap: newCorrectMap,
          scores: qConfig.p2.scores,
        });
      });
    }

    // Part 3
    if (qConfig.p3 && qConfig.p3.enabled && qConfig.p3.bank?.length) {
      const drawCount = qConfig.p3.count || qConfig.p3.bank.length;
      let p3Total = Number(qConfig.p3.totalScore || 0);
      if (p3Total <= 0) {
        p3Total = 3.0;
      }
      const perScore = drawCount > 0 ? (p3Total / drawCount) : 1.0;
      const drawP3 = [...qConfig.p3.bank].sort(() => 0.5 - Math.random()).slice(0, drawCount);

      drawP3.forEach((q) => {
        questions.push({
          part: 3,
          type: 'P3',
          question: q.question,
          correct: q.correct,
          score: perScore,
        });
      });
    }

    setActiveQuestions(questions);
    setUserAnswers({});
    setQuizTimeLeftSec((qConfig.durationMin || 15) * 60);
    setActiveView('QUIZ');
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Compute question section subsets and total max scores
  const questionsWithIndex = activeQuestions.map((q, idx) => ({ ...q, globalIdx: idx }));
  const quizP1 = questionsWithIndex.filter((q) => q.type === 'P1' || q.part === 1);
  const quizP2 = questionsWithIndex.filter((q) => q.type === 'P2' || q.part === 2);
  const quizP3 = questionsWithIndex.filter((q) => q.type === 'P3' || q.part === 3);

  const p1TotalScore =
    activeQuizContext.config?.p1?.totalScore ||
    quizP1.reduce((acc, q) => acc + (q.score || 0), 0);
  const p2Scores = activeQuizContext.config?.p2?.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
  const p2MaxPerQ = p2Scores.s4 !== undefined ? p2Scores.s4 : 1.0;
  const p2TotalScore = Math.round(quizP2.length * p2MaxPerQ * 100) / 100;
  const p3TotalScore =
    activeQuizContext.config?.p3?.totalScore ||
    quizP3.reduce((acc, q) => acc + (q.score || 0), 0);

  const reviewWithIndex = reviewDetails.map((q, idx) => ({ ...q, globalIdx: idx }));
  const revP1 = reviewWithIndex.filter((q) => q.type === 'P1' || q.part === 1);
  const revP2 = reviewWithIndex.filter((q) => q.type === 'P2' || q.part === 2);
  const revP3 = reviewWithIndex.filter((q) => q.type === 'P3' || q.part === 3);

  const calcP1Max = activeQuizContext.config?.p1?.totalScore || (quizP1.length > 0 ? quizP1 : revP1).reduce((acc, q) => acc + (q.score || 0), 0);
  const calcP2Max = Math.round((quizP2.length > 0 ? quizP2.length : revP2.length) * p2MaxPerQ * 100) / 100;
  const calcP3Max = activeQuizContext.config?.p3?.totalScore || (quizP3.length > 0 ? quizP3 : revP3).reduce((acc, q) => acc + (q.score || 0), 0);
  const totalQuizMaxPoints = Math.round((calcP1Max + calcP2Max + calcP3Max) * 100) / 100 || 100;

  const processQuizSubmission = async () => {
    if (isQuizSubmitting) return;
    setIsQuizSubmitting(true);

    try {
      setIsQuizActive(false);
      stopAwayTimer();

      let totalScore = 0;
      const detailResult: ActiveQuizDetailResult[] = [];

      activeQuestions.forEach((q, idx) => {
        const uAns = userAnswers[idx];
        let isCorrect = false;

        if (q.type === 'P1') {
          isCorrect = uAns === q.correct;
          const earned = isCorrect ? q.score || 0 : 0;
          totalScore += earned;

          detailResult.push({
            ...q,
            userAns: uAns,
            isCorrect,
            score: Math.round(earned * 100) / 100,
          });
        } else if (q.type === 'P2') {
          let correctCount = 0;
          const uObj = uAns || {};
          const cMap = q.correctMap || {};

          for (const k in cMap) {
            if (uObj[k] === cMap[k]) correctCount++;
          }

          const scObj = q.scores || { s1: 0.1, s2: 0.25, s3: 0.5, s4: 1.0 };
          let earned = 0;
          if (correctCount === 1) earned = scObj.s1;
          if (correctCount === 2) earned = scObj.s2;
          if (correctCount === 3) earned = scObj.s3;
          if (correctCount === 4) {
            earned = scObj.s4;
            isCorrect = true;
          }
          totalScore += earned;

          detailResult.push({
            ...q,
            userAns: uObj,
            isCorrect,
            score: Math.round(earned * 100) / 100,
          });
        } else if (q.type === 'P3') {
          isCorrect =
            String(uAns || '')
              .trim()
              .toLowerCase() ===
            String(q.correct || '')
              .trim()
              .toLowerCase();
          const earned = isCorrect ? q.score || 0 : 0;
          totalScore += earned;

          detailResult.push({
            ...q,
            userAns: uAns || '',
            isCorrect,
            score: Math.round(earned * 100) / 100,
          });
        }
      });

      const computedMax = totalQuizMaxPoints;

      const finalScore = Math.min(computedMax, Math.round(totalScore * 100) / 100);
      const isExercise = activeQuizContext.type === 'EXERCISE';
      const progressKey = isExercise
        ? `LESSON_EXERCISE_${activeQuizContext.lessonIdx}`
        : 'QUIZ_SUBMITTED';

      const rawPassing = activeQuizContext.config?.passingScore !== undefined
        ? Number(activeQuizContext.config.passingScore)
        : 80;
      const effectivePassing = (computedMax <= 10 && rawPassing > 10)
        ? Math.round(((rawPassing / 100) * computedMax) * 10) / 10
        : rawPassing;
      const isPassed = finalScore >= effectivePassing;
      const nextAttempts = isExercise ? 1 : (finalAttemptsCount + 1);

      const durationSec = quizStartTimestamp
        ? Math.max(1, Math.round((Date.now() - quizStartTimestamp) / 1000))
        : Math.max(1, (activeQuizContext.config?.durationMin || 15) * 60 - quizTimeLeftSec);

      await onSaveProgress(
        progressKey,
        {
          attempts: nextAttempts,
          lastScore: finalScore,
          score: finalScore,
          quizScore: finalScore,
          passed: isPassed,
          status: isPassed ? 'ĐẠT' : 'CHƯA ĐẠT',
          durationSec,
          violations: cheatWarnings,
          cheatWarnings,
        },
        detailResult
      );

      setReviewScore(finalScore);
      setReviewDetails(detailResult);
      setReviewPassingScore(effectivePassing);
      setActiveView('REVIEW');
    } catch (err) {
      console.error('Error in processQuizSubmission:', err);
      alert('Có lỗi xảy ra khi nộp bài: ' + (err as Error).message);
    } finally {
      setIsQuizSubmitting(false);
    }
  };

  const handleBackNavigation = () => {
    if (activeView === 'STUDY' && currentLesson && (timeWatchedSec > 0 || Number(currentLesson.duration) === 0)) {
      const saved = userProgress[course.courseId]?.[`LESSON_${currentLessonIdx}`] || {};
      const d = currentLesson.duration !== undefined ? Number(currentLesson.duration) : 1;
      const reqSec = d === 0 ? 0 : (d >= 30 ? d : d * 60);
      onSaveProgress(`LESSON_${currentLessonIdx}`, {
        watchedSec: timeWatchedSec,
        isCompleted: Boolean(saved.isCompleted || (reqSec === 0 ? true : timeWatchedSec >= reqSec)),
      });
    }

    if (isQuizActive) {
      if (
        confirm(
          'Bạn chưa nộp bài kiểm tra.\nNếu rời khỏi bài thi, hệ thống sẽ tự động thu bài và chấm 0 điểm.\nBạn có chắc chắn muốn rời khỏi bài thi không?'
        )
      ) {
        setIsQuizActive(false);
        stopAwayTimer();
        const progressKey =
          activeQuizContext.type === 'EXERCISE'
            ? `LESSON_EXERCISE_${activeQuizContext.lessonIdx}`
            : 'QUIZ_SUBMITTED';
        onSaveProgress(progressKey, 0, []);
        onBackToDashboard();
      }
      return;
    }
    onBackToDashboard();
  };

  const isCertEnabled = course.certificateConfig?.enabled !== false;

  const timeStatus = getCourseTimeStatus(course);
  const isTeacherOrAdmin = currentUser?.role?.toUpperCase() === 'ADMIN' || currentUser?.role?.toUpperCase() === 'TEACHER';

  if (timeStatus === 'NOT_STARTED' && !isTeacherOrAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-2xl mx-auto my-8 shadow-md space-y-5 animate-in fade-in zoom-in duration-200">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <Clock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">Khóa học chưa đến thời gian mở</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Khóa học <strong>"{course.title}"</strong> sẽ mở học vào thời gian bên dưới. Vui lòng quay lại sau!
          </p>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-bold text-sm inline-block space-y-1">
          <div>Thời gian mở: {formatDateTimeDisplay(course.startDate)}</div>
          {course.startDate && (
            <div className="text-xs text-amber-700 font-normal">
              Còn lại: <strong>{getTimeRemainingText(course.startDate)}</strong>
            </div>
          )}
        </div>
        <div>
          <button
            onClick={onBackToDashboard}
            className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2 mx-auto cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại danh sách khóa học
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Back Navigation & Action Buttons */}
      <div className="flex flex-wrap justify-between items-center gap-2.5">
        <button
          onClick={handleBackNavigation}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay về danh sách khóa học
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveView(activeView === 'ONLINE_ROOM' ? 'STUDY' : 'ONLINE_ROOM')}
            className={`px-3 py-1.5 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
              activeView === 'ONLINE_ROOM'
                ? 'bg-emerald-700 ring-2 ring-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-white animate-pulse" />
            <span>Phòng học Online</span>
          </button>

          <button
            onClick={() => setAiModalOpen(true)}
            className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Bot className="w-3.5 h-3.5 text-amber-300" />
            <span>Hỏi NQDieu AI</span>
            <Sparkles className="w-3 h-3 text-amber-300" />
          </button>

          <button
            onClick={() => setLeaderboardOpen(true)}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Trophy className="w-3.5 h-3.5 text-slate-950" />
            <span>Bảng xếp hạng</span>
          </button>
        </div>
      </div>

      {timeStatus === 'ENDED' && (
        <div className="p-3.5 bg-slate-900 text-white rounded-xl shadow-xs flex items-center justify-between gap-3 border border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-slate-800 rounded-lg text-amber-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-xs sm:text-sm text-amber-300">Khóa học đã kết thúc ({formatDateTimeDisplay(course.endDate)})</p>
              <p className="text-[11px] text-slate-300">
                {issuedCertificate
                  ? 'Bạn đã hoàn thành khóa học và có thể xem lại nội dung bài học cũng như xem/tải Giấy chứng nhận.'
                  : 'Bạn có thể vào xem lại bài học nhưng không thể làm bài kiểm tra cuối khóa hoặc cấp mới Giấy chứng nhận.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: ONLINE ROOM VIEW (When activeView === 'ONLINE_ROOM') */}
      {activeView === 'ONLINE_ROOM' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-6 space-y-4 animate-fade-in">
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-base sm:text-lg">
              <Video className="w-5 h-5 text-indigo-600" />
              <span>PHÒNG HỌC TRỰC TUYẾN (ONLINE CLASS)</span>
            </div>
            <button
              onClick={() => setActiveView('STUDY')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all border border-slate-200/80 flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              Quay về bài học
            </button>
          </div>

          {/* Dark Blue Meeting Box */}
          <div className="bg-gradient-to-br from-[#1b2a6b] via-[#1d2d78] to-[#152358] text-white p-4 sm:p-6 rounded-xl shadow-lg border border-indigo-900/80 space-y-4 relative overflow-hidden">
            {/* Platform Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>
                {course.onlineMeetingConfig?.platform === 'google_meet'
                  ? 'GOOGLE MEET'
                  : course.onlineMeetingConfig?.platform === 'ms_teams'
                  ? 'MICROSOFT TEAMS'
                  : course.onlineMeetingConfig?.platform === 'zoom'
                  ? 'ZOOM'
                  : 'LINK TRỰC TUYẾN'}
              </span>
            </div>

            {/* Title (Only if custom title is provided and not the default general placeholder) */}
            {course.onlineMeetingConfig?.title &&
              course.onlineMeetingConfig.title !== 'Phòng học trực tuyến Google Meet / Teams / Zoom' &&
              course.onlineMeetingConfig.title !== 'Phòng học trực tuyến Google Meet' && (
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
                  {course.onlineMeetingConfig.title}
                </h3>
              )}

            {/* Schedule / Note Box */}
            <div className="p-3.5 bg-indigo-950/70 border border-indigo-800/80 rounded-lg text-xs text-indigo-200 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-sm shrink-0">📌</span>
                <div className="leading-relaxed">
                  <strong className="text-white font-bold">Lịch học:</strong>{' '}
                  <span>
                    {course.onlineMeetingConfig?.scheduleTime || 'Thực hiện theo lịch dặn dò của giáo viên bộ môn'}
                  </span>
                </div>
              </div>

              {course.onlineMeetingConfig?.note && (
                <div className="flex items-start gap-2 pt-1.5 border-t border-indigo-800/50">
                  <span className="text-sm shrink-0">💡</span>
                  <div className="leading-relaxed">
                    <strong className="text-white font-bold">Ghi chú:</strong>{' '}
                    <span>{course.onlineMeetingConfig.note}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <a
                href={course.onlineMeetingConfig?.meetingUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!course.onlineMeetingConfig?.meetingUrl) {
                    e.preventDefault();
                    alert('Giáo viên chưa cập nhật đường link phòng học trực tuyến cho khóa học này.');
                  }
                }}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 border border-emerald-400/30 cursor-pointer active:scale-95"
              >
                <Video className="w-4 h-4" />
                <span>Tham Gia Lớp Học (Mở tab mới)</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  const url = course.onlineMeetingConfig?.meetingUrl;
                  if (url) {
                    window.open(
                      url,
                      'OnlineMeetingWindow',
                      'width=1150,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
                    );
                  } else {
                    alert('Giáo viên chưa cập nhật đường link phòng học trực tuyến cho khóa học này.');
                  }
                }}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 border border-indigo-400/30 cursor-pointer active:scale-95"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Mở Cửa Sổ Riêng (Popup)</span>
              </button>

              {/* Attendance Button */}
              <button
                type="button"
                onClick={handleMarkAttendance}
                disabled={sessionCheckedIn || attendanceCountToday >= 3 || attendanceLoading}
                className={`px-4 py-2.5 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 border border-white/20 active:scale-95 cursor-pointer ${
                  sessionCheckedIn || attendanceCountToday >= 3
                    ? 'bg-slate-700/80 text-slate-300 border-slate-600/50 cursor-not-allowed opacity-90'
                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold border-amber-400/40'
                }`}
                title={
                  attendanceCountToday >= 3
                    ? 'Hôm nay bạn đã điểm danh tối đa 3 lần!'
                    : sessionCheckedIn
                    ? 'Bạn đã điểm danh buổi học này!'
                    : 'Bấm vào đây để ghi nhận điểm danh'
                }
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span>
                  {attendanceLoading
                    ? 'Đang điểm danh...'
                    : sessionCheckedIn || attendanceCountToday >= 3
                    ? `Đã điểm danh (${attendanceCountToday}/3)`
                    : attendanceCountToday > 0
                    ? `Điểm danh (Lần ${attendanceCountToday + 1}/3)`
                    : 'Điểm danh'}
                </span>
              </button>

              {/* Teacher/Admin Attendance Excel Export */}
              {isTeacherOrAdmin && (
                <button
                  type="button"
                  onClick={() => setAttendanceExportModalOpen(true)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 border border-emerald-400/30 cursor-pointer active:scale-95 sm:ml-auto"
                  title="Xuất danh sách điểm danh học sinh ra file Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Xuất DS Điểm Danh (Excel)</span>
                </button>
              )}
            </div>
          </div>

          {/* Guidelines Box */}
          <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2 text-xs text-slate-700">
            <div className="font-bold text-slate-800 flex items-center gap-1.5 text-xs sm:text-sm">
              <span>💡</span>
              <span>Hướng dẫn &amp; Lưu ý khi tham gia:</span>
            </div>
            <ul className="space-y-1.5 text-slate-600 pl-4 list-disc leading-relaxed text-xs">
              <li>Tính năng phòng học trực tuyến hoàn toàn độc lập với bài học tự học và bài kiểm tra cuối khóa.</li>
              <li>Học viên có thể nhấp tham gia lớp học bất cứ lúc nào theo lịch dặn dò của giáo viên.</li>
              <li>Hãy sử dụng đúng tên học viên khi tham gia lớp học trên Google Meet, Teams hoặc Zoom.</li>
            </ul>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* LEFT PANEL */}
        <div className="lg:col-span-8 space-y-6">
          {/* VIEW 1: STUDY BLOCK */}
          {activeView === 'STUDY' && (
            !currentLesson ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center mx-auto">
                  <BookOpen className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">
                  Khóa học: {course.title}
                </h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Khóa học này gồm các nội dung luyện tập và kiểm tra đánh giá kiến thức.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  {course.practiceConfig?.enabled && (
                    <button
                      onClick={() => showQuizInstruction(course.practiceConfig, 'EXERCISE', null)}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2"
                    >
                      <FileCheck2 className="w-4 h-4" /> Làm bài tập củng cố
                    </button>
                  )}
                  {course.quizConfig?.enabled !== false && (
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {!hasAttemptedFinalQuiz ? (
                        <button
                          onClick={() => showQuizInstruction(course.quizConfig, 'FINAL', null)}
                          className={`px-5 py-2.5 font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                            areAllLessonsCompleted
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {areAllLessonsCompleted ? <Award className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          Làm Bài Kiểm Tra Cuối Khóa
                        </button>
                      ) : isFinalQuizOutOfAttempts ? (
                        <button
                          onClick={handleOpenFinalQuizReview}
                          className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <FileText className="w-4 h-4" />
                          Xem lại bài làm
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => showQuizInstruction(course.quizConfig, 'FINAL', null)}
                            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Làm lại bài kiểm tra (Đã thi {finalAttemptsCount}/{finalMaxAttempts} lần - Còn {Math.max(0, finalMaxAttempts - finalAttemptsCount)} lượt)
                          </button>
                          <button
                            onClick={handleOpenFinalQuizReview}
                            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                          >
                            <FileText className="w-4 h-4" />
                            Xem lại bài làm
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                <h3 className="text-lg font-extrabold text-blue-900 flex items-center gap-2">
                  Bài {currentLessonIdx + 1}: {currentLesson.title}
                </h3>

                {/* Mode switch */}
                <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
                  {currentLesson.videoUrl && (
                    <button
                      onClick={() => { setLearningMode('VIDEO'); setIsVideoPlaying(true); }}
                      className={`flex-1 py-2 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        learningMode === 'VIDEO'
                          ? 'bg-blue-700 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <PlaySquare className="w-3.5 h-3.5" /> Xem Video
                    </button>
                  )}
                  {currentLesson.docUrl && (
                    <button
                      onClick={() => { setLearningMode('DOC'); setIsVideoPlaying(false); handleUserInteraction(); }}
                      className={`flex-1 py-2 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        learningMode === 'DOC'
                          ? 'bg-blue-700 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" /> Đọc Tài Liệu
                    </button>
                  )}
                  {currentLesson.pptUrl && (
                    <button
                      onClick={() => { setLearningMode('PPT'); setIsVideoPlaying(false); handleUserInteraction(); }}
                      className={`flex-1 py-2 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        learningMode === 'PPT'
                          ? 'bg-blue-700 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Presentation className="w-3.5 h-3.5" /> Xem Slide PPT
                    </button>
                  )}
                </div>

                {/* Content Player */}
                <div
                  className="bg-slate-950 rounded-xl overflow-hidden aspect-video relative flex items-center justify-center shadow-inner"
                  onMouseMove={handleUserInteraction}
                  onClick={handleUserInteraction}
                  onWheel={handleUserInteraction}
                >
                  {learningMode === 'VIDEO' && currentLesson.videoUrl ? (
                    currentLesson.videoUrl.endsWith('.mp4') || currentLesson.videoUrl.endsWith('.webm') ? (
                      <video
                        ref={videoRef}
                        src={currentLesson.videoUrl}
                        controls
                        className="w-full h-full"
                        onPlay={() => setIsVideoPlaying(true)}
                        onPause={() => setIsVideoPlaying(false)}
                        onEnded={() => setIsVideoPlaying(false)}
                      />
                    ) : (
                      <iframe
                        src={getEmbedUrl(currentLesson.videoUrl)}
                        className="w-full h-full border-0"
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                        onLoad={() => setIsVideoPlaying(true)}
                      />
                    )
                  ) : learningMode === 'DOC' && currentLesson.docUrl ? (
                    <iframe
                      src={getEmbedUrl(currentLesson.docUrl)}
                      className="w-full h-full border-0 bg-white"
                    />
                  ) : learningMode === 'PPT' && currentLesson.pptUrl ? (
                    <iframe
                      src={getEmbedUrl(currentLesson.pptUrl)}
                      className="w-full h-full border-0 bg-white"
                      allowFullScreen
                    />
                  ) : (
                    <div className="text-slate-400 text-sm">Chưa có nội dung phương tiện.</div>
                  )}
                </div>

                {/* Accumulated Study Timer & Memory Notice */}
                {(() => {
                  const isNoTimeReq = targetDurationSec === 0;
                  const remainingSec = isNoTimeReq ? 0 : Math.max(0, targetDurationSec - timeWatchedSec);
                  const isCompletedTime = isNoTimeReq || timeWatchedSec >= targetDurationSec || Boolean(userProgress[course.courseId]?.[`LESSON_${currentLessonIdx}`]?.isCompleted);
                  const progressPercent = isNoTimeReq ? 100 : Math.min(100, Math.round((timeWatchedSec / targetDurationSec) * 100));

                  const now = Date.now();
                  const idleSec = Math.floor((now - lastInteractionTime) / 1000);
                  const isDocIdle = (learningMode === 'DOC' || learningMode === 'PPT') && idleSec >= 60;
                  const isAway = !isWindowActive || document.hidden;

                  return (
                    <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl shadow-xs space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-blue-950 text-xs sm:text-sm">
                              Tiến trình học tập đã ghi nhớ
                            </h4>
                            <p className="text-[11px] text-blue-800">
                              {isNoTimeReq
                                ? 'Bài học này không yêu cầu tích lũy thời gian tối thiểu'
                                : 'Tự động đồng bộ và lưu giữ thời gian học trên tài khoản của bạn'}
                            </p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full font-bold text-xs shadow-2xs border ${
                          isCompletedTime
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : isAway || isDocIdle
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-blue-100 text-blue-900 border-blue-300'
                        }`}>
                          {isNoTimeReq ? '✓ Tự do học tập' : isCompletedTime ? '✓ Đã hoàn thành' : isAway || isDocIdle ? '⏸️ Tạm dừng' : `Đã học ${progressPercent}%`}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-blue-200/70 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isCompletedTime ? 'bg-emerald-500' : isAway || isDocIdle ? 'bg-amber-500' : 'bg-blue-600'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 pt-0.5">
                        <div>
                          {isNoTimeReq ? (
                            <span>Thời gian đã học: <strong className="text-blue-900 font-bold">{formatTimer(timeWatchedSec)}</strong> (Không yêu cầu thời gian tối thiểu)</span>
                          ) : (
                            <span>Thời gian đã học: <strong className="text-blue-900 font-bold">{formatTimer(timeWatchedSec)}</strong> / {formatTimer(targetDurationSec)}</span>
                          )}
                        </div>
                        {isCompletedTime ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isNoTimeReq ? 'Có thể làm bài tập / kiểm tra ngay' : 'Đã hoàn thành thời gian yêu cầu'}
                          </span>
                        ) : (
                          <div className="text-amber-900 font-bold bg-amber-100/90 px-2.5 py-0.5 rounded-md border border-amber-200">
                            Cần học thêm: <strong>{formatTimer(remainingSec)}</strong>
                          </div>
                        )}
                      </div>

                      {/* Mode & Interaction Status Indicator */}
                      {!isCompletedTime && (
                        <div className="space-y-1.5 pt-1">
                          {isAway ? (
                            <div className="text-[11px] text-amber-900 bg-amber-100/90 p-2.5 rounded-xl border border-amber-300 font-medium flex items-center gap-2 animate-pulse">
                              <span className="font-extrabold text-amber-700 text-xs">⏸️ ĐÃ TẠM DỪNG:</span>
                              <span>Bạn đã rời khỏi màn hình/tab học tập. Hãy quay lại trang để tiếp tục tính thời gian.</span>
                            </div>
                          ) : learningMode === 'VIDEO' ? (
                            <div className="text-[11px] text-emerald-900 bg-emerald-50 p-2 rounded-xl border border-emerald-200 flex items-center gap-2">
                              <span className="font-bold text-emerald-700">🎬 Bài học Video:</span>
                              <span>Thời gian tự động tính khi xem video (không cần di chuyển chuột hay dùng phím).</span>
                            </div>
                          ) : isDocIdle ? (
                            <div className="text-[11px] text-red-900 bg-red-100/90 p-2.5 rounded-xl border border-red-300 font-medium flex items-center gap-2 animate-pulse">
                              <span className="font-extrabold text-red-700 text-xs">⚠️ TẠM DỪNG TÍNH THỜI GIAN:</span>
                              <span>Đã quá 1 phút bạn ngưng thao tác! Hãy lăn chuột, di chuyển con trỏ hoặc bấm phím mũi tên để tiếp tục học.</span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-blue-900 bg-blue-100/80 p-2 rounded-xl border border-blue-200 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-blue-700">📄 Đọc tài liệu / PPT:</span>
                                <span>Yêu cầu lăn chuột/dùng phím mũi tên. Hệ thống đang tính thời gian.</span>
                              </div>
                              <span className="font-mono text-[10px] text-blue-800 shrink-0 font-bold">
                                Thao tác gần nhất: {idleSec}s trước
                              </span>
                            </div>
                          )}

                          {timeWatchedSec > 0 && (
                            <div className="text-[11px] text-slate-600 bg-white/80 p-2 rounded-xl border border-blue-100 flex items-center gap-1.5">
                              <span className="font-bold text-blue-700">💡 Ghi nhớ thời gian:</span>
                              <span>Nếu bạn thoát hoặc đăng xuất, lần tới mở lại chỉ cần học thêm <strong>{formatTimer(remainingSec)}</strong> nữa để hoàn thành.</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Next Lesson / Exercise Trigger */}
                <div className="space-y-3">
                  {currentLesson.exerciseConfig?.enabled && (
                    userProgress[course.courseId]?.[`LESSON_EXERCISE_${currentLessonIdx}`]?.passed ? (
                      <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                        <div className="text-xs text-indigo-950 font-semibold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Bài tập củng cố: <strong className="text-emerald-700 font-bold">Đạt ({userProgress[course.courseId]?.[`LESSON_EXERCISE_${currentLessonIdx}`]?.lastScore ?? 0} điểm)</strong></span>
                        </div>
                        <button
                          onClick={() => showQuizInstruction(currentLesson.exerciseConfig, 'EXERCISE', currentLessonIdx)}
                          className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Làm lại bài tập củng cố
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => showQuizInstruction(currentLesson.exerciseConfig, 'EXERCISE', currentLessonIdx)}
                        disabled={timeWatchedSec < targetDurationSec}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        <FileCheck2 className="w-4 h-4" />
                        Làm bài tập củng cố
                      </button>
                    )
                  )}

                  <button
                    disabled={timeWatchedSec < targetDurationSec}
                    onClick={() => {
                      if (currentLessonIdx < (course.lessons?.length || 0) - 1) {
                        setCurrentLessonIdx(currentLessonIdx + 1);
                      } else {
                        alert('Bạn đã hoàn thành tất cả bài học trong khóa!');
                      }
                    }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {currentLessonIdx < (course.lessons?.length || 0) - 1
                      ? 'Đã hoàn thành - Chuyển bài học tiếp theo'
                      : 'Hoàn thành toàn bộ bài học'}
                  </button>
                </div>

                {/* Q&A Section for this lesson */}
                <LessonQaSection
                  course={course}
                  currentLesson={currentLesson}
                  currentLessonIdx={currentLessonIdx}
                  currentUser={currentUser}
                />
              </div>
            )
          )}

          {/* VIEW 2: QUIZ SECTION */}
          {activeView === 'QUIZ' && (
            <div className="bg-white rounded-2xl border border-rose-200 shadow-md p-6 space-y-6">
              {/* Sticky Header Banner */}
              <div className="sticky top-0 z-30 bg-white border-b-2 border-rose-500 pb-4 pt-2 mb-4 -mx-6 px-6 shadow-sm">
                <div className="flex justify-between items-center gap-4">
                  <h3 className="font-extrabold text-rose-700 text-base sm:text-lg flex items-center gap-2">
                    <Award className="w-5 h-5 text-rose-600" />
                    {activeQuizContext.type === 'EXERCISE'
                      ? 'BÀI TẬP CỦNG CỐ'
                      : 'BÀI KIỂM TRA CUỐI KHÓA'}
                  </h3>

                  <div className="bg-rose-600 text-white px-3.5 py-1.5 rounded-full font-bold text-sm shadow-sm flex items-center gap-1.5 shrink-0">
                    <Clock className="w-4 h-4 animate-pulse" />
                    <span>Thời gian còn lại: {formatTimer(quizTimeLeftSec)}</span>
                  </div>
                </div>

                {/* Anti-cheat Box */}
                <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Nội quy: Học viên không được thoát tab hoặc chuyển ứng dụng khi thi.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-rose-600 text-white font-bold rounded-md text-[11px]">
                      Cảnh báo: {cheatWarnings}/3
                    </span>
                    {awayTimeSec > 0 && (
                      <span className="text-rose-700 font-bold">
                        Rời: {awayTimeSec}s/30s
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Questions Rendered by Parts */}
              <div className="space-y-8">
                {/* Part 1 */}
                {quizP1.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-4 py-3 rounded-xl shadow-sm flex items-center justify-between font-bold text-sm">
                      <span>Phần 1. Trắc nghiệm nhiều lựa chọn</span>
                      <span className="bg-white/20 px-2.5 py-1 rounded-lg text-xs font-extrabold backdrop-blur-sm">
                        Tổng điểm: {p1TotalScore} điểm
                      </span>
                    </div>

                    <div className="space-y-4">
                      {quizP1.map((q) => {
                        const qIdx = q.globalIdx;
                        return (
                          <div
                            key={qIdx}
                            id={`q_card_${qIdx}`}
                            className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                          >
                            <p className="font-bold text-slate-900 text-sm">
                              Câu {qIdx + 1}: <span dangerouslySetInnerHTML={{ __html: q.question }} />
                            </p>

                            <div className="space-y-2 pt-1">
                              {Object.entries(q.options || {}).map(([key, text]) => (
                                <label
                                  key={key}
                                  className="flex items-center gap-2.5 p-2.5 bg-white hover:bg-blue-50/50 border border-slate-200 rounded-lg cursor-pointer transition-colors text-xs sm:text-sm"
                                >
                                  <input
                                    type="radio"
                                    name={`q_${qIdx}`}
                                    value={key}
                                    checked={userAnswers[qIdx] === key}
                                    onChange={() =>
                                      setUserAnswers({ ...userAnswers, [qIdx]: key })
                                    }
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="inline-flex items-center gap-1 flex-wrap">
                                    <strong>{key}.</strong> <span dangerouslySetInnerHTML={{ __html: text }} />
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part 2 */}
                {quizP2.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-4 py-3 rounded-xl shadow-sm flex items-center justify-between font-bold text-sm">
                      <span>Phần 2. Trắc nghiệm đúng / sai</span>
                      <span className="bg-white/20 px-2.5 py-1 rounded-lg text-xs font-extrabold backdrop-blur-sm">
                        Tổng điểm: {p2TotalScore} điểm
                      </span>
                    </div>

                    <div className="space-y-4">
                      {quizP2.map((q) => {
                        const qIdx = q.globalIdx;
                        const labelMap: Record<string, string> = { A: 'a)', B: 'b)', C: 'c)', D: 'd)' };

                        return (
                          <div
                            key={qIdx}
                            id={`q_card_${qIdx}`}
                            className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                          >
                            <p className="font-bold text-slate-900 text-sm">
                              Câu {qIdx + 1}: <span dangerouslySetInnerHTML={{ __html: q.question }} />
                            </p>

                            <div className="space-y-2 pt-1">
                              {Object.entries(q.options || {}).map(([key, text]) => {
                                const subLabel = labelMap[key] || `${key}.`;
                                return (
                                  <div
                                    key={key}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm"
                                  >
                                    <span className="flex-1 pr-2 font-medium text-slate-800">
                                      <strong className="text-blue-900">{subLabel}</strong>{' '}
                                      <span dangerouslySetInnerHTML={{ __html: text }} />
                                    </span>
                                    <div className="flex items-center gap-4 shrink-0 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
                                      <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 hover:text-blue-700">
                                        <input
                                          type="radio"
                                          name={`q_${qIdx}_${key}`}
                                          value="DUNG"
                                          checked={userAnswers[qIdx]?.[key] === 'DUNG'}
                                          onChange={() =>
                                            setUserAnswers({
                                              ...userAnswers,
                                              [qIdx]: { ...(userAnswers[qIdx] || {}), [key]: 'DUNG' },
                                            })
                                          }
                                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>Đúng</span>
                                      </label>

                                      <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 hover:text-rose-700">
                                        <input
                                          type="radio"
                                          name={`q_${qIdx}_${key}`}
                                          value="SAI"
                                          checked={userAnswers[qIdx]?.[key] === 'SAI'}
                                          onChange={() =>
                                            setUserAnswers({
                                              ...userAnswers,
                                              [qIdx]: { ...(userAnswers[qIdx] || {}), [key]: 'SAI' },
                                            })
                                          }
                                          className="w-4 h-4 text-rose-600 focus:ring-rose-500"
                                        />
                                        <span>Sai</span>
                                      </label>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part 3 */}
                {quizP3.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-4 py-3 rounded-xl shadow-sm flex items-center justify-between font-bold text-sm">
                      <span>Phần 3. Câu trả lời ngắn</span>
                      <span className="bg-white/20 px-2.5 py-1 rounded-lg text-xs font-extrabold backdrop-blur-sm">
                        Tổng điểm: {p3TotalScore} điểm
                      </span>
                    </div>

                    <div className="space-y-4">
                      {quizP3.map((q) => {
                        const qIdx = q.globalIdx;
                        return (
                          <div
                            key={qIdx}
                            id={`q_card_${qIdx}`}
                            className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                          >
                            <p className="font-bold text-slate-900 text-sm">
                              Câu {qIdx + 1}: <span dangerouslySetInnerHTML={{ __html: q.question }} />
                            </p>

                            <div className="pt-1">
                              <input
                                type="text"
                                value={userAnswers[qIdx] || ''}
                                onChange={(e) =>
                                  setUserAnswers({ ...userAnswers, [qIdx]: e.target.value })
                                }
                                placeholder="Nhập câu trả lời của bạn..."
                                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Quiz Button */}
              <button
                type="button"
                disabled={isQuizSubmitting}
                onClick={() => {
                  if (confirm('Bạn có chắc chắn muốn nộp bài thi ngay không?')) {
                    processQuizSubmission();
                  }
                }}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {isQuizSubmitting ? 'Đang nộp bài...' : 'Nộp bài kiểm tra'}
              </button>
            </div>
          )}

          {/* VIEW 3: REVIEW SECTION */}
          {activeView === 'REVIEW' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-3">
                <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider">
                  {activeQuizContext?.type === 'FINAL' ? 'Kết Quả Bài Thu Hoạch Cuối Khóa' : 'Kết Quả Bài Tập Củng Cố'}
                </h4>
                {(() => {
                  const displayScore =
                    activeQuizContext?.type === 'FINAL'
                      ? (reviewScore > 0 ? reviewScore : currentFinalScore)
                      : reviewScore;
                  const displayPassing =
                    activeQuizContext?.type === 'FINAL'
                      ? (reviewPassingScore > 0 ? reviewPassingScore : effectiveFinalPassingScore)
                      : reviewPassingScore;
                  const isPassed =
                    activeQuizContext?.type === 'FINAL'
                      ? (isFinalQuizPassed || displayScore >= displayPassing)
                      : displayScore >= displayPassing;

                  return (
                    <>
                      <div className="text-4xl font-black text-blue-700">{displayScore}/{totalQuizMaxPoints}</div>
                      <p className="text-sm font-bold">
                        {isPassed ? (
                          <span className="text-emerald-600 flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="w-5 h-5" /> ĐẠT YÊU CẦU (≥{displayPassing}đ)
                          </span>
                        ) : (
                          <span className="text-rose-600 flex items-center justify-center gap-1.5">
                            <XCircle className="w-5 h-5" /> CHƯA ĐẠT (Yêu cầu ≥{displayPassing}đ)
                          </span>
                        )}
                      </p>

                      {/* Specific persistent criteria badges for certification */}
                      {activeQuizContext?.type === 'FINAL' ? (
                        <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-xl mx-auto text-left">
                          <div className="bg-white p-3 rounded-xl border border-slate-200">
                            <div className="text-[11px] font-semibold text-slate-500">Số lần đã làm bài</div>
                            <div className="text-base font-bold text-slate-800">
                              {finalAttemptsCount} / {finalMaxAttempts} lần
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-slate-200">
                            <div className="text-[11px] font-semibold text-slate-500">Kết quả xếp loại</div>
                            <div className={`text-base font-bold ${isPassed ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'}
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-slate-200">
                            <div className="text-[11px] font-semibold text-slate-500">Số lần vi phạm quy chế</div>
                            <div className={`text-base font-bold ${(finalQStatus?.violations ?? cheatWarnings) > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                              {finalQStatus?.violations ?? cheatWarnings} lần
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-600">
                          <span className="bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                            Điểm bài tập: <strong className="text-blue-700 font-bold">{displayScore}đ</strong>
                          </span>
                          <span className="bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                            Đánh giá: <strong className={isPassed ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                              {isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'}
                            </strong>
                          </span>
                          <span className="text-[11px] text-slate-400">
                            (Căn cứ xét cấp Giấy chứng nhận)
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* History of attempts if multiple */}
                {activeQuizContext?.type === 'FINAL' && Array.isArray(finalQStatus?.attemptsHistory) && finalQStatus.attemptsHistory.length > 1 && (
                  <div className="mt-4 pt-3 border-t border-slate-200 text-left">
                    <div className="text-xs font-bold text-slate-700 mb-2">Lịch sử các lần làm bài:</div>
                    <div className="space-y-1.5">
                      {finalQStatus.attemptsHistory.map((h: any, hIdx: number) => (
                        <div key={hIdx} className="bg-white px-3 py-2 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">Lần {h.attempt || hIdx + 1}:</span>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-blue-700">{h.score} điểm</span>
                            <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${h.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                              {h.passed ? 'ĐẠT' : 'CHƯA ĐẠT'}
                            </span>
                            <span className="text-slate-500 text-[11px]">Vi phạm: {h.violations || 0}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Questions Review Grouped by Parts */}
              <div className="space-y-8">
                {/* Part 1 Review */}
                {revP1.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-4 py-3 rounded-xl shadow-sm flex items-center justify-between font-bold text-sm">
                      <span>Phần 1. Trắc nghiệm nhiều lựa chọn</span>
                      <span className="bg-white/20 px-2.5 py-1 rounded-lg text-xs font-extrabold backdrop-blur-sm">
                        Tổng điểm: {p1TotalScore} điểm
                      </span>
                    </div>

                    <div className="space-y-4">
                      {revP1.map((res) => {
                        const qIdx = res.globalIdx;
                        return (
                          <div
                            key={qIdx}
                            id={`rev_card_${qIdx}`}
                            className="p-4 rounded-xl border bg-slate-50/80 border-slate-200 space-y-3"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <p className="font-bold text-slate-900 text-sm">
                                Câu {qIdx + 1}: <span dangerouslySetInnerHTML={{ __html: res.question }} />
                              </p>
                              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded-md shrink-0 border border-blue-200">
                                {res.score !== undefined ? `${res.score}đ` : ''}
                              </span>
                            </div>

                            <div className="space-y-1.5 text-xs">
                              {Object.entries(res.options || {}).map(([k, text]) => {
                                const isUserSelect = res.userAns === k;
                                let style = 'bg-white border-slate-200 text-slate-700';
                                if (isUserSelect) {
                                  style = 'bg-blue-50 border-blue-300 text-blue-900 font-bold';
                                }

                                return (
                                  <div
                                    key={k}
                                    className={`p-2.5 rounded-lg border flex justify-between items-center ${style}`}
                                  >
                                    <span className="inline-flex items-center gap-1 flex-wrap">
                                      <strong>{k}.</strong> <span dangerouslySetInnerHTML={{ __html: text }} />
                                    </span>
                                    {isUserSelect && (
                                      <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wide shrink-0">
                                        Lựa chọn của bạn
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part 2 Review */}
                {revP2.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-4 py-3 rounded-xl shadow-sm flex items-center justify-between font-bold text-sm">
                      <span>Phần 2. Trắc nghiệm đúng / sai</span>
                      <span className="bg-white/20 px-2.5 py-1 rounded-lg text-xs font-extrabold backdrop-blur-sm">
                        Tổng điểm: {p2TotalScore} điểm
                      </span>
                    </div>

                    <div className="space-y-4">
                      {revP2.map((res) => {
                        const qIdx = res.globalIdx;
                        const labelMap: Record<string, string> = { A: 'a)', B: 'b)', C: 'c)', D: 'd)' };

                        return (
                          <div
                            key={qIdx}
                            id={`rev_card_${qIdx}`}
                            className="p-4 rounded-xl border bg-slate-50/80 border-slate-200 space-y-3"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <p className="font-bold text-slate-900 text-sm">
                                Câu {qIdx + 1}: <span dangerouslySetInnerHTML={{ __html: res.question }} />
                              </p>
                              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded-md shrink-0 border border-blue-200">
                                {res.score !== undefined ? `${res.score}đ` : ''}
                              </span>
                            </div>

                            <div className="space-y-2 text-xs">
                              {Object.entries(res.options || {}).map(([k, text]) => {
                                const uChoice = res.userAns?.[k];
                                const subLabel = labelMap[k] || `${k}.`;

                                return (
                                  <div
                                    key={k}
                                    className="p-2.5 bg-white border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                  >
                                    <span className="font-medium text-slate-800 flex-1">
                                      <strong className="text-blue-900">{subLabel}</strong>{' '}
                                      <span dangerouslySetInnerHTML={{ __html: text }} />
                                    </span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[11px] text-slate-500 font-medium">Lựa chọn của bạn:</span>
                                      {uChoice === 'DUNG' ? (
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-bold text-[11px]">
                                          Đúng
                                        </span>
                                      ) : uChoice === 'SAI' ? (
                                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded font-bold text-[11px]">
                                          Sai
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-300 rounded font-semibold text-[11px]">
                                          Chưa chọn
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part 3 Review */}
                {revP3.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-4 py-3 rounded-xl shadow-sm flex items-center justify-between font-bold text-sm">
                      <span>Phần 3. Câu trả lời ngắn</span>
                      <span className="bg-white/20 px-2.5 py-1 rounded-lg text-xs font-extrabold backdrop-blur-sm">
                        Tổng điểm: {p3TotalScore} điểm
                      </span>
                    </div>

                    <div className="space-y-4">
                      {revP3.map((res) => {
                        const qIdx = res.globalIdx;
                        return (
                          <div
                            key={qIdx}
                            id={`rev_card_${qIdx}`}
                            className="p-4 rounded-xl border bg-slate-50/80 border-slate-200 space-y-3"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <p className="font-bold text-slate-900 text-sm">
                                Câu {qIdx + 1}: <span dangerouslySetInnerHTML={{ __html: res.question }} />
                              </p>
                              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded-md shrink-0 border border-blue-200">
                                {res.score !== undefined ? `${res.score}đ` : ''}
                              </span>
                            </div>

                            <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-medium">Lựa chọn của bạn:</span>
                                <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                                  {res.userAns || '(Chưa nhập)'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons for Review */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  {activeQuizContext?.type === 'EXERCISE' && activeQuizContext?.config && (
                    <button
                      onClick={() => {
                        startQuizSession(activeQuizContext.config, 'EXERCISE', activeQuizContext.lessonIdx);
                      }}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" /> Làm lại
                    </button>
                  )}
                  {activeQuizContext?.type === 'FINAL' && canRetryFinalQuiz && (
                    <button
                      onClick={handleRetryFinalQuizWithCertCheck}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" /> Làm lại bài kiểm tra (Đã thi {finalAttemptsCount}/{finalMaxAttempts} lần - Còn {Math.max(0, finalMaxAttempts - finalAttemptsCount)} lượt)
                    </button>
                  )}
                  {activeQuizContext?.type === 'FINAL' && isFinalQuizOutOfAttempts && (
                    <span className="px-5 py-2.5 bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl flex items-center">
                      Đã hết số lần làm bài ({finalAttemptsCount}/{finalMaxAttempts} lần)
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setActiveView('STUDY')}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ml-auto shadow-sm border border-slate-200"
                >
                  <ArrowLeft className="w-4 h-4" /> Quay về bài học
                </button>
              </div>
            </div>
          )}

          {/* VIEW 4: CERTIFICATE VIEW BLOCK */}
          {activeView === 'CERTIFICATE' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-600" />
                  Giấy chứng nhận hoàn thành khóa học
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveView('STUDY')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  Quay về bài học
                </button>
              </div>

              <CertificateView
                certificate={issuedCertificate || undefined}
                previewConfig={course.certificateConfig}
                previewCourseTitle={course.title}
                previewStudentName={currentUser.fullName || currentUser.hoTen}
                previewStudentClass={currentUser.className || currentUser.chiDoan}
                previewSignerName={course.authorName}
                onClose={() => setActiveView('STUDY')}
                onDeleteCertificate={(certId) => {
                  setIssuedCertificate(null);
                  setActiveView('STUDY');
                }}
              />
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-4 space-y-6">
          {/* Lesson Content List Card - Hidden when taking or reviewing a quiz */}
          {(activeView === 'STUDY' || activeView === 'CERTIFICATE') && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-700" />
                NỘI DUNG KHÓA HỌC
              </h4>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {course.lessons && course.lessons.map((l, idx) => {
                  const progress = userProgress[course.courseId] || {};
                  const pObj = progress[`LESSON_${idx}`] || { watchedSec: 0 };
                  const d = l.duration !== undefined ? Number(l.duration) : 1;
                  const reqSec = d === 0 ? 0 : (d >= 30 ? d : d * 60);
                  const currentSec =
                    idx === currentLessonIdx && activeView === 'STUDY'
                      ? Math.max(pObj.watchedSec || 0, timeWatchedSec)
                      : pObj.watchedSec || 0;
                  const contentDone = reqSec === 0 || pObj.isCompleted || currentSec >= reqSec;
                  const ex = l.exerciseConfig || {};
                  const exProg = progress[`LESSON_EXERCISE_${idx}`] || {};
                  const exPassing = ex.passingScore !== undefined ? Number(ex.passingScore) : 80;
                  const isExPassed =
                    typeof exProg === 'number'
                      ? exProg >= exPassing
                      : exProg.passed === true || (exProg.lastScore !== undefined && exProg.lastScore >= exPassing);

                  return (
                    <div key={idx} className="divide-y divide-slate-100">
                      <button
                        onClick={() => {
                          setCurrentLessonIdx(idx);
                          setActiveView('STUDY');
                        }}
                        className={`w-full text-left p-3 text-xs font-semibold flex items-center justify-between transition-colors ${
                          idx === currentLessonIdx && activeView === 'STUDY'
                            ? 'bg-blue-50 text-blue-900 font-bold border-l-4 border-l-blue-700'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex flex-col gap-0.5 max-w-[70%]">
                          <span className="line-clamp-1">
                            Bài {idx + 1}: {l.title}
                          </span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            Thời gian: <strong className={contentDone ? 'text-emerald-700 font-bold' : 'text-blue-700 font-bold'}>{formatTimer(currentSec)}</strong> / {formatTimer(reqSec)}
                          </span>
                        </div>
                        {contentDone ? (
                          <div className="flex items-center gap-1 shrink-0 text-emerald-600 font-bold text-[10px]">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Đã đạt</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0 text-slate-400 font-medium text-[10px]">
                            <PlayCircle className="w-4 h-4 text-slate-400" />
                            <span>Đang học</span>
                          </div>
                        )}
                      </button>

                      {ex.enabled && (
                        <button
                          onClick={() => {
                            if (!contentDone) {
                              alert(`Cần hoàn thành thời gian học tích lũy (${formatTimer(currentSec)}/${formatTimer(reqSec)}) trước khi làm bài tập củng cố.`);
                            } else {
                              showQuizInstruction(ex, 'EXERCISE', idx);
                            }
                          }}
                          disabled={!contentDone}
                          className={`w-full text-left p-2.5 pl-6 text-[11px] font-medium flex items-center justify-between transition-colors ${
                            isExPassed
                              ? 'text-emerald-700 bg-emerald-50/50'
                              : !contentDone
                              ? 'text-slate-400 bg-slate-50/50 opacity-80 cursor-not-allowed'
                              : 'text-slate-700 hover:bg-slate-50 cursor-pointer'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <FileCheck2 className="w-3.5 h-3.5 text-indigo-500" />
                            Bài tập củng cố
                          </span>
                          {isExPassed ? (
                            <span className="inline-flex items-center gap-1 font-bold text-indigo-700 bg-indigo-100/90 hover:bg-indigo-200 px-2 py-0.5 rounded text-[10px] transition-colors border border-indigo-200">
                              <RotateCcw className="w-3 h-3 text-indigo-600" />
                              Làm lại ({typeof exProg === 'number' ? exProg : exProg.lastScore ?? 0}đ)
                            </span>
                          ) : contentDone ? (
                            <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded text-[10px]">Làm ngay</span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-400 font-medium text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              <Lock className="w-3 h-3 text-slate-400" />
                              Khóa ({formatTimer(currentSec)}/{formatTimer(reqSec)})
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}

                {course.quizConfig?.enabled !== false && (
                  <div className="border-t border-slate-200">
                    {!hasAttemptedFinalQuiz ? (
                      <button
                        onClick={() => {
                          if (!areAllLessonsCompleted) {
                            alert('Cần hoàn thành tất cả nội dung bài học mới được làm bài kiểm tra cuối khóa.');
                            return;
                          }
                          showQuizInstruction(course.quizConfig, 'FINAL', null);
                        }}
                        className={`w-full text-left p-3.5 font-bold text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          areAllLessonsCompleted
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-800'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {areAllLessonsCompleted ? (
                            <Award className="w-4 h-4 text-rose-600" />
                          ) : (
                            <Lock className="w-4 h-4 text-slate-400" />
                          )}
                          Bài kiểm tra cuối khóa
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-md font-bold ${
                          areAllLessonsCompleted ? 'bg-rose-200/80 text-rose-900' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {areAllLessonsCompleted ? 'Thi' : 'Khóa'}
                        </span>
                      </button>
                    ) : isFinalQuizPassed ? (
                      <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-lg space-y-1.5">
                        <div className="text-[11px] font-bold text-emerald-900 px-1 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Bài kiểm tra cuối khóa
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
                            ĐẠT ({currentFinalScore}đ)
                          </span>
                        </div>
                        <p className="text-[10.5px] text-emerald-700/90 px-1 font-medium">
                          Đã thi {finalAttemptsCount}/{finalMaxAttempts} lần (còn {Math.max(0, finalMaxAttempts - finalAttemptsCount)} lượt)
                        </p>
                        <div className={`grid ${canRetryFinalQuiz ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5 pt-0.5`}>
                          <button
                            onClick={handleOpenFinalQuizReview}
                            className="py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <FileText className="w-3 h-3" /> Xem bài làm ({currentFinalScore}đ)
                          </button>
                          {canRetryFinalQuiz && (
                            <button
                              onClick={handleRetryFinalQuizWithCertCheck}
                              className="py-1.5 px-2 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[11px] rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" /> Làm lại
                            </button>
                          )}
                        </div>
                      </div>
                    ) : isFinalQuizOutOfAttempts ? (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg space-y-1.5">
                        <div className="text-[11px] font-bold text-rose-900 px-1 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            Bài kiểm tra cuối khóa
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-200 text-rose-900">
                            Chưa đạt ({currentFinalScore}đ)
                          </span>
                        </div>
                        <p className="text-[10.5px] text-rose-700 px-1 font-medium">
                          Đã dùng hết số lần làm bài ({finalAttemptsCount}/{finalMaxAttempts} lần)
                        </p>
                        <button
                          onClick={handleOpenFinalQuizReview}
                          className="w-full py-1.5 px-2 bg-slate-700 hover:bg-slate-800 text-white font-bold text-[11px] rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <FileText className="w-3 h-3" /> Xem bài làm ({currentFinalScore}đ)
                        </button>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg space-y-1.5">
                        <div className="text-[11px] font-bold text-amber-900 px-1 flex items-center justify-between">
                          <span>Bài kiểm tra cuối khóa</span>
                          <span className="text-slate-600 font-normal">Đã thi: {finalAttemptsCount}/{finalMaxAttempts} lần (còn {Math.max(0, finalMaxAttempts - finalAttemptsCount)} lượt)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => showQuizInstruction(course.quizConfig, 'FINAL', null)}
                            className="py-1.5 px-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" /> Làm lại
                          </button>
                          <button
                            onClick={handleOpenFinalQuizReview}
                            className="py-1.5 px-2 bg-slate-700 hover:bg-slate-800 text-white font-bold text-[11px] rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <FileText className="w-3 h-3" /> Bài làm ({currentFinalScore}đ)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Certificate Sidebar Button */}
                {course.certificateConfig?.enabled !== false && (
                  <button
                    onClick={handleViewOrIssueCertificate}
                    disabled={issuingCert}
                    className={`w-full text-left p-3.5 font-bold text-xs flex items-center justify-between transition-all border-t cursor-pointer ${
                      activeView === 'CERTIFICATE'
                        ? 'bg-amber-100 text-amber-950 font-extrabold border-l-4 border-l-amber-600'
                        : issuedCertificate
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                        : isCertificateEligible
                        ? 'bg-gradient-to-r from-amber-50 to-emerald-50 hover:from-amber-100 hover:to-emerald-100 text-amber-900 border-amber-300'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Award className={`w-4 h-4 ${issuedCertificate || isCertificateEligible ? 'text-amber-600' : 'text-slate-400'}`} />
                      {issuingCert ? 'Đang cấp bằng...' : 'Xem Giấy chứng nhận'}
                    </span>
                    {issuedCertificate ? (
                      <span className="text-[11px] bg-amber-200/90 text-amber-950 px-2 py-0.5 rounded-md font-extrabold shadow-xs">
                        Đã cấp
                      </span>
                    ) : isCertificateEligible ? (
                      <span className="text-[11px] bg-emerald-600 text-white px-2 py-0.5 rounded-md font-extrabold shadow-xs">
                        Nhận bằng
                      </span>
                    ) : (
                      <span className="text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                        Khóa
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
          )}

          {/* Quiz Question Grid Navigator */}
          {(activeView === 'QUIZ' || activeView === 'REVIEW') && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-blue-700" />
                Danh sách câu hỏi ({activeQuestions.length || reviewDetails.length})
              </h4>

              <div className="grid grid-cols-5 gap-2">
                {(activeView === 'QUIZ' ? activeQuestions : reviewDetails).map((q, idx) => {
                  const isAns = activeView === 'QUIZ' ? userAnswers.hasOwnProperty(idx) : true;
                  let bg = 'bg-slate-100 text-slate-700 hover:bg-slate-200';
                  if (activeView === 'QUIZ' && isAns) bg = 'bg-blue-600 text-white font-bold';
                  if (activeView === 'REVIEW') {
                    bg = 'bg-blue-100 text-blue-900 font-bold hover:bg-blue-200 border border-blue-300';
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        const targetId = activeView === 'QUIZ' ? `q_card_${idx}` : `rev_card_${idx}`;
                        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`h-9 rounded-lg font-bold text-xs flex items-center justify-center transition-all ${bg}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Quiz Instruction Modal */}
      {instructionModalOpen && pendingQuizStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 overflow-hidden space-y-3.5 p-4 sm:p-5 max-h-[min(90vh,540px)] flex flex-col">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-base border-b pb-2.5">
              <HelpCircle className="w-5 h-5 text-blue-700" />
              <h3>HƯỚNG DẪN LÀM BÀI</h3>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Vui lòng đọc kỹ hướng dẫn. Ngay sau khi bấm “Bắt đầu làm bài”, thời gian làm bài sẽ bắt đầu đếm ngược.
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 border rounded-xl bg-slate-50">
                <div className="text-[11px] text-slate-500">Thời gian</div>
                <div className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5">
                  {pendingQuizStart.qConfig.durationMin || 15} phút
                </div>
              </div>

              <div className="p-2.5 border rounded-xl bg-slate-50">
                <div className="text-[11px] text-slate-500">Số lần làm</div>
                <div className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5">
                  {pendingQuizStart.quizType === 'EXERCISE' ? 'Không giới hạn' : `${pendingQuizStart.qConfig.maxAttempts || 1} lần`}
                </div>
              </div>

              <div className="p-2.5 border rounded-xl bg-slate-50">
                <div className="text-[11px] text-slate-500">Điểm đạt</div>
                <div className="font-bold text-emerald-700 text-xs sm:text-sm mt-0.5">
                  ≥{pendingQuizStart.qConfig.passingScore || 80}đ
                </div>
              </div>
            </div>

            {pendingQuizStart.quizType === 'EXERCISE' && (
              <div className="p-2.5 bg-indigo-50/90 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center gap-2 font-medium">
                <RotateCcw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Học viên có thể làm lại bài tập củng cố này nhiều lần để rèn luyện và cải thiện điểm số.</span>
              </div>
            )}

            <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
              <li>Không tải lại trang, đóng trình duyệt hoặc chuyển ứng dụng khi đang làm bài.</li>
              <li>Hệ thống tự động giám sát và khóa bài thi nếu vi phạm rời màn hình quá 3 lần.</li>
              <li>Kiểm tra lại tất cả các câu trả lời trước khi bấm nút “Nộp bài”.</li>
            </ul>

            <div className="pt-2.5 border-t flex justify-end gap-2 mt-auto">
              <button
                onClick={() => setInstructionModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  setInstructionModalOpen(false);
                  startQuizSession(
                    pendingQuizStart.qConfig,
                    pendingQuizStart.quizType,
                    pendingQuizStart.lessonIdx
                  );
                }}
                className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <PlayCircle className="w-3.5 h-3.5" /> Bắt đầu làm bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NQDieu AI Chat Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[min(90vh,560px)]">
            {/* Modal Header */}
            <div className="p-3.5 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/15 rounded-xl border border-white/20">
                  <Bot className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-1.5">
                    TRỢ LÝ HỌC TẬP NQDIEU AI
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  </h3>
                  <p className="text-[11px] text-blue-100">Giải đáp thắc mắc bài học &amp; Gợi mở tư duy 24/7</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAiModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3.5 overflow-y-auto flex-1">
              <AiTutorChat
                courseTitle={course.title}
                lessonTitle={currentLesson?.title || 'Bài học'}
                lessonDescription={currentLesson?.description}
                learningMode={learningMode}
                contentText={currentLesson?.docUrl || currentLesson?.videoUrl || currentLesson?.pptUrl}
                initialExpanded={true}
              />
            </div>
          </div>
        </div>
      )}

      <LeaderboardModal
        isOpen={leaderboardOpen}
        course={course}
        currentUser={currentUser}
        onClose={() => setLeaderboardOpen(false)}
      />

      <AttendanceExportModal
        isOpen={attendanceExportModalOpen}
        onClose={() => setAttendanceExportModalOpen(false)}
        courseId={course.courseId}
        courseTitle={course.title}
      />
    </div>
  );
};
