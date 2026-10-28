import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, X, WifiOff, Info } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'warning' | 'error' | 'success' | 'info';
  title: string;
  message?: string;
  durationMs?: number;
}

export const notifySyncStatus = (
  type: 'warning' | 'error' | 'success' | 'info',
  title: string,
  message: string = '',
  durationMs?: number
) => {
  const event = new CustomEvent('sync-toast-notification', {
    detail: { type, title, message, id: Date.now().toString(), durationMs },
  });
  window.dispatchEvent(event);
};

export const clearSyncToasts = () => {
  window.dispatchEvent(new CustomEvent('clear-sync-toasts'));
};

export const SyncNotificationToast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ToastMessage>;
      if (customEvent.detail) {
        const newToast = customEvent.detail;
        setToasts((prev) => [...prev.slice(-2), newToast]);

        const duration =
          newToast.durationMs || (newToast.type === 'success' ? 4500 : newToast.type === 'info' ? 8000 : 6000);

        const timer = setTimeout(() => {
          removeToast(newToast.id);
        }, duration);

        return () => clearTimeout(timer);
      }
    };

    const handleClearEvent = () => {
      setToasts([]);
    };

    window.addEventListener('sync-toast-notification', handleToastEvent);
    window.addEventListener('clear-sync-toasts', handleClearEvent);
    return () => {
      window.removeEventListener('sync-toast-notification', handleToastEvent);
      window.removeEventListener('clear-sync-toasts', handleClearEvent);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[99999] flex flex-col gap-2.5 max-w-lg w-auto pointer-events-none">
      {toasts.map((toast) => {
        const isWarning = toast.type === 'warning';
        const isError = toast.type === 'error';
        const isInfo = toast.type === 'info';
        const hasBoth = Boolean(toast.title && toast.message);

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-2.5 sm:py-3 rounded-2xl shadow-xl border backdrop-blur-md transition-all flex ${
              hasBoth ? 'items-start' : 'items-center'
            } gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              isWarning
                ? 'bg-amber-900/95 text-amber-100 border-amber-600/60'
                : isError
                ? 'bg-rose-900/95 text-rose-100 border-rose-600/60'
                : isInfo
                ? 'bg-[#1e40af] text-white border-blue-500/50'
                : 'bg-[#065f46] text-white border-emerald-500/50'
            }`}
          >
            {isWarning && <WifiOff className="w-5 h-5 text-amber-300 shrink-0" />}
            {isError && <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0" />}
            {isInfo && <Info className="w-5 h-5 text-blue-200 shrink-0" />}
            {!isWarning && !isError && !isInfo && (
              <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            )}

            {hasBoth ? (
              <div className="flex-1 text-xs sm:text-sm">
                <h4 className="font-bold text-white leading-tight mb-0.5">{toast.title}</h4>
                <p className="opacity-90 leading-relaxed text-slate-200 text-xs">{toast.message}</p>
              </div>
            ) : (
              <div className="flex-1 text-xs sm:text-sm font-semibold text-white leading-snug">
                {toast.title || toast.message}
              </div>
            )}

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-white/15 rounded-lg text-white/70 hover:text-white transition-colors shrink-0 ml-1 cursor-pointer"
              title="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
