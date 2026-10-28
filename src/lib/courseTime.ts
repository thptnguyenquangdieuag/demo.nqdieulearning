import { Course } from '../types';

export type CourseTimeStatus = 'NOT_STARTED' | 'ACTIVE' | 'ENDED';

export function getCourseTimeStatus(course: Course): CourseTimeStatus {
  if (!course) return 'ACTIVE';
  const now = new Date().getTime();

  if (course.startDate) {
    const start = new Date(course.startDate).getTime();
    if (!isNaN(start) && now < start) {
      return 'NOT_STARTED';
    }
  }

  if (course.endDate) {
    const end = new Date(course.endDate).getTime();
    if (!isNaN(end) && now > end) {
      return 'ENDED';
    }
  }

  return 'ACTIVE';
}

export function formatDateTimeDisplay(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');

  return `${hours}:${mins} ${day}/${month}/${year}`;
}

export function formatForDatetimeLocalInput(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    if (dateStr.length >= 16) return dateStr.slice(0, 16);
    return dateStr;
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${mins}`;
}

export function getTimeRemainingText(targetDateStr?: string): string {
  if (!targetDateStr) return '';
  const target = new Date(targetDateStr).getTime();
  if (isNaN(target)) return '';

  const now = new Date().getTime();
  const diffMs = target - now;

  if (diffMs <= 0) return 'Đã đến thời gian';

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    const remHours = diffHours % 24;
    return `${diffDays} ngày ${remHours} giờ`;
  }
  if (diffHours > 0) {
    const remMins = diffMinutes % 60;
    return `${diffHours} giờ ${remMins} phút`;
  }
  return `${diffMinutes} phút`;
}

