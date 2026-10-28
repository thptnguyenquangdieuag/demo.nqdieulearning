import React, { useState } from 'react';
import { User, PendingRegistration, ResetPasswordRequest } from '../types';
import {
  Lock,
  AlertCircle,
  X,
  LogIn,
  UserPlus,
  Mail,
  CheckCircle2,
  KeyRound,
  ArrowLeft,
  Plus,
  User as UserIcon,
  Eye,
  EyeOff,
  Key,
} from 'lucide-react';
import { DEFAULT_ADMIN_USER } from '../defaultData';
import {
  getStoredAccounts,
  getStoredPasswords,
  getStoredAdminProfile,
  saveStoredAdminProfile,
  saveStoredPendingRegistration,
  saveStoredResetPasswordRequest,
  addNotification,
} from '../lib/storage';
import schoolLogoImg from '../assets/images/school_logo_1785734354463.png';
import campusBgImg from '../assets/images/school_campus_bg_1787372799180.jpg';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

const ADMIN_USERNAME = 'admin.c3nguyenquangdieu';
const ADMIN_PASSWORD = '19310326';

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);

  const [idUser, setIdUser] = useState('');
  const [password, setPassword] = useState('');
  const [hoTen, setHoTen] = useState('');
  const [email, setEmail] = useState('');
  const [chiDoan, setChiDoan] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');

  // Forgot password state
  const [forgotIdUser, setForgotIdUser] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<{ idUser: string; hoTen?: string; message?: string } | null>(null);

  const [errorMsg, setErrorMsg] = useState('');
  const [pendingSuccess, setPendingSuccess] = useState<{
    hoTen: string;
    email: string;
    role: 'STUDENT' | 'TEACHER';
    chiDoan: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setIsRegisterMode(false);
      setIsForgotPasswordMode(false);
      setErrorMsg('');
      setPendingSuccess(null);
      setForgotSuccess(null);
      setShowPassword(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setForgotSuccess(null);
    setLoading(true);

    const cleanId = String(forgotIdUser || '').trim().toLowerCase();
    if (!cleanId) {
      setErrorMsg('Vui lòng nhập Tên tài khoản (ID)!');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/reset-password-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idUser: cleanId,
          note: String(forgotNote || '').trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLoading(false);
        if (data.success) {
          if (data.request) {
            saveStoredResetPasswordRequest(data.request);
          }
          setForgotSuccess({
            idUser: data.request?.idUser || cleanId,
            hoTen: data.request?.hoTen,
            message: data.message,
          });
          setForgotIdUser('');
          setForgotNote('');
          window.dispatchEvent(new Event('reset-requests-updated'));
          return;
        }
      }
    } catch (err) {
      console.warn('API reset password request failed, attempting local fallback.');
    }

    setLoading(false);
    // Local fallback for reset password request
    const storedAccounts = getStoredAccounts();
    const foundTeacher = storedAccounts.teachers.find((t) => t.idUser.toLowerCase() === cleanId);
    const foundStudent = storedAccounts.students.find((s) => s.idUser.toLowerCase() === cleanId);
    const foundAcc = foundTeacher || foundStudent;

    const roleVal = cleanId.includes('admin') || cleanId === 'admin'
      ? 'ADMIN'
      : foundTeacher
      ? 'TEACHER'
      : foundStudent
      ? 'STUDENT'
      : cleanId.startsWith('gv.')
      ? 'TEACHER'
      : 'STUDENT';

    const hoTenVal = foundAcc ? foundAcc.hoTen : cleanId;
    const chiDoanVal = foundAcc ? foundAcc.chiDoan : roleVal === 'TEACHER' ? 'Giáo viên' : 'Học sinh';

    const newReq: ResetPasswordRequest = {
      id: `RESET-${Date.now()}`,
      idUser: foundAcc ? foundAcc.idUser : cleanId,
      hoTen: hoTenVal,
      chiDoan: chiDoanVal,
      role: roleVal,
      requestedAt: new Date().toISOString(),
      status: 'PENDING',
      note: forgotNote.trim(),
    };

    saveStoredResetPasswordRequest(newReq);

    // Push notification for Admin / Teachers
    addNotification({
      id: `notif_reset_${newReq.id}`,
      recipientId: 'teachers',
      recipientRole: roleVal === 'STUDENT' ? 'TEACHER' : 'ADMIN',
      type: 'PASSWORD_RESET',
      title: 'Yêu cầu quên / đặt lại mật khẩu',
      message: `Tài khoản ${hoTenVal} (${newReq.idUser} - ${chiDoanVal}) vừa gửi yêu cầu đặt lại mật khẩu về mặc định (123).`,
      linkAction: 'open_account_management',
      createdAt: newReq.requestedAt,
    });

    setForgotSuccess({
      idUser: newReq.idUser,
      hoTen: hoTenVal,
      message: 'Gửi yêu cầu đặt lại mật khẩu thành công!',
    });
    setForgotIdUser('');
    setForgotNote('');
    window.dispatchEvent(new Event('reset-requests-updated'));
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setPendingSuccess(null);
    setLoading(true);

    const cleanName = String(hoTen || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanOrg = String(chiDoan || '').trim();

    if (!cleanName || !cleanEmail) {
      setErrorMsg('Vui lòng điền đầy đủ Họ tên và Địa chỉ Gmail!');
      setLoading(false);
      return;
    }

    if (!cleanEmail.includes('@')) {
      setErrorMsg('Địa chỉ Gmail không đúng định dạng!');
      setLoading(false);
      return;
    }

    const emailPrefix = cleanEmail.split('@')[0].replace(/[^a-z0-9]/g, '');
    const generatedId = (role === 'TEACHER' ? 'gv.' : 'hs.') + (emailPrefix || Date.now().toString());
    const defaultPassword = '12345678';
    const finalOrg = cleanOrg || (role === 'TEACHER' ? 'Giáo viên' : '12A1');

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idUser: generatedId,
          hoTen: cleanName,
          email: cleanEmail,
          chiDoan: finalOrg,
          role,
          password: defaultPassword,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLoading(false);
        if (data.success) {
          addNotification({
            id: `notif_reg_${data.registration?.id || Date.now()}`,
            recipientId: 'teachers',
            recipientRole: 'ADMIN',
            type: 'ACCOUNT_REGISTRATION',
            title: 'Yêu cầu đăng ký tài khoản mới',
            message: `Người dùng ${cleanName} (${finalOrg}, Gmail: ${cleanEmail}) vừa gửi yêu cầu đăng ký tài khoản ${role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'}.`,
            linkAction: 'open_account_management',
            createdAt: new Date().toISOString(),
          });
          if (data.registration) {
            saveStoredPendingRegistration(data.registration);
          }

          setPendingSuccess({
            hoTen: cleanName,
            email: cleanEmail,
            role,
            chiDoan: finalOrg,
          });
          setHoTen('');
          setEmail('');
          setChiDoan('');
          return;
        } else {
          setErrorMsg(data.message || 'Gửi yêu cầu đăng ký không thành công.');
          return;
        }
      }
    } catch (err) {
      console.warn('Register API unavailable, saving pending registration locally.');
    }

    setLoading(false);
    // Local fallback for pending registration
    const newPending: PendingRegistration = {
      id: `REG-${Date.now()}`,
      idUser: generatedId,
      hoTen: cleanName,
      email: cleanEmail,
      chiDoan: finalOrg,
      role,
      password: defaultPassword,
      createdAt: new Date().toISOString(),
      status: 'PENDING',
    };
    saveStoredPendingRegistration(newPending);

    addNotification({
      id: `notif_reg_${newPending.id}`,
      recipientId: 'teachers',
      recipientRole: 'ADMIN',
      type: 'ACCOUNT_REGISTRATION',
      title: 'Yêu cầu đăng ký tài khoản mới',
      message: `Người dùng ${cleanName} (${finalOrg}, Gmail: ${cleanEmail}) vừa gửi yêu cầu đăng ký tài khoản ${role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'}.`,
      linkAction: 'open_account_management',
      createdAt: newPending.createdAt,
    });

    setPendingSuccess({
      hoTen: cleanName,
      email: cleanEmail,
      role,
      chiDoan: finalOrg,
    });
    setHoTen('');
    setEmail('');
    setChiDoan('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegisterMode) {
      return handleRegisterSubmit(e);
    }

    setErrorMsg('');
    setPendingSuccess(null);
    setLoading(true);

    const cleanId = String(idUser || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    if (!cleanId || !cleanPass) {
      setErrorMsg('Vui lòng nhập Tên tài khoản và Mật khẩu!');
      setLoading(false);
      return;
    }

    // 1. Try API Login first (when running with Node server)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUser: cleanId, password: cleanPass }),
      });

      if (res.ok) {
        const data = await res.json();
        setLoading(false);
        if (data.success) {
          if (data.user?.role === 'ADMIN') {
            saveStoredAdminProfile(data.user);
          }
          onLoginSuccess(data.user);
          onClose();
          setIdUser('');
          setPassword('');
          return;
        } else {
          setErrorMsg(data.message || 'Đăng nhập thất bại.');
          return;
        }
      }
    } catch (err) {
      console.warn('Server API unavailable, falling back to client-side auth.');
    }

    // 2. Client-side fallback authentication
    setLoading(false);

    // Admin Check
    const isAdminId =
      cleanId === ADMIN_USERNAME.toLowerCase() ||
      cleanId === 'admin';

    if (isAdminId) {
      const storedAdmin = getStoredAdminProfile();
      const isValidAdminPass =
        (storedAdmin.customPass && cleanPass === storedAdmin.customPass) ||
        cleanPass === ADMIN_PASSWORD ||
        cleanPass === '19310326';

      if (isValidAdminPass) {
        const adminUserToLogin: User = {
          ...DEFAULT_ADMIN_USER,
          hoTen: storedAdmin.hoTen || DEFAULT_ADMIN_USER.hoTen,
          chiDoan: storedAdmin.chiDoan || DEFAULT_ADMIN_USER.chiDoan,
          avatar: storedAdmin.avatar || storedAdmin.avatarUrl || '',
          avatarUrl: storedAdmin.avatar || storedAdmin.avatarUrl || '',
        };
        onLoginSuccess(adminUserToLogin);
        onClose();
        setIdUser('');
        setPassword('');
        return;
      } else {
        setErrorMsg('Mật khẩu Admin không chính xác!');
        return;
      }
    }

    // Check stored custom accounts in LocalStorage
    const storedAccounts = getStoredAccounts();
    const storedPasswords = getStoredPasswords();

    const foundTeacher = storedAccounts.teachers.find(
      (t) =>
        t.idUser.toLowerCase() === cleanId ||
        t.hoTen.toLowerCase() === cleanId
    );
    const foundStudent = storedAccounts.students.find(
      (s) =>
        s.idUser.toLowerCase() === cleanId ||
        s.hoTen.toLowerCase() === cleanId
    );
    const foundAcc = foundTeacher || foundStudent;

    if (foundAcc) {
      const cleanAccId = String(foundAcc.idUser || '').toLowerCase();
      const expectedPass =
        storedPasswords[cleanAccId] || foundAcc.customPass || foundAcc.defaultPass || '123';
      
      const hasCustomPass = !!(
        (storedPasswords[cleanAccId] && String(storedPasswords[cleanAccId]).trim() !== '') ||
        (foundAcc.customPass && String(foundAcc.customPass).trim() !== '')
      );

      const isValid =
        cleanPass === expectedPass ||
        (!hasCustomPass && (cleanPass === '123' || cleanPass === '12345678' || cleanPass === foundAcc.defaultPass));

      if (isValid) {
        const uObj: User = {
          hoTen: foundAcc.hoTen,
          chiDoan: foundAcc.chiDoan,
          idUser: foundAcc.idUser,
          role: foundTeacher ? 'TEACHER' : 'STUDENT',
          isFirstLogin: !hasCustomPass,
          avatar: foundAcc.avatar || (foundAcc as any).avatarUrl || '',
          avatarUrl: foundAcc.avatar || (foundAcc as any).avatarUrl || '',
        };

        onLoginSuccess(uObj);
        onClose();
        setIdUser('');
        setPassword('');
        return;
      } else {
        setErrorMsg('Mật khẩu không chính xác!');
        return;
      }
    }

    setErrorMsg('Mật khẩu không chính xác hoặc tài khoản chưa được Admin (admin.c3nguyenquangdieu) phê duyệt!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-0 md:p-4 overflow-y-auto min-h-screen animate-fade-in">
      {/* Mobile only: Floating close button at top-right of screen (icon only) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Quay lại"
        className="fixed top-2.5 right-2.5 z-50 md:hidden w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/70 hover:bg-slate-900 text-white backdrop-blur-md border border-white/20 shadow-md transition-transform active:scale-95 cursor-pointer"
      >
        <X className="w-4 h-4 text-white stroke-[2.5]" />
      </button>

      {/* 1. Full-screen school campus photo background */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat transition-all duration-700 pointer-events-none brightness-105 contrast-[1.02]"
        style={{
          backgroundImage: `url(${campusBgImg})`,
        }}
      />
      {/* 2. Atmospheric daylight-preserving gradient overlay for optimal text & card readability */}
      <div className="fixed inset-0 bg-gradient-to-b md:bg-gradient-to-r from-slate-950/80 via-slate-950/50 to-slate-950/75 pointer-events-none" />

      {/* 3. Main Content Container:
          - On mobile:
            1. Cố định logo cách lề trên chính xác 35px
            2. Cố định dòng chữ "© PHÁT TRIỂN BỞI NGUYỄN PHÚC NGUYÊN" cách lề dưới chính xác 35px
            3. Logo cách hộp gắn nhãn "TRƯỜNG THPT NGUYỄN QUANG DIÊU" 10px
          - On desktop: 2-column layout optimized for 1366x600 screen.
      */}
      <div className="relative z-10 w-full max-w-6xl mx-auto min-h-screen min-h-[100dvh] md:min-h-0 flex flex-col justify-start md:justify-between pt-[35px] pb-[70px] md:pb-[35px] px-3 md:py-2 md:px-0 md:my-auto">
        
        {/* Main Content Area */}
        <div className="w-full flex flex-col items-center md:flex-row md:justify-between md:gap-6 lg:gap-10 md:my-auto">
          
          {/* LEFT SECTION (Desktop & Tablet only): School Logo & Comprehensive Branding */}
          <div className="hidden md:flex md:w-1/2 flex-col items-center justify-center text-center text-white px-1 sm:px-2">
            {/* Desktop School Logo: optimized size on laptop 1366x600 */}
            <div className="w-20 h-20 lg:w-28 lg:h-28 xl:w-32 xl:h-32 flex items-center justify-center shrink-0 mb-1.5 lg:mb-3 transition-transform hover:scale-105 duration-300 mx-auto">
              <img
                src={schoolLogoImg}
                alt="Logo Trường THPT Nguyễn Quang Diêu"
                className="w-full h-full object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.85)]"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Titles - Desktop & Tablet layout (optimized to fit 1366x600 screens) */}
            <h1 className="md:text-2xl lg:text-3xl xl:text-4xl font-black text-white tracking-wider uppercase drop-shadow-[0_3px_8px_rgba(0,0,0,0.95)] leading-tight text-center">
              NQDIEU LEARNING
            </h1>
            <h2 className="md:text-xs lg:text-base xl:text-lg font-black text-amber-300 tracking-wide uppercase md:mt-1 lg:mt-1.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] text-center">
              NỀN TẢNG AI HỌC TẬP TRỰC TUYẾN
            </h2>
            {/* Star Icon */}
            <div className="text-amber-300 text-xs lg:text-base my-0.5 lg:my-1 flex items-center justify-center gap-1 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              <span>★</span>
            </div>
            {/* School Name */}
            <p className="text-[11px] lg:text-sm font-black text-white tracking-wider uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] text-center">
              TRƯỜNG THPT NGUYỄN QUANG DIÊU – AN GIANG
            </p>

            {/* 2 Status Badges on Desktop */}
            <div className="grid grid-cols-2 gap-2 lg:gap-3 md:pt-2 lg:pt-3.5 w-full max-w-xs lg:max-w-md mx-auto">
              {/* Status Box 1 */}
              <div className="bg-slate-950/80 backdrop-blur-md border border-white/20 rounded-xl lg:rounded-2xl p-2 lg:p-2.5 text-center shadow-[0_6px_16px_rgba(0,0,0,0.5)]">
                <div className="text-[8.5px] lg:text-[9.5px] font-bold text-slate-300 uppercase tracking-widest">
                  TRẠNG THÁI KẾT NỐI
                </div>
                <div className="text-[11px] lg:text-xs font-black text-emerald-400 flex items-center justify-center gap-1.5 mt-0.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                  </span>
                  <span>ĐÃ ĐỒNG BỘ DỮ LIỆU</span>
                </div>
              </div>

              {/* Status Box 2 */}
              <div className="bg-slate-950/80 backdrop-blur-md border border-white/20 rounded-xl lg:rounded-2xl p-2 lg:p-2.5 text-center shadow-[0_6px_16px_rgba(0,0,0,0.5)]">
                <div className="text-[8.5px] lg:text-[9.5px] font-bold text-slate-300 uppercase tracking-widest">
                  © PHÁT TRIỂN BỞI
                </div>
                <div className="text-[11px] lg:text-xs font-black text-amber-300 tracking-wide mt-0.5">
                  NGUYỄN PHÚC NGUYÊN
                </div>
              </div>
            </div>
          </div>

          {/* MOBILE ONLY: Logo (cách lề trên 35px) + Hộp gắn nhãn (cách logo 10px) + Tiêu đề */}
          <div className="md:hidden shrink-0 flex flex-col items-center justify-center text-center text-white w-full">
            {/* 1. Logo trường trên mobile */}
            <div className="w-[84px] h-[84px] sm:w-[100px] sm:h-[100px] flex items-center justify-center mx-auto transition-transform hover:scale-105 duration-300 shrink-0">
              <img
                src={schoolLogoImg}
                alt="Logo Trường THPT Nguyễn Quang Diêu"
                className="w-full h-full object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.85)]"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* 2. logo cách hộp gắn nhãn TRƯỜNG THPT NGUYỄN QUANG DIÊU 10px */}
            <div className="mt-[10px] inline-flex items-center justify-center px-3.5 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/25 shadow-sm mx-auto shrink-0">
              <span className="text-[11px] sm:text-xs font-black text-white tracking-wider uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                TRƯỜNG THPT NGUYỄN QUANG DIÊU
              </span>
            </div>

            {/* Titles - Mobile layout */}
            <h1 className="text-lg sm:text-xl font-black text-white tracking-wider uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] leading-tight text-center mt-2">
              NQDIEU <span className="text-amber-300">LEARNING</span>
            </h1>
            <h2 className="text-[11px] sm:text-xs font-bold text-sky-200 tracking-wide uppercase mt-1 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] text-center">
              NỀN TẢNG AI HỌC TẬP TRỰC TUYẾN
            </h2>
          </div>

          {/* RIGHT SECTION: White Login Box */}
          <div className="w-full max-w-[340px] sm:max-w-[380px] md:w-[360px] lg:w-[395px] flex flex-col items-center justify-center mx-auto md:mx-0 shrink-0 mt-[20px] md:mt-0">
            <div className="w-full md:h-auto md:min-h-0 lg:h-auto lg:min-h-0 flex flex-col justify-between md:justify-start bg-white rounded-2xl md:rounded-[24px] p-4 sm:p-5 md:p-6 lg:p-7 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)] border border-slate-100/90 relative">
              {/* Top Right "Quay lại ✕" Button - desktop & tablet only (mobile uses top-right screen button) */}
              <div className="hidden md:flex justify-end mb-1 lg:mb-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[11px] sm:text-xs md:text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 transition-colors cursor-pointer px-2 py-0.5 md:px-2 md:py-0.5 rounded-lg hover:bg-slate-100"
                >
                  <span>Quay lại</span>
                  <X className="w-3.5 h-3.5 text-slate-500 hover:text-slate-800 stroke-[2.5]" />
                </button>
              </div>

          <div className="flex-1 flex flex-col justify-between md:justify-start py-0.5">
            {/* Header: Center Circular Avatar Badge + Title + Subtitle */}
            <div className="shrink-0 text-center">
              <div className="w-10 h-10 sm:w-11 sm:h-11 md:w-11 md:h-11 lg:w-12 lg:h-12 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center mx-auto mb-1 md:mb-1.5 text-[#0052a3] shadow-xs">
                {pendingSuccess || forgotSuccess ? (
                  <CheckCircle2 className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6 text-emerald-600 stroke-[2]" />
                ) : isForgotPasswordMode ? (
                  <KeyRound className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#0052a3] stroke-[2]" />
                ) : isRegisterMode ? (
                  <UserPlus className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#0052a3] stroke-[2]" />
                ) : (
                  <UserIcon className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#0052a3] stroke-[2]" />
                )}
              </div>

              {/* Heading & Subtitle */}
              <h3 className="text-base sm:text-lg md:text-xl lg:text-[22px] font-black text-[#0052a3] tracking-tight text-center uppercase leading-snug">
                {pendingSuccess
                  ? 'ĐĂNG KÝ THÀNH CÔNG'
                  : forgotSuccess
                  ? 'GỬI YÊU CẦU THÀNH CÔNG'
                  : isForgotPasswordMode
                  ? 'QUÊN MẬT KHẨU'
                  : isRegisterMode
                  ? 'ĐĂNG KÝ TÀI KHOẢN'
                  : 'ĐĂNG NHẬP'}
              </h3>
              <p className="text-[11px] sm:text-xs md:text-xs lg:text-[13px] text-slate-500 font-medium text-center mt-0.5 sm:mt-1 mb-1.5 sm:mb-2 md:mb-3 lg:mb-3.5 md:min-h-0 flex items-center justify-center px-1">
                {pendingSuccess
                  ? 'Yêu cầu của bạn đã được gửi đến Ban quản trị'
                  : forgotSuccess
                  ? 'Hệ thống đã ghi nhận yêu cầu đặt lại mật khẩu'
                  : isForgotPasswordMode
                  ? 'Điền thông tin bên dưới để gửi yêu cầu khôi phục mật khẩu'
                  : isRegisterMode
                  ? 'Điền thông tin bên dưới để gửi yêu cầu cấp tài khoản mới'
                  : 'Nhập thông tin tài khoản của bạn để truy cập'}
              </p>

              {/* Error Message */}
              {errorMsg && (
                <div className="mb-2 p-2 sm:p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs sm:text-sm flex items-start gap-1.5 animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Content Form Switcher */}
            {pendingSuccess ? (
              /* Registration Success Screen */
              <div className="flex-1 flex flex-col justify-between md:justify-start space-y-3">
                <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-2xl text-emerald-950 space-y-2.5">
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                    Yêu cầu đăng ký tài khoản đã được gửi tới Admin (<strong className="text-blue-800 font-bold">admin.c3nguyenquangdieu</strong>).
                  </p>

                  <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1.5 text-xs sm:text-sm text-slate-800 shadow-2xs">
                    <div><span className="text-slate-500 font-medium">Họ và tên:</span> <strong className="text-slate-900">{pendingSuccess.hoTen}</strong></div>
                    <div><span className="text-slate-500 font-medium">Gmail:</span> <strong className="text-blue-700 font-semibold">{pendingSuccess.email}</strong></div>
                    <div><span className="text-slate-500 font-medium">Vai trò:</span> <strong className="text-slate-900">{pendingSuccess.role === 'TEACHER' ? 'Giáo Viên' : 'Học Sinh'}</strong></div>
                    <div><span className="text-slate-500 font-medium">{pendingSuccess.role === 'TEACHER' ? 'Tổ:' : 'Lớp:'}</span> <strong className="text-slate-900">{pendingSuccess.chiDoan}</strong></div>
                  </div>

                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <Mail className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      Tài khoản (ID) và MK do Admin cấp sẽ gửi về Gmail: <strong>{pendingSuccess.email}</strong> khi được duyệt.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPendingSuccess(null);
                    setIsRegisterMode(false);
                  }}
                  className="w-full py-2.5 sm:py-3 bg-[#0052a3] hover:bg-[#003d7a] text-white font-extrabold rounded-xl md:rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer active:scale-[0.98] mt-auto md:mt-3"
                >
                  Trở về Đăng nhập
                </button>
              </div>
            ) : forgotSuccess ? (
              /* Forgot Password Request Success Screen */
              <div className="flex-1 flex flex-col justify-between md:justify-start space-y-3">
                <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-2xl text-emerald-950 space-y-2.5">
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                    Yêu cầu reset MK cho tài khoản <strong className="text-blue-800 font-bold">{forgotSuccess.idUser}</strong> {forgotSuccess.hoTen ? `(${forgotSuccess.hoTen})` : ''} đã được gửi.
                  </p>

                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <KeyRound className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      Khi được duyệt, mật khẩu sẽ được khôi phục về mặc định: <strong className="text-rose-700 font-mono font-bold">123</strong>.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setForgotSuccess(null);
                    setIsForgotPasswordMode(false);
                    setIsRegisterMode(false);
                  }}
                  className="w-full py-2.5 sm:py-3 bg-[#0052a3] hover:bg-[#003d7a] text-white font-extrabold rounded-xl md:rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer active:scale-[0.98] mt-auto md:mt-3"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Trở về Đăng nhập
                </button>
              </div>
            ) : isForgotPasswordMode ? (
              /* Forgot Password Request Form */
              <form onSubmit={handleForgotPasswordSubmit} className="flex-1 flex flex-col justify-between md:justify-start">
                <div className="space-y-2 sm:space-y-2.5 md:space-y-3 lg:space-y-3.5">
                  <div>
                    <label className="block text-[11px] sm:text-xs md:text-xs lg:text-[13px] font-bold text-slate-800 mb-0.5 sm:mb-1 md:mb-1.5">
                      Tên đăng nhập (Username) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 absolute left-2.5 sm:left-3 md:left-3.5 pointer-events-none stroke-[1.8]" />
                      <input
                        type="text"
                        required
                        value={forgotIdUser}
                        onChange={(e) => setForgotIdUser(e.target.value)}
                        placeholder="Nhập tên đăng nhập cần đặt lại..."
                        className="w-full pl-8 sm:pl-9 md:pl-10 pr-3 sm:pr-3.5 py-1.5 sm:py-2 md:py-2 lg:py-2.5 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0052a3] transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] sm:text-xs md:text-xs lg:text-[13px] font-bold text-slate-800 mb-0.5 sm:mb-1 md:mb-1.5">
                      Trình bày lý do:
                    </label>
                    <input
                      type="text"
                      value={forgotNote}
                      onChange={(e) => setForgotNote(e.target.value)}
                      placeholder="Ví dụ: Em bị quên mật khẩu..."
                      className="w-full px-3 sm:px-3.5 py-1.5 sm:py-2 md:py-2 lg:py-2.5 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0052a3] transition-all shadow-2xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 sm:space-y-2 md:space-y-2.5 pt-1.5 md:pt-0 mt-auto md:mt-4 lg:mt-5">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 sm:py-2 md:py-2.5 lg:py-2.5 bg-[#0052a3] hover:bg-[#003d7a] text-white font-extrabold rounded-xl md:rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-[13.5px] lg:text-sm tracking-wide disabled:opacity-50 cursor-pointer active:scale-[0.98]"
                  >
                    {loading ? (
                      <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>Gửi yêu cầu</span>
                      </>
                    )}
                  </button>

                  <div className="pt-1.5 sm:pt-2 md:pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] sm:text-xs md:text-xs lg:text-[13px]">
                    <span className="text-slate-500 font-medium">Nhớ mật khẩu?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPasswordMode(false);
                        setErrorMsg('');
                      }}
                      className="text-[#0052a3] hover:text-[#003d7a] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Đăng nhập</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : isRegisterMode ? (
              /* Registration Form */
              <form onSubmit={handleRegisterSubmit} className="flex-1 flex flex-col justify-between md:justify-start">
                <div className="space-y-1.5 sm:space-y-2 md:space-y-2 lg:space-y-2.5">
                  <div>
                    <label className="block text-[11px] sm:text-xs md:text-xs lg:text-[13px] font-bold text-slate-800 mb-0.5 sm:mb-1 md:mb-1">
                      Họ và tên <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 absolute left-2.5 sm:left-3 md:left-3.5 pointer-events-none stroke-[1.8]" />
                      <input
                        type="text"
                        required
                        value={hoTen}
                        onChange={(e) => setHoTen(e.target.value)}
                        placeholder="Ví dụ: Nguyễn Văn An"
                        className="w-full pl-8 sm:pl-9 md:pl-10 pr-3 sm:pr-3.5 py-1.5 sm:py-2 md:py-2 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0052a3] transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] sm:text-xs md:text-xs lg:text-[13px] font-bold text-slate-800 mb-0.5 sm:mb-1 md:mb-1">
                      Địa chỉ Gmail <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 absolute left-2.5 sm:left-3 md:left-3.5 pointer-events-none stroke-[1.8]" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nguyenvana@gmail.com"
                        className="w-full pl-8 sm:pl-9 md:pl-10 pr-3 sm:pr-3.5 py-1.5 sm:py-2 md:py-2 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0052a3] transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] sm:text-xs font-bold text-slate-800 mb-0.5 sm:mb-1">
                        Vai trò
                      </label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as any)}
                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 md:py-2 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0052a3] transition-all shadow-2xs"
                      >
                        <option value="STUDENT">Học sinh</option>
                        <option value="TEACHER">Giáo viên</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] sm:text-xs font-bold text-slate-800 mb-0.5 sm:mb-1">
                        {role === 'TEACHER' ? 'Tổ chuyên môn' : 'Lớp học'}
                      </label>
                      <input
                        type="text"
                        value={chiDoan}
                        onChange={(e) => setChiDoan(e.target.value)}
                        placeholder={role === 'TEACHER' ? 'Tổ Lí' : '10A1'}
                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 md:py-2 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0052a3] transition-all shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 sm:space-y-2 md:space-y-2 pt-1.5 md:pt-0 mt-auto md:mt-3 lg:mt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 sm:py-2 md:py-2.5 bg-[#0052a3] hover:bg-[#003d7a] text-white font-extrabold rounded-xl md:rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm tracking-wide disabled:opacity-50 cursor-pointer active:scale-[0.98]"
                  >
                    {loading ? (
                      <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>Đăng ký</span>
                      </>
                    )}
                  </button>

                  <div className="pt-1.5 sm:pt-2 md:pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] sm:text-xs md:text-[13px]">
                    <span className="text-slate-500 font-medium">Đã có tài khoản?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterMode(false);
                        setErrorMsg('');
                      }}
                      className="text-[#0052a3] hover:text-[#003d7a] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Đăng nhập</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              /* Standard Login Form strictly matching the User's Image */
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between md:justify-start">
                <div className="space-y-2 sm:space-y-2.5 md:space-y-3 lg:space-y-3.5">
                  {/* Field 1: Username */}
                  <div>
                    <label className="block text-[11px] sm:text-xs md:text-xs lg:text-[13px] font-bold text-slate-800 mb-0.5 sm:mb-1 md:mb-1.5">
                      Tên đăng nhập (Username):
                    </label>
                    <div className="relative flex items-center">
                      <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 absolute left-2.5 sm:left-3 md:left-3.5 pointer-events-none stroke-[1.8]" />
                      <input
                        type="text"
                        required
                        value={idUser}
                        onChange={(e) => setIdUser(e.target.value)}
                        placeholder="Nhập tên đăng nhập"
                        className="w-full pl-8 sm:pl-9 md:pl-10 pr-3 sm:pr-3.5 py-1.5 sm:py-2 md:py-2 lg:py-2.5 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0052a3] transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Field 2: Password */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5 sm:mb-1 md:mb-1.5">
                      <label className="block text-[11px] sm:text-xs md:text-xs lg:text-[13px] font-bold text-slate-800">
                        Mật khẩu (Password):
                      </label>
                      <span className="text-[10px] sm:text-xs text-slate-400 font-medium">
                        Chỉ nhập số
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 absolute left-2.5 sm:left-3 md:left-3.5 pointer-events-none stroke-[1.8]" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
                        placeholder="Nhập mật khẩu bằng số"
                        className="w-full pl-8 sm:pl-9 md:pl-10 pr-8 sm:pr-9 md:pr-10 py-1.5 sm:py-2 md:py-2 lg:py-2.5 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0052a3] transition-all shadow-2xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 sm:right-3 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
                        title={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Submit Action Button & Quick Helper Links pinned to bottom */}
                <div className="space-y-1.5 sm:space-y-2 md:space-y-2.5 pt-1.5 md:pt-0 mt-auto md:mt-4 lg:mt-5">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 sm:py-2 md:py-2.5 lg:py-2.5 bg-[#0052a3] hover:bg-[#003d7a] text-white font-extrabold text-xs sm:text-sm md:text-[13.5px] lg:text-sm rounded-xl md:rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 sm:gap-2 tracking-wide disabled:opacity-50 cursor-pointer active:scale-[0.99]"
                  >
                    {loading ? (
                      <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                        <span>Đăng nhập</span>
                      </>
                    )}
                  </button>

                  {/* Quên mật khẩu căn giữa giữa nút đăng nhập và đăng ký ngay */}
                  <div className="flex justify-center md:pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPasswordMode(true);
                        setErrorMsg('');
                      }}
                      className="text-[11px] sm:text-xs md:text-xs lg:text-[12.5px] text-slate-500 hover:text-[#0052a3] font-semibold hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Key className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 stroke-[2]" />
                      <span>Quên mật khẩu?</span>
                    </button>
                  </div>

                  {/* Hàng đăng ký: bên trái ngang đăng ký ngay để nội dung "Chưa có tài khoản?" */}
                  <div className="pt-1.5 sm:pt-2 md:pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] sm:text-xs md:text-xs lg:text-[12.5px]">
                    <span className="text-slate-500 font-medium">Chưa có tài khoản?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterMode(true);
                        setErrorMsg('');
                      }}
                      className="text-[#0052a3] hover:text-[#003d7a] font-bold hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0052a3] stroke-[3]" />
                      <span>Đăng ký ngay</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>

        {/* Mobile only: "© PHÁT TRIỂN BỞI NGUYỄN PHÚC NGUYÊN" cố định cách lề dưới chính xác 35px */}
        <div className="md:hidden fixed bottom-[35px] left-0 right-0 z-20 text-center mx-auto text-slate-300 text-xs sm:text-[13px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] select-none pointer-events-none">
          <span>© PHÁT TRIỂN BỞI </span>
          <span className="font-black text-amber-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
            NGUYỄN PHÚC NGUYÊN
          </span>
        </div>

  </div>
</div>
);
};
