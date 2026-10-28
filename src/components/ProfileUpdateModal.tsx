import React, { useState, useEffect } from 'react';
import { User } from '../types';
import {
  X,
  User as UserIcon,
  Lock,
  Image as ImageIcon,
  Check,
  Shield,
  Briefcase,
  GraduationCap,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { saveStoredAccounts, getStoredAccounts, saveStoredAdminProfile, getStoredAdminProfile } from '../lib/storage';

interface ProfileUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onProfileUpdated?: (updatedUser: User) => void;
}

export const ProfileUpdateModal: React.FC<ProfileUpdateModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
}) => {
  const [avatarUrl, setAvatarUrl] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && currentUser) {
      const initialAvatar = currentUser.avatar || currentUser.avatarUrl || '';
      setAvatarUrl(initialAvatar);
      setPreviewError(false);
      setSuccessMsg('');
      setErrorMsg('');
    }
  }, [isOpen, currentUser]);

  if (!isOpen || !currentUser) return null;

  const isAdmin = currentUser.role === 'ADMIN';
  const isTeacher = currentUser.role === 'TEACHER';
  const isStudent = currentUser.role === 'STUDENT';

  const roleTitle = isAdmin
    ? 'Quản trị viên (Admin)'
    : isTeacher
    ? 'Giáo viên bộ môn'
    : 'Học sinh';

  const departmentLabel = isAdmin
    ? 'Đơn vị / Ban quản trị'
    : isTeacher
    ? 'Tổ chuyên môn'
    : 'Lớp / Chi đoàn';

  const departmentValue = isAdmin
    ? currentUser.chiDoan || 'BCH Đoàn trường / BGH'
    : currentUser.chiDoan || (isTeacher ? 'Giáo viên' : '12A1');

  const getUserInitials = (name?: string, id?: string) => {
    const target = (name || id || '').trim();
    if (!target) return 'U';
    const words = target.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return target.slice(0, 2).toUpperCase();
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    const cleanAvatar = (avatarUrl || '').trim();
    const cleanId = currentUser.idUser.toLowerCase();
    const isCurrentUserAdmin =
      currentUser.role === 'ADMIN' ||
      cleanId === 'admin.c3nguyenquangdieu' ||
      cleanId === 'admin';

    // Persist directly to Supabase-backed server. UI is updated only after request succeeds.
    const updatedUser: User = { ...currentUser, avatar: cleanAvatar, avatarUrl: cleanAvatar };
    try {
      const res = await fetch('/api/profile/update-avatar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUser: currentUser.idUser, role: currentUser.role, avatar: cleanAvatar }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Không thể lưu ảnh đại diện lên Supabase.');
      if (isCurrentUserAdmin) saveStoredAdminProfile({ avatar: cleanAvatar, avatarUrl: cleanAvatar });
      else {
        const stored = getStoredAccounts();
        stored.teachers.forEach(t => { if (t.idUser.toLowerCase() === cleanId) { t.avatar=cleanAvatar; t.avatarUrl=cleanAvatar; } });
        stored.students.forEach(s => { if (s.idUser.toLowerCase() === cleanId) { s.avatar=cleanAvatar; s.avatarUrl=cleanAvatar; } });
        saveStoredAccounts(stored.teachers, stored.students);
      }
      setSuccessMsg(data.message || 'Cập nhật ảnh đại diện thành công và đã lưu trên Supabase.');
      onProfileUpdated?.(updatedUser);
      window.dispatchEvent(new Event('accounts-updated'));
      window.dispatchEvent(new Event('admin-profile-updated'));
      setTimeout(() => onClose(), 800);
    } catch (err:any) {
      setErrorMsg(err?.message || 'Không thể lưu ảnh đại diện lên Supabase.');
    } finally { setIsSaving(false); }
    return;

  };

  return (
    <div
      id="profile-update-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="profile-update-modal-dialog"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0B4D9C] to-blue-700 px-4 py-3 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shadow-inner">
              <UserIcon className="w-4 h-4 text-amber-300" />
            </div>
            <h2 className="text-sm sm:text-base font-black tracking-tight leading-tight">
              CẬP NHẬT HỒ SƠ
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5">
          {/* Success / Error Alerts */}
          {successMsg && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-800 dark:text-rose-300 text-xs font-semibold animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Profile Overview Card with Avatar Preview */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 flex items-center gap-3 shadow-xs">
            {/* Avatar container */}
            <div className="relative group shrink-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full aspect-square bg-[#0B4D9C] text-white flex items-center justify-center font-black text-lg shadow-md ring-3 ring-blue-500/20 dark:ring-blue-400/20 overflow-hidden select-none shrink-0">
                {avatarUrl && !previewError ? (
                  <img
                    src={avatarUrl}
                    alt={currentUser.hoTen || currentUser.idUser}
                    className="w-full h-full object-cover rounded-full aspect-square"
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewError(true)}
                  />
                ) : (
                  getUserInitials(currentUser.hoTen, currentUser.idUser)
                )}
              </div>
              {avatarUrl && !previewError && (
                <span className="absolute bottom-0 right-0 bg-emerald-500 text-white p-0.5 rounded-full ring-2 ring-white dark:ring-slate-900 shadow-xs">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </div>

            {/* Info details */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    isAdmin
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300/60'
                      : isTeacher
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300/60'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300/60'
                  }`}
                >
                  {isAdmin ? (
                    <Shield className="w-2.5 h-2.5" />
                  ) : isTeacher ? (
                    <Briefcase className="w-2.5 h-2.5" />
                  ) : (
                    <GraduationCap className="w-2.5 h-2.5" />
                  )}
                  {roleTitle}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                {currentUser.hoTen || currentUser.fullName || currentUser.idUser}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                {departmentLabel}: <span className="font-bold text-slate-700 dark:text-slate-300">{departmentValue}</span>
              </p>
            </div>
          </div>

          {/* Form Fields */}
          <form onSubmit={handleSave} className="space-y-3">
            {/* 1. Full Name (Read-only) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <span>Họ và tên</span>
                </label>
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5 text-slate-400" />
                  Chỉ xem
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={currentUser.hoTen || currentUser.fullName || 'Administrator'}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs sm:text-sm font-semibold cursor-not-allowed select-all focus:outline-hidden"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* 2. Department / Class (Read-only) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <span>{departmentLabel}</span>
                </label>
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5 text-slate-400" />
                  Chỉ xem
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={departmentValue}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs sm:text-sm font-semibold cursor-not-allowed select-all focus:outline-hidden"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* 3. Account ID (Read-only) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <span>Tên tài khoản (ID)</span>
                </label>
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5 text-slate-400" />
                  Chỉ xem
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={currentUser.idUser}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono rounded-xl text-xs sm:text-sm font-semibold cursor-not-allowed select-all focus:outline-hidden"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* 4. Avatar URL (EDITABLE) */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="profile-avatar-input"
                  className="text-[11px] sm:text-xs font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1.5"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Link ảnh đại diện (Avatar URL)</span>
                </label>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarUrl('');
                      setPreviewError(false);
                    }}
                    className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                    Xóa ảnh
                  </button>
                )}
              </div>

              <div className="relative">
                <input
                  id="profile-avatar-input"
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    setPreviewError(false);
                  }}
                  placeholder="https://example.com/anh-dai-dien.jpg hoặc dán link ảnh..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border-2 border-blue-400/80 dark:border-blue-500 rounded-xl text-xs sm:text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-600 shadow-xs"
                />
              </div>

              {previewError && avatarUrl && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Không thể tải ảnh từ đường dẫn này. Vui lòng kiểm tra lại liên kết.
                </p>
              )}
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold text-white bg-gradient-to-r from-[#0B4D9C] to-blue-600 hover:from-blue-700 hover:to-blue-800 shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Lưu thay đổi</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
