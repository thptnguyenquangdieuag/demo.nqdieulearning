import React, { useRef, useState, useEffect } from 'react';
import { IssuedCertificate, CertificateConfig, Course, User } from '../types';
import { Download, Award, CheckCircle, ShieldCheck, Trash2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { toPng } from 'html-to-image';
import schoolLogo from '../assets/logo';
import { deleteStoredCertificate } from '../lib/storage';

interface CertificateViewProps {
  certificate?: IssuedCertificate | null;
  // If viewing in editor preview mode:
  previewConfig?: CertificateConfig;
  previewCourseTitle?: string;
  previewStudentName?: string;
  previewStudentClass?: string;
  previewSignerName?: string;
  onClose?: () => void;
  onDeleteCertificate?: (certificateId: string) => void | Promise<void>;
}

// Helper to pre-convert image URLs to Base64 Data URL to prevent CORS taint
const imageUrlToDataUrl = async (url: string): Promise<string> => {
  if (!url || url.startsWith('data:')) return url;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string) || url);
        reader.onerror = () => resolve(url);
        reader.readAsDataURL(blob);
      });
    }
  } catch (err) {
    console.warn('Could not pre-fetch image as base64:', url, err);
  }
  return url;
};

export const CertificateView: React.FC<CertificateViewProps> = ({
  certificate,
  previewConfig,
  previewCourseTitle = 'Bồi dưỡng chuyên môn Chuyển đổi số trong Giáo dục năm 2026',
  previewStudentName = 'NGUYỄN VĂN A',
  previewStudentClass = '10A1',
  previewSignerName,
  onClose,
  onDeleteCertificate,
}) => {
  const certRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scale, setScale] = useState(1);

  const handleDelete = async () => {
    if (!certificate?.certificateId) return;
    const confirmMsg = `Bạn có chắc chắn muốn xóa Giấy chứng nhận này?\n\n• Mã số: ${certificate.certificateId}\n• Khóa học: ${certificate.courseTitle || previewCourseTitle}\n\nSau khi xóa, bản ghi giấy chứng nhận sẽ bị xóa vĩnh viễn khỏi hệ thống.`;
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    try {
      try {
        await fetch(`/api/certificates/${encodeURIComponent(certificate.certificateId)}`, {
          method: 'DELETE',
        });
      } catch (apiErr) {
        console.warn('API delete certificate warning:', apiErr);
      }

      deleteStoredCertificate(certificate.certificateId);

      if (onDeleteCertificate) {
        await onDeleteCertificate(certificate.certificateId);
      }

      alert('Đã xóa giấy chứng nhận thành công!');
      onClose?.();
    } catch (err: any) {
      console.error('Lỗi khi xóa giấy chứng nhận:', err);
      alert('Không thể xóa giấy chứng nhận: ' + (err?.message || 'Lỗi không xác định'));
    } finally {
      setDeleting(false);
    }
  };

  // Auto scale 4:3 certificate to fit screen container responsively (both width & height)
  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const availableWidth = Math.max(200, containerRef.current.clientWidth - 16); // padding offset
        const scaleW = availableWidth / 1000;

        // Calculate available vertical height in current viewport
        const viewportHeight = window.innerHeight;
        // Available height below top position, with bottom margin buffer
        const availableHeight = Math.max(160, viewportHeight - rect.top - 24);
        const scaleH = availableHeight / 750;

        // Choose the smaller scale factor to ensure it fits both horizontally & vertically
        const computedScale = Math.min(scaleW, scaleH);
        const newScale = Math.min(1, Math.max(0.2, computedScale));
        setScale(newScale);
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateScale());
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateScale);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  // Derive values from certificate object or preview config
  const parentOrg = certificate?.parentOrganization || previewConfig?.parentOrganization || 'ĐOÀN TNCS HỒ CHÍ MINH';
  const org = certificate?.organization || previewConfig?.organization || 'TRƯỜNG THPT NGUYỄN QUANG DIÊU';
  const studentName = certificate?.studentName || previewStudentName || 'HỌ CỦA VÀ TÊN HỌC VIÊN';
  const studentClass = certificate?.studentClass || previewStudentClass || '10A1';
  const courseTitle = certificate?.courseTitle || previewCourseTitle || 'Chuyển đổi số trong Giáo dục';
  const formattedDate = certificate?.formattedDateStr || `Tân An, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;
  const signerTitle = certificate?.signerTitle || previewConfig?.signerTitle || 'GIÁO VIÊN';
  const delegateTitle = certificate?.delegateTitle || previewConfig?.delegateTitle || '';
  const signerName = certificate?.signerName || previewConfig?.signerName || previewSignerName || 'Nguyễn Phúc Nguyên';
  const signatureImg = certificate?.signatureImage || previewConfig?.signatureImage || '';
  const logoImg = certificate?.logoImage || previewConfig?.logoImage || '';
  const logoSize = certificate?.logoSize ?? previewConfig?.logoSize ?? 96;
  const signatureSize = certificate?.signatureSize ?? previewConfig?.signatureSize ?? 80;
  const fontSizeScale = (certificate?.fontSizeScale ?? previewConfig?.fontSizeScale ?? 100) / 100;
  const bgCustomImg = certificate?.bgCustomImage || previewConfig?.bgCustomImage || '';
  const certSuffix = previewConfig?.certNumberSuffix || 'GCN/ĐTN';
  const certNumStr = certificate?.certificateNumberStr || `01-${certSuffix}`;

  const handleDownloadImage = async () => {
    if (!certRef.current) return;
    try {
      setDownloading(true);

      const element = certRef.current;

      // Convert image tags to data URLs to ensure no CORS or taint issues
      const imgElements = Array.from(element.querySelectorAll('img')) as HTMLImageElement[];
      for (const img of imgElements) {
        if (img.src && !img.src.startsWith('data:')) {
          const dataUrl = await imageUrlToDataUrl(img.src);
          if (dataUrl.startsWith('data:')) {
            img.src = dataUrl;
          }
        }
      }

      let imgData = '';
      try {
        // Primary method: html-to-image (supports modern CSS oklch natively)
        imgData = await toPng(element, {
          quality: 1.0,
          pixelRatio: 3, // Ultra High DPI (3000px x 2250px)
          backgroundColor: '#ffffff',
          width: 1000,
          height: 750,
          style: {
            transform: 'scale(1)',
            transformOrigin: 'top left',
          },
        });
      } catch (toPngErr) {
        console.warn('html-to-image failed, trying html2canvas fallback:', toPngErr);
        // Fallback method: html2canvas with oklch cleanup in onclone
        const canvas = await html2canvas(element, {
          scale: 3,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: 1000,
          height: 750,
          windowWidth: 1000,
          windowHeight: 750,
          onclone: (clonedDoc) => {
            const styles = Array.from(clonedDoc.getElementsByTagName('style'));
            styles.forEach((s) => {
              if (s.innerHTML.includes('oklch')) {
                s.innerHTML = s.innerHTML.replace(/oklch\([^)]+\)/g, '#3b82f6');
              }
            });
          },
        });
        imgData = canvas.toDataURL('image/png', 1.0);
      }

      const cleanName = (studentName || 'Hoc_Vien')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]/g, '_');
      const cleanFileName = `Giay_Chung_Nhan_${cleanName}.png`;

      const link = document.createElement('a');
      link.download = cleanFileName;
      link.href = imgData;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Lỗi khi tải ảnh giấy chứng nhận:', err);
      alert('Không thể tải ảnh giấy chứng nhận. Vui lòng thử lại!');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-5xl mx-auto p-2 sm:p-4 animate-in fade-in zoom-in duration-200">
      {/* Action Header */}
      <div className="w-full bg-slate-900 text-white rounded-2xl p-3 sm:p-4 mb-3 sm:mb-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 shrink-0" />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">
                {certificate ? 'Giấy chứng nhận hoàn thành khóa học' : 'Xem trước Giấy chứng nhận'}
              </h3>
              {certificate && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Chính thức • Mã số: <span className="font-mono">{certificate.certificateId}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {certificate && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || downloading}
              title="Xóa giấy chứng nhận"
              aria-label="Xóa giấy chứng nhận"
              className="px-3 py-2 sm:py-2.5 bg-rose-600/90 hover:bg-rose-600 active:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {deleting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Xóa chứng nhận</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={downloading || deleting}
            title="Tải ảnh HD"
            aria-label="Tải ảnh HD"
            className="p-2 sm:p-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center disabled:opacity-50 cursor-pointer"
          >
            {downloading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Certificate Container (Landscape 4:3 Ratio with auto scaling) */}
      <div
        ref={containerRef}
        className="w-full bg-slate-200/60 rounded-2xl border border-slate-300 shadow-inner p-2 sm:p-3 flex flex-col items-center justify-start overflow-hidden"
        style={{
          minHeight: `${Math.max(140, Math.round(750 * scale) + 16)}px`,
        }}
      >
        <div
          style={{
            width: '1000px',
            height: '750px',
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            marginBottom: scale < 1 ? `-${(1 - scale) * 750}px` : '0px',
          }}
          className="shrink-0 transition-transform duration-100 ease-out"
        >
          <div
            ref={certRef}
            className="relative w-[1000px] h-[750px] bg-white text-slate-900 shadow-2xl overflow-hidden flex flex-col justify-between p-12 select-none"
            style={{
              fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, 'Times New Roman', sans-serif",
              backgroundImage: bgCustomImg ? `url(${bgCustomImg})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
          {/* Default Standard Blue & Gold Frame (if no custom background) */}
          {!bgCustomImg && (
            <>
              {/* Outer Blue Border Frame */}
              <div className="absolute inset-0 pointer-events-none border-[14px] border-blue-800" />
              
              {/* Inner Gold Hairline Frame */}
              <div className="absolute inset-[18px] pointer-events-none border-2 border-amber-500/80 rounded-sm" />
              <div className="absolute inset-[24px] pointer-events-none border border-amber-400/50" />

              {/* Decorative Corner Blue Shapes & Golden Laurel Accents */}
              {/* Top Left Corner */}
              <svg className="absolute top-0 left-0 w-44 h-44 pointer-events-none" viewBox="0 0 160 160" fill="none">
                <path d="M0 0 L160 0 L0 160 Z" fill="#1e3a8a" />
                <path d="M0 0 L130 0 L0 130 Z" fill="#2563eb" />
                <path d="M0 0 L100 0 L0 100 Z" fill="#3b82f6" />
                <circle cx="35" cy="35" r="18" fill="#d97706" opacity="0.3" />
                <path d="M25 80 C 40 60, 60 40, 80 25 C 65 40, 40 60, 25 80 Z" fill="#d97706" />
                <path d="M30 65 Q 45 45 65 30" stroke="#f59e0b" strokeWidth="2" fill="none" />
              </svg>

              {/* Top Right Corner */}
              <svg className="absolute top-0 right-0 w-44 h-44 pointer-events-none" viewBox="0 0 160 160" fill="none">
                <path d="M160 0 L0 0 L160 160 Z" fill="#1e3a8a" />
                <path d="M160 0 L30 0 L160 130 Z" fill="#2563eb" />
                <path d="M160 0 L60 0 L160 100 Z" fill="#3b82f6" />
                <path d="M135 80 C 120 60, 100 40, 80 25 C 95 40, 120 60, 135 80 Z" fill="#d97706" />
                <path d="M130 65 Q 115 45 95 30" stroke="#f59e0b" strokeWidth="2" fill="none" />
              </svg>

              {/* Bottom Left Corner */}
              <svg className="absolute bottom-0 left-0 w-44 h-44 pointer-events-none" viewBox="0 0 160 160" fill="none">
                <path d="M0 160 L160 160 L0 0 Z" fill="#1e3a8a" />
                <path d="M0 160 L130 160 L0 30 Z" fill="#2563eb" />
                <path d="M0 160 L100 160 L0 60 Z" fill="#3b82f6" />
                <path d="M25 80 C 40 100, 60 120, 80 135 C 65 120, 40 100, 25 80 Z" fill="#d97706" />
                <path d="M30 95 Q 45 115 65 130" stroke="#f59e0b" strokeWidth="2" fill="none" />
              </svg>

              {/* Bottom Right Corner */}
              <svg className="absolute bottom-0 right-0 w-44 h-44 pointer-events-none" viewBox="0 0 160 160" fill="none">
                <path d="M160 160 L0 160 L160 0 Z" fill="#1e3a8a" />
                <path d="M160 160 L30 160 L160 30 Z" fill="#2563eb" />
                <path d="M160 160 L60 160 L160 60 Z" fill="#3b82f6" />
                <path d="M135 80 C 120 100, 100 120, 80 135 C 95 120, 120 100, 135 80 Z" fill="#d97706" />
                <path d="M130 95 Q 115 115 95 130" stroke="#f59e0b" strokeWidth="2" fill="none" />
              </svg>

              {/* Bottom Star Accent */}
              <div className="absolute bottom-[20px] left-1/2 -translate-x-1/2 pointer-events-none">
                <span className="text-amber-500 text-xl font-bold">★</span>
              </div>
            </>
          )}

          {/* CERTIFICATE CONTENT HEADER */}
          <div className="relative z-10 flex flex-col items-center text-center mt-2">
            {/* Lower parentOrganization and organization down by 1 cm (approx 38px / pt-10) */}
            <div className="pt-[38px]">
              <h4 
                className="font-bold uppercase tracking-wider text-slate-900 leading-tight"
                style={{ fontSize: `${Math.round(18 * fontSizeScale)}px` }}
              >
                {parentOrg}
              </h4>
              <h3 
                className="font-extrabold uppercase tracking-widest text-blue-900 leading-tight mt-0.5"
                style={{ fontSize: `${Math.round(20 * fontSizeScale)}px` }}
              >
                {org}
              </h3>
            </div>

            {/* Logo Image */}
            <div className="mt-3 my-1 h-24 flex items-center justify-center relative">
              <img
                src={logoImg || schoolLogo}
                alt="Logo"
                crossOrigin="anonymous"
                style={{ height: `${logoSize}px`, width: 'auto', maxWidth: '350px', zIndex: 20 }}
                className="object-contain relative z-20 pointer-events-none drop-shadow-xs"
                onError={(e) => { (e.target as HTMLImageElement).src = schoolLogo; }}
              />
            </div>
          </div>

          {/* MAIN CERTIFICATE TITLE & RECIPIENT */}
          <div className="relative z-10 flex flex-col items-center text-center my-auto px-12">
            {/* Certificate title */}
            <h1 
              className="font-black text-red-600 uppercase tracking-widest my-2 drop-shadow-sm"
              style={{ fontSize: `${Math.round(36 * fontSizeScale)}px` }}
            >
              GIẤY CHỨNG NHẬN
            </h1>

            <div className="w-24 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent my-2" />

            <div className="space-y-2 mt-2">
              <div 
                className="text-slate-800"
                style={{ fontSize: `${Math.round(22 * fontSizeScale)}px` }}
              >
                Em:{' '}
                <span className="font-bold text-emerald-600 uppercase tracking-wide px-1">
                  {studentName}
                </span>
              </div>

              <div 
                className="font-bold text-slate-900"
                style={{ fontSize: `${Math.round(18 * fontSizeScale)}px` }}
              >
                Học sinh lớp: <span className="text-slate-900 font-bold">{studentClass}</span> năm học 2026 - 2027
              </div>

              <div 
                className="text-slate-800 max-w-2xl mt-3 leading-relaxed"
                style={{ fontSize: `${Math.round(17 * fontSizeScale)}px` }}
              >
                Đã hoàn thành khóa học {courseTitle}
              </div>
            </div>
          </div>

          {/* FOOTER & SIGNATURE BLOCK */}
          <div className="relative z-10 flex items-end justify-between px-16 pb-8 mb-4">
            {/* Bottom Left: Certificate Number */}
            <div className="flex flex-col text-left pl-8 pb-3">
              <p 
                className="font-bold text-slate-900"
                style={{
                  fontSize: `${Math.round(15 * fontSizeScale)}px`,
                  textShadow: '0 0 8px #ffffff, 0 0 12px #ffffff, -1px -1px 0 #ffffff, 1px -1px 0 #ffffff, -1px 1px 0 #ffffff, 1px 1px 0 #ffffff'
                }}
              >
                Số: <span className="font-bold">{certNumStr}</span>
              </p>
            </div>

            {/* Bottom Right: Signature Block */}
            <div className="flex flex-col items-center text-center min-w-[280px] pr-8">
              {/* Date String */}
              <p 
                className="italic text-slate-800 mb-1"
                style={{ fontSize: `${Math.round(15 * fontSizeScale)}px` }}
              >
                {formattedDate}
              </p>

              {/* Signer Title */}
              <p 
                className="font-bold uppercase tracking-wider text-slate-900"
                style={{ fontSize: `${Math.round(15 * fontSizeScale)}px` }}
              >
                {signerTitle}
              </p>

              {/* Delegate Title if present */}
              {delegateTitle && (
                <p 
                  className="font-bold uppercase tracking-wider text-slate-800 mt-0.5"
                  style={{ fontSize: `${Math.round(13 * fontSizeScale)}px` }}
                >
                  {delegateTitle}
                </p>
              )}

              {/* Signature Image or Spacer */}
              <div className="h-20 flex items-center justify-center my-1 relative">
                {signatureImg ? (
                  <img 
                    src={signatureImg} 
                    alt="Signature" 
                    crossOrigin="anonymous" 
                    style={{ height: `${signatureSize}px`, width: 'auto', maxWidth: '350px', zIndex: 20 }}
                    className="object-contain relative z-20 pointer-events-none" 
                  />
                ) : (
                  <div className="text-slate-400 italic text-xs">
                    (Ảnh chữ ký)
                  </div>
                )}
              </div>

              {/* Signer Name */}
              <p 
                className="font-bold text-blue-950 mt-1"
                style={{
                  fontSize: `${Math.round(18 * fontSizeScale)}px`,
                  textShadow: '0 0 8px #ffffff, 0 0 12px #ffffff, -1px -1px 0 #ffffff, 1px -1px 0 #ffffff, -1px 1px 0 #ffffff, 1px 1px 0 #ffffff'
                }}
              >
                {signerName}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
};
