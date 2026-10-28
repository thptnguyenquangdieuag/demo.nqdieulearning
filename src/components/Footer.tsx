import React from 'react';
import { Building2, Phone, Mail, Award } from 'lucide-react';
import schoolLogo from '../assets/logo';

interface FooterProps {
  isCollapsed?: boolean;
  hasUser?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ isCollapsed = false, hasUser = false }) => {
  if (hasUser) {
    return (
      <footer className="sticky bottom-0 z-30 mt-auto w-full bg-slate-900/95 backdrop-blur-md text-slate-300 text-xs sm:text-sm border-t border-slate-800 py-2.5 px-4 sm:px-8 shadow-2xl transition-all duration-300">
        <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-4">
          {/* Left: Developer Box */}
          <div className="flex items-center gap-2 text-slate-300 text-xs bg-slate-800/90 px-3.5 py-1.5 rounded-xl border border-slate-700 shadow-xs">
            <Award className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              © Phát triển bởi{' '}
              <strong className="font-black text-amber-300 hover:text-amber-200 transition-colors">
                Nguyễn Phúc Nguyên
              </strong>
            </span>
          </div>

          {/* Right: Support Contact (Desktop & Tablet only) */}
          <div className="hidden sm:flex flex-wrap items-center justify-center sm:justify-end gap-x-3 gap-y-1 text-slate-300 text-xs">
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Hỗ trợ: <strong className="text-white font-bold">0819.817.154</strong></span>
            </div>
            <span className="hidden sm:inline text-slate-600 font-bold">|</span>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Email: <strong className="text-sky-200 font-medium">npnguyen.c3nqd@gmail.com</strong></span>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer
      className="sticky bottom-0 z-30 mt-auto w-full bg-slate-900/95 backdrop-blur-md text-slate-300 text-xs sm:text-sm border-t border-slate-800 py-2.5 sm:py-3 px-4 sm:px-8 shadow-2xl transition-all duration-300"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2 md:gap-4">
        {/* Left: Teacher & Location (Desktop & Tablet only) */}
        <div className="hidden sm:flex items-center gap-2 text-center md:text-left">
          <img
            src={schoolLogo}
            alt="Logo"
            className="w-5 h-5 object-contain shrink-0 drop-shadow-xs"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.target as HTMLImageElement).src = './logo.png'; }}
          />
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2">
            <span className="font-bold text-white uppercase tracking-wide text-xs sm:text-sm">
              TRƯỜNG THPT NGUYỄN QUANG DIÊU
            </span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="text-slate-400 text-[11px] sm:text-xs">
              Ấp Tân Hoà C, xã Tân An, tỉnh An Giang
            </span>
          </div>
        </div>

        {/* Center: Contact Info (Desktop & Tablet only) */}
        <div className="hidden sm:flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-slate-300 text-xs">
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-amber-400" />
            <span>Hỗ trợ: <strong className="text-white">0819.817.154</strong></span>
          </div>
          <span className="hidden sm:inline text-slate-600">|</span>
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] sm:text-xs">Email: npnguyen.c3nqdn@gmail.com</span>
          </div>
        </div>

        {/* Right / Mobile: Developer Box */}
        <div className="flex items-center gap-1.5 text-slate-400 text-[11px] sm:text-xs bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 shadow-xs">
          <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            © Phát triển bởi{' '}
            <strong className="font-extrabold text-amber-300 hover:text-amber-200 transition-colors drop-shadow-xs">
              Nguyễn Phúc Nguyên
            </strong>
          </span>
        </div>
      </div>
    </footer>
  );
};

