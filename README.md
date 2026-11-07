# freetier-loop

Single-admin control plane to monitor quotas and safely migrate domains, DNS zones, projects, databases, and environment configurations across multiple **Cloudflare**, **Vercel**, and **Supabase** accounts.

- **Architecture & Plan:** [`docs/PLAN.md`](./docs/PLAN.md)
- **Provider Research:** [`docs/RESEARCH.md`](./docs/RESEARCH.md)
- **Task Tracker:** [`docs/TASKS.md`](./docs/TASKS.md)
- **Agent Rules:** [`AGENTS.md`](./AGENTS.md) & [`.agents/rules/`](./.agents/rules/)

## Stack
- **Monorepo:** `pnpm` workspaces, Node.js ≥ 22, TypeScript strict, Biome, Vitest
- **Frontend (`apps/web`):** React 19, Vite, Tailwind CSS v4 (Bento Grid UI), TanStack Router, TanStack Query, Cloudflare Turnstile
- **Backend (`apps/api`):** Hono (runtime-agnostic + RPC), `better-auth` (`disableSignUp: true`), Drizzle ORM
- **Database (`packages/db`):** Cloudflare D1 (SQLite dialect, portable to libSQL / SQLite)
- **Shared (`packages/shared`):** Constants (`as const`), Zod schemas, DTO types, `Result` & `AppError`

## Quick Start (Local Development)

1. **Install dependencies:**
   ```bash
   pnpm install
   ```
2. **Configure local environment:**
   ```bash
   cp .dev.vars.example .dev.vars
   cp apps/web/.env.example apps/web/.env
   ```
3. **Run local migration & seed admin account:**
   ```bash
   pnpm db:migrate:local
   pnpm db:seed:admin -- --email admin@example.com --password CorrectHorseBatteryStaple!9
   ```
   > **Tài khoản Admin mặc định trên Local:**
   > - **Email:** `admin@example.com` (phải nằm trong danh sách `ADMIN_EMAILS` của file `.dev.vars`)
   > - **Mật khẩu:** `CorrectHorseBatteryStaple!9` (tối thiểu 12 ký tự)
   > - Bạn có thể tạo thêm hoặc đổi mật khẩu bất kỳ lúc nào bằng lệnh:  
   >   `pnpm db:seed:admin -- --email email-cua-ban@gmail.com --password MatKhauMoiCuaBan`

4. **Run quality checks & tests:**
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
5. **Start local dev servers (API Worker + Vite SPA):**
   ```bash
   pnpm dev
   ```
   - Web SPA: `http://localhost:5173` (tự động redirect đến `/login`)
   - API Worker: `http://localhost:8787/api/v1/health`

---

## Deployment Guide

### Option 1: Deploy lên Cloudflare (Khuyên dùng — 1 Worker gộp cả Web + API + D1)

Nhờ cấu hình `assets` trong [`wrangler.jsonc`](./wrangler.jsonc), **cả Frontend (`apps/web/dist`) lẫn Backend Hono (`apps/api`) được đóng gói và deploy lên duy nhất 1 Cloudflare Worker** trên cùng 1 tên miền (không tốn 2 project, không bị lỗi CORS/Cookie).

#### Bước 1: Tạo Database D1 (chỉ làm 1 lần đầu)
```bash
pnpm wrangler login
pnpm wrangler d1 create freetier-loop-db
```
Copy `database_id` mà Cloudflare trả về và dán vào trường `d1_databases[0].database_id` trong [`wrangler.jsonc`](./wrangler.jsonc).

#### Bước 2: Tạo các khóa Secret trên Cloudflare (chỉ làm 1 lần đầu)
```bash
# Khóa ký session của better-auth (chuỗi ngẫu nhiên >= 32 ký tự)
pnpm wrangler secret put BETTER_AUTH_SECRET

# Khóa AES-256-GCM 32-byte (base64) để mã hóa API Token của các account
# Sinh nhanh bằng: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
pnpm wrangler secret put ENCRYPTION_KEY

# Secret key của Cloudflare Turnstile (tạo trong Cloudflare Dashboard -> Turnstile)
pnpm wrangler secret put TURNSTILE_SECRET_KEY
```
Cập nhật các biến công khai trong `wrangler.jsonc` (`vars`):
- `BETTER_AUTH_URL`: URL chính thức của trang admin (ví dụ `https://admin.ten-mien-cua-ban.com`)
- `ADMIN_EMAILS`: email admin được phép đăng nhập (ví dụ `ban@gmail.com`)
- `SELF_PROTECTED_HOSTS`: tên miền của trang admin để hệ thống tự khóa không cho xóa/move nhầm
- Đặt `VITE_TURNSTILE_SITE_KEY` trong `apps/web/.env.production` trước khi build.

#### Bước 3: Chạy Migration & Tạo tài khoản Admin trên D1 Remote
```bash
pnpm db:generate
pnpm db:migrate:remote
pnpm db:seed:admin --email ban@gmail.com --password "MatKhauManhTren12KyTu!" --remote
```

#### Bước 4: Build & Deploy toàn bộ Web + API bằng 1 lệnh
```bash
pnpm deploy
```
*(Lệnh `pnpm deploy` sẽ tự động chạy `vite build` tạo ra `apps/web/dist`, sau đó `wrangler deploy` đẩy cả giao diện tĩnh lẫn Hono API Worker lên Cloudflare).*

---

### Option 2: Deploy sang nơi khác (Docker / VPS / Fly.io / Render / Railway)

Vì toàn bộ phần lõi (`apps/api/src/modules/*` và `packages/db`) được viết **Runtime-agnostic (không phụ thuộc cứng vào Cloudflare)**, bạn có thể chuyển sang bất kỳ server Node.js nào chỉ với 2 cách:

1. **Chạy chung 1 container Node.js (`entries/node.ts`):**
   - Dùng `@hono/node-server` phục vụ cả `/api/*` lẫn thư mục tĩnh `apps/web/dist`.
   - Database tự động chuyển sang file SQLite nội bộ (`better-sqlite3`) hoặc **Turso / libSQL** thông qua biến môi trường `DATABASE_URL` (giữ nguyên 100% schema Drizzle).
   - Khởi chạy bằng Docker:
     ```bash
     docker compose up -d --build
     ```
2. **Tách riêng Frontend và Backend (nếu muốn host Web trên Vercel/Netlify, API ở nơi khác):**
   - **Frontend (`apps/web`):** trỏ Root Directory vào `apps/web`, Build Command: `pnpm --filter @freetier-loop/web build`, Output: `apps/web/dist`, đặt biến môi trường `VITE_API_BASE_URL=https://api.ten-mien.com`.
   - **Backend (`apps/api`):** đặt biến `WEB_ORIGIN=https://admin.ten-mien.com` để Hono tự động bật CORS kèm `credentials: true`.


