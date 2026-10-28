import React, { useState, useEffect } from 'react';
import { User } from '../types';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Megaphone,
  BarChart3,
  Sparkles,
  RefreshCw,
  Trash2,
  BookOpen,
  Award,
  GraduationCap,
  LogIn,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shield,
  UserCheck,
  BookCheck,
  Layers,
  Globe,
  Briefcase,
  Trophy,
  Gamepad2,
} from 'lucide-react';
import schoolLogo from '../assets/logo';

export type SidebarTabId =
  | 'overview'
  | 'manageCourses'
  | 'qa'
  | 'notifications'
  | 'reports'
  | 'testingMode'
  | 'ai'
  | 'admin'
  | 'accounts'
  | 'server'
  | 'adminData'
  | 'createCourse'
  | 'myCourses'
  | 'allCourses'
  | 'achievements'
  | 'leaderboard'
  | 'games';

interface AppSidebarProps {
  activeTab: SidebarTabId;
  onSelectTab: (tabId: SidebarTabId) => void;
  currentUser: User | null;
  isTeacherTestingMode?: boolean;
  pendingCounts: {
    totalPending: number;
    pendingReset: number;
    pendingReg: number;
    pendingQa: number;
    unreadNotif: number;
  };
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenLogin: () => void;
  onOpenProfileUpdate?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeTab,
  onSelectTab,
  currentUser,
  isTeacherTestingMode = false,
  pendingCounts,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  onOpenLogin,
  onOpenProfileUpdate,
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isTeacher = currentUser?.role === 'TEACHER';
  const isStudent = currentUser?.role === 'STUDENT';
  const isGuest = !currentUser;

  const isAdminTabActive =
    activeTab === 'admin' || activeTab === 'accounts' || activeTab === 'server' || activeTab === 'adminData';

  const handleTabClick = (tabId: SidebarTabId) => {
    onSelectTab(tabId);
    if (isMobileOpen) {
      onCloseMobile();
    }
  };

  // Profile Information calculations for bottom card (Matching Image 2)
  const avatarInitials = (() => {
    if (!currentUser) return 'AD';
    if (isAdmin) return 'AD';
    if (currentUser.hoTen) {
      const parts = String(currentUser.hoTen || '').trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return String(currentUser.hoTen).slice(0, 2).toUpperCase();
    }
    return isTeacher ? 'GV' : 'HS';
  })();

  const avatarUrl = currentUser?.avatar || currentUser?.avatarUrl || '';

  const displayName = (() => {
    if (!currentUser) return 'QUẢN TRỊ VIÊN';
    if (isAdmin) {
      return currentUser.hoTen && currentUser.hoTen.toLowerCase() !== 'admin'
        ? currentUser.hoTen.toUpperCase()
        : 'QUẢN TRỊ VIÊN';
    }
    if (currentUser.hoTen) return currentUser.hoTen.toUpperCase();
    return isTeacher ? 'GIÁO VIÊN' : 'HỌC SINH';
  })();

  const roleSubtitle = (() => {
    if (!currentUser) return 'QUẢN TRỊ VIÊN';
    if (isAdmin) return 'QUẢN TRỊ VIÊN';
    if (isTeacher) return 'GIÁO VIÊN';
    return 'HỌC SINH';
  })();

  const positionLabel = (() => {
    if (isStudent) return 'Lớp';
    if (isTeacher) return 'Tổ chuyên môn';
    return isAdmin ? 'Chức vụ' : 'Tổ chuyên môn';
  })();

  // Chức vụ = Lớp (đối với học sinh) = tổ chuyên môn (đối với giáo viên) = BCH Đoàn trường (đối với admin)
  const positionValue = (() => {
    if (!currentUser) return 'BCH Đoàn trường';
    if (isAdmin) {
      return currentUser.chiDoan || 'BCH Đoàn trường';
    }
    if (isTeacher) {
      return currentUser.chiDoan || 'Tổ chuyên môn';
    }
    return currentUser.chiDoan || '12A1';
  })();

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col justify-between bg-gradient-to-b from-[#0B4D9C] via-[#094285] to-[#073368] text-white transition-all duration-300 shadow-2xl border-r border-blue-900/40 ${
          isMobileOpen ? 'translate-x-0 w-64 sm:w-72' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-20' : 'lg:w-64 xl:w-72'}`}
      >
        {/* Nút thu gọn / mở rộng thanh bên nằm giữa thanh bên và thanh đầu trang */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:flex absolute right-0 translate-x-1/2 top-3.5 z-50 w-7 h-7 rounded-full bg-white text-[#0B4D9C] border border-blue-200/90 shadow-md hover:shadow-lg hover:bg-blue-50 items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110 active:scale-95 group select-none"
          title={isCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
          aria-label={isCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-[#0B4D9C] transition-transform duration-200 group-hover:translate-x-0.5" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-[#0B4D9C] transition-transform duration-200 group-hover:-translate-x-0.5" />
          )}
        </button>

        {/* Top Header in Sidebar */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className={`border-b border-white/10 flex items-center shrink-0 ${isCollapsed ? 'justify-center p-2' : 'p-2.5 gap-2'}`}>
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 overflow-hidden flex-1'}`}>
              <div className="w-8.5 h-8.5 flex items-center justify-center shrink-0">
                <img
                  src={schoolLogo}
                  alt="Logo Trường THPT Nguyễn Quang Diêu"
                  className="w-full h-full object-contain drop-shadow-sm"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = './logo.png';
                  }}
                />
              </div>

              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <h1 className="text-[13px] sm:text-sm font-black text-white uppercase tracking-wider line-clamp-1">
                    NQDIEU LEARNING
                  </h1>
                  <p className="text-[10px] sm:text-[10.5px] font-bold text-amber-300/90 truncate tracking-tight uppercase">
                    NỀN TẢNG AI HỌC TẬP TRỰC TUYẾN
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Menu Items */}
          <nav className={`space-y-1.5 sm:space-y-2 overflow-y-auto flex-1 min-h-0 scrollbar-thin scrollbar-thumb-white/20 ${isCollapsed ? 'p-1.5' : 'p-2 sm:p-2.5'}`}>
            {/* 1. TEACHER / ADMIN NAVIGATION */}
            {(isAdmin || isTeacher) && !isTeacherTestingMode && (
              <>
                {/* 1. Tab: Tổng quan */}
                <button
                  type="button"
                  onClick={() => handleTabClick('overview')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'overview'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Bảng điều khiển & Tổng quan hệ thống"
                >
                  <LayoutDashboard className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'overview' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Tổng quan</span>}
                </button>

                {/* 2. Tab: Quản lý khóa học */}
                <button
                  type="button"
                  onClick={() => handleTabClick('manageCourses')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'manageCourses' || activeTab === 'createCourse'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Quản lý danh sách khóa học, bài giảng và bài tập"
                >
                  <BookOpen className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'manageCourses' || activeTab === 'createCourse' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span className="truncate">Quản lý khóa học</span>}
                </button>

                {/* 3. Tab: Góc hỏi đáp (Q&A) */}
                <button
                  type="button"
                  onClick={() => handleTabClick('qa')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center relative' : 'w-full justify-between gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'qa'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Góc hỏi đáp (Q&A) bài học - Giải đáp thắc mắc của học sinh"
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center relative' : 'gap-2.5 min-w-0'}`}>
                    <MessageSquare className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'qa' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                    {!isCollapsed && <span className="truncate">Góc hỏi đáp (Q&A)</span>}
                    {isCollapsed && pendingCounts.pendingQa > 0 && (
                      <span
                        className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-0.5 text-[9px] font-black rounded-full bg-rose-500 text-white animate-pulse flex items-center justify-center shadow-xs"
                        title={`${pendingCounts.pendingQa} câu hỏi chờ giải đáp`}
                      >
                        {pendingCounts.pendingQa}
                      </span>
                    )}
                  </div>
                  {!isCollapsed && pendingCounts.pendingQa > 0 && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[10.5px] font-black rounded-full shadow-xs shrink-0 ${
                        activeTab === 'qa' ? 'bg-rose-600 text-white' : 'bg-rose-500 text-white animate-pulse'
                      }`}
                      title={`${pendingCounts.pendingQa} câu hỏi chờ giải đáp`}
                    >
                      {pendingCounts.pendingQa}
                    </span>
                  )}
                </button>

                {/* 4. Tab: Thông báo & Bản tin */}
                <button
                  type="button"
                  onClick={() => handleTabClick('notifications')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full justify-between gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'notifications'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Thông báo & Bản tin nhà trường"
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
                    <Megaphone className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'notifications' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                    {!isCollapsed && <span className="truncate">Thông báo & Bản tin</span>}
                  </div>
                </button>

                {/* 5. Tab: Báo cáo */}
                <button
                  type="button"
                  onClick={() => handleTabClick('reports')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'reports'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Báo cáo & số liệu thống kê toàn hệ thống LMS"
                >
                  <BarChart3 className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'reports' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span className="truncate">Báo cáo</span>}
                </button>

                {/* 6. Tab: Bảng xếp hạng */}
                <button
                  type="button"
                  onClick={() => handleTabClick('leaderboard')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'leaderboard'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Bảng xếp hạng thi đua học tập toàn trường"
                >
                  <Trophy className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'leaderboard' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span className="truncate">Bảng xếp hạng</span>}
                </button>

                {/* Tab: Trò chơi ôn tập */}
                <button
                  type="button"
                  onClick={() => handleTabClick('games')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'games'
                      ? 'bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ' + (isCollapsed ? '' : 'translate-x-1')
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Kho trò chơi ôn tập kiến thức trực tuyến (Wordwall, Kahoot, Quizizz,...)"
                >
                  <Gamepad2 className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'games' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span className="truncate">Trò chơi</span>}
                </button>
                {/* 7. Tab: Thử nghiệm Học sinh */}
                <button
                  type="button"
                  onClick={() => handleTabClick('testingMode')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'testingMode'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Chuyển sang chế độ trải nghiệm LMS dưới vai trò Học sinh"
                >
                  <RefreshCw className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'testingMode' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span className="truncate">Thử nghiệm Học sinh</span>}
                </button>

                {/* 8. Tab: Trợ lý AI */}
                <button
                  type="button"
                  onClick={() => handleTabClick('ai')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'ai'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Trợ lý AI - Soạn giáo án, tạo câu hỏi & chuẩn hóa đề thi"
                >
                  <Sparkles className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'ai' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span className="truncate">Trợ lý AI</span>}
                </button>

                {/* 9. Tab: Quản trị (Admin) / Tài khoản học sinh (Teacher) */}
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => handleTabClick('admin')}
                    className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                      isCollapsed ? 'w-10 h-10 mx-auto justify-center relative' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                    } ${
                      isAdminTabActive
                        ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                        : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                    }`}
                    title="Khu vực Quản trị hệ thống: Cấp & Quản lý tài khoản, Nâng cao"
                  >
                    <Shield className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${isAdminTabActive ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                    {!isCollapsed && <span className="truncate">Quản trị</span>}
                    {pendingCounts.totalPending > 0 && (
                      <span
                        className={`${
                          isCollapsed
                            ? 'absolute -top-1 -right-1.5 min-w-[16px] h-4 px-0.5 text-[9px]'
                            : 'ml-auto inline-flex min-w-[18px] h-4.5 px-1.5 text-[10px]'
                        } font-black rounded-full bg-rose-500 text-white animate-pulse flex items-center justify-center shadow-xs`}
                        title={`${pendingCounts.totalPending} yêu cầu chờ xử lý`}
                      >
                        {pendingCounts.totalPending}
                      </span>
                    )}
                  </button>
                ) : isTeacher ? (
                  <button
                    type="button"
                    onClick={() => handleTabClick('admin')}
                    className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                      isCollapsed ? 'w-10 h-10 mx-auto justify-center relative' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                    } ${
                      isAdminTabActive
                        ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                        : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                    }`}
                    title="Quản lý tài khoản học sinh & Duyệt quên mật khẩu học sinh"
                  >
                    <Users className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${isAdminTabActive ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                    {!isCollapsed && <span className="truncate">Tài khoản học sinh</span>}
                    {pendingCounts.pendingReset > 0 && (
                      <span
                        className={`${
                          isCollapsed
                            ? 'absolute -top-1 -right-1.5 min-w-[16px] h-4 px-0.5 text-[9px]'
                            : 'ml-auto inline-flex min-w-[18px] h-4.5 px-1.5 text-[10px]'
                        } font-black rounded-full bg-rose-500 text-white animate-pulse flex items-center justify-center shadow-xs`}
                        title={`${pendingCounts.pendingReset} yêu cầu quên mật khẩu học sinh chờ duyệt`}
                      >
                        {pendingCounts.pendingReset}
                      </span>
                    )}
                  </button>
                ) : null}
              </>
            )}

            {/* 2. STUDENT NAVIGATION / TEACHER TESTING MODE */}
            {(isStudent || isTeacherTestingMode) && (
              <>
                {/* 1. Tab: Tổng quan */}
                <button
                  type="button"
                  onClick={() => handleTabClick('overview')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'overview'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Tổng quan học tập"
                >
                  <LayoutDashboard className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'overview' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Tổng quan</span>}
                </button>

                {/* 2. Tab: Thông báo & Bản tin */}
                <button
                  type="button"
                  onClick={() => handleTabClick('notifications')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'notifications'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Thông báo & Bản tin nhà trường"
                >
                  <Megaphone className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'notifications' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Thông báo & Bản tin</span>}
                </button>

                {/* 3. Tab: Khóa học & Học liệu */}
                <button
                  type="button"
                  onClick={() => handleTabClick('myCourses')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'myCourses'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Khóa học & Học liệu"
                >
                  <BookOpen className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'myCourses' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Khóa học & Học liệu</span>}
                </button>

                {/* 4. Tab: Tiến độ học tập */}
                <button
                  type="button"
                  onClick={() => handleTabClick('achievements')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'achievements'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Tiến độ học tập và chứng nhận"
                >
                  <Award className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'achievements' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Tiến độ học tập</span>}
                </button>

                {/* 5. Tab: Bảng xếp hạng */}
                <button
                  type="button"
                  onClick={() => handleTabClick('leaderboard')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'leaderboard'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Bảng xếp hạng thi đua học tập"
                >
                  <Trophy className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'leaderboard' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Bảng xếp hạng</span>}
                </button>

                {/* Tab: Trò chơi ôn tập */}
                <button
                  type="button"
                  onClick={() => handleTabClick('games')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'games'
                      ? 'bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ' + (isCollapsed ? '' : 'translate-x-1')
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Kho trò chơi ôn tập kiến thức"
                >
                  <Gamepad2 className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'games' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Trò chơi</span>}
                </button>
                {/* Return button if testing mode */}
                {isTeacherTestingMode && (
                  <button
                    type="button"
                    onClick={() => handleTabClick('testingMode')}
                    className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm bg-amber-400 text-slate-950 shadow-md hover:bg-amber-300 hover:shadow-lg hover:translate-x-1 transition-all duration-200 cursor-pointer mt-2 ${
                      isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5'
                    }`}
                  >
                    <RefreshCw className="w-4.5 h-4.5 shrink-0 text-slate-950 transition-transform duration-200 group-hover:rotate-180" />
                    {!isCollapsed && <span>Trở về Giáo viên</span>}
                  </button>
                )}
              </>
            )}

            {/* 3. GUEST NAVIGATION */}
            {isGuest && (
              <>
                <button
                  type="button"
                  onClick={() => handleTabClick('overview')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'overview'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                >
                  <LayoutDashboard className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'overview' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Tổng quan khóa học</span>}
                </button>

                <button
                  type="button"
                  onClick={() => handleTabClick('notifications')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'notifications'
                      ? `bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ${isCollapsed ? '' : 'translate-x-1'}`
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                >
                  <Megaphone className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'notifications' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Bảng tin & Thông báo</span>}
                </button>

                <button
                  type="button"
                  onClick={() => handleTabClick('games')}
                  className={`group flex items-center rounded-xl font-bold text-[13.5px] sm:text-sm transition-all duration-200 cursor-pointer ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5 text-left'
                  } ${
                    activeTab === 'games'
                      ? 'bg-white text-[#0B4D9C] shadow-md font-extrabold border border-white ' + (isCollapsed ? '' : 'translate-x-1')
                      : 'text-white/85 border border-transparent hover:text-white hover:bg-white/20 hover:border-white/25 hover:shadow-sm hover:translate-x-0.5'
                  }`}
                  title="Kho trò chơi ôn tập kiến thức"
                >
                  <Gamepad2 className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${activeTab === 'games' ? 'text-[#0B4D9C]' : 'text-white/80 group-hover:text-white'}`} />
                  {!isCollapsed && <span>Trò chơi ôn tập</span>}
                </button>
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className={`group flex items-center rounded-xl font-extrabold text-[13.5px] sm:text-sm bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-md hover:shadow-lg hover:translate-x-1 transition-all duration-200 cursor-pointer mt-2 border border-amber-300 ${
                    isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full gap-2.5 px-3 py-2 sm:py-2.5'
                  }`}
                >
                  <LogIn className="w-4.5 h-4.5 shrink-0 text-slate-950 transition-transform duration-200 group-hover:translate-x-0.5" />
                  {!isCollapsed && <span>Đăng nhập hệ thống</span>}
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Bottom Sidebar Profile Card (Click to open "Cập nhật hồ sơ") */}
        <div className={`border-t border-white/15 shrink-0 ${isCollapsed ? 'p-1.5 flex justify-center' : 'p-2 sm:p-2.5'}`}>
          {isCollapsed ? (
            <button
              type="button"
              onClick={onOpenProfileUpdate}
              className="w-10 h-10 rounded-full aspect-square bg-white text-[#0B4D9C] flex items-center justify-center font-black text-sm shadow-md cursor-pointer transition-transform hover:scale-105 active:scale-95 overflow-hidden ring-2 ring-white/50"
              title={`${roleSubtitle}\n${displayName}\nTHPT NGUYỄN QUANG DIÊU\n${positionLabel}: ${positionValue}\n(Bấm để cập nhật hồ sơ)`}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover rounded-full aspect-square"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                avatarInitials
              )}
            </button>
          ) : (
            <div
              onClick={onOpenProfileUpdate}
              className="bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/20 hover:border-white/40 rounded-xl p-2 sm:p-2.5 transition-all shadow-xs space-y-1.5 cursor-pointer group"
              title="Bấm vào để xem thông tin và Cập nhật hồ sơ tài khoản"
            >
              {/* Top Header: Avatar + Role on Line 1 & Name on Line 2 (Different color) */}
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full aspect-square bg-white text-[#0B4D9C] flex items-center justify-center font-black text-xs shrink-0 shadow-sm select-none overflow-hidden ring-2 ring-white/40 group-hover:scale-105 transition-transform">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-full h-full object-cover rounded-full aspect-square"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    avatarInitials
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[10.5px] font-bold text-white uppercase tracking-tight truncate leading-tight">
                    {roleSubtitle}
                  </h3>
                  <p className="text-xs sm:text-[13px] font-black text-amber-300 group-hover:text-amber-200 uppercase tracking-wide truncate mt-0.5 leading-tight transition-colors">
                    {displayName}
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-white/20" />

              {/* Info Rows */}
              <div className="space-y-1 text-[11px] sm:text-xs leading-tight">
                <div className="flex items-center gap-1.5 text-white font-bold tracking-tight">
                  <Globe className="w-3.5 h-3.5 text-blue-100 shrink-0" />
                  <span className="truncate">THPT NGUYỄN QUANG DIÊU</span>
                </div>

                <div className="flex items-center gap-1.5 text-white font-medium">
                  <Briefcase className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">
                    {positionLabel}:{' '}
                    <span className="font-extrabold text-amber-300">
                      {positionValue}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
