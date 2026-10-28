import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { User, PendingRegistration, ResetPasswordRequest } from '../types';
import {
  getStoredAccounts,
  saveStoredAccounts,
  resetStoredPassword,
  AccountItem,
  getStoredPendingRegistrations,
  saveAllStoredPendingRegistrations,
  getStoredResetPasswordRequests,
  saveAllStoredResetPasswordRequests,
  addNotification,
} from '../lib/storage';
import { notifySyncStatus } from './SyncNotificationToast';
import {
  X,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Search,
  Users,
  FileSpreadsheet,
  ShieldAlert,
  Key,
  Plus,
  RefreshCw,
  UserCheck,
  GraduationCap,
  RotateCcw,
  Mail,
  Clock,
  Check,
  XCircle,
  Inbox,
  KeyRound,
  Edit3,
  Cloud,
  CloudCheck,
  CloudOff,
  Database,
  Sparkles,
  Lock,
  ShieldCheck,
  Shield,
} from 'lucide-react';

interface AccountManagementModalProps {
  isOpen?: boolean;
  currentUser: User | null;
  onClose: () => void;
  onRefreshData?: () => void;
  isInline?: boolean;
}

interface AccountRow {
  stt: string | number;
  hoTen: string;
  chiDoan: string; // "Tổ chuyên môn" for Teachers, "Lớp" for Students
  idUser: string; // Tên tài khoản
  isDuplicate?: boolean;
  duplicateReason?: string;
}

export const AccountManagementModal: React.FC<AccountManagementModalProps> = ({
  isOpen = true,
  currentUser,
  onClose,
  onRefreshData,
  isInline = false,
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isTeacher = currentUser?.role === 'TEACHER';

  // Active Tab: ADMIN can toggle between ADMIN, TEACHER, STUDENT, APPROVAL, and RESET_REQUESTS; TEACHER can toggle between STUDENT and RESET_REQUESTS
  const [activeTab, setActiveTab] = useState<'ADMIN' | 'TEACHER' | 'STUDENT' | 'APPROVAL' | 'RESET_REQUESTS'>(
    isAdmin ? 'APPROVAL' : 'STUDENT'
  );

  const [mode, setMode] = useState<'LIST' | 'IMPORT'>('LIST');

  // Existing Accounts from DB
  const [adminAccount, setAdminAccount] = useState<{ idUser: string; hoTen: string; chiDoan: string; defaultPass: string; customPass: string; avatar?: string; role?: string } | null>(null);
  const [teachers, setTeachers] = useState<Array<{ idUser: string; hoTen: string; chiDoan: string; defaultPass: string; customPass: string; avatar?: string }>>([]);
  const [students, setStudents] = useState<Array<{ idUser: string; hoTen: string; chiDoan: string; defaultPass: string; customPass: string; avatar?: string }>>([]);
  const [pendingList, setPendingList] = useState<PendingRegistration[]>([]);
  const [resetRequests, setResetRequests] = useState<ResetPasswordRequest[]>([]);
  const [resetRoleFilter, setResetRoleFilter] = useState<'ALL' | 'TEACHER' | 'STUDENT'>('ALL');
  const [resetTeacherStatusFilter, setResetTeacherStatusFilter] = useState<'ALL' | 'APPROVED' | 'PENDING'>('ALL');
  const [regRoleFilter, setRegRoleFilter] = useState<'ALL' | 'TEACHER' | 'STUDENT'>('ALL');
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Import / Batch Creation State
  const [parsedRows, setParsedRows] = useState<AccountRow[]>([]);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const [overwriteDuplicates, setOverwriteDuplicates] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Single Account Create State
  const [isSingleCreateOpen, setIsSingleCreateOpen] = useState(false);
  const [singleCreateData, setSingleCreateData] = useState({
    hoTen: '',
    chiDoan: '',
    idUser: '',
    defaultPass: '123',
    avatar: '',
  });
  const [creatingSingle, setCreatingSingle] = useState(false);

  // Single Account Edit State
  const [editAccountModal, setEditAccountModal] = useState<{
    isOpen: boolean;
    origIdUser: string;
    accountType: 'TEACHER' | 'STUDENT';
    hoTen: string;
    chiDoan: string;
    idUser: string;
    defaultPass: string;
    customPass: string;
    avatar: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Google Sheets Auto-Sync State
  const [sheetsConfig, setSheetsConfig] = useState<{
    spreadsheetUrl?: string;
    appsScriptUrl?: string;
    autoPushToSheets?: boolean;
    lastSyncTime?: string;
    lastSyncStatus?: string;
    lastSyncMessage?: string;
  }>({});
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Sheets Config
  const fetchSheetsConfig = async () => {
    try {
      const res = await fetch('/api/sheets-config');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setSheetsConfig(data.config);
        }
      }
    } catch (e) {
      console.warn('Cannot fetch sheets-config:', e);
    }
  };

  // Manual Trigger Google Sheets Push/Pull
  const handleTriggerSheetsSync = async (mode: 'push' | 'pull' = 'push') => {
    setIsSyncingSheets(true);
    try {
      const res = await fetch('/api/sheets-sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.success) {
        notifySyncStatus('success', 'Đồng bộ Google Sheets thành công', data.message || 'Dữ liệu tài khoản đã được đồng bộ với Google Sheets!');
        fetchAccounts();
        fetchSheetsConfig();
        if (onRefreshData) onRefreshData();
      } else {
        notifySyncStatus('warning', 'Đồng bộ Google Sheets chưa xong', data.message || 'Vui lòng kiểm tra lại cấu hình Webhook Google Apps Script.');
      }
    } catch (err: any) {
      notifySyncStatus('error', 'Lỗi đồng bộ Google Sheets', err?.message || 'Không thể kết nối máy chủ để đồng bộ.');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Create Single Account Handler
  const handleCreateSingleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = (singleCreateData.hoTen || '').trim();
    const cleanId = (singleCreateData.idUser || '').trim();
    const cleanOrg = (singleCreateData.chiDoan || '').trim();
    const defaultPass = (singleCreateData.defaultPass || '123').trim() || '123';
    const avatar = (singleCreateData.avatar || '').trim();

    if (!cleanName || !cleanId) {
      alert('Vui lòng nhập đầy đủ Họ tên và Tên tài khoản (ID)!');
      return;
    }

    setCreatingSingle(true);
    try {
      const res = await fetch('/api/accounts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountType: activeTab,
          item: {
            hoTen: cleanName,
            chiDoan: cleanOrg || (activeTab === 'TEACHER' ? 'Giáo viên' : 'Lớp'),
            idUser: cleanId,
            defaultPass,
            customPass: '',
            avatar,
          },
          userObj: currentUser,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message || `Đã tạo tài khoản "${cleanId}" thành công và tự động đồng bộ về Google Sheets!`);
        setIsSingleCreateOpen(false);
        setSingleCreateData({ hoTen: '', chiDoan: '', idUser: '', defaultPass: '123', avatar: '' });
        fetchAccounts();
        fetchSheetsConfig();
        window.dispatchEvent(new Event('accounts-updated'));
        if (onRefreshData) onRefreshData();
      } else {
        alert(data.message || 'Lỗi khi tạo tài khoản!');
      }
    } catch (err: any) {
      alert('Lỗi kết nối máy chủ: ' + (err?.message || err));
    } finally {
      setCreatingSingle(false);
    }
  };

  // Edit Account Handler
  const handleEditAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAccountModal) return;

    const cleanName = (editAccountModal.hoTen || '').trim();
    const cleanId = (editAccountModal.origIdUser || editAccountModal.idUser || '').trim();
    const cleanOrg = (editAccountModal.chiDoan || '').trim();
    const avatar = (editAccountModal.avatar || '').trim();

    if (!cleanName || !cleanId) {
      alert('Vui lòng nhập đầy đủ Họ và tên!');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch('/api/accounts/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountType: editAccountModal.accountType,
          originalIdUser: editAccountModal.origIdUser,
          item: {
            hoTen: cleanName,
            chiDoan: cleanOrg,
            idUser: cleanId,
            defaultPass: editAccountModal.defaultPass || '123',
            customPass: editAccountModal.customPass,
            avatar,
          },
          userObj: currentUser,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message || `Đã cập nhật thông tin tài khoản "${cleanId}" thành công và tự động đồng bộ lên Google Sheets!`);
        setEditAccountModal(null);
        fetchAccounts();
        fetchSheetsConfig();
        window.dispatchEvent(new Event('accounts-updated'));
        if (onRefreshData) onRefreshData();
      } else {
        alert(data.message || 'Lỗi khi cập nhật tài khoản!');
      }
    } catch (err: any) {
      alert('Lỗi kết nối máy chủ: ' + (err?.message || err));
    } finally {
      setSavingEdit(false);
    }
  };

  // Fetch reset password requests
  const fetchResetRequests = async () => {
    try {
      const res = await fetch('/api/reset-password-requests');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.items)) {
          setResetRequests(data.items);
          window.dispatchEvent(new Event('reset-requests-updated'));
          return;
        }
      }
    } catch (err) {
      console.warn('Backend API /api/reset-password-requests unavailable.');
    }
    const storedReqs = getStoredResetPasswordRequests();
    setResetRequests(storedReqs);
    window.dispatchEvent(new Event('reset-requests-updated'));
  };

  // Fetch pending registrations
  const fetchPendingRegistrations = async () => {
    try {
      const res = await fetch('/api/pending-registrations');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.items)) {
          setPendingList(data.items);
          return;
        }
      }
    } catch (err) {
      console.warn('Backend API /api/pending-registrations unavailable.');
    }
    setPendingList(getStoredPendingRegistrations());
  };

  // Approve reset password request
  const handleApproveResetPassword = async (req: ResetPasswordRequest) => {
    // Reset local password first to ensure immediate sync
    resetStoredPassword(req.idUser);

    try {
      const res = await fetch('/api/reset-password/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: req.id,
          idUser: req.idUser,
          adminUser: currentUser?.idUser,
          userRole: currentUser?.role || (isAdmin ? 'ADMIN' : 'TEACHER'),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.items)) {
            setResetRequests(data.items);
            saveAllStoredResetPasswordRequests(data.items);
          } else {
            fetchResetRequests();
          }
          window.dispatchEvent(new Event('reset-requests-updated'));
          fetchAccounts();
          if (onRefreshData) onRefreshData();
          return;
        }
      }
    } catch (err) {
      console.warn('API reset password approve failed, updating locally.');
    }

    // Local fallback
    const allReqs = getStoredResetPasswordRequests();
    const updated = allReqs.map((r) =>
      r.id === req.id || (r.idUser && r.idUser.toLowerCase() === req.idUser.toLowerCase())
        ? { ...r, status: 'APPROVED' as const }
        : r
    );
    saveAllStoredResetPasswordRequests(updated);
    setResetRequests(updated);
    window.dispatchEvent(new Event('reset-requests-updated'));
    fetchAccounts();
    if (onRefreshData) onRefreshData();
  };

  // Reject reset password request
  const handleRejectResetPassword = async (req: ResetPasswordRequest) => {
    try {
      const res = await fetch('/api/reset-password/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: req.id,
          idUser: req.idUser,
          userRole: currentUser?.role || (isAdmin ? 'ADMIN' : 'TEACHER'),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.items)) {
            setResetRequests(data.items);
            saveAllStoredResetPasswordRequests(data.items);
          } else {
            fetchResetRequests();
          }
          window.dispatchEvent(new Event('reset-requests-updated'));
          return;
        }
      }
    } catch (err) {
      console.warn('API reset password reject failed, updating locally.');
    }

    const allReqs = getStoredResetPasswordRequests();
    const updated = allReqs.map((r) =>
      r.id === req.id || (r.idUser && r.idUser.toLowerCase() === req.idUser.toLowerCase())
        ? { ...r, status: 'REJECTED' as const }
        : r
    );
    saveAllStoredResetPasswordRequests(updated);
    setResetRequests(updated);
    window.dispatchEvent(new Event('reset-requests-updated'));
  };

  // Approval Modal State
  const [approvalModalReg, setApprovalModalReg] = useState<PendingRegistration | null>(null);
  const [approvalIdInput, setApprovalIdInput] = useState('');

  // Open Approval Modal
  const handleOpenApproveModal = (reg: PendingRegistration) => {
    setApprovalModalReg(reg);
    setApprovalIdInput(reg.idUser || '');
  };

  // Execute approval with entered ID and default password "123"
  const executeApproveRegistration = async () => {
    if (!approvalModalReg) return;
    const targetId = (approvalIdInput || '').trim();
    if (!targetId) {
      alert('Vui lòng nhập Tên tài khoản (ID)!');
      return;
    }

    const reg = approvalModalReg;

    try {
      const res = await fetch('/api/register/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reg.id,
          idUser: targetId,
          reg: { ...reg, idUser: targetId },
          adminUser: currentUser?.idUser,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(`Đã phê duyệt và tạo tài khoản "${targetId}" thành công với mật khẩu mặc định "123"!`);
          if (Array.isArray(data.items)) {
            setPendingList(data.items);
            saveAllStoredPendingRegistrations(data.items);
          }
          if (Array.isArray(data.teachers) && Array.isArray(data.students)) {
            const apiTeachers: AccountItem[] = data.teachers.map((t: any) => ({ ...t, role: 'TEACHER' }));
            const apiStudents: AccountItem[] = data.students.map((s: any) => ({ ...s, role: 'STUDENT' }));
            setTeachers(apiTeachers as any);
            setStudents(apiStudents as any);
            saveStoredAccounts(apiTeachers, apiStudents);
          }
          setApprovalModalReg(null);
          fetchAccounts();
          if (onRefreshData) onRefreshData();
          return;
        }
      }
    } catch (err) {
      console.warn('Backend API approval failed, updating locally.');
    }

    // Local fallback approval
    reg.idUser = targetId;
    reg.status = 'APPROVED';
    reg.processedAt = new Date().toISOString();
    reg.processedBy = currentUser?.idUser || 'admin.c3nguyenquangdieu';
    reg.responseNote = 'Tài khoản đã được phê duyệt thành công.';
    const allPending = getStoredPendingRegistrations();
    const updated = allPending.map((p) => (p.id === reg.id ? reg : p));
    saveAllStoredPendingRegistrations(updated);

    // Add account to local stored accounts with defaultPass '123'
    const stored = getStoredAccounts();
    const newAcc = {
      idUser: targetId,
      hoTen: reg.hoTen,
      chiDoan: reg.chiDoan,
      defaultPass: '123',
      role: reg.role,
    };
    if (reg.role === 'TEACHER') {
      stored.teachers = stored.teachers.filter((t) => t.idUser.toLowerCase() !== targetId.toLowerCase());
      stored.teachers.push(newAcc);
    } else {
      stored.students = stored.students.filter((s) => s.idUser.toLowerCase() !== targetId.toLowerCase());
      stored.students.push(newAcc);
    }
    saveStoredAccounts(stored.teachers, stored.students);
    fetch('/api/accounts/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teachers: stored.teachers,
        students: stored.students,
        pendingRegistrations: updated,
        overwrite: true,
      }),
    }).catch(() => {});

    alert(`Đã phê duyệt và tạo tài khoản "${targetId}" thành công với mật khẩu mặc định "123"!`);
    setApprovalModalReg(null);
    fetchPendingRegistrations();
    fetchAccounts();
    if (onRefreshData) onRefreshData();
  };

  const handleRejectRegistration = async (reg: PendingRegistration) => {
    if (!confirm(`XÁC NHẬN TỪ CHỐI và HỦY yêu cầu đăng ký của "${reg.hoTen}" (${reg.idUser})?`)) {
      return;
    }

    try {
      const res = await fetch('/api/register/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reg.id, idUser: reg.idUser, reg, adminUser: currentUser?.idUser }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(data.message || `Đã từ chối và tự động hủy yêu cầu đăng ký của "${reg.hoTen}".`);
          if (Array.isArray(data.items)) {
            setPendingList(data.items);
            saveAllStoredPendingRegistrations(data.items);
          } else {
            const updated = pendingList.filter((p) => p.id !== reg.id);
            setPendingList(updated);
            saveAllStoredPendingRegistrations(updated);
          }
          return;
        }
      }
    } catch (err) {
      console.warn('Backend API reject failed, updating locally.');
    }

    const allPending = getStoredPendingRegistrations();
    const updated = allPending.filter((p) => p.id !== reg.id);
    saveAllStoredPendingRegistrations(updated);
    setPendingList(updated);

    alert(`Đã tự động hủy yêu cầu đăng ký của "${reg.hoTen}".`);
    fetchPendingRegistrations();
  };

  // Approve all pending registration requests
  const handleApproveAllRegistrations = async () => {
    const pendingItems = pendingList.filter((p) => p.status === 'PENDING');
    if (pendingItems.length === 0) {
      alert('Hiện không có yêu cầu đăng ký nào đang chờ duyệt.');
      return;
    }

    if (
      !confirm(
        `Bạn có chắc chắn muốn DUYỆT TẤT CẢ ${pendingItems.length} yêu cầu đăng ký không?\n\nMật khẩu mặc định sẽ được đặt là "123" và tài khoản sẽ được tự động khởi tạo.`
      )
    ) {
      return;
    }

    let apiSuccess = false;
    try {
      const res = await fetch('/api/register/approve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(data.message || `Đã phê duyệt tất cả ${pendingItems.length} yêu cầu đăng ký!`);
          if (Array.isArray(data.items)) {
            setPendingList(data.items);
            saveAllStoredPendingRegistrations(data.items);
          }
          if (Array.isArray(data.teachers) && Array.isArray(data.students)) {
            const apiTeachers: AccountItem[] = data.teachers.map((t: any) => ({ ...t, role: 'TEACHER' }));
            const apiStudents: AccountItem[] = data.students.map((s: any) => ({ ...s, role: 'STUDENT' }));
            setTeachers(apiTeachers as any);
            setStudents(apiStudents as any);
            saveStoredAccounts(apiTeachers, apiStudents);
          }
          fetchAccounts();
          if (onRefreshData) onRefreshData();
          apiSuccess = true;
        }
      }
    } catch (err) {
      console.warn('API register approve-all failed, processing locally.');
    }

    if (!apiSuccess) {
      const allPending = getStoredPendingRegistrations();
      const stored = getStoredAccounts();
      const nowStr = new Date().toISOString();

      allPending.forEach((p) => {
        if (p.status === 'PENDING') {
          p.status = 'APPROVED';
          p.processedAt = nowStr;
          p.processedBy = currentUser?.idUser || 'admin';
          p.responseNote = 'Phê duyệt hàng loạt.';

          const targetId = (p.idUser || '').trim();
          if (targetId) {
            const newAcc = {
              idUser: targetId,
              hoTen: p.hoTen,
              chiDoan: p.chiDoan,
              defaultPass: '123',
              role: p.role,
            };
            if (p.role === 'TEACHER') {
              stored.teachers = stored.teachers.filter((t) => t.idUser.toLowerCase() !== targetId.toLowerCase());
              stored.teachers.push(newAcc);
            } else {
              stored.students = stored.students.filter((s) => s.idUser.toLowerCase() !== targetId.toLowerCase());
              stored.students.push(newAcc);
            }
          }
        }
      });

      saveAllStoredPendingRegistrations(allPending);
      setPendingList(allPending);
      saveStoredAccounts(stored.teachers, stored.students);

      alert(`Đã phê duyệt tất cả ${pendingItems.length} yêu cầu đăng ký thành công với mật khẩu "123"!`);
      fetchAccounts();
      if (onRefreshData) onRefreshData();
    }
  };

  // Reject all pending registration requests
  const handleRejectAllRegistrations = async () => {
    const pendingItems = pendingList.filter((p) => p.status === 'PENDING');
    if (pendingItems.length === 0) {
      alert('Hiện không có yêu cầu đăng ký nào đang chờ từ chối.');
      return;
    }

    if (
      !confirm(
        `XÁC NHẬN TỪ CHỐI và HỦY TẤT CẢ ${pendingItems.length} yêu cầu đăng ký đang chờ?`
      )
    ) {
      return;
    }

    let apiSuccess = false;
    try {
      const res = await fetch('/api/register/reject-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(data.message || `Đã từ chối tất cả ${pendingItems.length} yêu cầu đăng ký!`);
          if (Array.isArray(data.items)) {
            setPendingList(data.items);
            saveAllStoredPendingRegistrations(data.items);
          } else {
            const updated = pendingList.filter((p) => p.status !== 'PENDING');
            setPendingList(updated);
            saveAllStoredPendingRegistrations(updated);
          }
          apiSuccess = true;
        }
      }
    } catch (err) {
      console.warn('API register reject-all failed, processing locally.');
    }

    if (!apiSuccess) {
      const allPending = getStoredPendingRegistrations();
      const updated = allPending.filter((p) => p.status !== 'PENDING');
      saveAllStoredPendingRegistrations(updated);
      setPendingList(updated);
      alert(`Đã từ chối và hủy tất cả ${pendingItems.length} yêu cầu đăng ký.`);
    }
  };

  // Approve all reset password requests
  const handleApproveAllResets = async () => {
    const pendingResets = resetRequests.filter(
      (r) => r.status === 'PENDING' && (isAdmin || r.role === 'STUDENT')
    );
    if (pendingResets.length === 0) {
      alert('Hiện không có yêu cầu đặt lại mật khẩu nào đang chờ duyệt.');
      return;
    }

    if (
      !confirm(
        `Bạn có chắc chắn muốn DUYỆT TẤT CẢ ${pendingResets.length} yêu cầu đặt lại mật khẩu không?\n\nMật khẩu của các tài khoản này sẽ được đặt lại về "123".`
      )
    ) {
      return;
    }

    let apiSuccess = false;
    try {
      const res = await fetch('/api/reset-password/approve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUser: currentUser?.idUser,
          userRole: currentUser?.role || (isAdmin ? 'ADMIN' : 'TEACHER'),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(data.message || `Đã phê duyệt tất cả ${pendingResets.length} yêu cầu reset mật khẩu!`);
          if (Array.isArray(data.items)) {
            setResetRequests(data.items);
            saveAllStoredResetPasswordRequests(data.items);
          }
          window.dispatchEvent(new Event('reset-requests-updated'));
          fetchAccounts();
          if (onRefreshData) onRefreshData();
          apiSuccess = true;
        }
      }
    } catch (err) {
      console.warn('API reset-password approve-all failed, processing locally.');
    }

    if (!apiSuccess) {
      const allReqs = getStoredResetPasswordRequests();
      const updatedReqs = allReqs.map((r) => {
        if (r.status === 'PENDING' && (isAdmin || r.role === 'STUDENT')) {
          resetStoredPassword(r.idUser);
          return { ...r, status: 'APPROVED' as const, processedAt: new Date().toISOString() };
        }
        return r;
      });

      saveAllStoredResetPasswordRequests(updatedReqs);
      setResetRequests(updatedReqs);
      window.dispatchEvent(new Event('reset-requests-updated'));
      fetchAccounts();
      if (onRefreshData) onRefreshData();
      alert(`Đã phê duyệt tất cả ${pendingResets.length} yêu cầu reset mật khẩu về "123"!`);
    }
  };

  // Reject all reset password requests
  const handleRejectAllResets = async () => {
    const pendingResets = resetRequests.filter(
      (r) => r.status === 'PENDING' && (isAdmin || r.role === 'STUDENT')
    );
    if (pendingResets.length === 0) {
      alert('Hiện không có yêu cầu đặt lại mật khẩu nào đang chờ từ chối.');
      return;
    }

    if (
      !confirm(
        `XÁC NHẬN TỪ CHỐI TẤT CẢ ${pendingResets.length} yêu cầu đặt lại mật khẩu đang chờ?`
      )
    ) {
      return;
    }

    let apiSuccess = false;
    try {
      const res = await fetch('/api/reset-password/reject-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userRole: currentUser?.role || (isAdmin ? 'ADMIN' : 'TEACHER'),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(data.message || `Đã từ chối tất cả ${pendingResets.length} yêu cầu reset mật khẩu.`);
          if (Array.isArray(data.items)) {
            setResetRequests(data.items);
            saveAllStoredResetPasswordRequests(data.items);
          }
          window.dispatchEvent(new Event('reset-requests-updated'));
          apiSuccess = true;
        }
      }
    } catch (err) {
      console.warn('API reset-password reject-all failed, processing locally.');
    }

    if (!apiSuccess) {
      const allReqs = getStoredResetPasswordRequests();
      const updatedReqs = allReqs.map((r) => {
        if (r.status === 'PENDING' && (isAdmin || r.role === 'STUDENT')) {
          return { ...r, status: 'REJECTED' as const, processedAt: new Date().toISOString() };
        }
        return r;
      });

      saveAllStoredResetPasswordRequests(updatedReqs);
      setResetRequests(updatedReqs);
      window.dispatchEvent(new Event('reset-requests-updated'));
      alert(`Đã từ chối tất cả ${pendingResets.length} yêu cầu reset mật khẩu.`);
    }
  };

  // Fetch accounts from backend
  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    let apiSuccess = false;
    try {
      const getRes = await fetch('/api/accounts');
      if (getRes.ok) {
        const data = await getRes.json();
        if (data.success) {
          if (data.admin) {
            setAdminAccount(data.admin);
          }
          const apiTeachers: AccountItem[] = (data.teachers || []).map((t: any) => ({ ...t, role: 'TEACHER' }));
          const apiStudents: AccountItem[] = (data.students || []).map((s: any) => ({ ...s, role: 'STUDENT' }));

          setTeachers(apiTeachers as any);
          setStudents(apiStudents as any);
          saveStoredAccounts(apiTeachers, apiStudents);

          if (Array.isArray(data.pendingRegistrations)) {
            setPendingList(data.pendingRegistrations);
            saveAllStoredPendingRegistrations(data.pendingRegistrations);
          }
          apiSuccess = true;
        }
      }
    } catch (err) {
      console.warn('Backend accounts fetch failed:', err);
    }

    if (!apiSuccess) {
      const stored = getStoredAccounts();
      setTeachers(stored.teachers as any);
      setStudents(stored.students as any);
    }
    setLoadingAccounts(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      fetchPendingRegistrations();
      fetchResetRequests();
      fetchSheetsConfig();
      if (!isAdmin) {
        setActiveTab('STUDENT');
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  // Check duplicates in parsedRows against DB and internal list
  const runDuplicateCheck = (rows: AccountRow[]) => {
    const existingIds = new Map<string, string>();
    existingIds.set('admin.c3nguyenquangdieu', 'Tài khoản Quản trị viên hệ thống (Admin)');

    teachers.forEach((t) => {
      existingIds.set(
        t.idUser.toLowerCase(),
        `Giáo viên ${t.hoTen} - Tổ ${t.chiDoan || 'Chuyên môn'}`
      );
    });

    students.forEach((s) => {
      existingIds.set(
        s.idUser.toLowerCase(),
        `Học sinh ${s.hoTen} - Lớp ${s.chiDoan || 'Lớp'}`
      );
    });

    const warnings: string[] = [];
    const seenInBatch = new Map<string, number>();

    const updatedRows = rows.map((row, idx) => {
      const cleanId = String(row.idUser || '').trim().toLowerCase();
      const hoTen = String(row.hoTen || '').trim();
      const chiDoan = String(row.chiDoan || '').trim();

      if (!cleanId) {
        const warnMsg = `Dòng ${idx + 1}: Tên tài khoản không được để trống!`;
        warnings.push(warnMsg);
        return { ...row, isDuplicate: true, duplicateReason: warnMsg };
      }

      // Check collision with DB
      if (existingIds.has(cleanId)) {
        const entityLabel = activeTab === 'TEACHER' ? 'Giáo viên' : 'Học sinh';
        const orgLabel = activeTab === 'TEACHER' ? (chiDoan ? `Tổ ${chiDoan}` : 'Tổ chuyên môn') : (chiDoan ? `Lớp ${chiDoan}` : 'Lớp');
        const warnMsg = `${entityLabel} ${hoTen} - ${orgLabel} đang bị trùng tài khoản "${row.idUser}"`;
        warnings.push(warnMsg);
        return { ...row, isDuplicate: true, duplicateReason: warnMsg };
      }

      // Check collision within batch
      if (seenInBatch.has(cleanId)) {
        const firstIdx = seenInBatch.get(cleanId)!;
        const entityLabel = activeTab === 'TEACHER' ? 'Giáo viên' : 'Học sinh';
        const orgLabel = activeTab === 'TEACHER' ? (chiDoan ? `Tổ ${chiDoan}` : 'Tổ chuyên môn') : (chiDoan ? `Lớp ${chiDoan}` : 'Lớp');
        const warnMsg = `${entityLabel} ${hoTen} - ${orgLabel} đang bị trùng tài khoản "${row.idUser}" xuất hiện nhiều lần (dòng ${firstIdx + 1} và dòng ${idx + 1})`;
        warnings.push(warnMsg);
        return { ...row, isDuplicate: true, duplicateReason: warnMsg };
      }

      seenInBatch.set(cleanId, idx);
      return { ...row, isDuplicate: false, duplicateReason: undefined };
    });

    setParsedRows(updatedRows);
    setDuplicateWarnings(warnings);
  };

  // Handle Excel/CSV File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawJson || rawJson.length <= 1) {
          alert('File Excel không chứa dữ liệu hoặc sai định dạng!');
          return;
        }

        // Parse rows (ignoring header row 0)
        const rows: AccountRow[] = [];
        for (let i = 1; i < rawJson.length; i++) {
          const rowData = rawJson[i];
          if (!rowData || rowData.length === 0) continue;

          // Cột 1: STT, Cột 2: Họ và tên, Cột 3: Tổ chuyên môn / Lớp, Cột 4: Tên tài khoản
          const stt = rowData[0] !== undefined ? String(rowData[0]).trim() : i;
          const hoTen = rowData[1] !== undefined ? String(rowData[1]).trim() : '';
          const chiDoan = rowData[2] !== undefined ? String(rowData[2]).trim() : '';
          const idUser = rowData[3] !== undefined ? String(rowData[3]).trim() : '';

          if (hoTen || idUser) {
            rows.push({
              stt,
              hoTen,
              chiDoan,
              idUser,
            });
          }
        }

        if (rows.length === 0) {
          alert('Không tìm thấy danh sách tài khoản hợp lệ trong file!');
          return;
        }

        runDuplicateCheck(rows);
        setMode('IMPORT');
      } catch (err) {
        console.error('Lỗi đọc file Excel:', err);
        alert('Lỗi khi đọc file Excel/CSV! Vui lòng kiểm tra lại định dạng file.');
      }
    };
    reader.readAsBinaryString(file);

    // reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const isTeacherTab = activeTab === 'TEACHER';
    const filename = isTeacherTab
      ? 'Mau_Danh_Sach_Giao_Vien.xlsx'
      : 'Mau_Danh_Sach_Hoc_Sinh.xlsx';

    const sheetName = isTeacherTab ? 'GiaoVien' : 'HocSinh';

    const headers = isTeacherTab
      ? [
          ['STT', 'Họ và tên', 'Tổ chuyên môn', 'Tên tài khoản'],
          [1, 'Nguyễn Phúc Nguyên', 'Tổ Tin học - Toán', 'gv.nguyenphucnguyen'],
          [2, 'Trần Thị B', 'Tổ Ngữ Văn', 'gv.tranthib'],
          [3, 'Lê Văn C', 'Tổ Vật Lý', 'gv.levanc'],
        ]
      : [
          ['STT', 'Họ và tên', 'Lớp', 'Tên tài khoản'],
          [1, 'Nguyễn Văn A', '12A1', 'hs.nguyenvana'],
          [2, 'Trần Thị C', '12A2', 'hs.tranthic'],
          [3, 'Lê Văn D', '12A3', 'hs.levand'],
        ];

    const ws = XLSX.utils.aoa_to_sheet(headers);
    // Set column widths
    ws['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 20 }, { wch: 25 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  // Add empty manual row in import mode
  const handleAddManualRow = () => {
    const newRow: AccountRow = {
      stt: parsedRows.length + 1,
      hoTen: '',
      chiDoan: activeTab === 'TEACHER' ? 'Tổ Toán' : '12A1',
      idUser: activeTab === 'TEACHER' ? `gv.moi${parsedRows.length + 1}` : `hs.moi${parsedRows.length + 1}`,
    };
    const updated = [...parsedRows, newRow];
    runDuplicateCheck(updated);
  };

  // Handle cell edit in parsedRows table
  const handleRowChange = (index: number, field: keyof AccountRow, value: string) => {
    const updated = [...parsedRows];
    updated[index] = { ...updated[index], [field]: value };
    runDuplicateCheck(updated);
  };

  // Delete row from batch list
  const handleDeleteBatchRow = (index: number) => {
    const updated = parsedRows.filter((_, i) => i !== index);
    runDuplicateCheck(updated);
  };

  // Helper for client-side batch creation
  const handleClientSideBatchCreate = () => {
    const stored = getStoredAccounts();
    const isTeacherTab = activeTab === 'TEACHER';
    const targetList = isTeacherTab ? [...stored.teachers] : [...stored.students];

    let createdCount = 0;
    let updatedCount = 0;

    parsedRows.forEach((row) => {
      const cleanId = (row.idUser || '').trim();
      const cleanName = (row.hoTen || '').trim();
      const cleanOrg = (row.chiDoan || '').trim();

      const existingIdx = targetList.findIndex(
        (a) => a.idUser.toLowerCase() === cleanId.toLowerCase()
      );

      if (existingIdx >= 0) {
        if (overwriteDuplicates) {
          targetList[existingIdx] = {
            idUser: cleanId,
            hoTen: cleanName,
            chiDoan: cleanOrg,
            defaultPass: '123',
            role: isTeacherTab ? 'TEACHER' : 'STUDENT',
          };
          updatedCount++;
        }
      } else {
        targetList.push({
          idUser: cleanId,
          hoTen: cleanName,
          chiDoan: cleanOrg,
          defaultPass: '123',
          role: isTeacherTab ? 'TEACHER' : 'STUDENT',
        });
        createdCount++;
      }
    });

    const newTeachers = isTeacherTab ? targetList : stored.teachers;
    const newStudents = !isTeacherTab ? targetList : stored.students;

    saveStoredAccounts(newTeachers, newStudents);
    setTeachers(newTeachers as any);
    setStudents(newStudents as any);

    // Sync directly to backend server files (acgv.json, achs.json)
    fetch('/api/accounts/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teachers: newTeachers,
        students: newStudents,
        overwrite: true,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          notifySyncStatus('warning', 'Đồng bộ tài khoản chưa hoàn tất', 'Lưu tài khoản nhập từ Excel lên máy chủ thất bại. Dữ liệu đã lưu tạm thời trên thiết bị.');
        }
      })
      .catch(() => {
        notifySyncStatus('warning', 'Đồng bộ tài khoản chưa hoàn tất', 'Không thể kết nối máy chủ để lưu danh sách tài khoản nhập từ Excel.');
      })
      .finally(() => fetchAccounts());

    const msg = `Thành công: Đã tạo mới ${createdCount} tài khoản, cập nhật ${updatedCount} tài khoản. Dữ liệu đã được lưu trữ an toàn!`;
    alert(msg);
    setParsedRows([]);
    setDuplicateWarnings([]);
    setMode('LIST');
    if (onRefreshData) onRefreshData();
  };

  // Submit Batch Creation to Backend or Local Storage
  const handleSubmitBatch = async () => {
    if (parsedRows.length === 0) {
      alert('Danh sách tài khoản trống!');
      return;
    }

    const invalidRows = parsedRows.filter((r) => !(r.hoTen || '').trim() || !(r.idUser || '').trim());
    if (invalidRows.length > 0) {
      alert('Vui lòng điền đầy đủ Họ và tên và Tên tài khoản cho tất cả các dòng!');
      return;
    }

    setSubmitting(true);
    let apiHandled = false;

    try {
      const res = await fetch('/api/accounts/create-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userObj: currentUser,
          accountType: activeTab,
          items: parsedRows,
          overwriteDuplicates,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.teachers) && Array.isArray(data.students)) {
            const apiTeachers: AccountItem[] = data.teachers.map((t: any) => ({ ...t, role: 'TEACHER' }));
            const apiStudents: AccountItem[] = data.students.map((s: any) => ({ ...s, role: 'STUDENT' }));
            setTeachers(apiTeachers as any);
            setStudents(apiStudents as any);
            saveStoredAccounts(apiTeachers, apiStudents);
          }
          alert(data.message);
          setParsedRows([]);
          setDuplicateWarnings([]);
          setMode('LIST');
          fetchAccounts();
          if (onRefreshData) onRefreshData();
          apiHandled = true;
        } else {
          alert(data.message || 'Có lỗi xảy ra khi tạo tài khoản!');
          apiHandled = true;
        }
      }
    } catch (err) {
      console.warn('Backend API create-batch unavailable, performing local storage batch creation.');
    } finally {
      setSubmitting(false);
    }

    if (!apiHandled) {
      handleClientSideBatchCreate();
    }
  };

  // Delete an existing account from DB or Local Storage
  const handleDeleteExistingAccount = async (idUser: string) => {
    const cleanId = String(idUser || '').trim().toLowerCase();
    if (cleanId === 'admin.c3nguyenquangdieu' || cleanId === 'admin' || activeTab === 'ADMIN') {
      alert('Tài khoản Quản trị viên (Admin) được bảo vệ vĩnh viễn và không thể bị xóa!');
      return;
    }

    const entityLabel = activeTab === 'TEACHER' ? 'Giáo viên' : 'Học sinh';
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản ${entityLabel} "${idUser}" không?`)) {
      return;
    }

    let apiHandled = false;
    try {
      const res = await fetch(`/api/accounts/${activeTab}/${encodeURIComponent(idUser)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userObj: currentUser }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(data.message);
          fetchAccounts();
          if (onRefreshData) onRefreshData();
          apiHandled = true;
        } else {
          alert(data.message || 'Xóa tài khoản thất bại!');
          apiHandled = true;
        }
      }
    } catch (err) {
      console.warn('Backend API delete account unavailable, deleting from local storage.');
    }

    if (!apiHandled) {
      const stored = getStoredAccounts();
      const isTeacherTab = activeTab === 'TEACHER';
      const cleanId = idUser.toLowerCase();

      const newTeachers = isTeacherTab
        ? stored.teachers.filter((t) => t.idUser.toLowerCase() !== cleanId)
        : stored.teachers;
      const newStudents = !isTeacherTab
        ? stored.students.filter((s) => s.idUser.toLowerCase() !== cleanId)
        : stored.students;

      saveStoredAccounts(newTeachers, newStudents);
      setTeachers(newTeachers as any);
      setStudents(newStudents as any);
      fetch('/api/accounts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teachers: newTeachers,
          students: newStudents,
          overwrite: true,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            notifySyncStatus('warning', 'Đồng bộ tài khoản chưa hoàn tất', `Xóa tài khoản "${idUser}" lên máy chủ thất bại. Đã xóa tạm thời trên thiết bị này.`);
          }
        })
        .catch(() => {
          notifySyncStatus('warning', 'Đồng bộ tài khoản chưa hoàn tất', `Không thể kết nối máy chủ để xóa tài khoản "${idUser}".`);
        })
        .finally(() => fetchAccounts());
      alert(`Đã xóa tài khoản ${entityLabel} "${idUser}" thành công!`);
      if (onRefreshData) onRefreshData();
    }
  };

  // Delete all accounts of current active tab
  const handleDeleteAllAccounts = async () => {
    const isTeacherTab = activeTab === 'TEACHER';
    const entityLabel = isTeacherTab ? 'Giáo viên' : 'Học sinh';
    const currentList = isTeacherTab ? teachers : students;

    if (!currentList || currentList.length === 0) {
      alert(`Hiện không có tài khoản ${entityLabel} nào để xóa.`);
      return;
    }

    if (
      !confirm(
        `CẢNH BÁO NGUY HIỂM: Bạn có chắc chắn muốn XÓA TẤT CẢ ${currentList.length} tài khoản ${entityLabel} không?\n\nThao tác này sẽ xóa vĩnh viễn toàn bộ tài khoản ${entityLabel} và không thể hoàn tác!`
      )
    ) {
      return;
    }

    let apiHandled = false;
    try {
      const res = await fetch(`/api/accounts/delete-all`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountType: activeTab,
          userObj: currentUser,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(data.message || `Đã xóa tất cả tài khoản ${entityLabel}!`);
          fetchAccounts();
          if (onRefreshData) onRefreshData();
          apiHandled = true;
        } else {
          alert(data.message || 'Xóa tất cả tài khoản thất bại!');
          apiHandled = true;
        }
      }
    } catch (err) {
      console.warn('Backend API delete-all unavailable, updating local storage.');
    }

    if (!apiHandled) {
      const stored = getStoredAccounts();
      const newTeachers = isTeacherTab ? [] : stored.teachers;
      const newStudents = !isTeacherTab ? [] : stored.students;

      saveStoredAccounts(newTeachers, newStudents);
      if (isTeacherTab) {
        setTeachers([]);
      } else {
        setStudents([]);
      }

      fetch('/api/accounts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teachers: newTeachers,
          students: newStudents,
          overwrite: true,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            notifySyncStatus('warning', 'Đồng bộ tài khoản chưa hoàn tất', `Xóa tất cả tài khoản ${entityLabel} lên máy chủ chưa xong. Đã xóa trên thiết bị này.`);
          }
        })
        .catch(() => {
          notifySyncStatus('warning', 'Đồng bộ tài khoản chưa hoàn tất', `Không thể kết nối máy chủ để xóa tất cả tài khoản ${entityLabel}.`);
        })
        .finally(() => fetchAccounts());

      alert(`Đã xóa tất cả tài khoản ${entityLabel} thành công!`);
      if (onRefreshData) onRefreshData();
    }
  };

  // Reset password to default 123
  const handleResetPassword = async (idUser: string, hoTen: string) => {
    if (
      !confirm(
        `Bạn có chắc chắn muốn ĐẶT LẠI MẬT KHẨU cho tài khoản "${hoTen}" (${idUser}) về mật khẩu mặc định "123" không?`
      )
    ) {
      return;
    }

    let apiSuccess = false;
    try {
      const res = await fetch('/api/accounts/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUser }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          alert(data.message || `Đã đặt lại mật khẩu cho tài khoản "${idUser}" về "123" thành công!`);
          apiSuccess = true;
        }
      }
    } catch (err) {
      console.warn('Backend API reset-password unavailable, resetting locally.');
    }

    resetStoredPassword(idUser);

    if (!apiSuccess) {
      alert(`Đã đặt lại mật khẩu cho tài khoản "${idUser}" về mặc định "123" thành công!`);
    }

    window.dispatchEvent(new Event('reset-requests-updated'));
    fetchAccounts();
    if (onRefreshData) onRefreshData();
  };

  // Filter current active account list
  const currentAccountList = activeTab === 'TEACHER' ? teachers : students;
  const filteredAccounts = currentAccountList.filter((acc) => {
    const q = searchQuery.trim().toLowerCase();
    return (
      acc.idUser.toLowerCase().includes(q) ||
      acc.hoTen.toLowerCase().includes(q) ||
      acc.chiDoan.toLowerCase().includes(q)
    );
  });

  if (!isOpen && !isInline) return null;

  const modalInner = (
    <>
      <div className={`bg-white ${isInline ? 'w-full rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden' : 'rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[min(90vh,560px)] max-h-[92vh] overflow-hidden'} flex flex-col`}>
      {/* Header Modal */}
      <div className={`px-4 sm:px-5 py-2.5 bg-slate-900 text-white flex items-center justify-between shrink-0 ${isInline ? 'hidden' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-xl text-white shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-base sm:text-lg text-white">
              {isAdmin ? 'TẠO & CẤP TÀI KHOẢN' : 'QUẢN LÝ & RESET MẬT KHẨU'}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-1">
              {isAdmin
                ? 'Cấp tài khoản Giáo viên và Học sinh theo file Excel hoặc nhập trực tiếp'
                : 'Giáo viên chỉ được phép Đặt lại mật khẩu (Reset Password) về mặc định 123 cho Học sinh'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Đóng (Về tổng quan)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

        {/* Role & Tab Switcher Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
          {/* Account Role Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => {
                  setActiveTab('APPROVAL');
                  setMode('LIST');
                }}
                className={`relative px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'APPROVAL'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Duyệt yêu cầu Đăng ký</span>
                {pendingList.filter((p) => p.status === 'PENDING').length > 0 && (
                  <span className="relative inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 bg-rose-600 text-white text-[10px] font-black rounded-full shadow-xs animate-pulse border border-white">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative z-10">{pendingList.filter((p) => p.status === 'PENDING').length}</span>
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => {
                setActiveTab('RESET_REQUESTS');
                setMode('LIST');
              }}
              className={`relative px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'RESET_REQUESTS'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>
                {isAdmin
                  ? 'Duyệt quên mật khẩu'
                  : 'Duyệt quên mật khẩu Học sinh'}
              </span>
              {resetRequests.filter((r) => r.status === 'PENDING' && (isAdmin || r.role === 'STUDENT')).length > 0 && (
                <span className="relative inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 bg-rose-600 text-white text-[10px] font-black rounded-full shadow-xs animate-pulse border border-white">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative z-10">{resetRequests.filter((r) => r.status === 'PENDING' && (isAdmin || r.role === 'STUDENT')).length}</span>
                </span>
              )}
            </button>

            {/* Tab Tài khoản Quản trị (Admin) đã được ẩn theo yêu cầu */}

            {isAdmin && (
              <button
                onClick={() => {
                  setActiveTab('TEACHER');
                  setMode('LIST');
                  setParsedRows([]);
                  setDuplicateWarnings([]);
                }}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'TEACHER'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                Tài khoản Giáo viên ({teachers.length})
              </button>
            )}

            <button
              onClick={() => {
                setActiveTab('STUDENT');
                setMode('LIST');
                setParsedRows([]);
                setDuplicateWarnings([]);
              }}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'STUDENT'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Tài khoản Học sinh ({students.length})
            </button>
          </div>

          {/* Action Buttons: ONLY FOR ADMIN on TEACHER or STUDENT tabs */}
          {isAdmin && activeTab !== 'APPROVAL' && activeTab !== 'RESET_REQUESTS' && activeTab !== 'ADMIN' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                title="Tải file Excel mẫu chuẩn hệ thống"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                Tải file Excel mẫu
              </button>

              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx, .xls, .csv"
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Tải lên file Excel
              </button>

              <button
                onClick={() => {
                  setSingleCreateData({
                    hoTen: '',
                    chiDoan: activeTab === 'TEACHER' ? 'Tổ Toán' : '12A1',
                    idUser: '',
                    defaultPass: '123',
                  });
                  setIsSingleCreateOpen(true);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title={`Thêm 1 tài khoản ${activeTab === 'TEACHER' ? 'Giáo viên' : 'Học sinh'} đơn lẻ`}
              >
                <Plus className="w-4 h-4" />
                Thêm 1 tài khoản
              </button>

              {mode === 'LIST' ? (
                <>
                  <button
                    onClick={() => {
                      setParsedRows([
                        {
                          stt: 1,
                          hoTen: '',
                          chiDoan: activeTab === 'TEACHER' ? 'Tổ Toán' : '12A1',
                          idUser: activeTab === 'TEACHER' ? 'gv.moi1' : 'hs.moi1',
                        },
                      ]);
                      setMode('IMPORT');
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 border border-slate-300 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-slate-600" />
                    Nhập danh sách
                  </button>

                  <button
                    onClick={handleDeleteAllAccounts}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                    title={`Xóa tất cả tài khoản ${activeTab === 'TEACHER' ? 'Giáo viên' : 'Học sinh'}`}
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                    Xóa tất cả
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMode('LIST');
                    setParsedRows([]);
                    setDuplicateWarnings([]);
                  }}
                  className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all"
                >
                  Quay lại danh sách
                </button>
              )}

              {/* Google Sheets Sync is automated in real-time */}
            </div>
          )}
        </div>

        {/* Info Banner on Default Passwords & Auto-Sync Status */}
        <div className="px-6 py-2.5 bg-gradient-to-r from-amber-50 to-emerald-50/60 border-b border-slate-200 text-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-600 shrink-0" />
            {isAdmin ? (
              <span>
                Mật khẩu mặc định: <strong className="text-rose-700 underline font-mono text-sm">123</strong>.
              </span>
            ) : (
              <span>
                Giáo viên chọn tài khoản Học sinh bên dưới để đặt lại mật khẩu về mặc định (<strong className="text-rose-700 font-mono">123</strong>).
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Auto Syn (Bật)
            </span>
          </div>
        </div>

        {/* Modal Main Body Content */}
        <div className={`p-6 space-y-6 ${isInline ? 'h-auto overflow-visible' : 'flex-1 overflow-y-auto'}`}>
          {mode === 'IMPORT' ? (
            /* BATCH IMPORT & DUPLICATE PREVIEW VIEW */
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                    Xem trước dữ liệu cấp tài khoản ({parsedRows.length} dòng)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kiểm tra thông tin chi tiết trước khi cập nhật vào cơ sở dữ liệu hệ thống.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddManualRow}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 border border-slate-300"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm dòng
                  </button>
                </div>
              </div>

              {/* Duplicate Warnings Callout Box */}
              {duplicateWarnings.length > 0 && (
                <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl space-y-2.5 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between text-rose-800 font-extrabold text-sm">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 animate-bounce" />
                      <span>
                        CẢNH BÁO: PHÁT HIỆN {duplicateWarnings.length} TÀI KHOẢN BỊ TRÙNG LẶP!
                      </span>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 bg-white px-3 py-1 rounded-lg border border-rose-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={overwriteDuplicates}
                        onChange={(e) => setOverwriteDuplicates(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span>Cập nhật / Ghi đè mật khẩu tài khoản trùng</span>
                    </label>
                  </div>

                  <p className="text-xs text-rose-700 font-medium">
                    {overwriteDuplicates
                      ? 'Lưu ý: Các tài khoản bị trùng sẽ được cập nhật lại Họ tên, Tổ/Lớp và đặt lại mật khẩu mặc định 123.'
                      : 'Hệ thống sẽ tự động bỏ qua các tài khoản bị trùng khi bấm "Xác nhận tạo tài khoản".'}
                  </p>

                  <div className="max-h-36 overflow-y-auto space-y-1 pr-2">
                    {duplicateWarnings.map((warn, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-rose-800 bg-white/80 p-2 rounded-lg border border-rose-200 font-semibold flex items-start gap-2"
                      >
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>{warn}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-3 w-12 text-center">STT</th>
                        <th className="px-4 py-3">Họ và tên</th>
                        <th className="px-4 py-3">
                          {activeTab === 'TEACHER' ? 'Tổ chuyên môn' : 'Lớp'}
                        </th>
                        <th className="px-4 py-3">Tên tài khoản (ID)</th>
                        <th className="px-4 py-3">Trạng thái</th>
                        <th className="px-3 py-3 w-12 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {parsedRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            row.isDuplicate
                              ? 'bg-rose-50/80 hover:bg-rose-100/80'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-3 py-2 text-center text-slate-500 font-bold">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={row.hoTen}
                              onChange={(e) => handleRowChange(idx, 'hoTen', e.target.value)}
                              placeholder="Nhập Họ và tên..."
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={row.chiDoan}
                              onChange={(e) => handleRowChange(idx, 'chiDoan', e.target.value)}
                              placeholder={activeTab === 'TEACHER' ? 'VD: Tổ Toán' : 'VD: 12A1'}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={row.idUser}
                              onChange={(e) => handleRowChange(idx, 'idUser', e.target.value)}
                              placeholder="VD: gv.nguyenvana hoặc hs.nguyenvana"
                              className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white ${
                                row.isDuplicate
                                  ? 'border-rose-400 text-rose-900 bg-rose-50'
                                  : 'border-slate-300 text-slate-900'
                              }`}
                            />
                          </td>
                          <td className="px-4 py-2">
                            {row.isDuplicate ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                {overwriteDuplicates ? 'Ghi đè trùng' : 'Trùng - Bỏ qua'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                Hợp lệ
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => handleDeleteBatchRow(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                              title="Xóa dòng này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setMode('LIST');
                    setParsedRows([]);
                    setDuplicateWarnings([]);
                  }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors border border-slate-300"
                >
                  Hủy bỏ
                </button>

                <button
                  onClick={handleSubmitBatch}
                  disabled={submitting || parsedRows.length === 0}
                  className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Đang xử lý tạo tài khoản...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Xác nhận tạo {parsedRows.length} tài khoản
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : activeTab === 'ADMIN' ? (
            /* ADMIN ACCOUNT DEDICATED VIEW */
            <div className="space-y-6">
              {/* Google Sheets Sync & Protection Banner */}
              <div className="p-4 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-extrabold text-slate-900 text-sm">
                        Tài khoản Quản trị viên (Admin) — Lưu trữ trên Google Sheet
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300">
                        Tab: QT_TàiKhoản
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Bảo vệ tuyệt đối
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                      Thông tin tài khoản Admin được tự động đồng bộ lên Google Sheet tại tab <strong>QT_TàiKhoản</strong>. Mọi thao tác xóa tài khoản Giáo viên hoặc Học sinh (xóa đơn lẻ hay xóa tất cả) sẽ <strong>chỉ tác động đến giáo viên và học sinh</strong>, hoàn toàn không xóa hay thay đổi tài khoản Admin trên Google Sheet.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/sheets-sync/trigger', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ triggerReason: 'Đồng bộ tài khoản Admin thủ công' }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          alert('Đã đồng bộ thông tin tài khoản Quản trị viên (Admin) lên Google Sheet tab "QT_TàiKhoản" thành công!');
                        } else {
                          alert(data.message || 'Đồng bộ thất bại, vui lòng kiểm tra kết nối Google Sheets.');
                        }
                      } catch (e) {
                        alert('Lỗi kết nối khi đồng bộ Google Sheet.');
                      }
                    }}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Đồng bộ ngay
                  </button>
                  {sheetsConfig?.spreadsheetUrl && (
                    <a
                      href={sheetsConfig.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Mở Google Sheet
                    </a>
                  )}
                </div>
              </div>

              {/* Admin Profile Detail Card */}
              <div className="border border-slate-200 rounded-2xl p-6 bg-white shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full aspect-square bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md overflow-hidden ring-2 ring-purple-300">
                      {adminAccount?.avatar ? (
                        <img
                          src={adminAccount.avatar}
                          alt="Admin Avatar"
                          className="w-full h-full object-cover rounded-full aspect-square"
                        />
                      ) : (
                        'AD'
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-slate-900 text-base">
                          {adminAccount?.hoTen || 'Administrator (Quản trị viên hệ thống)'}
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800">
                          ADMIN CẤP CAO
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Tên đăng nhập (ID): <strong className="text-purple-700 font-bold">{adminAccount?.idUser || 'admin.c3nguyenquangdieu'}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Đã đồng bộ Google Sheet [QT_TàiKhoản]
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Mã tài khoản (ID)
                    </span>
                    <span className="font-mono font-bold text-sm text-blue-900">
                      {adminAccount?.idUser || 'admin.c3nguyenquangdieu'}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Đơn vị / Chức vụ
                    </span>
                    <span className="font-bold text-sm text-slate-800">
                      {adminAccount?.chiDoan || 'Ban Giám Hiệu / Quản trị viên'}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Mật khẩu mặc định
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-700">
                      {adminAccount?.defaultPass || '19310326'}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Trạng thái bảo vệ
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      Không thể xóa
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-amber-50/80 border border-amber-200/90 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Chính sách bảo toàn tài khoản Quản trị:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-amber-800 text-[11px] pl-1">
                    <li>Dữ liệu tài khoản Admin luôn được lưu ở tab <strong>QT_TàiKhoản</strong> trên Google Sheet khi bật đồng bộ.</li>
                    <li>Các chức năng: "Xóa tài khoản", "Xóa tất cả tài khoản Giáo viên", "Xóa tất cả tài khoản Học sinh", hoặc "Dọn dẹp hệ thống" sẽ <strong>chỉ xóa học sinh/giáo viên</strong> và <strong>không bao giờ xóa thông tin tài khoản Admin</strong>.</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : activeTab === 'APPROVAL' ? (
            /* PENDING APPROVAL LIST VIEW */
            (() => {
              const regCountAll = pendingList.length;
              const regCountTeacher = pendingList.filter((p) => p.role === 'TEACHER').length;
              const regCountStudent = pendingList.filter((p) => p.role === 'STUDENT').length;

              const filteredPendingList = pendingList
                .filter((item) => {
                  if (regRoleFilter === 'TEACHER') return item.role === 'TEACHER';
                  if (regRoleFilter === 'STUDENT') return item.role === 'STUDENT';
                  return true;
                })
                .filter((item) => {
                  const q = searchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    item.idUser.toLowerCase().includes(q) ||
                    item.hoTen.toLowerCase().includes(q) ||
                    item.email.toLowerCase().includes(q) ||
                    item.chiDoan.toLowerCase().includes(q)
                  );
                });

              return (
                <div className="space-y-5">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                      <div className="relative w-full sm:w-72">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Tìm theo Tên, Gmail, Tài khoản..."
                          className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                        />
                      </div>

                      {/* Filter by Role: Tất cả / Giáo viên / Học sinh */}
                      <div className="inline-flex items-center p-1 bg-slate-100/90 border border-slate-200/80 rounded-2xl">
                        <button
                          type="button"
                          onClick={() => setRegRoleFilter('ALL')}
                          className={`px-3.5 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                            regRoleFilter === 'ALL'
                              ? 'bg-white text-blue-900 font-extrabold shadow-xs'
                              : 'text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/50'
                          }`}
                        >
                          Tất cả ({regCountAll})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegRoleFilter('TEACHER')}
                          className={`px-3.5 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                            regRoleFilter === 'TEACHER'
                              ? 'bg-white text-blue-900 font-extrabold shadow-xs'
                              : 'text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/50'
                          }`}
                        >
                          Giáo viên ({regCountTeacher})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegRoleFilter('STUDENT')}
                          className={`px-3.5 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                            regRoleFilter === 'STUDENT'
                              ? 'bg-white text-blue-900 font-extrabold shadow-xs'
                              : 'text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/50'
                          }`}
                        >
                          Học sinh ({regCountStudent})
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleApproveAllRegistrations}
                          disabled={pendingList.filter((p) => p.status === 'PENDING').length === 0}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                          title="Phê duyệt tất cả các yêu cầu đăng ký đang chờ"
                        >
                          <Check className="w-4 h-4" />
                          All
                        </button>
                        <button
                          onClick={handleRejectAllRegistrations}
                          disabled={pendingList.filter((p) => p.status === 'PENDING').length === 0}
                          className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed text-rose-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 border border-rose-200 cursor-pointer"
                          title="Từ chối tất cả các yêu cầu đăng ký đang chờ"
                        >
                          <XCircle className="w-4 h-4 text-rose-600" />
                          All
                        </button>
                      </div>

                      <div className="text-xs text-slate-500 font-semibold flex items-center gap-2">
                        <span>
                          Chờ duyệt:{' '}
                          <strong className="text-amber-700 font-extrabold text-sm">
                            {pendingList.filter((p) => p.status === 'PENDING').length}
                          </strong>{' '}
                          yêu cầu
                        </span>
                        <button
                          onClick={fetchPendingRegistrations}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Tải lại danh sách yêu cầu"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {pendingList.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
                      <Inbox className="w-12 h-12 text-slate-300 mx-auto" />
                      <p className="font-bold text-slate-700 text-sm">
                        Chưa có yêu cầu đăng ký nào đang chờ duyệt.
                      </p>
                      <p className="text-xs text-slate-400">
                        Khi người dùng mới bấm "Đăng Ký Tài Khoản", thông tin và địa chỉ Gmail của họ sẽ hiển thị tại đây để Admin duyệt.
                      </p>
                    </div>
                  ) : filteredPendingList.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                      <Search className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="font-bold text-slate-700 text-xs">
                        Không tìm thấy yêu cầu đăng ký nào phù hợp với bộ lọc.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                      <div className="overflow-x-auto max-h-[460px]">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-3 w-10 text-center">STT</th>
                              <th className="px-4 py-3">Họ và tên</th>
                              <th className="px-4 py-3">Địa chỉ Gmail</th>
                              <th className="px-4 py-3">Tài khoản (ID)</th>
                              <th className="px-4 py-3">Vai trò & Đơn vị</th>
                              <th className="px-4 py-3">Trạng thái</th>
                              <th className="px-4 py-3 text-center">Thao tác Admin</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 font-medium">
                            {filteredPendingList.map((item, idx) => (
                              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-3 text-center text-slate-400 font-bold">
                                  {idx + 1}
                                </td>
                                <td className="px-4 py-3 font-bold text-slate-900">{item.hoTen}</td>
                                <td className="px-4 py-3 text-slate-700 font-mono text-xs">
                                  <div className="flex items-center gap-1.5 text-blue-800">
                                    <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    <span>{item.email}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono font-bold text-slate-900">
                                  {item.idUser}
                                </td>
                                <td className="px-4 py-3 text-slate-700">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mr-1.5 ${
                                    item.role === 'TEACHER' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {item.role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'}
                                  </span>
                                  <span className="font-semibold text-slate-600">{item.chiDoan}</span>
                                </td>
                                <td className="px-4 py-3">
                                  {item.status === 'PENDING' ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                      Chờ duyệt
                                    </span>
                                  ) : item.status === 'APPROVED' ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      Đã duyệt
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
                                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                      Đã từ chối
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {item.status === 'PENDING' ? (
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => handleOpenApproveModal(item)}
                                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs hover:shadow-sm transition-all flex items-center justify-center cursor-pointer active:scale-95"
                                        title="Phê duyệt tài khoản và gán Tên tài khoản (ID)"
                                        aria-label="Duyệt"
                                      >
                                        <Check className="w-4 h-4 stroke-[2.5]" />
                                      </button>
                                      <button
                                        onClick={() => handleRejectRegistration(item)}
                                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-lg border border-rose-200 transition-all flex items-center justify-center cursor-pointer active:scale-95"
                                        title="Từ chối yêu cầu"
                                        aria-label="Từ chối"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 font-medium italic">
                                      {item.processedBy ? `Bởi ${item.processedBy}` : 'Đã xử lý'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : activeTab === 'RESET_REQUESTS' ? (
            /* RESET PASSWORD REQUESTS VIEW */
            (() => {
              const visibleResetRequests = resetRequests.filter((r) => isAdmin || r.role === 'STUDENT');
              const resetCountAll = visibleResetRequests.length;
              const resetCountTeacher = visibleResetRequests.filter((r) => r.role === 'TEACHER').length;
              const resetCountStudent = visibleResetRequests.filter((r) => r.role === 'STUDENT').length;
              const resetCountPending = visibleResetRequests.filter((r) => r.status === 'PENDING').length;
              const resetCountApproved = visibleResetRequests.filter((r) => r.status !== 'PENDING').length;

              const filteredResetRequests = visibleResetRequests
                .filter((item) => {
                  if (isAdmin) {
                    if (resetRoleFilter === 'TEACHER') return item.role === 'TEACHER';
                    if (resetRoleFilter === 'STUDENT') return item.role === 'STUDENT';
                    return true;
                  } else {
                    if (resetTeacherStatusFilter === 'APPROVED') return item.status !== 'PENDING';
                    if (resetTeacherStatusFilter === 'PENDING') return item.status === 'PENDING';
                    return true;
                  }
                })
                .filter((item) => {
                  const q = searchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    item.idUser.toLowerCase().includes(q) ||
                    (item.hoTen && item.hoTen.toLowerCase().includes(q)) ||
                    (item.chiDoan && item.chiDoan.toLowerCase().includes(q)) ||
                    (item.note && item.note.toLowerCase().includes(q))
                  );
                });

              return (
                <div className="space-y-5">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                      <div className="relative w-full sm:w-72">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Tìm theo Tên, ID tài khoản, Đơn vị, Ghi chú..."
                          className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white"
                        />
                      </div>

                      {/* Filter by Role for Admin or Filter by Status for Teacher */}
                      {isAdmin ? (
                        <div className="inline-flex items-center p-1 bg-slate-100/90 border border-slate-200/80 rounded-2xl">
                          <button
                            type="button"
                            onClick={() => setResetRoleFilter('ALL')}
                            className={`px-3.5 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                              resetRoleFilter === 'ALL'
                                ? 'bg-white text-blue-900 font-extrabold shadow-xs'
                                : 'text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/50'
                            }`}
                          >
                            Tất cả ({resetCountAll})
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetRoleFilter('TEACHER')}
                            className={`px-3.5 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                              resetRoleFilter === 'TEACHER'
                                ? 'bg-white text-blue-900 font-extrabold shadow-xs'
                                : 'text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/50'
                            }`}
                          >
                            Giáo viên ({resetCountTeacher})
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetRoleFilter('STUDENT')}
                            className={`px-3.5 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                              resetRoleFilter === 'STUDENT'
                                ? 'bg-white text-blue-900 font-extrabold shadow-xs'
                                : 'text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/50'
                            }`}
                          >
                            Học sinh ({resetCountStudent})
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center p-1 bg-slate-100/90 border border-slate-200/80 rounded-2xl">
                          <button
                            type="button"
                            onClick={() => setResetTeacherStatusFilter('ALL')}
                            className={`px-3.5 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                              resetTeacherStatusFilter === 'ALL'
                                ? 'bg-white text-blue-900 font-extrabold shadow-xs'
                                : 'text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/50'
                            }`}
                          >
                            Tất cả ({resetCountAll})
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetTeacherStatusFilter('APPROVED')}
                            className={`px-3.5 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                              resetTeacherStatusFilter === 'APPROVED'
                                ? 'bg-white text-blue-900 font-extrabold shadow-xs'
                                : 'text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/50'
                            }`}
                          >
                            Đã duyệt ({resetCountApproved})
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetTeacherStatusFilter('PENDING')}
                            className={`px-3.5 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                              resetTeacherStatusFilter === 'PENDING'
                                ? 'bg-white text-blue-900 font-extrabold shadow-xs'
                                : 'text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/50'
                            }`}
                          >
                            Chưa duyệt ({resetCountPending})
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleApproveAllResets}
                          disabled={visibleResetRequests.filter((r) => r.status === 'PENDING').length === 0}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                          title="Phê duyệt tất cả yêu cầu reset mật khẩu về 123"
                        >
                          <Check className="w-4 h-4" />
                          All
                        </button>
                        <button
                          onClick={handleRejectAllResets}
                          disabled={visibleResetRequests.filter((r) => r.status === 'PENDING').length === 0}
                          className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed text-rose-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 border border-rose-200 cursor-pointer"
                          title="Từ chối tất cả yêu cầu reset mật khẩu"
                        >
                          <XCircle className="w-4 h-4 text-rose-600" />
                          All
                        </button>
                      </div>

                      <div className="text-xs text-slate-500 font-semibold flex items-center gap-2">
                        <span>
                          Chờ duyệt:{' '}
                          <strong className="text-rose-700 font-extrabold text-sm">
                            {visibleResetRequests.filter((r) => r.status === 'PENDING').length}
                          </strong>{' '}
                          yêu cầu
                        </span>
                        <button
                          onClick={fetchResetRequests}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Tải lại danh sách yêu cầu reset"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {visibleResetRequests.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
                      <KeyRound className="w-12 h-12 text-slate-300 mx-auto" />
                      <p className="font-bold text-slate-700 text-sm">
                        Chưa có yêu cầu đặt lại mật khẩu nào.
                      </p>
                      <p className="text-xs text-slate-400">
                        Khi {isTeacher ? 'Học sinh' : 'Học sinh hoặc Giáo viên'} bấm "Quên mật khẩu" ở màn hình đăng nhập, yêu cầu sẽ xuất hiện tại đây để được phê duyệt.
                      </p>
                    </div>
                  ) : filteredResetRequests.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                      <Search className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="font-bold text-slate-700 text-xs">
                        Không tìm thấy yêu cầu đặt lại mật khẩu nào phù hợp với bộ lọc.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                      <div className="overflow-x-auto max-h-[460px]">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-3 w-10 text-center">STT</th>
                              <th className="px-4 py-3">Tài khoản (ID)</th>
                              <th className="px-4 py-3">Họ và tên</th>
                              <th className="px-4 py-3">Lớp / Đơn vị</th>
                              <th className="px-4 py-3">Vai trò</th>
                              <th className="px-4 py-3">Thời gian</th>
                              <th className="px-4 py-3">Ghi chú / Lý do</th>
                              <th className="px-4 py-3 text-center">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 font-medium">
                            {filteredResetRequests.map((item, idx) => (
                              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-3 text-center text-slate-400 font-bold">
                                  {idx + 1}
                                </td>
                                <td className="px-4 py-3 font-mono font-bold text-blue-900">
                                  {item.idUser}
                                </td>
                                <td className="px-4 py-3 font-bold text-slate-900">{item.hoTen || '—'}</td>
                                <td className="px-4 py-3 text-slate-700">{item.chiDoan || '—'}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    item.role === 'TEACHER' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {item.role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-[11px]">
                                  {item.requestedAt ? new Date(item.requestedAt).toLocaleString('vi-VN') : '—'}
                                </td>
                                <td className="px-4 py-3 text-slate-600 italic">
                                  {item.note || 'Không có ghi chú'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {item.status === 'PENDING' ? (
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => handleApproveResetPassword(item)}
                                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs hover:shadow-sm transition-all flex items-center justify-center cursor-pointer active:scale-95"
                                        title="Phê duyệt reset mật khẩu về 123"
                                        aria-label="Duyệt reset mật khẩu"
                                      >
                                        <Check className="w-4 h-4 stroke-[2.5]" />
                                      </button>
                                      <button
                                        onClick={() => handleRejectResetPassword(item)}
                                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-lg border border-rose-200 transition-all flex items-center justify-center cursor-pointer active:scale-95"
                                        title="Từ chối yêu cầu reset"
                                        aria-label="Từ chối reset mật khẩu"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 font-medium italic">
                                      {item.status === 'APPROVED' ? 'Đã reset về 123' : 'Đã từ chối'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="space-y-5">
              {/* Search & Counter Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Tìm kiếm ${
                      activeTab === 'TEACHER' ? 'Giáo viên' : 'Học sinh'
                    } theo tên, tài khoản, tổ/lớp...`}
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="text-xs text-slate-500 font-semibold flex items-center gap-2">
                  <span>
                    Tổng cộng:{' '}
                    <strong className="text-slate-900 font-extrabold">
                      {filteredAccounts.length}
                    </strong>{' '}
                    tài khoản {activeTab === 'TEACHER' ? 'Giáo viên' : 'Học sinh'}
                  </span>
                  <button
                    onClick={fetchAccounts}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Tải lại danh sách"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingAccounts ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Accounts Table */}
              {loadingAccounts ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                  <p className="text-xs font-bold">Đang tải danh sách tài khoản...</p>
                </div>
              ) : filteredAccounts.length === 0 ? (
                <div className="py-16 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
                  <Users className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700 text-sm">
                    Chưa có tài khoản {activeTab === 'TEACHER' ? 'Giáo viên' : 'Học sinh'} nào!
                  </p>
                  <p className="text-xs text-slate-400">
                    {isAdmin
                      ? 'Bấm nút "Tải lên file Excel" hoặc "Nhập thủ công" phía trên để tạo danh sách tài khoản.'
                      : 'Hiện chưa có tài khoản Học sinh nào trên hệ thống.'}
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                  <div className="overflow-x-auto max-h-[420px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 w-12 text-center">STT</th>
                          <th className="px-4 py-3">Họ và tên</th>
                          <th className="px-4 py-3">
                            {activeTab === 'TEACHER' ? 'Tổ chuyên môn' : 'Lớp'}
                          </th>
                          <th className="px-4 py-3">Tên tài khoản (ID)</th>
                          <th className="px-4 py-3">Trạng thái mật khẩu</th>
                          <th className="px-4 py-3 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium">
                        {filteredAccounts.map((acc, idx) => (
                          <tr key={acc.idUser} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-center text-slate-400 font-bold">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900">
                              <div className="flex items-center gap-2.5">
                                {acc.avatar ? (
                                  <img
                                    src={acc.avatar}
                                    alt={acc.hoTen}
                                    className="w-7 h-7 rounded-full object-cover border border-slate-200 shadow-xs shrink-0"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                                    {(acc.hoTen || 'U').charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span>{acc.hoTen}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700 font-semibold">
                              {acc.chiDoan || (activeTab === 'TEACHER' ? 'Giáo viên' : 'Lớp')}
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-blue-700">
                              {acc.idUser}
                            </td>
                            <td className="px-4 py-3">
                              {!(acc.customPass && acc.customPass.trim() !== '') ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                                  <Key className="w-3 h-3 text-amber-600" />
                                  Mặc định 123 (Chưa đổi)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Đã tự đổi mật khẩu
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {isAdmin && (
                                  <button
                                    onClick={() => {
                                      setEditAccountModal({
                                        isOpen: true,
                                        origIdUser: acc.idUser,
                                        accountType: activeTab as 'TEACHER' | 'STUDENT',
                                        hoTen: acc.hoTen,
                                        chiDoan: acc.chiDoan || '',
                                        idUser: acc.idUser,
                                        defaultPass: acc.defaultPass || '123',
                                        customPass: acc.customPass || '',
                                        avatar: acc.avatar || (acc as any).avatarUrl || '',
                                      });
                                    }}
                                    className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 border border-blue-300 rounded-lg transition-colors cursor-pointer"
                                    title="Chỉnh sửa thông tin tài khoản (Họ tên, Đơn vị/Lớp, ID)"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleResetPassword(acc.idUser, acc.hoTen)}
                                  className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 border border-amber-300 rounded-lg transition-colors cursor-pointer"
                                  title="Đặt lại mật khẩu về mặc định (123)"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleDeleteExistingAccount(acc.idUser)}
                                    className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-300 rounded-lg transition-colors cursor-pointer"
                                    title="Xóa tài khoản này"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Quyền hiện tại: <strong className="text-slate-800 font-bold">{isAdmin ? 'Quản trị viên (Admin)' : 'Giáo viên'}</strong></span>
          {!isInline && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all cursor-pointer"
            >
              Đóng
            </button>
          )}
        </div>
      </div>

      {/* Approval Confirmation & ID Assignment Modal */}
      {approvalModalReg && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-5 relative">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base uppercase">PHÊ DUYỆT & TẠO TÀI KHOẢN</h3>
                  <p className="text-[11px] text-slate-500">Cấp tài khoản mới cho yêu cầu đăng ký</p>
                </div>
              </div>
              <button
                onClick={() => setApprovalModalReg(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <div>
                <span className="text-slate-400 block font-semibold text-[11px]">Họ và tên đăng ký:</span>
                <strong className="text-slate-900 text-sm font-bold">{approvalModalReg.hoTen}</strong>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                <div>
                  <span className="text-slate-400 block font-semibold text-[11px]">Địa chỉ Gmail:</span>
                  <span className="font-mono text-blue-800 font-bold text-xs truncate block">{approvalModalReg.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold text-[11px]">Vai trò & Đơn vị:</span>
                  <span className="font-bold text-slate-800 text-xs">
                    {approvalModalReg.role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'} ({approvalModalReg.chiDoan})
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                Tên tài khoản (ID) gán cho người dùng: <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={approvalIdInput}
                onChange={(e) => setApprovalIdInput(e.target.value)}
                placeholder="Nhập tên tài khoản (ID)"
                className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl font-mono text-sm font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-blue-50/40 shadow-2xs"
                autoFocus
              />
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-xl text-xs flex items-start gap-2">
                <Key className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Admin nhập Tên tài khoản (ID) ở trên. Khi bấm Duyệt, tài khoản sẽ được tạo tự động với <strong className="text-amber-900 font-extrabold underline">Mật khẩu mặc định: 123</strong>.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setApprovalModalReg(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={executeApproveRegistration}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Check className="w-4 h-4" />
                Xác nhận tạo tài khoản
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Account Create Modal */}
      {isSingleCreateOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-5 relative">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base uppercase">
                    THÊM TÀI KHOẢN {activeTab === 'TEACHER' ? 'GIÁO VIÊN' : 'HỌC SINH'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Tạo 1 tài khoản đơn lẻ & tự động đồng bộ Google Sheets</p>
                </div>
              </div>
              <button
                onClick={() => setIsSingleCreateOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSingleAccountSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Họ và tên: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={singleCreateData.hoTen}
                  onChange={(e) => setSingleCreateData({ ...singleCreateData, hoTen: e.target.value })}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    {activeTab === 'TEACHER' ? 'Tổ chuyên môn:' : 'Lớp / Chi đoàn:'}
                  </label>
                  <input
                    type="text"
                    value={singleCreateData.chiDoan}
                    onChange={(e) => setSingleCreateData({ ...singleCreateData, chiDoan: e.target.value })}
                    placeholder={activeTab === 'TEACHER' ? 'Tổ Toán' : '12A1'}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Tên tài khoản (ID): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={singleCreateData.idUser}
                    onChange={(e) => setSingleCreateData({ ...singleCreateData, idUser: e.target.value })}
                    placeholder={activeTab === 'TEACHER' ? 'gv.an.toan' : 'hs.an.12a1'}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl font-mono font-bold text-blue-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Dán link avatar (nếu có):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={singleCreateData.avatar}
                    onChange={(e) => setSingleCreateData({ ...singleCreateData, avatar: e.target.value })}
                    placeholder="https://example.com/avatar.jpg"
                    className="flex-1 px-3.5 py-2 border border-slate-300 rounded-xl font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {singleCreateData.avatar && (
                    <div className="w-9 h-9 rounded-full aspect-square border border-indigo-200 overflow-hidden shrink-0 bg-slate-100 flex items-center justify-center shadow-xs ring-1 ring-indigo-300">
                      <img
                        src={singleCreateData.avatar}
                        alt="Preview Avatar"
                        className="w-full h-full object-cover rounded-full aspect-square"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSingleCreateOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingSingle}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {creatingSingle ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Tạo tài khoản & Đồng bộ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Account Edit Modal */}
      {editAccountModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-5 relative">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base uppercase">CHỈNH SỬA THÔNG TIN TÀI KHOẢN</h3>
                  <p className="text-[11px] text-slate-500 font-mono font-bold text-blue-700">{editAccountModal.origIdUser}</p>
                </div>
              </div>
              <button
                onClick={() => setEditAccountModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditAccountSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Họ và tên: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editAccountModal.hoTen}
                  onChange={(e) => setEditAccountModal({ ...editAccountModal, hoTen: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    {editAccountModal.accountType === 'TEACHER' ? 'Tổ chuyên môn:' : 'Lớp / Chi đoàn:'}
                  </label>
                  <input
                    type="text"
                    value={editAccountModal.chiDoan}
                    onChange={(e) => setEditAccountModal({ ...editAccountModal, chiDoan: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1 flex items-center justify-between">
                    <span>Tên tài khoản (ID):</span>
                    <span className="text-[10px] text-slate-400 font-normal flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-400" /> Không thể sửa ID
                    </span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={editAccountModal.origIdUser}
                    className="w-full px-3.5 py-2 border border-slate-200 bg-slate-100 font-mono font-bold text-slate-500 rounded-xl cursor-not-allowed select-none focus:outline-none"
                    title="Tên tài khoản (ID) là định danh cố định không thể chỉnh sửa"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Dán link avatar (nếu có):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={editAccountModal.avatar || ''}
                    onChange={(e) => setEditAccountModal({ ...editAccountModal, avatar: e.target.value })}
                    placeholder="https://example.com/avatar.jpg"
                    className="flex-1 px-3.5 py-2 border border-slate-300 rounded-xl font-mono text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  {editAccountModal.avatar && (
                    <div className="w-9 h-9 rounded-full aspect-square border border-blue-200 overflow-hidden shrink-0 bg-slate-100 flex items-center justify-center shadow-xs ring-1 ring-blue-300">
                      <img
                        src={editAccountModal.avatar}
                        alt="Preview Avatar"
                        className="w-full h-full object-cover rounded-full aspect-square"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-xl text-[11px] flex items-start gap-2">
                <Cloud className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Sau khi lưu, thay đổi sẽ <strong className="text-amber-950 font-bold">tự động đồng bộ lên Google Sheets</strong>.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditAccountModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Lưu thay đổi & Đồng bộ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

  return isInline ? (
    <div className="w-full animate-in fade-in duration-200">{modalInner}</div>
  ) : (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      {modalInner}
    </div>
  );
};
