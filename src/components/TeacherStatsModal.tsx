import React, { useEffect, useState } from 'react';
import { StudentReport, Course } from '../types';
import { X, BarChart2, Users, CheckCircle, XCircle, RotateCcw, AlertCircle, RefreshCw, FileSpreadsheet, Trophy } from 'lucide-react';
import * as XLSX from 'xlsx';
import { LeaderboardModal } from './LeaderboardModal';
import { AttendanceExportModal } from './AttendanceExportModal';
import { deleteStoredCertificateForUserCourse, deleteStoredQuizStatus, deleteStoredQuizProgress } from '../lib/storage';

interface TeacherStatsModalProps {
  isOpen: boolean;
  courseId: string | null;
  courseTitle: string;
  onClose: () => void;
}

export const TeacherStatsModal: React.FC<TeacherStatsModalProps> = ({
  isOpen,
  courseId,
  courseTitle,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentReport[]>([]);
  const [passingScore, setPassingScore] = useState(80);
  const [errorMsg, setErrorMsg] = useState('');
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [attendanceExportModalOpen, setAttendanceExportModalOpen] = useState(false);

  const fetchStats = async () => {
    if (!courseId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/teacher/stats/${courseId}`);
      if (res.ok) {
        const data = await res.json();
        setLoading(false);
        if (data.success) {
          setStudents(data.students || []);
          setPassingScore(data.passingScore || 80);
          return;
        }
      }
    } catch (err) {
      console.warn('Backend API teacher/stats unavailable.');
    }

    setLoading(false);
    setStudents([]);
    setPassingScore(80);
  };

  useEffect(() => {
    if (isOpen && courseId) {
      fetchStats();
    }
  }, [isOpen, courseId]);

  if (!isOpen) return null;

  const totalStudents = students.length;
  const passedStudents = students.filter((s) => s.status === 'ĐẠT').length;
  const failedStudents = students.filter((s) => s.status === 'CHƯA ĐẠT').length;
  const attemptedStudents = students.filter((s) => s.quizScore !== null);
  const avgScore = attemptedStudents.length
    ? (
        attemptedStudents.reduce((acc, curr) => acc + (curr.quizScore || 0), 0) /
        attemptedStudents.length
      ).toFixed(1)
    : '0.0';

  const handleResetStudentQuiz = async (idUser: string, studentName?: string) => {
    const displayName = studentName ? `học viên "${studentName}" (${idUser})` : `học viên "${idUser}"`;
    if (
      !confirm(
        `Bạn có chắc chắn muốn HỦY KẾT QUẢ BÀI KIỂM TRA CUỐI KHÓA và GIẤY CHỨNG NHẬN của ${displayName} để học viên thi lại?\n\nLƯU Ý QUAN TRỌNG:\n✓ Giữ nguyên "Tiến trình học tập đã ghi nhớ" (các bài học đã xem, thời lượng học).\n✓ Giữ nguyên kết quả các bài tập củng cố từng bài.\n✗ Chỉ xóa kết quả điểm kiểm tra cuối khóa và thu hồi giấy chứng nhận để học viên có thể vào làm bài kiểm tra lại khi đã hết số lần làm bài.\n\nBạn có muốn tiếp tục không?`
      )
    ) {
      return;
    }

    setResettingUserId(idUser);

    // Optimistically update the UI so teacher immediately sees the row reset
    setStudents((prev) =>
      prev.map((s) =>
        s.idUser === idUser
          ? {
              ...s,
              quizScore: null,
              maxScore: null,
              minScore: null,
              quizAttempts: 0,
              violations: 0,
              status: 'Đang học',
              hasCertificate: false,
              certificateId: null,
              certificateNumberStr: null,
            }
          : s
      )
    );

    // Clean up local storage immediately
    if (courseId) {
      deleteStoredCertificateForUserCourse(idUser, courseId);
      deleteStoredQuizStatus(idUser, courseId);
      deleteStoredQuizProgress(idUser, courseId);
    }

    let apiHandled = false;
    try {
      const res = await fetch('/api/teacher/reset-student-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUser, courseId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          apiHandled = true;
          window.dispatchEvent(
            new CustomEvent('student-quiz-reset', {
              detail: { idUser, courseId },
            })
          );
          alert(data.message || `Đã hủy kết quả kiểm tra cuối khóa và thu hồi giấy chứng nhận thành công! ${displayName} có thể vào làm lại bài kiểm tra.`);
          await fetchStats();
        }
      }
    } catch (err) {
      console.warn('Backend API reset-student-quiz error:', err);
    } finally {
      setResettingUserId(null);
    }

    if (!apiHandled) {
      window.dispatchEvent(
        new CustomEvent('student-quiz-reset', {
          detail: { idUser, courseId },
        })
      );
      alert(`Đã hoàn tất hủy kết quả kiểm tra và giấy chứng nhận của ${displayName}! Học viên có thể tiến hành thi lại.`);
      await fetchStats();
    }
  };

  const handleExportExcel = () => {
    if (!students || students.length === 0) {
      alert('Không có dữ liệu học viên để xuất Excel!');
      return;
    }

    const excelRows = students.map((s, index) => {
      const pct = Math.min(
        100,
        Math.max(
          0,
          Math.round((s.completedLessons / (s.totalLessons || 1)) * 100)
        )
      );
      const progressStr = `${s.completedLessons}/${s.totalLessons} bài (${pct}%)`;
      const attemptsCount = s.quizAttempts || 0;
      const hasTakenQuiz = attemptsCount > 0 || (s.quizScore !== null && s.quizScore !== undefined);

      const maxScoreStr = hasTakenQuiz
        ? (s.maxScore !== null && s.maxScore !== undefined
            ? s.maxScore
            : (s.quizScore !== null && s.quizScore !== undefined ? s.quizScore : 'Chưa thi'))
        : 'Chưa thi';

      const minScoreStr = hasTakenQuiz
        ? (s.minScore !== null && s.minScore !== undefined
            ? s.minScore
            : (s.quizScore !== null && s.quizScore !== undefined ? s.quizScore : 'Chưa thi'))
        : 'Chưa thi';

      const violationsCount = s.violations || 0;

      return {
        'STT': index + 1,
        'Họ tên': s.hoTen || '',
        'Lớp': s.chiDoan || '',
        'Tiến độ bài học': progressStr,
        'Số lần làm bài': attemptsCount,
        'Điểm kiểm tra cao nhất': maxScoreStr,
        'Điểm kiểm tra thấp nhất': minScoreStr,
        'Số lần vi phạm': violationsCount,
        'Giấy chứng nhận': s.hasCertificate ? (s.certificateNumberStr ? `Đã cấp (${s.certificateNumberStr})` : 'Đã cấp') : 'Chưa cấp',
        'Trạng thái': s.status || 'Đang học',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Set column width styling
    worksheet['!cols'] = [
      { wch: 6 },  // STT
      { wch: 25 }, // Họ tên
      { wch: 15 }, // Lớp
      { wch: 22 }, // Tiến độ bài học
      { wch: 16 }, // Số lần làm bài
      { wch: 24 }, // Điểm kiểm tra cao nhất
      { wch: 24 }, // Điểm kiểm tra thấp nhất
      { wch: 18 }, // Số lần vi phạm
      { wch: 24 }, // Giấy chứng nhận
      { wch: 15 }, // Trạng thái
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DiemKiemTra');

    const cleanTitle = (courseTitle || 'KhoaHoc')
      .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF -]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    const fileName = `Diem_Kiem_Tra_${cleanTitle}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  };

  const handleExportAttendanceExcel = async () => {
    if (!courseId) return;
    try {
      const res = await fetch(`/api/attendance/export/${encodeURIComponent(courseId)}`);
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
          const fileName = `Danh_Sach_Diem_Danh_${cleanTitle}.xlsx`;

          XLSX.writeFile(workbook, fileName);
          return;
        } else if (data.message) {
          alert(`⚠️ ${data.message}`);
          return;
        }
      }
      alert('Chưa có dữ liệu điểm danh nào cho khóa học này!');
    } catch (err) {
      console.error('Error exporting attendance excel:', err);
      alert('Không thể xuất file điểm danh!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-5 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <BarChart2 className="w-5 h-5 text-blue-200" />
            <h3 className="font-bold text-lg line-clamp-1">{courseTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Tổng học viên
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                {totalStudents}
              </div>
            </div>

            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl">
              <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                Đã đạt (≥{passingScore}đ)
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-1 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                {passedStudents}
              </div>
            </div>

            <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl">
              <div className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
                Chưa đạt
              </div>
              <div className="text-2xl font-black text-rose-700 mt-1 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                {failedStudents}
              </div>
            </div>

            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                Điểm trung bình
              </div>
              <div className="text-2xl font-black text-amber-700 mt-1">
                {avgScore}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Students Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 text-sm flex flex-wrap justify-between items-center gap-2">
              <span>Danh sách tiến độ học viên ({students.length})</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLeaderboardOpen(true)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Xem Bảng xếp hạng khóa học"
                >
                  <Trophy className="w-4 h-4 text-slate-950" />
                  <span>Bảng xếp hạng</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={students.length === 0}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  title="Xuất danh sách điểm kiểm tra cuối khóa ra file Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Xuất điểm KT</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAttendanceExportModalOpen(true)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  title="Xuất danh sách điểm danh học sinh ra file Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Xuất DS điểm danh</span>
                </button>
                <button
                  type="button"
                  onClick={fetchStats}
                  className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  title="Tải lại dữ liệu"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Tải lại
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span>Đang tải dữ liệu báo cáo...</span>
              </div>
            ) : students.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                Chưa có học viên nào đăng ký khóa học này.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold border-b border-slate-200">
                      <th className="p-3.5 pl-4 text-center w-12">STT</th>
                      <th className="p-3.5">Học viên</th>
                      <th className="p-3.5">Lớp</th>
                      <th className="p-3.5">Tiến độ bài học</th>
                      <th className="p-3.5">Điểm kiểm tra</th>
                      <th className="p-3.5">Trạng thái</th>
                      <th className="p-3.5 pr-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((s, idx) => {
                      const initials = s.hoTen
                        ? s.hoTen
                            .trim()
                            .split(/\s+/)
                            .slice(-2)
                            .map((x) => x[0])
                            .join('')
                            .toUpperCase()
                        : 'HV';

                      const pct = Math.min(
                        100,
                        Math.max(
                          0,
                          Math.round(
                            (s.completedLessons / (s.totalLessons || 1)) * 100
                          )
                        )
                      );

                      return (
                        <tr key={s.idUser} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 pl-4 text-center font-bold text-slate-400 text-xs">
                            {idx + 1}
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                                {initials}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">{s.hoTen}</div>
                                <div className="text-xs text-slate-400">{s.idUser}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 font-medium text-slate-600">{s.chiDoan}</td>
                          <td className="p-3.5">
                            <div className="text-xs font-semibold text-slate-700 mb-1">
                              {s.completedLessons} / {s.totalLessons} bài ({pct}%)
                            </div>
                            <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                              <div
                                className="h-full bg-blue-600 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="font-bold text-slate-900">
                              {s.quizScore !== null ? `${s.quizScore} đ` : 'Chưa thi'}
                            </div>
                            <div className="text-xs text-slate-400">
                              {s.quizAttempts || 0} lần thi
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="flex flex-col items-start gap-1">
                              {s.status === 'ĐẠT' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  ĐẠT
                                </span>
                              ) : s.status === 'CHƯA ĐẠT' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                  <XCircle className="w-3.5 h-3.5" />
                                  CHƯA ĐẠT
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  Đang học
                                </span>
                              )}
                              {s.hasCertificate && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md shadow-2xs" title={s.certificateNumberStr ? `Số hiệu GCN: ${s.certificateNumberStr}` : 'Đã cấp giấy chứng nhận'}>
                                  <Trophy className="w-3 h-3 text-amber-600" />
                                  {s.certificateNumberStr ? `GCN: ${s.certificateNumberStr}` : 'Đã cấp GCN'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 pr-4 text-right">
                            <button
                              onClick={() => handleResetStudentQuiz(s.idUser, s.hoTen)}
                              disabled={resettingUserId === s.idUser}
                              className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Hủy kết quả điểm kiểm tra và giấy chứng nhận để học sinh có thể vào làm lại bài thi"
                            >
                              {resettingUserId === s.idUser ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                              Thi lại
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>

      <LeaderboardModal
        isOpen={leaderboardOpen}
        course={{ courseId, title: courseTitle } as Course}
        onClose={() => setLeaderboardOpen(false)}
      />

      <AttendanceExportModal
        isOpen={attendanceExportModalOpen}
        onClose={() => setAttendanceExportModalOpen(false)}
        courseId={courseId || ''}
        courseTitle={courseTitle}
      />
    </div>
  );
};
