import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { BadgeItem } from '../lib/achievements';
import { IssuedCertificate } from '../types';
import {
  Trophy,
  Award,
  Sparkles,
  CheckCircle2,
  X,
  Star,
  Zap,
  Shield,
  Clock,
} from 'lucide-react';

interface CongratulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  badge?: BadgeItem | null;
  certificate?: IssuedCertificate | null;
  onViewAchievements?: () => void;
  onViewCertificate?: (cert: IssuedCertificate) => void;
}

export const CongratulationModal: React.FC<CongratulationModalProps> = ({
  isOpen,
  onClose,
  badge,
  certificate,
  onViewAchievements,
  onViewCertificate,
}) => {
  useEffect(() => {
    if (isOpen) {
      try {
        const count = 160;
        const defaults = {
          origin: { y: 0.5 },
          zIndex: 9999,
        };

        function fire(particleRatio: number, opts: confetti.Options) {
          confetti({
            ...defaults,
            ...opts,
            particleCount: Math.floor(count * particleRatio),
          });
        }

        fire(0.25, {
          spread: 26,
          startVelocity: 45,
        });
        fire(0.2, {
          spread: 60,
        });
        fire(0.35, {
          spread: 100,
          decay: 0.91,
          scalar: 0.8,
        });
        fire(0.1, {
          spread: 120,
          startVelocity: 25,
          decay: 0.92,
          scalar: 1.1,
        });
      } catch (err) {
        console.warn('Confetti effect error:', err);
      }
    }
  }, [isOpen]);

  if (!isOpen || (!badge && !certificate)) return null;

  const renderBadgeIcon = (iconName: string) => {
    switch (iconName) {
      case 'Star':
        return <Star className="w-7 h-7 sm:w-8 sm:h-8 text-white" />;
      case 'Zap':
        return <Zap className="w-7 h-7 sm:w-8 sm:h-8 text-white" />;
      case 'Shield':
        return <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-white" />;
      case 'Award':
        return <Award className="w-7 h-7 sm:w-8 sm:h-8 text-white" />;
      case 'Trophy':
        return <Trophy className="w-7 h-7 sm:w-8 sm:h-8 text-white" />;
      default:
        return <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-white" />;
    }
  };

  return (
    <div
      id="modal-congratulation-backdrop"
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-3 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        id="modal-congratulation-card"
        className="relative bg-white w-full max-w-sm sm:max-w-md rounded-2xl shadow-2xl border border-amber-300/80 overflow-hidden text-slate-900 flex flex-col my-auto max-h-[min(460px,92vh)] animate-in zoom-in-95 duration-200"
      >
        {/* Background Gradient Header Banner - Compact for 1366x600 */}
        <div className="relative bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 px-3.5 py-2 sm:py-2.5 text-center text-white overflow-hidden shrink-0">
          {/* Decorative background light */}
          <div className="absolute -top-10 -left-10 w-20 h-20 bg-white/15 rounded-full blur-lg pointer-events-none" />
          <div className="absolute -bottom-8 -right-8 w-20 h-20 bg-yellow-300/20 rounded-full blur-lg pointer-events-none" />

          {/* Close button */}
          <button
            id="btn-close-congratulation"
            onClick={onClose}
            className="absolute top-2 right-2 p-1 text-white/80 hover:text-white bg-black/15 hover:bg-black/25 rounded-full transition-colors cursor-pointer z-10"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Top Sparkling Header */}
          <div className="flex items-center justify-center gap-1.5">
            <span className="p-1 bg-white/20 backdrop-blur-md rounded-lg border border-white/30 shadow-xs inline-flex">
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-200" />
            </span>
            <h2 className="text-base sm:text-lg font-black tracking-tight drop-shadow-sm text-white uppercase">
              Chúc Mừng Bạn!
            </h2>
          </div>

          <p className="text-amber-100 text-[10px] sm:text-[11px] font-medium mt-0.5 line-clamp-1">
            {badge && certificate
              ? 'Bạn vừa đạt danh hiệu mới và nhận giấy chứng nhận!'
              : badge
              ? 'Bạn vừa xuất sắc mở khóa được một danh hiệu mới!'
              : 'Bạn vừa hoàn thành khóa học và nhận Giấy chứng nhận!'}
          </p>
        </div>

        {/* Modal Body - Scrollable if content exceeds */}
        <div className="p-2.5 sm:p-3 space-y-2 bg-gradient-to-b from-amber-50/40 via-white to-white overflow-y-auto">
          {/* Badge Display Box - Compact & Informative */}
          {badge && (
            <div className="p-2.5 bg-white rounded-xl border border-amber-200 shadow-xs flex items-center gap-2.5 sm:gap-3 relative overflow-hidden">
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${badge.badgeGradient} flex items-center justify-center shadow-sm ring-2 ring-amber-300/40 shrink-0`}
              >
                {renderBadgeIcon(badge.iconName)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5 mb-0.5">
                  <span className="text-[9px] sm:text-[10px] font-black tracking-wider uppercase text-amber-600">
                    Danh hiệu học tập
                  </span>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[9px] font-bold shrink-0">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                    ĐÃ ĐẠT
                  </span>
                </div>

                <h3 className="text-xs sm:text-sm font-black text-slate-900 leading-tight truncate">
                  {badge.title}
                </h3>
                <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-tight">
                  {badge.description}
                </p>

                {/* 7-day validity badge notice */}
                <div className="mt-1 flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-amber-800 bg-amber-50/90 border border-amber-200/80 px-1.5 py-0.5 rounded-md w-fit">
                  <Clock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  <span>Hiệu lực: 7 ngày (tự thu hồi sau 7 ngày)</span>
                </div>
              </div>
            </div>
          )}

          {/* Certificate Display Box */}
          {certificate && (
            <div className="p-2.5 bg-white rounded-xl border border-blue-200 shadow-xs flex items-center gap-2.5 relative overflow-hidden">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg shadow-sm shrink-0">
                <Award className="w-5 h-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-blue-600 mb-0.5">
                  <Sparkles className="w-2.5 h-2.5 text-blue-500" />
                  GIẤY CHỨNG NHẬN CHÍNH THỨC
                </div>
                <h4 className="font-extrabold text-xs text-slate-900 truncate">
                  {certificate.courseTitle}
                </h4>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Mã số: {certificate.certificateId}
                </p>
              </div>
            </div>
          )}

          {/* Encouragement text */}
          <div className="p-1.5 sm:p-2 bg-amber-100/60 rounded-lg border border-amber-200/70 text-center">
            <p className="text-[10px] sm:text-[11px] text-amber-900 font-medium leading-tight">
              🎉 Hãy tiếp tục phát huy tinh thần siêng năng và giữ vững phong độ học tập tốt nhé!
            </p>
          </div>
        </div>

        {/* Footer Actions - Compact & Always Visible */}
        <div className="p-2 sm:p-2.5 bg-white border-t border-slate-100 flex items-center justify-center shrink-0">
          <button
            id="btn-confirm-congratulation"
            onClick={onClose}
            className="w-full sm:w-auto min-w-[130px] px-5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer shadow-xs hover:shadow active:scale-95 text-center"
          >
            Tuyệt vời!
          </button>
        </div>
      </div>
    </div>
  );
};
