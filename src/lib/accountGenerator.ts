// Account Generator Utility for LMS NQDieu
// Automatically generates unique usernames (ID) and default passwords for Teachers and Students

export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  let result = String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  result = result.replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'));
  return result;
}

/**
 * Generate a standardized username for a Teacher:
 * Format: gv.<ten-khong-dau>.<to-chuyen-mon-khong-dau> (e.g. gv.an.toan, gv.trang.hoahoc)
 */
export function generateTeacherUsername(
  hoTen: string,
  toChuyenMon: string = '',
  existingIds: Set<string> = new Set()
): string {
  const cleanName = removeVietnameseTones(hoTen.trim().toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').trim();
  const nameParts = cleanName.split(/\s+/).filter(Boolean);
  const givenName = nameParts.length > 0 ? nameParts[nameParts.length - 1] : 'gv';

  let cleanOrg = removeVietnameseTones(toChuyenMon.trim().toLowerCase())
    .replace(/^tổ\s+/, '')
    .replace(/^bộ\s*môn\s+/, '')
    .replace(/[^a-z0-9]/g, '');

  if (!cleanOrg) cleanOrg = 'gv';

  let baseId = `gv.${givenName}.${cleanOrg}`;
  let candidate = baseId;
  let counter = 1;

  while (existingIds.has(candidate.toLowerCase())) {
    if (nameParts.length > 1 && counter === 1) {
      const middlePlusGiven = nameParts.slice(-2).join('');
      candidate = `gv.${middlePlusGiven}.${cleanOrg}`;
    } else {
      counter++;
      candidate = `${baseId}${counter}`;
    }
  }

  return candidate;
}

/**
 * Generate a standardized username for a Student:
 * Format: hs.<ten-khong-dau>.<lop-hoac-khoi-khong-dau> (e.g. hs.an.12a1, hs.tam.11a3)
 */
export function generateStudentUsername(
  hoTen: string,
  lopOrKhoi: string = '',
  existingIds: Set<string> = new Set()
): string {
  const cleanName = removeVietnameseTones(hoTen.trim().toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').trim();
  const nameParts = cleanName.split(/\s+/).filter(Boolean);
  const givenName = nameParts.length > 0 ? nameParts[nameParts.length - 1] : 'hs';

  let cleanClass = removeVietnameseTones(lopOrKhoi.trim().toLowerCase())
    .replace(/^lớp\s+/, '')
    .replace(/^chi\s*đoàn\s+/, '')
    .replace(/^khối\s+/, 'k')
    .replace(/[^a-z0-9]/g, '');

  if (!cleanClass) cleanClass = 'k12';

  let baseId = `hs.${givenName}.${cleanClass}`;
  let candidate = baseId;
  let counter = 1;

  while (existingIds.has(candidate.toLowerCase())) {
    if (nameParts.length > 1 && counter === 1) {
      const middlePlusGiven = nameParts.slice(-2).join('');
      candidate = `hs.${middlePlusGiven}.${cleanClass}`;
    } else {
      counter++;
      candidate = `${baseId}${counter}`;
    }
  }

  return candidate;
}
