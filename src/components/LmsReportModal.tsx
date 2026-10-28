import React, { useState, useEffect, useMemo } from 'react';
import { Course, User } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  X,
  BarChart3,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Search,
  Filter,
  Users,
  BookOpen,
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingUp,
  PieChart,
  Layers,
  Sparkles,
  Trash2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  getStoredAccounts,
  getStoredProgress,
  getStoredQuizStatus,
  getStoredCertificates,
  deleteStoredCertificate,
} from '../lib/storage';

interface StudentReportItem {
  idUser: string;
  hoTen: string;
  chiDoan: string;
  courseId: string;
  courseTitle: string;
  authorName: string;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  quizScore: number | null;
  passingScore: number;
  status: 'ĐẠT' | 'CHƯA ĐẠT' | 'CHƯA LÀM';
  quizAttempts: number;
  hasCertificate: boolean;
  certificateId?: string;
}

interface CourseReportSummary {
  courseId: string;
  courseTitle: string;
  authorName: string;
  authorId: string;
  totalLessons: number;
  passingScore: number;
  enrolledCount: number;
  avgProgress: number;
  avgScore: number;
  passedCount: number;
  failedCount: number;
  unattemptedCount: number;
  passRatePercent: number;
}

interface LmsReportModalProps {
  isOpen?: boolean;
  onClose: () => void;
  currentUser: User | null;
  courses: Course[];
  isInline?: boolean;
}

export const LmsReportModal: React.FC<LmsReportModalProps> = ({
  isOpen = true,
  onClose,
  currentUser,
  courses,
  isInline = false,
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  // State
  const [selectedCourseId, setSelectedCourseId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'COURSES' | 'STUDENTS'>('COURSES');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Data state
  const [studentReports, setStudentReports] = useState<StudentReportItem[]>([]);
  const [courseSummaries, setCourseSummaries] = useState<CourseReportSummary[]>([]);

  // Filter accessible courses based on Role (Admin sees all, Teacher sees authored courses)
  const accessibleCourses = useMemo(() => {
    if (isAdmin) return courses;
    const teacherName = currentUser?.hoTen?.trim().toLowerCase() || '';
    const teacherId = currentUser?.idUser?.trim().toLowerCase() || '';
    return courses.filter((c) => {
      const authorName = (c.authorName || '').trim().toLowerCase();
      const authorId = (c.authorId || '').trim().toLowerCase();
      return (
        authorId === teacherId ||
        authorName === teacherName ||
        (authorName && teacherName && authorName.includes(teacherName))
      );
    });
  }, [courses, currentUser, isAdmin]);

  // Load / Compute Report Data
  const loadReportData = async () => {
    setIsLoading(true);

    try {
      // Attempt API call to server
      const queryParams = new URLSearchParams({
        role: currentUser?.role || 'TEACHER',
        userId: currentUser?.idUser || '',
        hoTen: currentUser?.hoTen || '',
      });

      const res = await fetch(`/api/reports/lms-analytics?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.studentReports) && Array.isArray(data.courseSummaries)) {
          setStudentReports(data.studentReports);
          setCourseSummaries(data.courseSummaries);
          setIsLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Backend /api/reports/lms-analytics unavailable, computing locally:', err);
    }

    // Local fallback calculation
    computeLocalReportData();
    setIsLoading(false);
  };

  const computeLocalReportData = () => {
    const accountsData = getStoredAccounts();
    const allStudents = accountsData.students || [];
    const progressData = getStoredProgress();
    const quizData = getStoredQuizStatus();
    const certsData = getStoredCertificates();

    const reports: StudentReportItem[] = [];
    const summaries: CourseReportSummary[] = [];

    accessibleCourses.forEach((c) => {
      const courseId = c.courseId;
      const totalLessons = (c.lessons || []).length;
      const passingScore = Number(c.quizConfig?.passingScore) || 80;

      let cEnrolledCount = 0;
      let cSumProgress = 0;
      let cQuizScores: number[] = [];
      let cPassedCount = 0;
      let cFailedCount = 0;
      let cUnattemptedCount = 0;

      allStudents.forEach((student) => {
        const sId = String(student.idUser).trim().toLowerCase();
        const sProgObj = (progressData[student.idUser] && progressData[student.idUser][courseId]) ||
          (progressData[sId] && progressData[sId][courseId]) || {};
        
        const sQuizObj = (quizData[student.idUser] && quizData[student.idUser][courseId]) ||
          (quizData[sId] && quizData[sId][courseId]) || {};

        // Calculate completed lessons
        let doneCount = 0;
        Object.keys(sProgObj).forEach((k) => {
          if (/^LESSON_\d+$/.test(k) && sProgObj[k]?.isCompleted) {
            doneCount++;
          }
        });

        const progressPercent = totalLessons > 0 ? Math.min(100, Math.round((doneCount / totalLessons) * 100)) : 0;
        
        // Quiz score evaluation
        let lastScore: number | null = null;
        let attempts = Number(sQuizObj.attempts || 0);

        if (sQuizObj.lastScore !== undefined && sQuizObj.lastScore !== null) {
          lastScore = Number(sQuizObj.lastScore);
        } else if (sProgObj['QUIZ_SUBMITTED']?.score !== undefined) {
          lastScore = Number(sProgObj['QUIZ_SUBMITTED'].score);
        }

        let status: 'ĐẠT' | 'CHƯA ĐẠT' | 'CHƯA LÀM' = 'CHƯA LÀM';
        if (lastScore !== null) {
          status = lastScore >= passingScore ? 'ĐẠT' : 'CHƯA ĐẠT';
          cQuizScores.push(lastScore);
        } else {
          cUnattemptedCount++;
        }

        if (status === 'ĐẠT') cPassedCount++;
        if (status === 'CHƯA ĐẠT') cFailedCount++;

        // Certificate check
        const matchedCert = certsData.find(
          (cert) => String(cert.idUser).trim().toLowerCase() === sId && String(cert.courseId) === String(courseId)
        );
        const hasCert = Boolean(matchedCert);

        // Include student if enrolled or has progress
        if (doneCount > 0 || lastScore !== null || progressPercent > 0) {
          cEnrolledCount++;
          cSumProgress += progressPercent;

          reports.push({
            idUser: student.idUser,
            hoTen: student.hoTen || student.idUser,
            chiDoan: student.chiDoan || 'N/A',
            courseId,
            courseTitle: c.title,
            authorName: c.authorName || 'Giáo viên',
            progressPercent,
            completedLessons: doneCount,
            totalLessons,
            quizScore: lastScore,
            passingScore,
            status,
            quizAttempts: attempts,
            hasCertificate: hasCert,
            certificateId: matchedCert?.certificateId,
          });
        }
      });

      const avgProg = cEnrolledCount > 0 ? Math.round(cSumProgress / cEnrolledCount) : 0;
      const avgSc = cQuizScores.length > 0
        ? Number((cQuizScores.reduce((a, b) => a + b, 0) / cQuizScores.length).toFixed(1))
        : 0;
      const passRate = cEnrolledCount > 0 ? Math.round((cPassedCount / cEnrolledCount) * 100) : 0;

      summaries.push({
        courseId,
        courseTitle: c.title,
        authorName: c.authorName || 'Giáo viên',
        authorId: c.authorId || '',
        totalLessons,
        passingScore,
        enrolledCount: cEnrolledCount,
        avgProgress: avgProg,
        avgScore: avgSc,
        passedCount: cPassedCount,
        failedCount: cFailedCount,
        unattemptedCount: cUnattemptedCount,
        passRatePercent: passRate,
      });
    });

    setStudentReports(reports);
    setCourseSummaries(summaries);
  };

  const handleRevokeCertificate = async (item: StudentReportItem) => {
    const confirmMsg = `Bạn có chắc chắn muốn thu hồi và xóa Giấy chứng nhận của học sinh "${item.hoTen}" cho khóa học "${item.courseTitle}"?\n\nSau khi xóa, bản ghi giấy chứng nhận này sẽ bị xóa khỏi hệ thống.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      let certId = item.certificateId;
      if (!certId) {
        const allCerts = getStoredCertificates();
        const found = allCerts.find(
          (c) => String(c.idUser).trim().toLowerCase() === String(item.idUser).trim().toLowerCase() && String(c.courseId) === String(item.courseId)
        );
        certId = found?.certificateId;
      }

      if (certId) {
        try {
          await fetch(`/api/certificates/${encodeURIComponent(certId)}`, {
            method: 'DELETE',
          });
        } catch (apiErr) {
          console.warn('Lỗi API khi xóa chứng nhận:', apiErr);
        }
        deleteStoredCertificate(certId);
      }

      await loadReportData();
      alert(`Đã xóa giấy chứng nhận của học sinh "${item.hoTen}".`);
    } catch (err: any) {
      alert('Lỗi khi xóa giấy chứng nhận: ' + (err?.message || 'Lỗi không xác định'));
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadReportData();
    }
  }, [isOpen, accessibleCourses]);

  // Filtering by Course & Search Query
  const filteredStudentReports = useMemo(() => {
    return studentReports.filter((item) => {
      // Course filter
      if (selectedCourseId !== 'ALL' && item.courseId !== selectedCourseId) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.hoTen.toLowerCase().includes(q);
        const matchId = item.idUser.toLowerCase().includes(q);
        const matchClass = item.chiDoan.toLowerCase().includes(q);
        const matchCourse = item.courseTitle.toLowerCase().includes(q);
        return matchName || matchId || matchClass || matchCourse;
      }
      return true;
    });
  }, [studentReports, selectedCourseId, searchQuery]);

  const filteredCourseSummaries = useMemo(() => {
    return courseSummaries.filter((item) => {
      if (selectedCourseId !== 'ALL' && item.courseId !== selectedCourseId) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.courseTitle.toLowerCase().includes(q) ||
          item.authorName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [courseSummaries, selectedCourseId, searchQuery]);

  // Overall Aggregated Metrics
  const overallMetrics = useMemo(() => {
    const totalCoursesCount = filteredCourseSummaries.length;
    const totalEnrolledCount = filteredStudentReports.length;

    const avgProg =
      totalEnrolledCount > 0
        ? Math.round(
            filteredStudentReports.reduce((acc, s) => acc + s.progressPercent, 0) / totalEnrolledCount
          )
        : 0;

    const scoredStudents = filteredStudentReports.filter((s) => s.quizScore !== null);
    const avgScore =
      scoredStudents.length > 0
        ? (
            scoredStudents.reduce((acc, s) => acc + (s.quizScore || 0), 0) / scoredStudents.length
          ).toFixed(1)
        : '0.0';

    const passedCount = filteredStudentReports.filter((s) => s.status === 'ĐẠT').length;
    const failedCount = filteredStudentReports.filter((s) => s.status === 'CHƯA ĐẠT').length;
    const unattemptedCount = filteredStudentReports.filter((s) => s.status === 'CHƯA LÀM').length;

    const passRate =
      totalEnrolledCount > 0 ? Math.round((passedCount / totalEnrolledCount) * 100) : 0;

    // Grade spectrum buckets
    let gExcellence = 0; // 8.5 - 10
    let gGood = 0;       // 7.0 - 8.4
    let gAverage = 0;    // 5.0 - 6.9
    let gFail = 0;       // < 5.0

    scoredStudents.forEach((s) => {
      const sc = s.quizScore || 0;
      if (sc >= 8.5) gExcellence++;
      else if (sc >= 7.0) gGood++;
      else if (sc >= 5.0) gAverage++;
      else gFail++;
    });

    // Completion spectrum
    let c100 = 0;
    let c50_99 = 0;
    let c1_49 = 0;
    let c0 = 0;

    filteredStudentReports.forEach((s) => {
      if (s.progressPercent === 100) c100++;
      else if (s.progressPercent >= 50) c50_99++;
      else if (s.progressPercent > 0) c1_49++;
      else c0++;
    });

    return {
      totalCoursesCount,
      totalEnrolledCount,
      avgProg,
      avgScore,
      passedCount,
      failedCount,
      unattemptedCount,
      passRate,
      grades: { gExcellence, gGood, gAverage, gFail, unattemptedCount },
      completion: { c100, c50_99, c1_49, c0 },
    };
  }, [filteredCourseSummaries, filteredStudentReports]);

  // Export Excel (.xlsx)
  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Tổng quan Khóa học
    const courseRows = filteredCourseSummaries.map((c, idx) => ({
      'STT': idx + 1,
      'Mã Khóa học': c.courseId,
      'Tên Khóa học': c.courseTitle,
      'Giáo viên / Tác giả': c.authorName,
      'Số bài học': c.totalLessons,
      'Điểm đạt yêu cầu': c.passingScore,
      'Số HV tham gia': c.enrolledCount,
      'Tiến độ TB (%)': `${c.avgProgress}%`,
      'Điểm thi TB': c.avgScore,
      'Số HV Đạt': c.passedCount,
      'Số HV Chưa đạt': c.failedCount,
      'Số HV Chưa thi': c.unattemptedCount,
      'Tỷ lệ Đạt (%)': `${c.passRatePercent}%`,
    }));

    const sheet1 = XLSX.utils.json_to_sheet(courseRows);
    sheet1['!cols'] = [
      { wch: 6 },
      { wch: 15 },
      { wch: 35 },
      { wch: 22 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet1, 'ThongKe_KhoaHoc');

    // Sheet 2: Danh sách Học viên
    const studentRows = filteredStudentReports.map((s, idx) => ({
      'STT': idx + 1,
      'Mã Học sinh (ID)': s.idUser,
      'Họ và tên': s.hoTen,
      'Lớp / Đơn vị': s.chiDoan,
      'Khóa học': s.courseTitle,
      'Giáo viên': s.authorName,
      'Bài học hoàn thành': `${s.completedLessons}/${s.totalLessons}`,
      'Tiến độ (%)': `${s.progressPercent}%`,
      'Điểm thi': s.quizScore !== null ? s.quizScore : 'Chưa thi',
      'Điểm đạt chuẩn': s.passingScore,
      'Số lần thi': s.quizAttempts,
      'Kết quả': s.status,
      'Đã cấp chứng chỉ': s.hasCertificate ? 'Đã cấp' : 'Chưa',
    }));

    const sheet2 = XLSX.utils.json_to_sheet(studentRows);
    sheet2['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 25 },
      { wch: 15 },
      { wch: 30 },
      { wch: 20 },
      { wch: 20 },
      { wch: 14 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet2, 'ChiTiet_HocVien');

    // Export file
    const rolePrefix = isAdmin ? 'Admin' : 'Giaovien';
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `BaoCao_LMS_${rolePrefix}_${dateStr}.xlsx`);
  };

  // Generate Printable HTML Document String
  const generatePrintableHtml = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const todayFormatted = `${day}/${month}/${year}`;

    const reportTitleScope =
      selectedCourseId === 'ALL'
        ? 'TOÀN HỆ THỐNG'
        : accessibleCourses.find((c) => c.courseId === selectedCourseId)?.title || 'KHÓA HỌC';

    const creatorName = currentUser?.hoTen || 'Quản trị viên';
    const roleText = isAdmin ? 'Ban Quản trị (Admin)' : 'Giáo viên';

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>BÁO CÁO PHÂN TÍCH & KẾT QUẢ HỌC TẬP LMS</title>
  <style>
    @page {
      size: A4 landscape;
      margin-top: 2cm;
      margin-bottom: 2cm;
      margin-left: 3cm;
      margin-right: 1.5cm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, Roboto, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.35;
      color: #0f172a;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .header-table {
      width: 100%;
      margin-bottom: 20px;
      border-collapse: collapse;
    }
    .header-table td {
      border: none !important;
      padding: 0;
      vertical-align: top;
    }
    .dept-title {
      font-weight: 400;
      font-size: 10pt;
      text-transform: uppercase;
      color: #0f172a;
      text-align: center;
    }
    .school-title {
      font-weight: 800;
      font-size: 10pt;
      text-transform: uppercase;
      color: #1e3a8a;
      text-align: center;
      margin-top: 3px;
    }
    .country-title {
      font-weight: 800;
      font-size: 10pt;
      text-align: center;
      text-transform: uppercase;
      color: #0f172a;
    }
    .country-sub {
      font-size: 11pt;
      text-align: center;
      font-weight: 800;
      color: #0f172a;
      margin-top: 3px;
    }
    .main-title {
      text-align: center;
      font-size: 15pt;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
      margin: 15px 0 5px 0;
      letter-spacing: 0.5px;
    }
    .sub-title {
      text-align: center;
      font-size: 9.5pt;
      color: #475569;
      font-style: italic;
      margin-bottom: 20px;
    }
    .meta-box {
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 15px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      font-size: 9.5pt;
    }
    .section-title {
      font-size: 11pt;
      font-weight: 800;
      text-transform: uppercase;
      color: #1e3a8a;
      margin: 20px 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 2px solid #2563eb;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 9.5pt;
      page-break-inside: auto;
    }
    table.data-table thead {
      display: table-header-group;
    }
    table.data-table tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: auto;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #64748b;
      padding: 8px 10px;
      text-align: left;
      line-height: 1.45;
    }
    table.data-table th {
      background-color: #f1f5f9;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 9pt;
      color: #0f172a;
    }
    .text-center { text-align: center !important; }
    .font-bold { font-weight: bold; }
    .status-pass { color: #166534; font-weight: 800; }
    .status-fail { color: #991b1b; font-weight: 800; }
    .status-none { color: #64748b; }
    .signature-container {
      margin-top: 30px;
      width: 100%;
      page-break-inside: avoid;
    }
    .sig-table {
      width: 100%;
      border-collapse: collapse;
    }
    .sig-table td {
      border: none !important;
      text-align: center;
      width: 50%;
      vertical-align: top;
      padding: 0;
    }
  </style>
</head>
<body>

  <table class="header-table">
    <tr>
      <td style="text-align: center; vertical-align: top; width: 50%;">
        <div class="dept-title">SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG</div>
        <div class="school-title">TRƯỜNG TRUNG HỌC PHỔ THÔNG NGUYỄN QUANG DIÊU</div>
      </td>
      <td style="text-align: center; vertical-align: top; width: 50%;">
        <div class="country-title">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div class="country-sub">Độc lập - Tự do - Hạnh phúc</div>
        <div style="border-bottom: 1px solid #0f172a; width: 130px; margin: 4px auto 0 auto;"></div>
      </td>
    </tr>
  </table>

  <div class="main-title">BÁO CÁO PHÂN TÍCH & KẾT QUẢ HỌC TẬP LMS</div>
  <div class="sub-title">Phạm vi: ${reportTitleScope} &bull; Ngày lập: ${todayFormatted}</div>

  <div class="meta-box">
    <div><strong>Người xuất báo cáo:</strong> ${creatorName} (${roleText})</div>
    <div><strong>Số học viên trong báo cáo:</strong> ${overallMetrics.totalEnrolledCount} em</div>
    <div><strong>Tỷ lệ hoàn thành TB:</strong> ${overallMetrics.avgProg}%</div>
    <div><strong>Tỷ lệ Đạt:</strong> ${overallMetrics.passRate}%</div>
  </div>

  <div class="section-title">I. TỔNG QUAN KHÓA HỌC (${filteredCourseSummaries.length} khóa học)</div>
  <table class="data-table">
    <thead>
      <tr>
        <th class="text-center" style="width: 35px;">STT</th>
        <th>Tên Khóa Học</th>
        <th>Giáo Viên Tác Giả</th>
        <th class="text-center">Số Học Viên</th>
        <th class="text-center">Tiến Độ TB</th>
        <th class="text-center">Điểm TB</th>
        <th class="text-center">Đạt / Chưa Đạt</th>
        <th class="text-center">Tỷ Lệ Đạt</th>
      </tr>
    </thead>
    <tbody>
      ${
        filteredCourseSummaries.length === 0
          ? `<tr><td colSpan="8" class="text-center">Không có dữ liệu khóa học.</td></tr>`
          : filteredCourseSummaries
              .map(
                (c, i) => `
        <tr>
          <td class="text-center font-bold">${i + 1}</td>
          <td class="font-bold">${c.courseTitle}</td>
          <td>${c.authorName}</td>
          <td class="text-center font-bold">${c.enrolledCount} em</td>
          <td class="text-center">${c.avgProgress}%</td>
          <td class="text-center font-bold">${c.avgScore}</td>
          <td class="text-center">${c.passedCount} Đạt / ${c.failedCount} Chưa</td>
          <td class="text-center font-bold">${c.passRatePercent}%</td>
        </tr>`
              )
              .join('')
      }
    </tbody>
  </table>

  <div class="section-title">II. DANH SÁCH CHI TIẾT HỌC VIÊN (${filteredStudentReports.length} lượt)</div>
  <table class="data-table">
    <thead>
      <tr>
        <th class="text-center" style="width: 35px;">STT</th>
        <th style="width: 90px;">Mã Học Sinh</th>
        <th>Họ và Tên</th>
        <th style="width: 80px;">Lớp</th>
        <th>Khóa Học</th>
        <th class="text-center" style="width: 80px;">Tiến Độ</th>
        <th class="text-center" style="width: 65px;">Điểm Thi</th>
        <th class="text-center" style="width: 80px;">Đánh Giá</th>
        <th class="text-center" style="width: 80px;">Chứng Chỉ</th>
      </tr>
    </thead>
    <tbody>
      ${
        filteredStudentReports.length === 0
          ? `<tr><td colSpan="9" class="text-center">Chưa có dữ liệu học viên.</td></tr>`
          : filteredStudentReports
              .map(
                (s, idx) => `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td class="font-bold">${s.idUser}</td>
          <td class="font-bold">${s.hoTen}</td>
          <td>${s.chiDoan}</td>
          <td>${s.courseTitle}</td>
          <td class="text-center">${s.progressPercent}% (${s.completedLessons}/${s.totalLessons})</td>
          <td class="text-center font-bold">${s.quizScore !== null ? s.quizScore : '--'}</td>
          <td class="text-center ${
            s.status === 'ĐẠT'
              ? 'status-pass'
              : s.status === 'CHƯA ĐẠT'
              ? 'status-fail'
              : 'status-none'
          }">${s.status}</td>
          <td class="text-center">${s.hasCertificate ? 'Đã cấp' : '--'}</td>
        </tr>`
              )
              .join('')
      }
    </tbody>
  </table>

  <div class="signature-container">
    <table class="sig-table">
      <tr>
        <td style="width: 50%;"></td>
        <td style="width: 50%; text-align: center; font-style: italic; font-size: 9.5pt; color: #334155; padding-bottom: 6px;">
          Tân An, ngày ${day} tháng ${month} năm ${year}
        </td>
      </tr>
      <tr>
        <td style="vertical-align: top; text-align: center; width: 50%;">
          <div style="font-weight: bold; text-transform: uppercase; font-size: 10pt;">NGƯỜI LẬP BÁO CÁO</div>
          <br><br><br><br>
          <div style="font-weight: bold; font-size: 10pt;">${creatorName}</div>
        </td>
        <td style="vertical-align: top; text-align: center; width: 50%;">
          <div style="font-weight: bold; text-transform: uppercase; font-size: 10pt;">DUYỆT CỦA HIỆU TRƯỜNG</div>
          <br><br><br><br>
        </td>
      </tr>
    </table>
  </div>

</body>
</html>`;
  };

  // Export PDF Action
  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);

    try {
      const htmlContent = generatePrintableHtml();

      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '1122px';
      container.style.backgroundColor = '#ffffff';
      container.style.color = '#0f172a';
      container.style.padding = '76px 57px 76px 113px';
      container.style.boxSizing = 'border-box';
      container.innerHTML = htmlContent;
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = 297;
      const pdfHeight = 210;

      const pageCanvasHeight = Math.floor((canvas.width * pdfHeight) / pdfWidth);
      const totalPages = Math.ceil(canvas.height / pageCanvasHeight);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) {
          pdf.addPage('a4', 'landscape');
        }

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = pageCanvasHeight;
        const ctx = pageCanvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, pageCanvasHeight);

          const sourceY = i * pageCanvasHeight;
          const sourceH = Math.min(pageCanvasHeight, canvas.height - sourceY);

          ctx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sourceH,
            0,
            0,
            canvas.width,
            sourceH
          );

          const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.98);
          pdf.addImage(pageImgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        }
      }

      const rolePrefix = isAdmin ? 'Admin' : 'Giaovien';
      const dateStr = new Date().toISOString().split('T')[0];
      pdf.save(`BaoCao_LMS_${rolePrefix}_${dateStr}.pdf`);
    } catch (err) {
      console.error('Lỗi khi xuất PDF:', err);
      alert('Có lỗi xảy ra khi tạo file PDF. Vui lòng thử lại!');
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isOpen && !isInline) return null;

  const modalInner = (
    <div className={`bg-white ${isInline ? 'w-full rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden' : 'w-full max-w-6xl h-[min(88vh,720px)] rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col'} print:h-auto print:max-h-none print:shadow-none print:border-none print:rounded-none`}>
      
      {/* Modal Header */}
      <div className={`px-5 sm:px-6 py-3.5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between shrink-0 print:bg-none print:text-black print:px-0 print:py-2 print:border-b print:border-slate-300 ${isInline ? 'hidden' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 shrink-0 print:hidden">
            <BarChart3 className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-black tracking-wide text-white uppercase print:text-black">
                Báo cáo & Phân tích Hệ thống LMS
              </h3>
              <span
                className={`text-[10px] sm:text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isAdmin
                    ? 'bg-purple-900/60 border-purple-400/50 text-purple-200'
                    : 'bg-emerald-900/60 border-emerald-400/50 text-emerald-200'
                }`}
              >
                {isAdmin ? 'Quyền Admin (Toàn hệ thống)' : `Giáo viên: ${currentUser?.hoTen}`}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer print:hidden"
          title="Đóng (Về tổng quan)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

        {/* Modal Controls Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
              <Filter className="w-4 h-4 text-blue-600" />
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Khóa học:</label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="text-xs font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer max-w-[220px] sm:max-w-[320px] truncate"
              >
                <option value="ALL">
                  -- Tất cả khóa học ({accessibleCourses.length}) --
                </option>
                {accessibleCourses.map((c) => (
                  <option key={c.courseId} value={c.courseId}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm học sinh, lớp, khóa học..."
                className="pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 w-48 sm:w-64"
              />
            </div>

            <button
              onClick={loadReportData}
              disabled={isLoading}
              className="p-2 text-slate-600 hover:text-blue-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl shadow-2xs transition-all cursor-pointer"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>

          {/* Export Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Xuất file Excel đầy đủ 2 sheet"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-60"
              title="Tải báo cáo dưới dạng file PDF"
            >
              {isExportingPdf ? (
                <RefreshCw className="w-4 h-4 text-sky-100 animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-sky-100" />
              )}
              <span>{isExportingPdf ? 'Đang tạo PDF...' : 'Tải báo cáo'}</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content Area */}
        <div className={`p-5 space-y-6 ${isInline ? 'h-auto overflow-visible' : 'flex-1 overflow-y-auto'} print:p-0 print:overflow-visible`}>
          
          {/* Overview Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
                  Khóa học
                </div>
                <div className="text-xl font-black text-slate-900">
                  {overallMetrics.totalCoursesCount}
                </div>
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                  Học viên
                </div>
                <div className="text-xl font-black text-slate-900">
                  {overallMetrics.totalEnrolledCount}
                </div>
              </div>
            </div>

            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">
                  Hoàn thành TB
                </div>
                <div className="text-xl font-black text-slate-900">
                  {overallMetrics.avgProg}%
                </div>
              </div>
            </div>

            <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
                  Điểm thi TB
                </div>
                <div className="text-xl font-black text-slate-900">
                  {overallMetrics.avgScore} <span className="text-xs text-slate-500 font-semibold">/10</span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-center gap-3 col-span-2 sm:col-span-1">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                  Tỷ lệ Đạt
                </div>
                <div className="text-xl font-black text-slate-900">
                  {overallMetrics.passRate}%
                </div>
              </div>
            </div>
          </div>

          {/* Visual Analytical Charts Section */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <PieChart className="w-4 h-4 text-blue-600" />
                BIỂU ĐỒ PHÂN TÍCH VÀ ĐÁNH GIÁ KẾT QUẢ
              </h4>
              <span className="text-xs text-slate-500 font-medium">
                Dữ liệu tổng hợp thời gian thực
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Chart 1: Pass / Fail / Unattempted Ratio */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Kết quả Đánh giá Kiểm tra</span>
                  <span className="text-[11px] text-slate-500">
                    {overallMetrics.totalEnrolledCount} lượt
                  </span>
                </div>

                {/* Progress bar ratio */}
                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
                  {overallMetrics.totalEnrolledCount > 0 ? (
                    <>
                      <div
                        style={{
                          width: `${(overallMetrics.passedCount / overallMetrics.totalEnrolledCount) * 100}%`,
                        }}
                        className="bg-emerald-500 h-full transition-all"
                        title={`Đạt: ${overallMetrics.passedCount}`}
                      />
                      <div
                        style={{
                          width: `${(overallMetrics.failedCount / overallMetrics.totalEnrolledCount) * 100}%`,
                        }}
                        className="bg-rose-500 h-full transition-all"
                        title={`Chưa đạt: ${overallMetrics.failedCount}`}
                      />
                      <div
                        style={{
                          width: `${(overallMetrics.unattemptedCount / overallMetrics.totalEnrolledCount) * 100}%`,
                        }}
                        className="bg-slate-300 h-full transition-all"
                        title={`Chưa làm: ${overallMetrics.unattemptedCount}`}
                      />
                    </>
                  ) : (
                    <div className="w-full bg-slate-200 h-full" />
                  )}
                </div>

                {/* Legend */}
                <div className="space-y-1.5 pt-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      Đạt yêu cầu:
                    </span>
                    <strong className="text-emerald-700">
                      {overallMetrics.passedCount} ({overallMetrics.totalEnrolledCount > 0 ? Math.round((overallMetrics.passedCount / overallMetrics.totalEnrolledCount) * 100) : 0}%)
                    </strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                      Chưa đạt:
                    </span>
                    <strong className="text-rose-700">
                      {overallMetrics.failedCount} ({overallMetrics.totalEnrolledCount > 0 ? Math.round((overallMetrics.failedCount / overallMetrics.totalEnrolledCount) * 100) : 0}%)
                    </strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                      Chưa kiểm tra:
                    </span>
                    <strong className="text-slate-600">
                      {overallMetrics.unattemptedCount} ({overallMetrics.totalEnrolledCount > 0 ? Math.round((overallMetrics.unattemptedCount / overallMetrics.totalEnrolledCount) * 100) : 0}%)
                    </strong>
                  </div>
                </div>
              </div>

              {/* Chart 2: Grade Spectrum Histogram */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Phân bố Thang điểm Kiểm tra</span>
                  <span className="text-[11px] text-slate-500">Thang điểm 10</span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Excellent */}
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-700 font-semibold mb-0.5">
                      <span>Xuất sắc (8.5 - 10.0)</span>
                      <span>{overallMetrics.grades.gExcellence} em</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        style={{
                          width: `${overallMetrics.totalEnrolledCount > 0 ? (overallMetrics.grades.gExcellence / overallMetrics.totalEnrolledCount) * 100 : 0}%`,
                        }}
                        className="bg-emerald-600 h-full rounded-full"
                      />
                    </div>
                  </div>

                  {/* Good */}
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-700 font-semibold mb-0.5">
                      <span>Giỏi / Khá (7.0 - 8.4)</span>
                      <span>{overallMetrics.grades.gGood} em</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        style={{
                          width: `${overallMetrics.totalEnrolledCount > 0 ? (overallMetrics.grades.gGood / overallMetrics.totalEnrolledCount) * 100 : 0}%`,
                        }}
                        className="bg-blue-600 h-full rounded-full"
                      />
                    </div>
                  </div>

                  {/* Average */}
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-700 font-semibold mb-0.5">
                      <span>Trung bình (5.0 - 6.9)</span>
                      <span>{overallMetrics.grades.gAverage} em</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        style={{
                          width: `${overallMetrics.totalEnrolledCount > 0 ? (overallMetrics.grades.gAverage / overallMetrics.totalEnrolledCount) * 100 : 0}%`,
                        }}
                        className="bg-amber-500 h-full rounded-full"
                      />
                    </div>
                  </div>

                  {/* Fail */}
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-700 font-semibold mb-0.5">
                      <span>Yếu / Chưa đạt (&lt; 5.0)</span>
                      <span>{overallMetrics.grades.gFail} em</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        style={{
                          width: `${overallMetrics.totalEnrolledCount > 0 ? (overallMetrics.grades.gFail / overallMetrics.totalEnrolledCount) * 100 : 0}%`,
                        }}
                        className="bg-rose-600 h-full rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart 3: Lesson Completion Spectrum */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Tiến độ Mức độ Hoàn thành</span>
                  <span className="text-[11px] text-slate-500">% Bài học</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-700 font-semibold mb-0.5">
                      <span>Hoàn thành 100%</span>
                      <span>{overallMetrics.completion.c100} em</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        style={{
                          width: `${overallMetrics.totalEnrolledCount > 0 ? (overallMetrics.completion.c100 / overallMetrics.totalEnrolledCount) * 100 : 0}%`,
                        }}
                        className="bg-purple-600 h-full rounded-full"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-700 font-semibold mb-0.5">
                      <span>Đạt từ 50% - 99%</span>
                      <span>{overallMetrics.completion.c50_99} em</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        style={{
                          width: `${overallMetrics.totalEnrolledCount > 0 ? (overallMetrics.completion.c50_99 / overallMetrics.totalEnrolledCount) * 100 : 0}%`,
                        }}
                        className="bg-indigo-600 h-full rounded-full"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-700 font-semibold mb-0.5">
                      <span>Đạt dưới 50%</span>
                      <span>{overallMetrics.completion.c1_49} em</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        style={{
                          width: `${overallMetrics.totalEnrolledCount > 0 ? (overallMetrics.completion.c1_49 / overallMetrics.totalEnrolledCount) * 100 : 0}%`,
                        }}
                        className="bg-sky-500 h-full rounded-full"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-700 font-semibold mb-0.5">
                      <span>Chưa học (0%)</span>
                      <span>{overallMetrics.completion.c0} em</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        style={{
                          width: `${overallMetrics.totalEnrolledCount > 0 ? (overallMetrics.completion.c0 / overallMetrics.totalEnrolledCount) * 100 : 0}%`,
                        }}
                        className="bg-slate-400 h-full rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Detailed Tables Area */}
          <div className="space-y-3">
            {/* Table Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 print:hidden">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('COURSES')}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                    activeTab === 'COURSES'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Thống kê theo Khóa học ({filteredCourseSummaries.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('STUDENTS')}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                    activeTab === 'STUDENTS'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Danh sách Chi tiết Học viên ({filteredStudentReports.length})</span>
                </button>
              </div>

              <span className="text-xs text-slate-500">
                {activeTab === 'COURSES' ? 'Bảng tổng hợp từng khóa học' : 'Bảng chi tiết điểm & tiến độ từng học sinh'}
              </span>
            </div>

            {/* TAB 1: COURSES SUMMARY TABLE */}
            {activeTab === 'COURSES' && (
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 border-b border-slate-200 uppercase tracking-wider text-[11px] font-bold text-slate-800">
                      <tr>
                        <th className="p-3 w-12 text-center">STT</th>
                        <th className="p-3">Khóa học</th>
                        <th className="p-3">Giáo viên</th>
                        <th className="p-3 text-center">Số HV</th>
                        <th className="p-3 text-center">Tiến độ TB</th>
                        <th className="p-3 text-center">Điểm TB</th>
                        <th className="p-3 text-center">Đạt / Chưa đạt</th>
                        <th className="p-3 text-center">Tỷ lệ Đạt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCourseSummaries.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                            Không tìm thấy dữ liệu khóa học phù hợp.
                          </td>
                        </tr>
                      ) : (
                        filteredCourseSummaries.map((item, idx) => (
                          <tr key={item.courseId} className="hover:bg-blue-50/40 transition-colors">
                            <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-3 font-bold text-slate-900">{item.courseTitle}</td>
                            <td className="p-3 text-slate-600 font-medium">{item.authorName}</td>
                            <td className="p-3 text-center font-bold text-blue-700">{item.enrolledCount} em</td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-bold text-[11px]">
                                {item.avgProgress}%
                              </span>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-900">{item.avgScore}</td>
                            <td className="p-3 text-center">
                              <span className="text-emerald-700 font-bold">{item.passedCount} Đạt</span>
                              <span className="text-slate-400 mx-1">/</span>
                              <span className="text-rose-700 font-bold">{item.failedCount} Chưa</span>
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-black ${
                                  item.passRatePercent >= 80
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.passRatePercent >= 50
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {item.passRatePercent}%
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: DETAILED STUDENTS TABLE */}
            {activeTab === 'STUDENTS' && (
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 border-b border-slate-200 uppercase tracking-wider text-[11px] font-bold text-slate-800">
                      <tr>
                        <th className="p-3 w-12 text-center">STT</th>
                        <th className="p-3">Mã học sinh</th>
                        <th className="p-3">Họ và tên</th>
                        <th className="p-3">Lớp / Đơn vị</th>
                        <th className="p-3">Khóa học</th>
                        <th className="p-3 text-center">Tiến độ</th>
                        <th className="p-3 text-center">Điểm thi</th>
                        <th className="p-3 text-center">Đánh giá</th>
                        <th className="p-3 text-center">Chứng chỉ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStudentReports.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-500 italic">
                            Chưa có dữ liệu học viên trong báo cáo.
                          </td>
                        </tr>
                      ) : (
                        filteredStudentReports.map((item, idx) => (
                          <tr key={`${item.idUser}-${item.courseId}-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                            <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-blue-900">{item.idUser}</td>
                            <td className="p-3 font-bold text-slate-900">{item.hoTen}</td>
                            <td className="p-3 font-medium text-slate-600">{item.chiDoan}</td>
                            <td className="p-3 text-slate-800 font-semibold max-w-[200px] truncate" title={item.courseTitle}>
                              {item.courseTitle}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="font-bold text-slate-800">{item.progressPercent}%</span>
                                <span className="text-[10px] text-slate-400">({item.completedLessons}/{item.totalLessons})</span>
                              </div>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-900">
                              {item.quizScore !== null ? item.quizScore : <span className="text-slate-400 font-normal">--</span>}
                            </td>
                            <td className="p-3 text-center">
                              {item.status === 'ĐẠT' && (
                                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-black text-[11px] rounded-full inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> ĐẠT
                                </span>
                              )}
                              {item.status === 'CHƯA ĐẠT' && (
                                <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 font-black text-[11px] rounded-full inline-flex items-center gap-1">
                                  <XCircle className="w-3 h-3" /> CHƯA ĐẠT
                                </span>
                              )}
                              {item.status === 'CHƯA LÀM' && (
                                <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 font-bold text-[11px] rounded-full">
                                  Chưa làm
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {item.hasCertificate ? (
                                <div className="inline-flex items-center gap-1.5 justify-center">
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold text-[10px] rounded-md">
                                    Đã cấp
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeCertificate(item)}
                                    title="Thu hồi và xóa giấy chứng nhận này"
                                    className="p-1 hover:bg-rose-100 text-rose-600 rounded-md transition-all cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[10px]">--</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0 print:hidden">
          <div>
            Hệ thống Quản lý Học tập LMS &copy; THPT Nguyễn Quang Diêu
          </div>
          {!isInline && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all cursor-pointer"
            >
              Đóng
            </button>
          )}
        </div>

      </div>
    );

  return isInline ? (
    <div className="w-full animate-in fade-in duration-200">{modalInner}</div>
  ) : (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/80 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static print-container">
      {modalInner}
    </div>
  );
};
