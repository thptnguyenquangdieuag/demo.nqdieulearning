-- ==============================================================================
-- NQDIEU LEARNING LMS - SUPABASE DATABASE INITIALIZATION SCHEMA
-- Phiên bản: 3.0 (Đồng bộ hóa dữ liệu toàn diện & Hiệu năng cao)
--
-- HƯỚNG DẪN SỬ DỤNG:
-- 1. Đăng nhập Supabase Dashboard: https://supabase.com/dashboard
-- 2. Chọn dự án của bạn -> Chọn mục "SQL Editor" ở menu bên trái.
-- 3. Tạo "New query", dán toàn bộ nội dung script này vào và nhấn "RUN" (hoặc Ctrl + Enter).
-- 4. Thông báo "Success. No rows returned" xuất hiện là cơ sở dữ liệu đã sẵn sàng!
-- ==============================================================================

-- 1. BẢNG KEY-VALUE LƯU TRỮ TRẠNG THÁI HỆ THỐNG
-- Lưu trữ: Tài khoản GV/HS, Đăng ký chờ duyệt, Yêu cầu đổi mật khẩu, Điểm số, Q&A,...
CREATE TABLE IF NOT EXISTS public.lms_kv (
  key text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. BẢNG KHÓA HỌC TỪNG DÒNG ĐỘC LẬP
-- Lưu trữ từng khóa học riêng biệt, hỗ trợ dung lượng lớn, video bài giảng, tài liệu & trắc nghiệm
CREATE TABLE IF NOT EXISTS public.lms_courses (
  course_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. BẢNG NHẬT KÝ ĐỒNG BỘ VÀ KIỂM TRA SỨC KHỎE HỆ THỐNG (Audit & Sync Logs)
CREATE TABLE IF NOT EXISTS public.lms_sync_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. THIẾT LẬP REPLICA IDENTITY FULL (Hỗ trợ realtime truyền đầy đủ dữ liệu khi UPDATE / DELETE)
ALTER TABLE public.lms_kv REPLICA IDENTITY FULL;
ALTER TABLE public.lms_courses REPLICA IDENTITY FULL;
ALTER TABLE public.lms_sync_logs REPLICA IDENTITY FULL;

-- 5. HÀM VÀ TRIGGER TỰ ĐỘNG CẬP NHẬT THỜI GIAN "updated_at" KHI CÓ THAY ĐỔI
CREATE OR REPLACE FUNCTION public.handle_lms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Gắn trigger cho bảng lms_kv
DROP TRIGGER IF EXISTS trigger_lms_kv_updated_at ON public.lms_kv;
CREATE TRIGGER trigger_lms_kv_updated_at
  BEFORE UPDATE ON public.lms_kv
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_lms_updated_at();

-- Gắn trigger cho bảng lms_courses
DROP TRIGGER IF EXISTS trigger_lms_courses_updated_at ON public.lms_courses;
CREATE TRIGGER trigger_lms_courses_updated_at
  BEFORE UPDATE ON public.lms_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_lms_updated_at();

-- 6. CHỈ MỤC TĂNG TỐC TRUY VẤN (INDEXES)
CREATE INDEX IF NOT EXISTS lms_courses_updated_at_idx 
  ON public.lms_courses (updated_at DESC);

CREATE INDEX IF NOT EXISTS lms_kv_updated_at_idx 
  ON public.lms_kv (updated_at DESC);

CREATE INDEX IF NOT EXISTS lms_courses_data_gin_idx 
  ON public.lms_courses USING gin (data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS lms_kv_data_gin_idx 
  ON public.lms_kv USING gin (data jsonb_path_ops);

-- 7. BẢO MẬT & PHÂN QUYỀN TRUY CẬP (ROW LEVEL SECURITY - RLS)
ALTER TABLE public.lms_kv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_sync_logs ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ để đảm bảo không bị xung đột khi chạy lại
DROP POLICY IF EXISTS "lms_kv_all_access" ON public.lms_kv;
DROP POLICY IF EXISTS "lms_courses_all_access" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_sync_logs_all_access" ON public.lms_sync_logs;
DROP POLICY IF EXISTS "Allow all access" ON public.lms_kv;
DROP POLICY IF EXISTS "Allow all access" ON public.lms_courses;
DROP POLICY IF EXISTS "Allow all access" ON public.lms_sync_logs;
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.lms_kv;
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.lms_courses;
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.lms_sync_logs;

-- Cấp quyền truy cập an toàn, đầy đủ cho cả service_role, authenticated và anon
CREATE POLICY "lms_kv_all_access" ON public.lms_kv
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lms_courses_all_access" ON public.lms_courses
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lms_sync_logs_all_access" ON public.lms_sync_logs
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Phân quyền toàn diện trên Schema public
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- 8. KÍCH HOẠT SUPABASE REALTIME (Tự động thông báo khi có dữ liệu mới)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lms_kv;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lms_courses;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lms_sync_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 9. HÀM RPC KIỂM TRA SỨC KHỎE KẾT NỐI (HEALTH CHECK RPC)
CREATE OR REPLACE FUNCTION public.lms_ping()
RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'database', 'Supabase PostgreSQL',
    'timestamp', extract(epoch from timezone('utc'::text, now())),
    'courses_count', (SELECT count(*) FROM public.lms_courses),
    'kv_keys_count', (SELECT count(*) FROM public.lms_kv)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.lms_ping() TO postgres, anon, authenticated, service_role;

-- 10. GHI NHẬN NHẬT KÝ KHỞI TẠO THÀNH CÔNG
INSERT INTO public.lms_sync_logs (event, details)
VALUES ('SCHEMA_INITIALIZED', jsonb_build_object('status', 'SUCCESS', 'version', '3.0_FULL_SYNC', 'initialized_at', now()));


