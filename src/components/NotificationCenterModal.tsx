import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, AppNotification, SchoolNotice, Course } from '../types';
import {
  Bell,
  X,
  CheckCheck,
  Megaphone,
  HelpCircle,
  FileCheck2,
  Clock,
  Award,
  Video,
  ExternalLink,
  ChevronRight,
  Trash2,
  Pin,
  Calendar,
  Sparkles,
  Layers,
  Plus,
  Radio,
  UserPlus,
  Key,
  CheckCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  getStoredNotifications,
  saveStoredNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearNotificationsForUser,
  getStoredSchoolNotices,
  saveStoredSchoolNotices,
  addSchoolNotice,
  deleteSchoolNotice,
} from '../lib/storage';

interface NotificationCenterModalProps {
  isOpen?: boolean;
  onClose: () => void;
  currentUser: User | null;
  courses: Course[];
  mode?: 'PERSONAL_ONLY' | 'MANAGEMENT';
  initialSubTab?: 'NOTIFICATIONS' | 'NOTICE_BOARD';
  onOpenCourse?: (courseId: string) => void;
  onOpenAchievements?: () => void;
  onOpenAccountManagement?: () => void;
  isInline?: boolean;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen = true,
  onClose,
  currentUser,
  courses,
  mode = 'PERSONAL_ONLY',
  initialSubTab,
  onOpenCourse,
  onOpenAchievements,
  onOpenAccountManagement,
  isInline = false,
}) => {
  const isPersonalOnly = mode === 'PERSONAL_ONLY';
  const [activeTab, setActiveTab] = useState<'NOTIFICATIONS' | 'NOTICE_BOARD'>(
    initialSubTab || (isPersonalOnly ? 'NOTIFICATIONS' : 'NOTICE_BOARD')
  );
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notices, setNotices] = useState<SchoolNotice[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Form thêm thông báo bảng tin (dành cho Admin / Giáo viên)
  const [showAddNotice, setShowAddNotice] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'CHUNG' | 'THI_CU' | 'LICH_HOC' | 'HOAT_DONG' | 'KHAN_CAP'>('CHUNG');
  const [newPinned, setNewPinned] = useState(false);
  const [newTarget, setNewTarget] = useState<'ALL' | 'STUDENT' | 'TEACHER'>(
    currentUser?.role === 'TEACHER' ? 'STUDENT' : 'ALL'
  );

  const isAdminOrTeacher = currentUser?.role === 'ADMIN' || currentUser?.role === 'TEACHER';
  const isAdmin = currentUser?.role === 'ADMIN';

  // Load data
  const loadData = () => {
    setNotifications(getStoredNotifications());
    setNotices(getStoredSchoolNotices());
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (initialSubTab) {
        setActiveTab(initialSubTab);
      } else if (isPersonalOnly) {
        setActiveTab('NOTIFICATIONS');
      } else {
        setActiveTab('NOTICE_BOARD');
      }
      if (currentUser?.role === 'TEACHER') {
        setNewTarget('STUDENT');
      }
    }
  }, [isOpen, currentUser, isPersonalOnly, initialSubTab]);

  // Listen to live events
  useEffect(() => {
    const handleNotifUpdate = () => {
      setNotifications(getStoredNotifications());
    };
    const handleNoticeUpdate = () => {
      setNotices(getStoredSchoolNotices());
    };
    window.addEventListener('lms-notifications-updated', handleNotifUpdate);
    window.addEventListener('lms-notices-updated', handleNoticeUpdate);
    return () => {
      window.removeEventListener('lms-notifications-updated', handleNotifUpdate);
      window.removeEventListener('lms-notices-updated', handleNoticeUpdate);
    };
  }, []);

  // Filter notifications for current user
  const userNotifications = useMemo(() => {
    if (!currentUser) return [];
    const cleanId = String(currentUser.idUser || '').trim().toLowerCase();
    const role = currentUser.role;

    return notifications.filter((n) => {
      const rec = String(n.recipientId || '').trim().toLowerCase();
      if (rec === cleanId) return true;
      if (rec === 'all') return true;
      if (rec === 'students' && role === 'STUDENT') return true;
      if (rec === 'teachers' && (role === 'TEACHER' || role === 'ADMIN')) return true;
      return false;
    });
  }, [notifications, currentUser]);

  const unreadCount = useMemo(() => {
    return userNotifications.filter((n) => !n.isRead).length;
  }, [userNotifications]);

  // Filter school notices
  const filteredNotices = useMemo(() => {
    return notices
      .filter((n) => {
        if (!currentUser) {
          if (n.targetAudience !== 'ALL') return false;
        } else if (currentUser.role === 'STUDENT' && n.targetAudience === 'TEACHER') {
          return false;
        }
        if (selectedCategory !== 'ALL' && n.category !== selectedCategory) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [notices, currentUser, selectedCategory]);

  const handleMarkAllRead = () => {
    if (!currentUser) return;
    markAllNotificationsAsRead(currentUser.idUser, currentUser.role);
    loadData();
  };

  const handleClearAll = () => {
    if (!currentUser) return;
    clearNotificationsForUser(currentUser);
    loadData();
  };

  const handleDeleteNotification = (e: React.MouseEvent, notif: AppNotification) => {
    e.stopPropagation();
    deleteNotification(notif.id, currentUser?.idUser);
    loadData();
  };

  const handleNotificationClick = (n: AppNotification) => {
    markNotificationAsRead(n.id);
    loadData();

    if (n.linkAction === 'open_course' && n.linkCourseId && onOpenCourse) {
      onClose();
      onOpenCourse(n.linkCourseId);
    } else if (n.linkAction === 'open_badges' || n.linkAction === 'open_cert') {
      if (onOpenAchievements) {
        onClose();
        onOpenAchievements();
      }
    } else if (n.linkAction === 'open_account_management') {
      if (onOpenAccountManagement) {
        onClose();
        onOpenAccountManagement();
      }
    } else if (n.linkAction === 'open_meeting' && n.linkUrl) {
      window.open(n.linkUrl, '_blank');
    }
  };

  const handleCreateNotice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim() || !currentUser) return;

    const targetAudience = currentUser.role === 'ADMIN' ? newTarget : 'STUDENT';

    addSchoolNotice({
      title: newTitle.trim(),
      content: newContent.trim(),
      category: newCategory,
      pinned: newPinned,
      targetAudience: targetAudience,
      authorId: currentUser.idUser,
      authorName: currentUser.hoTen,
      authorRole: currentUser.role,
    });

    setNewTitle('');
    setNewContent('');
    setNewPinned(false);
    setShowAddNotice(false);
    loadData();
  };

  const handleDeleteNotice = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa thông báo bảng tin này?')) {
      deleteSchoolNotice(id);
      loadData();
    }
  };

  const canDeleteNotice = (item: SchoolNotice) => {
    if (!currentUser) return false;
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'TEACHER') {
      return item.authorId === currentUser.idUser || (!item.authorId && item.authorName === currentUser.hoTen);
    }
    return false;
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'QA_ANSWER':
        return <HelpCircle className="w-5 h-5 text-blue-500" />;
      case 'EXAM_NEW':
        return <FileCheck2 className="w-5 h-5 text-emerald-500" />;
      case 'EXAM_EXPIRING':
        return <Clock className="w-5 h-5 text-amber-500" />;
      case 'CERTIFICATE_ISSUED':
        return <Award className="w-5 h-5 text-purple-500" />;
      case 'BADGE_EARNED':
        return <Sparkles className="w-5 h-5 text-amber-500" />;
      case 'LIVE_CLASS_STARTING':
        return <Video className="w-5 h-5 text-rose-500" />;
      case 'ACCOUNT_REGISTRATION':
        return <UserPlus className="w-5 h-5 text-indigo-600" />;
      case 'PASSWORD_RESET':
        return <Key className="w-5 h-5 text-amber-600" />;
      case 'ACCOUNT_APPROVED':
        return <CheckCircle className="w-5 h-5 text-emerald-600" />;
      case 'PASSWORD_RESET_APPROVED':
        return <ShieldCheck className="w-5 h-5 text-emerald-600" />;
      default:
        return <Megaphone className="w-5 h-5 text-blue-600" />;
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'KHAN_CAP':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">Khẩn cấp</span>;
      case 'THI_CU':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">Khảo thí & Thi cử</span>;
      case 'LICH_HOC':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">Lịch học & Phòng Meet</span>;
      case 'HOAT_DONG':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">Hoạt động trường</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">Thông báo chung</span>;
    }
  };

  const formatTimeAgo = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút trước`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} ngày trước`;
      return new Date(isoString).toLocaleDateString('vi-VN');
    } catch {
      return 'Gần đây';
    }
  };

  if (!isOpen && !isInline) return null;

  const isStudent = currentUser?.role === 'STUDENT';
  const noticeBoardTabLabel = isStudent ? 'Bản tin Nhà trường' : 'Quản lý bản tin Nhà trường';

  const renderContentBody = () => (
    <div className={`p-4 sm:p-6 ${isInline ? 'bg-white rounded-3xl border border-slate-200/90 shadow-sm' : 'bg-slate-50/50 flex-1 overflow-y-auto'}`}>
      {activeTab === 'NOTIFICATIONS' ? (
        <div className="space-y-4">
          {/* Action Bar for Notifications */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500">
              {userNotifications.length} thông báo • {unreadCount} chưa đọc
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-blue-200"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Đã đọc tất cả
                </button>
              )}
              {userNotifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa tất cả
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          {userNotifications.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Bell className="w-8 h-8" />
              </div>
              <p className="text-slate-600 font-bold text-base">Bạn chưa có thông báo nào</p>
              <p className="text-slate-400 text-xs mt-1">
                Các thông báo khi giáo viên trả lời Q&A, lịch kiểm tra, huy hiệu mới sẽ xuất hiện tại đây.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {userNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                    notif.isRead
                      ? 'bg-white border-slate-200/80 hover:border-slate-300'
                      : 'bg-blue-50/60 border-blue-200/90 shadow-xs hover:border-blue-300'
                  }`}
                >
                  <div className="p-2.5 rounded-xl bg-white shadow-xs border border-slate-100 shrink-0">
                    {getNotificationIcon(notif.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-sm font-bold tracking-tight truncate ${notif.isRead ? 'text-slate-800' : 'text-blue-950 font-black'}`}>
                        {notif.title}
                      </h4>
                      <span className="text-[11px] font-medium text-slate-400 shrink-0">
                        {formatTimeAgo(notif.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-2">
                      {notif.message}
                    </p>
                    {notif.linkAction && (
                      <div className="mt-2.5 flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
                        <span>Xem chi tiết</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleDeleteNotification(e, notif)}
                      title="Xóa thông báo này"
                      className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {!notif.isRead && (
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Category Filter & Add button */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              {[
                { id: 'ALL', label: 'Tất cả' },
                { id: 'KHAN_CAP', label: 'Khẩn cấp' },
                { id: 'THI_CU', label: 'Khảo thí' },
                { id: 'LICH_HOC', label: 'Lịch học' },
                { id: 'HOAT_DONG', label: 'Hoạt động' },
                { id: 'CHUNG', label: 'Chung' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    selectedCategory === cat.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {isAdminOrTeacher && (
              <button
                onClick={() => setShowAddNotice(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ml-auto"
              >
                <Plus className="w-4 h-4" />
                Đăng thông báo mới
              </button>
            )}
          </div>

          {/* Modal Hộp thoại "Tạo thông báo Bảng tin trường mới" */}
          {showAddNotice && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
              <div
                className="w-full max-w-3xl bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200 relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Megaphone className="w-5 h-5" />
                    </div>
                    <span>Tạo thông báo Bảng tin trường mới</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddNotice(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateNotice} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Tiêu đề thông báo..."
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-4 py-3 text-sm border border-slate-200 rounded-2xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none placeholder:text-slate-400 font-medium transition-all"
                      autoFocus
                    />
                  </div>

                  <div>
                    <textarea
                      required
                      rows={4}
                      placeholder="Nội dung thông báo chi tiết..."
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      className="w-full px-4 py-3 text-sm border border-slate-200 rounded-2xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none placeholder:text-slate-400 font-medium transition-all resize-y min-h-[110px]"
                    />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-1">
                    <div className="flex flex-wrap items-end gap-3 sm:gap-4">
                      <div className="w-full sm:w-48">
                        <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                          Chuyên mục
                        </label>
                        <select
                          value={newCategory}
                          onChange={(e: any) => setNewCategory(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-500 font-medium text-slate-700 cursor-pointer"
                        >
                          <option value="CHUNG">Thông báo chung</option>
                          <option value="THI_CU">Khảo thí & Thi cử</option>
                          <option value="LICH_HOC">Lịch học & Online</option>
                          <option value="HOAT_DONG">Hoạt động phong trào</option>
                          <option value="KHAN_CAP">Khẩn cấp</option>
                        </select>
                      </div>

                      <div className="w-full sm:w-52">
                        <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                          Đối tượng nhận
                        </label>
                        {isAdmin ? (
                          <select
                            value={newTarget}
                            onChange={(e: any) => setNewTarget(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-500 font-medium text-slate-700 cursor-pointer"
                          >
                            <option value="ALL">Toàn trường (Tất cả)</option>
                            <option value="STUDENT">Chỉ Học sinh</option>
                            <option value="TEACHER">Chỉ Giáo viên</option>
                          </select>
                        ) : (
                          <div className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50/80 font-medium text-slate-700 flex items-center justify-between">
                            <span className="font-bold text-slate-800">Chỉ Học sinh</span>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                              Giáo viên
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center pb-2">
                        <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newPinned}
                            onChange={(e) => setNewPinned(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <Pin className="w-4 h-4 text-amber-600 fill-amber-500" />
                          <span>Ghim lên đầu bảng tin</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 md:pt-0">
                      <button
                        type="button"
                        onClick={() => setShowAddNotice(false)}
                        className="px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-full shadow-md active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                      >
                        Đăng thông báo
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Notice Board List */}
          {filteredNotices.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Megaphone className="w-8 h-8" />
              </div>
              <p className="text-slate-600 font-bold text-base">Không có thông báo nào trong mục này</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredNotices.map((item) => (
                <div
                  key={item.id}
                  className={`p-5 rounded-2xl bg-white border transition-all ${
                    item.pinned
                      ? 'border-amber-300 shadow-sm bg-gradient-to-br from-amber-50/30 to-white'
                      : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.pinned && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white shadow-2xs">
                          <Pin className="w-3 h-3 fill-current" />
                          ĐÃ GHIM
                        </span>
                      )}
                      {getCategoryBadge(item.category)}
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    {canDeleteNotice(item) && (
                      <button
                        onClick={() => handleDeleteNotice(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                        title="Xóa thông báo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <h3 className="text-base font-black text-slate-900 mt-2.5 tracking-tight">
                    {item.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-700 mt-2 leading-relaxed whitespace-pre-line">
                    {item.content}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-blue-900">
                      Người đăng: {item.authorName} ({item.authorRole === 'ADMIN' ? 'Ban Giám Hiệu' : 'Giáo viên'})
                    </span>
                    <span className="text-slate-400 font-medium">
                      Đối tượng: {item.targetAudience === 'ALL' ? 'Toàn trường' : item.targetAudience === 'STUDENT' ? 'Học sinh' : 'Giáo viên'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // 1. INLINE TAB VIEW (Rendered seamlessly in student and teacher views)
  if (isInline) {
    return (
      <div className="w-full space-y-5 animate-in fade-in duration-300">
        {/* Top Rounded Header Box */}
        <div className="bg-white rounded-3xl px-5 sm:px-6 py-2.5 min-h-[65px] border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shadow-2xs shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 tracking-tight uppercase">
                Quản lý Thông báo
              </h2>
            </div>
          </div>

          {/* 2 Buttons placed horizontally next to it */}
          <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shadow-2xs w-full md:w-auto self-stretch md:self-auto gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('NOTIFICATIONS')}
              className={`flex-1 md:flex-initial px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'NOTIFICATIONS'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Thông báo của tôi</span>
              {unreadCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                    activeTab === 'NOTIFICATIONS'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-rose-500 text-white'
                  }`}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('NOTICE_BOARD')}
              className={`flex-1 md:flex-initial px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'NOTICE_BOARD'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>{noticeBoardTabLabel}</span>
              {notices.length > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    activeTab === 'NOTICE_BOARD'
                      ? 'bg-blue-200 text-blue-950'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {notices.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content Box */}
        {renderContentBody()}
      </div>
    );
  }

  // 2. POPUP MODAL VIEW
  const modalInner = (
    <div className={`bg-white w-full ${isPersonalOnly ? 'max-w-2xl h-[min(88vh,660px)]' : 'max-w-3xl h-[min(88vh,680px)]'} rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col`}>
      {/* Modal Header */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 px-5 sm:px-6 py-3.5 flex items-center justify-between text-white border-b border-blue-700/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-2xl backdrop-blur-md border border-white/15 shrink-0">
            {isPersonalOnly ? (
              <Bell className="w-5 h-5 text-amber-300" />
            ) : (
              <Megaphone className="w-5 h-5 text-amber-300" />
            )}
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2 flex-wrap">
              {isPersonalOnly ? 'THÔNG BÁO CỦA TÔI' : 'TRUNG TÂM THÔNG BÁO & BẢNG TIN'}
            </h2>
            <p className="text-[11px] sm:text-xs text-blue-200/90 font-medium line-clamp-1">
              {isPersonalOnly
                ? 'THPT Nguyễn Quang Diêu • Cập nhật thông báo học tập, hỏi đáp & kết quả bài thi'
                : 'THPT Nguyễn Quang Diêu • Đăng thông báo mới & Quản lý bảng tin nhà trường'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-blue-200 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          title="Đóng (Về tổng quan)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Sub-tab Navigation */}
      <div className="p-3.5 sm:p-4 bg-white border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="inline-flex p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shadow-2xs self-start">
          <button
            type="button"
            onClick={() => setActiveTab('NOTIFICATIONS')}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'NOTIFICATIONS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Thông báo của tôi</span>
            {unreadCount > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'NOTIFICATIONS'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-rose-500 text-white'
                }`}
              >
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('NOTICE_BOARD')}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'NOTICE_BOARD'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            <span>{noticeBoardTabLabel}</span>
            {notices.length > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'NOTICE_BOARD'
                    ? 'bg-blue-200 text-blue-950'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {notices.length}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium hidden md:block">
          {activeTab === 'NOTIFICATIONS' ? (
            <span>Cập nhật hoạt động học tập, kết quả thi &amp; tương tác của bạn</span>
          ) : (
            <span>Đăng tải &amp; cập nhật tin tức thông báo toàn trường THPT Nguyễn Quang Diêu</span>
          )}
        </div>
      </div>

      {/* Modal Body */}
      {renderContentBody()}

      {/* Modal Footer */}
      <div className="px-6 py-3.5 bg-slate-100/80 border-t border-slate-200 flex justify-end shrink-0">
        <button
          onClick={onClose}
          className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
        >
          Đóng
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      {modalInner}
    </div>
  );
};
