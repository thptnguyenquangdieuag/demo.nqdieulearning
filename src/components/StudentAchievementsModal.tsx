import React, { useState, useEffect } from 'react';
import { User, Course, IssuedCertificate } from '../types';
import {
  X,
  Award,
  Trophy,
  Clock,
  CheckCircle,
  Star,
  Zap,
  Shield,
  Eye,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  BookOpen,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Medal,
  GraduationCap,
  Target,
  Trash2,
} from 'lucide-react';
import { getStoredCertificates, deleteStoredCertificate } from '../lib/storage';
import { computeUserAchievements, BadgeItem, isStudentRole } from '../lib/achievements';
import { CertificateView } from './CertificateView';

interface StudentAchievementsModalProps {
  isOpen?: boolean;
  isInline?: boolean;
  onClose: () => void;
  currentUser: User | null;
  courses: Course[];
  userProgress: Record<string, any>;
  quizStatus: Record<string, any>;
  registeredIds?: string[];
}

export const StudentAchievementsModal: React.FC<StudentAchievementsModalProps> = ({
  isOpen = true,
  isInline = false,
  onClose,
  currentUser,
  courses,
  userProgress,
  quizStatus,
  registeredIds = [],
}) => {
  const [selectedCertificate, setSelectedCertificate] = useState<IssuedCertificate | null>(null);
  const [storedCerts, setStoredCerts] = useState<IssuedCertificate[]>([]);
  const [showGuideBox, setShowGuideBox] = useState(true);

  const refreshCerts = () => {
    if (currentUser) {
      const cleanUser = String(currentUser.idUser || '').trim().toLowerCase();
      const rawUser = String(currentUser.idUser || '');
      const allCerts = getStoredCertificates();

      // Chỉ hiển thị chứng nhận của các khóa học hiện đang tồn tại (nếu khóa học bị xóa thì chứng nhận cũng bị loại bỏ)
      const validCourseIds = new Set((courses || []).map((c) => String(c.courseId)));

      const userCerts = allCerts.filter((c: any) => {
        if (!c) return false;
        if (courses && courses.length > 0 && !validCourseIds.has(String(c.courseId))) {
          return false;
        }
        const u = String(c.idUser || '').trim().toLowerCase();
        return u === cleanUser || u === rawUser.toLowerCase();
      });

      setStoredCerts(userCerts);
    } else {
      setStoredCerts([]);
    }
  };

  useEffect(() => {
    refreshCerts();

    const handleUpdate = () => refreshCerts();
    window.addEventListener('certificates-updated', handleUpdate);
    window.addEventListener('courses-updated', handleUpdate);
    return () => {
      window.removeEventListener('certificates-updated', handleUpdate);
      window.removeEventListener('courses-updated', handleUpdate);
    };
  }, [currentUser, courses]);

  const handleDeleteCert = async (cert: IssuedCertificate, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const confirmMsg = `Bạn có chắc chắn muốn xóa Giấy chứng nhận khóa học "${cert.courseTitle}" (Mã số: ${cert.certificateId})?\n\nHành động này sẽ xóa vĩnh viễn giấy chứng nhận khỏi hệ thống.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      try {
        await fetch(`/api/certificates/${encodeURIComponent(cert.certificateId)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('Lỗi API khi xóa chứng nhận:', err);
      }

      deleteStoredCertificate(cert.certificateId);
      if (selectedCertificate?.certificateId === cert.certificateId) {
        setSelectedCertificate(null);
      }
      refreshCerts();
      alert('Đã xóa giấy chứng nhận thành công!');
    } catch (e: any) {
      alert('Lỗi khi xóa giấy chứng nhận: ' + (e?.message || 'Lỗi không xác định'));
    }
  };

  if (!isOpen && !isInline) return null;

  const {
    badges,
    completedCoursesCount,
    totalWatchedSec,
    avgScoreDisplay,
    totalRewardPoints = 0,
  } = computeUserAchievements(
    currentUser,
    courses,
    userProgress,
    quizStatus,
    registeredIds
  );

  const totalHours = Math.floor(totalWatchedSec / 3600);
  const totalMinutes = Math.floor((totalWatchedSec % 3600) / 60);
  const timeDisplay = totalHours > 0 ? `${totalHours} giờ ${totalMinutes} phút` : `${totalMinutes} phút`;

  const achievedBadgesCount = badges.filter((b) => b.isAchieved).length;

  const renderBadgeIcon = (iconName: string, isAchieved: boolean, iconColor: string) => {
    const cls = `w-6 h-6 ${isAchieved ? iconColor : 'text-slate-400'}`;
    switch (iconName) {
      case 'Star':
        return <Star className={cls} />;
      case 'Zap':
        return <Zap className={cls} />;
      case 'Shield':
        return <Shield className={cls} />;
      case 'Award':
        return <Award className={cls} />;
      case 'Trophy':
        return <Trophy className={cls} />;
      default:
        return <Sparkles className={cls} />;
    }
  };

  const formatCertificateDate = (cert: IssuedCertificate): string => {
    if (cert.formattedDateStr) {
      const vnMatch = cert.formattedDateStr.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
      if (vnMatch) {
        const dd = vnMatch[1].padStart(2, '0');
        const mm = vnMatch[2].padStart(2, '0');
        const yyyy = vnMatch[3];
        return `${dd}/${mm}/${yyyy}`;
      }
      const slashMatch = cert.formattedDateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (slashMatch) {
        const dd = slashMatch[1].padStart(2, '0');
        const mm = slashMatch[2].padStart(2, '0');
        const yyyy = slashMatch[3];
        return `${dd}/${mm}/${yyyy}`;
      }
    }

    if (cert.issueDate) {
      const d = new Date(cert.issueDate);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }
    }

    return cert.formattedDateStr || cert.issueDate || '';
  };

  // The main content of Achievements
  const mainContent = (
    <div className="space-y-6">
      {/* 1. Top 4 Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: Tổng thời gian học */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5 hover:shadow-md transition-all">
          <div className="p-3 rounded-2xl bg-sky-50 text-sky-600 shrink-0 border border-sky-100">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
              Thời gian học
            </p>
            <p className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 truncate">
              {timeDisplay}
            </p>
          </div>
        </div>

        {/* Card 2: Điểm thưởng tích lũy */}
        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-white to-amber-50/40 shadow-2xs flex items-center gap-3.5 hover:shadow-md transition-all">
          <div className="p-3 rounded-2xl bg-amber-100/80 text-amber-600 shrink-0 border border-amber-200/60">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider truncate">
              Điểm thưởng
            </p>
            <p className="text-lg sm:text-xl font-black text-amber-600 mt-0.5 truncate">
              +{totalRewardPoints} <span className="text-xs font-bold text-amber-700">điểm</span>
            </p>
          </div>
        </div>

        {/* Card 3: Khóa học hoàn thành */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5 hover:shadow-md transition-all">
          <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 shrink-0 border border-emerald-100">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
              Đã hoàn thành
            </p>
            <p className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 truncate">
              {completedCoursesCount} khóa
            </p>
          </div>
        </div>

        {/* Card 4: Điểm thi trung bình */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5 hover:shadow-md transition-all">
          <div className="p-3 rounded-2xl bg-purple-50 text-purple-600 shrink-0 border border-purple-100">
            <Trophy className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
              Điểm trung bình
            </p>
            <p className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 truncate">
              {avgScoreDisplay}
            </p>
          </div>
        </div>
      </div>

      {/* 3. "Danh hiệu đạt được" Section */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100/80 text-amber-600 rounded-2xl border border-amber-200/60">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Danh hiệu Học tập ({achievedBadgesCount}/{badges.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Huy hiệu có giá trị trong 7 ngày nhằm duy trì động lực rèn luyện
              </p>
            </div>
          </div>
          <span className="text-xs font-extrabold text-amber-800 bg-amber-50 border border-amber-200/80 px-3.5 py-1.5 rounded-full shadow-2xs">
            {achievedBadgesCount} / {badges.length} danh hiệu đang nắm giữ
          </span>
        </div>

        {!isStudentRole(currentUser) && (
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-center gap-2.5 text-xs text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Lưu ý:</strong> Huy hiệu học tập được cấp độc quyền cho tài khoản <strong>Học viên</strong> để thúc đẩy học tập. Tài khoản Quản trị viên và Giáo viên không tham gia cấp huy hiệu này.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {badges.map((badge) => {
            return (
              <div
                key={badge.id}
                className={`p-4 sm:p-5 rounded-2xl border text-center flex flex-col items-center justify-between transition-all duration-200 ${
                  badge.isAchieved
                    ? 'bg-gradient-to-b from-white to-amber-50/30 border-amber-300 shadow-sm ring-2 ring-amber-400/20 hover:-translate-y-0.5'
                    : 'bg-slate-50/60 border-slate-200/80 opacity-70 hover:opacity-90'
                }`}
              >
                <div className="flex flex-col items-center gap-3 w-full">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                      badge.isAchieved
                        ? `${badge.bgColor} shadow-sm border border-amber-200`
                        : 'bg-slate-200/70 text-slate-400 border border-slate-300/60'
                    }`}
                  >
                    {renderBadgeIcon(badge.iconName, badge.isAchieved, badge.iconColor)}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">{badge.title}</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-snug px-1 line-clamp-2" title={badge.description}>
                      {badge.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 w-full pt-3 border-t border-slate-100">
                  {badge.isAchieved ? (
                    <div className="flex flex-col items-center gap-1.5 w-full">
                      <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/90 rounded-full text-xs font-black w-full">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ĐÃ ĐẠT
                      </span>
                      <span className="text-[11px] text-amber-700 font-bold flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                        Còn {badge.daysRemaining ?? 7} ngày (hạn 7 ngày)
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 w-full">
                      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold w-full ${
                        badge.daysRemaining === 0
                          ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {badge.daysRemaining === 0 ? 'HẾT HẠN (HỌC ĐỂ CẤP LẠI)' : 'CHƯA ĐẠT'}
                      </span>
                      <span className={`text-[10px] ${badge.daysRemaining === 0 ? 'text-amber-600/80 font-medium' : 'text-slate-400'}`}>
                        {badge.daysRemaining === 0 ? 'Hết hạn 7 ngày • Học tiếp để cấp lại' : 'Thời hạn 7 ngày khi đạt'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. "Giấy chứng nhận khóa học" Section */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100/80 text-[#0B4D9C] rounded-2xl border border-blue-200/60">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Giấy Chứng nhận Khóa học ({storedCerts.length})
              </h3>
            </div>
          </div>
        </div>

        {storedCerts.length === 0 ? (
          <div className="p-10 text-center bg-slate-50/80 rounded-2xl border border-dashed border-slate-200 space-y-2">
            <Award className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">
              Chưa có giấy chứng nhận nào
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Hoàn thành 100% bài học và vượt qua bài thi kiểm tra trắc nghiệm cuối khóa để nhận giấy chứng nhận chính thức.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {storedCerts.map((cert) => (
              <div
                key={cert.certificateId}
                className="p-5 bg-gradient-to-br from-white via-slate-50 to-blue-50/30 rounded-2xl border border-blue-100/90 shadow-2xs flex flex-col justify-between gap-4 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      Đã cấp
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {formatCertificateDate(cert)}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-sm text-slate-900 line-clamp-2 group-hover:text-blue-700 transition-colors">
                    {cert.courseTitle}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    Mã số: <strong className="text-slate-700">{cert.certificateId}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCertificate(cert)}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <Eye className="w-4 h-4" />
                    Xem giấy chứng nhận
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteCert(cert, e)}
                    title="Xóa giấy chứng nhận này"
                    className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // If viewing a certificate overlay
  if (selectedCertificate) {
    if (isInline) {
      return (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
            <button
              type="button"
              onClick={() => setSelectedCertificate(null)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại Bảng Thành tích</span>
            </button>
            <span className="text-xs font-bold text-slate-500">
              Giấy chứng nhận: <strong>{selectedCertificate.courseTitle}</strong>
            </span>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden">
            <CertificateView
              certificate={selectedCertificate}
              onClose={() => setSelectedCertificate(null)}
              onDeleteCertificate={(certId) => {
                deleteStoredCertificate(certId);
                refreshCerts();
                setSelectedCertificate(null);
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] my-auto">
          <CertificateView
            certificate={selectedCertificate}
            onClose={() => setSelectedCertificate(null)}
            onDeleteCertificate={(certId) => {
              deleteStoredCertificate(certId);
              refreshCerts();
              setSelectedCertificate(null);
            }}
          />
        </div>
      </div>
    );
  }

  // If rendered as an inline full tab
  if (isInline) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Top Header Title - Unboxed with smooth gradient text */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 pb-1">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-[#0284c7] via-[#0ea5e9] to-[#38bdf8] bg-clip-text text-transparent drop-shadow-2xs">
              Tiến độ học tập & Chứng nhận
            </h2>
          </div>
        </div>

        {mainContent}
      </div>
    );
  }

  // Fallback Popup Modal mode
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-50 w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white p-5 px-6 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-400/20 text-amber-300 rounded-2xl border border-amber-400/30">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                TIẾN ĐỘ HỌC TẬP
              </h2>
              <p className="text-xs text-blue-200/90 font-medium">
                {currentUser?.hoTen} • {currentUser?.chiDoan || 'Học sinh'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto">
          {mainContent}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200/80 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
