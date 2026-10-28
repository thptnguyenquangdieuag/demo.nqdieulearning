import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Course } from '../types';
import {
  Trash2,
  X,
  AlertTriangle,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Users,
  GraduationCap,
  BookOpen,
  History,
  MessageSquare,
  KeyRound,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Loader2,
  Cloud,
  CloudLightning,
  CloudDownload,
  CloudUpload,
  Download,
  Upload,
  RefreshCw,
  Database,
  Server,
  HelpCircle,
  ExternalLink,
  Layers,
  FileCheck,
  Code2,
  Copy,
  Check,
  FileSpreadsheet,
  Link,
  Table,
  LogIn,
  HardDrive,
  Folder,
  Video,
  FileText,
  FileArchive,
  Edit3,
} from 'lucide-react';
import {
  getStoredAccounts,
  saveStoredAccounts,
  getStoredAdminProfile,
  saveStoredAdminProfile,
  getStoredCourses,
  saveStoredCourses,
  getStoredPendingRegistrations,
  saveAllStoredPendingRegistrations,
  getStoredResetPasswordRequests,
  saveAllStoredResetPasswordRequests,
  getStoredQaQuestions,
  saveStoredQaQuestions,
  getStoredProgress,
  clearAllStoredStudyProgress,
  getStoredEnrollments,
  getStoredCertificates,
  deleteStoredCertificate,
} from '../lib/storage';
import {
  getStoredGoogleSheetsConfig,
  saveStoredGoogleSheetsConfig,
  getStoredOAuthToken,
  requestGoogleAccessToken,
  clearStoredOAuthToken,
  GoogleSheetsConfig,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  DEFAULT_APPS_SCRIPT_URL,
  syncWithAppsScript,
} from '../lib/googleSheetsService';
import {
  createLmsGoogleSpreadsheet,
  pushAllDataToGoogleSheets,
  pullAllDataFromGoogleSheets,
} from '../lib/googleSheetsSync';
import { generateTeacherUsername, generateStudentUsername } from '../lib/accountGenerator';

interface AdminDataManagementModalProps {
  isOpen?: boolean;
  onClose: () => void;
  currentUser: User | null;
  courses: Course[];
  onDataPurged?: () => void;
  isInline?: boolean;
}

export const AdminDataManagementModal: React.FC<AdminDataManagementModalProps> = ({
  isOpen = true,
  onClose,
  currentUser,
  courses,
  onDataPurged,
  isInline = false,
}) => {
  const [activeTab, setActiveTab] = useState<'supabase' | 'backup' | 'purge'>('supabase');

  // Purge state
  const [selectedOptions, setSelectedOptions] = useState<{
    deleteStudents: boolean;
    deleteTeachers: boolean;
    deleteCourses: boolean;
    deleteStudyProgress: boolean;
    deleteQa: boolean;
    deleteRequests: boolean;
  }>({
    deleteStudents: false,
    deleteTeachers: false,
    deleteCourses: false,
    deleteStudyProgress: false,
    deleteQa: false,
    deleteRequests: false,
  });

  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmUnderstood, setConfirmUnderstood] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Google Sheets Sync state
  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsConfig>(getStoredGoogleSheetsConfig());
  const [syncMethod, setSyncMethod] = useState<'appscript' | 'oauth'>(sheetsConfig.syncMode || 'appscript');
  const [spreadsheetInput, setSpreadsheetInput] = useState(sheetsConfig.spreadsheetId || '');
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState(sheetsConfig.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL);
  const [isEditingAppsScriptUrl, setIsEditingAppsScriptUrl] = useState(false);
  const appsScriptInputRef = useRef<HTMLInputElement | null>(null);
  const [clientIdInput, setClientIdInput] = useState(sheetsConfig.clientId || '');
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isPingingScript, setIsPingingScript] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [sheetsFeedback, setSheetsFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string; url?: string } | null>(null);
  const [hasGoogleToken, setHasGoogleToken] = useState(Boolean(getStoredOAuthToken()));

  // Cloud Sync state
  const [cloudStatus, setCloudStatus] = useState<{
    configured: boolean;
    online: boolean;
    message: string;
    checked: boolean;
    counts?: { courses: number; teachers: number; students: number };
  }>({
    configured: false,
    online: false,
    message: 'Đang kiểm tra kết nối...',
    checked: false,
  });
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Backup & Restore state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlEditorBlock, setShowSqlEditorBlock] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const supabaseSqlScript = `-- ==============================================================================
-- NQDIEU LEARNING LMS - SUPABASE DATABASE INITIALIZATION SCHEMA
-- Phiên bản: 3.0 (Đồng bộ hóa dữ liệu toàn diện & Hiệu năng cao)
--
-- HƯỚNG DẪN SỬ DỤNG:
-- 1. Đăng nhập Supabase Dashboard: https://supabase.com/dashboard
-- 2. Chọn dự án của bạn -> Chọn mục "SQL Editor" ở menu bên trái.
-- 3. Tạo "New query", dán toàn bộ nội dung script này vào và nhấn "RUN" (hoặc Ctrl + Enter).
-- 4. Thông báo "Success. No rows returned" xuất hiện là cơ sở dữ liệu đã sẵn sàng!
-- ==============================================================================

-- 1. BẢNG KEY-VALUE LƯU TRẠNG THÁI HỆ THỐNG
-- Lưu trữ: Tài khoản GV/HS, Đăng ký chờ duyệt, Yêu cầu đổi mật khẩu, Điểm số, Q&A,...
CREATE TABLE IF NOT EXISTS public.lms_kv (
  key text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. BẢNG KHÓA HỌC TỪNG DÒNG ĐỘC LẬP
-- Lưu trữ từng khóa học riêng biệt, hỗ trợ dung lượng lớn, video bài giảng, tài liệu & trắc nghiệm
CREATE TABLE IF NOT EXISTS public.lms_courses (
  course_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. BẢNG NHẬT KÝ ĐỒNG BỘ VÀ KIỂM TRA SỨC KHỎE HỆ THỐNG (Audit & Sync Logs)
CREATE TABLE IF NOT EXISTS public.lms_sync_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. THIẾT LẬP REPLICA IDENTITY FULL (Hỗ trợ realtime truyền đầy đủ dữ liệu khi UPDATE / DELETE)
ALTER TABLE public.lms_kv REPLICA IDENTITY FULL;
ALTER TABLE public.lms_courses REPLICA IDENTITY FULL;
ALTER TABLE public.lms_sync_logs REPLICA IDENTITY FULL;

-- 5. HÀM VÀ TRIGGER TỰ ĐỘNG CẬP NHẬT THỜI GIAN "updated_at" KHI CÓ THAY ĐỔI
CREATE OR REPLACE FUNCTION public.handle_lms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lms_kv_updated_at ON public.lms_kv;
CREATE TRIGGER trigger_lms_kv_updated_at
  BEFORE UPDATE ON public.lms_kv
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_lms_updated_at();

DROP TRIGGER IF EXISTS trigger_lms_courses_updated_at ON public.lms_courses;
CREATE TRIGGER trigger_lms_courses_updated_at
  BEFORE UPDATE ON public.lms_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_lms_updated_at();

-- 6. CHỈ MỤC TĂNG TỐC TRUY VẤN (INDEXES)
CREATE INDEX IF NOT EXISTS lms_courses_updated_at_idx 
  ON public.lms_courses (updated_at DESC);

CREATE INDEX IF NOT EXISTS lms_kv_updated_at_idx 
  ON public.lms_kv (updated_at DESC);

CREATE INDEX IF NOT EXISTS lms_courses_data_gin_idx 
  ON public.lms_courses USING gin (data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS lms_kv_data_gin_idx 
  ON public.lms_kv USING gin (data jsonb_path_ops);

-- 7. BẢO MẬT & PHÂN QUYỀN TRUY CẬP (ROW LEVEL SECURITY - RLS)
ALTER TABLE public.lms_kv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_sync_logs ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ để đảm bảo không bị xung đột khi chạy lại
DROP POLICY IF EXISTS "lms_kv_all_access" ON public.lms_kv;
DROP POLICY IF EXISTS "lms_courses_all_access" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_sync_logs_all_access" ON public.lms_sync_logs;
DROP POLICY IF EXISTS "Allow all access" ON public.lms_kv;
DROP POLICY IF EXISTS "Allow all access" ON public.lms_courses;
DROP POLICY IF EXISTS "Allow all access" ON public.lms_sync_logs;
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.lms_kv;
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.lms_courses;
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.lms_sync_logs;

-- Cấp quyền truy cập an toàn, đầy đủ cho cả service_role, authenticated và anon
CREATE POLICY "lms_kv_all_access" ON public.lms_kv
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lms_courses_all_access" ON public.lms_courses
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lms_sync_logs_all_access" ON public.lms_sync_logs
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Phân quyền toàn diện trên Schema public
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- 8. KÍCH HOẠT SUPABASE REALTIME (Tự động thông báo khi có dữ liệu mới)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lms_kv;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lms_courses;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lms_sync_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 9. HÀM RPC KIỂM TRA SỨC KHỎE KẾT NỐI (HEALTH CHECK RPC)
CREATE OR REPLACE FUNCTION public.lms_ping()
RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'database', 'Supabase PostgreSQL',
    'timestamp', extract(epoch from timezone('utc'::text, now())),
    'courses_count', (SELECT count(*) FROM public.lms_courses),
    'kv_keys_count', (SELECT count(*) FROM public.lms_kv)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.lms_ping() TO postgres, anon, authenticated, service_role;

-- 10. GHI NHẬN NHẬT KÝ KHỞI TẠO THÀNH CÔNG
INSERT INTO public.lms_sync_logs (event, details)
VALUES ('SCHEMA_INITIALIZED', jsonb_build_object('status', 'SUCCESS', 'version', '3.0_FULL_SYNC', 'initialized_at', now()));`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(supabaseSqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Check cloud connection status on mount / open
  const checkCloudStatus = async () => {
    try {
      const res = await fetch('/api/admin/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const data = await res.json();
      setCloudStatus({
        configured: Boolean(data.configured),
        online: Boolean(data.online),
        message: data.message || '',
        checked: true,
      });
    } catch {
      setCloudStatus({
        configured: false,
        online: false,
        message: 'Không thể kết nối đến API máy chủ',
        checked: true,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkCloudStatus();
      const cfg = getStoredGoogleSheetsConfig();
      const effectiveUrl = cfg.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL;
      setSheetsConfig(cfg);
      setSpreadsheetInput(cfg.spreadsheetId || '');
      setAppsScriptUrlInput(effectiveUrl);
      setClientIdInput(cfg.clientId || '');
      setSyncMethod(effectiveUrl ? 'appscript' : (cfg.syncMode || 'appscript'));
      setHasGoogleToken(Boolean(getStoredOAuthToken()));
      setIsEditingAppsScriptUrl(false);
    }
  }, [isOpen]);

  // Google Sheets: Copy Apps Script Code
  const handleCopyAppsScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  // Google Sheets: Save Apps Script Web App URL & Test Ping
  const handleSaveAppsScriptUrl = async () => {
    const url = appsScriptUrlInput.trim();
    if (!url) {
      setSheetsFeedback({ type: 'error', message: 'Vui lòng dán URL Google Apps Script Web App!' });
      return;
    }
    setIsPingingScript(true);
    setSheetsFeedback(null);
    try {
      const ping = await syncWithAppsScript(url, 'ping');
      const newConfig: GoogleSheetsConfig = {
        ...sheetsConfig,
        appsScriptUrl: url,
        spreadsheetId: ping.spreadsheetId || sheetsConfig.spreadsheetId,
        spreadsheetUrl: ping.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${ping.spreadsheetId}/edit` : sheetsConfig.spreadsheetUrl,
        syncMode: 'appscript',
      };
      setSheetsConfig(newConfig);
      saveStoredGoogleSheetsConfig(newConfig);
      setIsEditingAppsScriptUrl(false);

      // Also persist to backend server
      fetch('/api/sheets-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      }).catch(() => {});

      if (ping.spreadsheetId) {
        setSpreadsheetInput(ping.spreadsheetId);
      }
      setSheetsFeedback({
        type: 'success',
        message: `Đã kết nối thành công với Google Sheet: "${ping.title || 'Bảng tính LMS'}"! Giờ đây bạn có thể đồng bộ 2 chiều tự do mà không bao giờ gặp lỗi xác thực.`,
        url: newConfig.spreadsheetUrl,
      });
    } catch (err: any) {
      setSheetsFeedback({
        type: 'error',
        message: 'Không thể kết nối đến Web App: ' + (err?.message || err) + '. Lưu ý: Khi Triển khai (Deploy) trong Google Apps Script, mục "Ai có quyền truy cập" (Who has access) cần chọn là "Bất kỳ ai" (Anyone).',
      });
    } finally {
      setIsPingingScript(false);
    }
  };

  // Google Sheets: Save Client ID
  const handleSaveClientId = () => {
    const cId = clientIdInput.trim();
    const newConfig: GoogleSheetsConfig = {
      ...sheetsConfig,
      clientId: cId,
      syncMode: 'oauth',
    };
    setSheetsConfig(newConfig);
    saveStoredGoogleSheetsConfig(newConfig);
    setSheetsFeedback({
      type: 'success',
      message: cId ? 'Đã lưu Google OAuth Client ID thành công! Bạn có thể bấm "Ủy quyền Google" ngay bây giờ.' : 'Đã xóa Client ID.',
    });
  };

  // Google Sheets: Connect / Authorize OAuth
  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    setSheetsFeedback(null);
    try {
      const token = await requestGoogleAccessToken(true);
      if (token) {
        setHasGoogleToken(true);
        setSheetsFeedback({
          type: 'success',
          message: 'Đã xác thực và liên kết tài khoản Google thành công!',
        });
      }
    } catch (err: any) {
      setSheetsFeedback({
        type: 'error',
        message: 'Không thể xác thực Google: ' + (err?.message || err),
      });
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  // Google Sheets: Create New Spreadsheet Automatically
  const handleCreateNewSpreadsheet = async () => {
    setIsSyncingSheets(true);
    setSheetsFeedback(null);
    try {
      let token = getStoredOAuthToken()?.token;
      if (!token) {
        token = await requestGoogleAccessToken(true);
        setHasGoogleToken(true);
      }

      const { spreadsheetId, spreadsheetUrl } = await createLmsGoogleSpreadsheet(token);
      
      const newConfig = {
        ...sheetsConfig,
        spreadsheetId,
        spreadsheetUrl,
        lastSyncTime: new Date().toISOString(),
      };
      setSheetsConfig(newConfig);
      saveStoredGoogleSheetsConfig(newConfig);
      setSpreadsheetInput(spreadsheetId);

      // Now push all existing data into this newly created spreadsheet
      const fetchAllRes = await fetch('/api/admin/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'google-sheets-get-all' }),
      });
      const allDb = await fetchAllRes.json();
      
      await pushAllDataToGoogleSheets(token, spreadsheetId, allDb.data || {});

      setSheetsFeedback({
        type: 'success',
        message: 'Đã tạo bảng tính Google Sheet mới và đồng bộ toàn bộ dữ liệu thành công!',
        url: spreadsheetUrl,
      });
    } catch (err: any) {
      setSheetsFeedback({
        type: 'error',
        message: 'Lỗi khi tạo Google Sheet: ' + (err?.message || err),
      });
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Google Sheets: Save Custom ID
  const handleSaveSpreadsheetId = () => {
    let cleanId = spreadsheetInput.trim();
    // Extract ID if full URL pasted
    if (cleanId.includes('/spreadsheets/d/')) {
      const match = cleanId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        cleanId = match[1];
      }
    }

    if (!cleanId) {
      setSheetsFeedback({ type: 'error', message: 'Vui lòng nhập ID hoặc đường dẫn Google Sheet!' });
      return;
    }

    const newConfig: GoogleSheetsConfig = {
      ...sheetsConfig,
      spreadsheetId: cleanId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
    };
    setSheetsConfig(newConfig);
    saveStoredGoogleSheetsConfig(newConfig);
    setSpreadsheetInput(cleanId);
    setSheetsFeedback({
      type: 'success',
      message: 'Đã lưu cấu hình Google Sheet ID thành công!',
      url: newConfig.spreadsheetUrl,
    });
  };

  // Google Sheets: Push All to Sheets (Apps Script Webhook)
  const handlePushToSheets = async () => {
    setIsSyncingSheets(true);
    setSheetsFeedback(null);
    try {
      const url = (sheetsConfig.appsScriptUrl || appsScriptUrlInput.trim()).trim();
      if (!url) {
        throw new Error('Vui lòng dán và lưu URL Google Apps Script Web App trước khi đồng bộ!');
      }

      // 1. Gather all collections from server
      let serverData: any = {};
      try {
        const fetchAllRes = await fetch('/api/admin/cloud-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'google-sheets-get-all' }),
        });
        const jsonRes = await fetchAllRes.json();
        serverData = jsonRes.data || {};
      } catch (e) {
        console.warn('Server fetch error before push:', e);
      }

      // 2. Gather all collections from local storage to ensure 100% data coverage
      const localAcc = getStoredAccounts();
      const localCourses = getStoredCourses();
      const localPending = getStoredPendingRegistrations();
      const localReset = getStoredResetPasswordRequests();
      const localQa = getStoredQaQuestions();
      const localProgress = getStoredProgress();
      const localEnrollments = getStoredEnrollments();

      // Merge accounts (deduplicate by idUser, excluding demo accounts)
      const demoAccountIds = new Set(['gv.demo', 'gv.mai', 'hs.demo', 'hs.nam']);
      const teacherMap = new Map<string, any>();
      (serverData.teachers || []).forEach((t: any) => {
        if (t?.idUser && !demoAccountIds.has(String(t.idUser).toLowerCase())) {
          teacherMap.set(String(t.idUser).toLowerCase(), t);
        }
      });
      (localAcc.teachers || []).forEach((t: any) => {
        if (t?.idUser && !demoAccountIds.has(String(t.idUser).toLowerCase())) {
          teacherMap.set(String(t.idUser).toLowerCase(), t);
        }
      });
      const finalTeachers = Array.from(teacherMap.values());

      const studentMap = new Map<string, any>();
      (serverData.students || []).forEach((s: any) => {
        if (s?.idUser && !demoAccountIds.has(String(s.idUser).toLowerCase())) {
          studentMap.set(String(s.idUser).toLowerCase(), s);
        }
      });
      (localAcc.students || []).forEach((s: any) => {
        if (s?.idUser && !demoAccountIds.has(String(s.idUser).toLowerCase())) {
          studentMap.set(String(s.idUser).toLowerCase(), s);
        }
      });
      const finalStudents = Array.from(studentMap.values());

      // Merge courses (excluding demo course)
      const courseMap = new Map<string, any>();
      (courses || []).forEach((c: any) => {
        if (c?.courseId && c.courseId !== 'course_demo_01') {
          courseMap.set(String(c.courseId), c);
        }
      });
      (serverData.courses || []).forEach((c: any) => {
        if (c?.courseId && c.courseId !== 'course_demo_01') {
          courseMap.set(String(c.courseId), c);
        }
      });
      (localCourses || []).forEach((c: any) => {
        if (c?.courseId && c.courseId !== 'course_demo_01') {
          courseMap.set(String(c.courseId), c);
        }
      });
      const finalCourses = Array.from(courseMap.values());

      // Flatten enrollments
      let finalEnrollments: any[] = [];
      if (Array.isArray(serverData.enrollments) && serverData.enrollments.length > 0) {
        finalEnrollments = serverData.enrollments;
      } else {
        Object.entries(localEnrollments).forEach(([userId, courseIds]) => {
          if (Array.isArray(courseIds)) {
            courseIds.forEach((cId) => {
              finalEnrollments.push({
                idUser: userId,
                courseId: cId,
                courseName: '',
                enrollDate: new Date().toISOString(),
                status: 'ACTIVE',
              });
            });
          }
        });
      }

      // Flatten progress
      let finalProgress: any[] = [];
      if (Array.isArray(serverData.progress) && serverData.progress.length > 0) {
        finalProgress = serverData.progress;
      } else {
        Object.entries(localProgress).forEach(([userId, coursesObj]) => {
          if (coursesObj && typeof coursesObj === 'object') {
            Object.entries(coursesObj).forEach(([cId, lessonsObj]) => {
              if (lessonsObj && typeof lessonsObj === 'object') {
                Object.entries(lessonsObj).forEach(([lKey, progData]) => {
                  finalProgress.push({
                    idUser: userId,
                    courseId: cId,
                    lessonKey: lKey,
                    progressData: progData,
                    updatedAt: new Date().toISOString(),
                  });
                });
              }
            });
          }
        });
      }

      const finalPending = (Array.isArray(serverData.pendingRegistrations) && serverData.pendingRegistrations.length > 0)
        ? serverData.pendingRegistrations
        : localPending;

      const finalReset = (Array.isArray(serverData.resetPasswordRequests) && serverData.resetPasswordRequests.length > 0)
        ? serverData.resetPasswordRequests
        : localReset;

      const finalQa = (Array.isArray(serverData.qaQuestions) && serverData.qaQuestions.length > 0)
        ? serverData.qaQuestions
        : localQa;

      const finalCerts = Array.isArray(serverData.certificates) ? serverData.certificates : [];

      const curAdmin = getStoredAdminProfile();
      const adminEntry = {
        idUser: curAdmin.idUser || 'admin.c3nguyenquangdieu',
        hoTen: curAdmin.hoTen || 'Administrator',
        chiDoan: curAdmin.chiDoan || 'BGH',
        defaultPass: curAdmin.defaultPass || '19310326',
        customPass: curAdmin.customPass || '',
        role: 'ADMIN',
        avatar: curAdmin.avatar || curAdmin.avatarUrl || '',
      };

      const fullPayload = {
        admins: [adminEntry],
        teachers: finalTeachers,
        students: finalStudents,
        courses: finalCourses,
        enrollments: finalEnrollments,
        progress: finalProgress,
        pendingRegistrations: finalPending,
        resetPasswordRequests: finalReset,
        certificates: finalCerts,
        qaQuestions: finalQa,
      };

      const res = await syncWithAppsScript(url, 'push', fullPayload);
      
      const newConfig: GoogleSheetsConfig = {
        ...sheetsConfig,
        appsScriptUrl: url,
        spreadsheetId: res.spreadsheetId || sheetsConfig.spreadsheetId,
        spreadsheetUrl: res.spreadsheetUrl || (res.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${res.spreadsheetId}/edit` : sheetsConfig.spreadsheetUrl),
        lastSyncTime: new Date().toISOString(),
        syncMode: 'appscript',
      };
      setSheetsConfig(newConfig);
      saveStoredGoogleSheetsConfig(newConfig);

      setSheetsFeedback({
        type: 'success',
        message: res.message || `Đã lưu thành công ${finalTeachers.length} GV, ${finalStudents.length} HS, ${finalCourses.length} khóa học và toàn bộ dữ liệu vào Google Sheet!`,
        url: newConfig.spreadsheetUrl,
      });
    } catch (err: any) {
      setSheetsFeedback({
        type: 'error',
        message: 'Lỗi khi đồng bộ lên Google Sheets: ' + (err?.message || err),
      });
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Google Sheets: Pull All from Sheets (Apps Script Webhook)
  const handlePullFromSheets = async () => {
    setIsSyncingSheets(true);
    setSheetsFeedback(null);
    try {
      const url = (sheetsConfig.appsScriptUrl || appsScriptUrlInput.trim()).trim();
      if (!url) {
        throw new Error('Vui lòng dán và lưu URL Google Apps Script Web App trước khi nạp dữ liệu!');
      }

      const res = await syncWithAppsScript(url, 'pull');
      const pulledData = res.data;

      if (!pulledData) {
        throw new Error('Không nhận được dữ liệu từ Google Sheets');
      }

      const pulledHasCourses = Array.isArray(pulledData.courses) && pulledData.courses.length > 0;
      const pulledHasTeachers = Array.isArray(pulledData.teachers) && pulledData.teachers.length > 0;
      const pulledHasStudents = Array.isArray(pulledData.students) && pulledData.students.length > 0;
      const pulledHasAnyData = pulledHasCourses || pulledHasTeachers || pulledHasStudents;

      const currentLocalCourses = getStoredCourses();
      const currentLocalAccounts = getStoredAccounts();
      const localHasAnyData = (currentLocalCourses.length > 0) || (currentLocalAccounts.teachers.length > 0) || (currentLocalAccounts.students.length > 0);

      // If Google Sheet is empty but local/server has data: NEVER wipe local data!
      // Instead, automatically push to Google Sheet so the sheet gets populated safely!
      if (!pulledHasAnyData && localHasAnyData) {
        await handlePushToSheets();
        setSheetsFeedback({
          type: 'success',
          message: `Bảng Google Sheet của bạn vừa kết nối và chưa có dữ liệu. Hệ thống đã TỰ ĐỘNG LƯU toàn bộ ${currentLocalCourses.length} khóa học và ${(currentLocalAccounts.teachers.length + currentLocalAccounts.students.length)} tài khoản hiện có lên Google Sheet giúp bạn!`,
          url: sheetsConfig.spreadsheetUrl,
        });
        return;
      }

      // Save pulled data to backend server
      const saveRes = await fetch('/api/admin/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'google-sheets-save',
          dbData: pulledData,
        }),
      });

      const saveData = await saveRes.json();
      if (!saveData.success) {
        throw new Error(saveData.message || 'Lỗi khi lưu dữ liệu từ Google Sheets vào máy chủ');
      }

      // Update local storage safely by merging without losing existing items
      if (pulledHasTeachers || pulledHasStudents) {
        const curAcc = getStoredAccounts();
        const tMap = new Map<string, any>();
        (curAcc.teachers || []).forEach((t: any) => { if (t?.idUser) tMap.set(String(t.idUser).toLowerCase(), t); });
        const existingTIds = new Set<string>(Array.from(tMap.keys()));

        (pulledData.teachers || []).forEach((t: any) => {
          let idUser = String(t?.idUser || '').trim();
          const hoTen = String(t?.hoTen || '').trim();
          const chiDoan = String(t?.chiDoan || t?.toChuyenMon || t?.department || '').trim();
          if (!idUser && hoTen) {
            idUser = generateTeacherUsername(hoTen, chiDoan, existingTIds);
            existingTIds.add(idUser.toLowerCase());
          }
          if (idUser) {
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
        (curAcc.students || []).forEach((s: any) => { if (s?.idUser) sMap.set(String(s.idUser).toLowerCase(), s); });
        const existingSIds = new Set<string>(Array.from(sMap.keys()));

        (pulledData.students || []).forEach((s: any) => {
          let idUser = String(s?.idUser || '').trim();
          const hoTen = String(s?.hoTen || '').trim();
          let chiDoan = String(s?.chiDoan || s?.className || s?.lop || '').trim();
          let khoi = String(s?.khoi || '').trim();
          if (!chiDoan && khoi) {
            chiDoan = khoi.includes('K') || khoi.includes('Khối') ? khoi : `Khối ${khoi}`;
          }
          if (!khoi && chiDoan) {
            const matchG = chiDoan.match(/\d+/);
            khoi = matchG ? matchG[0] : '12';
          }
          if (!idUser && hoTen) {
            idUser = generateStudentUsername(hoTen, chiDoan || khoi, existingSIds);
            existingSIds.add(idUser.toLowerCase());
          }
          if (idUser) {
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

      if (pulledHasCourses) {
        const curCourses = getStoredCourses();
        const cMap = new Map<string, any>();
        curCourses.forEach((c: any) => { if (c?.courseId) cMap.set(String(c.courseId), c); });
        pulledData.courses.forEach((c: any) => { if (c?.courseId) cMap.set(String(c.courseId), c); });
        saveStoredCourses(Array.from(cMap.values()));
        window.dispatchEvent(new Event('courses-updated'));
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

      const newConfig: GoogleSheetsConfig = {
        ...sheetsConfig,
        appsScriptUrl: url,
        lastSyncTime: new Date().toISOString(),
      };
      setSheetsConfig(newConfig);
      saveStoredGoogleSheetsConfig(newConfig);

      setSheetsFeedback({
        type: 'success',
        message: 'Đã nạp và cập nhật toàn bộ cơ sở dữ liệu từ Google Sheets về hệ thống LMS an toàn!',
        url: sheetsConfig.spreadsheetUrl,
      });

      if (onDataPurged) onDataPurged();
    } catch (err: any) {
      setSheetsFeedback({
        type: 'error',
        message: 'Lỗi khi nạp dữ liệu từ Google Sheets: ' + (err?.message || err),
      });
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Handle push to cloud (Supabase)
  const handlePushToCloud = async () => {
    setIsSyncingCloud(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/admin/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push-to-cloud' }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncFeedback({
          type: 'success',
          message: data.message || 'Đã đồng bộ toàn bộ khóa học và tài khoản lên đám mây thành công!',
        });
        setCloudStatus((prev) => ({ ...prev, online: true, counts: data.counts }));
        if (onDataPurged) onDataPurged();
      } else {
        setSyncFeedback({
          type: 'error',
          message: data.message || 'Không thể đồng bộ lên đám mây!',
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'Lỗi mạng khi đồng bộ: ' + (err?.message || err),
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Handle pull from cloud (Supabase)
  const handlePullFromCloud = async () => {
    setIsSyncingCloud(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/admin/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull-from-cloud' }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncFeedback({
          type: 'success',
          message: data.message || 'Đã nạp mới dữ liệu từ đám mây thành công!',
        });
        setCloudStatus((prev) => ({ ...prev, online: true, counts: data.counts }));
        window.dispatchEvent(new Event('courses-updated'));
        window.dispatchEvent(new Event('accounts-updated'));
        if (onDataPurged) onDataPurged();
      } else {
        setSyncFeedback({
          type: 'error',
          message: data.message || 'Không thể lấy dữ liệu từ đám mây!',
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'Lỗi mạng khi tải dữ liệu: ' + (err?.message || err),
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Handle Export All JSON
  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/admin/export-all');
      if (!res.ok) throw new Error('Không thể tải file sao lưu');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lms_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setSyncFeedback({
        type: 'success',
        message: 'Đã xuất file sao lưu JSON thành công! Bạn có thể lưu trữ file này an toàn.',
      });
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'Lỗi xuất file: ' + err.message,
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Import JSON file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setSyncFeedback(null);

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);

      const res = await fetch('/api/admin/import-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonData),
      });
      const data = await res.json();

      if (data.success) {
        setSyncFeedback({
          type: 'success',
          message: data.message || 'Khôi phục dữ liệu từ file thành công!',
        });
        window.dispatchEvent(new Event('courses-updated'));
        window.dispatchEvent(new Event('accounts-updated'));
        if (onDataPurged) onDataPurged();
      } else {
        setSyncFeedback({
          type: 'error',
          message: data.message || 'Lỗi khi nhập dữ liệu!',
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'File JSON không đúng định dạng: ' + err.message,
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Get current counts for display
  const storedAccounts = useMemo(() => {
    return getStoredAccounts();
  }, [isOpen]);

  const hasAnySelected = Object.values(selectedOptions).some(Boolean);

  const handleToggleOption = (key: keyof typeof selectedOptions) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setErrorMessage('');
  };

  const handleSelectAll = (select: boolean) => {
    setSelectedOptions({
      deleteStudents: select,
      deleteTeachers: select,
      deleteCourses: select,
      deleteStudyProgress: select,
      deleteQa: select,
      deleteRequests: select,
    });
    setErrorMessage('');
  };

  const handleExecuteDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!hasAnySelected) {
      setErrorMessage('Vui lòng chọn ít nhất một mục dữ liệu cần xóa!');
      return;
    }

    if (!adminPassword.trim()) {
      setErrorMessage('Vui lòng nhập mật khẩu tài khoản Quản trị viên (Admin) để xác nhận!');
      return;
    }

    if (!confirmUnderstood) {
      setErrorMessage('Vui lòng tích xác nhận bạn đã hiểu rõ hành động xóa này.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Call Backend API
      const res = await fetch('/api/admin/clean-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPassword: adminPassword.trim(),
          options: selectedOptions,
          userObj: currentUser,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Mật khẩu Admin không chính xác hoặc lỗi hệ thống!');
      }

      // 2. Clear Local Cache and mirror corresponding to options
      if (selectedOptions.deleteStudents || selectedOptions.deleteTeachers) {
        const acc = getStoredAccounts();
        const newTeachers = selectedOptions.deleteTeachers ? [] : acc.teachers;
        const newStudents = selectedOptions.deleteStudents ? [] : acc.students;
        saveStoredAccounts(newTeachers, newStudents);
        window.dispatchEvent(new Event('accounts-updated'));
      }

      if (selectedOptions.deleteCourses) {
        saveStoredCourses([]);
        // Khóa học bị xóa thì tất cả giấy chứng nhận đã cấp của khóa học đó cũng bị xóa
        const allCerts = getStoredCertificates() || [];
        allCerts.forEach((c: any) => {
          if (c?.certificateId) deleteStoredCertificate(c.certificateId);
        });
        window.dispatchEvent(new Event('certificates-updated'));
        window.dispatchEvent(new Event('courses-updated'));
      }

      if (selectedOptions.deleteStudyProgress) {
        clearAllStoredStudyProgress();
      }

      if (selectedOptions.deleteQa) {
        saveStoredQaQuestions([]);
        window.dispatchEvent(new Event('lms-qa-updated'));
        window.dispatchEvent(new Event('qa-updated'));
      }

      if (selectedOptions.deleteRequests) {
        saveAllStoredResetPasswordRequests([]);
        saveAllStoredPendingRegistrations([]);
        window.dispatchEvent(new Event('registrations-updated'));
        window.dispatchEvent(new Event('pending-registrations-updated'));
        window.dispatchEvent(new Event('reset-requests-updated'));
      }

      setSuccessMessage(data.message || 'Đã dọn dẹp và đồng bộ xóa hoàn tất trên máy chủ Supabase thành công!');

      if (onDataPurged) {
        onDataPurged();
      }

      setTimeout(() => {
        onClose();
        setSuccessMessage('');
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Đã xảy ra lỗi khi xóa dữ liệu. Vui lòng thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen && !isInline) return null;

  const modalInner = (
    <div className={`bg-white w-full ${isInline ? 'rounded-3xl shadow-sm border border-slate-200/90 h-auto overflow-visible' : 'max-w-3xl h-[min(90vh,720px)] rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden'} flex flex-col`}>
      {/* Header */}
      {!isInline && (
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-indigo-300 shadow-sm shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight uppercase">
                  QUẢN TRỊ DỮ LIỆU & ĐỒNG BỘ GOOGLE SHEET
                </h2>
                <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase">
                  Google Sheets Active
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-indigo-100/90 font-medium mt-0.5 line-clamp-1">
                Lưu trữ toàn bộ dữ liệu trên Google Sheets & sao lưu hệ thống an toàn
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer"
            title="Đóng (Về tổng quan)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 flex items-center gap-2 shrink-0 overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            setActiveTab('supabase');
            setSyncFeedback(null);
            checkCloudStatus();
          }}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'supabase'
              ? 'border-emerald-600 text-emerald-700 bg-white shadow-xs'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Database className="w-4 h-4 text-emerald-600" />
          <span>Cơ sở dữ liệu Supabase Cloud & Vercel</span>
          {cloudStatus.online ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('backup');
            setSyncFeedback(null);
          }}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'backup'
              ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Database className="w-4 h-4 text-blue-600" />
          <span>Sao lưu & Khôi phục (JSON)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('purge');
            setErrorMessage('');
            setSuccessMessage('');
          }}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'purge'
              ? 'border-rose-600 text-rose-600 bg-white shadow-xs'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Trash2 className="w-4 h-4 text-rose-600" />
          <span>Dọn dẹp & Xóa dữ liệu</span>
        </button>
      </div>

      {/* TAB 0: SUPABASE CLOUD DATABASE (PRIMARY) */}
      {activeTab === 'supabase' && (
        <div className="p-5 sm:p-6 space-y-5 flex-1 overflow-y-auto">
          {/* Feedback message */}
          {syncFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between gap-2.5 ${
                syncFeedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {syncFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="leading-relaxed">{syncFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setSyncFeedback(null)}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          )}

          {/* Supabase Status Banner */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 shadow-lg border border-slate-700/60 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 shadow-inner">
                  <Database className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base font-bold text-white tracking-wide">
                      Supabase Cloud Database & Vercel
                    </h4>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 ${
                        cloudStatus.online
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          cloudStatus.online ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                        }`}
                      />
                      {cloudStatus.online ? 'Online (Đã kết nối)' : 'Cục bộ / Cache sẵn sàng'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Hệ thống lưu trữ PostgreSQL hiệu năng cao thay thế toàn bộ Google Sheets, tối ưu hóa cho Vercel.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={checkCloudStatus}
                  className="px-3.5 py-2 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all border border-white/15 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kiểm tra</span>
                </button>
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <span>Supabase Console</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Metrics overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-white/10">
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <span className="text-[11px] text-slate-400 block font-medium">Khóa học & Bài giảng</span>
                <span className="text-lg font-black text-white mt-0.5 block">
                  {cloudStatus.counts?.courses ?? courses.length}
                </span>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <span className="text-[11px] text-slate-400 block font-medium">Tài khoản Giáo viên</span>
                <span className="text-lg font-black text-emerald-400 mt-0.5 block">
                  {cloudStatus.counts?.teachers ?? (getStoredAccounts().teachers?.length || 0)}
                </span>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <span className="text-[11px] text-slate-400 block font-medium">Tài khoản Học sinh</span>
                <span className="text-lg font-black text-blue-400 mt-0.5 block">
                  {cloudStatus.counts?.students ?? (getStoredAccounts().students?.length || 0)}
                </span>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <span className="text-[11px] text-slate-400 block font-medium">Cơ chế đồng bộ</span>
                <span className="text-xs font-bold text-amber-300 mt-1 block">
                  Supabase + Vercel
                </span>
              </div>
            </div>
          </div>

          {/* Cloud Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <CloudUpload className="w-4 h-4 text-emerald-600" />
                  <span>Đẩy dữ liệu lên Supabase Cloud (Push All)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Đồng bộ toàn bộ dữ liệu hiện tại (Khóa học, Tài khoản, Điểm số, Đăng ký, Q&A) lên bảng đám mây Supabase.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePushToCloud}
                disabled={isSyncingCloud}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                {isSyncingCloud ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudUpload className="w-4 h-4" />
                )}
                <span>{isSyncingCloud ? 'Đang đồng bộ...' : 'Đẩy tất cả dữ liệu lên Supabase Cloud'}</span>
              </button>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <CloudDownload className="w-4 h-4 text-blue-600" />
                  <span>Nạp dữ liệu từ Supabase Cloud (Pull All)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Tải dữ liệu mới nhất từ Supabase Cloud về làm mới bộ nhớ trình duyệt của trường.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePullFromCloud}
                disabled={isSyncingCloud}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                {isSyncingCloud ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudDownload className="w-4 h-4" />
                )}
                <span>{isSyncingCloud ? 'Đang nạp...' : 'Nạp dữ liệu từ Supabase Cloud'}</span>
              </button>
            </div>
          </div>

          {/* SQL Schema Initialization for Supabase */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs sm:text-sm">
                <Code2 className="w-4 h-4 text-indigo-600" />
                <span>Mã SQL khởi tạo Supabase Database (Schema & RLS)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSqlEditorBlock(!showSqlEditorBlock)}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  {showSqlEditorBlock ? 'Ẩn mã SQL' : 'Xem mã SQL'}
                </button>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copiedSql ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Đã sao chép!</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Sao chép toàn bộ SQL</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Mã SQL chuẩn hóa tạo các bảng <code className="bg-slate-200 px-1 py-0.5 rounded text-indigo-700 font-mono text-[11px]">lms_kv</code>,{' '}
              <code className="bg-slate-200 px-1 py-0.5 rounded text-indigo-700 font-mono text-[11px]">lms_courses</code>,{' '}
              <code className="bg-slate-200 px-1 py-0.5 rounded text-indigo-700 font-mono text-[11px]">lms_sync_logs</code>, thiết lập Row Level Security (RLS) và Realtime Triggers tự động.
            </p>

            {showSqlEditorBlock && (
              <div className="mt-3 relative">
                <pre className="p-3.5 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto max-h-60 border border-slate-800 leading-relaxed selection:bg-emerald-900">
                  {supabaseSqlScript}
                </pre>
              </div>
            )}
          </div>

          {/* Step-by-step Setup Guide for Vercel + Supabase */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
            <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>Các bước thiết lập Supabase + Vercel (3 phút)</span>
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                  1
                </span>
                <div>
                  <strong className="block text-slate-900 font-semibold mb-0.5">Tạo Supabase Project</strong>
                  Truy cập <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-600 underline font-medium">supabase.com</a>, đăng ký miễn phí và tạo New Project (chọn khu vực Singapore hoặc gần nhất).
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                  2
                </span>
                <div>
                  <strong className="block text-slate-900 font-semibold mb-0.5">Chạy mã SQL khởi tạo</strong>
                  Vào <strong>SQL Editor</strong> trên menu trái của Supabase, bấm <em>"Sao chép toàn bộ SQL"</em> ở trên, dán vào và nhấn <strong>Run</strong>.
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                  3
                </span>
                <div>
                  <strong className="block text-slate-900 font-semibold mb-0.5">Lấy thông tin API</strong>
                  Vào <strong>Project Settings &rarr; API</strong>, sao chép <code>Project URL</code> và <code>anon public key</code> (hoặc <code>service_role secret key</code>).
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                  4
                </span>
                <div>
                  <strong className="block text-slate-900 font-semibold mb-0.5">Cấu hình Vercel</strong>
                  Trên Vercel Project Settings &rarr; Environment Variables, thêm các biến: <code className="text-indigo-600 font-mono text-[10px]">VITE_SUPABASE_URL</code>, <code className="text-indigo-600 font-mono text-[10px]">VITE_SUPABASE_ANON_KEY</code>.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BACKUP & RESTORE */}
      {activeTab === 'backup' && (
        <div className="p-5 sm:p-6 space-y-5 flex-1 overflow-y-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2.5 text-blue-900 font-bold text-sm">
              <Database className="w-5 h-5 text-blue-600" />
              <span>Sao lưu & Khôi phục toàn bộ Dữ liệu hệ thống (JSON Backup)</span>
            </div>
            <p className="text-xs text-blue-700 leading-relaxed">
              Bạn có thể tải về file sao lưu JSON chứa đầy đủ tất cả Khóa học, Tài khoản Giáo viên, Học sinh, Yêu cầu đặt lại mật khẩu và Q&A để lưu trữ offline hoặc phục hồi lại bất cứ lúc nào.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-white shadow-xs">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Download className="w-4 h-4 text-indigo-600" />
                <span>1. Xuất dữ liệu sao lưu (Backup)</span>
              </div>
              <p className="text-xs text-slate-500">
                Tải về toàn bộ dữ liệu hiện tại trên hệ thống máy chủ về máy tính của bạn dưới dạng tệp JSON.
              </p>
              <button
                type="button"
                onClick={handleExportAll}
                disabled={isExporting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>Tải về file Backup (.json)</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-white shadow-xs">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>2. Khôi phục dữ liệu (Restore)</span>
              </div>
              <p className="text-xs text-slate-500">
                Tải lên tệp sao lưu JSON đã tải về trước đó để ghi đè và phục hồi dữ liệu hệ thống.
              </p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>Chọn file Backup để phục hồi</span>
              </button>
            </div>
          </div>

          {/* Feedback */}
          {syncFeedback && (
            <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2.5 ${syncFeedback.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-rose-50 border border-rose-200 text-rose-900'}`}>
              {syncFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
              <span>{syncFeedback.message}</span>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PURGE & CLEANUP */}
      {activeTab === 'purge' && (
        <form onSubmit={handleExecuteDelete} className="p-5 sm:p-6 space-y-5 flex-1 overflow-y-auto">
          {/* Warning Banner */}
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-rose-950 uppercase tracking-tight">
                VÙNG NGUY HIỂM: THAO TÁC XÓA KHÔNG THỂ HOÀN TÁC
              </h3>
              <p className="text-xs text-rose-800 leading-relaxed font-medium">
                Vui lòng chọn chính xác các mục dữ liệu cần xóa dưới đây và nhập mật khẩu Quản trị viên (Admin) để xác nhận. Dữ liệu được chọn sẽ bị xóa hoàn toàn trên cả hệ thống LMS lẫn máy chủ cơ sở dữ liệu Supabase.
              </p>
            </div>
          </div>

          {/* Options Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase text-slate-700 tracking-wider">
                Chọn các danh mục cần xóa:
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  className="text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                >
                  Chọn tất cả
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Students */}
              <label
                onClick={() => handleToggleOption('deleteStudents')}
                className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer select-none ${
                  selectedOptions.deleteStudents
                    ? 'border-rose-500 bg-rose-50/60 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedOptions.deleteStudents}
                  onChange={() => {}}
                  className="mt-1 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-900">Tài khoản Học sinh</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                    Xóa tất cả {storedAccounts.students.length} tài khoản học sinh trong hệ thống
                  </p>
                </div>
              </label>

              {/* Option 2: Teachers */}
              <label
                onClick={() => handleToggleOption('deleteTeachers')}
                className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer select-none ${
                  selectedOptions.deleteTeachers
                    ? 'border-rose-500 bg-rose-50/60 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedOptions.deleteTeachers}
                  onChange={() => {}}
                  className="mt-1 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-900">Tài khoản Giáo viên</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                    Xóa tất cả {storedAccounts.teachers.length} tài khoản giáo viên (giữ lại tài khoản Admin)
                  </p>
                </div>
              </label>

              {/* Option 3: Courses */}
              <label
                onClick={() => handleToggleOption('deleteCourses')}
                className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer select-none ${
                  selectedOptions.deleteCourses
                    ? 'border-rose-500 bg-rose-50/60 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedOptions.deleteCourses}
                  onChange={() => {}}
                  className="mt-1 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-900">Toàn bộ Khóa học</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                    Xóa tất cả {courses.length} khóa học, bài giảng, câu hỏi trắc nghiệm và toàn bộ giấy chứng nhận đã cấp
                  </p>
                </div>
              </label>

              {/* Option 4: Study Progress */}
              <label
                onClick={() => handleToggleOption('deleteStudyProgress')}
                className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer select-none ${
                  selectedOptions.deleteStudyProgress
                    ? 'border-rose-500 bg-rose-50/60 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedOptions.deleteStudyProgress}
                  onChange={() => {}}
                  className="mt-1 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <History className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-900">Tiến độ, Điểm thi & Điểm danh</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                    Xóa kết quả trắc nghiệm, chứng nhận hoàn thành và điểm danh
                  </p>
                </div>
              </label>

              {/* Option 5: QA */}
              <label
                onClick={() => handleToggleOption('deleteQa')}
                className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer select-none ${
                  selectedOptions.deleteQa
                    ? 'border-rose-500 bg-rose-50/60 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedOptions.deleteQa}
                  onChange={() => {}}
                  className="mt-1 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-900">Câu hỏi & Thảo luận (Q&A)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                    Xóa tất cả câu hỏi trao đổi giữa học sinh và giáo viên
                  </p>
                </div>
              </label>

              {/* Option 6: Requests */}
              <label
                onClick={() => handleToggleOption('deleteRequests')}
                className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer select-none ${
                  selectedOptions.deleteRequests
                    ? 'border-rose-500 bg-rose-50/60 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedOptions.deleteRequests}
                  onChange={() => {}}
                  className="mt-1 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-900">Yêu cầu Reset MK & Đăng ký</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                    Xóa các yêu cầu quên mật khẩu và đăng ký tài khoản đang chờ
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Admin Password Input */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-slate-600" />
              <span>Xác thực Mật khẩu Quản trị viên (Admin):</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  setErrorMessage('');
                }}
                placeholder="Nhập mật khẩu tài khoản Admin..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Understand Checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmUnderstood}
              onChange={(e) => {
                setConfirmUnderstood(e.target.checked);
                setErrorMessage('');
              }}
              className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
            />
            <span className="text-xs text-slate-700 font-medium leading-relaxed">
              Tôi xác nhận đã hiểu rõ dữ liệu được chọn sẽ bị xóa vĩnh viễn khỏi hệ thống máy chủ và không thể phục hồi lại được.
            </span>
          </label>

          {/* Messages */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !hasAnySelected || !confirmUnderstood || !adminPassword.trim()}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang thực hiện xóa...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Xác nhận Xóa Dữ liệu</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  if (isInline) {
    return modalInner;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {modalInner}
    </div>
  );
};
