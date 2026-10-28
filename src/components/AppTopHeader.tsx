import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types';
import schoolLogo from '../assets/logo';
import {
  Menu,
  User as UserIcon,
  ChevronDown,
  Wifi,
  WifiOff,
  RefreshCw,
  Bell,
  LogIn,
  LogOut,
  Key,
  Award,
  Database,
  Cloud,
} from 'lucide-react';

interface AppTopHeaderProps {
  currentUser: User | null;
  onOpenLogin: () => void;
  onOpenChangePass: () => void;
  onOpenProfileUpdate?: () => void;
  onOpenAchievements?: () => void;
  onOpenNotifications: () => void;
  unreadNotificationCount?: number;
  onLogout: () => void;
  isServerConnected?: boolean;
  isGoogleSheetsConnected?: boolean;
  onOpenDataManagement?: () => void;
  onManualSync?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string;
  onToggleSidebarMobile: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebarCollapse?: () => void;
  isTeacherTestingMode?: boolean;
  onToggleTeacherTestingMode?: () => void;
}

export const AppTopHeader: React.FC<AppTopHeaderProps> = ({
  currentUser,
  onOpenLogin,
  onOpenChangePass,
  onOpenProfileUpdate,
  onOpenAchievements,
  onOpenNotifications,
  unreadNotificationCount = 0,
  onLogout,
  isServerConnected = true,
  isGoogleSheetsConnected = true,
  onOpenDataManagement,
  onManualSync,
  isSyncing = false,
  lastSyncTime,
  onToggleSidebarMobile,
  isSidebarCollapsed: _isSidebarCollapsed,
  onToggleSidebarCollapse: _onToggleSidebarCollapse,
  isTeacherTestingMode = false,
  onToggleTeacherTestingMode,
}) => {
    const [isMobileAvatarMenuOpen, setIsMobileAvatarMenuOpen] = useState(false);
  const mobileAvatarMenuRef = useRef<HTMLDivElement>(null);

  // Close mobile avatar dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mobileAvatarMenuRef.current &&
        !mobileAvatarMenuRef.current.contains(event.target as Node)
      ) {
        setIsMobileAvatarMenuOpen(false);
      }
    };
    if (isMobileAvatarMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMobileAvatarMenuOpen]);

  const getUserAvatar = (name: string, idUser?: string) => {
    if (!name && !idUser) return 'U';
    const target = (name || idUser || '').trim();
    const words = target.split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return target.substring(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-30 bg-[#0B4D9C] text-white shadow-md border-b border-blue-900/50 px-4 sm:px-8 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 w-full">
        {/* Left Side: Toggle menu buttons when logged in, or School Logo + 2 branding lines when not logged in */}
        <div className="flex items-center gap-3 min-w-0">
          {currentUser ? (
            <>
              {/* Mobile Hamburger */}
              <button
                type="button"
                onClick={onToggleSidebarMobile}
                className="lg:hidden h-10 w-10 rounded-xl bg-white/10 hover:bg-white text-white hover:text-[#0B4D9C] flex items-center justify-center border border-white/20 hover:border-white shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer shrink-0 group active:scale-95"
                title="Mở menu điều hướng"
              >
                <Menu className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
              </button>

              {/* Auto Sync Real-time Status & Last Updated - Hidden on Smartphone (<sm), Visible on Tablet & Desktop (sm+) */}
              <div className="hidden sm:flex items-center gap-2.5 sm:gap-4 text-xs sm:text-sm pl-1 sm:pl-2 select-none">
                <div className="flex items-center gap-1.5 font-bold tracking-wide">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-xs" />
                  </span>
                  <span className="text-[#00E5A3] font-bold text-xs sm:text-sm tracking-wide">
                    TỰ ĐỘNG LƯU: REAL-TIME
                  </span>
                </div>
                <div className="text-blue-100/90 font-medium text-xs sm:text-sm whitespace-nowrap">
                  Đồng bộ lúc: {lastSyncTime || '--:--'}
                </div>
              </div>
            </>
          ) : (
            /* Branding for Public / Non-logged in Users: logo.png + 2 lines */
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="p-1.5 sm:p-2 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner shrink-0">
                <img
                  src={schoolLogo}
                  alt="Logo Trường THPT Nguyễn Quang Diêu"
                  className="w-8 h-8 sm:w-10 sm:h-10 object-contain rounded-full bg-white p-0.5 shadow-sm"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/logo.png';
                  }}
                />
              </div>
              <div className="min-w-0 flex flex-col justify-center">
                {/* Desktop & Tablet: Single line title + school subtitle */}
                <div className="hidden sm:flex font-black text-base md:text-lg tracking-tight leading-tight items-center gap-1.5 flex-nowrap">
                  <span className="text-white font-black">NQDIEU</span>
                  <span className="text-amber-300 font-black">LEARNING</span>
                </div>
                <p className="hidden sm:block text-[10px] sm:text-[11px] md:text-xs font-bold text-blue-100/95 uppercase tracking-wide leading-tight truncate">
                  NỀN TẢNG AI HỌC TẬP TRỰC TUYẾN CỦA TRƯỜNG THPT NGUYỄN QUANG DIÊU
                </p>

                {/* Smartphone: 2 lines: Line 1 (NQDIEU LEARNING) + Line 2 (HỌC TẬP TRỰC TUYẾN) */}
                <div className="sm:hidden flex flex-col justify-center leading-tight">
                  <div className="flex items-center gap-1.5 flex-nowrap leading-none mb-0.5">
                    <span className="text-white font-black text-[15px] tracking-tight uppercase drop-shadow-xs">
                      NQDIEU
                    </span>
                    <span className="text-amber-300 font-black text-[15px] tracking-tight uppercase drop-shadow-xs">
                      LEARNING
                    </span>
                  </div>
                  <p className="text-[9.5px] font-semibold text-slate-200/90 uppercase tracking-wide leading-none truncate">
                    AI HỌC TẬP TRỰC TUYẾN
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Connect status, Notifications (only when logged in), Account or Login */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* 1. Dedicated Cloud Database Connection & Sync Capsule (h-10) - Hidden on mobile if not logged in */}
          <div
            className={`h-10 px-2 sm:px-2.5 items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl shadow-xs shrink-0 select-none ${
              !currentUser ? 'hidden sm:flex' : 'flex'
            }`}
          >
            <div
              onClick={currentUser?.role === 'ADMIN' && onOpenDataManagement ? onOpenDataManagement : undefined}
              className={`h-7 px-2 inline-flex items-center gap-1.5 rounded-lg text-xs font-bold transition-all ${
                currentUser?.role === 'ADMIN' && onOpenDataManagement
                  ? 'cursor-pointer hover:brightness-110 active:scale-95'
                  : 'cursor-default'
              } ${
                isGoogleSheetsConnected
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-amber-500/25 text-amber-200 border border-amber-400/30'
              }`}
              title={
                isGoogleSheetsConnected
                  ? 'Đã kết nối Supabase Cloud Database (Online)'
                  : 'Chưa kết nối Supabase Cloud (Offline/Cục bộ)'
              }
            >
              <span className="relative flex h-2 w-2">
                {isGoogleSheetsConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isGoogleSheetsConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              </span>
              {isGoogleSheetsConnected ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-200 shrink-0" />
              )}
            </div>

            {currentUser && onManualSync && (
              <button
                type="button"
                onClick={onManualSync}
                disabled={isSyncing}
                className="h-8 w-8 flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-xs hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 cursor-pointer border border-emerald-400/40 shrink-0 group"
                title={isSyncing ? 'Đang đồng bộ dữ liệu với máy chủ Supabase...' : 'Đồng bộ dữ liệu ngay lên Supabase'}
                aria-label="Đồng bộ dữ liệu"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 transition-transform duration-300 ${
                    isSyncing ? 'animate-spin' : 'group-hover:rotate-180'
                  }`}
                />
              </button>
            )}
          </div>

          {/* 2. Notifications Bell Button (h-10 w-10) - ONLY SHOWN WHEN LOGGED IN */}
          {currentUser && (
            <button
              type="button"
              onClick={onOpenNotifications}
              className="relative h-10 w-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-sky-400 text-white hover:text-slate-950 border border-white/20 hover:border-sky-300 shadow-xs hover:shadow-md hover:scale-105 transition-all duration-200 cursor-pointer shrink-0 group active:scale-95"
              title="Thông báo"
            >
              <Bell className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4.5 px-1 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-bounce shadow-md border border-white">
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              )}
            </button>
          )}

          {/* 3. User Profile Capsule + Quick Action Buttons (h-10) */}
          {currentUser ? (
            <>
              {/* MOBILE ONLY (< sm): Avatar Box click to open Dropdown with 3 options: Cập nhật hồ sơ, Đổi mật khẩu, Đăng xuất */}
              <div ref={mobileAvatarMenuRef} className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setIsMobileAvatarMenuOpen((prev) => !prev)}
                  className="h-10 px-2 flex items-center gap-1.5 bg-white/15 hover:bg-white/25 active:bg-white/30 border border-white/30 rounded-xl select-none shrink-0 cursor-pointer transition-all duration-200 shadow-xs active:scale-95 group"
                  title="Menu tài khoản"
                  aria-expanded={isMobileAvatarMenuOpen}
                >
                  <div className="w-7 h-7 rounded-full aspect-square bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs shrink-0 overflow-hidden ring-2 ring-white/50 group-hover:ring-amber-300">
                    {currentUser.avatar || currentUser.avatarUrl ? (
                      <img
                        src={currentUser.avatar || currentUser.avatarUrl}
                        alt={currentUser.hoTen || currentUser.fullName || currentUser.idUser}
                        className="w-full h-full object-cover rounded-full aspect-square"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      getUserAvatar(currentUser.hoTen || currentUser.fullName || '', currentUser.idUser)
                    )}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-white/80 transition-transform duration-200 ${isMobileAvatarMenuOpen ? 'rotate-180 text-amber-300' : ''}`} />
                </button>

                {/* Mobile Dropdown Menu with 3 buttons */}
                {isMobileAvatarMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700/90 rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* User header info */}
                    <div className="px-3 py-2 border-b border-slate-800 mb-1">
                      <p className="text-xs font-bold text-white truncate">
                        {currentUser.hoTen || currentUser.fullName || currentUser.idUser}
                      </p>
                      <p className="text-[11px] text-amber-300 font-semibold truncate mt-0.5">
                        {currentUser.role === 'ADMIN'
                          ? 'Quản trị viên'
                          : currentUser.role === 'TEACHER'
                          ? 'Giáo viên'
                          : `Học sinh ${currentUser.chiDoan || ''}`}
                      </p>
                    </div>

                    {/* 1. Nút Cập nhật hồ sơ */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileAvatarMenuOpen(false);
                        if (onOpenProfileUpdate) onOpenProfileUpdate();
                      }}
                      className="w-full px-3 py-2.5 text-xs font-bold text-slate-200 hover:text-white hover:bg-blue-600/30 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                    >
                      <UserIcon className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>Cập nhật hồ sơ</span>
                    </button>

                    {/* 2. Nút Đổi mật khẩu */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileAvatarMenuOpen(false);
                        onOpenChangePass();
                      }}
                      className="w-full px-3 py-2.5 text-xs font-bold text-slate-200 hover:text-white hover:bg-amber-600/30 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                    >
                      <Key className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Đổi mật khẩu</span>
                    </button>

                    {/* 3. Nút Đăng xuất */}
                    <div className="pt-1 mt-1 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setIsMobileAvatarMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full px-3 py-2.5 text-xs font-bold text-rose-300 hover:text-white hover:bg-rose-600/40 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                      >
                        <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Đăng xuất</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* DESKTOP & TABLET (sm+): Giữ nguyên giao diện đầy đủ */}
              {/* Account Profile Box - Click to open "Cập nhật hồ sơ" Modal */}
              <button
                type="button"
                id="header-user-profile-btn"
                onClick={onOpenProfileUpdate}
                className="hidden sm:flex h-10 px-3.5 items-center gap-2.5 bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/20 hover:border-white/40 rounded-xl select-none shrink-0 cursor-pointer transition-all duration-200 shadow-xs hover:shadow-md hover:scale-102 group text-left"
                title="Thông tin hồ sơ tài khoản"
              >
                <div className="w-7 h-7 rounded-full aspect-square bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs shrink-0 overflow-hidden ring-2 ring-white/40 group-hover:ring-amber-300">
                  {currentUser.avatar || currentUser.avatarUrl ? (
                    <img
                      src={currentUser.avatar || currentUser.avatarUrl}
                      alt={currentUser.hoTen || currentUser.fullName || currentUser.idUser}
                      className="w-full h-full object-cover rounded-full aspect-square"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    getUserAvatar(currentUser.hoTen || currentUser.fullName || '', currentUser.idUser)
                  )}
                </div>
                <div className="text-left whitespace-nowrap">
                  <p className="text-xs font-bold text-white group-hover:text-amber-200 leading-tight transition-colors">
                    {currentUser.hoTen || currentUser.fullName || currentUser.idUser}
                  </p>
                  <span className="text-[10px] text-amber-300 font-semibold block leading-tight mt-0.5">
                    {currentUser.role === 'ADMIN'
                      ? 'Quản trị viên'
                      : currentUser.role === 'TEACHER'
                      ? 'Giáo viên'
                      : `Học sinh ${currentUser.chiDoan || ''}`}
                  </span>
                </div>
              </button>

              {/* Change Password Button (Desktop & Tablet only, sm:flex) */}
              <button
                type="button"
                onClick={onOpenChangePass}
                className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border border-white/20 hover:border-amber-300 shadow-xs hover:shadow-md hover:scale-105 transition-all duration-200 cursor-pointer shrink-0 group active:scale-95"
                title="Đổi mật khẩu"
              >
                <Key className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-12" />
              </button>

              {/* Logout Button (Desktop & Tablet only, sm:flex) */}
              <button
                type="button"
                onClick={onLogout}
                className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-rose-500 text-rose-200 hover:text-white border border-white/20 hover:border-rose-400 shadow-xs hover:shadow-md hover:scale-105 transition-all duration-200 cursor-pointer shrink-0 group active:scale-95"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:translate-x-0.5" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {/* Modern Crisp White/Blue Login Button (h-10) */}
              <button
                type="button"
                onClick={onOpenLogin}
                className="h-10 px-4.5 flex items-center gap-2 bg-white hover:bg-blue-50 text-[#0B4D9C] font-bold text-xs sm:text-sm rounded-xl shadow-md border border-white/80 transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <LogIn className="w-4 h-4 text-[#0B4D9C]" />
                <span>Đăng nhập</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
