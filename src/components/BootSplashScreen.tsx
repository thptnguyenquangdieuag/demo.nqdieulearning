import React from 'react';
import { motion } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import bootLogo from '../assets/images/school_logo_1785734354463.png';

export interface BootSyncStep {
  id: string;
  label: string;
  status: 'waiting' | 'in_progress' | 'completed' | 'error';
  detail?: string;
}

interface BootSplashScreenProps {
  progress: number;
  statusMessage: string;
  subMessage?: string;
  steps?: BootSyncStep[];
  onSkip?: () => void;
  canSkip?: boolean;
  isCompleted?: boolean;
  hideSteps?: boolean;
}

export const BootSplashScreen: React.FC<BootSplashScreenProps> = ({
  progress,
  statusMessage,
  subMessage,
  isCompleted = false,
}) => {
  const roundedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a447c] text-white p-4 sm:p-6 select-none">
      {/* Background subtle radial gradient to replicate image.png */}
      <div className="absolute inset-0 bg-radial from-[#25589c] via-[#1a447c] to-[#12315b] pointer-events-none" />

      {/* Main Centered Content */}
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-lg flex flex-col items-center text-center z-10"
      >
        {/* School Logo without surrounding box, border, or lightning badge */}
        <div className="relative mb-4 sm:mb-5 flex items-center justify-center">
          <img
            src={bootLogo}
            alt="Logo Trường THPT Nguyễn Quang Diêu"
            className="w-32 h-32 sm:w-36 sm:h-36 object-contain drop-shadow-2xl select-none"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Institution Title */}
        <div className="mb-3">
          <h2 className="text-sm sm:text-base md:text-xl font-extrabold text-white uppercase tracking-wider drop-shadow-md">
            TRƯỜNG THPT NGUYỄN QUANG DIÊU
          </h2>
        </div>

        {/* Brand Box: Dòng 1 "NQDIEU LEARNING", Dòng 2 "NỀN TẢNG HỌC TẬP TRỰC TUYẾN" */}
        <div className="mb-3.5 w-full max-w-sm sm:max-w-md px-6 py-2.5 sm:py-3 rounded-2xl bg-[#1e3a66] border-2 border-[#eab308] shadow-lg shadow-black/20 flex flex-col items-center justify-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-white font-extrabold text-xl sm:text-2xl md:text-3xl tracking-wider">
              NQDIEU
            </span>
            <span className="text-[#facc15] font-extrabold text-xl sm:text-2xl md:text-3xl tracking-wider">
              LEARNING
            </span>
          </div>
          <div className="text-xs sm:text-sm md:text-base font-bold text-blue-100/95 tracking-widest uppercase mt-1 sm:mt-1.5">
            NỀN TẢNG AI HỌC TẬP TRỰC TUYẾN
          </div>
        </div>

        {/* Loading Progress Bar (Không đóng hộp) */}
        <div className="w-full max-w-sm sm:max-w-md text-left mt-5 mb-5 px-1 sm:px-0">
          {/* Row 1: Spinning Icon + Status Title + Percentage */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <RefreshCw
                className={`w-4 h-4 sm:w-5 sm:h-5 text-[#facc15] shrink-0 ${isCompleted ? '' : 'animate-spin'}`}
              />
              <span className="font-bold text-white text-xs sm:text-sm md:text-base truncate drop-shadow-xs">
                {statusMessage}
              </span>
            </div>
            <span className="font-extrabold text-[#facc15] text-xs sm:text-sm md:text-base tabular-nums shrink-0 drop-shadow-xs">
              {roundedProgress}%
            </span>
          </div>

          {/* Row 2: Progress Track & Gradient Bar */}
          <div className="w-full h-2 sm:h-2.5 bg-[#0d1e38]/80 rounded-full overflow-hidden p-0.5 mt-2.5 border border-blue-400/30 shadow-inner">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#facc15] via-[#2dd4bf] to-[#34d399] shadow-sm"
              initial={{ width: '5%' }}
              animate={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Developer Attribution Credit */}
        <p className="text-xs sm:text-sm md:text-base font-bold text-white/95 uppercase tracking-wider drop-shadow-md">
          © PHÁT TRIỂN BỞI NGUYỄN PHÚC NGUYÊN
        </p>
      </motion.div>
    </div>
  );
};
