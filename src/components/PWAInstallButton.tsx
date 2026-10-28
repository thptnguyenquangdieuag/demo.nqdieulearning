import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';
import { Smartphone, Download, Sparkles } from 'lucide-react';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'header' | 'sidebar' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ className = '', variant = 'header' }) => {
  const { isInstalled } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);

  // If already installed and running standalone, hide the prompt
  if (isInstalled) return null;

  if (variant === 'sidebar') {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-amber-700 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 hover:border-amber-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer ${className}`}
        >
          <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Smartphone className="w-3.5 h-3.5" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <div className="text-[11px] font-black text-amber-900 leading-tight truncate">Cài App trên điện thoại</div>
            <div className="text-[9px] text-amber-600/90 leading-none">Android & iOS (PWA)</div>
          </div>
        </button>

        <PWAInstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  // Default header button
  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xs hover:shadow-md hover:scale-102 transition-all cursor-pointer ${className}`}
        title="Cài đặt ứng dụng NQDieu Learning trên điện thoại Android / iOS"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Cài App ĐT</span>
        <span className="sm:hidden">App</span>
      </button>

      <PWAInstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};
