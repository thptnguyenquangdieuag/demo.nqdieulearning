import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Apple, CheckCircle2, X, Sparkles, Share2, PlusSquare, ArrowUpRight } from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'AUTO' | 'IOS' | 'ANDROID'>(
    isIOS ? 'IOS' : isAndroid ? 'ANDROID' : 'AUTO'
  );
  const [installing, setInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    setInstalling(true);
    try {
      const success = await install();
      if (success) {
        setInstallSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 px-6 py-5 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner overflow-hidden shrink-0">
              <img src="./pwa-192x192.png" alt="App Icon" className="w-9 h-9 object-contain drop-shadow" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-blue-100 font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Cài đặt ứng dụng di động</span>
              </div>
              <h2 className="text-xl font-black tracking-tight">NQDieu Learning App</h2>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-100 bg-slate-50/60 p-1.5 gap-1.5">
          <button
            onClick={() => setActiveTab('AUTO')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'AUTO'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Cài Nhanh</span>
          </button>
          <button
            onClick={() => setActiveTab('ANDROID')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'ANDROID'
                ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            <span>Android</span>
          </button>
          <button
            onClick={() => setActiveTab('IOS')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'IOS'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Apple className="w-3.5 h-3.5 text-slate-800" />
            <span>iPhone / iPad</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {isInstalled || installSuccess ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Ứng dụng đã được cài đặt!</h3>
              <p className="text-xs text-slate-600 max-w-xs mx-auto">
                Bạn có thể mở NQDieu Learning trực tiếp từ màn hình chính điện thoại bất cứ lúc nào.
              </p>
            </div>
          ) : activeTab === 'AUTO' ? (
            <div className="space-y-4">
              <div className="bg-blue-50/80 border border-blue-100 rounded-2xl p-4 text-xs text-blue-900 leading-relaxed">
                <p className="font-bold text-sm mb-1 text-blue-950">Ưu điểm khi cài đặt ứng dụng PWA:</p>
                <ul className="space-y-1 list-disc list-inside text-blue-800">
                  <li>Không chiếm dung lượng điện thoại (siêu nhẹ).</li>
                  <li>Mở toàn màn hình mượt mà như app tải từ CH Play / App Store.</li>
                  <li>Truy cập bài học và kiểm tra nhanh chóng không cần gõ link web.</li>
                </ul>
              </div>

              {isInstallable ? (
                <button
                  onClick={handleInstallClick}
                  disabled={installing}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm rounded-2xl shadow-lg hover:shadow-xl hover:scale-101 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{installing ? 'Đang cài đặt...' : 'Cài đặt ngay vào điện thoại'}</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 text-center">
                    Nếu trình duyệt chưa hiện nút cài tự động, hãy chọn hướng dẫn tương ứng với thiết bị của bạn:
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => setActiveTab('ANDROID')}
                      className="p-3 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200/80 rounded-2xl text-left transition-all cursor-pointer"
                    >
                      <Smartphone className="w-5 h-5 text-emerald-600 mb-1" />
                      <div className="font-bold text-xs text-emerald-950">Máy Android</div>
                      <div className="text-[10px] text-emerald-700">Samsung, Xiaomi, Oppo...</div>
                    </button>
                    <button
                      onClick={() => setActiveTab('IOS')}
                      className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-2xl text-left transition-all cursor-pointer"
                    >
                      <Apple className="w-5 h-5 text-slate-800 mb-1" />
                      <div className="font-bold text-xs text-slate-950">iPhone / iPad</div>
                      <div className="text-[10px] text-slate-600">Hệ điều hành iOS Safari</div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'ANDROID' ? (
            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <div>
                  <p className="font-bold text-slate-900">Mở trên Google Chrome</p>
                  <p className="text-slate-500 text-[11px]">Đảm bảo bạn đang mở liên kết này bằng trình duyệt Chrome hoặc Cốc Cốc.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <div>
                  <p className="font-bold text-slate-900">Bấm menu dấu 3 chấm (⋮)</p>
                  <p className="text-slate-500 text-[11px]">Nằm ở góc trên cùng bên phải màn hình điện thoại.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-2xl">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </span>
                <div>
                  <p className="font-bold text-emerald-950">Chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính"</p>
                  <p className="text-emerald-800 text-[11px]">Hệ thống sẽ tự động tạo biểu tượng NQDieu Learning trên màn hình điện thoại.</p>
                </div>
              </div>

              {isInstallable && (
                <button
                  onClick={handleInstallClick}
                  disabled={installing}
                  className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Bấm để cài đặt ngay (Chrome)</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <div>
                  <p className="font-bold text-slate-900">Mở trang web bằng trình duyệt Safari</p>
                  <p className="text-slate-500 text-[11px]">Apple chỉ hỗ trợ cài đặt PWA qua trình duyệt Safari gốc trên iPhone/iPad.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <div>
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    Bấm nút Chia sẻ <Share2 className="w-3.5 h-3.5 text-blue-600 inline" />
                  </p>
                  <p className="text-slate-500 text-[11px]">Biểu tượng hình vuông có mũi tên chỉ lên ở thanh công cụ dưới đáy Safari.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-blue-50/70 border border-blue-200/60 rounded-2xl">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </span>
                <div>
                  <p className="font-bold text-blue-950 flex items-center gap-1.5">
                    Chọn "Thêm vào MH chính" <PlusSquare className="w-3.5 h-3.5 text-blue-700 inline" />
                  </p>
                  <p className="text-blue-800 text-[11px]">Cuộn xuống danh sách tùy chọn, bấm <strong>Thêm vào màn hình chính (Add to Home Screen)</strong> rồi bấm <strong>Thêm</strong> ở góc trên bên phải.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">PWA Version 2.0 • Hoàn toàn miễn phí</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
