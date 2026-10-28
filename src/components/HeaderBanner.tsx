import React from 'react';
import { User } from '../types';
import { LogIn, LogOut, Key, UserCheck, Shield, Wifi, WifiOff, RefreshCw, GraduationCap, Award, Bell, Megaphone } from 'lucide-react';
import schoolLogo from '../assets/logo';

interface HeaderBannerProps {
  currentUser: User | null;
  onOpenLogin: () => void;
  onOpenChangePass: () => void;
  onOpenAccountsModal?: () => void;
  onOpenAchievementsModal?: () => void;
  onOpenNotificationsModal?: () => void;
  unreadNotificationCount?: number;
  onLogout: () => void;
  isServerConnected?: boolean;
  isTeacherTestingMode?: boolean;
  onToggleTeacherTestingMode?: () => void;
  onManualSync?: () => void;
  isSyncing?: boolean;
}

export const HeaderBanner: React.FC<HeaderBannerProps> = ({
  currentUser,
  onOpenLogin,
  onOpenChangePass,
  onOpenAccountsModal,
  onOpenAchievementsModal,
  onOpenNotificationsModal,
  unreadNotificationCount = 0,
  onLogout,
  isServerConnected = true,
  isTeacherTestingMode = false,
  onToggleTeacherTestingMode,
  onManualSync,
  isSyncing = false,
}) => {
  const getUserAvatar = (name: string, idUser?: string) => {
    if (!name && !idUser) return 'U';
    const target = (name || idUser || '').trim();
    const words = target.split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return target.substring(0, 2).toUpperCase();
  };

  const getRolePill = () => {
    if (!currentUser) return null;
    const role = currentUser.role;
    if (isTeacherTestingMode) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/40">
          <GraduationCap className="w-3.5 h-3.5 text-amber-300" />
          Thử nghiệm
        </span>
      );
    }
    if (role === 'ADMIN') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/40">
          <Shield className="w-3.5 h-3.5 text-amber-300" />
          Admin
        </span>
      );
    }
    if (role === 'TEACHER') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/40">
          <UserCheck className="w-3.5 h-3.5 text-blue-300" />
          Giáo viên
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
        Học sinh ({currentUser.chiDoan || 'Lớp'})
      </span>
    );
  };

  return (
    <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white shadow-md border-b border-blue-700/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 sm:p-2 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner shrink-0">
              <img
                src={schoolLogo}
                alt="Logo Trường THPT Nguyễn Quang Diêu"
                className="w-9 h-9 sm:w-10 sm:h-10 object-contain rounded-full bg-white p-0.5 shadow-sm"
                referrerPolicy="no-referrer"
                onError={(e) => { (e.target as HTMLImageElement).src = './logo.png'; }}
              />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>NQDIEU</span>
                <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent drop-shadow-xs font-black">
                  LEARNING
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-blue-200/90 font-medium tracking-wide">
                NỀN TẢNG AI HỌC TẬP TRỰC TUYẾN
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2.5">
            {/* 1. Dedicated Connection & Sync Capsule */}
            <div
              className={`h-11 bg-white/10 px-1.5 rounded-2xl backdrop-blur-md border border-white/20 shadow-md items-center gap-1.5 ${
                !currentUser ? 'hidden sm:flex' : 'flex'
              }`}
            >
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isServerConnected
                    ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                    : 'bg-rose-500/20 border border-rose-400/40 text-rose-300'
                }`}
                title={
                  isServerConnected
                    ? 'Đã kết nối máy chủ (Connect)'
                    : 'Ngoại tuyến / Chưa kết nối máy chủ (Disconnect)'
                }
              >
                <span className="relative flex h-2 w-2">
                  {isServerConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isServerConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                </span>
                {isServerConnected ? (
                  <Wifi className="w-4 h-4 text-emerald-300" />
                ) : (
                  <WifiOff className="w-4 h-4 text-rose-300" />
                )}
              </div>

              {currentUser && onManualSync && (
                <button
                  type="button"
                  onClick={onManualSync}
                  disabled={isSyncing}
                  className="h-8 w-8 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs transition-all duration-200 border border-emerald-400/40 shadow-xs hover:shadow-md hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center group shrink-0"
                  title={isSyncing ? "Đang đồng bộ dữ liệu với máy chủ Supabase..." : "Đồng bộ dữ liệu ngay lên Supabase"}
                  aria-label="Đồng bộ dữ liệu"
                >
                  <RefreshCw className={`w-3.5 h-3.5 transition-transform duration-300 ${isSyncing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
                </button>
              )}
            </div>

            {currentUser ? (
              <>
                {/* 2. Notification Button */}
                {onOpenNotificationsModal && (
                  <button
                    onClick={onOpenNotificationsModal}
                    className={`h-11 w-11 relative bg-white/10 hover:bg-sky-400 hover:text-slate-950 backdrop-blur-md border border-white/20 hover:border-sky-300 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 cursor-pointer shrink-0 group ${
                      unreadNotificationCount > 0
                        ? 'ring-2 ring-amber-400/60 bg-amber-500/20'
                        : ''
                    }`}
                    title={unreadNotificationCount > 0 ? `Có ${unreadNotificationCount} thông báo mới!` : "Thông báo của tôi"}
                  >
                    <Bell className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${unreadNotificationCount > 0 ? 'text-amber-300 animate-bounce' : 'text-white group-hover:text-slate-950'}`} />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-600 text-white border border-white/80 shadow-xs animate-pulse">
                        {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                      </span>
                    )}
                  </button>
                )}

                {/* 3. Achievements Button (for real students only, hidden in teacher testing mode) */}
                {currentUser?.role === 'STUDENT' && !isTeacherTestingMode && onOpenAchievementsModal && (
                  <button
                    onClick={onOpenAchievementsModal}
                    className="h-11 w-11 bg-white/10 hover:bg-amber-400 text-amber-300 hover:text-slate-950 backdrop-blur-md border border-white/20 hover:border-amber-300 rounded-2xl flex items-center justify-center shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 active:scale-95 cursor-pointer shrink-0 group"
                    title="Xem Tiến độ học tập, Danh hiệu & Giấy chứng nhận"
                  >
                    <Award className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                  </button>
                )}

                {/* 4. User Profile Capsule */}
                <div className="h-11 bg-white/10 backdrop-blur-md border border-white/20 px-3.5 rounded-2xl flex items-center gap-2.5 shadow-md shrink-0">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 text-white font-black text-xs flex items-center justify-center shadow-xs border border-white/30 shrink-0">
                    {getUserAvatar(currentUser.hoTen, currentUser.idUser)}
                  </div>
                  <span className="text-sm font-bold text-white tracking-wide whitespace-nowrap">
                    {currentUser.hoTen}
                  </span>
                  {getRolePill()}
                </div>

                {/* 5. Change Password Button */}
                <button
                  onClick={onOpenChangePass}
                  className="h-11 w-11 bg-white/10 hover:bg-amber-400 text-amber-300 hover:text-slate-950 backdrop-blur-md border border-white/20 hover:border-amber-300 rounded-2xl flex items-center justify-center shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 active:scale-95 cursor-pointer shrink-0 group"
                  title="Đổi mật khẩu"
                >
                  <Key className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                </button>

                {/* 6. Logout Button */}
                <button
                  onClick={onLogout}
                  className="h-11 w-11 bg-white/10 hover:bg-rose-500 text-rose-200 hover:text-white backdrop-blur-md border border-white/20 hover:border-rose-400 rounded-2xl flex items-center justify-center shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 active:scale-95 cursor-pointer shrink-0 group"
                  title="Đăng xuất"
                >
                  <LogOut className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                </button>
              </>
            ) : (
              <button
                onClick={onOpenLogin}
                className="h-11 inline-flex items-center gap-2 px-5 rounded-2xl bg-white text-blue-900 hover:bg-blue-50 font-bold text-sm transition-all shadow-md hover:shadow-lg active:scale-95 cursor-pointer border border-white/40 shrink-0"
              >
                <LogIn className="w-4 h-4 text-blue-700" />
                Đăng nhập
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
