import { Course, User, PendingRegistration, ResetPasswordRequest, QaQuestion, QaAnswer, LearningGame } from '../types';

/**
 * SUPABASE-ONLY CLIENT DATA ACCESS
 *
 * There is intentionally NO localStorage/sessionStorage/IndexedDB fallback here.
 * The module cache is only a transient UI mirror in browser memory; persistence
 * and the source of truth are always Supabase through the server API.
 */
export interface AccountItem {
  idUser: string;
  hoTen: string;
  chiDoan: string;
  defaultPass: string;
  customPass?: string;
  role: 'TEACHER' | 'STUDENT' | 'ADMIN';
  avatar?: string;
  avatarUrl?: string;
}

export interface AdminProfile extends AccountItem { role: 'ADMIN'; }

interface Cache {
  accounts: { teachers: AccountItem[]; students: AccountItem[] };
  admin: AdminProfile;
  passwords: Record<string, string>;
  pendingRegistrations: PendingRegistration[];
  resetPasswordRequests: ResetPasswordRequest[];
  courses: Course[];
  enrollments: Record<string, string[]>;
  progress: Record<string, Record<string, any>>;
  quizStatus: Record<string, Record<string, any>>;
  certificates: any[];
  dailyStudyLog: Record<string, Record<string, number>>;
  qaQuestions: QaQuestion[];
  notifications: any[];
  dismissedNotifications: Record<string, string[]>;
  schoolNotices: any[];
  learningGames: LearningGame[];
  unlockedBadges: Record<string, any>;
  seenCertificates: Record<string, string[]>;
  studyActivityTimestamps: Record<string, number>;
}

const cache: Cache = {
  accounts: { teachers: [], students: [] },
  admin: { idUser: 'admin.c3nguyenquangdieu', hoTen: 'Administrator', chiDoan: 'BGH', defaultPass: '', customPass: '', role: 'ADMIN', avatar: '', avatarUrl: '' },
  passwords: {}, pendingRegistrations: [], resetPasswordRequests: [], courses: [],
  enrollments: {}, progress: {}, quizStatus: {}, certificates: [], dailyStudyLog: {},
  qaQuestions: [], notifications: [], dismissedNotifications: {}, schoolNotices: [], learningGames: [],
  unlockedBadges: {}, seenCertificates: {}, studyActivityTimestamps: {},
};

// Clean up any old localStorage artifacts completely as requested: Supabase-only persistence
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('nq_'));
    keys.forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });
  }
} catch {}

const notify = (name: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(name)); };

async function persist(key: string, data: any): Promise<void> {
  const res = await fetch(`/api/lms-kv/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    let msg = `Supabase write failed (${res.status})`;
    try { const j = await res.json(); msg = j.message || msg; } catch {}
    throw new Error(msg);
  }
}

function persistAsync(key: string, data: any) {
  persist(key, data).catch((err) => console.error(`[Supabase-only] ${key}:`, err));
}

const DEMO_ACCOUNT_IDS = new Set(['gv.demo', 'gv.mai', 'hs.demo', 'hs.nam']);

let _storageHydrated = false;
const hydrationListeners: Array<() => void> = [];

export function isStorageHydrated(): boolean {
  return _storageHydrated;
}

export function onStorageHydrated(cb: () => void): () => void {
  if (_storageHydrated) {
    cb();
    return () => {};
  }
  hydrationListeners.push(cb);
  return () => {
    const idx = hydrationListeners.indexOf(cb);
    if (idx >= 0) hydrationListeners.splice(idx, 1);
  };
}

export function hydrateStorageFromServer(payload: any): void {
  if (!payload) return;
  if (payload.accounts) cache.accounts = {
    teachers: Array.isArray(payload.accounts.teachers)
      ? payload.accounts.teachers
          .filter((x: any) => x && !DEMO_ACCOUNT_IDS.has(String(x.idUser || '').toLowerCase()))
          .map((x: any) => ({ ...x, role: 'TEACHER' }))
      : [],
    students: Array.isArray(payload.accounts.students)
      ? payload.accounts.students
          .filter((x: any) => x && !DEMO_ACCOUNT_IDS.has(String(x.idUser || '').toLowerCase()))
          .map((x: any) => ({ ...x, role: 'STUDENT' }))
      : [],
  };
  if (payload.admin) cache.admin = { ...cache.admin, ...payload.admin, role: 'ADMIN' };
  if (Array.isArray(payload.pendingRegistrations)) cache.pendingRegistrations = payload.pendingRegistrations;
  if (Array.isArray(payload.resetPasswordRequests)) cache.resetPasswordRequests = payload.resetPasswordRequests;
  if (Array.isArray(payload.courses)) {
    cache.courses = payload.courses.filter((c: any) => c && c.courseId && c.courseId !== 'course_demo_01');
  }
  if (Array.isArray(payload.enrollments)) {
    const e: Record<string,string[]> = {};
    payload.enrollments.forEach((x:any)=>{ const k=String(x.idUser||'').trim().toLowerCase(); if(k){(e[k] ||= []).push(String(x.courseId));} });
    cache.enrollments = e;
  }
  if (Array.isArray(payload.progress)) {
    const p: Record<string, Record<string, any>> = {};
    payload.progress.forEach((x: any) => {
      const u = String(x.idUser || '').trim().toLowerCase();
      const c = String(x.courseId || '');
      if (!u || !c) return;
      if (!p[u]) p[u] = {};
      if (!p[u][c]) p[u][c] = {};
      p[u][c][String(x.lessonKey)] = x.progressData;

      if (x.lessonKey === 'QUIZ_SUBMITTED' || x.lessonKey === 'QUIZ') {
        let qData = x.progressData;
        if (typeof qData === 'string') {
          try { qData = JSON.parse(qData); } catch {}
        }
        if (!cache.quizStatus[u]) cache.quizStatus[u] = {};
        cache.quizStatus[u][c] = qData;
      }

      // Reconcile: If student has progress in course -> must be enrolled
      if (!cache.enrollments[u]) cache.enrollments[u] = [];
      if (!cache.enrollments[u].includes(c)) {
        cache.enrollments[u].push(c);
      }
    });
    cache.progress = p;
  }
  if (payload.quizStatus && typeof payload.quizStatus === 'object') {
    cache.quizStatus = { ...cache.quizStatus, ...payload.quizStatus };
  }
  if (Array.isArray(payload.certificates)) {
    cache.certificates = payload.certificates;
    // Reconcile: If student has certificate -> must be enrolled
    payload.certificates.forEach((cert: any) => {
      const u = String(cert.idUser || '').trim().toLowerCase();
      const c = String(cert.courseId || '');
      if (u && c) {
        if (!cache.enrollments[u]) cache.enrollments[u] = [];
        if (!cache.enrollments[u].includes(c)) {
          cache.enrollments[u].push(c);
        }
      }
    });
  }
  if (Array.isArray(payload.qaQuestions)) {
    cache.qaQuestions = payload.qaQuestions.filter(
      (q: any) => q && !String(q.id || '').startsWith('q_sample_') && q.authorId !== 'student_sample_1'
    );
  }
  if (Array.isArray(payload.notifications)) cache.notifications = payload.notifications;
  if (Array.isArray(payload.schoolNotices)) cache.schoolNotices = payload.schoolNotices;
  if (Array.isArray(payload.learningGames)) cache.learningGames = payload.learningGames;
  if (payload.dailyStudyLog && typeof payload.dailyStudyLog === 'object') {
    cache.dailyStudyLog = payload.dailyStudyLog.data || payload.dailyStudyLog.payload || payload.dailyStudyLog;
  }
  if (payload.unlockedBadges && typeof payload.unlockedBadges === 'object') {
    cache.unlockedBadges = payload.unlockedBadges.data || payload.unlockedBadges.payload || payload.unlockedBadges;
  }
  if (payload.seenCertificates && typeof payload.seenCertificates === 'object') {
    cache.seenCertificates = payload.seenCertificates.data || payload.seenCertificates.payload || payload.seenCertificates;
  }
  if (payload.studyActivityTimestamps && typeof payload.studyActivityTimestamps === 'object') {
    cache.studyActivityTimestamps = payload.studyActivityTimestamps.data || payload.studyActivityTimestamps.payload || payload.studyActivityTimestamps;
  }

  _storageHydrated = true;
  hydrationListeners.forEach((fn) => {
    try { fn(); } catch {}
  });
  hydrationListeners.length = 0;
  notify('storage-hydrated');
}

export function getStoredResetPasswordRequests(){ return cache.resetPasswordRequests; }
export function saveStoredResetPasswordRequest(req: ResetPasswordRequest){ cache.resetPasswordRequests=[req,...cache.resetPasswordRequests.filter(x=>x.id!==req.id)]; persistAsync('resetPasswordRequests',{items:cache.resetPasswordRequests}); notify('reset-requests-updated'); }
export function saveAllStoredResetPasswordRequests(list: ResetPasswordRequest[]){ cache.resetPasswordRequests=list; persistAsync('resetPasswordRequests',{items:list}); notify('reset-requests-updated'); }

export function getStoredPendingRegistrations(){ return cache.pendingRegistrations; }
export function saveStoredPendingRegistration(reg: PendingRegistration){ cache.pendingRegistrations=[reg,...cache.pendingRegistrations.filter(x=>x.id!==reg.id)]; persistAsync('pendingRegistrations',{items:cache.pendingRegistrations}); notify('pending-registrations-updated'); }
export function saveAllStoredPendingRegistrations(list: PendingRegistration[]){ cache.pendingRegistrations=list; persistAsync('pendingRegistrations',{items:list}); notify('pending-registrations-updated'); }

export function getStoredAccounts(){ return cache.accounts; }
export function saveStoredAccounts(teachers: AccountItem[], students: AccountItem[]){
  const cleanT = (teachers || []).filter((t: any) => t && !DEMO_ACCOUNT_IDS.has(String(t.idUser || '').toLowerCase()));
  const cleanS = (students || []).filter((s: any) => s && !DEMO_ACCOUNT_IDS.has(String(s.idUser || '').toLowerCase()));
  cache.accounts={teachers: cleanT, students: cleanS};
  persistAsync('accounts',{teachers: cleanT, students: cleanS});
  notify('accounts-updated');
}
export function getStoredAdminProfile(){ return cache.admin; }
export function saveStoredAdminProfile(profile: Partial<AdminProfile>){ cache.admin={...cache.admin,...profile,role:'ADMIN'}; persistAsync('admin_profile',cache.admin); notify('admin-profile-updated'); notify('accounts-updated'); return cache.admin; }
export function getStoredPasswords(){ return cache.passwords; }
export function saveStoredPassword(idUser:string,newPass:string){ cache.passwords[String(idUser).toLowerCase()]=newPass; persistAsync('passwords',cache.passwords); }
export function resetStoredPassword(idUser:string){ delete cache.passwords[String(idUser).toLowerCase()]; persistAsync('passwords',cache.passwords); }

export function getStoredCourses(){ return cache.courses; }
export function saveStoredCourses(courses:Course[]){
  const clean = (courses || []).filter((c: any) => c && c.courseId && c.courseId !== 'course_demo_01');
  cache.courses=clean;
  persistAsync('courses',{items:clean});
  notify('courses-updated');
}

export function getStoredEnrollments(){ return cache.enrollments; }
export function saveStoredEnrollment(userId:string,courseId:string){
  const k=String(userId).trim().toLowerCase();
  const arr=cache.enrollments[k]||[];
  if(!arr.includes(courseId)) cache.enrollments={...cache.enrollments,[k]:[...arr,courseId]};
  persistAsync('enrollments',{payload:Object.entries(cache.enrollments).flatMap(([idUser,ids])=>ids.map(courseId=>({idUser,courseId,status:'DANG_HOC'})))});
}

export function getUserLocalEnrollments(userId: string): string[] {
  const k = String(userId).trim().toLowerCase();
  return cache.enrollments[k] || [];
}

export function getStoredProgress(){ return cache.progress; }
export function clearAllStoredStudyProgress(){
  cache.progress = {};
  cache.quizStatus = {};
  cache.certificates = [];
  cache.enrollments = {};
  cache.dailyStudyLog = {};
  cache.unlockedBadges = {};
  cache.seenCertificates = {};
  notify('progress-updated');
  notify('certificates-updated');
  notify('enrollments-updated');
}

export function recordUserStudyActivity(userId: string, timestamp = Date.now()): void {
  if (!userId) return;
  const u = String(userId).trim().toLowerCase();
  cache.studyActivityTimestamps = cache.studyActivityTimestamps || {};
  cache.studyActivityTimestamps[u] = Math.max(cache.studyActivityTimestamps[u] || 0, timestamp);
  persistAsync('study_activity_timestamps', cache.studyActivityTimestamps);
}

export function getLastUserStudyActivity(userId: string): number {
  if (!userId) return 0;
  const u = String(userId).trim().toLowerCase();
  return cache.studyActivityTimestamps?.[u] || 0;
}

export function saveStoredProgress(userId:string,courseId:string,lessonIndex:string|number,progressData:any){
  recordUserStudyActivity(userId);
  const u=String(userId).trim().toLowerCase();
  cache.progress={...cache.progress,[u]:{...(cache.progress[u]||{}),[courseId]:{...((cache.progress[u]||{})[courseId]||{}),[String(lessonIndex)]:progressData}}};
  persistAsync('progress',{payload:Object.entries(cache.progress).flatMap(([idUser,courses])=>Object.entries(courses as any).flatMap(([courseId,lessons]:any)=>Object.entries(lessons||{}).map(([lessonKey,progressData])=>({idUser,courseId,lessonKey,progressData,updatedAt:new Date().toISOString()}))))});
}

export function getUserLocalProgress(userId: string): Record<string, any> {
  const u = String(userId).trim().toLowerCase();
  return cache.progress[u] || {};
}

export function getStoredQuizStatus(){ return cache.quizStatus; }
export function formatDurationSec(sec?:number){ const s=Math.max(0,Number(sec)||0); return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }

export function saveStoredQuizResult(userId:string,courseId:string,result:any){
  recordUserStudyActivity(userId);
  const u=String(userId).trim().toLowerCase();
  cache.quizStatus={...cache.quizStatus,[u]:{...(cache.quizStatus[u]||{}),[courseId]:result}};
  persistAsync('quiz_status',cache.quizStatus);
}

export function deleteStoredQuizProgress(userId: string, courseId: string): void {
  const u = String(userId || '').trim().toLowerCase();
  const c = String(courseId || '').trim();
  if (cache.progress && cache.progress[u]) {
    const courseKeys = [c, c.toLowerCase(), c.toUpperCase()];
    for (const ck of courseKeys) {
      if (cache.progress[u][ck]) {
        delete cache.progress[u][ck]['QUIZ_SUBMITTED'];
        delete cache.progress[u][ck]['QUIZ'];
        delete cache.progress[u][ck]['quiz_submitted'];
        delete cache.progress[u][ck]['quiz'];
      }
    }
    persistAsync('progress', {
      payload: Object.entries(cache.progress).flatMap(([idUser, courses]) =>
        Object.entries(courses as any).flatMap(([courseIdKey, lessons]: any) =>
          Object.entries(lessons || {}).map(([lessonKey, progressData]) => ({
            idUser,
            courseId: courseIdKey,
            lessonKey,
            progressData,
            updatedAt: new Date().toISOString(),
          }))
        )
      ),
    });
    notify('progress-updated');
  }
}

export function deleteStoredQuizStatus(userId: string, courseId: string) {
  const u = String(userId).trim().toLowerCase();
  const c = String(courseId).trim();
  if (cache.quizStatus[u]) {
    delete cache.quizStatus[u][c];
    delete cache.quizStatus[u][c.toLowerCase()];
    delete cache.quizStatus[u][c.toUpperCase()];
    persistAsync('quiz_status', cache.quizStatus);
    notify('quiz-status-updated');
  }
  deleteStoredQuizProgress(userId, courseId);
}

export function deleteStoredCertificateForUserCourse(userId: string, courseId: string): void {
  const cleanU = String(userId || '').trim().toLowerCase();
  const cleanC = String(courseId || '').trim().toLowerCase();
  cache.certificates = (cache.certificates || []).filter(
    (c: any) =>
      !(
        String(c?.idUser || '').trim().toLowerCase() === cleanU &&
        String(c?.courseId || '').trim().toLowerCase() === cleanC
      )
  );
  persistAsync('certificates', { payload: cache.certificates });
  notify('certificates-updated');
}

export function getUserLocalQuizStatus(userId: string): Record<string, any> {
  const u = String(userId).trim().toLowerCase();
  return cache.quizStatus[u] || {};
}

export function getStoredCertificates(){ return cache.certificates; }
export function saveStoredCertificate(certObj:any){
  cache.certificates=[certObj,...cache.certificates.filter(x=>x.certificateId!==certObj.certificateId)];
  persistAsync('certificates',{payload:cache.certificates});
  notify('certificates-updated');
}
export function deleteStoredCertificate(certificateId: string): void {
  cache.certificates = (cache.certificates || []).filter(
    (c: any) => String(c?.certificateId) !== String(certificateId)
  );
  persistAsync('certificates', { payload: cache.certificates });
  notify('certificates-updated');
}
export function deleteStoredCertificatesByCourse(courseId: string): void {
  cache.certificates = (cache.certificates || []).filter(
    (c: any) => String(c?.courseId) !== String(courseId)
  );
  persistAsync('certificates', { payload: cache.certificates });
  notify('certificates-updated');
}

// Xóa triệt để toàn bộ tiến độ học tập, điểm số trắc nghiệm, đăng ký và chứng nhận khi khóa học bị xóa
export function deleteStoredCourseDataCascade(courseId: string): void {
  const c = String(courseId || '').trim();
  const cLower = c.toLowerCase();

  // 1. Xóa certificates
  cache.certificates = (cache.certificates || []).filter(
    (cert: any) => String(cert?.courseId || '').trim().toLowerCase() !== cLower
  );
  persistAsync('certificates', { payload: cache.certificates });
  notify('certificates-updated');

  // 2. Xóa tiến độ học tập (cache.progress)
  if (cache.progress && typeof cache.progress === 'object') {
    let progressModified = false;
    Object.keys(cache.progress).forEach((u) => {
      if (cache.progress[u] && typeof cache.progress[u] === 'object') {
        Object.keys(cache.progress[u]).forEach((courseKey) => {
          if (courseKey.trim().toLowerCase() === cLower) {
            delete cache.progress[u][courseKey];
            progressModified = true;
          }
        });
      }
    });
    if (progressModified) {
      persistAsync('progress', {
        payload: Object.entries(cache.progress).flatMap(([idUser, courses]) =>
          Object.entries(courses as any).flatMap(([cId, lessons]: any) =>
            Object.entries(lessons || {}).map(([lessonKey, progressData]) => ({
              idUser,
              courseId: cId,
              lessonKey,
              progressData,
              updatedAt: new Date().toISOString(),
            }))
          )
        ),
      });
      notify('progress-updated');
    }
  }

  // 3. Xóa điểm số và lịch sử bài kiểm tra / trắc nghiệm (cache.quizStatus)
  if (cache.quizStatus && typeof cache.quizStatus === 'object') {
    let quizModified = false;
    Object.keys(cache.quizStatus).forEach((u) => {
      if (cache.quizStatus[u] && typeof cache.quizStatus[u] === 'object') {
        Object.keys(cache.quizStatus[u]).forEach((courseKey) => {
          if (courseKey.trim().toLowerCase() === cLower) {
            delete cache.quizStatus[u][courseKey];
            quizModified = true;
          }
        });
      }
    });
    if (quizModified) {
      persistAsync('quiz_status', cache.quizStatus);
      notify('quiz-status-updated');
    }
  }

  // 4. Xóa danh sách ghi danh (cache.enrollments)
  if (cache.enrollments && typeof cache.enrollments === 'object') {
    let enrollModified = false;
    Object.keys(cache.enrollments).forEach((u) => {
      if (Array.isArray(cache.enrollments[u])) {
        const origLen = cache.enrollments[u].length;
        cache.enrollments[u] = cache.enrollments[u].filter(
          (enrolledCourseId) => String(enrolledCourseId || '').trim().toLowerCase() !== cLower
        );
        if (cache.enrollments[u].length !== origLen) enrollModified = true;
      }
    });
    if (enrollModified) {
      persistAsync('enrollments', {
        payload: Object.entries(cache.enrollments).flatMap(([idUser, ids]) =>
          ids.map((cId) => ({ idUser, courseId: cId, status: 'DANG_HOC' }))
        ),
      });
      notify('enrollments-updated');
    }
  }

  // 5. Xóa câu hỏi Q&A của khóa học
  if (Array.isArray(cache.qaQuestions)) {
    cache.qaQuestions = cache.qaQuestions.filter(
      (q: any) => String(q?.courseId || '').trim().toLowerCase() !== cLower
    );
    persistAsync('qa_questions', { items: cache.qaQuestions });
    notify('qa-questions-updated');
  }
}
export function getStoredDailyStudyLog(){ return cache.dailyStudyLog; }
export function saveStoredDailyStudyTime(userId:string,secondsToAdd:number){
  recordUserStudyActivity(userId);
  const u=String(userId).trim().toLowerCase();
  const day=new Date().toISOString().slice(0,10);
  cache.dailyStudyLog={...cache.dailyStudyLog,[u]:{...(cache.dailyStudyLog[u]||{}),[day]:Number(cache.dailyStudyLog[u]?.[day]||0)+Number(secondsToAdd||0)}};
  persistAsync('daily_study_log',{payload:cache.dailyStudyLog});
}

export async function flushAllStoredDataToSupabase(): Promise<boolean> {
  try {
    const payload: any = {
      enrollments: Object.entries(cache.enrollments).flatMap(([idUser, ids]) =>
        ids.map((courseId) => ({ idUser, courseId, status: 'DANG_HOC' }))
      ),
      progress: Object.entries(cache.progress).flatMap(([idUser, courses]) =>
        Object.entries(courses as any).flatMap(([courseId, lessons]: any) =>
          Object.entries(lessons || {}).map(([lessonKey, progressData]) => ({
            idUser,
            courseId,
            lessonKey,
            progressData,
            updatedAt: new Date().toISOString(),
          }))
        )
      ),
      certificates: cache.certificates,
      quizStatus: cache.quizStatus,
    };

    const res = await fetch('/api/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error('[Supabase flush error]:', err);
    return false;
  }
}

export function getStoredQaQuestions(){
  return (cache.qaQuestions || []).filter((q: any) => q && !String(q.id || '').startsWith('q_sample_') && q.authorId !== 'student_sample_1');
}
export function saveStoredQaQuestions(questions: QaQuestion[]){
  const clean = (questions || []).filter((q: any) => q && !String(q.id || '').startsWith('q_sample_') && q.authorId !== 'student_sample_1');
  cache.qaQuestions = clean;
  persistAsync('qa_questions', { items: clean });
  notify('lms-qa-updated');
}

export function getDismissedNotificationIds(userId?:string){ return userId ? (cache.dismissedNotifications[String(userId).toLowerCase()]||[]) : Object.values(cache.dismissedNotifications).flat(); }
export function addDismissedNotificationId(id:string,userId?:string){ const k=String(userId||'global').toLowerCase(); cache.dismissedNotifications={...cache.dismissedNotifications,[k]:[...(cache.dismissedNotifications[k]||[]),id]}; persistAsync('dismissed_notifications',cache.dismissedNotifications); }
export function getStoredNotifications(){ return cache.notifications; }
export function saveStoredNotifications(notifs:any[]){ cache.notifications=notifs; persistAsync('notifications',{payload:notifs}); notify('lms-notifications-updated'); }
export function addNotification(notification:any,checkDismissedUserId?:string){ if(checkDismissedUserId && getDismissedNotificationIds(checkDismissedUserId).includes(notification.id)) return; saveStoredNotifications([notification,...cache.notifications.filter(n=>n.id!==notification.id)].slice(0,100)); }
export function deleteNotification(id:string,userId?:string){ saveStoredNotifications(cache.notifications.filter(n=>n.id!==id)); }
export function markNotificationAsRead(id:string){ saveStoredNotifications(cache.notifications.map(n=>n.id===id?{...n,isRead:true}:n)); }
export function markAllNotificationsAsRead(recipientId:string,role?:string){ saveStoredNotifications(cache.notifications.map(n=>(!recipientId||n.recipientId===recipientId||n.recipientRole===role)?{...n,isRead:true}:n)); }
export function clearNotificationsForUser(userOrId:any,optionalRole?:string){ const id=typeof userOrId==='string'?userOrId:userOrId?.idUser; saveStoredNotifications(cache.notifications.filter(n=>!(n.recipientId===id && (!optionalRole||n.recipientRole===optionalRole)))); }

export function getStoredSchoolNotices(){ return cache.schoolNotices; }
export function saveStoredSchoolNotices(notices:any[]){ cache.schoolNotices=notices; persistAsync('school_notices',{items:notices}); notify('lms-notifications-updated'); }
export function addSchoolNotice(notice:any){ saveStoredSchoolNotices([notice,...cache.schoolNotices.filter(n=>n.id!==notice.id)]); }
export function deleteSchoolNotice(id:string){ saveStoredSchoolNotices(cache.schoolNotices.filter(n=>n.id!==id)); }

export function getStoredUnlockedBadges(userId: string): any {
  return cache.unlockedBadges[String(userId).toLowerCase()] || {};
}
export function saveStoredUnlockedBadges(userId: string, data: any) {
  const k = String(userId).toLowerCase();
  cache.unlockedBadges = { ...cache.unlockedBadges, [k]: data };
  persistAsync('unlocked_badges', cache.unlockedBadges);
}
export function getStoredSeenCertificates(userId:string){ return cache.seenCertificates[String(userId).toLowerCase()]||[]; }
export function saveStoredSeenCertificates(userId:string,ids:string[]){ const k=String(userId).toLowerCase(); cache.seenCertificates={...cache.seenCertificates,[k]:ids}; persistAsync('seen_certificates',cache.seenCertificates); }

export async function fetchQaQuestionsFromApi(courseId?: string, lessonIdx?: number): Promise<QaQuestion[]> {
  const qs = new URLSearchParams(); if (courseId) qs.set('courseId', courseId); if (lessonIdx !== undefined) qs.set('lessonIdx', String(lessonIdx));
  const res = await fetch(`/api/qa?${qs.toString()}`); if (!res.ok) return [];
  const data = await res.json(); const list = Array.isArray(data?.questions) ? data.questions : (Array.isArray(data) ? data : []);
  if (list.length) { cache.qaQuestions = list; }
  return list;
}
export async function fetchPendingSummaryFromApi(role?: string): Promise<any | null> {
  try { const res=await fetch(`/api/pending-summary?role=${encodeURIComponent(role||'')}`); if(!res.ok)return null; return await res.json(); } catch { return null; }
}


// ==================== LEARNING GAMES STORAGE ====================
export function getStoredLearningGames(): LearningGame[] {
  return cache.learningGames || [];
}

export function saveStoredLearningGames(games: LearningGame[]): void {
  cache.learningGames = games;
  persistAsync('learning_games', { items: games });
  notify('lms-games-updated');
}

export async function fetchLearningGamesFromApi(): Promise<LearningGame[]> {
  try {
    const res = await fetch('/api/games');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.games)) {
        saveStoredLearningGames(data.games);
        return data.games;
      }
    }
  } catch (err) {
    console.warn('Lỗi lấy danh sách trò chơi ôn tập:', err);
  }
  return getStoredLearningGames();
}

export async function saveLearningGameApi(game: Partial<LearningGame>, userObj: any): Promise<LearningGame | null> {
  try {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, userObj }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.game) {
        const current = getStoredLearningGames();
        const existingIdx = current.findIndex((g) => g.id === data.game.id);
        let next;
        if (existingIdx >= 0) {
          next = [...current];
          next[existingIdx] = data.game;
        } else {
          next = [data.game, ...current];
        }
        saveStoredLearningGames(next);
        return data.game;
      }
    }
  } catch (err) {
    console.error('Lỗi lưu trò chơi:', err);
  }
  return null;
}

export async function deleteLearningGameApi(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const current = getStoredLearningGames();
      const next = current.filter((g) => g.id !== id);
      saveStoredLearningGames(next);
      return true;
    }
  } catch (err) {
    console.error('Lỗi xóa trò chơi:', err);
  }
  return false;
}

export function recordGamePlay(id: string): void {
  try {
    fetch(`/api/games/${id}/play`, { method: 'POST' }).catch(() => {});
    const current = getStoredLearningGames();
    const gIdx = current.findIndex((g) => g.id === id);
    if (gIdx >= 0) {
      current[gIdx].playCount = Number(current[gIdx].playCount || 0) + 1;
      saveStoredLearningGames([...current]);
    }
  } catch {}
}
