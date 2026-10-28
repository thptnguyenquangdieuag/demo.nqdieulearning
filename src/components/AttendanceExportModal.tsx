import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Calendar, CheckCircle2, AlertCircle, RefreshCw, X, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

interface AvailableDateItem {
  date: string;
  count: number;
}

interface AttendanceExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
}

export const AttendanceExportModal: React.FC<AttendanceExportModalProps> = ({
  isOpen,
  onClose,
  courseId,
  courseTitle,
}) => {
  const [exportMode, setExportMode] = useState<'ALL' | 'SPECIFIC'>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<AvailableDateItem[]>([]);
  const [isLoadingDates, setIsLoadingDates] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Fetch available dates when modal opens
  useEffect(() => {
    if (isOpen && courseId) {
      setErrorMsg('');
      setIsLoadingDates(true);
      fetch(`/api/attendance/export/${encodeURIComponent(courseId)}?date=ALL`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.availableDates)) {
            setAvailableDates(data.availableDates);
            if (data.availableDates.length > 0) {
              setSelectedDate(data.availableDates[0].date);
            } else {
              const today = new Date().toISOString().split('T')[0];
              setSelectedDate(today);
            }
          }
        })
        .catch((err) => {
          console.error('Error fetching attendance dates:', err);
        })
        .finally(() => {
          setIsLoadingDates(false);
        });
    }
  }, [isOpen, courseId]);

  if (!isOpen) return null;

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handleExecuteExport = async () => {
    if (!courseId) return;

    const targetDate = exportMode === 'ALL' ? 'ALL' : selectedDate;
    if (exportMode === 'SPECIFIC' && !targetDate) {
      setErrorMsg('Vui lòng chọn ngày cần xuất điểm danh!');
      return;
    }

    setIsExporting(true);
    setErrorMsg('');

    try {
      const url = `/api/attendance/export/${encodeURIComponent(courseId)}?date=${encodeURIComponent(targetDate)}`;
      const res = await fetch(url);
      const contentType = res.headers.get('content-type') || '';

      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.rows && data.rows.length > 0) {
          const worksheet = XLSX.utils.json_to_sheet(data.rows);
          const cols = [
            { wch: 6 },  // STT
            { wch: 25 }, // Họ tên
            { wch: 15 }, // Lớp
            { wch: 22 }, // Tên tài khoản
          ];
          for (let i = 1; i <= (data.maxSessions || 1); i++) {
            cols.push({ wch: 28 });
          }
          worksheet['!cols'] = cols;

          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'DiemDanh');

          const cleanTitle = (courseTitle || 'KhoaHoc')
            .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF -]/g, '')
            .trim()
            .replace(/\s+/g, '_');

          const dateTag = exportMode === 'ALL' ? 'Tat_Ca_Ngay' : targetDate.replace(/-/g, '_');
          const fileName = `Danh_Sach_Diem_Danh_${cleanTitle}_${dateTag}.xlsx`;

          XLSX.writeFile(workbook, fileName);
          setIsExporting(false);
          onClose();
          return;
        } else if (data.message) {
          setErrorMsg(data.message);
          setIsExporting(false);
          return;
        }
      }

      setErrorMsg('Không tìm thấy dữ liệu điểm danh phù hợp cho lựa chọn này!');
    } catch (err: any) {
      console.error('Export error:', err);
      setErrorMsg('Không thể xuất file điểm danh: ' + (err?.message || 'Lỗi hệ thống'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col max-h-[min(90vh,540px)] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 px-4 py-3 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/10 rounded-xl">
              <FileSpreadsheet className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight">
                Xuất Danh Sách Điểm Danh (Excel)
              </h3>
              <p className="text-[11px] text-emerald-100/90 line-clamp-1 mt-0.5">
                {courseTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5 text-slate-800 overflow-y-auto flex-1">
          <div>
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-emerald-600" />
              <span>Phạm Vi Xuất Điểm Danh</span>
            </label>

            <div className="grid grid-cols-1 gap-2.5">
              {/* Option 1: ALL DATES */}
              <label
                className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all flex items-start gap-2.5 cursor-pointer ${
                  exportMode === 'ALL'
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-2xs'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/80'
                }`}
              >
                <input
                  type="radio"
                  name="exportMode"
                  value="ALL"
                  checked={exportMode === 'ALL'}
                  onChange={() => setExportMode('ALL')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Tất cả các ngày</span>
                    {availableDates.length > 0 && (
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        {availableDates.length} ngày đã ghi nhận
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Xuất toàn bộ lịch sử điểm danh của tất cả các buổi học từ trước đến nay.
                  </p>
                </div>
              </label>

              {/* Option 2: SPECIFIC DATE */}
              <label
                className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all flex items-start gap-2.5 cursor-pointer ${
                  exportMode === 'SPECIFIC'
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-2xs'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/80'
                }`}
              >
                <input
                  type="radio"
                  name="exportMode"
                  value="SPECIFIC"
                  checked={exportMode === 'SPECIFIC'}
                  onChange={() => setExportMode('SPECIFIC')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="space-y-0.5 w-full">
                  <div className="text-xs font-bold text-slate-900">
                    Chọn ngày điểm danh cụ thể
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Chỉ xuất danh sách học sinh tham gia điểm danh trong một ngày được chọn.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Date Picker Section when SPECIFIC mode is chosen */}
          {exportMode === 'SPECIFIC' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in duration-150">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>Chọn ngày xuất dữ liệu:</span>
                </span>
                {isLoadingDates && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Đang tải lịch...
                  </span>
                )}
              </label>

              {availableDates.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    {availableDates.map((item) => (
                      <option key={item.date} value={item.date}>
                        Ngày {formatDateDisplay(item.date)} ({item.count} lượt điểm danh)
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Hoặc chọn từ lịch:</span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="p-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 cursor-pointer"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-500 italic">
                    Chưa có danh sách ngày gợi ý, bạn có thể chọn ngày trực tiếp ở trên.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error display */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selected scope summary box */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="leading-tight">
              <b>Phạm vi xuất:</b>{' '}
              {exportMode === 'ALL'
                ? 'Tất cả các ngày điểm danh'
                : `Ngày ${formatDateDisplay(selectedDate)}`}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleExecuteExport}
            disabled={isExporting}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-98"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang kết xuất Excel...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Xuất File Excel (.xlsx)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
