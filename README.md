<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/399bd532-221f-49cf-bfae-6382ddfce3ab

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel

This project uses two build outputs:

- `dist/` — React/Vite frontend.
- `server-dist/server.cjs` — bundled Express API used by the Vercel function at `api/index.ts`.

The API bundle is generated automatically by `npm run build`. Do not change the server bundle output back to `dist/server.cjs`; the Vercel function imports `server-dist/server.cjs`.

After deployment, verify the API with:

`https://YOUR-DOMAIN.vercel.app/api/health`

A healthy deployment returns JSON containing `"ok": true`.

For the AI features, set `GEMINI_API_KEY` in Vercel Project Settings → Environment Variables.

For better security, you can also set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in Vercel instead of relying on the application defaults.
## Đăng nhập nhiều thiết bị

Phiên bản này hỗ trợ **cùng một tài khoản đăng nhập đồng thời trên nhiều thiết bị/trình duyệt**.
Hệ thống không còn dùng một `sessionId` duy nhất cho mỗi tài khoản và không tự động đăng xuất thiết bị khác.

Mỗi tab/phiên trình duyệt lưu `LMS_USER` và `LMS_SESSION_ID` riêng trong `React memory`. Khi đóng phiên trình duyệt, thông tin đăng nhập sẽ tự hết hiệu lực; đăng nhập trên thiết bị khác không làm đăng xuất thiết bị hiện tại. API `/api/session/register` chỉ xác nhận phiên cục bộ và `/api/session/check` được giữ tương thích với phiên bản cũ nhưng luôn trả về phiên hợp lệ.

Nếu Firestore (disabled) còn dữ liệu cũ trong document `lms_data/active_sessions`, dữ liệu đó không còn được dùng để ép đăng xuất và có thể giữ nguyên.

## Authentication / Multi-device behavior

- The login state is stored only in `React memory` for the current browser tab.
- There is no single-session restriction and no server-side session conflict check.
- Logging in with the same account on a second browser/device does **not** log out the first browser/device.
- Reloading or navigating keeps the login.
- Closing the browser/tab normally clears the session and requires login again.
- Legacy `/api/session/register` and `/api/session/check` endpoints are kept as harmless compatibility endpoints; the frontend no longer calls them.


## Supabase deployment
1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase-schema.sql`.
3. In Vercel environment variables set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`).
4. Deploy normally with `npm run build`.
5. Verify `https://your-domain/api/health` returns `{ "ok": true, "database": "supabase" }`.

The browser does not contain the Supabase secret. All database access remains on the Express/Vercel server.
