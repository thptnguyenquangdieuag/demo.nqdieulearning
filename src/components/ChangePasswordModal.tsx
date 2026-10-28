import React, { useState } from 'react';
import { User } from '../types';
import { KeyRound, Lock, AlertCircle, CheckCircle2, X, Eye, EyeOff, Key, ShieldAlert } from 'lucide-react';
import { saveStoredPassword, getStoredPasswords, getStoredAccounts } from '../lib/storage';

interface ChangePasswordModalProps {
  isOpen: boolean;
  currentUser: User | null;
  onSuccess: () => void;
  onClose?: () => void;
  isFirstLogin?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  currentUser,
  onSuccess,
  onClose,
  isFirstLogin = false,
}) => {
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  if (!isOpen || !currentUser) return null;

  const isCurrentPassEntered = currentPass.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanCurrent = currentPass.trim();
    const cleanNew = newPass.trim();
    const cleanConfirm = confirmPass.trim();

    if (!cleanCurrent) {
      setErrorMsg('Vui lòng nhập mật khẩu hiện tại!');
      return;
    }

    if (!cleanNew) {
      setErrorMsg('Vui lòng nhập mật khẩu mới!');
      return;
    }

    if (!/^\d{8,}$/.test(cleanNew)) {
      setErrorMsg('Mật khẩu mới phải chỉ chứa số và tối thiểu 8 chữ số!');
      return;
    }

    if (cleanNew !== cleanConfirm) {
      setErrorMsg('Mật khẩu xác nhận không khớp!');
      return;
    }

    if (cleanNew === cleanCurrent) {
      setErrorMsg('Mật khẩu mới không được trùng với mật khẩu hiện tại!');
      return;
    }

    setLoading(true);
    let apiHandled = false;

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idUser: currentUser.idUser,
          role: currentUser.role,
          currentPassword: cleanCurrent,
          newPassword: cleanNew,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLoading(false);
        apiHandled = true;

        if (data.success) {
          saveStoredPassword(currentUser.idUser, cleanNew);
          setCurrentPass('');
          setNewPass('');
          setConfirmPass('');
          onSuccess();
          return;
        } else {
          setErrorMsg(data.message || 'Đổi mật khẩu thất bại.');
          return;
        }
      }
    } catch (err) {
      console.warn('Backend API change-password unavailable, validating and saving locally.');
    }

    // Local client-side fallback verification if backend API is unreachable
    if (!apiHandled) {
      setLoading(false);
      const cleanId = currentUser.idUser.toLowerCase();

      // Check admin
      if (currentUser.role === 'ADMIN' || cleanId === 'admin') {
        if (cleanCurrent !== '19310326' && cleanCurrent !== 'admin') {
          setErrorMsg('Mật khẩu hiện tại của Quản trị viên (Admin) không chính xác!');
          return;
        }
      } else {
        // Check student/teacher
        const storedPasswords = getStoredPasswords();
        const storedAccounts = getStoredAccounts();
        const foundTeacher = storedAccounts.teachers.find(
          (t) => t.idUser.toLowerCase() === cleanId || t.hoTen.toLowerCase() === cleanId
        );
        const foundStudent = storedAccounts.students.find(
          (s) => s.idUser.toLowerCase() === cleanId || s.hoTen.toLowerCase() === cleanId
        );
        const foundAcc = foundTeacher || foundStudent;

        const expectedPass =
          storedPasswords[cleanId] || foundAcc?.customPass || foundAcc?.defaultPass || '123';
        const hasCustomPass = !!(
          (storedPasswords[cleanId] && storedPasswords[cleanId].trim() !== '') ||
          (foundAcc?.customPass && foundAcc.customPass.trim() !== '')
        );

        const isValidCurrent =
          cleanCurrent === expectedPass ||
          (!hasCustomPass && (cleanCurrent === '123' || cleanCurrent === '12345678' || cleanCurrent === foundAcc?.defaultPass));

        if (!isValidCurrent) {
          setErrorMsg('Mật khẩu hiện tại không chính xác!');
          return;
        }
      }

      saveStoredPassword(currentUser.idUser, cleanNew);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-[340px] rounded-[24px] shadow-2xl border border-slate-100 px-4.5 pb-4.5 pt-3.5 relative overflow-hidden">
        {/* Top Back/Close Action */}
        <div className="flex justify-end mb-0.5">
          {!isFirstLogin && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-0.5 transition-colors cursor-pointer"
            >
              <span>Đóng</span>
              <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
            </button>
          )}
        </div>

        {/* Center Circular Icon Badge */}
        <div className="w-11 h-11 rounded-full bg-blue-50/90 border border-blue-100 flex items-center justify-center mx-auto mb-2 text-[#0b5c9e] shadow-2xs">
          <KeyRound className="w-5 h-5 text-[#0b5c9e] stroke-[1.8]" />
        </div>

        {/* Title & Subtitle */}
        <h3 className="text-base sm:text-lg font-extrabold text-[#0b3b72] tracking-tight text-center uppercase leading-snug">
          {isFirstLogin ? 'ĐỔI MẬT KHẨU LẦN ĐẦU' : 'ĐỔI MẬT KHẨU'}
        </h3>
        <p className="text-[11px] text-slate-500 font-medium text-center mt-0.5 mb-2.5 leading-tight">
          {isFirstLogin
            ? 'Vui lòng xác thực mật khẩu hiện tại rồi đặt mật khẩu số mới'
            : 'Nhập mật khẩu hiện tại rồi đặt mật khẩu mới'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-[11px] flex items-start gap-1.5 leading-snug animate-shake">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-2 bg-blue-50/70 border border-blue-100 rounded-xl text-[10px] text-blue-950 flex items-start gap-1.5 leading-tight">
            <Key className="w-3.5 h-3.5 shrink-0 text-blue-600 mt-0.5" />
            <span>
              Quy định: Mật khẩu mới <strong>chỉ chứa số</strong> và <strong>tối thiểu 8 chữ số</strong>.
            </span>
          </div>

          {/* 1. MẬT KHẨU HIỆN TẠI */}
          <div className="bg-slate-50/70 p-2 rounded-xl border border-slate-200/80">
            <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-[#0b5c9e] text-white text-[9px] font-extrabold flex items-center justify-center">1</span>
                <span>Mật khẩu hiện tại</span>
              </span>
              {isFirstLogin ? (
                <span className="text-[10px] text-amber-700 font-bold bg-amber-100/80 px-1.5 py-0.5 rounded-md">
                  Mặc định: 123
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium">Bắt buộc</span>
              )}
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                type={showCurrentPass ? 'text' : 'password'}
                inputMode="numeric"
                required
                autoFocus
                value={currentPass}
                onChange={(e) => {
                  setCurrentPass(e.target.value.replace(/\D/g, ''));
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder={isFirstLogin ? 'Nhập mật khẩu hiện tại (mặc định 123)' : 'Nhập mật khẩu đang sử dụng'}
                className="w-full pl-8 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all shadow-2xs font-medium"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                title={showCurrentPass ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
              >
                {showCurrentPass ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
              </button>
            </div>
          </div>

          {/* 2. MẬT KHẨU MỚI & XÁC NHẬN - YÊU CẦU NHẬP MẬT KHẨU HIỆN TẠI TRƯỚC */}
          {!isCurrentPassEntered && (
            <div className="p-2 bg-amber-50/90 border border-amber-200 text-amber-900 rounded-xl text-[10.5px] flex items-center gap-1.5 font-medium leading-tight">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>Vui lòng nhập mật khẩu hiện tại.</span>
            </div>
          )}

          <div className={!isCurrentPassEntered ? 'opacity-50 pointer-events-none transition-opacity duration-200' : 'transition-opacity duration-200'}>
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[9px] font-extrabold flex items-center justify-center">2</span>
                    <span>Mật khẩu mới</span>
                  </span>
                  <span className="text-[10px] text-blue-700 font-semibold normal-case">(Tối thiểu 8 số)</span>
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    disabled={!isCurrentPassEntered}
                    required
                    value={newPass}
                    onChange={(e) => {
                      setNewPass(e.target.value.replace(/\D/g, ''));
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder={isCurrentPassEntered ? 'Nhập mật khẩu mới (tối thiểu 8 số)' : 'Khóa: Nhập mật khẩu hiện tại trước'}
                    className={`w-full pl-8 pr-8 py-1.5 rounded-xl text-xs transition-all shadow-2xs font-medium ${
                      isCurrentPassEntered
                        ? 'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600'
                        : 'bg-slate-100 border border-slate-200 text-slate-400 placeholder:text-slate-400 cursor-not-allowed'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={!isCurrentPassEntered}
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer disabled:cursor-not-allowed"
                    title={showPass ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                  >
                    {showPass ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[9px] font-extrabold flex items-center justify-center">3</span>
                    <span>Xác nhận mật khẩu mới</span>
                  </span>
                  <span className="text-[10px] text-blue-700 font-semibold normal-case">(Chỉ nhập số)</span>
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    disabled={!isCurrentPassEntered}
                    required
                    value={confirmPass}
                    onChange={(e) => {
                      setConfirmPass(e.target.value.replace(/\D/g, ''));
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder={isCurrentPassEntered ? 'Nhập lại mật khẩu số mới' : 'Khóa: Nhập mật khẩu hiện tại trước'}
                    className={`w-full pl-8 pr-8 py-1.5 rounded-xl text-xs transition-all shadow-2xs font-medium ${
                      isCurrentPassEntered
                        ? 'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600'
                        : 'bg-slate-100 border border-slate-200 text-slate-400 placeholder:text-slate-400 cursor-not-allowed'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={!isCurrentPassEntered}
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer disabled:cursor-not-allowed"
                    title={showConfirmPass ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                  >
                    {showConfirmPass ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={loading || !isCurrentPassEntered || !newPass || !confirmPass}
              className="w-full py-2 bg-[#0b5c9e] hover:bg-[#094d85] text-white font-extrabold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 text-xs tracking-wider disabled:opacity-50 cursor-pointer active:scale-[0.98]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>XÁC NHẬN ĐỔI MẬT KHẨU</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
