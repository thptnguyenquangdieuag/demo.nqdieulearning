export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface User {
  idUser: string;
  hoTen: string;
  chiDoan: string;
  role: UserRole;
  isFirstLogin?: boolean;
  avatar?: string;
  avatarUrl?: string;
}

export interface PendingRegistration {
  id: string;
  idUser: string;
  hoTen: string;
  email: string;
  chiDoan: string;
  role: 'STUDENT' | 'TEACHER';
  password: string;
  createdAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  processedAt?: string;
  processedBy?: string;
  responseNote?: string;
}

export interface ResetPasswordRequest {
  id: string;
  idUser: string;
  hoTen?: string;
  chiDoan?: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  processedAt?: string;
  processedBy?: string;
  note?: string;
}

export interface QuizQuestionP1 {
  question: string;
  options: Record<string, string>;
  correct: string;
}

export interface QuizQuestionP2 {
  question: string;
  options: Record<string, string>;
  correctMap: Record<string, 'DUNG' | 'SAI'>;
}

export interface QuizQuestionP3 {
  question: string;
  correct: string;
}

export interface QuizPartConfigP1 {
  enabled: boolean;
  count: number;
  totalScore: number;
  bank: QuizQuestionP1[];
}

export interface QuizPartConfigP2 {
  enabled: boolean;
  count: number;
  scores: {
    s1: number;
    s2: number;
    s3: number;
    s4: number;
  };
  bank: QuizQuestionP2[];
}

export interface QuizPartConfigP3 {
  enabled: boolean;
  count: number;
  totalScore: number;
  bank: QuizQuestionP3[];
}

export interface LessonExerciseConfig {
  enabled: boolean;
  durationMin: number;
  maxAttempts: number;
  passingScore: number;
  p1: QuizPartConfigP1;
  p2: QuizPartConfigP2;
  p3: QuizPartConfigP3;
}

export interface Lesson {
  title: string;
  videoUrl?: string;
  docUrl?: string;
  pptUrl?: string;
  duration: number; // in seconds
  exerciseConfig?: LessonExerciseConfig;
}

export interface CourseQuizConfig {
  enabled: boolean;
  durationMin: number;
  maxAttempts: number;
  passingScore: number;
  p1: QuizPartConfigP1;
  p2: QuizPartConfigP2;
  p3: QuizPartConfigP3;
}

export interface CertificateConfig {
  enabled: boolean;
  parentOrganization: string;
  organization: string;
  signerTitle: string;
  delegateTitle?: string;
  signerName?: string;
  signatureImage?: string;
  logoImage?: string;
  logoSize?: number;
  signatureSize?: number;
  fontSizeScale?: number;
  bgTheme?: 'blue_sky' | 'classic_gold' | 'modern_tech' | 'custom';
  bgCustomImage?: string;
  certNumberSuffix?: string;
}

export interface IssuedCertificate {
  certificateId: string;
  certificateNumberStr: string;
  idUser: string;
  studentName: string;
  studentClass?: string;
  courseId: string;
  courseTitle: string;
  issueDate: string;
  formattedDateStr: string;
  parentOrganization: string;
  organization: string;
  signerTitle: string;
  delegateTitle?: string;
  signerName: string;
  signatureImage?: string;
  logoImage?: string;
  logoSize?: number;
  signatureSize?: number;
  fontSizeScale?: number;
  bgTheme?: string;
  bgCustomImage?: string;
  certNumberSuffix?: string;
}

export interface OnlineMeetingConfig {
  enabled: boolean;
  platform?: 'google_meet' | 'ms_teams' | 'zoom' | 'other';
  meetingUrl: string;
  title?: string;
  scheduleTime?: string;
  note?: string;
}

export interface Course {
  courseId: string;
  title: string;
  description: string;
  imageUrl: string;
  lessons: Lesson[];
  quizConfig: CourseQuizConfig;
  practiceConfig?: CourseQuizConfig;
  certificateConfig?: CertificateConfig;
  onlineMeetingConfig?: OnlineMeetingConfig;
  startDate?: string;
  endDate?: string;
  authorId: string;
  authorName: string;
}

export interface LessonProgress {
  watchedSec: number;
  lastVideoTime?: number;
  isCompleted?: boolean;
}

export interface ExerciseProgress {
  attempts: number;
  lastScore: number;
  passed: boolean;
  detail?: any[];
}

export interface QuizStatus {
  attempts: number;
  lastScore: number;
  detail?: any[];
}

export interface StudentReport {
  idUser: string;
  hoTen: string;
  chiDoan: string;
  enrollDate: string;
  completedLessons: number;
  totalLessons: number;
  quizScore: number | null;
  maxScore?: number | null;
  minScore?: number | null;
  quizAttempts: number;
  violations?: number;
  status: 'ĐẠT' | 'CHƯA ĐẠT' | 'Đang học';
  hasCertificate?: boolean;
  certificateId?: string | null;
  certificateNumberStr?: string | null;
}

export interface ActiveQuizQuestion {
  part: number;
  type: 'P1' | 'P2' | 'P3';
  question: string;
  options?: Record<string, string>;
  correct?: string;
  correctMap?: Record<string, 'DUNG' | 'SAI'>;
  score?: number;
  scores?: { s1: number; s2: number; s3: number; s4: number };
  globalIdx?: number;
}

export interface ActiveQuizDetailResult extends ActiveQuizQuestion {
  userAns: any;
  isCorrect: boolean;
  score: number;
}

export interface QaAnswer {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'STUDENT' | 'TEACHER' | 'ADMIN';
  authorClass?: string;
  content: string;
  createdAt: string;
  likes: number;
  likedBy?: string[];
}

export interface QaQuestion {
  id: string;
  courseId: string;
  courseTitle?: string;
  lessonIdx: number;
  lessonTitle?: string;
  authorId: string;
  authorName: string;
  authorRole: 'STUDENT' | 'TEACHER' | 'ADMIN';
  authorClass?: string;
  content: string;
  createdAt: string;
  likes: number;
  likedBy?: string[];
  answers: QaAnswer[];
}

export type NotificationType =
  | 'QA_ANSWER'
  | 'EXAM_NEW'
  | 'EXAM_EXPIRING'
  | 'CERTIFICATE_ISSUED'
  | 'BADGE_EARNED'
  | 'LIVE_CLASS_STARTING'
  | 'ANNOUNCEMENT'
  | 'ACCOUNT_REGISTRATION'
  | 'PASSWORD_RESET'
  | 'ACCOUNT_APPROVED'
  | 'PASSWORD_RESET_APPROVED';

export interface AppNotification {
  id: string;
  recipientId: string; // idUser or 'ALL' or 'STUDENTS' or 'TEACHERS'
  recipientRole?: UserRole | 'ALL';
  type: NotificationType;
  title: string;
  message: string;
  linkCourseId?: string;
  linkLessonIdx?: number;
  linkAction?: 'open_course' | 'open_qa' | 'open_exam' | 'open_cert' | 'open_badges' | 'open_meeting' | 'open_account_management';
  linkUrl?: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface SchoolNotice {
  id: string;
  title: string;
  content: string;
  category: 'CHUNG' | 'THI_CU' | 'LICH_HOC' | 'HOAT_DONG' | 'KHAN_CAP';
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  pinned: boolean;
  createdAt: string;
  targetAudience: 'ALL' | 'STUDENT' | 'TEACHER';
  attachments?: { name: string; url: string }[];
}


export interface LearningGame {
  id: string;
  title: string;
  description?: string;
  gameUrl: string;
  subject?: string;
  grade?: string;
  platform?: 'Wordwall' | 'Kahoot' | 'Quizizz' | 'Quizlet' | 'Blooket' | 'Gimkit' | 'Baamboozle' | 'Khác';
  authorId: string;
  authorName: string;
  authorRole?: string;
  createdAt: string;
  updatedAt?: string;
  courseId?: string;
  courseTitle?: string;
  tags?: string[];
  playCount?: number;
}
