// Google Sheets Sync & Storage Engine for LMS
// Automatically maps LMS collections (courses, accounts, registrations, progress, quiz, Q&A) into Google Sheets tabs

export interface SyncStats {
  adminsCount?: number;
  teachersCount: number;
  studentsCount: number;
  coursesCount: number;
  enrollmentsCount: number;
  progressCount: number;
  qaCount: number;
  timestamp: string;
}

// Convert Array of Objects to 2D row array for Google Sheets
export function objectsToSheetRows(headers: string[], items: any[]): any[][] {
  const rows: any[][] = [headers];
  for (const item of items) {
    if (!item) continue;
    const row = headers.map((h) => {
      const val = item[h];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });
    rows.push(row);
  }
  return rows;
}

// Parse 2D row array from Google Sheets back into Array of Objects
export function sheetRowsToObjects(rows: any[][]): any[] {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const headers = rows[0].map((h: any) => String(h).trim());
  const results: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || row.every((c: any) => c === '' || c === undefined)) continue;
    const obj: any = {};
    headers.forEach((header, colIdx) => {
      if (!header) return;
      const rawVal = row[colIdx] !== undefined ? row[colIdx] : '';
      if (typeof rawVal === 'string' && (rawVal.startsWith('{') || rawVal.startsWith('['))) {
        try {
          obj[header] = JSON.parse(rawVal);
        } catch {
          obj[header] = rawVal;
        }
      } else {
        obj[header] = rawVal;
      }
    });
    results.push(obj);
  }
  return results;
}

export const LMS_SHEET_TABS = [
  {
    title: 'QT_TàiKhoản',
    headers: ['idUser', 'hoTen', 'chiDoan', 'defaultPass', 'customPass', 'role', 'avatar'],
  },
  {
    title: 'GV_TàiKhoản',
    headers: ['idUser', 'hoTen', 'chiDoan', 'defaultPass', 'customPass', 'role', 'avatar'],
  },
  {
    title: 'HS_TàiKhoản',
    headers: ['idUser', 'hoTen', 'chiDoan', 'khoi', 'defaultPass', 'customPass', 'role', 'avatar'],
  },
  {
    title: 'DS_KhóaHọc',
    headers: ['courseId', 'title', 'subject', 'grade', 'authorName', 'authorId', 'description', 'lessons', 'quizConfig', 'certificateConfig', 'startDate', 'endDate', 'isPublished'],
  },
  {
    title: 'DS_ĐăngKý',
    headers: ['idUser', 'courseId', 'courseName', 'enrollDate', 'status'],
  },
  {
    title: 'TiếnĐộ_HọcTập',
    headers: ['idUser', 'courseId', 'lessonKey', 'progressData', 'detailResult', 'updatedAt'],
  },
  {
    title: 'YêuCầu_ĐăngKý',
    headers: ['id', 'idUser', 'hoTen', 'email', 'chiDoan', 'role', 'password', 'createdAt', 'status', 'processedAt', 'processedBy', 'responseNote'],
  },
  {
    title: 'YêuCầu_ĐặtLạiMK',
    headers: ['id', 'idUser', 'hoTen', 'chiDoan', 'role', 'requestedAt', 'status', 'processedAt', 'processedBy', 'note'],
  },
  {
    title: 'Giấy_ChứngNhận',
    headers: ['certificateId', 'certificateNumberStr', 'idUser', 'studentName', 'studentClass', 'courseId', 'courseTitle', 'issueDate', 'formattedDateStr', 'organization', 'signerTitle', 'signerName'],
  },
  {
    title: 'HỏiĐáp_QnA',
    headers: ['id', 'courseId', 'courseTitle', 'lessonIdx', 'lessonTitle', 'authorId', 'authorName', 'authorRole', 'authorClass', 'content', 'createdAt', 'likes', 'answers'],
  },
];
