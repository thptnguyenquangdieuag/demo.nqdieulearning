import { Course, User } from '../types';
import {
  addNotification,
  getStoredNotifications,
  getStoredPendingRegistrations,
  getStoredResetPasswordRequests,
} from './storage';
import { getCourseTimeStatus } from './courseTime';

/**
 * Tự động kiểm tra và bắn thông báo:
 * 1. Có bài kiểm tra mới hoặc sắp hết hạn
 * 2. Lớp học trực tuyến sắp bắt đầu / đang diễn ra
 */
export function checkAndDispatchCourseNotifications(courses: Course[], currentUser: User | null) {
  if (!courses || courses.length === 0 || !currentUser) return;

  const now = new Date();
  const userId = currentUser.idUser;

  courses.forEach((course) => {
    // 1. Kiểm tra bài kiểm tra mới & hạn chót
    const hasQuiz = course.quizConfig && course.quizConfig.enabled;
    const timeStatus = getCourseTimeStatus(course);

    if (hasQuiz && course.endDate) {
      try {
        const endDate = new Date(course.endDate);
        const timeDiffMs = endDate.getTime() - now.getTime();
        const hoursLeft = timeDiffMs / (1000 * 60 * 60);

        // Nếu còn dưới 24h và chưa hết hạn -> Thông báo sắp hết hạn
        if (hoursLeft > 0 && hoursLeft <= 24) {
          const hoursLeftInt = Math.ceil(hoursLeft);
          addNotification(
            {
              id: `notif_exp_${course.courseId}_${endDate.toISOString().slice(0, 10)}`,
              recipientId: userId,
              type: 'EXAM_EXPIRING',
              title: `Sắp hết hạn bài kiểm tra: ${course.title}`,
              message: `Khóa học "${course.title}" chỉ còn ${hoursLeftInt} giờ để hoàn thành bài kiểm tra trực tuyến. Hãy nhanh chóng làm bài!`,
              linkCourseId: course.courseId,
              linkAction: 'open_course',
              createdAt: new Date().toISOString(),
            },
            currentUser.idUser
          );
        }
      } catch (err) {
        // ignore date error
      }
    }

    // 2. Kiểm tra Phòng học trực tuyến (Google Meet / Zoom)
    if (course.onlineMeetingConfig && course.onlineMeetingConfig.enabled && course.onlineMeetingConfig.meetingUrl) {
      const scheduleStr = course.onlineMeetingConfig.scheduleTime;
      if (scheduleStr) {
        try {
          const meetingTime = new Date(scheduleStr);
          const diffMins = (meetingTime.getTime() - now.getTime()) / (1000 * 60);

          // Nếu sắp diễn ra trong vòng 30 phút hoặc đang diễn ra trong 90 phút qua
          if (diffMins >= -90 && diffMins <= 30) {
            addNotification(
              {
                id: `notif_meet_${course.courseId}_${meetingTime.toISOString().slice(0, 13)}`,
                recipientId: userId,
                type: 'LIVE_CLASS_STARTING',
                title: `Đến giờ vào học trực tuyến: ${course.title}`,
                message: `${course.onlineMeetingConfig.title || 'Lớp học trực tuyến'} (${course.onlineMeetingConfig.platform?.toUpperCase() || 'Meet'}) đang diễn ra. Bấm để tham gia ngay!`,
                linkCourseId: course.courseId,
                linkAction: 'open_meeting',
                linkUrl: course.onlineMeetingConfig.meetingUrl,
                createdAt: new Date().toISOString(),
              },
              currentUser.idUser
            );
          }
        } catch {
          // ignore
        }
      }
    }
  });
}

/**
 * Tự động kiểm tra và thông báo về:
 * 1. Yêu cầu đăng ký tài khoản mới (dành cho Admin)
 * 2. Yêu cầu quên/đặt lại mật khẩu (dành cho Admin và Giáo viên phụ trách học sinh)
 * 3. Trạng thái tài khoản đã được phê duyệt cho người dùng
 */
export function checkAndDispatchAccountNotifications(currentUser: User | null) {
  if (!currentUser) return;

  const isAdmin = currentUser.role === 'ADMIN';
  const isTeacher = currentUser.role === 'TEACHER';
  const cleanId = String(currentUser.idUser || '').trim().toLowerCase();

  // 1. Quản trị viên & Giáo viên nhận thông báo khi có yêu cầu mới
  if (isAdmin || isTeacher) {
    // 1.1 Yêu cầu đăng ký mới
    const pendingList = getStoredPendingRegistrations();
    pendingList.forEach((reg) => {
      if (reg.status === 'PENDING') {
        addNotification(
          {
            id: `notif_pending_reg_${reg.id}`,
            recipientId: 'teachers',
            recipientRole: 'ADMIN',
            type: 'ACCOUNT_REGISTRATION',
            title: 'Yêu cầu đăng ký tài khoản mới',
            message: `Người dùng ${reg.hoTen} (${reg.chiDoan}, Email: ${reg.email || 'N/A'}) vừa gửi yêu cầu đăng ký tài khoản ${reg.role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'}.`,
            linkAction: 'open_account_management',
            createdAt: reg.createdAt || new Date().toISOString(),
          },
          currentUser.idUser
        );
      }
    });

    // 1.2 Yêu cầu reset mật khẩu
    const resetList = getStoredResetPasswordRequests();
    resetList.forEach((req) => {
      if (req.status === 'PENDING') {
        const canManage = isAdmin || req.role === 'STUDENT';
        if (canManage) {
          addNotification(
            {
              id: `notif_pending_reset_${req.id}`,
              recipientId: 'teachers',
              recipientRole: req.role === 'STUDENT' ? 'TEACHER' : 'ADMIN',
              type: 'PASSWORD_RESET',
              title: 'Yêu cầu quên / đặt lại mật khẩu',
              message: `Tài khoản ${req.hoTen || req.idUser} (${req.idUser} - ${req.chiDoan || (req.role === 'TEACHER' ? 'Giáo viên' : 'Học sinh')}) yêu cầu đặt lại mật khẩu về mặc định (123).`,
              linkAction: 'open_account_management',
              createdAt: req.requestedAt || new Date().toISOString(),
            },
            currentUser.idUser
          );
        }
      }
    });
  }

  // 2. Học sinh / Giáo viên nhận thông báo khi tài khoản / reset MK của mình được duyệt
  const resetList = getStoredResetPasswordRequests();
  const myApprovedReset = resetList.find(
    (r) => String(r.idUser || '').trim().toLowerCase() === cleanId && r.status === 'APPROVED'
  );
  if (myApprovedReset) {
    addNotification(
      {
        id: `notif_approved_reset_${myApprovedReset.id}`,
        recipientId: currentUser.idUser,
        type: 'PASSWORD_RESET_APPROVED',
        title: 'Mật khẩu đã được đặt lại thành công',
        message: `Yêu cầu đặt lại mật khẩu cho tài khoản ${currentUser.hoTen} (${currentUser.idUser}) đã được Admin/Giáo viên phê duyệt. Mật khẩu hiện tại của bạn là: 123.`,
        createdAt: myApprovedReset.processedAt || new Date().toISOString(),
      },
      currentUser.idUser
    );
  }
}

