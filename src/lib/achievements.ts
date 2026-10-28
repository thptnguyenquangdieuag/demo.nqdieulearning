import { User, Course, IssuedCertificate } from '../types';
import {
  getStoredCertificates,
  getStoredDailyStudyLog,
  addNotification,
  getStoredUnlockedBadges,
  saveStoredUnlockedBadges,
  getStoredSeenCertificates,
  saveStoredSeenCertificates,
  getLastUserStudyActivity,
  isStorageHydrated,
} from './storage';

export interface BadgeItem {
  id: string;
  title: string;
  description: string;
  iconName: 'Star' | 'Zap' | 'Shield' | 'Award' | 'Trophy' | 'Sparkles';
  iconColor: string;
  bgColor: string;
  badgeGradient: string;
  isAchieved: boolean;
  awardedAt?: number;
  expiresAt?: number;
  daysRemaining?: number;
}

export const BADGE_VALIDITY_DAYS = 7;
export const BADGE_VALIDITY_MS = BADGE_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

export interface StoredBadgeGrant {
  badgeId: string;
  awardedAt: number;
  expiresAt: number;
  notified: boolean;
  revokedAt?: number;
}

export function isStudentRole(user: User | null): boolean {
  if (!user) return false;
  const role = String(user.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'TEACHER') return false;
  const cleanId = String(user.idUser || '').toLowerCase();
  if (cleanId.startsWith('admin') || cleanId.startsWith('gv.')) return false;
  return role === 'STUDENT' || cleanId.startsWith('hs.');
}

export function parseStoredBadgeGrants(
  raw: any,
  cleanUserId?: string
): { grantMap: Record<string, StoredBadgeGrant>; needsMigrationSave: boolean } {
  const result: Record<string, StoredBadgeGrant> = {};
  if (!raw) return { grantMap: result, needsMigrationSave: false };
  const now = Date.now();
  let needsMigrationSave = false;

  if (Array.isArray(raw)) {
    needsMigrationSave = true;
    raw.forEach((item: any) => {
      if (typeof item === 'string') {
        result[item] = {
          badgeId: item,
          awardedAt: now,
          expiresAt: now + BADGE_VALIDITY_MS,
          notified: true,
        };
      } else if (item && typeof item === 'object' && item.badgeId) {
        const awardedAt = Number(item.awardedAt || now);
        const expiresAt = Number(item.expiresAt || (awardedAt + BADGE_VALIDITY_MS));
        result[item.badgeId] = {
          badgeId: item.badgeId,
          awardedAt,
          expiresAt,
          notified: Boolean(item.notified),
          revokedAt: item.revokedAt ? Number(item.revokedAt) : undefined,
        };
      }
    });
    if (cleanUserId) {
      try {
        saveStoredUnlockedBadges(cleanUserId, result);
      } catch {}
    }
    return { grantMap: result, needsMigrationSave: true };
  }

  if (typeof raw === 'object') {
    Object.entries(raw).forEach(([badgeId, val]: [string, any]) => {
      if (val && typeof val === 'object') {
        const awardedAt = Number(val.awardedAt || now);
        const expiresAt = Number(val.expiresAt || (awardedAt + BADGE_VALIDITY_MS));
        if (!val.awardedAt || !val.expiresAt) {
          needsMigrationSave = true;
        }
        result[badgeId] = {
          badgeId,
          awardedAt,
          expiresAt,
          notified: Boolean(val.notified),
          revokedAt: val.revokedAt ? Number(val.revokedAt) : undefined,
        };
      } else if (typeof val === 'number') {
        needsMigrationSave = true;
        result[badgeId] = {
          badgeId,
          awardedAt: val,
          expiresAt: val + BADGE_VALIDITY_MS,
          notified: true,
        };
      } else if (val === true) {
        needsMigrationSave = true;
        result[badgeId] = {
          badgeId,
          awardedAt: now,
          expiresAt: now + BADGE_VALIDITY_MS,
          notified: true,
        };
      }
    });
  }

  if (needsMigrationSave && cleanUserId) {
    try {
      saveStoredUnlockedBadges(cleanUserId, result);
    } catch {}
  }

  return { grantMap: result, needsMigrationSave };
}

export const BADGE_MASTER_LIST: Omit<BadgeItem, 'isAchieved'>[] = [
  {
    id: 'hard_working',
    title: 'Chăm chỉ',
    description: 'Hoàn thành từ 3 bài học hoặc 1 khóa học bất kỳ',
    iconName: 'Zap',
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-100/80',
    badgeGradient: 'from-amber-400 via-amber-500 to-yellow-500',
  },
  {
    id: 'algo_expert',
    title: 'Chuyên gia thuật toán',
    description: 'Đạt từ 90% điểm trở lên trong bất kỳ bài tập hoặc bài kiểm tra nào',
    iconName: 'Sparkles',
    iconColor: 'text-indigo-600',
    bgColor: 'bg-indigo-100/80',
    badgeGradient: 'from-indigo-500 via-purple-500 to-pink-600',
  },
  {
    id: 'early_bird',
    title: 'Nộp bài sớm nhất',
    description: 'Hoàn thành và đạt bài kiểm tra/bài tập ở ngay lần thử đầu tiên',
    iconName: 'Shield',
    iconColor: 'text-emerald-600',
    bgColor: 'bg-emerald-100/80',
    badgeGradient: 'from-emerald-400 via-teal-500 to-green-600',
  },
  {
    id: 'perfect_score',
    title: 'Điểm tuyệt đối',
    description: 'Đạt 100% điểm trong bài kiểm tra',
    iconName: 'Star',
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-100/80',
    badgeGradient: 'from-amber-400 via-amber-500 to-yellow-500',
  },
  {
    id: 'persistent',
    title: 'Bền bỉ',
    description: 'Học và rèn luyện liên tục trên hệ thống',
    iconName: 'Shield',
    iconColor: 'text-sky-600',
    bgColor: 'bg-sky-100/80',
    badgeGradient: 'from-sky-400 via-blue-500 to-indigo-600',
  },
  {
    id: 'scholar',
    title: 'Học bá',
    description: 'ĐTB bài kiểm tra cuối khóa ≥ 90%',
    iconName: 'Award',
    iconColor: 'text-purple-600',
    bgColor: 'bg-purple-100/80',
    badgeGradient: 'from-purple-500 via-fuchsia-500 to-pink-500',
  },
  {
    id: 'conqueror',
    title: 'Chinh phục',
    description: 'Nhận Giấy chứng nhận hoàn thành khóa học',
    iconName: 'Trophy',
    iconColor: 'text-rose-600',
    bgColor: 'bg-rose-100/80',
    badgeGradient: 'from-amber-400 via-orange-500 to-rose-600',
  },
  {
    id: 'super_student',
    title: 'Siêu học viên',
    description: 'Đăng ký tất cả khóa học & hoàn thành 70%',
    iconName: 'Sparkles',
    iconColor: 'text-fuchsia-600',
    bgColor: 'bg-fuchsia-100/80',
    badgeGradient: 'from-fuchsia-500 via-violet-600 to-purple-700',
  },
];

export function computeUserAchievements(
  currentUser: User | null,
  courses: Course[],
  userProgress: Record<string, any>,
  quizStatus: Record<string, any>,
  registeredIds: string[] = []
): {
  badges: BadgeItem[];
  userCerts: IssuedCertificate[];
  completedCoursesCount: number;
  completedLessonsCount: number;
  totalWatchedSec: number;
  avgScoreDisplay: string;
  totalRewardPoints: number;
  achievementMap?: Record<string, boolean>;
} {
  if (!currentUser) {
    return {
      badges: BADGE_MASTER_LIST.map((b) => ({ ...b, isAchieved: false })),
      userCerts: [],
      completedCoursesCount: 0,
      completedLessonsCount: 0,
      totalWatchedSec: 0,
      avgScoreDisplay: '0%',
      totalRewardPoints: 0,
      achievementMap: {},
    };
  }

  const cleanUser = String(currentUser.idUser || '').trim().toLowerCase();
  const rawUser = String(currentUser.idUser || '');

  // User certificates
  const allCerts = getStoredCertificates();
  const userCerts = allCerts.filter((c: any) => {
    const u = String(c.idUser || '').trim().toLowerCase();
    return u === cleanUser || u === rawUser.toLowerCase();
  });

  const getCourseProgressObj = (courseId: string) => {
    if (userProgress[cleanUser] && userProgress[cleanUser][courseId]) {
      return userProgress[cleanUser][courseId];
    }
    if (userProgress[rawUser] && userProgress[rawUser][courseId]) {
      return userProgress[rawUser][courseId];
    }
    if (userProgress[courseId]) {
      return userProgress[courseId];
    }
    return {};
  };

  const getCourseQuizObj = (courseId: string) => {
    if (quizStatus[cleanUser] && quizStatus[cleanUser][courseId]) {
      return quizStatus[cleanUser][courseId];
    }
    if (quizStatus[rawUser] && quizStatus[rawUser][courseId]) {
      return quizStatus[rawUser][courseId];
    }
    if (quizStatus[courseId]) {
      return quizStatus[courseId];
    }
    return null;
  };

  const getCourseCompletionPct = (c: Course): number => {
    const prog = getCourseProgressObj(c.courseId);
    const qStatus = getCourseQuizObj(c.courseId);
    const hasCert = userCerts.some((cert) => cert.courseId === c.courseId);

    if (hasCert || qStatus?.passed || (qStatus?.lastScore && qStatus.lastScore >= 80)) {
      return 1.0;
    }

    const lessons = c.lessons || [];
    if (lessons.length === 0) return 0;

    let doneCount = 0;
    lessons.forEach((l, idx) => {
      const pKey = `LESSON_${idx}`;
      const lProg = prog[pKey];
      const targetSec = (l as any).durationSec || 60;
      if (lProg && (lProg.isCompleted || (lProg.watchedSec && lProg.watchedSec >= targetSec))) {
        doneCount += 1;
      }
    });

    return doneCount / lessons.length;
  };

  let totalWatchedSec = 0;
  let completedLessonsCount = 0;
  let completedCoursesCount = 0;

  const finalQuizScores: number[] = [];
  const allScoresList: number[] = [];

  courses.forEach((c) => {
    const prog = getCourseProgressObj(c.courseId);
    const qStatus = getCourseQuizObj(c.courseId);
    const completionPct = getCourseCompletionPct(c);

    if (completionPct >= 0.99) {
      completedCoursesCount += 1;
    }

    if (c.lessons && Array.isArray(c.lessons)) {
      c.lessons.forEach((l, idx) => {
        const pKey = `LESSON_${idx}`;
        const lessonProg = prog[pKey];
        if (lessonProg) {
          const wSec = Number(lessonProg.watchedSec || 0);
          totalWatchedSec += wSec;
          const targetSec = (l as any).durationSec || 60;
          if (lessonProg.isCompleted || wSec >= targetSec) {
            completedLessonsCount += 1;
          }
        }

        const exKey = `LESSON_EXERCISE_${idx}`;
        const exProg = prog[exKey];
        if (exProg) {
          if (exProg.durationSec) totalWatchedSec += Number(exProg.durationSec);
          const sc = exProg.lastScore ?? exProg.score;
          if (sc !== undefined && sc !== null) {
            allScoresList.push(Number(sc));
          }
        }
      });
    }

    if (qStatus) {
      if (qStatus.durationSec) {
        totalWatchedSec += Number(qStatus.durationSec);
      }
      const qScore = qStatus.lastScore ?? qStatus.score ?? qStatus.bestScore;
      if (qScore !== undefined && qScore !== null) {
        finalQuizScores.push(Number(qScore));
        allScoresList.push(Number(qScore));
      }
    }
  });

  let avgScoreDisplay = '0%';
  if (allScoresList.length > 0) {
    const avg = Math.round(allScoresList.reduce((a, b) => a + b, 0) / allScoresList.length);
    avgScoreDisplay = `${avg}%`;
  } else if (completedLessonsCount > 0) {
    avgScoreDisplay = '100%';
  }

  // --- Badge 1: Chăm chỉ ---
  const isHardWorkingAchieved = completedLessonsCount >= 3 || completedCoursesCount >= 1;

  // --- Badge 2: Chuyên gia thuật toán ---
  const isAlgoExpertAchieved = allScoresList.some((sc) => sc >= 90) || finalQuizScores.some((sc) => sc >= 90);

  // --- Badge 3: Nộp bài sớm nhất ---
  const isEarlyBirdAchieved =
    courses.some((c) => {
      const q = getCourseQuizObj(c.courseId);
      return q && (q.attempts === 1 || q.firstScore !== undefined) && (Number(q.lastScore || q.firstScore) >= 70);
    }) || completedLessonsCount >= 1;

  // --- Badge 4: Điểm tuyệt đối ---
  const isPerfectScoreAchieved = courses.some((c) => {
    const q = getCourseQuizObj(c.courseId);
    if (!q) return false;
    if (q.firstScore !== undefined && q.firstScore !== null) {
      return Number(q.firstScore) >= 100;
    }
    const attempts = q.attempts || 1;
    const score = Number(q.lastScore ?? q.score ?? 0);
    return attempts === 1 && score >= 100;
  });

  // --- Badge 5: Bền bỉ ---
  const dailyLog = getStoredDailyStudyLog();
  const userDailyMap = dailyLog[cleanUser] || dailyLog[rawUser] || {};
  const dateKeys = Object.keys(userDailyMap).sort();

  let maxStreak = 0;
  let currentStreak = 0;
  let consecutiveMisses = 0;

  dateKeys.forEach((dateKey) => {
    const sec = userDailyMap[dateKey] || 0;
    if (sec >= 1800) { // 30 minutes active
      currentStreak += 1;
      consecutiveMisses = 0;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
      consecutiveMisses += 1;
    }
  });

  const isPersistentAchieved =
    (maxStreak >= 3 || totalWatchedSec >= 10800 || completedLessonsCount >= 5) && consecutiveMisses < 2;

  // --- Badge 6: Học bá ---
  const finalQuizCount = finalQuizScores.length;
  const avgFinalQuizScore =
    finalQuizCount > 0
      ? Math.round(finalQuizScores.reduce((a, b) => a + b, 0) / finalQuizCount)
      : 0;
  const isScholarAchieved = (finalQuizCount >= 1 && avgFinalQuizScore >= 90) || allScoresList.some(s => s >= 95);

  // --- Badge 7: Chinh phục ---
  const isConquerorAchieved = userCerts.length >= 1;

  // --- Badge 8: Siêu học viên ---
  const isEnrolledInAll =
    courses.length > 0 &&
    courses.every(
      (c) =>
        registeredIds.includes(c.courseId) ||
        Object.keys(getCourseProgressObj(c.courseId)).length > 0
    );

  const avgCourseCompletion =
    courses.length > 0
      ? courses.reduce((acc, c) => acc + getCourseCompletionPct(c), 0) / courses.length
      : 0;

  const isSuperStudentAchieved = (isEnrolledInAll && avgCourseCompletion >= 0.5) || completedCoursesCount >= 2;

  const isStudent = isStudentRole(currentUser);
  const now = Date.now();
  const rawStoredGrants = isStudent ? getStoredUnlockedBadges(cleanUser) : {};
  const { grantMap } = parseStoredBadgeGrants(rawStoredGrants, cleanUser);

  const achievementMap: Record<string, boolean> = {
    hard_working: isHardWorkingAchieved,
    algo_expert: isAlgoExpertAchieved,
    early_bird: isEarlyBirdAchieved,
    perfect_score: isPerfectScoreAchieved,
    persistent: isPersistentAchieved,
    scholar: isScholarAchieved,
    conqueror: isConquerorAchieved,
    super_student: isSuperStudentAchieved,
  };

  const badges: BadgeItem[] = BADGE_MASTER_LIST.map((b) => {
    // 1. Huy hiệu chỉ cấp cho tài khoản học viên không cấp cho admin và giáo viên
    if (!isStudent) {
      return {
        ...b,
        isAchieved: false,
      };
    }

    const grant = grantMap[b.id];
    const isCurrentlyActive = Boolean(
      grant && !grant.revokedAt && now < grant.expiresAt
    );

    // Huy hiệu đang trong chu kỳ 7 ngày: ĐÃ ĐẠT, hiển thị số ngày còn lại (ví dụ cấp ngày 16/9 đến ngày 18/9 còn 5 ngày)
    if (isCurrentlyActive && grant) {
      const msLeft = grant.expiresAt - now;
      const daysRemaining = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
      return {
        ...b,
        isAchieved: true,
        awardedAt: grant.awardedAt,
        expiresAt: grant.expiresAt,
        daysRemaining,
      };
    }

    // Huy hiệu đã hết hạn sau 7 ngày: hiển thị HẾT HẠN (HỌC ĐỂ CẤP LẠI)
    if (grant && (now >= grant.expiresAt || grant.revokedAt)) {
      return {
        ...b,
        isAchieved: false,
        awardedAt: grant.awardedAt,
        expiresAt: grant.expiresAt,
        daysRemaining: 0,
      };
    }

    // Chưa từng được cấp:
    const isCriteriaMet = Boolean(achievementMap[b.id]);
    return {
      ...b,
      isAchieved: isCriteriaMet,
      daysRemaining: isCriteriaMet ? BADGE_VALIDITY_DAYS : undefined,
    };
  });

  const achievedBadgesCount = badges.filter((b) => b.isAchieved).length;

  // Calculate Reward Points (Điểm thưởng):
  // 15 pts per lesson + 50 pts per completed course + 100 pts per unlocked badge
  const totalRewardPoints =
    completedLessonsCount * 15 + completedCoursesCount * 50 + achievedBadgesCount * 100;

  return {
    badges,
    userCerts,
    completedCoursesCount,
    completedLessonsCount,
    totalWatchedSec,
    avgScoreDisplay,
    totalRewardPoints,
    achievementMap,
  };
}

/**
 * Checks for new achievements or certificates that haven't been acknowledged yet.
 * Automatically marks them as seen and returns the newly unlocked items for popup display.
 * Rules:
 * - Badges are awarded ONLY to students (never admins or teachers).
 * - Badges are valid for 7 days, after which they are auto-revoked until the student studies again.
 * - Once awarded and active, a badge is NOT notified again on subsequent triggers.
 */
export function checkNewAchievementsAndCertificates(
  currentUser: User | null,
  courses: Course[],
  userProgress: Record<string, any>,
  quizStatus: Record<string, any>,
  registeredIds: string[] = []
): {
  newBadges: BadgeItem[];
  newCertificates: IssuedCertificate[];
} {
  if (!currentUser || !isStorageHydrated()) {
    return { newBadges: [], newCertificates: [] };
  }

  const cleanUser = String(currentUser.idUser || '').trim().toLowerCase();
  const storedSeenCerts = getStoredSeenCertificates(cleanUser);

  // Check certificates
  const allCerts = getStoredCertificates();
  const userCerts = allCerts.filter((c: any) => {
    const u = String(c.idUser || '').trim().toLowerCase();
    return u === cleanUser;
  });

  const newCertificates = userCerts.filter(
    (c) => c.certificateId && !storedSeenCerts.includes(c.certificateId)
  );

  if (newCertificates.length > 0) {
    const updatedSeenCerts = Array.from(
      new Set([...storedSeenCerts, ...userCerts.map((c) => c.certificateId)])
    );
    saveStoredSeenCertificates(cleanUser, updatedSeenCerts);

    setTimeout(() => {
      newCertificates.forEach((cert) => {
        addNotification({
          recipientId: currentUser.idUser,
          type: 'CERTIFICATE_ISSUED',
          title: `Cấp Giấy chứng nhận: ${cert.courseTitle}`,
          message: `Chúc mừng bạn đã hoàn thành xuất sắc khóa học "${cert.courseTitle}". Giấy chứng nhận điện tử (Mã: ${cert.certificateId}) đã sẵn sàng để tải về!`,
          linkCourseId: cert.courseId,
          linkAction: 'open_cert',
          createdAt: new Date().toISOString(),
        });
      });
    }, 0);
  }

  // 1. Huy hiệu CHỈ cấp cho tài khoản học viên, KHÔNG cấp cho admin và giáo viên!
  if (!isStudentRole(currentUser)) {
    return { newBadges: [], newCertificates };
  }

  const { achievementMap } = computeUserAchievements(
    currentUser,
    courses,
    userProgress,
    quizStatus,
    registeredIds
  );

  const rawStoredGrants = getStoredUnlockedBadges(cleanUser);
  const { grantMap, needsMigrationSave } = parseStoredBadgeGrants(rawStoredGrants, cleanUser);
  const now = Date.now();
  let hasChanges = needsMigrationSave;
  const newBadges: BadgeItem[] = [];

  // 2. Thu hồi các huy hiệu đã hết hạn 7 ngày
  Object.entries(grantMap).forEach(([badgeId, grant]) => {
    if (!grant.revokedAt && now >= grant.expiresAt) {
      grant.revokedAt = now;
      hasChanges = true;
      console.log(`[LMS Badges] Đã thu hồi huy hiệu hết hạn 7 ngày: ${badgeId} của học viên ${cleanUser}`);
      const bDef = BADGE_MASTER_LIST.find((b) => b.id === badgeId);
      if (bDef) {
        addNotification({
          recipientId: currentUser.idUser,
          type: 'SYSTEM_NOTICE',
          title: `Huy hiệu "${bDef.title}" đã hết hạn 7 ngày`,
          message: `Huy hiệu "${bDef.title}" đã kết thúc chu kỳ 7 ngày và được thu hồi. Hãy tiếp tục tham gia học tập để được cấp lại huy hiệu nhé!`,
          linkAction: 'open_badges',
          createdAt: new Date().toISOString(),
        });
      }
    }
  });

  // 3. Xét cấp huy hiệu cho học viên:
  // QUY TẮC CỐT LÕI THEO YÊU CẦU:
  // - Huy hiệu chỉ cấp 1 lần trong chu kỳ 7 ngày.
  // - Nếu trong thời hạn 7 ngày mà tiếp tục đạt huy hiệu đó (VD: cấp ngày 16/9 đến ngày 18/9 đạt tiếp):
  //   -> KHÔNG CẤP LẠI!
  //   -> Hạn huy hiệu giữ nguyên còn 5 ngày (tính từ 16/9 đến 23/9), không gia hạn!
  //   -> Không thông báo lại, không hiện popup chúc mừng lại!
  // - ĐẾN KHI HẾT HẠN 7 NGÀY mới tiếp tục cấp lại:
  //   -> Chỉ khi chu kỳ 7 ngày kết thúc và học viên có tham gia học tập tiếp theo mới cấp chu kỳ 7 ngày mới!
  BADGE_MASTER_LIST.forEach((bDef) => {
    const isCriteriaMet = Boolean(achievementMap && achievementMap[bDef.id]);
    if (!isCriteriaMet) return;

    const currentGrant = grantMap[bDef.id];
    const isCurrentlyActive = Boolean(
      currentGrant && !currentGrant.revokedAt && now < currentGrant.expiresAt
    );

    // TRƯỜNG HỢP 1: Đang trong thời hạn 7 ngày -> TUYỆT ĐỐI KHÔNG CẤP LẠI, KHÔNG ĐỔI HẠN!
    // Giữ nguyên hạn ban đầu (ví dụ: cấp ngày 16/9 thì ngày 18/9 hạn còn 5 ngày).
    if (isCurrentlyActive) {
      return;
    }

    // TRƯỜNG HỢP 2: Đã hết hạn 7 ngày (now >= currentGrant.expiresAt hoặc đã thu hồi)
    // -> Chỉ cấp lại khi học viên có hoạt động học tập mới sau thời điểm hết hạn
    if (currentGrant && (now >= currentGrant.expiresAt || currentGrant.revokedAt)) {
      const lastStudy = getLastUserStudyActivity(cleanUser);
      // Nếu không có hoạt động học tập mới SAU thời điểm hết hạn -> TUYỆT ĐỐI KHÔNG CẤP LẠI!
      // Giữ nguyên trạng thái hết hạn cho đến khi học viên học bài mới hoặc làm bài tập mới.
      if (!lastStudy || lastStudy <= currentGrant.expiresAt) {
        return;
      }
    }

    // TRƯỜNG HỢP 3: Cấp mới (lần đầu) hoặc cấp lại chu kỳ 7 ngày mới sau khi đã hết hạn và học tiếp:
    const newGrant: StoredBadgeGrant = {
      badgeId: bDef.id,
      awardedAt: now,
      expiresAt: now + BADGE_VALIDITY_MS,
      notified: true,
    };
    grantMap[bDef.id] = newGrant;
    hasChanges = true;

    newBadges.push({
      ...bDef,
      isAchieved: true,
      awardedAt: newGrant.awardedAt,
      expiresAt: newGrant.expiresAt,
      daysRemaining: BADGE_VALIDITY_DAYS,
    });

    setTimeout(() => {
      addNotification({
        recipientId: currentUser.idUser,
        type: 'BADGE_EARNED',
        title: `Chúc mừng! Bạn nhận được huy hiệu: ${bDef.title}`,
        message: `Bạn vừa mở khóa thành công huy hiệu "${bDef.title}" - ${bDef.description}. Huy hiệu có giá trị trong 7 ngày. Hãy tích cực học tập để duy trì thành tích nhé!`,
        linkAction: 'open_badges',
        createdAt: new Date().toISOString(),
      });
    }, 0);
  });

  if (hasChanges) {
    saveStoredUnlockedBadges(cleanUser, grantMap);
  }

  return { newBadges, newCertificates };
}
