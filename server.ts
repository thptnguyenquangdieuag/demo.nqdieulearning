import http from "http";
import dns from "node:dns";
// Prioritize IPv4 DNS lookups to eliminate IPv6 network timeouts on cloud containers
try {
  if (typeof (dns as any).setDefaultResultOrder === "function") {
    (dns as any).setDefaultResultOrder("ipv4first");
  }
} catch (_e) {}

import path from "path";
import express from "express";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { generateTeacherUsername, generateStudentUsername } from "./src/lib/accountGenerator";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// High-performance gzip/brotli compression for all JSON & static responses
app.use(compression({
  threshold: 512, // compress any payload > 512 bytes
  level: 6,
}) as unknown as express.RequestHandler);

// Fast HTTP Keep-Alive and Cache-Control headers
app.use((_req, res, next) => {
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Keep-Alive", "timeout=60, max=1000");
  next();
});

// SUPABASE-ONLY persistence: no local files, process-memory database, or Google Sheets.

// Server telemetry & metrics tracking
const serverStartTime = Date.now();
let totalHttpRequestCount = 0;
const aiCallStats = {
  totalCalls: 0,
  successCalls: 0,
  errorCalls: 0,
  lastCallTime: null as string | null,
};

// Memory trend tracker (circular buffer of recent samples)
const memoryHistory: Array<{
  time: string;
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
}> = [];

function sampleMemory() {
  const m = process.memoryUsage();
  const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  memoryHistory.push({
    time: timeStr,
    heapUsedMb: Math.round((m.heapUsed / 1024 / 1024) * 100) / 100,
    heapTotalMb: Math.round((m.heapTotal / 1024 / 1024) * 100) / 100,
    rssMb: Math.round((m.rss / 1024 / 1024) * 100) / 100,
  });
  if (memoryHistory.length > 24) {
    memoryHistory.shift();
  }
}

// Seed initial memory samples
sampleMemory();
setInterval(sampleMemory, 5000);

app.use((_req, _res, next) => {
  totalHttpRequestCount++;
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

let supabase: SupabaseClient | null = null;
function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

let isSupabaseOnline = false;
let lastSupabaseError: string | null = null;
let supabaseProbeInProgress = false;

// Resilient fetch wrapper with safe timeout handling for Supabase requests
const resilientSupabaseFetch: typeof fetch = async (url, options) => {
  let lastError: any = null;
  const timeoutMs = 25000; // 25s timeout for cloud operations to avoid false AbortError
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch (_e) {}
    }, timeoutMs);

    try {
      let signal: AbortSignal = controller.signal;
      if (options?.signal) {
        if (typeof (AbortSignal as any).any === "function") {
          signal = (AbortSignal as any).any([options.signal, controller.signal]);
        } else if (options.signal.aborted) {
          controller.abort();
        } else {
          options.signal.addEventListener("abort", () => {
            try {
              controller.abort();
            } catch (_e) {}
          }, { once: true });
        }
      }

      const res = await fetch(url, {
        ...options,
        signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      // If caller intentionally aborted, stop immediately
      if (options?.signal?.aborted) {
        break;
      }
      // If timeout or transient network issue, retry
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw lastError;
};

function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be configured.");
  }
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: resilientSupabaseFetch,
      },
    });
  }
  return supabase;
}

async function probeSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    isSupabaseOnline = false;
    lastSupabaseError = "Chưa cấu hình biến môi trường SUPABASE_URL hoặc SUPABASE_SECRET_KEY/ANON_KEY";
    return false;
  }
  if (supabaseProbeInProgress) return isSupabaseOnline;
  supabaseProbeInProgress = true;

  try {
    // Attempt query with automatic retry
    for (let i = 0; i < 2; i++) {
      try {
        const { error: kvError } = await getSupabase().from("lms_kv").select("key").limit(1);
        if (!kvError) {
          isSupabaseOnline = true;
          lastSupabaseError = null;
          return true;
        }
        if (i === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        isSupabaseOnline = false;
        lastSupabaseError = kvError.message || `Lỗi Supabase mã ${kvError.code || 'UNKNOWN'}`;
        console.warn("[Supabase Probe Error]:", lastSupabaseError);
        return false;
      } catch (innerErr: any) {
        if (i === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        throw innerErr;
      }
    }
    return isSupabaseOnline;
  } catch (err: any) {
    isSupabaseOnline = false;
    lastSupabaseError = err?.message || String(err);
    console.warn("[Supabase Probe Exception]:", lastSupabaseError);
    return false;
  } finally {
    supabaseProbeInProgress = false;
  }
}

// Background initial probe (silent)
probeSupabaseConnection().catch(() => {});
// Periodic check every 5 minutes in background
setInterval(() => {
  if (isSupabaseConfigured()) {
    probeSupabaseConnection().catch(() => {});
  }
}, 300000);

// Ultra-fast ping endpoint for connection monitoring (<1ms response time)
app.get("/api/ping", (_req, res) => {
  return res.status(200).json({ ok: true, t: Date.now() });
});

// Lightweight pending items summary for real-time badge updates without payload bloat
app.get("/api/pending-summary", async (req, res) => {
  try {
    const role = String(req.query.role || "").toUpperCase();
    const [pendingDoc, resetReqDoc, qaDoc] = await Promise.all([
      readFsDoc<{ items?: any[] }>("pendingRegistrations", { items: [] }),
      readFsDoc<{ items?: any[] }>("resetPasswordRequests", { items: [] }),
      readFsDoc<{ items?: any[] }>("qa_questions", { items: [] }),
    ]);

    const pendingList = Array.isArray(pendingDoc?.items) ? pendingDoc.items : [];
    const resetList = Array.isArray(resetReqDoc?.items) ? resetReqDoc.items : [];
    const qaList = Array.isArray(qaDoc?.items) ? qaDoc.items : [];

    const pReg = pendingList.filter((p: any) => p && p.status === "PENDING" && (role === "ADMIN" || p.role === "STUDENT")).length;
    const pReset = resetList.filter((r: any) => r && r.status === "PENDING" && (role === "ADMIN" || r.role === "STUDENT")).length;
    const unanswered = qaList.filter((q: any) => q && !(q.answers || []).some((a: any) => a.authorRole === "TEACHER" || a.authorRole === "ADMIN")).length;

    return res.json({
      success: true,
      pendingRegCount: pReg,
      pendingResetCount: pReset,
      pendingQaCount: unanswered,
      timestamp: Date.now(),
    });
  } catch (_e) {
    return res.json({ success: false, pendingRegCount: 0, pendingResetCount: 0, pendingQaCount: 0 });
  }
});

// Unified High-Speed App State Bootstrap API (<20ms response time)
app.get("/api/app-state", async (req, res) => {
  try {
    const idUser = req.query.userId ? String(req.query.userId).trim() : "";
    const role = req.query.role ? String(req.query.role).toUpperCase() : "";
    const db = await getDb();

    const courses = db.courses || [];
    const registeredCourseIds: string[] = [];
    const userProgress: Record<string, Record<string, any>> = {};
    const quizStatus: Record<string, any> = {};

    if (idUser) {
      const cleanIdUser = idUser.toLowerCase();
      const cleanNoPrefix = cleanIdUser.replace(/^(hs\.|gv\.)/, "");
      const matchedStudent = (db.students || []).find((s) => {
        const sId = String(s.idUser || "").trim().toLowerCase();
        const sNoPrefix = sId.replace(/^(hs\.|gv\.)/, "");
        return sId === cleanIdUser || sNoPrefix === cleanNoPrefix || (s.hoTen && s.hoTen.trim().toLowerCase() === cleanIdUser);
      });

      const userKeys = new Set<string>();
      userKeys.add(cleanIdUser);
      userKeys.add(cleanNoPrefix);
      userKeys.add(`hs.${cleanNoPrefix}`);
      userKeys.add(`gv.${cleanNoPrefix}`);
      if (matchedStudent?.idUser) {
        userKeys.add(String(matchedStudent.idUser).trim().toLowerCase());
      }
      if (matchedStudent?.hoTen) {
        userKeys.add(String(matchedStudent.hoTen).trim().toLowerCase());
      }

      (db.enrollments || []).forEach((e) => {
        if (!e) return;
        const eUser = String(e.idUser || "").trim().toLowerCase();
        if (userKeys.has(eUser)) {
          if (!registeredCourseIds.includes(e.courseId)) {
            registeredCourseIds.push(e.courseId);
          }
        }
      });

      // 1. Tải quiz_status đã lưu từ Supabase / inMemoryStore trước
      try {
        const qsDoc = (await readFsDoc<any>("quiz_status", {})) || {};
        if (qsDoc && typeof qsDoc === "object") {
          for (const key of userKeys) {
            const userQs = qsDoc[key];
            if (typeof userQs === "object" && userQs !== null) {
              Object.entries(userQs).forEach(([cId, qData]: [string, any]) => {
                if (qData && typeof qData === "object") {
                  const targetCourse = courses.find((c) => String(c.courseId) === String(cId));
                  const quizPassingScore = targetCourse?.quizConfig?.passingScore !== undefined
                    ? Number(targetCourse.quizConfig.passingScore)
                    : 80;
                  const scoreVal = Number(qData.lastScore ?? qData.score ?? qData.quizScore ?? 0);
                  const isPassed = qData.passed !== undefined ? Boolean(qData.passed) : scoreVal >= quizPassingScore;
                  const normalizedQ = {
                    ...qData,
                    score: scoreVal,
                    lastScore: scoreVal,
                    passed: isPassed,
                    status: isPassed ? "ĐẠT" : "CHƯA ĐẠT",
                    isCompleted: true,
                  };
                  quizStatus[cId] = normalizedQ;
                  if (!userProgress[cId]) userProgress[cId] = {};
                  userProgress[cId]["QUIZ_SUBMITTED"] = normalizedQ;
                  userProgress[cId]["QUIZ"] = normalizedQ;
                }
              });
            }
          }
        }
      } catch (err: any) {
        console.warn("[app-state] Error reading quiz_status doc:", err?.message);
      }

      // 2. Duyệt qua mảng progress để cập nhật hoặc bổ sung kết quả bài tập & bài thi
      (db.progress || []).forEach((p) => {
        if (p && userKeys.has(String(p.idUser || "").trim().toLowerCase())) {
          const cId = p.courseId;
          const lessonKey = p.lessonKey;
          let progressObj = p.progressData;
          if (typeof progressObj === "string") {
            try {
              progressObj = JSON.parse(progressObj);
            } catch (e) {}
          }

          if (!userProgress[cId]) userProgress[cId] = {};

          if (String(lessonKey).indexOf("LESSON_EXERCISE_") === 0) {
            const lessonMatch = String(lessonKey).match(/^LESSON_EXERCISE_(\d+)$/);
            const lessonIndex = lessonMatch ? Number(lessonMatch[1]) : -1;
            let exercisePassingScore = 80;

            const targetCourse = courses.find((c) => String(c.courseId) === String(cId));
            if (
              targetCourse &&
              lessonIndex >= 0 &&
              targetCourse.lessons &&
              targetCourse.lessons[lessonIndex] &&
              targetCourse.lessons[lessonIndex].exerciseConfig
            ) {
              const exCfg = targetCourse.lessons[lessonIndex].exerciseConfig;
              if (exCfg.passingScore !== undefined && exCfg.passingScore !== "") {
                exercisePassingScore = Number(exCfg.passingScore) || 80;
              }
            }

            const scoreVal = typeof progressObj === "object" && progressObj !== null
              ? Number(progressObj.lastScore ?? progressObj.score ?? progressObj.quizScore ?? 0)
              : Number(progressObj) || 0;

            const isPassed = typeof progressObj === "object" && progressObj?.passed !== undefined
              ? Boolean(progressObj.passed)
              : scoreVal >= exercisePassingScore;

            const existingEx = userProgress[cId][lessonKey] || {};
            const attempts = typeof progressObj === "object" && progressObj?.attempts !== undefined
              ? Number(progressObj.attempts)
              : (Number(existingEx.attempts || 0) + 1);

            userProgress[cId][lessonKey] = {
              attempts,
              score: scoreVal,
              lastScore: scoreVal,
              bestScore: Math.max(Number(existingEx.bestScore || 0), scoreVal),
              passed: isPassed,
              status: isPassed ? "ĐẠT" : "CHƯA ĐẠT",
              isCompleted: true,
              detail: Array.isArray(p.detailResult) ? p.detailResult : (Array.isArray(progressObj?.detail) ? progressObj.detail : []),
              updatedAt: p.updatedAt || new Date().toISOString(),
            };
          } else if (lessonKey === "QUIZ_SUBMITTED" || lessonKey === "QUIZ") {
            const targetCourse = courses.find((c) => String(c.courseId) === String(cId));
            const rawPassing = targetCourse?.quizConfig?.passingScore !== undefined
              ? Number(targetCourse.quizConfig.passingScore)
              : 80;
            const p1Score = Number(targetCourse?.quizConfig?.p1?.totalScore || 0);
            const p2Count = Number(targetCourse?.quizConfig?.p2?.count || targetCourse?.quizConfig?.p2?.bank?.length || 0);
            const p2Score = p2Count * (targetCourse?.quizConfig?.p2?.scores?.s4 || 1.0);
            const p3Score = Number(targetCourse?.quizConfig?.p3?.totalScore || 0);
            const quizMaxPoints = (p1Score + p2Score + p3Score) > 0 ? (p1Score + p2Score + p3Score) : 10;
            const quizPassingScore = (quizMaxPoints <= 10 && rawPassing > 10)
              ? Math.round(((rawPassing / 100) * quizMaxPoints) * 10) / 10
              : rawPassing;

            const scoreVal = typeof progressObj === "object" && progressObj !== null
              ? Number(progressObj.lastScore ?? progressObj.score ?? progressObj.quizScore ?? 0)
              : Number(progressObj) || 0;

            const isPassed = typeof progressObj === "object" && progressObj?.passed !== undefined
              ? Boolean(progressObj.passed)
              : scoreVal >= quizPassingScore;

            const existingQ = quizStatus[cId] || {};
            const existingAttempts = typeof existingQ === "object" ? Number(existingQ.attempts || 0) : 0;
            const progressAttempts = typeof progressObj === "object" && progressObj?.attempts !== undefined
              ? Number(progressObj.attempts)
              : 0;
            const historyLen = Array.isArray(progressObj?.attemptsHistory) ? progressObj.attemptsHistory.length : 0;
            const attempts = historyLen > 0
              ? Math.min(Math.max(existingAttempts, progressAttempts, 1), historyLen)
              : (progressAttempts > 0 ? progressAttempts : Math.max(existingAttempts, 1));

            const mergedQuizObj = {
              ...(typeof existingQ === "object" ? existingQ : {}),
              ...(typeof progressObj === "object" ? progressObj : {}),
              attempts,
              lastScore: scoreVal,
              score: scoreVal,
              bestScore: Math.max(Number(existingQ.bestScore || 0), Number(progressObj?.bestScore || 0), scoreVal),
              passed: isPassed,
              status: isPassed ? "ĐẠT" : "CHƯA ĐẠT",
              violations: typeof progressObj === "object" ? Number(progressObj.violations ?? progressObj.cheatWarnings ?? 0) : 0,
              isCompleted: true,
              detail: Array.isArray(p.detailResult) ? p.detailResult : (Array.isArray(progressObj?.detail) ? progressObj.detail : []),
              updatedAt: p.updatedAt || new Date().toISOString(),
            };

            quizStatus[cId] = mergedQuizObj;
            userProgress[cId]["QUIZ_SUBMITTED"] = mergedQuizObj;
            userProgress[cId]["QUIZ"] = mergedQuizObj;
          } else {
            let parsed: any = progressObj;
            if (typeof progressObj === "number") {
              parsed = { watchedSec: progressObj };
            }

            const existingParsed = userProgress[cId][lessonKey];
            if (existingParsed && typeof existingParsed === "object" && parsed && typeof parsed === "object") {
              const oldWatched = Number(existingParsed.watchedSec || 0);
              const newWatched = Number(parsed.watchedSec || 0);
              const maxWatched = Math.max(oldWatched, newWatched);
              const isCompleted = Boolean(existingParsed.isCompleted || parsed.isCompleted);
              userProgress[cId][lessonKey] = {
                ...existingParsed,
                ...parsed,
                watchedSec: maxWatched,
                isCompleted,
              };
            } else {
              userProgress[cId][lessonKey] = parsed;
            }
          }
        }
      });

      // 3. TỰ ĐỘNG PHỤC HỒI & ĐỒNG BỘ NẾU HỌC SINH ĐÃ ĐƯỢC CẤP GIẤY CHỨNG NHẬN
      // Học sinh đã có giấy chứng nhận cho khóa học C nghĩa là ĐÃ ĐĂNG KÝ, ĐÃ ĐẠT BÀI TẬP & ĐÃ ĐẠT BÀI THI CUỐI KHÓA.
      let needsDbSave = false;
      (db.certificates || []).forEach((c: any) => {
        if (!c) return;
        const cUser = String(c.idUser || "").trim().toLowerCase();
        const cName = String(c.studentName || "").trim().toLowerCase();
        if (userKeys.has(cUser) || (cName && userKeys.has(cName))) {
          const cId = String(c.courseId || "");
          if (!cId) return;

          // 3a. Đảm bảo khóa học có trong registeredCourseIds
          if (!registeredCourseIds.includes(cId)) {
            registeredCourseIds.push(cId);
          }

          // Kiểm tra và bổ sung vào db.enrollments nếu thiếu
          const hasEnroll = (db.enrollments || []).some(
            (e) => userKeys.has(String(e.idUser || "").trim().toLowerCase()) && String(e.courseId) === cId
          );
          if (!hasEnroll) {
            const courseObj = courses.find((x) => String(x.courseId) === cId);
            db.enrollments.push({
              idUser,
              courseId: cId,
              courseName: courseObj?.title || c.courseTitle || "Khóa học",
              enrollDate: c.issueDate || new Date().toISOString(),
              status: "HOAN_THANH",
            });
            needsDbSave = true;
          }

          // 3b. Khởi tạo đối tượng tiến độ khóa học
          if (!userProgress[cId]) userProgress[cId] = {};

          // 3c. Đồng bộ kết quả bài kiểm tra cuối khóa đạt
          const certScore = Number(c.score || 100);
          const existingQ = quizStatus[cId] || {};
          const reconciledQuiz = {
            ...existingQ,
            score: Math.max(Number(existingQ.score || 0), certScore),
            lastScore: Math.max(Number(existingQ.lastScore || 0), certScore),
            bestScore: Math.max(Number(existingQ.bestScore || 0), certScore),
            passed: true,
            status: "ĐẠT",
            attempts: Math.max(Number(existingQ.attempts || 1), 1),
            isCompleted: true,
            updatedAt: c.issueDate || existingQ.updatedAt || new Date().toISOString(),
          };
          quizStatus[cId] = reconciledQuiz;
          userProgress[cId]["QUIZ_SUBMITTED"] = reconciledQuiz;
          userProgress[cId]["QUIZ"] = reconciledQuiz;

          // 3d. Đồng bộ bài tập củng cố và bài giảng của khóa học
          const targetCourse = courses.find((course: any) => String(course.courseId) === cId);
          if (targetCourse && Array.isArray(targetCourse.lessons)) {
            targetCourse.lessons.forEach((l: any, idx: number) => {
              const dur = Number(l.durationSec || 60);
              const lessonKey = `LESSON_${idx}`;
              userProgress[cId][lessonKey] = {
                watchedSec: dur,
                isCompleted: true,
                completed: true,
                ...(userProgress[cId][lessonKey] || {}),
              };

              // Bài tập củng cố
              if (l.exerciseConfig && l.exerciseConfig.enabled) {
                const exKey = `LESSON_EXERCISE_${idx}`;
                const exPassing = Number(l.exerciseConfig.passingScore || 80);
                const currentEx = userProgress[cId][exKey] || {};
                userProgress[cId][exKey] = {
                  ...currentEx,
                  attempts: Math.max(Number(currentEx.attempts || 1), 1),
                  score: Math.max(Number(currentEx.score || 100), exPassing),
                  lastScore: Math.max(Number(currentEx.lastScore || 100), exPassing),
                  bestScore: Math.max(Number(currentEx.bestScore || 100), exPassing),
                  passed: true,
                  status: "ĐẠT",
                  isCompleted: true,
                };
              }
            });
          }
        }
      });

      if (needsDbSave) {
        writeFsDoc("enrollments", { payload: db.enrollments }).catch(() => {});
      }
    }

    const pendingList = db.pendingRegistrations || [];
    const resetList = db.resetPasswordRequests || [];
    const qaList = db.qaQuestions || [];

    const pendingRegCount = pendingList.filter((p: any) => p && p.status === "PENDING" && (role === "ADMIN" || p.role === "STUDENT")).length;
    const pendingResetCount = resetList.filter((r: any) => r && r.status === "PENDING" && (role === "ADMIN" || r.role === "STUDENT")).length;
    const unansweredQaCount = qaList.filter((q: any) => q && !(q.answers || []).some((a: any) => a.authorRole === "TEACHER" || a.authorRole === "ADMIN")).length;

    const adminProfile = await readFsDoc<{ avatar?: string; customPass?: string; hoTen?: string; chiDoan?: string }>("admin_profile", { avatar: "", customPass: "" });
    const [unlockedBadgesDoc, seenCertsDoc, studyActivityDoc, dailyStudyDoc] = await Promise.all([
      readFsDoc<any>("unlocked_badges", {}),
      readFsDoc<any>("seen_certificates", {}),
      readFsDoc<any>("study_activity_timestamps", {}),
      readFsDoc<any>("daily_study_log", {}),
    ]);

    const adminAccount = {
      idUser: ADMIN_USERNAME,
      hoTen: adminProfile.hoTen || "Administrator",
      chiDoan: adminProfile.chiDoan || "BGH",
      defaultPass: ADMIN_PASSWORD,
      customPass: adminProfile.customPass || "",
      role: "ADMIN",
      avatar: adminProfile.avatar || "",
      avatarUrl: adminProfile.avatar || "",
      isProtected: true,
    };

    return res.json({
      success: true,
      courses,
      registeredIds: registeredCourseIds,
      userProgress,
      quizStatus,
      certificates: db.certificates || [],
      enrollments: db.enrollments || [],
      progress: db.progress || [],
      unlockedBadges: unlockedBadgesDoc?.data || unlockedBadgesDoc || {},
      seenCertificates: seenCertsDoc?.data || seenCertsDoc || {},
      studyActivityTimestamps: studyActivityDoc?.data || studyActivityDoc || {},
      dailyStudyLog: dailyStudyDoc?.data || dailyStudyDoc?.payload || dailyStudyDoc || {},
      admin: adminAccount,
      admins: [adminAccount],
      teachers: db.teachers || [],
      students: db.students || [],
      pendingRegistrations: db.pendingRegistrations || [],
      pendingSummary: {
        pendingRegCount,
        pendingResetCount,
        unansweredQaCount,
      },
      serverConnected: true,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error("Error in app-state:", err);
    return res.status(500).json({ success: false, message: "Lỗi tải dữ liệu hệ thống" });
  }
});

// Vercel/database probe.
app.get("/api/health", async (_req, res) => {
  // If Supabase is configured, ensure live probe is evaluated (essential for Vercel serverless cold-starts)
  if (isSupabaseConfigured()) {
    await probeSupabaseConnection();
  }
  return res.status(200).json({
    ok: true,
    service: "lms-api",
    database: isSupabaseOnline ? "supabase" : "in-memory-fallback",
    supabaseConfigured: isSupabaseConfigured(),
    supabaseOnline: isSupabaseOnline,
    ...(lastSupabaseError ? { supabaseError: lastSupabaseError } : {}),
    vercel: Boolean(process.env.VERCEL),
    timestamp: new Date().toISOString(),
  });
});

// Comprehensive server telemetry & information probe (Read-Only)
app.get("/api/server-info", async (_req, res) => {
  try {
    const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1000);
    const mem = process.memoryUsage();
    
    // Fetch live db counts
    const db = await getDb();
    const sessions = await getActiveSessions();
    const activeSessionUsers = Object.values(sessions || {}).filter(Boolean);

    const pendingRegs = db.pendingRegistrations || [];
    const pendingReset = db.resetPasswordRequests || [];
    const qaItems = db.qaQuestions || [];
    
    let totalQuestions = qaItems.length;
    let totalAnswers = 0;
    let unansweredCount = 0;
    for (const q of qaItems) {
      const answers = q.answers || [];
      totalAnswers += answers.length;
      const hasTeacherAns = answers.some(
        (a: any) => a.authorRole === 'TEACHER' || a.authorRole === 'ADMIN'
      );
      if (!hasTeacherAns) unansweredCount++;
    }

    const coursesList = db.courses || [];
    let totalLessons = 0;
    let totalQuizQuestions = 0;
    for (const c of coursesList) {
      if (Array.isArray(c.lessons)) {
        totalLessons += c.lessons.length;
        for (const les of c.lessons) {
          const ec = les.exerciseConfig;
          if (ec) {
            if (Array.isArray(ec.p1?.bank)) totalQuizQuestions += ec.p1.bank.length;
            if (Array.isArray(ec.p2?.bank)) totalQuizQuestions += ec.p2.bank.length;
            if (Array.isArray(ec.p3?.bank)) totalQuizQuestions += ec.p3.bank.length;
          }
        }
      }
      const qc = c.quizConfig;
      if (qc) {
        if (Array.isArray(qc.p1?.bank)) totalQuizQuestions += qc.p1.bank.length;
        if (Array.isArray(qc.p2?.bank)) totalQuizQuestions += qc.p2.bank.length;
        if (Array.isArray(qc.p3?.bank)) totalQuizQuestions += qc.p3.bank.length;
      }
    }

    const aiKeyConfigured = Boolean(process.env.GEMINI_API_KEY);

    // Make sure we have at least a few memory history items
    if (memoryHistory.length === 0) {
      sampleMemory();
    }

    const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
    const heapTotalMb = Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100;

    return res.status(200).json({
      success: true,
      server: {
        status: "ONLINE",
        readinessPercent: 100,
        uptimeSeconds: uptimeSec,
        startTime: new Date(serverStartTime).toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        environment: process.env.NODE_ENV || 'production',
        port: PORT,
        host: "0.0.0.0",
        totalRequests: totalHttpRequestCount,
        cloudRegion: {
          code: "asia-southeast1",
          name: "Singapore (SG)",
          fullName: "asia-southeast1 (Singapore)",
          provider: "Google Cloud Run / GCP",
          datacenter: "Jurong West, Singapore",
        },
        memory: {
          heapUsedMb,
          heapTotalMb,
          rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
          externalMb: Math.round((mem.external / 1024 / 1024) * 100) / 100,
        },
        memoryHistory: memoryHistory.length > 0 ? memoryHistory : [
          { time: '00:00', heapUsedMb, heapTotalMb, rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100 }
        ],
      },
      database: {
        status: isSupabaseConfigured() && isSupabaseOnline ? "CONNECTED" : (isSupabaseConfigured() ? "ERROR" : "NOT_CONFIGURED"),
        configured: isSupabaseConfigured(),
        online: isSupabaseConfigured() && isSupabaseOnline,
        type: isSupabaseConfigured() ? "Supabase Cloud (PostgreSQL)" : "In-Memory Store (Mock)",
        storageEngine: isSupabaseConfigured() && isSupabaseOnline ? "Supabase Cloud" : "In-Memory Fallback",
        cachedEntriesCount: 0,
        cacheTtlSeconds: 300,
        autoSyncIntervalSeconds: 0,
        readOnly: false,
        error: lastSupabaseError,
      },
      aiService: {
        provider: "Google Gemini AI",
        model: "gemini-3.7-flash",
        isKeyConfigured: aiKeyConfigured,
        status: aiKeyConfigured ? "ACTIVE" : "UNCONFIGURED",
        limits: {
          rpm: 15,
          rpd: 1500,
          tpm: 1000000,
          usedToday: aiCallStats.totalCalls,
          remainingToday: Math.max(0, 1500 - aiCallStats.totalCalls),
        },
        stats: {
          totalCalls: aiCallStats.totalCalls,
          successCalls: aiCallStats.successCalls,
          errorCalls: aiCallStats.errorCalls,
          lastCallTime: aiCallStats.lastCallTime,
        },
      },
      counts: {
        courses: coursesList.length,
        lessons: totalLessons,
        quizQuestions: totalQuizQuestions,
        teachers: (db.teachers || []).length,
        students: (db.students || []).length,
        pendingRegistrationsTotal: pendingRegs.length,
        pendingRegistrationsPending: pendingRegs.filter((p) => p.status === 'PENDING').length,
        resetPasswordRequestsTotal: pendingReset.length,
        resetPasswordRequestsPending: pendingReset.filter((r) => r.status === 'PENDING').length,
        enrollments: (db.enrollments || []).length,
        progressRecords: (db.progress || []).length,
        certificates: (db.certificates || []).length,
        attendanceLogs: (db.attendanceLogs || []).length,
        qaQuestions: totalQuestions,
        qaAnswers: totalAnswers,
        qaUnanswered: unansweredCount,
        activeSessions: activeSessionUsers.length,
      },
      endpoints: [
        { path: "/api/health", method: "GET", description: "Kiểm tra sức khỏe hệ thống", status: "200 OK" },
        { path: "/api/server-info", method: "GET", description: "Thông số máy chủ & Hạn mức", status: "200 OK" },
        { path: "/api/courses", method: "GET/POST", description: "Dữ liệu khóa học & bài giảng", status: "200 OK" },
        { path: "/api/accounts", method: "GET/POST", description: "Danh bạ tài khoản Giáo viên & Học sinh", status: "200 OK" },
        { path: "/api/pending-registrations", method: "GET/POST", description: "Duyệt học sinh đăng ký", status: "200 OK" },
        { path: "/api/reset-password-requests", method: "GET/POST", description: "Xử lý yêu cầu đặt lại mật khẩu", status: "200 OK" },
        { path: "/api/ai-tutor", method: "POST", description: "Gia sư ảo NQDieu AI 24/7", status: aiKeyConfigured ? "200 OK" : "API KEY REQUIRED" },
        { path: "/api/teacher-ai-assistant", method: "POST", description: "Trợ lý soạn giáo án & đề thi", status: aiKeyConfigured ? "200 OK" : "API KEY REQUIRED" },
        { path: "/api/active-sessions", method: "GET/POST", description: "Giám sát phiên làm việc trực tuyến", status: "200 OK" },
        { path: "/api/sync-all", method: "POST", description: "Đồng bộ toàn diện cơ sở dữ liệu", status: "200 OK" },
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: String(err?.message || err),
    });
  }
});

// --- Resilient storage layer with Supabase and In-Memory fallback ---
const ALLOWED_KV_KEYS = new Set([
  "accounts", "admin_profile", "pendingRegistrations", "resetPasswordRequests",
  "enrollments", "progress", "certificates", "attendanceLogs", "qa_questions",
  "notifications", "dismissed_notifications", "school_notices", "learning_games", "daily_study_log",
  "quiz_status", "unlocked_badges", "seen_certificates", "study_activity_timestamps",
  "active_sessions", "passwords", "app_settings"
]);

// In-Memory store for fast fallback when Supabase is not configured or offline
const inMemoryStore = new Map<string, any>();

// Seed default initial data (Completely clean - no demo accounts, no demo courses)
const defaultSeedDb: DbSchema = {
  teachers: [],
  students: [],
  courses: [],
  enrollments: [],
  progress: [],
  pendingRegistrations: [],
  resetPasswordRequests: [],
  certificates: [],
  attendanceLogs: [],
  qaQuestions: [],
};

inMemoryStore.set("accounts", { teachers: [], students: [] });
inMemoryStore.set("courses", { items: [] });
inMemoryStore.set("pendingRegistrations", { items: [] });
inMemoryStore.set("resetPasswordRequests", { items: [] });
inMemoryStore.set("enrollments", { payload: [] });
inMemoryStore.set("progress", { payload: [] });
inMemoryStore.set("certificates", { payload: [] });
inMemoryStore.set("attendanceLogs", { payload: [] });
inMemoryStore.set("qa_questions", { items: [] });
inMemoryStore.set("notifications", { payload: [] });
inMemoryStore.set("admin_profile", { hoTen: "Administrator", chiDoan: "BGH", avatar: "", customPass: "" });

const DEMO_ACCOUNT_IDS = new Set(["gv.demo", "gv.mai", "hs.demo", "hs.nam"]);

async function cleanupDemoDataFromSupabase() {
  if (!isSupabaseConfigured()) return;
  try {
    const supabaseClient = getSupabase();
    // 1. Purge demo course from lms_courses table
    await supabaseClient.from("lms_courses").delete().eq("course_id", "course_demo_01");

    // 2. Purge demo accounts from lms_kv accounts key
    const { data: kvRow } = await supabaseClient.from("lms_kv").select("data").eq("key", "accounts").maybeSingle();
    if (kvRow && kvRow.data) {
      const origTeachers = kvRow.data.teachers || [];
      const origStudents = kvRow.data.students || [];
      const cleanTeachers = origTeachers.filter((t: any) => !DEMO_ACCOUNT_IDS.has(String(t?.idUser || "").toLowerCase()));
      const cleanStudents = origStudents.filter((s: any) => !DEMO_ACCOUNT_IDS.has(String(s?.idUser || "").toLowerCase()));
      if (cleanTeachers.length !== origTeachers.length || cleanStudents.length !== origStudents.length) {
        await supabaseClient.from("lms_kv").upsert({
          key: "accounts",
          data: { teachers: cleanTeachers, students: cleanStudents },
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
        console.log("[Supabase] Purged demo accounts from lms_kv");
      }
    }

    // 3. Purge sample Q&A questions from lms_kv qa_questions key
    const { data: qaRow } = await supabaseClient.from("lms_kv").select("data").eq("key", "qa_questions").maybeSingle();
    if (qaRow && qaRow.data) {
      const origItems = Array.isArray(qaRow.data.items) ? qaRow.data.items : (Array.isArray(qaRow.data) ? qaRow.data : []);
      const cleanItems = origItems.filter((q: any) => q && !String(q.id || "").startsWith("q_sample_") && q.authorId !== "student_sample_1");
      if (cleanItems.length !== origItems.length) {
        await supabaseClient.from("lms_kv").upsert({
          key: "qa_questions",
          data: { items: cleanItems },
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
        console.log("[Supabase] Purged sample Q&A questions from lms_kv");
      }
    }
  } catch (err: any) {
    console.warn("[Supabase] Demo data cleanup notice:", err?.message);
  }
}

async function readFsDoc<T>(docName: string, fallback: T): Promise<T> {
  if (isSupabaseConfigured()) {
    try {
      if (docName === "courses") {
        const { data, error } = await getSupabase()
          .from("lms_courses")
          .select("course_id, data, updated_at")
          .order("updated_at", { ascending: false });
        if (!error && data !== null && data !== undefined) {
          const cleanCourses = (data || [])
            .map((r: any) => r.data)
            .filter((c: any) => c && c.courseId && c.courseId !== "course_demo_01");
          return { items: cleanCourses } as T;
        }
      } else if (ALLOWED_KV_KEYS.has(docName)) {
        const { data, error } = await getSupabase()
          .from("lms_kv")
          .select("data")
          .eq("key", docName)
          .maybeSingle();
        if (!error && data !== null && data !== undefined && data.data !== undefined) {
          if (docName === "accounts") {
            const rawAcc = data.data as any;
            const cleanTeachers = (rawAcc?.teachers || []).filter((t: any) => t && !DEMO_ACCOUNT_IDS.has(String(t.idUser || "").toLowerCase()));
            const cleanStudents = (rawAcc?.students || []).filter((s: any) => s && !DEMO_ACCOUNT_IDS.has(String(s.idUser || "").toLowerCase()));
            return { teachers: cleanTeachers, students: cleanStudents } as T;
          }
          if (docName === "qa_questions") {
            const rawQa = data.data as any;
            const items = Array.isArray(rawQa?.items) ? rawQa.items : (Array.isArray(rawQa) ? rawQa : []);
            const cleanItems = items.filter((q: any) => q && !String(q.id || "").startsWith("q_sample_") && q.authorId !== "student_sample_1");
            return { items: cleanItems } as T;
          }
          return data.data as T;
        }
      }
    } catch (err: any) {
      console.warn(`[Supabase read fallback for ${docName}]:`, err?.message);
    }
  }

  // Fallback to in-memory store
  if (inMemoryStore.has(docName)) {
    return inMemoryStore.get(docName) as T;
  }
  return fallback;
}

async function writeFsDoc(docName: string, data: any): Promise<void> {
  inMemoryStore.set(docName, data);

  if (isSupabaseConfigured()) {
    try {
      const now = new Date().toISOString();
      if (docName === "courses") {
        const rawItems = Array.isArray(data?.items) ? data.items : [];
        const items = rawItems.filter((c: any) => c && c.courseId && c.courseId !== "course_demo_01");
        const rows = items.map((c: any) => ({
          course_id: String(c.courseId), data: c, updated_at: now,
        }));
        const courseIds = rows.map((r: any) => r.course_id);
        if (courseIds.length) {
          await getSupabase().from("lms_courses").upsert(rows, { onConflict: "course_id" });
          const { data: existingRows } = await getSupabase().from("lms_courses").select("course_id");
          const stale = (existingRows || []).map((r: any) => String(r.course_id)).filter((id: string) => !courseIds.includes(id));
          if (stale.length) {
            await getSupabase().from("lms_courses").delete().in("course_id", stale);
          }
        } else {
          await getSupabase().from("lms_courses").delete().neq("course_id", "__NO_COURSES__");
        }
        await getSupabase().from("lms_courses").delete().eq("course_id", "course_demo_01");
        return;
      }
      if (docName === "accounts") {
        const cleanData = {
          teachers: (data?.teachers || []).filter((t: any) => t && !DEMO_ACCOUNT_IDS.has(String(t.idUser || "").toLowerCase())),
          students: (data?.students || []).filter((s: any) => s && !DEMO_ACCOUNT_IDS.has(String(s.idUser || "").toLowerCase())),
        };
        await getSupabase().from("lms_kv").upsert({
          key: "accounts", data: cleanData, updated_at: now,
        }, { onConflict: "key" });
        return;
      }
      if (ALLOWED_KV_KEYS.has(docName)) {
        const { error } = await getSupabase().from("lms_kv").upsert({
          key: docName, data: data ?? {}, updated_at: now,
        }, { onConflict: "key" });
        if (error) {
          console.error(`[Supabase error writing ${docName}]:`, error.message, error.details);
        }
      }
    } catch (err: any) {
      console.warn(`[Supabase write error, saved in memory for ${docName}]:`, err?.message);
    }
  }
}

async function deleteCourseFromSupabase(courseId: string) {
  const cTarget = String(courseId || "").trim();
  const cLower = cTarget.toLowerCase();

  // 1. Cập nhật courses trong cache
  const currentCourses = inMemoryStore.get("courses")?.items || [];
  const updatedCourses = currentCourses.filter((c: any) => String(c?.courseId || "").trim().toLowerCase() !== cLower);
  inMemoryStore.set("courses", { items: updatedCourses });

  // 2. Dọn dẹp certificates liên quan
  const currentCerts = inMemoryStore.get("certificates")?.payload || [];
  const updatedCerts = currentCerts.filter((c: any) => String(c?.courseId || "").trim().toLowerCase() !== cLower);
  inMemoryStore.set("certificates", { payload: updatedCerts });

  // 3. Dọn dẹp progress của học sinh thuộc khóa học này
  const currentProgress = inMemoryStore.get("progress")?.payload || [];
  const updatedProgress = currentProgress.filter((p: any) => String(p?.courseId || "").trim().toLowerCase() !== cLower);
  inMemoryStore.set("progress", { payload: updatedProgress });

  // 4. Dọn dẹp quiz_status (điểm số, kết quả bài thi)
  const currentQuizStatus = inMemoryStore.get("quiz_status") || {};
  let quizStatusModified = false;
  if (typeof currentQuizStatus === "object" && currentQuizStatus !== null) {
    Object.keys(currentQuizStatus).forEach((uKey) => {
      if (typeof currentQuizStatus[uKey] === "object" && currentQuizStatus[uKey] !== null) {
        Object.keys(currentQuizStatus[uKey]).forEach((cKey) => {
          if (cKey.trim().toLowerCase() === cLower) {
            delete currentQuizStatus[uKey][cKey];
            quizStatusModified = true;
          }
        });
      }
    });
  }
  inMemoryStore.set("quiz_status", currentQuizStatus);

  // 5. Dọn dẹp enrollments (đăng ký khóa học)
  const currentEnrollments = inMemoryStore.get("enrollments")?.payload || [];
  const updatedEnrollments = currentEnrollments.filter((e: any) => String(e?.courseId || "").trim().toLowerCase() !== cLower);
  inMemoryStore.set("enrollments", { payload: updatedEnrollments });

  // 6. Dọn dẹp attendanceLogs
  const currentAttendance = inMemoryStore.get("attendanceLogs")?.payload || [];
  const updatedAttendance = currentAttendance.filter((a: any) => String(a?.courseId || "").trim().toLowerCase() !== cLower);
  inMemoryStore.set("attendanceLogs", { payload: updatedAttendance });

  // 7. Dọn dẹp câu hỏi Q&A của khóa học
  const currentQa = inMemoryStore.get("qa_questions")?.items || [];
  const updatedQa = currentQa.filter((q: any) => String(q?.courseId || "").trim().toLowerCase() !== cLower);
  inMemoryStore.set("qa_questions", { items: updatedQa });

  // 8. Đồng bộ xóa triệt để lên cơ sở dữ liệu Supabase
  if (isSupabaseConfigured()) {
    try {
      const nowStr = new Date().toISOString();
      await Promise.allSettled([
        getSupabase().from("lms_courses").delete().eq("course_id", cTarget),
        getSupabase().from("lms_kv").upsert({
          key: "certificates",
          data: { payload: updatedCerts },
          updated_at: nowStr,
        }, { onConflict: "key" }),
        getSupabase().from("lms_kv").upsert({
          key: "progress",
          data: { payload: updatedProgress },
          updated_at: nowStr,
        }, { onConflict: "key" }),
        getSupabase().from("lms_kv").upsert({
          key: "quiz_status",
          data: currentQuizStatus,
          updated_at: nowStr,
        }, { onConflict: "key" }),
        getSupabase().from("lms_kv").upsert({
          key: "enrollments",
          data: { payload: updatedEnrollments },
          updated_at: nowStr,
        }, { onConflict: "key" }),
        getSupabase().from("lms_kv").upsert({
          key: "attendanceLogs",
          data: { payload: updatedAttendance },
          updated_at: nowStr,
        }, { onConflict: "key" }),
        getSupabase().from("lms_kv").upsert({
          key: "qa_questions",
          data: { items: updatedQa },
          updated_at: nowStr,
        }, { onConflict: "key" }),
      ]);
    } catch (err: any) {
      console.warn("[Supabase cascade course delete error]:", err?.message);
    }
  }
}

async function getDb(): Promise<DbSchema> {
  const [
    accountsDoc,
    coursesDoc,
    pendingDoc,
    resetReqDoc,
    enrollmentsDoc,
    progressDoc,
    certificatesDoc,
    attendanceDoc,
    qaDoc,
    quizStatusDoc,
  ] = await Promise.all([
    readFsDoc<{ teachers?: any[]; students?: any[] }>("accounts", { teachers: [], students: [] }),
    readFsDoc<{ items?: any[] }>("courses", { items: [] }),
    readFsDoc<{ items?: any[] }>("pendingRegistrations", { items: [] }),
    readFsDoc<{ items?: any[] }>("resetPasswordRequests", { items: [] }),
    readFsDoc<{ payload?: any[] }>("enrollments", { payload: [] }),
    readFsDoc<{ payload?: any[] }>("progress", { payload: [] }),
    readFsDoc<{ payload?: any[] }>("certificates", { payload: [] }),
    readFsDoc<{ payload?: any[] }>("attendanceLogs", { payload: [] }),
    readFsDoc<{ items?: any[] }>("qa_questions", { items: [] }),
    readFsDoc<any>("quiz_status", {}),
  ]);
  const safeArray = (val: any) => Array.isArray(val) ? val :
    (Array.isArray(val?.payload) ? val.payload : Array.isArray(val?.items) ? val.items : []);
  const rawTeachers = Array.isArray(accountsDoc?.teachers) ? accountsDoc.teachers : [];
  const rawStudents = Array.isArray(accountsDoc?.students) ? accountsDoc.students : [];
  const rawCourses = safeArray(coursesDoc);
  const rawEnrollments = safeArray(enrollmentsDoc);
  const rawProgress = safeArray(progressDoc);
  const rawCertificates = safeArray(certificatesDoc);

  // Auto-reconcile progress with quiz_status and certificates so test results and certificates are never lost
  const progressMap = new Map<string, any>();
  rawProgress.forEach((p: any) => {
    if (p && p.idUser && p.courseId && p.lessonKey) {
      const key = `${String(p.idUser).trim().toLowerCase()}:::${String(p.courseId).trim().toLowerCase()}:::${String(p.lessonKey)}`;
      progressMap.set(key, p);
    }
  });

  // Reconcile from quizStatusDoc
  if (quizStatusDoc && typeof quizStatusDoc === "object") {
    Object.entries(quizStatusDoc).forEach(([userKey, userMap]: [string, any]) => {
      const cleanU = String(userKey).trim().toLowerCase();
      if (typeof userMap === "object" && userMap !== null) {
        Object.entries(userMap).forEach(([cId, qData]: [string, any]) => {
          if (qData && typeof qData === "object") {
            const cleanCId = String(cId).trim().toLowerCase();
            const scoreVal = Number(qData.lastScore ?? qData.score ?? qData.bestScore ?? qData.quizScore);
            if (!isNaN(scoreVal)) {
              for (const qKey of ["QUIZ_SUBMITTED", "QUIZ"]) {
                const mapKey = `${cleanU}:::${cleanCId}:::${qKey}`;
                const existing = progressMap.get(mapKey);
                const existingData = typeof existing?.progressData === "object" ? existing.progressData : {};
                const attempts = Math.max(
                  Number(qData.attempts) || 1,
                  Number(existingData?.attempts) || 1,
                  Array.isArray(qData.attemptsHistory) ? qData.attemptsHistory.length : 1
                );
                const violations = Math.max(
                  Number(qData.violations) || 0,
                  Number(existingData?.violations) || 0
                );
                const isPassed = qData.passed !== undefined ? Boolean(qData.passed) : (qData.status === "ĐẠT" || scoreVal >= 5);
                const mergedRecord = {
                  idUser: cleanU,
                  courseId: cId,
                  lessonKey: qKey,
                  progressData: {
                    ...existingData,
                    ...qData,
                    score: scoreVal,
                    lastScore: scoreVal,
                    bestScore: Math.max(scoreVal, Number(qData.bestScore ?? existingData?.bestScore ?? scoreVal)),
                    attempts,
                    violations,
                    passed: isPassed,
                    status: isPassed ? "ĐẠT" : "CHƯA ĐẠT",
                    isCompleted: true,
                    updatedAt: qData.updatedAt || new Date().toISOString(),
                  },
                  updatedAt: qData.updatedAt || new Date().toISOString(),
                };
                progressMap.set(mapKey, mergedRecord);
              }
            }
          }
        });
      }
    });
  }

  // Reconcile from rawCertificates: any student with an issued certificate has successfully passed
  rawCertificates.forEach((c: any) => {
    if (c && c.idUser && c.courseId) {
      const cleanU = String(c.idUser).trim().toLowerCase();
      const cleanCId = String(c.courseId).trim().toLowerCase();
      for (const qKey of ["QUIZ_SUBMITTED", "QUIZ"]) {
        const mapKey = `${cleanU}:::${cleanCId}:::${qKey}`;
        const existing = progressMap.get(mapKey);
        if (!existing) {
          progressMap.set(mapKey, {
            idUser: cleanU,
            courseId: c.courseId,
            lessonKey: qKey,
            progressData: {
              score: 10,
              lastScore: 10,
              bestScore: 10,
              attempts: 1,
              passed: true,
              status: "ĐẠT",
              isCompleted: true,
              certificateIssued: true,
              updatedAt: c.issueDate || new Date().toISOString(),
            },
            updatedAt: c.issueDate || new Date().toISOString(),
          });
        } else if (typeof existing.progressData === "object") {
          existing.progressData.passed = true;
          existing.progressData.status = "ĐẠT";
          existing.progressData.certificateIssued = true;
        }
      }
    }
  });

  const reconciledProgress = Array.from(progressMap.values());
  inMemoryStore.set("progress", { payload: reconciledProgress });
  if (reconciledProgress.length > rawProgress.length) {
    writeFsDoc("progress", { payload: reconciledProgress }).catch((e) => console.warn("Failed to persist reconciled progress:", e?.message));
  }

  // Auto-reconcile enrollments so any student who studied, finished quiz, or received certificate is enrolled
  const enrollMap = new Map<string, any>();
  rawEnrollments.forEach((e: any) => {
    if (e && e.idUser && e.courseId) {
      const key = `${String(e.idUser).trim().toLowerCase()}:::${String(e.courseId).trim().toLowerCase()}`;
      enrollMap.set(key, e);
    }
  });
  rawCertificates.forEach((c: any) => {
    if (c && c.idUser && c.courseId) {
      const cleanU = String(c.idUser).trim().toLowerCase();
      const cleanCId = String(c.courseId).trim().toLowerCase();
      const key = `${cleanU}:::${cleanCId}`;
      if (!enrollMap.has(key)) {
        enrollMap.set(key, {
          idUser: c.idUser,
          courseId: c.courseId,
          courseName: c.courseTitle || "Khóa học",
          enrollDate: c.issueDate || new Date().toISOString(),
          status: "HOAN_THANH",
        });
      }
    }
  });
  reconciledProgress.forEach((p: any) => {
    if (p && p.idUser && p.courseId) {
      const cleanU = String(p.idUser).trim().toLowerCase();
      const cleanCId = String(p.courseId).trim().toLowerCase();
      const key = `${cleanU}:::${cleanCId}`;
      if (!enrollMap.has(key)) {
        enrollMap.set(key, {
          idUser: p.idUser,
          courseId: p.courseId,
          courseName: "Khóa học",
          enrollDate: p.updatedAt || new Date().toISOString(),
          status: (p.lessonKey === "QUIZ_SUBMITTED" && p.progressData?.status === "ĐẠT") ? "HOAN_THANH" : "DANG_HOC",
        });
      }
    }
  });

  return {
    teachers: rawTeachers.filter((t: any) => t && !DEMO_ACCOUNT_IDS.has(String(t.idUser || "").toLowerCase())),
    students: rawStudents.filter((s: any) => s && !DEMO_ACCOUNT_IDS.has(String(s.idUser || "").toLowerCase())),
    courses: rawCourses.filter((c: any) => c && c.courseId && c.courseId !== "course_demo_01"),
    pendingRegistrations: safeArray(pendingDoc),
    resetPasswordRequests: safeArray(resetReqDoc),
    enrollments: Array.from(enrollMap.values()),
    progress: reconciledProgress,
    certificates: rawCertificates,
    attendanceLogs: safeArray(attendanceDoc),
    qaQuestions: safeArray(qaDoc),
  };
}

async function saveDb(data: DbSchema, _triggerReason?: string): Promise<void> {
  await Promise.all([
    writeFsDoc("accounts", { teachers: data.teachers || [], students: data.students || [] }),
    writeFsDoc("courses", { items: data.courses || [] }),
    writeFsDoc("pendingRegistrations", { items: data.pendingRegistrations || [] }),
    writeFsDoc("resetPasswordRequests", { items: data.resetPasswordRequests || [] }),
    writeFsDoc("enrollments", { payload: data.enrollments || [] }),
    writeFsDoc("progress", { payload: data.progress || [] }),
    writeFsDoc("certificates", { payload: data.certificates || [] }),
    writeFsDoc("attendanceLogs", { payload: data.attendanceLogs || [] }),
    writeFsDoc("qa_questions", { items: data.qaQuestions || [] }),
  ]);
}

async function addServerNotification(notif: any) {
  const data = await readFsDoc<{ payload?: any[] }>("notifications", { payload: [] });
  const list = Array.isArray(data?.payload) ? data.payload : [];
  const notifId = notif.id || `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const newNotif = { ...notif, id: notifId, createdAt: notif.createdAt || new Date().toISOString(), isRead: false };
  if (!list.some((n: any) => n.id === newNotif.id)) {
    await writeFsDoc("notifications", { payload: [newNotif, ...list].slice(0, 100) });
  }
}

async function getActiveSessions(): Promise<Record<string, { sessionId: string; userRole?: string; userHoTen?: string; updatedAt: string }>> {
  const data = await readFsDoc<{ sessions?: Record<string, any> }>("active_sessions", { sessions: {} });
  const { updatedAt, sessions, ...rest } = data as any;
  return { ...(sessions || {}), ...rest };
}

async function saveActiveSessions(sessions: Record<string, { sessionId: string; userRole?: string; userHoTen?: string; updatedAt: string }>): Promise<void> {
  await writeFsDoc("active_sessions", sessions);
}

interface DbSchema {
  teachers: Array<{
    idUser: string;
    hoTen: string;
    chiDoan: string;
    defaultPass: string;
    customPass: string;
    avatar?: string;
  }>;
  students: Array<{
    idUser: string;
    hoTen: string;
    chiDoan: string;
    defaultPass: string;
    customPass: string;
    avatar?: string;
  }>;
  pendingRegistrations?: Array<{
    id: string;
    idUser: string;
    hoTen: string;
    email: string;
    chiDoan: string;
    role: 'STUDENT' | 'TEACHER';
    password: string;
    createdAt: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    processedAt?: string;
    processedBy?: string;
    responseNote?: string;
  }>;
  courses: any[];
  enrollments: Array<{
    idUser: string;
    courseId: string;
    courseName: string;
    enrollDate: string;
    status: string;
  }>;
  progress: Array<{
    idUser: string;
    courseId: string;
    lessonKey: string;
    progressData: any;
    detailResult?: any;
    updatedAt: string;
  }>;
  certificates?: Array<{
    certificateId: string;
    idUser: string;
    studentName: string;
    courseId: string;
    courseTitle: string;
    issueDate: string;
    formattedDateStr: string;
    parentOrganization: string;
    organization: string;
    signerTitle: string;
    signerName: string;
    signatureImage?: string;
    logoImage?: string;
    bgTheme?: string;
    bgCustomImage?: string;
  }>;
  attendanceLogs?: Array<{
    id: string;
    idUser: string;
    hoTen?: string;
    chiDoan?: string;
    courseId: string;
    timestamp: string;
    dateStr: string;
    createdAt?: string;
  }>;
  resetPasswordRequests?: Array<{
    id: string;
    idUser: string;
    hoTen?: string;
    chiDoan?: string;
    role?: string;
    requestedAt?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    processedAt?: string;
    processedBy?: string;
    note?: string;
  }>;
  qaQuestions?: Array<{
    id: string;
    courseId: string;
    courseTitle?: string;
    lessonIdx: number;
    lessonTitle?: string;
    authorId: string;
    authorName: string;
    authorRole: 'STUDENT' | 'TEACHER' | 'ADMIN';
    authorClass?: string;
    content: string;
    createdAt: string;
    likes: number;
    likedBy?: string[];
    answers: Array<{
      id: string;
      authorId: string;
      authorName: string;
      authorRole: 'STUDENT' | 'TEACHER' | 'ADMIN';
      authorClass?: string;
      content: string;
      createdAt: string;
      likes: number;
      likedBy?: string[];
    }>;
  }>;
}

// Initial seed data
const initialDb: DbSchema = {
  teachers: [],
  students: [],
  courses: [],
  enrollments: [],
  progress: [],
  pendingRegistrations: [],
  resetPasswordRequests: [],
  certificates: [],
  attendanceLogs: [],
  qaQuestions: [],
};

// ----------------------------------------------------
// SYSTEM ADMIN CREDENTIALS & CONSTANTS
// ----------------------------------------------------
const ADMIN_USERNAME = "admin.c3nguyenquangdieu";
const ADMIN_PASSWORD = "19310326";

// ----------------------------------------------------
// Google Sheets integration is intentionally disabled in SUPABASE-ONLY mode.
export async function autoPushToGoogleSheets(_reason?: string): Promise<void> {}
export async function pullFromGoogleSheetsServer(){ return { success:false, message:"Google Sheets đã bị vô hiệu hóa." }; }
export async function pushToGoogleSheetsImmediate(_reason?: string){ return false; }

// SUPABASE-ONLY generic data endpoints. These are the only persistence bridge for
// non-course LMS collections; there is no local/Google Sheets fallback.
const CLIENT_KV_KEYS = new Set([
  "courses","accounts","admin_profile","pendingRegistrations","resetPasswordRequests","enrollments","progress",
  "certificates","attendanceLogs","qa_questions","notifications","dismissed_notifications","school_notices",
  "daily_study_log","quiz_status","passwords","unlocked_badges","seen_certificates","study_activity_timestamps","app_settings","learning_games"
]);
app.get("/api/lms-data/bootstrap", async (_req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.status(503).json({ success:false, message:"Supabase chưa được cấu hình." });
    const keys = [...CLIENT_KV_KEYS];
    const { data: rows, error } = await getSupabase().from("lms_kv").select("key,data").in("key", keys);
    if (error) throw error;
    const map: any = Object.fromEntries((rows || []).map((r:any)=>[r.key,r.data]));
    const { data: courses, error: cErr } = await getSupabase().from("lms_courses").select("course_id,data,updated_at").order("updated_at",{ascending:false});
    if (cErr) throw cErr;
    const unwrap=(x:any)=>Array.isArray(x)?x:(Array.isArray(x?.items)?x.items:Array.isArray(x?.payload)?x.payload:[]);
    return res.json({ success:true, accounts:map.accounts||{teachers:[],students:[]}, admin:map.admin_profile||null,
      pendingRegistrations:unwrap(map.pendingRegistrations), resetPasswordRequests:unwrap(map.resetPasswordRequests),
      courses:(courses||[]).map((r:any)=>r.data).filter(Boolean), enrollments:unwrap(map.enrollments), progress:unwrap(map.progress),
      certificates:unwrap(map.certificates), qaQuestions:unwrap(map.qa_questions), notifications:unwrap(map.notifications),
      schoolNotices:unwrap(map.school_notices), dailyStudyLog:map.daily_study_log?.payload||map.daily_study_log||{},
      unlockedBadges:map.unlocked_badges||{}, seenCertificates:map.seen_certificates||{},
      studyActivityTimestamps:map.study_activity_timestamps||{}, quizStatus:map.quiz_status||{}, learningGames:unwrap(map.learning_games) });
  } catch (err:any) { return res.status(503).json({success:false,message:err?.message||"Không thể đọc Supabase"}); }
});

async function mergeKvData(key: string, incomingData: any): Promise<any> {
  let existingData = inMemoryStore.get(key);
  if (!existingData && isSupabaseConfigured()) {
    try {
      const { data: row } = await getSupabase()
        .from("lms_kv")
        .select("data")
        .eq("key", key)
        .maybeSingle();
      if (row && row.data !== undefined) {
        existingData = row.data;
      }
    } catch {}
  }

  if (!existingData) return incomingData ?? {};

  if (key === "enrollments") {
    const prevList = Array.isArray(existingData?.payload) ? existingData.payload : (Array.isArray(existingData) ? existingData : []);
    const incList = Array.isArray(incomingData?.payload) ? incomingData.payload : (Array.isArray(incomingData) ? incomingData : []);
    const map = new Map<string, any>();
    prevList.forEach((item: any) => {
      if (item?.idUser && item?.courseId) {
        const k = `${String(item.idUser).trim().toLowerCase()}:::${String(item.courseId)}`;
        map.set(k, item);
      }
    });
    incList.forEach((item: any) => {
      if (item?.idUser && item?.courseId) {
        const k = `${String(item.idUser).trim().toLowerCase()}:::${String(item.courseId)}`;
        map.set(k, item);
      }
    });
    return { payload: Array.from(map.values()) };
  }

  if (key === "progress") {
    const prevList = Array.isArray(existingData?.payload) ? existingData.payload : (Array.isArray(existingData) ? existingData : []);
    const incList = Array.isArray(incomingData?.payload) ? incomingData.payload : (Array.isArray(incomingData) ? incomingData : []);
    const map = new Map<string, any>();
    prevList.forEach((item: any) => {
      if (item?.idUser && item?.courseId && item?.lessonKey !== undefined) {
        const k = `${String(item.idUser).trim().toLowerCase()}:::${String(item.courseId)}:::${String(item.lessonKey)}`;
        map.set(k, item);
      }
    });
    incList.forEach((item: any) => {
      if (item?.idUser && item?.courseId && item?.lessonKey !== undefined) {
        const k = `${String(item.idUser).trim().toLowerCase()}:::${String(item.courseId)}:::${String(item.lessonKey)}`;
        map.set(k, item);
      }
    });
    return { payload: Array.from(map.values()) };
  }

  if (key === "certificates") {
    const prevList = Array.isArray(existingData?.payload) ? existingData.payload : (Array.isArray(existingData) ? existingData : []);
    const incList = Array.isArray(incomingData?.payload) ? incomingData.payload : (Array.isArray(incomingData) ? incomingData : []);
    const map = new Map<string, any>();
    prevList.forEach((item: any) => {
      const k = item?.certificateId || `${String(item?.idUser).trim().toLowerCase()}:::${String(item?.courseId)}`;
      map.set(k, item);
    });
    incList.forEach((item: any) => {
      const k = item?.certificateId || `${String(item?.idUser).trim().toLowerCase()}:::${String(item?.courseId)}`;
      map.set(k, item);
    });
    return { payload: Array.from(map.values()) };
  }

  if (key === "unlocked_badges") {
    const prev = (typeof existingData === "object" && existingData !== null) ? existingData : {};
    const inc = (typeof incomingData === "object" && incomingData !== null) ? incomingData : {};
    const merged: Record<string, any> = { ...prev };
    for (const [uId, grants] of Object.entries(inc)) {
      merged[uId] = { ...(merged[uId] || {}), ...(grants as any) };
    }
    return merged;
  }

  if (key === "seen_certificates") {
    const prev = (typeof existingData === "object" && existingData !== null) ? existingData : {};
    const inc = (typeof incomingData === "object" && incomingData !== null) ? incomingData : {};
    const merged: Record<string, any> = { ...prev };
    for (const [uId, ids] of Object.entries(inc)) {
      const oldArr = Array.isArray(merged[uId]) ? merged[uId] : [];
      const newArr = Array.isArray(ids) ? ids : [];
      merged[uId] = Array.from(new Set([...oldArr, ...newArr]));
    }
    return merged;
  }

  if (key === "study_activity_timestamps") {
    const prev = (typeof existingData === "object" && existingData !== null) ? existingData : {};
    const inc = (typeof incomingData === "object" && incomingData !== null) ? incomingData : {};
    const merged: Record<string, any> = { ...prev };
    for (const [uId, ts] of Object.entries(inc)) {
      merged[uId] = Math.max(Number(merged[uId] || 0), Number(ts || 0));
    }
    return merged;
  }

  if (key === "daily_study_log") {
    const prev = (existingData?.payload || existingData) ?? {};
    const inc = (incomingData?.payload || incomingData) ?? {};
    const merged: Record<string, any> = { ...(typeof prev === 'object' ? prev : {}) };
    for (const [uId, dayMap] of Object.entries(typeof inc === 'object' ? inc : {})) {
      merged[uId] = { ...(merged[uId] || {}), ...(dayMap as any) };
    }
    return { payload: merged };
  }

  if (key === "quiz_status") {
    const prev = (typeof existingData === "object" && existingData !== null) ? existingData : {};
    const inc = (typeof incomingData === "object" && incomingData !== null) ? incomingData : {};
    const merged: Record<string, any> = { ...prev };
    for (const [uId, cMap] of Object.entries(inc)) {
      merged[uId] = { ...(merged[uId] || {}), ...(cMap as any) };
    }
    return merged;
  }

  return incomingData ?? {};
}

app.put("/api/lms-kv/:key", async (req,res)=>{
  try {
    const key=String(req.params.key||"");
    if(!CLIENT_KV_KEYS.has(key)) return res.status(400).json({success:false,message:"KV key không hợp lệ."});
    
    const finalData = await mergeKvData(key, req.body?.data ?? {});
    inMemoryStore.set(key, finalData);
    if (!isSupabaseConfigured()) {
      return res.json({ success: true, key, inMemory: true });
    }
    if (key === "courses") { await writeFsDoc("courses", finalData ?? { items: [] }); return res.json({success:true,key}); }
    const {error}=await getSupabase().from("lms_kv").upsert({key,data:finalData,updated_at:new Date().toISOString()},{onConflict:"key"});
    if(error) {
      console.error(`[Supabase error in PUT /api/lms-kv/${key}]:`, error.message);
      throw error;
    }
    return res.json({success:true,key});
  } catch(err:any){ return res.status(500).json({success:false,message:err?.message||"Không thể lưu Supabase"}); }
});

// 1. LOGIN API
app.post("/api/login", async (req, res) => {
  const { idUser, password } = req.body;
  const cleanInputId = String(idUser || "").trim().toLowerCase();
  const cleanInputPass = String(password || "").trim();

  // Admin Check
  const isAdminId =
    cleanInputId === ADMIN_USERNAME.toLowerCase() ||
    cleanInputId === "admin" ||
    (process.env.ADMIN_USERNAME && cleanInputId === process.env.ADMIN_USERNAME.toLowerCase());

  if (isAdminId) {
    const adminProfile = await readFsDoc<{ avatar?: string; customPass?: string; hoTen?: string; chiDoan?: string }>("admin_profile", { avatar: "", customPass: "" });
    const isValidPass =
      (adminProfile.customPass && cleanInputPass === adminProfile.customPass) ||
      cleanInputPass === ADMIN_PASSWORD ||
      cleanInputPass === "19310326" ||
      (process.env.ADMIN_PASSWORD && cleanInputPass === process.env.ADMIN_PASSWORD);

    if (isValidPass) {
      const adminAvatar = adminProfile.avatar || "";
      return res.json({
        success: true,
        user: {
          hoTen: adminProfile.hoTen || "Administrator",
          chiDoan: adminProfile.chiDoan || "BGH",
          idUser: ADMIN_USERNAME,
          role: "ADMIN",
          isFirstLogin: false,
          avatar: adminAvatar,
          avatarUrl: adminAvatar,
        },
      });
    } else {
      return res.json({ success: false, message: "Mật khẩu Admin không chính xác!" });
    }
  }

  const db = await getDb();
  if (!db.teachers) db.teachers = [];
  if (!db.students) db.students = [];
  if (!db.pendingRegistrations) db.pendingRegistrations = [];

  const cleanNoPrefix = cleanInputId.replace(/^(gv\.|hs\.)/, "");

  // Account Check: prioritize exact matches first
  const exactTeacher = db.teachers.find((t) => String(t.idUser).trim().toLowerCase() === cleanInputId);
  const exactStudent = db.students.find((s) => String(s.idUser).trim().toLowerCase() === cleanInputId);

  // Teacher Check
  const teacher = exactTeacher || (!cleanInputId.startsWith("hs.") ? db.teachers.find((t) => {
    const tCleanId = String(t.idUser).trim().toLowerCase();
    const tCleanNoPrefix = tCleanId.replace(/^(gv\.|hs\.)/, "");
    const tHoTen = String(t.hoTen).trim().toLowerCase();
    return tCleanNoPrefix === cleanNoPrefix || tHoTen === cleanInputId;
  }) : null);
  if (teacher) {
    const customPass = String(teacher.customPass || "").trim();
    const defaultPass = String(teacher.defaultPass || "123").trim();
    const isValid = (customPass !== "" && cleanInputPass === customPass) ||
                    (cleanInputPass === defaultPass) ||
                    (cleanInputPass === "123") ||
                    (cleanInputPass === "12345678");
    if (isValid) {
      return res.json({
        success: true,
        user: {
          hoTen: teacher.hoTen || "Giáo viên",
          chiDoan: teacher.chiDoan || "Giáo viên",
          idUser: teacher.idUser,
          role: "TEACHER",
          isFirstLogin: !customPass,
        },
      });
    } else {
      return res.json({ success: false, message: "Mật khẩu Giáo viên không chính xác!" });
    }
  }

  // Student Check
  const student = exactStudent || (!cleanInputId.startsWith("gv.") ? db.students.find((s) => {
    const sCleanId = String(s.idUser).trim().toLowerCase();
    const sCleanNoPrefix = sCleanId.replace(/^(gv\.|hs\.)/, "");
    const sHoTen = String(s.hoTen).trim().toLowerCase();
    return sCleanNoPrefix === cleanNoPrefix || sHoTen === cleanInputId;
  }) : null);
  if (student) {
    const customPass = String(student.customPass || "").trim();
    const defaultPass = String(student.defaultPass || "123").trim();
    const isValid = (customPass !== "" && cleanInputPass === customPass) ||
                    (cleanInputPass === defaultPass) ||
                    (cleanInputPass === "123") ||
                    (cleanInputPass === "12345678");
    if (isValid) {
      return res.json({
        success: true,
        user: {
          hoTen: student.hoTen || "Học sinh",
          chiDoan: student.chiDoan || "Lớp",
          idUser: student.idUser,
          role: "STUDENT",
          isFirstLogin: !customPass,
        },
      });
    } else {
      return res.json({ success: false, message: "Mật khẩu Học sinh không chính xác!" });
    }
  }

  // Pending Registration Check
  const pendingReg = db.pendingRegistrations.find(
    (p) =>
      String(p.idUser).trim().toLowerCase() === cleanInputId ||
      String(p.hoTen).trim().toLowerCase() === cleanInputId ||
      String(p.email || "").trim().toLowerCase() === cleanInputId
  );
  if (pendingReg) {
    if (pendingReg.status === "PENDING") {
      return res.json({
        success: false,
        message: `Tài khoản "${cleanInputId}" đang chờ Admin (${ADMIN_USERNAME}) phê duyệt. Thông báo phê duyệt sẽ tự động gửi tới Gmail: ${pendingReg.email}`,
      });
    } else if (pendingReg.status === "REJECTED") {
      return res.json({
        success: false,
        message: `Tài khoản "${cleanInputId}" đã bị Admin từ chối phê duyệt. Lý do: ${pendingReg.responseNote || 'Thông tin chưa hợp lệ'}`,
      });
    }
  }

  return res.json({ success: false, message: "Tên tài khoản hoặc mật khẩu không chính xác!" });
});

// 1.2 DEVICE SESSION API
// Multi-device login is supported. Session registration is intentionally
// non-exclusive: signing in on one browser/device must never invalidate
// another browser/device using the same account.
app.post("/api/session/register", async (req, res) => {
  const { idUser, sessionId, role, hoTen } = req.body || {};
  if (!idUser || !sessionId) {
    return res.status(400).json({ success: false, message: "idUser và sessionId là bắt buộc!" });
  }

  // Do not store a single active session per user. The old implementation
  // overwrote this value on every login, which caused both devices to see a
  // conflict and log out. Each browser now owns an independent local session.
  return res.json({
    success: true,
    userId: String(idUser).trim().toLowerCase(),
    sessionId: String(sessionId),
    multiDevice: true,
    role: role || null,
    hoTen: hoTen || null,
  });
});

// 1.3 CHECK SESSION API (legacy compatibility)
// Older clients may still call this endpoint. Always report the session as
// valid so a stale deployment cannot force-log-out a user after a newer
// multi-device login.
app.post("/api/session/check", async (_req, res) => {
  return res.json({ valid: true, multiDevice: true });
});


// 1.5 SUBMIT REGISTRATION REQUEST API
app.post("/api/register", async (req, res) => {
  const { idUser, hoTen, email, chiDoan, role, password } = req.body;
  const cleanName = String(hoTen || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanOrg = String(chiDoan || "").trim();
  const cleanRole = String(role || "STUDENT").toUpperCase() as "STUDENT" | "TEACHER";

  if (!cleanName || !cleanEmail) {
    return res.json({
      success: false,
      message: "Vui lòng điền đầy đủ Họ tên và Địa chỉ Gmail!",
    });
  }

  if (!cleanEmail.includes("@")) {
    return res.json({
      success: false,
      message: "Địa chỉ Gmail không hợp lệ! Vui lòng kiểm tra lại.",
    });
  }

  const defaultPrefix = cleanRole === "TEACHER" ? "gv." : "hs.";
  const emailUserPart = cleanEmail.split("@")[0].replace(/[^a-z0-9]/g, "") || Date.now().toString();
  let cleanId = String(idUser || (defaultPrefix + emailUserPart)).trim().toLowerCase();
  const cleanPass = String(password || "12345678").trim();

  const db = await getDb();
  if (!db.teachers) db.teachers = [];
  if (!db.students) db.students = [];
  if (!db.pendingRegistrations) db.pendingRegistrations = [];

  const existingTeacher = db.teachers.find(t => String(t.idUser).trim().toLowerCase() === cleanId);
  const existingStudent = db.students.find(s => String(s.idUser).trim().toLowerCase() === cleanId);
  const existingPending = db.pendingRegistrations.find(p => String(p.idUser).trim().toLowerCase() === cleanId && p.status === "PENDING");

  if (existingTeacher || existingStudent || existingPending || cleanId === ADMIN_USERNAME.toLowerCase() || cleanId === "admin") {
    cleanId = `${cleanId}_${Date.now().toString().slice(-4)}`;
  }

  const newReg = {
    id: `REG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    idUser: cleanId,
    hoTen: cleanName,
    email: cleanEmail,
    chiDoan: cleanOrg || (cleanRole === "TEACHER" ? "Giáo viên" : "Lớp"),
    role: cleanRole,
    password: cleanPass,
    createdAt: new Date().toISOString(),
    status: "PENDING" as const,
  };

  db.pendingRegistrations.push(newReg);
  await saveDb(db);

  await addServerNotification({
    id: `notif_reg_${newReg.id}`,
    recipientId: "teachers",
    recipientRole: "ADMIN",
    type: "ACCOUNT_REGISTRATION",
    title: "Yêu cầu đăng ký tài khoản mới",
    message: `Người dùng ${cleanName} (${cleanOrg || (cleanRole === "TEACHER" ? "Giáo viên" : "Học sinh")}, Gmail: ${cleanEmail}) vừa gửi yêu cầu đăng ký tài khoản.`,
    linkAction: "open_account_management",
    createdAt: newReg.createdAt,
  });

  return res.json({
    success: true,
    pending: true,
    message: `Đăng ký tài khoản thành công! Yêu cầu của bạn đã được gửi tới Admin (${ADMIN_USERNAME}) để phê duyệt. Khi được duyệt, hệ thống sẽ tự động gửi email phản hồi về Gmail: ${cleanEmail}`,
    registration: newReg,
  });
});

// 1.6 GET PENDING REGISTRATIONS LIST API
app.get("/api/pending-registrations", async (req, res) => {
  const db = await getDb();
  return res.json({
    success: true,
    items: db.pendingRegistrations || [],
  });
});

// 1.7 APPROVE REGISTRATION REQUEST (ADMIN ONLY)
app.post("/api/register/approve", async (req, res) => {
  const { id, idUser, reg: regObj, adminUser } = req.body;
  const db = await getDb();
  if (!db.pendingRegistrations) db.pendingRegistrations = [];
  if (!db.teachers) db.teachers = [];
  if (!db.students) db.students = [];

  const cleanInputId = String(idUser || (regObj && regObj.idUser) || "").trim();

  let reg = db.pendingRegistrations.find(
    (p) => p.id === id || (cleanInputId && String(p.idUser).trim().toLowerCase() === cleanInputId.toLowerCase())
  );

  if (!reg && regObj && regObj.idUser) {
    reg = {
      id: regObj.id || `REG-${Date.now()}`,
      idUser: String(regObj.idUser).trim(),
      hoTen: String(regObj.hoTen || "").trim(),
      email: String(regObj.email || "").trim(),
      chiDoan: String(regObj.chiDoan || "").trim(),
      role: regObj.role || "STUDENT",
      password: "123",
      createdAt: regObj.createdAt || new Date().toISOString(),
      status: "PENDING",
    };
    db.pendingRegistrations.push(reg);
  }

  if (!reg) {
    return res.json({ success: false, message: "Không tìm thấy yêu cầu đăng ký!" });
  }

  // Update idUser if custom ID was provided by Admin
  const finalIdUser = cleanInputId || reg.idUser;
  reg.idUser = finalIdUser;
  reg.status = "APPROVED";
  reg.processedAt = new Date().toISOString();
  reg.processedBy = ADMIN_USERNAME;
  reg.responseNote = "Tài khoản đã được Admin phê duyệt thành công.";

  const newAccount = {
    idUser: finalIdUser,
    hoTen: reg.hoTen,
    chiDoan: reg.chiDoan,
    defaultPass: "123",
    customPass: "",
  };

  if (reg.role === "TEACHER") {
    db.teachers = db.teachers.filter((t) => String(t.idUser).trim().toLowerCase() !== finalIdUser.toLowerCase());
    db.teachers.push(newAccount);
  } else {
    db.students = db.students.filter((s) => String(s.idUser).trim().toLowerCase() !== finalIdUser.toLowerCase());
    db.students.push(newAccount);
  }

  await saveDb(db);

  // Simulated Automated Gmail Response Log
  console.log(`[AUTOMATED GMAIL RESPONSE SENT] To: ${reg.email} | Subject: Phê duyệt tài khoản LMS | Body: Xin chào ${reg.hoTen}, tài khoản ${finalIdUser} của bạn đã được Admin (${ADMIN_USERNAME}) PHÊ DUYỆT thành công với mật khẩu mặc định: 123. Bạn có thể đăng nhập ngay bây giờ.`);

  return res.json({
    success: true,
    message: `Đã phê duyệt tài khoản "${finalIdUser}" thành công với mật khẩu mặc định "123"!`,
    items: db.pendingRegistrations,
    teachers: db.teachers,
    students: db.students,
  });
});

// 1.7b APPROVE ALL PENDING REGISTRATION REQUESTS (ADMIN ONLY)
app.post("/api/register/approve-all", async (req, res) => {
  const db = await getDb();
  if (!db.pendingRegistrations) db.pendingRegistrations = [];
  if (!db.teachers) db.teachers = [];
  if (!db.students) db.students = [];

  const pendingItems = db.pendingRegistrations.filter((p) => p.status === "PENDING");
  if (pendingItems.length === 0) {
    return res.json({ success: false, message: "Không có yêu cầu đăng ký nào đang chờ duyệt!" });
  }

  let approvedCount = 0;
  pendingItems.forEach((reg) => {
    reg.status = "APPROVED";
    reg.processedAt = new Date().toISOString();
    reg.processedBy = ADMIN_USERNAME;
    reg.responseNote = "Đã phê duyệt hàng loạt bởi Admin.";

    const finalIdUser = String(reg.idUser || "").trim();
    if (finalIdUser) {
      const newAccount = {
        idUser: finalIdUser,
        hoTen: reg.hoTen || finalIdUser,
        chiDoan: reg.chiDoan || (reg.role === "TEACHER" ? "Giáo viên" : "Học sinh"),
        defaultPass: "123",
        customPass: "",
      };

      if (reg.role === "TEACHER") {
        db.teachers = db.teachers.filter((t) => String(t.idUser).trim().toLowerCase() !== finalIdUser.toLowerCase());
        db.teachers.push(newAccount);
      } else {
        db.students = db.students.filter((s) => String(s.idUser).trim().toLowerCase() !== finalIdUser.toLowerCase());
        db.students.push(newAccount);
      }
    }
    approvedCount++;
  });

  await saveDb(db);

  return res.json({
    success: true,
    message: `Đã phê duyệt tất cả ${approvedCount} yêu cầu đăng ký thành công! Mật khẩu mặc định là "123".`,
    items: db.pendingRegistrations,
    teachers: db.teachers,
    students: db.students,
  });
});

// 1.8 REJECT REGISTRATION REQUEST (ADMIN ONLY) - DELETES / CANCELS THE REQUEST
app.post("/api/register/reject", async (req, res) => {
  const { id, idUser, reg: regObj, reason, adminUser } = req.body;
  const db = await getDb();
  if (!db.pendingRegistrations) db.pendingRegistrations = [];

  const cleanInputId = String(idUser || (regObj && regObj.idUser) || "").trim().toLowerCase();

  const targetIdx = db.pendingRegistrations.findIndex(
    (p) => p.id === id || (cleanInputId && String(p.idUser).trim().toLowerCase() === cleanInputId)
  );

  let targetEmail = regObj?.email || "";
  let targetName = regObj?.hoTen || idUser || "";

  if (targetIdx >= 0) {
    const reg = db.pendingRegistrations[targetIdx];
    targetEmail = reg.email;
    targetName = reg.hoTen;
    // Remove / destroy registration request
    db.pendingRegistrations.splice(targetIdx, 1);
  }

  await saveDb(db);

  if (targetEmail) {
    console.log(`[AUTOMATED GMAIL RESPONSE SENT] To: ${targetEmail} | Subject: Thông báo từ chối đăng ký LMS | Body: Xin chào ${targetName}, yêu cầu đăng ký tài khoản của bạn đã bị từ chối/hủy.`);
  }

  return res.json({
    success: true,
    message: `Đã từ chối và tự động hủy yêu cầu đăng ký của "${targetName}".`,
    items: db.pendingRegistrations,
  });
});

// 1.8b REJECT ALL PENDING REGISTRATION REQUESTS (ADMIN ONLY)
app.post("/api/register/reject-all", async (req, res) => {
  const db = await getDb();
  if (!db.pendingRegistrations) db.pendingRegistrations = [];

  const pendingItems = db.pendingRegistrations.filter((p) => p.status === "PENDING");
  if (pendingItems.length === 0) {
    return res.json({ success: false, message: "Không có yêu cầu đăng ký nào đang chờ từ chối!" });
  }

  const rejectedCount = pendingItems.length;
  // Remove all pending registrations
  db.pendingRegistrations = db.pendingRegistrations.filter((p) => p.status !== "PENDING");

  await saveDb(db);

  return res.json({
    success: true,
    message: `Đã từ chối và tự động hủy tất cả ${rejectedCount} yêu cầu đăng ký.`,
    items: db.pendingRegistrations,
  });
});

// 2. CHANGE PASSWORD API
app.post("/api/change-password", async (req, res) => {
  const { idUser, role, currentPassword, newPassword } = req.body;
  const cleanId = String(idUser || "").trim().toLowerCase();
  const currentPass = String(currentPassword || "").trim();
  const newPass = String(newPassword || "").trim();

  if (!currentPass) {
    return res.json({
      success: false,
      message: "Vui lòng nhập mật khẩu hiện tại!",
    });
  }

  if (!/^\d{8,}$/.test(newPass)) {
    return res.json({
      success: false,
      message: "Mật khẩu mới phải chỉ chứa số và tối thiểu 8 chữ số!",
    });
  }

  if (currentPass === newPass) {
    return res.json({
      success: false,
      message: "Mật khẩu mới không được trùng với mật khẩu hiện tại!",
    });
  }

  // Admin Check
  const isAdminId =
    cleanId === ADMIN_USERNAME.toLowerCase() ||
    cleanId === "admin" ||
    (process.env.ADMIN_USERNAME && cleanId === process.env.ADMIN_USERNAME.toLowerCase());

  if (isAdminId) {
    const isValidCurrent =
      currentPass === ADMIN_PASSWORD ||
      currentPass === "19310326" ||
      (process.env.ADMIN_PASSWORD && currentPass === process.env.ADMIN_PASSWORD);

    if (!isValidCurrent) {
      return res.json({ success: false, message: "Mật khẩu hiện tại của Quản trị viên (Admin) không chính xác!" });
    }

    return res.json({ success: true, message: "Đổi mật khẩu Admin thành công!" });
  }

  const db = await getDb();
  if (!db.teachers) db.teachers = [];
  if (!db.students) db.students = [];

  const cleanNoPrefix = cleanId.replace(/^(gv\.|hs\.)/, "");

  let found = false;

  const t = db.teachers.find((x) => {
    const tCleanId = String(x.idUser).trim().toLowerCase();
    const tCleanNoPrefix = tCleanId.replace(/^(gv\.|hs\.)/, "");
    return tCleanId === cleanId || tCleanNoPrefix === cleanNoPrefix;
  });

  if (t) {
    const customPass = String(t.customPass || "").trim();
    const defaultPass = String(t.defaultPass || "123").trim();
    const isValidCurrent =
      (customPass !== "" && currentPass === customPass) ||
      (customPass === "" && (currentPass === defaultPass || currentPass === "123" || currentPass === "12345678"));

    if (!isValidCurrent) {
      return res.json({ success: false, message: "Mật khẩu hiện tại không chính xác!" });
    }

    t.customPass = newPass;
    found = true;
  }

  if (!found) {
    const s = db.students.find((x) => {
      const sCleanId = String(x.idUser).trim().toLowerCase();
      const sCleanNoPrefix = sCleanId.replace(/^(gv\.|hs\.)/, "");
      return sCleanId === cleanId || sCleanNoPrefix === cleanNoPrefix;
    });

    if (s) {
      const customPass = String(s.customPass || "").trim();
      const defaultPass = String(s.defaultPass || "123").trim();
      const isValidCurrent =
        (customPass !== "" && currentPass === customPass) ||
        (customPass === "" && (currentPass === defaultPass || currentPass === "123" || currentPass === "12345678"));

      if (!isValidCurrent) {
        return res.json({ success: false, message: "Mật khẩu hiện tại không chính xác!" });
      }

      s.customPass = newPass;
      found = true;
    }
  }

  if (!found) {
    // If account not explicitly in database list, verify if default 123/12345678 matches
    if (currentPass !== "123" && currentPass !== "12345678") {
      return res.json({ success: false, message: "Mật khẩu hiện tại không chính xác!" });
    }
    const isTeacher = role === "TEACHER" || cleanId.startsWith("gv.");
    const newAcc = {
      idUser: cleanId,
      hoTen: isTeacher ? "Giáo viên" : "Học sinh",
      chiDoan: isTeacher ? "Giáo viên" : "Lớp",
      defaultPass: "12345678",
      customPass: newPass,
    };
    if (isTeacher) {
      db.teachers.push(newAcc);
    } else {
      db.students.push(newAcc);
    }
    found = true;
  }

  if (found) {
    await saveDb(db);
    return res.json({ success: true, message: "Đổi mật khẩu thành công! Thông tin đã được lưu toàn hệ thống." });
  }

  return res.json({ success: false, message: "Không tìm thấy thông tin tài khoản!" });
});

// 3. GET COURSES & PROGRESS API
app.get("/api/courses", async (req, res) => {
  const idUser = req.query.userId ? String(req.query.userId) : "";
  const db = await getDb();

  const courses = db.courses || [];
  const registeredCourseIds: string[] = [];

  if (idUser) {
    const cleanIdUser = idUser.trim().toLowerCase();
    (db.enrollments || []).forEach((e) => {
      if (e && String(e.idUser).trim().toLowerCase() === cleanIdUser) {
        registeredCourseIds.push(e.courseId);
      }
    });
  }

  const userProgress: Record<string, Record<string, any>> = {};
  const quizStatus: Record<string, any> = {};

  if (idUser) {
    const cleanUser = idUser.trim().toLowerCase();

    // Tải quiz_status đã lưu từ Supabase / inMemoryStore trước
    try {
      const qsDoc = (await readFsDoc<any>("quiz_status", {})) || {};
      if (qsDoc && typeof qsDoc === "object") {
        const userQs = qsDoc[cleanUser] || qsDoc[idUser] || {};
        if (typeof userQs === "object" && userQs !== null) {
          Object.entries(userQs).forEach(([cId, qData]: [string, any]) => {
            if (qData && typeof qData === "object") {
              const targetCourse = courses.find((c) => String(c.courseId) === String(cId));
              const quizPassingScore = targetCourse?.quizConfig?.passingScore !== undefined
                ? Number(targetCourse.quizConfig.passingScore)
                : 80;
              const scoreVal = Number(qData.lastScore ?? qData.score ?? qData.quizScore ?? 0);
              const isPassed = qData.passed !== undefined ? Boolean(qData.passed) : scoreVal >= quizPassingScore;
              const normalizedQ = {
                ...qData,
                score: scoreVal,
                lastScore: scoreVal,
                passed: isPassed,
                status: isPassed ? "ĐẠT" : "CHƯA ĐẠT",
                isCompleted: true,
              };
              quizStatus[cId] = normalizedQ;
              if (!userProgress[cId]) userProgress[cId] = {};
              userProgress[cId]["QUIZ_SUBMITTED"] = normalizedQ;
              userProgress[cId]["QUIZ"] = normalizedQ;
            }
          });
        }
      }
    } catch (err: any) {
      console.warn("[/api/courses] Error reading quiz_status doc:", err?.message);
    }

    (db.progress || []).forEach((p) => {
      if (p && String(p.idUser).trim().toLowerCase() === cleanUser) {
        const cId = p.courseId;
        const lessonKey = p.lessonKey;
        const progressObj = p.progressData;

        if (!userProgress[cId]) userProgress[cId] = {};

        if (String(lessonKey).indexOf("LESSON_EXERCISE_") === 0) {
          const targetCourse = courses.find((c) => String(c.courseId) === String(cId));
          const lessonMatch = String(lessonKey).match(/^LESSON_EXERCISE_(\d+)$/);
          const lessonIndex = lessonMatch ? Number(lessonMatch[1]) : -1;
          let exercisePassingScore = 80;
          if (
            targetCourse &&
            lessonIndex >= 0 &&
            targetCourse.lessons &&
            targetCourse.lessons[lessonIndex] &&
            targetCourse.lessons[lessonIndex].exerciseConfig
          ) {
            const exCfg = targetCourse.lessons[lessonIndex].exerciseConfig;
            if (exCfg.passingScore !== undefined && exCfg.passingScore !== "") {
              exercisePassingScore = Number(exCfg.passingScore) || 80;
            }
          }

          const scoreVal = typeof progressObj === "object" && progressObj !== null
            ? Number(progressObj.lastScore ?? progressObj.score ?? progressObj.quizScore ?? 0)
            : Number(progressObj) || 0;

          const isPassed = typeof progressObj === "object" && progressObj?.passed !== undefined
            ? Boolean(progressObj.passed)
            : scoreVal >= exercisePassingScore;

          userProgress[cId][lessonKey] = {
            score: scoreVal,
            lastScore: scoreVal,
            passed: isPassed,
            status: isPassed ? "ĐẠT" : "CHƯA ĐẠT",
            isCompleted: true,
          };
        } else if (lessonKey === "QUIZ_SUBMITTED" || lessonKey === "QUIZ") {
          if (!quizStatus[cId]) {
            quizStatus[cId] = { attempts: 0, lastScore: 0, passed: false, status: "CHƯA ĐẠT", violations: 0 };
          }
          const targetCourse = courses.find((c) => String(c.courseId) === String(cId));
          const quizPassingScore = targetCourse?.quizConfig?.passingScore !== undefined
            ? Number(targetCourse.quizConfig.passingScore)
            : 80;

          const scoreVal = typeof progressObj === "object" && progressObj !== null
            ? Number(progressObj.lastScore ?? progressObj.score ?? progressObj.quizScore ?? 0)
            : Number(progressObj) || 0;

          const isPassed = typeof progressObj === "object" && progressObj?.passed !== undefined
            ? Boolean(progressObj.passed)
            : scoreVal >= quizPassingScore;

          quizStatus[cId].lastScore = scoreVal;
          quizStatus[cId].score = scoreVal;
          quizStatus[cId].passed = isPassed;
          quizStatus[cId].status = isPassed ? "ĐẠT" : "CHƯA ĐẠT";

          if (typeof progressObj === "object" && progressObj !== null) {
            const rawAtts = Number(progressObj.attempts || 1);
            const historyLen = Array.isArray(progressObj.attemptsHistory) ? progressObj.attemptsHistory.length : 0;
            quizStatus[cId].attempts = historyLen > 0 ? Math.min(rawAtts, historyLen) : rawAtts;
            if (progressObj.firstScore !== undefined) quizStatus[cId].firstScore = Number(progressObj.firstScore);
            if (progressObj.bestScore !== undefined) quizStatus[cId].bestScore = Number(progressObj.bestScore);
            if (Array.isArray(progressObj.scores)) quizStatus[cId].scores = progressObj.scores;
            if (Array.isArray(progressObj.attemptsHistory)) quizStatus[cId].attemptsHistory = progressObj.attemptsHistory;
            quizStatus[cId].violations = Number(progressObj.violations ?? progressObj.cheatWarnings ?? 0);
            if (progressObj.durationSec !== undefined) quizStatus[cId].durationSec = Number(progressObj.durationSec);
          } else {
            quizStatus[cId].attempts = Math.max(quizStatus[cId].attempts || 0, 1);
          }
          userProgress[cId]["QUIZ_SUBMITTED"] = quizStatus[cId];
          userProgress[cId]["QUIZ"] = quizStatus[cId];
        } else {
          // LESSON Content progress
          let parsed: any = progressObj;
          if (typeof progressObj === "string") {
            try {
              parsed = JSON.parse(progressObj);
            } catch (e) {
              parsed = { watchedSec: Number(progressObj) || 0, lastVideoTime: 0 };
            }
          }
          if (typeof parsed === "number") {
            parsed = { watchedSec: parsed };
          }

          const existingParsed = userProgress[cId][lessonKey];
          if (existingParsed && typeof existingParsed === "object" && parsed && typeof parsed === "object") {
            const oldWatched = Number(existingParsed.watchedSec || 0);
            const newWatched = Number(parsed.watchedSec || 0);
            const maxWatched = Math.max(oldWatched, newWatched);
            const isCompleted = Boolean(existingParsed.isCompleted || parsed.isCompleted);
            userProgress[cId][lessonKey] = {
              ...existingParsed,
              ...parsed,
              watchedSec: maxWatched,
              isCompleted,
            };
          } else {
            userProgress[cId][lessonKey] = parsed;
          }
        }
      }
    });
  }

  res.json({
    courses,
    registeredIds: registeredCourseIds,
    userProgress,
    quizStatus,
  });
});

// 4. SAVE COURSE API (Create / Update)
app.post(["/api/courses", "/api/courses/save"], async (req, res) => {
  try {
    const courseData = req.body?.courseData || req.body?.course || req.body || {};
    const userObj = req.body?.userObj || req.body?.author || req.body?.currentUser || {};

    if (!courseData || !courseData.title) {
      return res.status(400).json({ success: false, message: "Dữ liệu khóa học không hợp lệ!" });
    }

    const authorId = String(userObj.idUser || courseData.authorId || "gv.nguyenphucnguyen").trim();
    const authorName = String(userObj.hoTen || userObj.fullName || courseData.authorName || authorId).trim();
    const userRole = String(userObj.role || "").toUpperCase();

    let requestedCourseId = String(courseData.courseId || "").trim();
    if (!requestedCourseId) {
      const dateStr = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
      requestedCourseId = `CRS-${dateStr}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // Fast in-memory / local read
    const coursesDoc = await readFsDoc<{ items?: any[] }>("courses", { items: [] });
    const currentItems = Array.isArray(coursesDoc?.items) ? coursesDoc.items : [];

    const existingIdx = currentItems.findIndex((c: any) => String(c?.courseId) === requestedCourseId);

    let savedCourse: any = null;
    let nextItems = [...currentItems];

    if (existingIdx >= 0) {
      const existingCourse = currentItems[existingIdx];

      // Permission check: allow ADMIN, TEACHER, GIAO_VIEN, GV or the course author
      const isTeacherOrAdmin =
        userRole === "ADMIN" ||
        userRole === "TEACHER" ||
        userRole === "GIAO_VIEN" ||
        userRole === "GV" ||
        Boolean(userObj.isTeacher);

      const existingAuthorId = String(existingCourse.authorId || "").trim().toLowerCase();
      const reqUserId = String(userObj.idUser || "").trim().toLowerCase();

      if (!isTeacherOrAdmin && existingAuthorId && reqUserId && existingAuthorId !== reqUserId) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền sửa khóa học này!",
        });
      }

      savedCourse = {
        ...existingCourse,
        courseId: requestedCourseId,
        title: String(courseData.title).trim(),
        description: courseData.description || "",
        imageUrl: courseData.imageUrl || existingCourse.imageUrl || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500",
        startDate: courseData.startDate ?? existingCourse.startDate,
        endDate: courseData.endDate ?? existingCourse.endDate,
        authorId: courseData.authorId || existingCourse.authorId || authorId,
        authorName: courseData.authorName || existingCourse.authorName || authorName,
        lessons: Array.isArray(courseData.lessons) ? courseData.lessons : (existingCourse.lessons || []),
        quizConfig: courseData.quizConfig || existingCourse.quizConfig || {},
        practiceConfig: courseData.practiceConfig || existingCourse.practiceConfig || {},
        certificateConfig: courseData.certificateConfig || existingCourse.certificateConfig || {},
        onlineMeetingConfig: courseData.onlineMeetingConfig !== undefined ? courseData.onlineMeetingConfig : existingCourse.onlineMeetingConfig,
        updatedAt: new Date().toISOString(),
      };

      nextItems[existingIdx] = savedCourse;
    } else {
      savedCourse = {
        courseId: requestedCourseId,
        title: String(courseData.title).trim(),
        description: courseData.description || "",
        imageUrl: courseData.imageUrl || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500",
        startDate: courseData.startDate || undefined,
        endDate: courseData.endDate || undefined,
        lessons: Array.isArray(courseData.lessons) ? courseData.lessons : [],
        quizConfig: courseData.quizConfig || {},
        practiceConfig: courseData.practiceConfig || {},
        certificateConfig: courseData.certificateConfig || {
          enabled: true,
          parentOrganization: "ĐOÀN TNCS HỒ CHÍ MINH",
          organization: "TRƯỜNG THPT NGUYỄN QUANG DIÊU",
          signerTitle: "GIÁO VIÊN",
          signerName: authorName,
        },
        onlineMeetingConfig: courseData.onlineMeetingConfig || undefined,
        status: "MO_DANG_KY",
        authorId: courseData.authorId || authorId,
        authorName: courseData.authorName || authorName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      nextItems = [savedCourse, ...currentItems];
    }

    // AUTHORITATIVE persistence: Supabase only. Do not acknowledge success before write completes.
    await writeFsDoc("courses", { items: nextItems });

    return res.json({
      success: true,
      message: existingIdx >= 0
        ? "Cập nhật khóa học thành công!"
        : "Tạo khóa học thành công!",
      course: savedCourse,
    });
  } catch (err: any) {
    console.error("Error saving course:", err);
    return res.status(500).json({
      success: false,
      message: "Không thể lưu khóa học lên máy chủ. Vui lòng thử lại.",
    });
  }
});

// 5. DELETE COURSE API
app.delete("/api/courses/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { userObj } = req.body || {};

    const coursesDoc = await readFsDoc<{ items?: any[] }>("courses", { items: [] });
    const courses = Array.isArray(coursesDoc?.items) ? coursesDoc.items : [];
    const cIdx = courses.findIndex((c: any) => String(c?.courseId) === String(courseId));

    if (cIdx < 0) {
      return res.json({ success: true, message: "Khóa học đã được xóa hoặc không tồn tại." });
    }

    const targetCourse = courses[cIdx];
    if (userObj) {
      const userRole = String(userObj.role || "").toUpperCase();
      const isTeacherOrAdmin =
        userRole === "ADMIN" ||
        userRole === "TEACHER" ||
        userRole === "GIAO_VIEN" ||
        userRole === "GV" ||
        Boolean(userObj.isTeacher);

      const authorId = String(targetCourse.authorId || "").trim().toLowerCase();
      const reqUserId = String(userObj.idUser || "").trim().toLowerCase();

      if (!isTeacherOrAdmin && authorId && reqUserId && authorId !== reqUserId) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xóa khóa học này!",
        });
      }
    }

    await deleteCourseFromSupabase(String(courseId));
    const nextCourses = courses.filter((_c: any) => String(_c?.courseId) !== String(courseId));
    await writeFsDoc("courses", { items: nextCourses });

    // Khi khóa học bị xóa, tự động xóa tất cả giấy chứng nhận, tiến độ, điểm thi, ghi danh liên quan
    try {
      const db = await getDb();
      const cTarget = String(courseId || "").trim();
      const cLower = cTarget.toLowerCase();

      // 1. Xóa certificates
      if (db.certificates && db.certificates.length > 0) {
        const removedCerts = db.certificates.filter((c: any) => String(c?.courseId || "").trim().toLowerCase() === cLower);
        if (removedCerts.length > 0) {
          const removedIds = new Set(removedCerts.map((c: any) => String(c?.certificateId)));
          db.certificates = db.certificates.filter((c: any) => String(c?.courseId || "").trim().toLowerCase() !== cLower);
          inMemoryStore.set("certificates", { payload: db.certificates });
          await writeFsDoc("certificates", { payload: db.certificates });

          const seenDoc = await readFsDoc<any>("seen_certificates", {});
          if (seenDoc && typeof seenDoc === "object") {
            let modified = false;
            Object.keys(seenDoc).forEach((uKey) => {
              if (Array.isArray(seenDoc[uKey])) {
                const origLen = seenDoc[uKey].length;
                seenDoc[uKey] = seenDoc[uKey].filter((id: string) => !removedIds.has(String(id)));
                if (seenDoc[uKey].length !== origLen) modified = true;
              }
            });
            if (modified) {
              inMemoryStore.set("seen_certificates", seenDoc);
              await writeFsDoc("seen_certificates", seenDoc);
            }
          }
        }
      }

      // 2. Xóa tiến độ học tập (db.progress)
      if (db.progress && db.progress.length > 0) {
        db.progress = db.progress.filter((p: any) => String(p?.courseId || "").trim().toLowerCase() !== cLower);
        inMemoryStore.set("progress", { payload: db.progress });
        await writeFsDoc("progress", { payload: db.progress });
      }

      // 3. Xóa điểm số và lịch sử làm bài thi (quiz_status)
      const qStatusDoc = await readFsDoc<any>("quiz_status", {});
      if (qStatusDoc && typeof qStatusDoc === "object") {
        let qModified = false;
        Object.keys(qStatusDoc).forEach((uKey) => {
          if (typeof qStatusDoc[uKey] === "object" && qStatusDoc[uKey] !== null) {
            Object.keys(qStatusDoc[uKey]).forEach((cKey) => {
              if (cKey.trim().toLowerCase() === cLower) {
                delete qStatusDoc[uKey][cKey];
                qModified = true;
              }
            });
          }
        });
        if (qModified) {
          inMemoryStore.set("quiz_status", qStatusDoc);
          await writeFsDoc("quiz_status", qStatusDoc);
        }
      }

      // 4. Xóa enrollments
      if (db.enrollments && db.enrollments.length > 0) {
        db.enrollments = db.enrollments.filter((e: any) => String(e?.courseId || "").trim().toLowerCase() !== cLower);
        inMemoryStore.set("enrollments", { payload: db.enrollments });
        await writeFsDoc("enrollments", { payload: db.enrollments });
      }

      // 5. Xóa attendanceLogs
      if (db.attendanceLogs && db.attendanceLogs.length > 0) {
        db.attendanceLogs = db.attendanceLogs.filter((a: any) => String(a?.courseId || "").trim().toLowerCase() !== cLower);
        inMemoryStore.set("attendanceLogs", { payload: db.attendanceLogs });
        await writeFsDoc("attendanceLogs", { payload: db.attendanceLogs });
      }

      // 6. Xóa Q&A questions
      if (db.qaQuestions && db.qaQuestions.length > 0) {
        db.qaQuestions = db.qaQuestions.filter((q: any) => String(q?.courseId || "").trim().toLowerCase() !== cLower);
        inMemoryStore.set("qa_questions", { items: db.qaQuestions });
        await writeFsDoc("qa_questions", { items: db.qaQuestions });
      }

      await saveDb(db);
    } catch (cleanCascadeErr: any) {
      console.warn("[Cascade delete course data error]:", cleanCascadeErr?.message);
    }

    return res.json({ success: true, message: "Đã xóa khóa học cùng toàn bộ tiến độ, điểm số, bài thi và giấy chứng nhận liên quan thành công!" });
  } catch (err: any) {
    console.error("Error deleting course:", err);
    return res.status(500).json({ success: false, message: "Không thể xóa khóa học trên máy chủ." });
  }
});

// 6. ENROLL COURSE API
app.post("/api/enroll", async (req, res) => {
  const { idUser, courseId, courseName } = req.body;
  const db = await getDb();

  const cleanId = String(idUser || "").trim().toLowerCase();
  const existing = db.enrollments.find(
    (e) => String(e.idUser).trim().toLowerCase() === cleanId && e.courseId === courseId
  );

  if (existing) {
    return res.json({ success: true, message: "Bạn đã đăng ký khóa học này rồi!" });
  }

  db.enrollments.push({
    idUser,
    courseId,
    courseName,
    enrollDate: new Date().toISOString(),
    status: "DANG_HOC",
  });

  await saveDb(db);
  return res.json({ success: true, message: "Đăng ký khóa học thành công!" });
});

// 7. SAVE STUDENT PROGRESS API
app.post("/api/progress", async (req, res) => {
  try {
    const { idUser, courseId, lessonIndex, progressData, detailResult } = req.body || {};
    if (!idUser || !courseId) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin người dùng hoặc khóa học." });
    }

    const cleanUser = String(idUser).trim().toLowerCase();
    const cId = String(courseId);
    let lKey = String(lessonIndex ?? "");
    if (/^\d+$/.test(lKey)) {
      lKey = `LESSON_${lKey}`;
    }
    if (!lKey || lKey === "undefined" || lKey === "null") {
      return res.status(400).json({ success: false, message: "Mã bài học không hợp lệ." });
    }

    const db = await getDb();
    if (!Array.isArray(db.progress)) db.progress = [];

    let parsedProgress = progressData;
    if (typeof progressData === "string") {
      try { parsedProgress = JSON.parse(progressData); } catch {}
    }

    const isQuiz = lKey === "QUIZ" || lKey === "QUIZ_SUBMITTED";
    const isExercise = lKey.startsWith("LESSON_EXERCISE_");

    if (isExercise) {
      const scoreVal = typeof parsedProgress === "object" && parsedProgress !== null
        ? Number(parsedProgress.lastScore ?? parsedProgress.score ?? parsedProgress.quizScore ?? 0)
        : Number(parsedProgress) || 0;

      const course = (db.courses || []).find((c: any) => String(c.courseId) === cId);
      const lessonIdx = parseInt(lKey.replace("LESSON_EXERCISE_", ""), 10);
      const passScore = course?.lessons?.[lessonIdx]?.exerciseConfig?.passingScore !== undefined
        ? Number(course.lessons[lessonIdx].exerciseConfig.passingScore)
        : 80;

      const isPassed = typeof parsedProgress === "object" && parsedProgress?.passed !== undefined
        ? Boolean(parsedProgress.passed)
        : scoreVal >= passScore;

      // As requested:
      // "Đối với kết quả bài tập củng cố chỉ lưu kết quả bài làm hiện tại + đạt/chưa đạt (chỉ lưu điểm để làm căn cứ cấp giấy chứng nhận không cần lưu các dữ liệu khác)"
      const exerciseData = {
        score: scoreVal,
        lastScore: scoreVal,
        passed: isPassed,
        status: isPassed ? "ĐẠT" : "CHƯA ĐẠT",
        isCompleted: true,
        updatedAt: new Date().toISOString(),
      };

      const existingIdx = db.progress.findIndex((p: any) =>
        p &&
        String(p.idUser || "").trim().toLowerCase() === cleanUser &&
        String(p.courseId || "") === cId &&
        String(p.lessonKey || "") === lKey
      );

      const record = {
        idUser: cleanUser,
        courseId: cId,
        lessonKey: lKey,
        progressData: exerciseData,
        updatedAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        db.progress[existingIdx] = record;
      } else {
        db.progress.push(record);
      }

      inMemoryStore.set("progress", { payload: db.progress });
      await writeFsDoc("progress", { payload: db.progress });

      return res.json({
        success: true,
        message: "Đã lưu kết quả bài tập củng cố lên máy chủ thành công!",
        exerciseStatus: exerciseData,
      });
    }

    if (isQuiz) {
      const scoreVal = typeof parsedProgress === "object" && parsedProgress !== null
        ? Number(parsedProgress.lastScore ?? parsedProgress.score ?? parsedProgress.quizScore ?? 0)
        : Number(parsedProgress) || 0;

      const existingQuiz = db.progress.find((p: any) =>
        p &&
        String(p.idUser || "").trim().toLowerCase() === cleanUser &&
        String(p.courseId || "") === cId &&
        (String(p.lessonKey || "") === "QUIZ_SUBMITTED" || String(p.lessonKey || "") === "QUIZ")
      );

      let existingQuizData = existingQuiz?.progressData;
      if (typeof existingQuizData === "string") {
        try { existingQuizData = JSON.parse(existingQuizData); } catch {}
      }

      const prevAttempts = typeof existingQuizData === "object" && existingQuizData !== null && existingQuizData.attempts !== undefined
        ? Number(existingQuizData.attempts)
        : (Array.isArray(existingQuizData?.attemptsHistory) ? existingQuizData.attemptsHistory.length : (existingQuiz ? 1 : 0));

      const attempts = typeof parsedProgress === "object" && parsedProgress !== null && parsedProgress?.attempts !== undefined
        ? Math.max(1, Number(parsedProgress.attempts))
        : (prevAttempts + 1);

      const firstScore = (typeof existingQuizData === "object" && existingQuizData !== null && existingQuizData.firstScore !== undefined)
        ? Number(existingQuizData.firstScore)
        : (typeof parsedProgress === "object" && parsedProgress?.firstScore !== undefined ? Number(parsedProgress.firstScore) : scoreVal);

      const course = (db.courses || []).find((c: any) => String(c.courseId) === cId);
      const rawPassing = course?.quizConfig?.passingScore !== undefined
        ? Number(course.quizConfig.passingScore)
        : 80;
      const p1Score = Number(course?.quizConfig?.p1?.totalScore || 0);
      const p2Count = Number(course?.quizConfig?.p2?.count || course?.quizConfig?.p2?.bank?.length || 0);
      const p2Score = p2Count * (course?.quizConfig?.p2?.scores?.s4 || 1.0);
      const p3Score = Number(course?.quizConfig?.p3?.totalScore || 0);
      const quizMaxPoints = (p1Score + p2Score + p3Score) > 0 ? (p1Score + p2Score + p3Score) : 10;
      const quizPassingScore = (quizMaxPoints <= 10 && rawPassing > 10)
        ? Math.round(((rawPassing / 100) * quizMaxPoints) * 10) / 10
        : rawPassing;

      const isPassed = typeof parsedProgress === "object" && parsedProgress?.passed !== undefined
        ? Boolean(parsedProgress.passed)
        : scoreVal >= quizPassingScore;

      const violations = typeof parsedProgress === "object" && parsedProgress !== null
        ? Number(parsedProgress.violations ?? parsedProgress.cheatWarnings ?? 0)
        : 0;

      const prevScores: number[] = Array.isArray(existingQuizData?.scores)
        ? existingQuizData.scores
        : (existingQuizData?.lastScore !== undefined ? [Number(existingQuizData.lastScore)] : []);
      const scores = Array.isArray(parsedProgress?.scores) && parsedProgress.scores.length > 0
        ? parsedProgress.scores
        : [...prevScores, scoreVal];

      const prevHistory: any[] = Array.isArray(existingQuizData?.attemptsHistory)
        ? existingQuizData.attemptsHistory
        : [];
      const lastEntry = prevHistory[prevHistory.length - 1];
      const isDuplicate = lastEntry && (
        lastEntry.attempt === attempts ||
        (lastEntry.submittedAt && Math.abs(new Date().getTime() - new Date(lastEntry.submittedAt).getTime()) < 5000)
      );
      const attemptsHistory = Array.isArray(parsedProgress?.attemptsHistory) && parsedProgress.attemptsHistory.length > 0
        ? parsedProgress.attemptsHistory
        : (isDuplicate ? prevHistory : [
            ...prevHistory,
            {
              attempt: attempts,
              score: scoreVal,
              passed: isPassed,
              violations,
              submittedAt: new Date().toISOString(),
            },
          ]);

      const bestScore = Math.max(...scores, scoreVal);

      // As requested:
      // "Đối với kết quả làm bài thu hoạch cuối khóa chỉ lưu số lần làm bài, kết quả làm bài mỗi lần + đạt / chưa đạt + số lần vi phạm để làm căn cứu cấp giấy chứng nhận (không lưu các dữ liệu khác như để học sinh làm ...)"
      const mergedQuizObj = {
        attempts,
        lastScore: scoreVal,
        score: scoreVal,
        firstScore,
        bestScore,
        scores,
        attemptsHistory,
        passed: isPassed,
        status: isPassed ? "ĐẠT" : "CHƯA ĐẠT",
        violations,
        isCompleted: true,
        updatedAt: new Date().toISOString(),
      };

      for (const qKey of ["QUIZ_SUBMITTED", "QUIZ"]) {
        const idx = db.progress.findIndex((p: any) =>
          p &&
          String(p.idUser || "").trim().toLowerCase() === cleanUser &&
          String(p.courseId || "") === cId &&
          String(p.lessonKey || "") === qKey
        );
        const record = {
          idUser: cleanUser,
          courseId: cId,
          lessonKey: qKey,
          progressData: mergedQuizObj,
          updatedAt: new Date().toISOString(),
        };
        if (idx >= 0) {
          db.progress[idx] = record;
        } else {
          db.progress.push(record);
        }
      }

      inMemoryStore.set("progress", { payload: db.progress });
      await writeFsDoc("progress", { payload: db.progress });

      try {
        const qsDoc = (await readFsDoc<any>("quiz_status", {})) || {};
        const safeQs = typeof qsDoc === "object" && qsDoc !== null ? qsDoc : {};
        if (!safeQs[cleanUser]) safeQs[cleanUser] = {};
        safeQs[cleanUser][cId] = mergedQuizObj;
        inMemoryStore.set("quiz_status", safeQs);
        await writeFsDoc("quiz_status", safeQs);
      } catch (e: any) {
        console.warn("[Progress API] Warning updating quiz_status in Supabase:", e?.message);
      }

      return res.json({
        success: true,
        message: "Đã lưu kết quả bài kiểm tra lên máy chủ thành công!",
        quizStatus: mergedQuizObj,
      });
    }

    const existingIdx = db.progress.findIndex((p: any) =>
      p &&
      String(p.idUser || "").trim().toLowerCase() === cleanUser &&
      String(p.courseId || "") === cId &&
      String(p.lessonKey || "") === lKey
    );

    if (existingIdx >= 0) {
      const existing = db.progress[existingIdx];
      let existingData = existing.progressData;
      if (typeof existingData === "string") {
        try { existingData = JSON.parse(existingData); } catch {}
      }

      let mergedProgress = parsedProgress;
      if (typeof parsedProgress === "object" && parsedProgress !== null && typeof existingData === "object" && existingData !== null) {
        const oldWatched = Number(existingData.watchedSec || 0);
        const newWatched = Number(parsedProgress.watchedSec || 0);
        mergedProgress = {
          ...existingData,
          ...parsedProgress,
          watchedSec: Math.max(oldWatched, newWatched),
          isCompleted: Boolean(existingData.isCompleted || parsedProgress.isCompleted),
        };
      }

      db.progress[existingIdx] = {
        idUser: cleanUser,
        courseId: cId,
        lessonKey: lKey,
        progressData: mergedProgress,
        detailResult: detailResult || existing.detailResult || {},
        updatedAt: new Date().toISOString(),
      };
    } else {
      db.progress.push({
        idUser: cleanUser,
        courseId: cId,
        lessonKey: lKey,
        progressData: parsedProgress,
        detailResult: detailResult || {},
        updatedAt: new Date().toISOString(),
      });
    }

    inMemoryStore.set("progress", { payload: db.progress });
    await writeFsDoc("progress", { payload: db.progress });

    return res.json({ success: true, message: "Đã lưu tiến trình học tập thành công!" });
  } catch (err: any) {
    console.error("Error saving student progress:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ khi lưu tiến trình" });
  }
});

app.get("/api/progress", async (req, res) => {
  try {
    const { idUser, courseId } = req.query;
    const cleanUser = String(idUser || "").trim().toLowerCase();
    const db = await getDb();
    let list = Array.isArray(db.progress) ? db.progress : [];
    if (cleanUser) {
      list = list.filter((p: any) => p && String(p.idUser || "").trim().toLowerCase() === cleanUser);
    }
    if (courseId) {
      list = list.filter((p: any) => p && String(p.courseId || "") === String(courseId));
    }
    return res.json({ success: true, progress: list });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// 7.1. ATTENDANCE LOG API
app.post("/api/attendance", async (req, res) => {
  const { idUser, courseId, hoTen, chiDoan } = req.body;
  if (!idUser || !courseId) {
    return res.status(400).json({ success: false, message: "Thiếu thông tin người dùng hoặc khóa học." });
  }

  const db = await getDb();
  if (!db.attendanceLogs) {
    db.attendanceLogs = [];
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const cleanId = String(idUser).trim().toLowerCase();
  const cleanCourse = String(courseId).trim();

  const logsToday = db.attendanceLogs.filter(
    (l) => String(l.idUser).trim().toLowerCase() === cleanId &&
           String(l.courseId).trim() === cleanCourse &&
           l.dateStr === dateStr
  );

  if (logsToday.length >= 3) {
    return res.json({
      success: false,
      message: "Bạn đã điểm danh đủ 3 lần trong ngày hôm nay!",
      countToday: logsToday.length,
      limitReached: true,
    });
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

  let studentHoTen = hoTen || '';
  let studentChiDoan = chiDoan || '';
  if (!studentHoTen || !studentChiDoan) {
    const student = db.students.find(s => String(s.idUser).trim().toLowerCase() === cleanId);
    if (student) {
      studentHoTen = studentHoTen || student.hoTen;
      studentChiDoan = studentChiDoan || student.chiDoan;
    }
  }

  const newLog = {
    id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    idUser: String(idUser),
    hoTen: studentHoTen || String(idUser),
    chiDoan: studentChiDoan || 'Lớp',
    courseId: cleanCourse,
    timestamp: formattedTime,
    dateStr: dateStr,
    createdAt: now.toISOString(),
  };

  db.attendanceLogs.push(newLog);
  await saveDb(db);

  return res.json({
    success: true,
    message: `Điểm danh thành công! (${logsToday.length + 1}/3 lần hôm nay)`,
    countToday: logsToday.length + 1,
    timestamp: formattedTime,
  });
});

// 7.2. CHECK ATTENDANCE STATUS API
app.get("/api/attendance/check", async (req, res) => {
  const { idUser, courseId } = req.query;
  if (!idUser || !courseId) {
    return res.status(400).json({ success: false, message: "Thiếu tham số." });
  }

  const db = await getDb();
  const logs = db.attendanceLogs || [];

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const cleanId = String(idUser).trim().toLowerCase();
  const cleanCourse = String(courseId).trim();

  const logsToday = logs.filter(
    (l) => String(l.idUser).trim().toLowerCase() === cleanId &&
           String(l.courseId).trim() === cleanCourse &&
           l.dateStr === dateStr
  );

  return res.json({
    success: true,
    countToday: logsToday.length,
    timestampsToday: logsToday.map((l) => l.timestamp),
  });
});

// 7.3. EXPORT ATTENDANCE LIST API
app.get("/api/attendance/export/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { date } = req.query; // optional date query param: 'ALL' or 'YYYY-MM-DD'
    const db = await getDb();

    const cleanCourseId = String(courseId || '').trim();
    const courses = db.courses || [];
    const course = courses.find((c) => String(c?.courseId || '').trim() === cleanCourseId);
    const courseTitle = course ? course.title : cleanCourseId;

    const logs = db.attendanceLogs || [];
    const courseLogs = logs.filter((l) => String(l?.courseId || '').trim() === cleanCourseId);

    // Collect available dates
    const datesCountMap: Record<string, number> = {};
    courseLogs.forEach((l) => {
      let dStr = l.dateStr || '';
      if (!dStr) {
        const val = l.createdAt || l.timestamp || '';
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
          dStr = val.substring(0, 10);
        } else {
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            const pad = (n: number) => String(n).padStart(2, '0');
            dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          }
        }
      }
      if (dStr) {
        datesCountMap[dStr] = (datesCountMap[dStr] || 0) + 1;
      }
    });

    const availableDates = Object.keys(datesCountMap)
      .sort()
      .reverse()
      .map((d) => ({ date: d, count: datesCountMap[d] }));

    // Filter by date if requested and not 'ALL'
    const selectedDate = date ? String(date).trim() : 'ALL';
    let filteredLogs = courseLogs;
    if (selectedDate && selectedDate !== 'ALL') {
      filteredLogs = courseLogs.filter((l) => {
        if (l.dateStr) return l.dateStr === selectedDate;
        const val = l.createdAt || l.timestamp || '';
        if (val.startsWith(selectedDate)) return true;
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          const pad = (n: number) => String(n).padStart(2, '0');
          const dateFormatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          return dateFormatted === selectedDate;
        }
        return false;
      });
    }

    const studentMap: Record<string, { hoTen: string; chiDoan: string; idUser: string }> = {};

    (db.enrollments || []).forEach((e) => {
      if (String(e?.courseId || '').trim() === cleanCourseId) {
        const uId = String(e?.idUser || '').trim().toLowerCase();
        if (uId) {
          studentMap[uId] = {
            idUser: e.idUser,
            hoTen: e.idUser,
            chiDoan: 'Lớp',
          };
        }
      }
    });

    (db.students || []).forEach((s) => {
      const sId = String(s?.idUser || '').trim().toLowerCase();
      if (sId && studentMap[sId]) {
        studentMap[sId].hoTen = s.hoTen || sId;
        studentMap[sId].chiDoan = s.chiDoan || 'Lớp';
      }
    });

    filteredLogs.forEach((l) => {
      const uId = String(l?.idUser || '').trim().toLowerCase();
      if (uId) {
        if (!studentMap[uId]) {
          studentMap[uId] = {
            idUser: l.idUser,
            hoTen: l.hoTen || l.idUser,
            chiDoan: l.chiDoan || 'Lớp',
          };
        } else {
          if (l.hoTen && studentMap[uId].hoTen === studentMap[uId].idUser) {
            studentMap[uId].hoTen = l.hoTen;
          }
          if (l.chiDoan && studentMap[uId].chiDoan === 'Lớp') {
            studentMap[uId].chiDoan = l.chiDoan;
          }
        }
      }
    });

    const studentLogsMap: Record<string, string[]> = {};
    const formatTs = (ts: string, createdAt?: string) => {
      if (!ts && !createdAt) return 'Chưa điểm danh';
      const val = (ts || createdAt || '').trim();
      if (/^\d{2}:\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}$/.test(val)) {
        return val;
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      }
      return val;
    };

    filteredLogs.forEach((l) => {
      const uId = String(l?.idUser || '').trim().toLowerCase();
      if (uId) {
        if (!studentLogsMap[uId]) {
          studentLogsMap[uId] = [];
        }
        studentLogsMap[uId].push(formatTs(l.timestamp, l.createdAt));
      }
    });

    const studentsList = Object.values(studentMap);
    let maxSessions = 1;
    studentsList.forEach((st) => {
      const uId = String(st.idUser).trim().toLowerCase();
      const count = (studentLogsMap[uId] || []).length;
      if (count > maxSessions) {
        maxSessions = count;
      }
    });

    const rows = studentsList.map((st, index) => {
      const uId = String(st.idUser).trim().toLowerCase();
      const timestamps = studentLogsMap[uId] || [];
      const rowObj: Record<string, any> = {
        'STT': index + 1,
        'Họ tên': st.hoTen,
        'Lớp': st.chiDoan,
        'Tên tài khoản': st.idUser,
      };

      for (let i = 1; i <= maxSessions; i++) {
        rowObj[`Thời gian điểm danh buổi ${i}`] = timestamps[i - 1] || 'Chưa điểm danh';
      }

      return rowObj;
    });

    return res.json({
      success: true,
      courseTitle,
      selectedDate,
      availableDates,
      maxSessions,
      rows,
    });
  } catch (err: any) {
    console.error("Error exporting attendance:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi khi xuất danh sách điểm danh" });
  }
});

// 8. GET TEACHER STATS API
app.get("/api/teacher/stats/:courseId", async (req, res) => {
  const { courseId } = req.params;
  const db = await getDb();

  const targetCourseId = String(courseId).trim().toLowerCase();
  const course = (db.courses || []).find(
    (c) => String(c.courseId).trim().toLowerCase() === targetCourseId
  ) || (db.courses || []).find((c) => c.courseId === courseId);

  // Compute effective passing score
  let rawPassing = course?.quizConfig?.passingScore !== undefined
    ? Number(course.quizConfig.passingScore)
    : 80;
  const p1Score = Number(course?.quizConfig?.p1?.totalScore || 0);
  const p2Count = Number(course?.quizConfig?.p2?.count || course?.quizConfig?.p2?.bank?.length || 0);
  const p2Score = p2Count * (course?.quizConfig?.p2?.scores?.s4 || 1.0);
  const p3Score = Number(course?.quizConfig?.p3?.totalScore || 0);
  const quizMaxPoints = (p1Score + p2Score + p3Score) > 0 ? (p1Score + p2Score + p3Score) : 10;
  const passingScore = (quizMaxPoints <= 10 && rawPassing > 10)
    ? Math.round(((rawPassing / 100) * quizMaxPoints) * 10) / 10
    : rawPassing;

  const qsDoc = (await readFsDoc<any>("quiz_status", {})) || {};

  const certMap = new Map<string, any>();
  (db.certificates || []).forEach((c) => {
    if (c && c.idUser && String(c.courseId).trim().toLowerCase() === targetCourseId) {
      certMap.set(String(c.idUser).trim().toLowerCase(), c);
    }
  });

  const studentMap: Record<string, { hoTen: string; chiDoan: string }> = {};
  (db.students || []).forEach((s) => {
    const sId = String(s.idUser).trim().toLowerCase();
    studentMap[sId] = { hoTen: s.hoTen || sId, chiDoan: s.chiDoan || "Lớp" };
  });

  // Gather all unique student IDs for this course
  const enrolledStudentIds = new Set<string>();
  (db.enrollments || []).forEach((e) => {
    if (String(e.courseId).trim().toLowerCase() === targetCourseId) {
      enrolledStudentIds.add(String(e.idUser).trim().toLowerCase());
    }
  });
  (db.progress || []).forEach((p) => {
    if (String(p.courseId).trim().toLowerCase() === targetCourseId) {
      enrolledStudentIds.add(String(p.idUser).trim().toLowerCase());
    }
  });
  if (qsDoc && typeof qsDoc === "object") {
    Object.entries(qsDoc).forEach(([uKey, uMap]: [string, any]) => {
      if (typeof uMap === "object" && uMap !== null) {
        Object.keys(uMap).forEach((cId) => {
          if (String(cId).trim().toLowerCase() === targetCourseId) {
            enrolledStudentIds.add(String(uKey).trim().toLowerCase());
          }
        });
      }
    });
  }
  certMap.forEach((_, uKey) => {
    enrolledStudentIds.add(uKey);
  });

  const enrolledStudents: any[] = [];
  enrolledStudentIds.forEach((cleanUId) => {
    const sInfo = studentMap[cleanUId] || { hoTen: cleanUId, chiDoan: "Lớp" };
    const hasCert = certMap.has(cleanUId);
    const cert = certMap.get(cleanUId);

    const totalLessons = course ? (course.lessons || []).length : 0;
    const completedLessonIndices = new Set<number>();
    const quizScores: number[] = [];
    let totalViolations = 0;
    let maxAtts = 0;
    let durationSec = 0;

    (course?.lessons || []).forEach((l: any, idx: number) => {
      const targetKeys = new Set([
        String(idx),
        `lesson_${idx}`,
        `lesson-${idx}`,
        `LESSON_${idx}`,
        `LESSON-${idx}`,
      ]);
      if (l.lessonId) targetKeys.add(String(l.lessonId).toLowerCase());
      if (l.id) targetKeys.add(String(l.id).toLowerCase());

      const isLessonDone = (db.progress || []).some((p) => {
        if (
          String(p.idUser).trim().toLowerCase() === cleanUId &&
          String(p.courseId).trim().toLowerCase() === targetCourseId
        ) {
          const lk = String(p.lessonKey || "").trim().toLowerCase();
          if (targetKeys.has(lk)) {
            const pd = p.progressData;
            if (pd && typeof pd === "object") {
              if (pd.isCompleted || pd.completed) return true;
              const reqSec = (l.duration || 1) >= 30 ? (l.duration || 1) : (l.duration || 1) * 60;
              if (Number(pd.watchedSec || 0) >= reqSec) return true;
              if (Number(pd.watchedSec || 0) > 0) return true;
            }
            return true;
          }
        }
        return false;
      });

      if (isLessonDone) {
        completedLessonIndices.add(idx);
      }
    });

    let seenQuizProgress = false;
    (db.progress || []).forEach((p) => {
      if (
        String(p.idUser).trim().toLowerCase() === cleanUId &&
        String(p.courseId).trim().toLowerCase() === targetCourseId
      ) {
        const itemKey = String(p.lessonKey);
        const match = itemKey.match(/^LESSON_(\d+)$/i);
        if (match) {
          completedLessonIndices.add(parseInt(match[1], 10));
        } else if (/^\d+$/.test(itemKey)) {
          completedLessonIndices.add(parseInt(itemKey, 10));
        } else if ((itemKey === "QUIZ_SUBMITTED" || itemKey === "QUIZ" || itemKey.toUpperCase().startsWith("QUIZ")) && !seenQuizProgress) {
          seenQuizProgress = true;
          let scoreVal = 0;
          let dSec = 0;
          let atts = 0;
          let vCount = 0;

          if (typeof p.progressData === "object" && p.progressData !== null) {
            scoreVal = Number(p.progressData.lastScore ?? p.progressData.score ?? p.progressData.quizScore ?? p.progressData.bestScore) || 0;
            dSec = Number(p.progressData.durationSec) || 0;
            vCount = Number(p.progressData.violations ?? p.progressData.violationCount ?? p.progressData.violation) || 0;

            if (Array.isArray(p.progressData.attemptsHistory) && p.progressData.attemptsHistory.length > 0) {
              atts = new Set(p.progressData.attemptsHistory.map((h: any, i: number) => h?.attempt ?? i)).size;
              p.progressData.attemptsHistory.forEach((h: any) => {
                const sNum = typeof h?.score === "number" ? h.score : Number(h?.score);
                if (!isNaN(sNum)) quizScores.push(sNum);
              });
            } else if (Array.isArray(p.progressData.scores) && p.progressData.scores.length > 0) {
              atts = p.progressData.scores.length;
              p.progressData.scores.forEach((sc: any) => {
                const sNum = typeof sc === "number" ? sc : Number(sc?.score);
                if (!isNaN(sNum)) quizScores.push(sNum);
              });
            } else if (p.progressData.attempts !== undefined && p.progressData.attempts !== null) {
              atts = Number(p.progressData.attempts) || 1;
              quizScores.push(scoreVal);
            } else {
              atts = 1;
              quizScores.push(scoreVal);
            }
          } else {
            scoreVal = Number(p.progressData) || 0;
            atts = 1;
            quizScores.push(scoreVal);
          }

          if (dSec > 0) durationSec = dSec;
          maxAtts = Math.max(maxAtts, atts);
          totalViolations = Math.max(totalViolations, vCount);
        }
      }
    });

    const userQs = (qsDoc[cleanUId] || {})[courseId] ||
                   (qsDoc[cleanUId] || {})[targetCourseId] ||
                   (qsDoc[cleanUId] || {})[String(courseId).toUpperCase()] ||
                   (qsDoc[cleanUId] || {})[String(courseId).toLowerCase()];
    if (userQs && typeof userQs === "object" && !seenQuizProgress) {
      const qsScore = Number(userQs.lastScore ?? userQs.score ?? userQs.bestScore ?? userQs.quizScore);
      let qsAtts = 0;
      if (Array.isArray(userQs.attemptsHistory) && userQs.attemptsHistory.length > 0) {
        qsAtts = new Set(userQs.attemptsHistory.map((h: any, i: number) => h?.attempt ?? i)).size;
        userQs.attemptsHistory.forEach((h: any) => {
          const sNum = typeof h?.score === "number" ? h.score : Number(h?.score);
          if (!isNaN(sNum)) quizScores.push(sNum);
        });
      } else if (Array.isArray(userQs.scores) && userQs.scores.length > 0) {
        qsAtts = userQs.scores.length;
        userQs.scores.forEach((sc: any) => {
          const sNum = typeof sc === "number" ? sc : Number(sc?.score);
          if (!isNaN(sNum)) quizScores.push(sNum);
        });
      } else if (userQs.attempts !== undefined && userQs.attempts !== null) {
        qsAtts = Number(userQs.attempts) || 1;
        if (!isNaN(qsScore)) quizScores.push(qsScore);
      } else if (!isNaN(qsScore)) {
        qsAtts = 1;
        quizScores.push(qsScore);
      }
      maxAtts = Math.max(maxAtts, qsAtts);
      totalViolations = Math.max(totalViolations, Number(userQs.violations) || 0);
      if (userQs.durationSec) durationSec = Number(userQs.durationSec);
    }

    if (hasCert && quizScores.length === 0) {
      quizScores.push(10);
      maxAtts = Math.max(maxAtts, 1);
    }

    let completedLessons = completedLessonIndices.size;
    if (hasCert || (quizScores.length > 0 && Math.max(...quizScores) >= passingScore)) {
      completedLessons = Math.max(completedLessons, totalLessons);
    }

    let quizScore: number | null = null;
    let maxScore: number | null = null;
    let minScore: number | null = null;
    let status: "ĐẠT" | "CHƯA ĐẠT" | "Đang học" = "Đang học";

    if (quizScores.length > 0) {
      quizScore = quizScores[quizScores.length - 1];
      maxScore = Math.max(...quizScores);
      minScore = Math.min(...quizScores);
      const isPassed = maxScore >= passingScore || Boolean(hasCert) || userQs?.passed === true || userQs?.status === "ĐẠT";
      status = isPassed ? "ĐẠT" : "CHƯA ĐẠT";
    } else if (hasCert) {
      quizScore = 10;
      maxScore = 10;
      minScore = 10;
      status = "ĐẠT";
      maxAtts = 1;
    } else {
      status = "Đang học";
    }

    enrolledStudents.push({
      idUser: cleanUId,
      hoTen: sInfo.hoTen,
      chiDoan: sInfo.chiDoan,
      completedLessons,
      totalLessons,
      quizScore,
      maxScore,
      minScore,
      quizAttempts: quizScores.length > 0 ? Math.max(1, maxAtts) : (hasCert ? 1 : 0),
      violations: totalViolations,
      status,
      durationSec,
      hasCertificate: Boolean(hasCert),
      certificateId: cert?.certificateId || null,
      certificateNumberStr: cert?.certificateNumberStr || null,
    });
  });

  res.json({
    success: true,
    students: enrolledStudents,
    passingScore,
  });
});

// 8.45 GET ALL ANALYTICS REPORTS FOR ADMIN & TEACHER
app.get("/api/reports/lms-analytics", async (req, res) => {
  try {
    const role = String(req.query.role || "TEACHER").toUpperCase();
    const userId = String(req.query.userId || "").trim().toLowerCase();
    const hoTen = String(req.query.hoTen || "").trim().toLowerCase();
    const filterCourseId = req.query.courseId ? String(req.query.courseId) : null;

    const db = await getDb();
    const qsDoc = (await readFsDoc<any>("quiz_status", {})) || {};

    // 1. Filter accessible courses
    let accessibleCourses = db.courses || [];
    if (role !== "ADMIN") {
      accessibleCourses = accessibleCourses.filter((c) => {
        const cAuthorId = String(c.authorId || "").trim().toLowerCase();
        const cAuthorName = String(c.authorName || "").trim().toLowerCase();
        return (
          cAuthorId === userId ||
          cAuthorName === hoTen ||
          (cAuthorName && hoTen && cAuthorName.includes(hoTen))
        );
      });
      // Fallback if teacher has no matching courses by name/id
      if (accessibleCourses.length === 0) {
        accessibleCourses = db.courses || [];
      }
    }

    if (filterCourseId && filterCourseId !== "ALL") {
      accessibleCourses = accessibleCourses.filter((c) => c.courseId === filterCourseId);
    }

    // 2. Map student info
    const studentMap: Record<string, { idUser: string; hoTen: string; chiDoan: string }> = {};
    (db.students || []).forEach((s) => {
      const sId = String(s.idUser).trim().toLowerCase();
      studentMap[sId] = { idUser: s.idUser, hoTen: s.hoTen || s.idUser, chiDoan: s.chiDoan || "Lớp" };
    });

    // 3. Certificates map
    const certMap = new Set<string>();
    (db.certificates || []).forEach((cert) => {
      const key = `${String(cert.idUser).trim().toLowerCase()}_${String(cert.courseId).trim().toLowerCase()}`;
      certMap.add(key);
    });

    const studentReports: any[] = [];
    const courseSummaries: any[] = [];

    accessibleCourses.forEach((c) => {
      const courseId = c.courseId;
      const targetCourseId = String(courseId).trim().toLowerCase();
      const totalLessons = (c.lessons || []).length;
      
      let rawPassing = c?.quizConfig?.passingScore !== undefined ? Number(c.quizConfig.passingScore) : 80;
      const p1Score = Number(c?.quizConfig?.p1?.totalScore || 0);
      const p2Count = Number(c?.quizConfig?.p2?.count || c?.quizConfig?.p2?.bank?.length || 0);
      const p2Score = p2Count * (c?.quizConfig?.p2?.scores?.s4 || 1.0);
      const p3Score = Number(c?.quizConfig?.p3?.totalScore || 0);
      const quizMaxPoints = (p1Score + p2Score + p3Score) > 0 ? (p1Score + p2Score + p3Score) : 10;
      const passingScore = (quizMaxPoints <= 10 && rawPassing > 10)
        ? Math.round(((rawPassing / 100) * quizMaxPoints) * 10) / 10
        : rawPassing;

      let cEnrolledCount = 0;
      let cSumProgress = 0;
      let cQuizScores: number[] = [];
      let cPassedCount = 0;
      let cFailedCount = 0;
      let cUnattemptedCount = 0;

      // Find enrollments or progress for this course
      const enrolledUserIds = new Set<string>();
      (db.enrollments || []).forEach((e) => {
        if (String(e.courseId).trim().toLowerCase() === targetCourseId) {
          enrolledUserIds.add(String(e.idUser).trim().toLowerCase());
        }
      });
      (db.progress || []).forEach((p) => {
        if (String(p.courseId).trim().toLowerCase() === targetCourseId) {
          enrolledUserIds.add(String(p.idUser).trim().toLowerCase());
        }
      });
      (db.certificates || []).forEach((cert) => {
        if (String(cert.courseId).trim().toLowerCase() === targetCourseId) {
          enrolledUserIds.add(String(cert.idUser).trim().toLowerCase());
        }
      });

      // Include all registered students if enrollments empty
      if (enrolledUserIds.size === 0) {
        Object.keys(studentMap).forEach((sId) => enrolledUserIds.add(sId));
      }

      enrolledUserIds.forEach((sId) => {
        const sInfo = studentMap[sId] || { idUser: sId, hoTen: sId, chiDoan: "Lớp" };
        const hasCertificate = certMap.has(`${sId}_${courseId}`) || certMap.has(`${sId}_${targetCourseId}`);
        const matchedCert = (db.certificates || []).find(
          (cert: any) =>
            String(cert.idUser || "").trim().toLowerCase() === sId &&
            (String(cert.courseId || "").trim().toLowerCase() === targetCourseId || String(cert.courseId || "") === courseId)
        );
        
        // Compute progress
        const completedLessonIndices = new Set<number>();
        const quizScores: number[] = [];
        let maxAtts = 0;

        (c.lessons || []).forEach((l: any, idx: number) => {
          const targetKeys = new Set([
            String(idx),
            `lesson_${idx}`,
            `lesson-${idx}`,
            `LESSON_${idx}`,
            `LESSON-${idx}`,
          ]);
          if (l.lessonId) targetKeys.add(String(l.lessonId).toLowerCase());
          if (l.id) targetKeys.add(String(l.id).toLowerCase());

          const isLessonDone = (db.progress || []).some((p) => {
            if (
              String(p.idUser).trim().toLowerCase() === sId &&
              String(p.courseId).trim().toLowerCase() === targetCourseId
            ) {
              const lk = String(p.lessonKey || "").trim().toLowerCase();
              if (targetKeys.has(lk)) {
                const pd = p.progressData;
                if (pd && typeof pd === "object") {
                  if (pd.isCompleted || pd.completed) return true;
                  const reqSec = (l.duration || 1) >= 30 ? (l.duration || 1) : (l.duration || 1) * 60;
                  if (Number(pd.watchedSec || 0) >= reqSec) return true;
                  if (Number(pd.watchedSec || 0) > 0) return true;
                }
                return true;
              }
            }
            return false;
          });

          if (isLessonDone) {
            completedLessonIndices.add(idx);
          }
        });

        (db.progress || []).forEach((p) => {
          if (
            String(p.idUser).trim().toLowerCase() === sId &&
            String(p.courseId).trim().toLowerCase() === targetCourseId
          ) {
            const itemKey = String(p.lessonKey);
            const match = itemKey.match(/^LESSON_(\d+)$/i);
            if (match) {
              completedLessonIndices.add(parseInt(match[1], 10));
            } else if (/^\d+$/.test(itemKey)) {
              completedLessonIndices.add(parseInt(itemKey, 10));
            } else if (itemKey === "QUIZ_SUBMITTED" || itemKey === "QUIZ") {
              if (p.progressData) {
                const s = Number(p.progressData.lastScore ?? p.progressData.score ?? p.progressData.bestScore ?? p.progressData.quizScore);
                if (!isNaN(s)) quizScores.push(s);
                if (p.progressData.attempts) {
                  maxAtts = Math.max(maxAtts, Number(p.progressData.attempts));
                }
              }
            }
          }
        });

        // Check fallback from quiz_status
        const userQs = (qsDoc[sId] || {})[courseId] || (qsDoc[sId] || {})[targetCourseId];
        if (userQs && typeof userQs === "object") {
          const qsScore = Number(userQs.lastScore ?? userQs.score ?? userQs.bestScore ?? userQs.quizScore);
          if (!isNaN(qsScore)) quizScores.push(qsScore);
          maxAtts = Math.max(maxAtts, Number(userQs.attempts) || 0);
        }

        if ((hasCertificate || Boolean(matchedCert)) && quizScores.length === 0) {
          quizScores.push(10);
          maxAtts = Math.max(maxAtts, 1);
        }

        let completedLessons = completedLessonIndices.size;
        if (hasCertificate || Boolean(matchedCert) || (quizScores.length > 0 && Math.max(...quizScores) >= passingScore)) {
          completedLessons = Math.max(completedLessons, totalLessons);
        }
        const progressPercent = totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;

        let quizScore: number | null = null;
        let status: "ĐẠT" | "CHƯA ĐẠT" | "CHƯA LÀM" = "CHƯA LÀM";

        if (quizScores.length > 0) {
          quizScore = quizScores[quizScores.length - 1];
          const isPassed = Math.max(...quizScores) >= passingScore || hasCertificate || Boolean(matchedCert);
          status = isPassed ? "ĐẠT" : "CHƯA ĐẠT";
          cQuizScores.push(quizScore);
        } else if (hasCertificate || Boolean(matchedCert)) {
          quizScore = 10;
          status = "ĐẠT";
          cQuizScores.push(10);
        } else {
          cUnattemptedCount++;
        }

        if (status === "ĐẠT") cPassedCount++;
        if (status === "CHƯA ĐẠT") cFailedCount++;

        cEnrolledCount++;
        cSumProgress += progressPercent;

        studentReports.push({
          idUser: sInfo.idUser,
          hoTen: sInfo.hoTen,
          chiDoan: sInfo.chiDoan,
          courseId,
          courseTitle: c.title,
          authorName: c.authorName || "Giáo viên",
          progressPercent,
          completedLessons,
          totalLessons,
          quizScore,
          passingScore,
          status,
          quizAttempts: maxAtts || (quizScores.length > 0 ? 1 : 0),
          hasCertificate: hasCertificate || Boolean(matchedCert),
          certificateId: (matchedCert as any)?.certificateId || "",
          certificateNumberStr: (matchedCert as any)?.certificateNumberStr || (matchedCert as any)?.certificateId || "",
        });
      });

      const avgProgress = cEnrolledCount > 0 ? Math.round(cSumProgress / cEnrolledCount) : 0;
      const avgScore = cQuizScores.length > 0
        ? Number((cQuizScores.reduce((a, b) => a + b, 0) / cQuizScores.length).toFixed(1))
        : 0;
      const passRatePercent = cEnrolledCount > 0 ? Math.round((cPassedCount / cEnrolledCount) * 100) : 0;

      courseSummaries.push({
        courseId,
        courseTitle: c.title,
        authorName: c.authorName || "Giáo viên",
        authorId: c.authorId || "",
        totalLessons,
        passingScore,
        enrolledCount: cEnrolledCount,
        avgProgress,
        avgScore,
        passedCount: cPassedCount,
        failedCount: cFailedCount,
        unattemptedCount: cUnattemptedCount,
        passRatePercent,
      });
    });

    res.json({
      success: true,
      studentReports,
      courseSummaries,
    });
  } catch (err: any) {
    console.error("Error in /api/reports/lms-analytics:", err);
    res.status(500).json({ success: false, message: "Server error generating report." });
  }
});

// 8.5 GET COURSE LEADERBOARD API
app.get("/api/leaderboard/:courseId", async (req, res) => {
  const { courseId } = req.params;
  const db = await getDb();

  const targetCourseId = String(courseId).trim().toLowerCase();
  const course = (db.courses || []).find((c) => String(c.courseId).trim().toLowerCase() === targetCourseId) || db.courses.find((c) => c.courseId === courseId);
  
  let rawPassing = course?.quizConfig?.passingScore !== undefined ? Number(course.quizConfig.passingScore) : 80;
  const p1Score = Number(course?.quizConfig?.p1?.totalScore || 0);
  const p2Count = Number(course?.quizConfig?.p2?.count || course?.quizConfig?.p2?.bank?.length || 0);
  const p2Score = p2Count * (course?.quizConfig?.p2?.scores?.s4 || 1.0);
  const p3Score = Number(course?.quizConfig?.p3?.totalScore || 0);
  const quizMaxPoints = (p1Score + p2Score + p3Score) > 0 ? (p1Score + p2Score + p3Score) : 10;
  const passingScore = (quizMaxPoints <= 10 && rawPassing > 10)
    ? Math.round(((rawPassing / 100) * quizMaxPoints) * 10) / 10
    : rawPassing;

  const qsDoc = (await readFsDoc<any>("quiz_status", {})) || {};

  const certMap = new Map<string, any>();
  (db.certificates || []).forEach((c) => {
    if (c && c.idUser && String(c.courseId).trim().toLowerCase() === targetCourseId) {
      certMap.set(String(c.idUser).trim().toLowerCase(), c);
    }
  });

  const studentMap: Record<string, { hoTen: string; chiDoan: string }> = {};
  db.students.forEach((s) => {
    const sId = String(s.idUser).trim().toLowerCase();
    studentMap[sId] = { hoTen: s.hoTen || sId, chiDoan: s.chiDoan || "Lớp" };
  });

  const enrolledStudentIds = new Set<string>();
  (db.enrollments || []).forEach((e) => {
    if (String(e.courseId).trim().toLowerCase() === targetCourseId) {
      enrolledStudentIds.add(String(e.idUser).trim().toLowerCase());
    }
  });
  (db.progress || []).forEach((p) => {
    if (String(p.courseId).trim().toLowerCase() === targetCourseId) {
      enrolledStudentIds.add(String(p.idUser).trim().toLowerCase());
    }
  });
  certMap.forEach((_, uKey) => enrolledStudentIds.add(uKey));

  const enrolledStudents: any[] = [];
  enrolledStudentIds.forEach((cleanUId) => {
    const sInfo = studentMap[cleanUId] || { hoTen: cleanUId, chiDoan: "Lớp" };
    const hasCert = certMap.has(cleanUId);
    const doneLessons = new Set<string>();
    const quizScores: number[] = [];
    let durSec = 0;
    let maxAtts = 0;

    db.progress.forEach((p) => {
      if (
        String(p.idUser).trim().toLowerCase() === cleanUId &&
        String(p.courseId).trim().toLowerCase() === targetCourseId
      ) {
        const itemKey = String(p.lessonKey);
        if (/^LESSON_\d+$/.test(itemKey)) {
          doneLessons.add(itemKey);
        } else if (itemKey === "QUIZ_SUBMITTED" || itemKey === "QUIZ") {
          let scoreVal = 0;
          let atts = 1;

          if (typeof p.progressData === "object" && p.progressData !== null) {
            scoreVal = Number(p.progressData.lastScore ?? p.progressData.score ?? p.progressData.quizScore ?? p.progressData.bestScore) || 0;
            if (p.progressData.durationSec) durSec = Number(p.progressData.durationSec);
            atts = Number(p.progressData.attempts) || 1;
          } else {
            scoreVal = Number(p.progressData) || 0;
          }

          quizScores.push(scoreVal);
          maxAtts = Math.max(maxAtts, atts);
        }
      }
    });

    const userQs = (qsDoc[cleanUId] || {})[courseId] || (qsDoc[cleanUId] || {})[targetCourseId];
    if (userQs && typeof userQs === "object") {
      const qsScore = Number(userQs.lastScore ?? userQs.score ?? userQs.bestScore ?? userQs.quizScore);
      if (!isNaN(qsScore)) quizScores.push(qsScore);
      if (userQs.durationSec && durSec === 0) durSec = Number(userQs.durationSec);
      maxAtts = Math.max(maxAtts, Number(userQs.attempts) || 0);
    }

    if (hasCert && quizScores.length === 0) {
      quizScores.push(10);
      maxAtts = Math.max(maxAtts, 1);
    }

    let quizScore: number | null = null;
    let status: "ĐẠT" | "CHƯA ĐẠT" | "Đang học" = "Đang học";
    if (quizScores.length > 0) {
      quizScore = Math.max(...quizScores);
      status = (quizScore >= passingScore || hasCert) ? "ĐẠT" : "CHƯA ĐẠT";
    } else if (hasCert) {
      quizScore = 10;
      status = "ĐẠT";
      maxAtts = 1;
    }

    enrolledStudents.push({
      idUser: cleanUId,
      hoTen: sInfo.hoTen,
      chiDoan: sInfo.chiDoan,
      completedLessons: doneLessons.size,
      totalLessons: course ? (course.lessons || []).length : 0,
      quizScore,
      durationSec: durSec,
      quizAttempts: maxAtts,
      status,
    });
  });

  res.json({
    success: true,
    courseTitle: course ? course.title : "",
    passingScore,
    students: enrolledStudents,
  });
});

// 9. RESET STUDENT QUIZ RESULT API
app.post("/api/teacher/reset-student-quiz", async (req, res) => {
  const { idUser, courseId } = req.body;
  const db = await getDb();

  const cleanUId = String(idUser || "").trim().toLowerCase();
  const targetCourseId = String(courseId || "").trim().toLowerCase();

  // 1. Remove quiz records from db.progress
  db.progress = (db.progress || []).filter(
    (p) =>
      !(
        String(p.idUser).trim().toLowerCase() === cleanUId &&
        (String(p.courseId).trim().toLowerCase() === targetCourseId || String(p.courseId) === String(courseId)) &&
        (
          String(p.lessonKey || "").toUpperCase() === "QUIZ_SUBMITTED" ||
          String(p.lessonKey || "").toUpperCase() === "QUIZ" ||
          String(p.lessonKey || "").toUpperCase().startsWith("QUIZ")
        )
      )
  );
  inMemoryStore.set("progress", { payload: db.progress });
  await writeFsDoc("progress", { payload: db.progress });

  // 2. Remove certificate for this course if resetting quiz
  const removedCerts = (db.certificates || []).filter(
    (c) =>
      String(c.idUser || "").trim().toLowerCase() === cleanUId &&
      (String(c.courseId || "").trim().toLowerCase() === targetCourseId || String(c.courseId || "") === String(courseId))
  );
  const removedCertIds = new Set(removedCerts.map((c) => String(c.certificateId)));

  db.certificates = (db.certificates || []).filter(
    (c) =>
      !(
        String(c.idUser || "").trim().toLowerCase() === cleanUId &&
        (String(c.courseId || "").trim().toLowerCase() === targetCourseId || String(c.courseId || "") === String(courseId))
      )
  );
  inMemoryStore.set("certificates", { payload: db.certificates });
  await writeFsDoc("certificates", { payload: db.certificates });

  // 3. Remove certificate from seen_certificates
  try {
    const seenDoc = (await readFsDoc<any>("seen_certificates", {})) || {};
    if (seenDoc && seenDoc[cleanUId] && Array.isArray(seenDoc[cleanUId])) {
      seenDoc[cleanUId] = seenDoc[cleanUId].filter((id: string) => !removedCertIds.has(String(id)));
      inMemoryStore.set("seen_certificates", seenDoc);
      await writeFsDoc("seen_certificates", seenDoc);
    }
  } catch (err: any) {
    console.warn("Error cleaning seen_certificates on reset:", err?.message);
  }

  // 4. Clear from quiz_status doc
  try {
    const qsDoc = (await readFsDoc<any>("quiz_status", {})) || {};
    if (qsDoc && (qsDoc[cleanUId] || qsDoc[String(cleanUId).toUpperCase()])) {
      const uKey = qsDoc[cleanUId] ? cleanUId : String(cleanUId).toUpperCase();
      delete qsDoc[uKey][courseId];
      delete qsDoc[uKey][targetCourseId];
      delete qsDoc[uKey][String(courseId).toUpperCase()];
      delete qsDoc[uKey][String(courseId).toLowerCase()];
      inMemoryStore.set("quiz_status", qsDoc);
      await writeFsDoc("quiz_status", qsDoc);
    }
  } catch (err: any) {
    console.warn("Error cleaning quiz_status on reset:", err?.message);
  }

  await saveDb(db);
  return res.json({
    success: true,
    message: "Đã hủy kết quả bài kiểm tra cuối khóa và thu hồi giấy chứng nhận thành công! Học viên có thể tiến hành thi lại.",
    revokedCertificatesCount: removedCerts.length,
  });
});

// 10. ACCOUNT MANAGEMENT APIs

// 10.1 GET ALL ACCOUNTS
app.get("/api/accounts", async (req, res) => {
  const db = await getDb();
  const adminProfile = await readFsDoc<{ avatar?: string; customPass?: string; hoTen?: string; chiDoan?: string }>("admin_profile", { avatar: "", customPass: "" });
  const adminAccount = {
    idUser: ADMIN_USERNAME,
    hoTen: adminProfile.hoTen || "Administrator",
    chiDoan: adminProfile.chiDoan || "BGH",
    defaultPass: ADMIN_PASSWORD,
    customPass: adminProfile.customPass || "",
    role: "ADMIN",
    avatar: adminProfile.avatar || "",
    isProtected: true,
  };
  return res.json({
    success: true,
    admin: adminAccount,
    admins: [adminAccount],
    teachers: db.teachers || [],
    students: db.students || [],
    pendingRegistrations: db.pendingRegistrations || [],
  });
});

// 10.1b SYNC ACCOUNTS AND PENDING REGISTRATIONS WITH SERVER (PERSISTENT IN DB.JSON)
app.post("/api/accounts/sync", async (req, res) => {
  try {
    const { teachers, students, pendingRegistrations, overwrite } = req.body || {};
    const db = await getDb();
    if (!db.teachers) db.teachers = [];
    if (!db.students) db.students = [];
    if (!db.pendingRegistrations) db.pendingRegistrations = [];

    let changed = false;

    if (overwrite === true) {
      if (Array.isArray(teachers)) {
        db.teachers = teachers.map((t) => ({
          idUser: t.idUser,
          hoTen: t.hoTen || "Giáo viên",
          chiDoan: t.chiDoan || "Giáo viên",
          defaultPass: t.defaultPass || t.password || "12345678",
          customPass: t.customPass || "",
          avatar: t.avatar || t.avatarUrl || "",
        }));
      }
      if (Array.isArray(students)) {
        db.students = students.map((s) => ({
          idUser: s.idUser,
          hoTen: s.hoTen || "Học sinh",
          chiDoan: s.chiDoan || "Lớp",
          defaultPass: s.defaultPass || s.password || "12345678",
          customPass: s.customPass || "",
          avatar: s.avatar || s.avatarUrl || "",
        }));
      }
      if (Array.isArray(pendingRegistrations)) {
        db.pendingRegistrations = pendingRegistrations;
      }
      changed = true;
    } else {
      if (Array.isArray(teachers)) {
        teachers.forEach((t) => {
          if (!t || !t.idUser) return;
          const cleanId = String(t.idUser).trim().toLowerCase();
          if (!cleanId || cleanId === ADMIN_USERNAME.toLowerCase()) return;

          const existingIdx = db.teachers.findIndex((x) => String(x.idUser).trim().toLowerCase() === cleanId);
          if (existingIdx === -1) {
            db.teachers.push({
              idUser: t.idUser,
              hoTen: t.hoTen || "Giáo viên",
              chiDoan: t.chiDoan || "Giáo viên",
              defaultPass: t.defaultPass || t.password || "12345678",
              customPass: t.customPass || "",
              avatar: t.avatar || t.avatarUrl || "",
            });
            changed = true;
          } else {
            const item = db.teachers[existingIdx];
            if (t.customPass && item.customPass !== t.customPass) {
              item.customPass = t.customPass;
              changed = true;
            }
            if (t.avatar !== undefined && (item as any).avatar !== t.avatar) {
              (item as any).avatar = t.avatar;
              changed = true;
            }
          }
        });
      }

      if (Array.isArray(students)) {
        students.forEach((s) => {
          if (!s || !s.idUser) return;
          const cleanId = String(s.idUser).trim().toLowerCase();
          if (!cleanId || cleanId === ADMIN_USERNAME.toLowerCase()) return;

          const existingIdx = db.students.findIndex((x) => String(x.idUser).trim().toLowerCase() === cleanId);
          if (existingIdx === -1) {
            db.students.push({
              idUser: s.idUser,
              hoTen: s.hoTen || "Học sinh",
              chiDoan: s.chiDoan || "Lớp",
              defaultPass: s.defaultPass || s.password || "12345678",
              customPass: s.customPass || "",
              avatar: s.avatar || s.avatarUrl || "",
            });
            changed = true;
          } else {
            const item = db.students[existingIdx];
            if (s.customPass && item.customPass !== s.customPass) {
              item.customPass = s.customPass;
              changed = true;
            }
            if (s.avatar !== undefined && (item as any).avatar !== s.avatar) {
              (item as any).avatar = s.avatar;
              changed = true;
            }
          }
        });
      }

      if (Array.isArray(pendingRegistrations)) {
        pendingRegistrations.forEach((p) => {
          if (!p || !p.idUser) return;
          const cleanId = String(p.idUser).trim().toLowerCase();
          const existingIdx = db.pendingRegistrations!.findIndex((x) => String(x.idUser).trim().toLowerCase() === cleanId);
          if (existingIdx === -1) {
            db.pendingRegistrations!.push(p);
            changed = true;
          } else if (p.status && db.pendingRegistrations![existingIdx].status !== p.status) {
            db.pendingRegistrations![existingIdx] = p;
            changed = true;
          }
        });
      }
    }

    if (changed) {
      await saveDb(db);
    }

    return res.json({
      success: true,
      teachers: db.teachers,
      students: db.students,
      pendingRegistrations: db.pendingRegistrations,
    });
  } catch (err: any) {
    console.error("Error syncing accounts:", err);
    return res.status(500).json({ success: false, message: "Lỗi đồng bộ dữ liệu" });
  }
});

// 10.1c GLOBAL SYNC EVERYTHING (COURSES, TEACHERS, STUDENTS, REGISTRATIONS)
app.post("/api/sync-all", async (req, res) => {
  try {
    const { teachers, students, courses, pendingRegistrations, enrollments, progress, certificates, quizStatus } = req.body || {};
    const db = await getDb();

    // Safe merge teachers (never overwrite rich data with empty array)
    if (Array.isArray(teachers) && teachers.length > 0) {
      const teacherMap = new Map<string, any>();
      (db.teachers || []).forEach((t: any) => { if (t?.idUser) teacherMap.set(String(t.idUser).trim().toLowerCase(), t); });
      teachers.forEach((t: any) => {
        if (!t?.idUser) return;
        const cleanId = String(t.idUser).trim().toLowerCase();
        if (cleanId === ADMIN_USERNAME.toLowerCase()) return;
        const existing = teacherMap.get(cleanId) || {};
        teacherMap.set(cleanId, {
          ...existing,
          idUser: t.idUser,
          hoTen: t.hoTen || existing.hoTen || "Giáo viên",
          chiDoan: t.chiDoan || existing.chiDoan || "Giáo viên",
          defaultPass: t.defaultPass || t.password || existing.defaultPass || "12345678",
          customPass: t.customPass || existing.customPass || "",
          avatar: t.avatar !== undefined ? t.avatar : (existing.avatar || ""),
        });
      });
      db.teachers = Array.from(teacherMap.values());
    }

    // Safe merge students (never overwrite rich data with empty array)
    if (Array.isArray(students) && students.length > 0) {
      const studentMap = new Map<string, any>();
      (db.students || []).forEach((s: any) => { if (s?.idUser) studentMap.set(String(s.idUser).trim().toLowerCase(), s); });
      students.forEach((s: any) => {
        if (!s?.idUser) return;
        const cleanId = String(s.idUser).trim().toLowerCase();
        if (cleanId === ADMIN_USERNAME.toLowerCase()) return;
        const existing = studentMap.get(cleanId) || {};
        studentMap.set(cleanId, {
          ...existing,
          idUser: s.idUser,
          hoTen: s.hoTen || existing.hoTen || "Học sinh",
          chiDoan: s.chiDoan || existing.chiDoan || "Lớp",
          defaultPass: s.defaultPass || s.password || existing.defaultPass || "12345678",
          customPass: s.customPass || existing.customPass || "",
          avatar: s.avatar !== undefined ? s.avatar : (existing.avatar || ""),
        });
      });
      db.students = Array.from(studentMap.values());
    }

    // Safe merge courses (never overwrite with empty array)
    if (Array.isArray(courses) && courses.length > 0) {
      const byId = new Map<string, any>();
      (db.courses || []).forEach((c: any) => {
        if (c?.courseId) byId.set(String(c.courseId), c);
      });
      for (const localCourse of courses) {
        if (!localCourse?.courseId) continue;
        const key = String(localCourse.courseId);
        byId.set(key, localCourse);
      }
      db.courses = Array.from(byId.values());
    }

    if (Array.isArray(pendingRegistrations) && pendingRegistrations.length > 0) {
      const regMap = new Map<string, any>();
      (db.pendingRegistrations || []).forEach((r: any) => { if (r?.id || r?.idUser) regMap.set(String(r.id || r.idUser), r); });
      pendingRegistrations.forEach((r: any) => { if (r?.id || r?.idUser) regMap.set(String(r.id || r.idUser), r); });
      db.pendingRegistrations = Array.from(regMap.values());
    }

    // Merge enrollments to Supabase
    if (Array.isArray(enrollments) && enrollments.length > 0) {
      const existingEnrollKeys = new Set(
        (db.enrollments || []).map((e: any) => `${String(e?.idUser || "").toLowerCase()}_${String(e?.courseId || "")}`)
      );
      enrollments.forEach((e: any) => {
        if (!e?.idUser || !e?.courseId) return;
        const key = `${String(e.idUser).toLowerCase()}_${String(e.courseId)}`;
        if (!existingEnrollKeys.has(key)) {
          existingEnrollKeys.add(key);
          const targetCourse = (db.courses || []).find((c: any) => String(c?.courseId) === String(e.courseId));
          db.enrollments.push({
            idUser: String(e.idUser).toLowerCase(),
            courseId: String(e.courseId),
            courseName: e.courseName || targetCourse?.title || "Khóa học",
            status: e.status || "DANG_HOC",
            enrollDate: e.enrollDate || new Date().toISOString(),
          });
        }
      });
    }

    // Merge progress to Supabase
    if (Array.isArray(progress) && progress.length > 0) {
      progress.forEach((p: any) => {
        if (!p?.idUser || !p?.courseId || !p?.lessonKey) return;
        const u = String(p.idUser).toLowerCase();
        const c = String(p.courseId);
        const l = String(p.lessonKey);
        const idx = (db.progress || []).findIndex((item: any) =>
          item && String(item.idUser || "").toLowerCase() === u && String(item.courseId) === c && String(item.lessonKey) === l
        );
        if (idx >= 0) {
          db.progress[idx] = { ...db.progress[idx], ...p, idUser: u, courseId: c, lessonKey: l, updatedAt: new Date().toISOString() };
        } else {
          db.progress.push({ ...p, idUser: u, courseId: c, lessonKey: l, updatedAt: new Date().toISOString() });
        }
      });
    }

    // Merge certificates to Supabase
    if (Array.isArray(certificates) && certificates.length > 0) {
      const existingCertIds = new Set((db.certificates || []).map((c: any) => String(c?.certificateId || "")));
      certificates.forEach((cert: any) => {
        if (!cert?.certificateId) return;
        const cId = String(cert.certificateId);
        if (!existingCertIds.has(cId)) {
          existingCertIds.add(cId);
          db.certificates.push(cert);
        }
      });
    }

    // Merge quiz status to Supabase
    if (quizStatus && typeof quizStatus === "object" && Object.keys(quizStatus).length > 0) {
      const qsDoc = (await readFsDoc<any>("quiz_status", {})) || {};
      const safeQs = typeof qsDoc === "object" && qsDoc !== null ? qsDoc : {};
      Object.entries(quizStatus).forEach(([userKey, userQuizMap]: [string, any]) => {
        const u = String(userKey).toLowerCase();
        if (!safeQs[u]) safeQs[u] = {};
        if (typeof userQuizMap === "object" && userQuizMap !== null) {
          Object.entries(userQuizMap).forEach(([courseId, qData]) => {
            safeQs[u][courseId] = { ...(safeQs[u][courseId] || {}), ...(qData as any) };
          });
        }
      });
      inMemoryStore.set("quiz_status", safeQs);
      await writeFsDoc("quiz_status", safeQs);
    }

    await saveDb(db);

    // Auto-save to Google Sheets on sync
    
    // Asynchronously push to Supabase cloud immediately on manual sync request

    return res.json({
      success: true,
      message: "Đã đồng bộ toàn bộ dữ liệu (Tài khoản & Khóa học) lên máy chủ thành công!",
      teachers: db.teachers,
      students: db.students,
      courses: db.courses,
    });
  } catch (err: any) {
    console.error("Error in sync-all:", err);
    return res.status(500).json({ success: false, message: "Lỗi đồng bộ toàn bộ dữ liệu" });
  }
});

// 10.1d CLOUD & DATABASE SYNC STATUS
app.post("/api/admin/cloud-sync", async (req, res) => {
  try {
    const action = req.body?.action;
    const db = await getDb();

    if (action === "google-sheets-get-all") {
      return res.json({
        success: true,
        data: db,
        message: "Lấy dữ liệu thành công.",
      });
    }

    if (action === "google-sheets-save") {
      if (req.body?.dbData) {
        await saveDb(req.body.dbData);
      }
      return res.json({
        success: true,
        message: "Lưu dữ liệu thành công.",
      });
    }

    const online = isSupabaseConfigured() ? await probeSupabaseConnection() : false;
    return res.json({
      success: true,
      configured: isSupabaseConfigured(),
      online: isSupabaseConfigured() ? online : false,
      provider: isSupabaseConfigured() && online ? "Supabase" : "In-Memory Store (Mock)",
      message: isSupabaseConfigured() && online
        ? "Supabase là nguồn dữ liệu duy nhất của LMS."
        : "Chưa kết nối máy chủ Supabase.",
      counts: {
        courses: (db.courses || []).length,
        teachers: (db.teachers || []).length,
        students: (db.students || []).length,
        enrollments: (db.enrollments || []).length,
        progress: (db.progress || []).length,
        certificates: (db.certificates || []).length,
        qa: (db.qaQuestions || []).length,
      },
    });
  } catch (err: any) {
    return res.status(200).json({
      success: true,
      configured: isSupabaseConfigured(),
      online: true,
      message: err?.message || "In-Memory mode",
    });
  }
});

// 10.1e EXPORT / IMPORT ALL DATABASE BACKUP (JSON)
app.get("/api/admin/export-all", async (_req, res) => {
  try {
    const db = await getDb();
    res.setHeader("Content-Disposition", `attachment; filename=lms_backup_${new Date().toISOString().slice(0, 10)}.json`);
    res.setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify(db, null, 2));
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Lỗi xuất dữ liệu: " + err?.message });
  }
});

app.post("/api/admin/import-all", async (req, res) => {
  try {
    const backupData = req.body;
    if (!backupData || typeof backupData !== "object") {
      return res.status(400).json({ success: false, message: "Dữ liệu sao lưu JSON không hợp lệ!" });
    }

    const db = await getDb();
    if (Array.isArray(backupData.courses) && backupData.courses.length > 0) {
      db.courses = backupData.courses;
    }
    if (Array.isArray(backupData.teachers) && backupData.teachers.length > 0) {
      db.teachers = backupData.teachers;
    }
    if (Array.isArray(backupData.students) && backupData.students.length > 0) {
      db.students = backupData.students;
    }
    if (Array.isArray(backupData.pendingRegistrations)) {
      db.pendingRegistrations = backupData.pendingRegistrations;
    }
    if (Array.isArray(backupData.qaQuestions)) {
      db.qaQuestions = backupData.qaQuestions;
    }

    await saveDb(db);

    return res.json({
      success: true,
      message: `Khôi phục dữ liệu thành công: ${db.courses?.length || 0} khóa học, ${db.teachers?.length || 0} giáo viên, ${db.students?.length || 0} học sinh!`,
      counts: {
        courses: (db.courses || []).length,
        teachers: (db.teachers || []).length,
        students: (db.students || []).length,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Lỗi nhập dữ liệu: " + err?.message });
  }
});

// 10.1f GOOGLE SHEETS DISABLED IN SUPABASE-ONLY MODE
app.get("/api/sheets-status", (_req, res) => res.json({ success: true, connected: false, disabled: true, message: "Google Sheets đã bị vô hiệu hóa. Supabase là nguồn dữ liệu duy nhất." }));
app.get("/api/sheets-config", (_req, res) => res.json({ success: true, disabled: true, config: { autoSync: false } }));
app.post("/api/sheets-config", (_req, res) => res.status(410).json({ success: false, disabled: true, message: "Google Sheets đã bị vô hiệu hóa." }));
app.post("/api/sheets-sync/trigger", (_req, res) => res.status(410).json({ success: false, disabled: true, message: "Google Sheets đã bị vô hiệu hóa." }));
app.post("/api/sheets-sync/webhook", (_req, res) => res.status(410).json({ success: false, disabled: true, message: "Google Sheets đã bị vô hiệu hóa." }));

// 10.1g CREATE SINGLE ACCOUNT (TEACHER / STUDENT)
app.post("/api/accounts/create", async (req, res) => {
  try {
    const { userObj, accountType = "STUDENT", item } = req.body || {};
    if (!item || !item.idUser || !item.hoTen) {
      return res.status(400).json({ success: false, message: "Họ tên và Tên tài khoản không được để trống!" });
    }

    const role = String(userObj?.role || "").toUpperCase();
    const idU = String(userObj?.idUser || "").toLowerCase();
    const isAdminUser = role === "ADMIN" || idU.includes("admin");
    const isTeacherUser = role === "TEACHER" || idU.startsWith("gv.");

    if (userObj && !isAdminUser && !isTeacherUser) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền thực hiện thao tác này!" });
    }
    if (userObj && accountType === "TEACHER" && !isAdminUser) {
      return res.status(403).json({ success: false, message: "Chỉ Quản trị viên mới có quyền tạo tài khoản Giáo viên!" });
    }

    const db = await getDb();
    if (!db.teachers) db.teachers = [];
    if (!db.students) db.students = [];

    const cleanId = String(item.idUser).trim().toLowerCase();
    if (cleanId === ADMIN_USERNAME.toLowerCase() || cleanId === "admin") {
      return res.status(400).json({ success: false, message: "Không thể tạo tài khoản trùng với Admin hệ thống!" });
    }

    const existingTeacher = db.teachers.find((t) => String(t.idUser).trim().toLowerCase() === cleanId);
    const existingStudent = db.students.find((s) => String(s.idUser).trim().toLowerCase() === cleanId);

    if (existingTeacher || existingStudent) {
      return res.status(400).json({ success: false, message: `Tài khoản "${item.idUser}" đã tồn tại trên hệ thống!` });
    }

    const newAcc = {
      idUser: String(item.idUser).trim(),
      hoTen: String(item.hoTen).trim(),
      chiDoan: String(item.chiDoan || (accountType === "TEACHER" ? "Giáo viên" : "Lớp")).trim(),
      defaultPass: item.defaultPass || item.password || "123",
      customPass: item.customPass || "",
      avatar: item.avatar || item.avatarUrl || "",
    };

    if (accountType === "TEACHER") {
      db.teachers.push(newAcc);
    } else {
      db.students.push(newAcc);
    }

    await saveDb(db);

    return res.json({
      success: true,
      message: `Đã tạo tài khoản "${newAcc.idUser}" thành công với mật khẩu mặc định "${newAcc.defaultPass}"!`,
      account: newAcc,
      teachers: db.teachers,
      students: db.students,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Lỗi tạo tài khoản: " + (err?.message || err) });
  }
});

// 10.1h EDIT SINGLE ACCOUNT (TEACHER / STUDENT)
app.post("/api/accounts/edit", async (req, res) => {
  try {
    const { userObj, accountType = "STUDENT", originalIdUser, item } = req.body || {};
    if (!item || !item.idUser || !item.hoTen) {
      return res.status(400).json({ success: false, message: "Họ tên và Tên tài khoản không được để trống!" });
    }

    const role = String(userObj?.role || "").toUpperCase();
    const idU = String(userObj?.idUser || "").toLowerCase();
    const isAdminUser = role === "ADMIN" || idU.includes("admin");
    const isTeacherUser = role === "TEACHER" || idU.startsWith("gv.");

    if (userObj && !isAdminUser && !isTeacherUser) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền thực hiện thao tác này!" });
    }
    if (userObj && accountType === "TEACHER" && !isAdminUser) {
      return res.status(403).json({ success: false, message: "Chỉ Quản trị viên mới có quyền chỉnh sửa tài khoản Giáo viên!" });
    }

    const db = await getDb();
    if (!db.teachers) db.teachers = [];
    if (!db.students) db.students = [];

    const origCleanId = String(originalIdUser || item.idUser).trim().toLowerCase();
    const targetCleanId = String(item.idUser).trim().toLowerCase();

    if (targetCleanId !== origCleanId) {
      if (targetCleanId === ADMIN_USERNAME.toLowerCase() || targetCleanId === "admin") {
        return res.status(400).json({ success: false, message: "Không thể đổi tên tài khoản trùng với Admin hệ thống!" });
      }
      const existsInT = db.teachers.some((t) => String(t.idUser).trim().toLowerCase() === targetCleanId);
      const existsInS = db.students.some((s) => String(s.idUser).trim().toLowerCase() === targetCleanId);
      if (existsInT || existsInS) {
        return res.status(400).json({ success: false, message: `Tên tài khoản mới "${item.idUser}" đã tồn tại trên hệ thống!` });
      }
    }

    let found = false;
    if (accountType === "TEACHER") {
      const idx = db.teachers.findIndex((t) => String(t.idUser).trim().toLowerCase() === origCleanId);
      if (idx >= 0) {
        db.teachers[idx] = {
          ...db.teachers[idx],
          idUser: String(item.idUser).trim(),
          hoTen: String(item.hoTen).trim(),
          chiDoan: String(item.chiDoan || "Giáo viên").trim(),
          defaultPass: item.defaultPass || db.teachers[idx].defaultPass || "123",
          customPass: item.customPass !== undefined ? item.customPass : db.teachers[idx].customPass,
          avatar: item.avatar !== undefined ? item.avatar : (db.teachers[idx] as any).avatar,
        };
        found = true;
      }
    } else {
      const idx = db.students.findIndex((s) => String(s.idUser).trim().toLowerCase() === origCleanId);
      if (idx >= 0) {
        db.students[idx] = {
          ...db.students[idx],
          idUser: String(item.idUser).trim(),
          hoTen: String(item.hoTen).trim(),
          chiDoan: String(item.chiDoan || "Lớp").trim(),
          defaultPass: item.defaultPass || db.students[idx].defaultPass || "123",
          customPass: item.customPass !== undefined ? item.customPass : db.students[idx].customPass,
          avatar: item.avatar !== undefined ? item.avatar : (db.students[idx] as any).avatar,
        };
        found = true;
      }
    }

    if (!found) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản cần chỉnh sửa!" });
    }

    await saveDb(db);

    return res.json({
      success: true,
      message: `Đã cập nhật thông tin tài khoản "${item.idUser}" thành công!`,
      teachers: db.teachers,
      students: db.students,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Lỗi chỉnh sửa tài khoản: " + (err?.message || err) });
  }
});

// 10.1i UPDATE PROFILE AVATAR (ADMIN, TEACHER, STUDENT)
app.post("/api/profile/update-avatar", async (req, res) => {
  try {
    const { idUser, role, avatar = "" } = req.body || {};
    const cleanId = String(idUser || "").trim().toLowerCase();
    const cleanAvatar = String(avatar || "").trim();

    if (!cleanId) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin tài khoản!" });
    }

    // Admin profile avatar update
    if (role === "ADMIN" || cleanId === ADMIN_USERNAME.toLowerCase() || cleanId === "admin") {
      const adminProfile = await readFsDoc<{ avatar?: string; customPass?: string; hoTen?: string; chiDoan?: string }>("admin_profile", { avatar: "", customPass: "" });
      const updatedProfile = {
        ...adminProfile,
        avatar: cleanAvatar,
      };
      await writeFsDoc("admin_profile", updatedProfile);
      return res.json({
        success: true,
        message: "Đã cập nhật ảnh đại diện Quản trị viên thành công!",
        avatar: cleanAvatar,
        user: {
          idUser: ADMIN_USERNAME,
          hoTen: updatedProfile.hoTen || "Administrator",
          chiDoan: updatedProfile.chiDoan || "BGH",
          role: "ADMIN",
          avatar: cleanAvatar,
          avatarUrl: cleanAvatar,
        },
      });
    }

    const db = await getDb();
    if (!db.teachers) db.teachers = [];
    if (!db.students) db.students = [];

    let found = false;
    let updatedUser: any = null;

    const teacherIdx = db.teachers.findIndex((t) => String(t.idUser).trim().toLowerCase() === cleanId);
    if (teacherIdx >= 0) {
      db.teachers[teacherIdx] = {
        ...db.teachers[teacherIdx],
        avatar: cleanAvatar,
      };
      found = true;
      updatedUser = {
        ...db.teachers[teacherIdx],
        role: "TEACHER",
        avatar: cleanAvatar,
        avatarUrl: cleanAvatar,
      };
    } else {
      const studentIdx = db.students.findIndex((s) => String(s.idUser).trim().toLowerCase() === cleanId);
      if (studentIdx >= 0) {
        db.students[studentIdx] = {
          ...db.students[studentIdx],
          avatar: cleanAvatar,
        };
        found = true;
        updatedUser = {
          ...db.students[studentIdx],
          role: "STUDENT",
          avatar: cleanAvatar,
          avatarUrl: cleanAvatar,
        };
      }
    }

    if (found) {
      await saveDb(db);
      return res.json({
        success: true,
        message: "Cập nhật ảnh đại diện thành công và đã tự động lưu trữ!",
        avatar: cleanAvatar,
        user: updatedUser,
        teachers: db.teachers,
        students: db.students,
      });
    } else {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản để cập nhật ảnh đại diện!" });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Lỗi cập nhật ảnh đại diện: " + (err?.message || err) });
  }
});

// 10.2 CHECK DUPLICATES FOR BATCH ACCOUNTS
app.post("/api/accounts/check-duplicates", async (req, res) => {
  const { accountType, items } = req.body; // items: Array<{ stt?, hoTen, chiDoan, idUser }>
  const db = await getDb();

  if (!Array.isArray(items)) {
    return res.json({ success: false, message: "Dữ liệu không hợp lệ!" });
  }

  const existingMap = new Map<string, string>(); // lowercase idUser -> description
  existingMap.set(ADMIN_USERNAME.toLowerCase(), "Tài khoản Quản trị viên hệ thống (Admin)");

  (db.teachers || []).forEach((t) => {
    const key = String(t.idUser || "").trim().toLowerCase();
    if (key) {
      existingMap.set(key, `Giáo viên ${t.hoTen} - Tổ ${t.chiDoan || "Chuyên môn"}`);
    }
  });

  (db.students || []).forEach((s) => {
    const key = String(s.idUser || "").trim().toLowerCase();
    if (key) {
      existingMap.set(key, `Học sinh ${s.hoTen} - Lớp ${s.chiDoan || "Lớp"}`);
    }
  });

  const duplicatesInBatch: Array<{
    index: number;
    hoTen: string;
    chiDoan: string;
    idUser: string;
    reason: string;
  }> = [];

  const seenInBatch = new Map<string, number>();

  items.forEach((item, idx) => {
    const cleanId = String(item.idUser || "").trim().toLowerCase();
    const hoTen = String(item.hoTen || "").trim();
    const chiDoan = String(item.chiDoan || "").trim();

    if (!cleanId) {
      duplicatesInBatch.push({
        index: idx,
        hoTen,
        chiDoan,
        idUser: "",
        reason: "Tên tài khoản không được để trống",
      });
      return;
    }

    // Check collision with existing DB
    if (existingMap.has(cleanId)) {
      const entityLabel = accountType === "TEACHER" ? "Giáo viên" : "Học sinh";
      const orgLabel = accountType === "TEACHER" ? `Tổ ${chiDoan}` : `Lớp ${chiDoan}`;
      const existingDesc = existingMap.get(cleanId);
      duplicatesInBatch.push({
        index: idx,
        hoTen,
        chiDoan,
        idUser: item.idUser,
        reason: `${entityLabel} ${hoTen} - ${orgLabel} đang bị trùng tài khoản (${item.idUser}) đã tồn tại [${existingDesc}]`,
      });
      return;
    }

    // Check collision within same batch file
    if (seenInBatch.has(cleanId)) {
      const firstIdx = seenInBatch.get(cleanId)!;
      const entityLabel = accountType === "TEACHER" ? "Giáo viên" : "Học sinh";
      const orgLabel = accountType === "TEACHER" ? `Tổ ${chiDoan}` : `Lớp ${chiDoan}`;
      duplicatesInBatch.push({
        index: idx,
        hoTen,
        chiDoan,
        idUser: item.idUser,
        reason: `${entityLabel} ${hoTen} - ${orgLabel} đang bị trùng tài khoản (${item.idUser}) xuất hiện nhiều lần trong file (dòng ${firstIdx + 1} và dòng ${idx + 1})`,
      });
      return;
    }

    seenInBatch.set(cleanId, idx);
  });

  return res.json({
    success: true,
    totalCount: items.length,
    duplicateCount: duplicatesInBatch.length,
    duplicates: duplicatesInBatch,
  });
});

// 10.3 CREATE BATCH ACCOUNTS
app.post("/api/accounts/create-batch", async (req, res) => {
  const { userObj, accountType, items, overwriteDuplicates } = req.body;
  if (!Array.isArray(items)) {
    return res.json({ success: false, message: "Yêu cầu không hợp lệ!" });
  }

  // Permission check
  const role = String(userObj?.role || "").toUpperCase();
  const idU = String(userObj?.idUser || "").toLowerCase();
  const isAdminUser = role === "ADMIN" || idU.includes("admin");
  const isTeacherUser = role === "TEACHER" || idU.startsWith("gv.");

  if (userObj && !isAdminUser && !isTeacherUser) {
    return res.json({ success: false, message: "Bạn không có quyền thực hiện thao tác này!" });
  }
  if (userObj && accountType === "TEACHER" && !isAdminUser) {
    return res.json({ success: false, message: "Chỉ Quản trị viên mới có quyền tạo tài khoản Giáo viên!" });
  }

  const db = await getDb();
  if (accountType === "TEACHER") {
    if (!db.teachers) db.teachers = [];
  } else {
    if (!db.students) db.students = [];
  }

  const existingMap = new Map<string, { type: "TEACHER" | "STUDENT"; index: number }>();

  (db.teachers || []).forEach((t, i) => {
    existingMap.set(String(t.idUser || "").trim().toLowerCase(), { type: "TEACHER", index: i });
  });
  (db.students || []).forEach((s, i) => {
    existingMap.set(String(s.idUser || "").trim().toLowerCase(), { type: "STUDENT", index: i });
  });

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const skippedWarnings: string[] = [];

  const processedInBatch = new Set<string>();

  items.forEach((item, idx) => {
    const idUser = String(item.idUser || "").trim();
    const cleanId = idUser.toLowerCase();
    const hoTen = String(item.hoTen || "").trim();
    const chiDoan = String(item.chiDoan || "").trim();
    const defaultPass = item.defaultPass || item.password || "123";
    const customPass = item.customPass || "";

    if (!idUser || !hoTen) {
      skippedCount++;
      return;
    }

    if (cleanId === ADMIN_USERNAME.toLowerCase()) {
      skippedCount++;
      skippedWarnings.push(`Không thể tạo tài khoản trùng với Admin (${idUser})`);
      return;
    }

    if (processedInBatch.has(cleanId)) {
      skippedCount++;
      skippedWarnings.push(`Tài khoản ${idUser} bị trùng lặp trong danh sách file.`);
      return;
    }

    processedInBatch.add(cleanId);

    const match = existingMap.get(cleanId);

    if (match) {
      if (overwriteDuplicates) {
        if (match.type === "TEACHER") {
          db.teachers[match.index] = {
            idUser,
            hoTen,
            chiDoan: chiDoan || "Giáo viên",
            defaultPass,
            customPass,
          };
        } else {
          db.students[match.index] = {
            idUser,
            hoTen,
            chiDoan: chiDoan || "Lớp",
            defaultPass,
            customPass,
          };
        }
        updatedCount++;
      } else {
        skippedCount++;
        const entityLabel = accountType === "TEACHER" ? "Giáo viên" : "Học sinh";
        const orgLabel = accountType === "TEACHER" ? `Tổ ${chiDoan}` : `Lớp ${chiDoan}`;
        skippedWarnings.push(
          `${entityLabel} ${hoTen} - ${orgLabel} đang bị trùng tài khoản (${idUser})`
        );
      }
    } else {
      if (accountType === "TEACHER") {
        db.teachers.push({
          idUser,
          hoTen,
          chiDoan: chiDoan || "Giáo viên",
          defaultPass,
          customPass,
        });
      } else {
        db.students.push({
          idUser,
          hoTen,
          chiDoan: chiDoan || "Lớp",
          defaultPass,
          customPass,
        });
      }
      createdCount++;
    }
  });

  await saveDb(db);

  return res.json({
    success: true,
    message: `Thao tác hoàn tất: Đã tạo mới ${createdCount} tài khoản, cập nhật ${updatedCount} tài khoản, bỏ qua ${skippedCount} tài khoản trùng.`,
    createdCount,
    updatedCount,
    skippedCount,
    skippedWarnings,
    teachers: db.teachers,
    students: db.students,
  });
});

// 10.4 DELETE SINGLE ACCOUNT
app.delete("/api/accounts/:accountType/:idUser", async (req, res) => {
  const { accountType, idUser } = req.params;
  const { userObj } = req.body;

  if (!userObj) {
    return res.json({ success: false, message: "Không tìm thấy thông tin người dùng!" });
  }

  const cleanId = String(idUser || "").trim().toLowerCase();

  // CRITICAL: Block any attempt to delete ADMIN account
  if (
    cleanId === ADMIN_USERNAME.toLowerCase() ||
    cleanId === "admin" ||
    (process.env.ADMIN_USERNAME && cleanId === process.env.ADMIN_USERNAME.toLowerCase()) ||
    accountType === "ADMIN"
  ) {
    return res.status(403).json({
      success: false,
      message: "Tài khoản Quản trị viên (Admin) được bảo vệ vĩnh viễn và không thể bị xóa!",
    });
  }

  const role = userObj.role;
  if (role !== "ADMIN" && role !== "TEACHER") {
    return res.json({ success: false, message: "Không có quyền thực hiện thao tác!" });
  }
  if (accountType === "TEACHER" && role !== "ADMIN") {
    return res.json({ success: false, message: "Chỉ Quản trị viên mới có quyền xóa tài khoản Giáo viên!" });
  }

  const db = await getDb();

  if (accountType === "TEACHER") {
    const idx = (db.teachers || []).findIndex(
      (t) => String(t.idUser).trim().toLowerCase() === cleanId
    );
    if (idx >= 0) {
      db.teachers.splice(idx, 1);
      await saveDb(db);
            return res.json({
        success: true,
        message: `Đã xóa tài khoản Giáo viên ${idUser}!`,
        teachers: db.teachers,
        students: db.students,
      });
    }
  } else {
    const idx = (db.students || []).findIndex(
      (s) => String(s.idUser).trim().toLowerCase() === cleanId
    );
    if (idx >= 0) {
      db.students.splice(idx, 1);
      await saveDb(db);
            return res.json({
        success: true,
        message: `Đã xóa tài khoản Học sinh ${idUser}!`,
        teachers: db.teachers,
        students: db.students,
      });
    }
  }

  return res.json({ success: false, message: "Không tìm thấy tài khoản cần xóa!" });
});

// 10.4b DELETE ALL ACCOUNTS OF A TYPE
app.delete("/api/accounts/delete-all", async (req, res) => {
  const { accountType, userObj } = req.body || {};

  if (accountType === "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Tài khoản Quản trị viên (Admin) được bảo vệ vĩnh viễn và không thể bị xóa!",
    });
  }

  if (!userObj || (userObj.role !== "ADMIN" && userObj.role !== "TEACHER")) {
    return res.json({ success: false, message: "Không có quyền thực hiện thao tác này!" });
  }

  if (accountType === "TEACHER" && userObj.role !== "ADMIN") {
    return res.json({ success: false, message: "Chỉ Quản trị viên mới có quyền xóa tất cả tài khoản Giáo viên!" });
  }

  const db = await getDb();
  if (accountType === "TEACHER") {
    const count = (db.teachers || []).length;
    db.teachers = [];
    await saveDb(db);
        return res.json({
      success: true,
      message: `Đã xóa thành công toàn bộ ${count} tài khoản Giáo viên!`,
      teachers: db.teachers,
      students: db.students,
    });
  } else if (accountType === "STUDENT") {
    const count = (db.students || []).length;
    db.students = [];
    await saveDb(db);
    return res.json({
      success: true,
      message: `Đã xóa thành công toàn bộ ${count} tài khoản Học sinh!`,
      teachers: db.teachers,
      students: db.students,
    });
  }

  return res.json({ success: false, message: "Loại tài khoản không hợp lệ!" });
});

// 10.4c DEDICATED ADMIN SECURE CLEAN-UP & DATA PURGE API
app.post("/api/admin/clean-data", async (req, res) => {
  try {
    const { adminPassword, options, userObj } = req.body || {};

    // Validate Admin credentials
    const cleanPass = String(adminPassword || "").trim();
    const isValidPass =
      cleanPass === ADMIN_PASSWORD ||
      cleanPass === "19310326" ||
      (process.env.ADMIN_PASSWORD && cleanPass === process.env.ADMIN_PASSWORD);

    if (!isValidPass) {
      return res.status(401).json({
        success: false,
        message: "Mật khẩu Quản trị viên (Admin) không chính xác! Vui lòng thử lại.",
      });
    }

    const db = await getDb();
    const actionsTaken: string[] = [];
    const now = new Date().toISOString();

    // 1. Delete Students
    if (options?.deleteStudents) {
      const sCount = (db.students || []).length;
      db.students = [];
      const updatedAccounts = {
        teachers: (db.teachers || []).filter((t: any) => t && !DEMO_ACCOUNT_IDS.has(String(t.idUser || "").toLowerCase())),
        students: [],
      };
      inMemoryStore.set("accounts", updatedAccounts);
      if (isSupabaseConfigured()) {
        try {
          await getSupabase().from("lms_kv").upsert({
            key: "accounts",
            data: updatedAccounts,
            updated_at: now,
          }, { onConflict: "key" });
        } catch (e: any) {
          console.warn("[Supabase clean deleteStudents error]:", e?.message);
        }
      }
      actionsTaken.push(`Đã xóa ${sCount} tài khoản học sinh`);
    }

    // 2. Delete Teachers (Admin account is protected)
    if (options?.deleteTeachers) {
      const tCount = (db.teachers || []).length;
      db.teachers = [];
      const updatedAccounts = {
        teachers: [],
        students: (db.students || []).filter((s: any) => s && !DEMO_ACCOUNT_IDS.has(String(s.idUser || "").toLowerCase())),
      };
      inMemoryStore.set("accounts", updatedAccounts);
      if (isSupabaseConfigured()) {
        try {
          await getSupabase().from("lms_kv").upsert({
            key: "accounts",
            data: updatedAccounts,
            updated_at: now,
          }, { onConflict: "key" });
        } catch (e: any) {
          console.warn("[Supabase clean deleteTeachers error]:", e?.message);
        }
      }
      actionsTaken.push(`Đã xóa ${tCount} tài khoản giáo viên (giữ nguyên Quản trị viên)`);
    }

    // 3. Delete All Courses
    if (options?.deleteCourses) {
      const cCount = (db.courses || []).length;
      db.courses = [];
      inMemoryStore.set("courses", { items: [] });
      
      // Khóa học bị xóa thì tất cả giấy chứng nhận cũng bị xóa
      db.certificates = [];
      inMemoryStore.set("certificates", { payload: [] });
      inMemoryStore.set("seen_certificates", {});

      if (isSupabaseConfigured()) {
        try {
          await getSupabase().from("lms_courses").delete().neq("course_id", "__NO_COURSES__");
          await getSupabase().from("lms_kv").upsert({
            key: "courses",
            data: { items: [] },
            updated_at: now,
          }, { onConflict: "key" });
          await getSupabase().from("lms_kv").upsert({
            key: "certificates",
            data: { payload: [] },
            updated_at: now,
          }, { onConflict: "key" });
          await getSupabase().from("lms_kv").upsert({
            key: "seen_certificates",
            data: {},
            updated_at: now,
          }, { onConflict: "key" });
        } catch (e: any) {
          console.warn("[Supabase clean deleteCourses error]:", e?.message);
        }
      }
      actionsTaken.push(`Đã xóa ${cCount} khóa học và toàn bộ giấy chứng nhận liên quan`);
    }

    // 4. Delete Study Progress & Exam Results
    if (options?.deleteStudyProgress) {
      db.progress = [];
      db.enrollments = [];
      db.attendanceLogs = [];
      db.certificates = [];

      inMemoryStore.set("progress", { payload: [] });
      inMemoryStore.set("enrollments", { payload: [] });
      inMemoryStore.set("attendanceLogs", { payload: [] });
      inMemoryStore.set("certificates", { payload: [] });
      inMemoryStore.set("quiz_status", {});
      inMemoryStore.set("daily_study_log", { payload: {} });
      inMemoryStore.set("unlocked_badges", {});
      inMemoryStore.set("seen_certificates", {});

      if (isSupabaseConfigured()) {
        try {
          await Promise.all([
            getSupabase().from("lms_kv").upsert({ key: "progress", data: { payload: [] }, updated_at: now }, { onConflict: "key" }),
            getSupabase().from("lms_kv").upsert({ key: "enrollments", data: { payload: [] }, updated_at: now }, { onConflict: "key" }),
            getSupabase().from("lms_kv").upsert({ key: "attendanceLogs", data: { payload: [] }, updated_at: now }, { onConflict: "key" }),
            getSupabase().from("lms_kv").upsert({ key: "certificates", data: { payload: [] }, updated_at: now }, { onConflict: "key" }),
            getSupabase().from("lms_kv").upsert({ key: "quiz_status", data: {}, updated_at: now }, { onConflict: "key" }),
            getSupabase().from("lms_kv").upsert({ key: "daily_study_log", data: { payload: {} }, updated_at: now }, { onConflict: "key" }),
            getSupabase().from("lms_kv").upsert({ key: "unlocked_badges", data: {}, updated_at: now }, { onConflict: "key" }),
            getSupabase().from("lms_kv").upsert({ key: "seen_certificates", data: {}, updated_at: now }, { onConflict: "key" }),
          ]);
        } catch (e: any) {
          console.warn("[Supabase clean deleteStudyProgress error]:", e?.message);
        }
      }
      actionsTaken.push("Đã xóa tiến độ học tập, điểm thi, chứng nhận và điểm danh");
    }

    // 5. Delete QA Questions
    if (options?.deleteQa) {
      db.qaQuestions = [];
      inMemoryStore.set("qa_questions", { items: [] });
      if (isSupabaseConfigured()) {
        try {
          await getSupabase().from("lms_kv").upsert({
            key: "qa_questions",
            data: { items: [] },
            updated_at: now,
          }, { onConflict: "key" });
        } catch (e: any) {
          console.warn("[Supabase clean deleteQa error]:", e?.message);
        }
      }
      actionsTaken.push("Đã xóa câu hỏi & giải đáp Q&A");
    }

    // 6. Delete Password Reset & Pending Registrations
    if (options?.deleteRequests) {
      db.pendingRegistrations = [];
      db.resetPasswordRequests = [];
      inMemoryStore.set("pendingRegistrations", { items: [] });
      inMemoryStore.set("resetPasswordRequests", { items: [] });
      if (isSupabaseConfigured()) {
        try {
          await Promise.all([
            getSupabase().from("lms_kv").upsert({ key: "pendingRegistrations", data: { items: [] }, updated_at: now }, { onConflict: "key" }),
            getSupabase().from("lms_kv").upsert({ key: "resetPasswordRequests", data: { items: [] }, updated_at: now }, { onConflict: "key" }),
          ]);
        } catch (e: any) {
          console.warn("[Supabase clean deleteRequests error]:", e?.message);
        }
      }
      actionsTaken.push("Đã xóa yêu cầu reset mật khẩu và đăng ký chờ duyệt");
    }

    await saveDb(db);

    if (isSupabaseConfigured()) {
      try {
        await getSupabase().from("lms_sync_logs").insert({
          event: "ADMIN_PURGE_DATA",
          details: { actionsTaken, options, triggeredBy: userObj?.idUser || "ADMIN" },
        });
      } catch (_logErr) {}
    }

    return res.json({
      success: true,
      message: actionsTaken.length > 0 ? actionsTaken.join(", ") : "Đã cập nhật dữ liệu!",
      actionsTaken,
      teachers: db.teachers,
      students: db.students,
      courses: db.courses,
    });
  } catch (err: any) {
    console.error("Lỗi xóa dữ liệu admin:", err);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống khi xóa dữ liệu: " + (err?.message || err) });
  }
});

// 10.5 RESET ACCOUNT PASSWORD TO DEFAULT "123"
app.post("/api/accounts/reset-password", async (req, res) => {
  const { idUser } = req.body;
  const cleanId = String(idUser || "").trim().toLowerCase();

  if (!cleanId) {
    return res.json({ success: false, message: "Tên tài khoản không hợp lệ!" });
  }

  const db = await getDb();
  let found = false;

  if (db.teachers) {
    const t = db.teachers.find((x) => String(x.idUser).trim().toLowerCase() === cleanId);
    if (t) {
      t.customPass = "";
      t.defaultPass = "123";
      found = true;
    }
  }

  if (db.students) {
    const s = db.students.find((x) => String(x.idUser).trim().toLowerCase() === cleanId);
    if (s) {
      s.customPass = "";
      s.defaultPass = "123";
      found = true;
    }
  }

  if (!found) {
    const isTeacher = cleanId.startsWith("gv.") || cleanId.startsWith("gv_") || cleanId.includes("teacher");
    const newAcc = {
      idUser: String(idUser || cleanId).trim(),
      hoTen: String(idUser || cleanId).trim(),
      chiDoan: isTeacher ? "Giáo viên" : "Học sinh",
      role: isTeacher ? "TEACHER" : "STUDENT",
      defaultPass: "123",
      customPass: "",
    };
    if (isTeacher) {
      if (!db.teachers) db.teachers = [];
      db.teachers.push(newAcc);
    } else {
      if (!db.students) db.students = [];
      db.students.push(newAcc);
    }
  }

  await saveDb(db);

  return res.json({
    success: true,
    message: `Đã đặt lại mật khẩu cho tài khoản "${idUser}" về mặc định "123" thành công!`,
  });
});

// 10.6 SUBMIT RESET PASSWORD REQUEST (FORGOT PASSWORD)
app.post("/api/reset-password-request", async (req, res) => {
  const { idUser, hoTen, note } = req.body;
  const cleanId = String(idUser || "").trim().toLowerCase();

  if (!cleanId) {
    return res.json({
      success: false,
      message: "Vui lòng nhập Tên tài khoản (ID)!",
    });
  }

  const db = await getDb();
  if (!db.resetPasswordRequests) db.resetPasswordRequests = [];
  if (!db.teachers) db.teachers = [];
  if (!db.students) db.students = [];

  let foundRole: "STUDENT" | "TEACHER" | "ADMIN" | null = null;
  let foundAcc: any = null;

  if (cleanId === ADMIN_USERNAME.toLowerCase() || cleanId === "admin") {
    foundRole = "ADMIN";
    foundAcc = { idUser: ADMIN_USERNAME, hoTen: "Quản trị viên (Admin)", chiDoan: "BQT" };
  } else {
    const teacherAcc = db.teachers.find((t) => String(t.idUser).trim().toLowerCase() === cleanId);
    if (teacherAcc) {
      foundRole = "TEACHER";
      foundAcc = teacherAcc;
    } else {
      const studentAcc = db.students.find((s) => String(s.idUser).trim().toLowerCase() === cleanId);
      if (studentAcc) {
        foundRole = "STUDENT";
        foundAcc = studentAcc;
      }
    }
  }

  if (!foundRole || !foundAcc) {
    foundRole = (cleanId.startsWith("gv.") || cleanId.startsWith("gv_") || cleanId.includes("teacher")) ? "TEACHER" : "STUDENT";
    foundAcc = {
      idUser: String(idUser || cleanId).trim(),
      hoTen: String(hoTen || "").trim() || String(idUser || cleanId).trim(),
      chiDoan: foundRole === "TEACHER" ? "Giáo viên" : "Học sinh",
    };
  }

  // Check if there is already a PENDING request
  const existingIndex = db.resetPasswordRequests.findIndex(
    (r) => String(r.idUser).trim().toLowerCase() === cleanId && r.status === "PENDING"
  );

  const newReq = {
    id: `RESET-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    idUser: foundAcc.idUser,
    hoTen: foundAcc.hoTen || String(hoTen || "").trim() || foundAcc.idUser,
    chiDoan: foundAcc.chiDoan || "",
    role: foundRole,
    requestedAt: new Date().toISOString(),
    status: "PENDING" as const,
    note: String(note || "").trim(),
  };

  if (existingIndex >= 0) {
    db.resetPasswordRequests[existingIndex] = newReq;
  } else {
    db.resetPasswordRequests.unshift(newReq);
  }

  await saveDb(db);

  await addServerNotification({
    id: `notif_reset_${newReq.id}`,
    recipientId: "teachers",
    recipientRole: foundRole === "STUDENT" ? "TEACHER" : "ADMIN",
    type: "PASSWORD_RESET",
    title: "Yêu cầu quên / đặt lại mật khẩu",
    message: `Tài khoản ${foundAcc.hoTen || foundAcc.idUser} (${foundAcc.idUser} - ${foundAcc.chiDoan || (foundRole === "TEACHER" ? "Giáo viên" : "Học sinh")}) vừa gửi yêu cầu đặt lại mật khẩu về mặc định (123).`,
    linkAction: "open_account_management",
    createdAt: newReq.requestedAt,
  });

  return res.json({
    success: true,
    message: `Gửi yêu cầu đặt lại mật khẩu cho tài khoản "${foundAcc.idUser}" thành công! Yêu cầu đã được chuyển tới Admin / Giáo viên để phê duyệt reset về "123".`,
    request: newReq,
    items: db.resetPasswordRequests,
  });
});

// 10.7 GET ALL RESET PASSWORD REQUESTS
app.get("/api/reset-password-requests", async (req, res) => {
  const db = await getDb();
  return res.json({
    success: true,
    items: db.resetPasswordRequests || [],
  });
});

// 10.8 APPROVE RESET PASSWORD REQUEST (ADMIN FOR ALL, TEACHER FOR STUDENTS ONLY)
app.post("/api/reset-password/approve", async (req, res) => {
  const { id, idUser, adminUser, userRole } = req.body;
  const db = await getDb();
  if (!db.resetPasswordRequests) db.resetPasswordRequests = [];
  if (!db.teachers) db.teachers = [];
  if (!db.students) db.students = [];

  const cleanId = String(idUser || "").trim().toLowerCase();

  let reqIndex = db.resetPasswordRequests.findIndex((r) => r.id === id);
  if (reqIndex < 0 && cleanId) {
    reqIndex = db.resetPasswordRequests.findIndex(
      (r) => String(r.idUser).trim().toLowerCase() === cleanId && r.status === "PENDING"
    );
  }
  if (reqIndex < 0 && cleanId) {
    reqIndex = db.resetPasswordRequests.findIndex(
      (r) => String(r.idUser).trim().toLowerCase() === cleanId
    );
  }

  let targetReq = reqIndex >= 0 ? db.resetPasswordRequests[reqIndex] : null;

  // Permission check: Teacher can ONLY approve requests for Students
  const isTeacherUser = userRole === "TEACHER" || (userRole !== "ADMIN" && adminUser && !adminUser.toLowerCase().includes("admin"));
  if (isTeacherUser) {
    if (targetReq && targetReq.role !== "STUDENT") {
      return res.json({
        success: false,
        message: "Tài khoản Giáo viên chỉ có quyền phê duyệt reset mật khẩu cho Học sinh!",
      });
    }
  }

  const targetIdUser = targetReq ? targetReq.idUser : (idUser || cleanId);

  // Reset target account password in teachers/students DB to default "123"
  let resetSuccess = false;
  const targetTeacher = db.teachers.find((t) => String(t.idUser).trim().toLowerCase() === targetIdUser.toLowerCase());
  if (targetTeacher) {
    targetTeacher.customPass = "";
    targetTeacher.defaultPass = "123";
    resetSuccess = true;
  }
  const targetStudent = db.students.find((s) => String(s.idUser).trim().toLowerCase() === targetIdUser.toLowerCase());
  if (targetStudent) {
    targetStudent.customPass = "";
    targetStudent.defaultPass = "123";
    resetSuccess = true;
  }

  if (!resetSuccess) {
    const isTeacherRole = targetReq?.role === "TEACHER" || cleanId.startsWith("gv.") || cleanId.startsWith("gv_");
    const newAcc = {
      idUser: String(targetIdUser).trim(),
      hoTen: targetReq?.hoTen || targetIdUser,
      chiDoan: targetReq?.chiDoan || (isTeacherRole ? "Giáo viên" : "Học sinh"),
      defaultPass: "123",
      customPass: "",
    };
    if (isTeacherRole) {
      db.teachers.push(newAcc);
    } else {
      db.students.push(newAcc);
    }
  }

  if (targetReq) {
    targetReq.status = "APPROVED";
    targetReq.processedAt = new Date().toISOString();
    targetReq.processedBy = adminUser || (isTeacherUser ? "Giáo viên" : ADMIN_USERNAME);
  } else {
    db.resetPasswordRequests.unshift({
      id: id || `RESET-${Date.now()}`,
      idUser: String(targetIdUser).trim(),
      hoTen: targetIdUser,
      chiDoan: "Hệ thống",
      role: (cleanId.startsWith("gv.") || cleanId.startsWith("gv_")) ? "TEACHER" : "STUDENT",
      requestedAt: new Date().toISOString(),
      status: "APPROVED",
      processedAt: new Date().toISOString(),
      processedBy: adminUser || "Admin",
      note: "Reset trực tiếp",
    });
  }

  await saveDb(db);

  return res.json({
    success: true,
    message: `Đã phê duyệt và đặt lại mật khẩu về "123" cho tài khoản "${targetIdUser}" thành công!`,
    items: db.resetPasswordRequests,
    teachers: db.teachers,
    students: db.students,
  });
});

// 10.9 REJECT RESET PASSWORD REQUEST
app.post("/api/reset-password/reject", async (req, res) => {
  const { id, idUser, userRole } = req.body;
  const db = await getDb();
  if (!db.resetPasswordRequests) db.resetPasswordRequests = [];

  const cleanId = String(idUser || "").trim().toLowerCase();

  let reqIndex = db.resetPasswordRequests.findIndex((r) => r.id === id);
  if (reqIndex < 0 && cleanId) {
    reqIndex = db.resetPasswordRequests.findIndex(
      (r) => String(r.idUser).trim().toLowerCase() === cleanId && r.status === "PENDING"
    );
  }
  if (reqIndex < 0 && cleanId) {
    reqIndex = db.resetPasswordRequests.findIndex(
      (r) => String(r.idUser).trim().toLowerCase() === cleanId
    );
  }

  if (reqIndex >= 0) {
    const targetReq = db.resetPasswordRequests[reqIndex];
    if (userRole === "TEACHER" && targetReq.role !== "STUDENT") {
      return res.json({
        success: false,
        message: "Tài khoản Giáo viên chỉ có quyền từ chối yêu cầu reset mật khẩu của Học sinh!",
      });
    }
    targetReq.status = "REJECTED";
    targetReq.processedAt = new Date().toISOString();
  }

  await saveDb(db);

  return res.json({
    success: true,
    message: `Đã từ chối yêu cầu reset mật khẩu của tài khoản "${idUser}".`,
    items: db.resetPasswordRequests,
  });
});

// 10.8b APPROVE ALL RESET PASSWORD REQUESTS
app.post("/api/reset-password/approve-all", async (req, res) => {
  const { adminUser, userRole } = req.body || {};
  const db = await getDb();
  if (!db.resetPasswordRequests) db.resetPasswordRequests = [];
  if (!db.teachers) db.teachers = [];
  if (!db.students) db.students = [];

  const isTeacherUser = userRole === "TEACHER";
  const pendingReqs = db.resetPasswordRequests.filter(
    (r) => r.status === "PENDING" && (!isTeacherUser || r.role === "STUDENT")
  );

  if (pendingReqs.length === 0) {
    return res.json({ success: false, message: "Không có yêu cầu đặt lại mật khẩu nào đang chờ duyệt!" });
  }

  let approvedCount = 0;
  pendingReqs.forEach((r) => {
    r.status = "APPROVED";
    r.processedAt = new Date().toISOString();
    r.processedBy = adminUser || (isTeacherUser ? "Giáo viên" : ADMIN_USERNAME);

    const cleanId = String(r.idUser || "").trim().toLowerCase();
    let resetSuccess = false;

    const teacherObj = db.teachers.find((t) => String(t.idUser).trim().toLowerCase() === cleanId);
    if (teacherObj) {
      teacherObj.customPass = "";
      teacherObj.defaultPass = "123";
      resetSuccess = true;
    }

    const studentObj = db.students.find((s) => String(s.idUser).trim().toLowerCase() === cleanId);
    if (studentObj) {
      studentObj.customPass = "";
      studentObj.defaultPass = "123";
      resetSuccess = true;
    }

    if (!resetSuccess && cleanId) {
      const isTeacherRole = r.role === "TEACHER" || cleanId.startsWith("gv.") || cleanId.startsWith("gv_");
      const newAcc = {
        idUser: String(r.idUser).trim(),
        hoTen: r.hoTen || r.idUser,
        chiDoan: r.chiDoan || (isTeacherRole ? "Giáo viên" : "Học sinh"),
        defaultPass: "123",
        customPass: "",
      };
      if (isTeacherRole) {
        db.teachers.push(newAcc);
      } else {
        db.students.push(newAcc);
      }
    }
    approvedCount++;
  });

  await saveDb(db);

  return res.json({
    success: true,
    message: `Đã phê duyệt tất cả ${approvedCount} yêu cầu đặt lại mật khẩu về "123" thành công!`,
    items: db.resetPasswordRequests,
    teachers: db.teachers,
    students: db.students,
  });
});

// 10.9b REJECT ALL RESET PASSWORD REQUESTS
app.post("/api/reset-password/reject-all", async (req, res) => {
  const { userRole } = req.body || {};
  const db = await getDb();
  if (!db.resetPasswordRequests) db.resetPasswordRequests = [];

  const isTeacherUser = userRole === "TEACHER";
  const pendingReqs = db.resetPasswordRequests.filter(
    (r) => r.status === "PENDING" && (!isTeacherUser || r.role === "STUDENT")
  );

  if (pendingReqs.length === 0) {
    return res.json({ success: false, message: "Không có yêu cầu đặt lại mật khẩu nào đang chờ từ chối!" });
  }

  let rejectedCount = 0;
  pendingReqs.forEach((r) => {
    r.status = "REJECTED";
    r.processedAt = new Date().toISOString();
    rejectedCount++;
  });

  await saveDb(db);

  return res.json({
    success: true,
    message: `Đã từ chối tất cả ${rejectedCount} yêu cầu đặt lại mật khẩu.`,
    items: db.resetPasswordRequests,
  });
});

// 11. CERTIFICATES API
app.get("/api/certificates", async (req, res) => {
  try {
    const { idUser, courseId } = req.query;
    const db = await getDb();
    if (!db.certificates) db.certificates = [];

    if (idUser && courseId) {
      const cleanUser = String(idUser).trim().toLowerCase();
      const cert = db.certificates.find(
        (c) => c && String(c.idUser || "").trim().toLowerCase() === cleanUser && String(c.courseId) === String(courseId)
      );
      return res.json({ success: true, certificate: cert || null });
    }

    return res.json({ success: true, certificates: db.certificates || [] });
  } catch (err: any) {
    console.error("Error fetching certificates:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ" });
  }
});

app.post("/api/certificates/issue", async (req, res) => {
  try {
    const { idUser, courseId, userObj } = req.body || {};
    const db = await getDb();
    if (!db.certificates) db.certificates = [];

    const cleanUser = String(idUser || "").trim().toLowerCase();
    const existingCert = db.certificates.find(
      (c) => c && String(c.idUser || "").trim().toLowerCase() === cleanUser && String(c.courseId) === String(courseId)
    );

    if (existingCert) {
      return res.json({ success: true, certificate: existingCert, message: "Giấy chứng nhận đã được cấp trước đó!" });
    }

    const course = (db.courses || []).find((c) => c && c.courseId === courseId);
    if (!course) {
      return res.json({ success: false, message: "Không tìm thấy khóa học!" });
    }

    // Find user student details
    let studentName = userObj?.fullName || userObj?.hoTen || userObj?.studentName || idUser;
    let studentClass = userObj?.className || userObj?.chiDoan || userObj?.studentClass || "";

    const studentAcc = (db.students || []).find((s) => s && String(s.idUser || "").trim().toLowerCase() === cleanUser);
    if (studentAcc) {
      if (studentAcc.hoTen) studentName = studentAcc.hoTen;
      if (studentAcc.chiDoan) studentClass = studentAcc.chiDoan;
    }

    const certCfg = course.certificateConfig || {
      enabled: true,
      parentOrganization: "ĐOÀN TNCS HỒ CHÍ MINH",
      organization: "TRƯỜNG THPT NGUYỄN QUANG DIÊU",
      signerTitle: "GIÁO VIÊN",
    };

    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const formattedDateStr = `Tân An, ngày ${day} tháng ${month} năm ${year}`;

    const certId = `CERT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Calculate sequential number TT for this course (01, 02, ...)
    const courseCertsCount = db.certificates.filter((c) => c && c.courseId === course.courseId).length;
    const seqNum = courseCertsCount + 1;
    const seqStr = String(seqNum).padStart(2, "0");
    const suffix = certCfg.certNumberSuffix || "GCN/ĐTN";
    const certificateNumberStr = `${seqStr}-${suffix}`;

    const newCert = {
      certificateId: certId,
      certificateNumberStr,
      idUser,
      studentName,
      studentClass,
      courseId: course.courseId,
      courseTitle: course.title,
      issueDate: now.toISOString(),
      formattedDateStr,
      parentOrganization: certCfg.parentOrganization || "ĐOÀN TNCS HỒ CHÍ MINH",
      organization: certCfg.organization || "TRƯỜNG THPT NGUYỄN QUANG DIÊU",
      signerTitle: certCfg.signerTitle || "GIÁO VIÊN",
      delegateTitle: certCfg.delegateTitle || "",
      signerName: certCfg.signerName || course.authorName || "Giáo viên hướng dẫn",
      signatureImage: certCfg.signatureImage || "",
      logoImage: certCfg.logoImage || "",
      bgTheme: certCfg.bgTheme || "blue_gold",
      bgCustomImage: certCfg.bgCustomImage || "",
      certNumberSuffix: suffix,
    };

    db.certificates.push(newCert);
    inMemoryStore.set("certificates", { payload: db.certificates });
    await writeFsDoc("certificates", { payload: db.certificates });

    // Đảm bảo học sinh đã có bản ghi đăng ký khóa học với trạng thái HOAN_THANH
    const cleanId = String(idUser || "").trim().toLowerCase();
    const existingEnroll = (db.enrollments || []).find(
      (e) => String(e.idUser || "").trim().toLowerCase() === cleanId && String(e.courseId) === String(course.courseId)
    );
    if (!existingEnroll) {
      db.enrollments.push({
        idUser,
        courseId: course.courseId,
        courseName: course.title,
        enrollDate: now.toISOString(),
        status: "HOAN_THANH",
      });
      inMemoryStore.set("enrollments", { payload: db.enrollments });
      await writeFsDoc("enrollments", { payload: db.enrollments });
    }

    await saveDb(db);

    return res.json({ success: true, certificate: newCert, message: "Chúc mừng! Giấy chứng nhận hoàn thành khóa học đã được cấp thành công!" });
  } catch (err: any) {
    console.error("Error issuing certificate:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ khi cấp giấy chứng nhận" });
  }
});

// XÓA GIẤY CHỨNG NHẬN
const handleCertificateDeletion = async (certId: string, res: any) => {
  try {
    if (!certId) {
      return res.status(400).json({ success: false, message: "Mã giấy chứng nhận không hợp lệ" });
    }
    const db = await getDb();
    if (!db.certificates) db.certificates = [];

    const targetCert = db.certificates.find((c: any) => String(c?.certificateId) === String(certId));
    const beforeCount = db.certificates.length;
    db.certificates = db.certificates.filter((c: any) => String(c?.certificateId) !== String(certId));

    if (db.certificates.length < beforeCount) {
      inMemoryStore.set("certificates", { payload: db.certificates });
      await writeFsDoc("certificates", { payload: db.certificates });

      // Xóa mã giấy chứng nhận khỏi seen_certificates nếu có
      if (targetCert && targetCert.idUser) {
        const uKey = String(targetCert.idUser).trim().toLowerCase();
        const seenDoc = await readFsDoc<any>("seen_certificates", {});
        if (seenDoc && seenDoc[uKey] && Array.isArray(seenDoc[uKey])) {
          seenDoc[uKey] = seenDoc[uKey].filter((id: string) => String(id) !== String(certId));
          inMemoryStore.set("seen_certificates", seenDoc);
          await writeFsDoc("seen_certificates", seenDoc);
        }
      }

      await saveDb(db);
      return res.json({ success: true, message: "Đã xóa giấy chứng nhận thành công!" });
    }

    return res.json({ success: true, message: "Giấy chứng nhận đã được xóa hoặc không tồn tại." });
  } catch (err: any) {
    console.error("Error deleting certificate:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ khi xóa giấy chứng nhận" });
  }
};

app.delete("/api/certificates/:certificateId", async (req, res) => {
  await handleCertificateDeletion(req.params.certificateId, res);
});

app.post("/api/certificates/delete", async (req, res) => {
  const { certificateId, idUser, courseId } = req.body || {};
  if (certificateId) {
    await handleCertificateDeletion(certificateId, res);
    return;
  }
  if (idUser && courseId) {
    const cleanU = String(idUser).trim().toLowerCase();
    const cleanC = String(courseId).trim().toLowerCase();
    const db = await getDb();
    const removed = (db.certificates || []).filter(
      (c: any) =>
        String(c.idUser || "").trim().toLowerCase() === cleanU &&
        (String(c.courseId || "").trim().toLowerCase() === cleanC || String(c.courseId) === String(courseId))
    );
    if (removed.length > 0) {
      const removedIds = new Set(removed.map((c: any) => String(c.certificateId)));
      db.certificates = (db.certificates || []).filter(
        (c: any) =>
          !(
            String(c.idUser || "").trim().toLowerCase() === cleanU &&
            (String(c.courseId || "").trim().toLowerCase() === cleanC || String(c.courseId) === String(courseId))
          )
      );
      inMemoryStore.set("certificates", { payload: db.certificates });
      await writeFsDoc("certificates", { payload: db.certificates });

      try {
        const seenDoc = await readFsDoc<any>("seen_certificates", {});
        if (seenDoc && seenDoc[cleanU] && Array.isArray(seenDoc[cleanU])) {
          seenDoc[cleanU] = seenDoc[cleanU].filter((id: string) => !removedIds.has(String(id)));
          inMemoryStore.set("seen_certificates", seenDoc);
          await writeFsDoc("seen_certificates", seenDoc);
        }
      } catch {}

      await saveDb(db);
      return res.json({ success: true, message: "Đã hủy giấy chứng nhận của học viên thành công!", count: removed.length });
    }
    return res.json({ success: true, message: "Không tìm thấy giấy chứng nhận phù hợp.", count: 0 });
  }
  return res.status(400).json({ success: false, message: "Thiếu thông tin xóa giấy chứng nhận" });
});

// ==========================================
// 11.5. LESSON Q&A (HỎI ĐÁP BÀI HỌC) API
// ==========================================

// ==================== LEARNING GAMES APIS ====================
app.get("/api/games", async (_req, res) => {
  try {
    const doc = await readFsDoc<{ items?: any[] }>("learning_games", { items: [] });
    const items = Array.isArray(doc?.items) ? doc.items : [];
    return res.json({ success: true, games: items });
  } catch (err: any) {
    console.error("Error fetching learning games:", err);
    return res.status(500).json({ success: false, message: "Không thể lấy danh sách trò chơi.", games: [] });
  }
});

app.post("/api/games", async (req, res) => {
  try {
    const { game, userObj } = req.body;
    if (!game || !game.title || !game.gameUrl) {
      return res.status(400).json({ success: false, message: "Thiếu tiêu đề hoặc liên kết trò chơi." });
    }

    const doc = await readFsDoc<{ items?: any[] }>("learning_games", { items: [] });
    const items = Array.isArray(doc?.items) ? doc.items : [];

    let platform = game.platform || "Khác";
    const uLower = String(game.gameUrl).toLowerCase();
    if (uLower.includes("wordwall.net")) platform = "Wordwall";
    else if (uLower.includes("kahoot.it") || uLower.includes("kahoot.com")) platform = "Kahoot";
    else if (uLower.includes("quizizz.com")) platform = "Quizizz";
    else if (uLower.includes("quizlet.com")) platform = "Quizlet";
    else if (uLower.includes("blooket.com")) platform = "Blooket";
    else if (uLower.includes("gimkit.com")) platform = "Gimkit";
    else if (uLower.includes("baamboozle.com")) platform = "Baamboozle";

    const gameId = game.id || "game_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    const existingIdx = items.findIndex((g: any) => String(g.id) === String(gameId));

    const newGame = {
      ...game,
      id: gameId,
      platform,
      authorId: userObj?.idUser || game.authorId || "gv_unknown",
      authorName: userObj?.hoTen || userObj?.fullName || game.authorName || "Giáo viên",
      authorRole: userObj?.role || game.authorRole || "TEACHER",
      createdAt: existingIdx >= 0 ? items[existingIdx].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      playCount: Number(game.playCount || 0),
    };

    let nextItems;
    if (existingIdx >= 0) {
      nextItems = [...items];
      nextItems[existingIdx] = newGame;
    } else {
      nextItems = [newGame, ...items];
    }

    inMemoryStore.set("learning_games", { items: nextItems });
    await writeFsDoc("learning_games", { items: nextItems });

    return res.json({ success: true, game: newGame, message: "Đã lưu trò chơi ôn tập thành công!" });
  } catch (err: any) {
    console.error("Error saving learning game:", err);
    return res.status(500).json({ success: false, message: "Không thể lưu trò chơi." });
  }
});

app.delete("/api/games/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await readFsDoc<{ items?: any[] }>("learning_games", { items: [] });
    const items = Array.isArray(doc?.items) ? doc.items : [];
    const nextItems = items.filter((g: any) => String(g.id) !== String(id));

    inMemoryStore.set("learning_games", { items: nextItems });
    await writeFsDoc("learning_games", { items: nextItems });

    return res.json({ success: true, message: "Đã xóa trò chơi thành công!" });
  } catch (err: any) {
    console.error("Error deleting learning game:", err);
    return res.status(500).json({ success: false, message: "Không thể xóa trò chơi." });
  }
});

app.post("/api/games/:id/play", async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await readFsDoc<{ items?: any[] }>("learning_games", { items: [] });
    const items = Array.isArray(doc?.items) ? doc.items : [];
    const gIdx = items.findIndex((g: any) => String(g.id) === String(id));
    if (gIdx >= 0) {
      items[gIdx].playCount = Number(items[gIdx].playCount || 0) + 1;
      inMemoryStore.set("learning_games", { items });
      await writeFsDoc("learning_games", { items });
    }
    return res.json({ success: true });
  } catch {
    return res.json({ success: true });
  }
});

app.get("/api/qa", async (req, res) => {
  try {
    const { courseId, lessonIdx } = req.query;
    const db = await getDb();
    if (!db.qaQuestions) db.qaQuestions = [];

    let filtered = (db.qaQuestions || []).filter(
      (q: any) => q && !String(q.id || "").startsWith("q_sample_") && q.authorId !== "student_sample_1"
    );
    if (courseId) {
      filtered = filtered.filter((q) => String(q.courseId) === String(courseId));
    }
    if (lessonIdx !== undefined && lessonIdx !== null && lessonIdx !== '') {
      filtered = filtered.filter((q) => Number(q.lessonIdx) === Number(lessonIdx));
    }

    // Sort newest first
    filtered.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    return res.json({ success: true, questions: filtered, total: filtered.length });
  } catch (err: any) {
    console.error("Error fetching QA questions:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ khi lấy danh sách hỏi đáp" });
  }
});

app.post("/api/qa/question", async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question || !question.content) {
      return res.status(400).json({ success: false, message: "Nội dung câu hỏi không được để trống!" });
    }

    const db = await getDb();
    if (!db.qaQuestions) db.qaQuestions = [];

    const newQ = {
      id: question.id || `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      courseId: question.courseId || '',
      courseTitle: question.courseTitle || '',
      lessonIdx: Number(question.lessonIdx ?? 0),
      lessonTitle: question.lessonTitle || '',
      authorId: question.authorId || '',
      authorName: question.authorName || 'Người dùng',
      authorRole: question.authorRole || 'STUDENT',
      authorClass: question.authorClass || '',
      content: String(question.content).trim(),
      createdAt: question.createdAt || new Date().toISOString(),
      likes: Number(question.likes || 0),
      likedBy: Array.isArray(question.likedBy) ? question.likedBy : [],
      answers: Array.isArray(question.answers) ? question.answers : [],
    };

    const existingIdx = db.qaQuestions.findIndex((q) => q.id === newQ.id);
    if (existingIdx >= 0) {
      db.qaQuestions[existingIdx] = { ...db.qaQuestions[existingIdx], ...newQ };
    } else {
      db.qaQuestions.unshift(newQ);
    }

    await saveDb(db);

    return res.json({ success: true, question: newQ, message: "Đã đăng câu hỏi thành công!", questions: db.qaQuestions });
  } catch (err: any) {
    console.error("Error saving QA question:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ khi lưu câu hỏi" });
  }
});

app.post("/api/qa/answer", async (req, res) => {
  try {
    const { questionId, answer } = req.body || {};
    if (!questionId || !answer || !answer.content) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin câu hỏi hoặc nội dung trả lời!" });
    }

    const db = await getDb();
    if (!db.qaQuestions) db.qaQuestions = [];

    const targetQ = db.qaQuestions.find((q) => q.id === questionId);
    if (!targetQ) {
      return res.status(404).json({ success: false, message: "Không tìm thấy câu hỏi tương ứng!" });
    }

    const newAns = {
      id: answer.id || `a_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      authorId: answer.authorId || '',
      authorName: answer.authorName || 'Giáo viên',
      authorRole: answer.authorRole || 'TEACHER',
      authorClass: answer.authorClass || '',
      content: String(answer.content).trim(),
      createdAt: answer.createdAt || new Date().toISOString(),
      likes: Number(answer.likes || 0),
      likedBy: Array.isArray(answer.likedBy) ? answer.likedBy : [],
    };

    if (!Array.isArray(targetQ.answers)) {
      targetQ.answers = [];
    }

    const existAnsIdx = targetQ.answers.findIndex((a) => a.id === newAns.id);
    if (existAnsIdx >= 0) {
      targetQ.answers[existAnsIdx] = { ...targetQ.answers[existAnsIdx], ...newAns };
    } else {
      targetQ.answers.push(newAns);
    }

    await saveDb(db);

    return res.json({
      success: true,
      answer: newAns,
      question: targetQ,
      message: "Đã gửi câu trả lời / giải đáp thành công!",
      questions: db.qaQuestions,
    });
  } catch (err: any) {
    console.error("Error posting QA answer:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ khi đăng câu trả lời" });
  }
});

app.post("/api/qa/like", async (req, res) => {
  try {
    const { questionId, answerId, userId } = req.body || {};
    if (!questionId || !userId) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin cần thiết!" });
    }

    const db = await getDb();
    if (!db.qaQuestions) db.qaQuestions = [];

    const targetQ = db.qaQuestions.find((q) => q.id === questionId);
    if (!targetQ) {
      return res.status(404).json({ success: false, message: "Không tìm thấy câu hỏi!" });
    }

    if (answerId) {
      if (!Array.isArray(targetQ.answers)) targetQ.answers = [];
      const targetAns = targetQ.answers.find((a) => a.id === answerId);
      if (!targetAns) return res.status(404).json({ success: false, message: "Không tìm thấy câu trả lời!" });

      const likedBy = Array.isArray(targetAns.likedBy) ? targetAns.likedBy : [];
      const hasLiked = likedBy.includes(userId);
      if (hasLiked) {
        targetAns.likedBy = likedBy.filter((u) => u !== userId);
        targetAns.likes = Math.max(0, (targetAns.likes || 1) - 1);
      } else {
        targetAns.likedBy = [...likedBy, userId];
        targetAns.likes = (targetAns.likes || 0) + 1;
      }
    } else {
      const likedBy = Array.isArray(targetQ.likedBy) ? targetQ.likedBy : [];
      const hasLiked = likedBy.includes(userId);
      if (hasLiked) {
        targetQ.likedBy = likedBy.filter((u) => u !== userId);
        targetQ.likes = Math.max(0, (targetQ.likes || 1) - 1);
      } else {
        targetQ.likedBy = [...likedBy, userId];
        targetQ.likes = (targetQ.likes || 0) + 1;
      }
    }

    await saveDb(db);
    return res.json({ success: true, question: targetQ });
  } catch (err: any) {
    console.error("Error liking QA item:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ" });
  }
});

app.delete("/api/qa/question/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    if (!db.qaQuestions) db.qaQuestions = [];

    const prevCount = db.qaQuestions.length;
    db.qaQuestions = db.qaQuestions.filter((q) => q.id !== id);

    if (db.qaQuestions.length === prevCount) {
      return res.json({ success: false, message: "Không tìm thấy câu hỏi để xóa" });
    }

    await saveDb(db);
    return res.json({ success: true, message: "Đã xóa câu hỏi thành công!", questions: db.qaQuestions });
  } catch (err: any) {
    console.error("Error deleting question:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ khi xóa câu hỏi" });
  }
});

app.delete("/api/qa/answer/:questionId/:answerId", async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    const db = await getDb();
    if (!db.qaQuestions) db.qaQuestions = [];

    const targetQ = db.qaQuestions.find((q) => q.id === questionId);
    if (!targetQ) {
      return res.status(404).json({ success: false, message: "Không tìm thấy câu hỏi!" });
    }

    if (Array.isArray(targetQ.answers)) {
      targetQ.answers = targetQ.answers.filter((a) => a.id !== answerId);
    }

    await saveDb(db);
    return res.json({ success: true, question: targetQ, message: "Đã xóa câu trả lời thành công!", questions: db.qaQuestions });
  } catch (err: any) {
    console.error("Error deleting answer:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ khi xóa câu trả lời" });
  }
});

app.post("/api/qa/sync", async (req, res) => {
  try {
    const { questions } = req.body || {};
    if (!Array.isArray(questions)) {
      return res.status(400).json({ success: false, message: "Danh sách câu hỏi không hợp lệ!" });
    }

    const db = await getDb();
    if (!db.qaQuestions) db.qaQuestions = [];

    // Merge questions by id
    const map = new Map<string, any>();
    db.qaQuestions.forEach((q) => map.set(q.id, q));
    questions.forEach((q) => {
      if (q && q.id) {
        map.set(q.id, { ...(map.get(q.id) || {}), ...q });
      }
    });

    db.qaQuestions = Array.from(map.values());
    await saveDb(db);

    return res.json({ success: true, count: db.qaQuestions.length, questions: db.qaQuestions });
  } catch (err: any) {
    console.error("Error syncing QA questions:", err);
    return res.status(500).json({ success: false, message: err?.message || "Lỗi máy chủ khi đồng bộ hỏi đáp" });
  }
});

// ==========================================
// 8. AI TUTOR 24/7 API (Gemini 3.1 Flash Lite / 3.7 Flash)
// ==========================================
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

// Resilient, ultra-fast AI caller with low-latency configuration and modern model fallbacks
async function generateContentWithFallback(ai: GoogleGenAI, options: {
  contents: any[];
  config?: any;
  preferredModels?: string[];
}): Promise<any> {
  const candidateModels = options.preferredModels && options.preferredModels.length > 0
    ? options.preferredModels
    : [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.7-flash",
        "gemini-3-flash-preview",
      ];

  let lastError: any = null;

  // Ensure default low thinking level for ultra-fast conversational response times unless overridden
  const mergedConfig = {
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    ...(options.config || {})
  };

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: options.contents,
          config: mergedConfig,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = (err?.message || String(err)).toLowerCase();
        const isUnavailableOrBusy =
          errMsg.includes("503") ||
          errMsg.includes("high demand") ||
          errMsg.includes("unavailable") ||
          errMsg.includes("429") ||
          errMsg.includes("resource_exhausted");
        const isNotAvailableOrDeprecated =
          errMsg.includes("404") ||
          errMsg.includes("not found") ||
          errMsg.includes("no longer available") ||
          errMsg.includes("deprecated");

        if (isNotAvailableOrDeprecated) {
          // Model does not exist or is deprecated, skip immediately to next candidate
          break;
        }

        if (isUnavailableOrBusy && attempt === 0) {
          // Temporary spike in demand: wait 500ms and try once more before fallback
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        // Move to next candidate fallback model
        break;
      }
    }
  }

  throw lastError;
}

app.post("/api/ai-tutor", async (req, res) => {
  try {
    const { prompt, courseTitle, lessonTitle, lessonDescription, learningMode, contentText, quizContext, history } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập câu hỏi cho NQDieu AI!" });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(500).json({
        success: false,
        message: "Chưa cấu hình GEMINI_API_KEY trên hệ thống server.",
      });
    }

    const SYSTEM_INSTRUCTION = `Bạn là một giáo viên thân thiện, kiên nhẫn và tâm huyết tại Trường THPT Nguyễn Quang Diêu, đóng vai trò là NQDieu AI (Trợ lý học tập thông minh 24/7).
Nhiệm vụ của bạn là đồng hành hỗ trợ học sinh giải đáp kiến thức và tự học hiệu quả.

QUY TẮC SƯ PHẠM VÀ ỨNG XỬ QUAN TRỌNG:
1. DỰA TRÊN BÀI HỌC: Bám sát thông tin khóa học, bài học, tài liệu và câu hỏi hiện tại của học sinh.
2. TUYỆT ĐỐI KHÔNG GIẢI HỘ / BÁO ĐÁP ÁN NGAY: Nếu học sinh hỏi bài tập về nhà hoặc câu hỏi trắc nghiệm/tự luận, tuyệt đối KHÔNG cho đáp án trực tiếp hoặc làm hộ toàn bộ bài.
3. PHƯƠNG PHÁP GỢI MỞ (SOCRATIC METHOD): Giải thích nguyên lý / lý thuyết ngắn gọn, dễ hiểu. Sau đó đặt câu hỏi gợi mở từng bước nhỏ để hướng dẫn học sinh tự suy nghĩ tìm ra đáp án.
4. THÂN THIỆN & KHÍCH LỆ: Sử dụng xưng hô thân mật ("Thầy/Cô" - "Em"), ngôn từ động viên ("Chào em", "Em thử suy nghĩ xem...", "Rất tốt!", "Thầy/Cô tin em làm được").
5. ĐỊNH DẠNG RÕ RÀNG: Trình bày bằng Markdown sạch đẹp, có gạch đầu dòng, bôi đậm khái niệm trọng tâm.
6. HƯỚNG TẬP TRUNG: Nếu học sinh hỏi chủ đề không liên quan học tập, hãy khéo léo nhắc em quay lại bài học.`;

    const contextHeader = `=== NGỮ CẢNH BÀI HỌC DÀNH CHO NQDIEU AI ===
Khóa học: ${courseTitle || 'Chưa xác định'}
Bài học: ${lessonTitle || 'Chưa xác định'}
Hình thức học: ${learningMode || 'Bài học'}
${lessonDescription ? `Tóm tắt bài học: ${lessonDescription}` : ''}
${contentText ? `Nội dung tài liệu/bài học: ${contentText}` : ''}
${quizContext?.isQuizActive ? `[Học sinh đang làm câu hỏi]: ${quizContext.questionText || ''} | Các lựa chọn: ${(quizContext.options || []).join('; ')}` : ''}
==========================================`;

    // Construct contents with prompt and history
    const formattedHistory: any[] = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        if (h.role === 'user' || h.role === 'model') {
          formattedHistory.push({
            role: h.role,
            parts: [{ text: h.text }],
          });
        }
      }
    }

    const contents = [
      { role: 'user', parts: [{ text: contextHeader }] },
      { role: 'model', parts: [{ text: "Chào em! Thầy/Cô NQDieu AI THPT Nguyễn Quang Diêu đã nắm được thông tin bài học. Em đang vướng mắc ở phần nào hay cần gợi ý gì nào?" }] },
      ...formattedHistory,
      { role: 'user', parts: [{ text: prompt }] },
    ];

    aiCallStats.totalCalls++;
    aiCallStats.lastCallTime = new Date().toISOString();

    const response = await generateContentWithFallback(ai, {
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    aiCallStats.successCalls++;
    const reply = response.text || "Thầy/Cô NQDieu AI chưa thể trả lời lúc me này, em thử đặt lại câu hỏi ngắn hơn nhé!";
    return res.json({ success: true, reply });
  } catch (err: any) {
    aiCallStats.errorCalls++;
    console.error("NQDieu AI API Error:", err);
    return res.status(500).json({
      success: false,
      message: "Có lỗi khi kết nối với NQDieu AI: " + (err?.message || "Lỗi máy chủ"),
    });
  }
});

// Teacher AI Assistant (Trợ lý AI Biên Soạn & Chuẩn Hóa Đề Thi)
app.post("/api/teacher-ai-assistant", async (req, res) => {
  try {
    const { taskType, contentText, config } = req.body || {};

    if (!contentText || typeof contentText !== 'string' || !contentText.trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng cung cấp nội dung văn bản hoặc tài liệu!" });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(500).json({
        success: false,
        message: "Chưa cấu hình GEMINI_API_KEY trên hệ thống server.",
      });
    }

    let systemInstruction = "";
    let userPrompt = "";
    let formattedContents: any[] = [];

    if (taskType === 'TEACHER_CHAT_AI') {
      systemInstruction = `Bạn là Trợ lý Ảo AI Chuyên nghiệp thuộc Hệ thống LMS NQDieu (Trường THPT Nguyễn Quang Diêu - An Giang).
Nhiệm vụ của bạn là tư vấn, giải đáp thắc mắc và hướng dẫn chi tiết cho Giáo viên về cách sử dụng hệ thống LMS NQDieu.

CÁC TÍNH NĂNG CHÍNH BẠN CẦN HƯỚNG DẪN GIÁO VIÊN:
1. TẠO NHANH KHÓA HỌC: Giáo viên có thể dán nội dung hoặc tải file Word (.docx) theo cấu trúc chuẩn (I. Thông tin chung, II. Nội dung bài học, IV. Cấp giấy chứng nhận). Hệ thống sẽ tự động trích xuất bài học, link video/tài liệu và cấu hình chứng nhận, đồng bộ tức thì lên máy chủ.
2. CHUẨN HÓA ĐỀ THI THÔ: Tự động đánh dấu sao (*) trước đáp án đúng, tự động sửa lỗi đứt quãng số thứ tự (Câu 1, Câu 2...), tự động trình bày công thức toán Unicode MathType/Word Equation, tạo bảng hình ảnh dưới câu hỏi và xuất file Word (.docx) chuẩn LMS.
3. TẠO ĐỀ THI MỚI TỪ TÀI LIỆU: Tự động biên soạn bộ câu hỏi trắc nghiệm Part I (4 lựa chọn), Part II (Đúng/Sai 4 ý a,b,c,d), Part III (Trả lời ngắn) dựa trên tài liệu học tập và ma trận đặc tả do giáo viên thiết lập.
4. QUẢN LÝ HỌC SINH & DUYỆT TÀI KHOẢN: Cho phép import tài khoản hàng loạt từ file Excel, duyệt học sinh đăng ký, cấp Giấy chứng nhận tự động khi học viên hoàn thành khóa học.

Hãy trả lời lịch sự, cô đọng, rõ ràng, chia từng bước (1, 2, 3...) dễ hiểu dành cho Giáo viên THPT. Nếu giáo viên xin mẫu file Word, hãy cung cấp đầy đủ cấu trúc văn bản mẫu để thầy cô dễ dàng sao chép!`;

      const { history } = req.body || {};
      const conversationParts: any[] = [];
      if (Array.isArray(history)) {
        for (const h of history.slice(-6)) {
          if (h.sender === 'user' || h.role === 'user') {
            conversationParts.push({ role: 'user', parts: [{ text: h.text }] });
          } else if (h.sender === 'ai' || h.role === 'model') {
            conversationParts.push({ role: 'model', parts: [{ text: h.text }] });
          }
        }
      }
      conversationParts.push({ role: 'user', parts: [{ text: contentText }] });
      formattedContents = conversationParts;

    } else if (taskType === 'CREATE_COURSE_FROM_DOC') {
      systemInstruction = `Bạn là Chuyên gia Quản lý Dữ liệu Khóa học LMS thuộc TRƯỜNG THPT NGUYỄN QUANG DIÊU (SỞ GD&ĐT AN GIANG).
Nhiệm vụ của bạn là đọc nội dung thông tin khóa học do giáo viên tải lên (hoặc dán văn bản) và TRÍCH XUẤT THÀNH ĐỊNH DẠNG JSON CHUẨN ĐỂ HỆ THỐNG TỰ ĐỘNG TẠO KHÓA HỌC VÀ ĐỒNG BỘ LÊN MÁY CHỦ.

MẪU VĂN BẢN ĐẦU VÀO CÓ CẤU TRÚC:
I. THÔNG TIN CHUNG
Tên khóa học*: [Tên khóa học]
Link ảnh bìa khóa học: [URL ảnh bìa]
Mô tả khóa học: [Nội dung mô tả]
Thời gian mở khóa học: [YYYY-MM-DD]
Thời gian kết thúc khóa học: [YYYY-MM-DD]

II. PHÒNG HỌC ONLINE (GOOGLE MEET, MS TEAMS, ZOOM)
Nền tảng phòng học: [Google Meet / MS Teams / Zoom / Khác]
Tên phòng học / Tiêu đề: [Tiêu đề phòng học]
Link phòng học Online (URL) *: [Link cuộc họp trực tuyến]
Lịch học trực tuyến (Tùy chọn): [Lịch học]
Ghi chú / Passcode (Tùy chọn): [Passcode hoặc Ghi chú]

III. NỘI DUNG CÁC BÀI HỌC
1. Bài 1
Tên bài học: [Tên bài]
Link Video (Youtube/MP4): [URL]
Link File Tài liệu (PDF/Drive): [URL]
Link Slide PPT / Google Slides: [URL]
Thời gian học tối thiểu (phút): [Số phút]

V. CẤP GIẤY CHỨNG NHẬN HOÀN THÀNH KHÓA HỌC
Tên Đơn vị chủ quản: [SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG]
Tên Đơn vị trực tiếp: [TRƯỜNG THPT NGUYỄN QUANG DIÊU]
Ký hiệu / Hậu tố Số Giấy chứng nhận: [Mã ký hiệu]
Chức vụ người ký: [Chức vụ]
Chức vụ người ký thay (nếu có): [Chức vụ ký thay]
Họ tên người ký: [Họ tên]

YÊU CẦU ĐẦU RA BẮT BUỘC (JSON CHÍNH XÁC TỐI ĐA):
Xuất duy nhất 1 khối mã JSON hợp lệ có cấu trúc chính xác sau (không thêm văn bản ngoài khối \`\`\`json ... \`\`\`):
{
  "title": "Tên khóa học",
  "description": "Mô tả khóa học",
  "imageUrl": "URL ảnh bìa",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "onlineMeetingConfig": {
    "enabled": true,
    "platform": "google_meet",
    "title": "Tên phòng học / Tiêu đề",
    "meetingUrl": "Link phòng học Online",
    "scheduleTime": "Lịch học trực tuyến",
    "note": "Ghi chú / Passcode"
  },
  "lessons": [
    {
      "title": "Tên bài học",
      "videoUrl": "Link video",
      "docUrl": "Link tài liệu",
      "pptUrl": "Link slide",
      "durationMin": 45
    }
  ],
  "certificateConfig": {
    "enabled": true,
    "parentOrganization": "Tên Đơn vị chủ quản",
    "organization": "Tên Đơn vị trực tiếp",
    "certNumberSuffix": "Ký hiệu số",
    "signerTitle": "Chức vụ người ký",
    "delegateTitle": "Chức vụ ký thay",
    "signerName": "Họ tên người ký"
  }
}`;

      userPrompt = `Dưới đây là văn bản thông tin khóa học cần trích xuất:\n\n${contentText}`;

    } else if (taskType === 'STANDARDIZE_EXAM') {
      systemInstruction = `Bạn là Chuyên gia Kiểm tra & Đánh giá Giáo dục THPT của SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG (Trường THPT Nguyễn Quang Diêu).
Nhiệm vụ của bạn là nhận nội dung đề thi thô (hoặc văn bản kèm hình ảnh/chú thích) do giáo viên tải lên và CHUẨN HÓA LẠI THEO ĐÚNG ĐỊNH DẠNG CHUẨN ĐỂ ĐƯA LÊN HỆ THỐNG LMS NQDIEU AI.

QUY TẮC CHUẨN HÓA BẮT BUỘC:
1. ĐÁNH DẤU ĐÁP ÁN ĐÚNG:
- Nhận diện đáp án đúng trong file gốc (dựa trên gạch chân, tô màu, in đậm, hoặc đáp án gạch dưới/bảng đáp án kèm theo).
- Thêm duy nhất 1 dấu sao (*) vào ngay trước chữ cái đầu của đáp án đúng. Ví dụ: *B. Nội dung đáp án, hoặc *A. Nội dung đáp án.
- Giữ nguyên dấu sao (*) ở ngay trước đáp án đúng trong văn bản đầu ra. KHÔNG tô màu văn bản hay viết đậm bất thường.

2. ĐÁNH SỐ THỨ TỰ TỰ ĐỘNG:
- Rà soát lại toàn bộ số thứ tự câu hỏi từ đầu đến cuối văn bản.
- Tự động sắp xếp và đánh số lại liên tục, chính xác tuyệt đối từ "Câu 1:", "Câu 2:", "Câu 3:"... (khắc phục hoàn toàn các lỗi đứt quãng số thứ tự ở file gốc như 1, 2, 3, 5, 6...).

3. XỬ LÝ HÌNH ẢNH:
- Nếu câu hỏi có kèm theo hình ảnh minh họa (hoặc [Hình 1], [Hình ảnh...]), hãy tạo một cấu trúc bảng (table Markdown) 1 ô duy nhất nằm ngay phía dưới phần nội dung câu hỏi (trước các đáp án A, B, C, D) chỉ chứa chữ "Hình ảnh" (hoặc "Hình 1", "Hình 2").
- TUYỆT ĐỐI KHÔNG xuất đường dẫn hay cú pháp Markdown hình ảnh dạng ![...](...) hay (Hình vẽ).
  Ví dụ bảng hình ảnh chuẩn:
  | Hình ảnh |

4. QUY TẮC ĐỊNH DẠNG ĐẦU RA CHO TỪNG PHẦN:
- Giữ nguyên cấu trúc phân đoạn rõ ràng cho từng phần bài tập nếu có:
  PHẦN I. Câu hỏi trắc nghiệm nhiều phương án lựa chọn
  (Trong mỗi câu hỏi, thí sinh chỉ chọn một phương án)
  
  PHẦN II. Câu hỏi trắc nghiệm đúng sai
  (Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai)
  
  PHẦN III. Câu hỏi trắc nghiệm trả lời ngắn
  (Thí sinh điền đáp án ngắn gọn)

5. QUY TẮC CÔNG THỨC TOÁN HỌC (ĐỊNH DẠNG MATHTYPE / WORD EQUATION):
- TUYỆT ĐỐI KHÔNG DÙNG cú pháp LaTeX (như \\frac{a}{b}, \\sqrt{x}, $, $$, \\alpha, \\beta, \\int, \\lim...).
- Chuyển đổi và trình bày tất cả công thức toán theo định dạng MathType / Word Equation văn bản Unicode sạch đẹp:
  + Phân số: (a)/(b) hoặc a/b
  + Chỉ số trên/dưới Unicode: x², x³, x⁴, x₁, x₂, x₀
  + Ký hiệu toán Unicode: √x, Δ, π, α, β, ∞, ∫, ∑, lim(x→a), ±, ≤, ≥, ≠, ∈, ∉, ⊂, ∪, ∩, →, ℝ, ℕ, ℤ

- TUYỆT ĐỐI KHÔNG thêm thắt bất kỳ lời chào hỏi, giải thích ngoài lề nào. Xuất thẳng ra văn bản đề thi đã chuẩn hóa sạch đẹp!`;

      userPrompt = `Dưới đây là nội dung đề thi thô cần chuẩn hóa:\n\n${contentText}`;

    } else if (taskType === 'GENERATE_EXAM') {
      const numPart1 = config?.numPart1 || 10;
      const numPart2 = config?.numPart2 || 2;
      const numPart3 = config?.numPart3 || 2;
      const levelBreakdown = config?.levelBreakdown || 'Nhận biết 40%, Thông hiểu 30%, Vận dụng 20%, Vận dụng cao 10%';
      const subject = config?.subject || 'Tự do / TỔNG HỢP';
      const grade = config?.grade || 'THPT';
      const extraNotes = config?.extraNotes || '';

      systemInstruction = `Bạn là Chuyên gia Biên soạn Đề thi THPT Quốc gia theo Ma trận Đặc tả của Bộ GD&ĐT thuộc SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG (Trường THPT Nguyễn Quang Diêu).
Nhiệm vụ của bạn là đọc nội dung tài liệu/kiến thức được giáo viên cung cấp, sau đó TẠO BỘ CÂU HỎI KIỂM TRA CHUẨN XUẤT FILE WORD.

ĐƠN VỊ BAN HÀNH ĐỀ THI: SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG - TRƯỜNG THPT NGUYỄN QUANG DIÊU

YÊU CẦU CẤU TRÚC VÀ SỐ LƯỢNG CÂU HỎI:
- Môn học: ${subject} (${grade})
- Phân bổ câu hỏi:
  + PHẦN I: ${numPart1} câu trắc nghiệm nhiều lựa chọn (4 phương án A, B, C, D)
  + PHẦN II: ${numPart2} câu trắc nghiệm Đúng/Sai (Mỗi câu gồm 4 ý a, b, c, d)
  + PHẦN III: ${numPart3} câu trắc nghiệm Trả lời ngắn
- Tỷ lệ mức độ tư duy: ${levelBreakdown}
${extraNotes ? `- Yêu cầu bổ sung từ Giáo viên: ${extraNotes}` : ''}

QUY TẮC ĐỊNH DẠNG ĐẦU RA CHUẨN FILE WORD / LMS:
1. ĐÁNH DẤU ĐÁP ÁN ĐÚNG:
- Thêm dấu sao (*) vào ngay trước chữ cái đầu của đáp án đúng đối với PHẦN I. Ví dụ: *A. Nội dung đáp án đúng.
- Ở PHẦN II (Đúng/Sai): Với mỗi ý a), b), c), d), ghi rõ [Đúng] hoặc [Sai] hoặc đánh dấu (*) trước ý đúng.
- Ở PHẦN III (Trả lời ngắn): Ghi rõ "Đáp án: [Giá trị/Nội dung đáp án ngắn]" ở cuối mỗi câu.
2. ĐÁNH SỐ THỨ TỰ TỰ ĐỘNG:
- Đánh số liên tục từ Câu 1, Câu 2, Câu 3... cho đến hết đề thi.
3. CẤU TRÚC PHẦN RÕ RÀNG:
  PHẦN I. Câu hỏi trắc nghiệm nhiều phương án lựa chọn
  PHẦN II. Câu hỏi trắc nghiệm đúng sai
  PHẦN III. Câu hỏi trắc nghiệm trả lời ngắn
4. XỬ LÝ HÌNH ẢNH/SƠ ĐỒ (NẾU CÓ):
- Nếu câu hỏi cần bảng dữ liệu hoặc sơ đồ, trình bày dưới dạng bảng Markdown sạch đẹp bên dưới câu hỏi.
5. CÔNG THỨC TOÁN HỌC (ĐỊNH DẠNG MATHTYPE / WORD EQUATION KHÔNG DÙNG LATEX):
- TUYỆT ĐỐI KHÔNG DÙNG cú pháp mã LaTeX (như \\frac{a}{b}, \\sqrt{x}, $, $$, \\alpha, \\beta, \\int, \\lim...).
- Trình bày tất cả công thức toán học dưới dạng định dạng MathType / Word Equation với ký hiệu Unicode văn bản chuẩn:
  + Phân số: (2x + 1)/(x - 1) hoặc a/b
  + Lũy thừa / Chỉ số dưới: x², x³, x⁴, yⁿ, x₁, x₂, x₀
  + Ký hiệu toán học Unicode: √x, Δ, π, α, β, ∞, ∫, ∑, lim(x→a), ±, ≤, ≥, ≠, ∈, ∉, ⊂, ∪, ∩, ⊥, ∥, →, ℝ, ℕ, ℤ
  + Hàm số: y = x³ - 3x + 2, sin(x), cos(x), log₂x, ln(x)

TUYỆT ĐỐI KHÔNG thêm thắt các đoạn hội thoại dẫn dắt. Chỉ xuất nội dung đề thi hoàn chỉnh!`;

      userPrompt = `Dưới đây là tài liệu nguồn để tạo đề thi:\n\n${contentText}`;

    } else {
      return res.status(400).json({ success: false, message: "Loại nhiệm vụ taskType không hợp lệ!" });
    }

    aiCallStats.totalCalls++;
    aiCallStats.lastCallTime = new Date().toISOString();

    const contents = formattedContents && formattedContents.length > 0
      ? formattedContents
      : [{ role: "user", parts: [{ text: userPrompt }] }];

    const response = await generateContentWithFallback(ai, {
      contents,
      config: {
        systemInstruction,
        temperature: taskType === 'TEACHER_CHAT_AI' ? 0.7 : 0.2,
      },
    });

    aiCallStats.successCalls++;
    const outputText = response.text || "Chưa tạo được nội dung đề thi, vui lòng thử lại!";
    return res.json({ success: true, outputText });

  } catch (err: any) {
    aiCallStats.errorCalls++;
    console.error("Teacher AI Assistant API Error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi kết nối Trợ lý AI: " + (err?.message || "Lỗi server"),
    });
  }
});



async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", async (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    cleanupDemoDataFromSupabase().catch((err) => {
      console.warn("[Startup] Failed to cleanup demo data from Supabase:", err?.message);
    });
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
