# Hướng dẫn Deploy freetier-loop lên Cloudflare

Tài liệu này hướng dẫn chi tiết cách triển khai hệ thống **freetier-loop** (All-in-One Cloudflare Worker + D1 Database + Static Assets SPA) từ GitHub.

---

## 1. Yêu cầu tiên quyết
- Node.js ≥ 22.0.0
- pnpm ≥ 10.0.0
- Tài khoản [Cloudflare](https://dash.cloudflare.com)

---

## 2. Bước 1: Tạo Cloudflare D1 Database

Chạy lệnh tạo D1 database từ terminal dự án:
```bash
pnpm exec wrangler d1 create freetier-loop-db
```

Kết quả trả về sẽ có dạng:
```json
{
  "binding": "DB",
  "database_name": "freetier-loop-db",
  "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Copy giá trị `database_id` và cập nhật vào file `wrangler.jsonc`:
```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "freetier-loop-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "migrations_dir": "packages/db/migrations"
  }
]
```

---

## 3. Bước 2: Tạo Cloudflare Turnstile Widget (Chống Bot & Brute-force)

1. Mở [Cloudflare Dashboard](https://dash.cloudflare.com) > **Turnstile** > **Add Widget**.
2. Đặt tên: `freetier-loop`.
3. Nhập domain triển khai của bạn (ví dụ `*.workers.dev` hoặc custom domain `admin.yourdomain.com`).
4. Chế độ: **Managed**.
5. Nhận 2 khóa:
   - **Site Key**: Khóa công khai dùng cho frontend.
   - **Secret Key**: Khóa bí mật dùng cho backend Worker.

---

## 4. Bước 3: Cấu hình Secrets trên Cloudflare Worker

Sinh khóa mã hóa AES-GCM (32-byte base64) cho provider tokens:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cấu hình các secret cho Worker qua CLI:
```bash
# 1. Khóa bí mật session auth (dài >= 32 ký tự)
pnpm exec wrangler secret put BETTER_AUTH_SECRET

# 2. Secret Key từ Turnstile (Bước 2)
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY

# 3. Khóa AES-GCM 32 byte base64 (sinh ở trên)
pnpm exec wrangler secret put ENCRYPTION_KEY

# 4. Email admin duy nhất được phép đăng nhập
pnpm exec wrangler secret put ADMIN_EMAILS
# Nhập: your-email@example.com

# 5. URL production chính thức của app
pnpm exec wrangler secret put BETTER_AUTH_URL
# Nhập: https://freetier-loop.<your-subdomain>.workers.dev
```

---

## 5. Bước 4: Khởi tạo Database & Tài khoản Admin ban đầu

Chạy migrations lên D1 Remote:
```bash
pnpm db:migrate:remote
```

Tạo tài khoản Admin ban đầu trên D1 Remote:
```bash
pnpm db:seed:admin -- --email your-email@example.com --password "YourStrongPassword123!" --remote
```

---

## 6. Bước 5: Thiết lập Tự động Deploy qua GitHub Actions

Để mỗi lần `git push origin main` hệ thống tự động kiểm tra code, migrate database và deploy lên Cloudflare:

1. Vào [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) > **Create Token** > Sử dụng mẫu **Edit Cloudflare Workers**.
2. Lấy **Account ID** tại thanh bên phải trên Cloudflare Dashboard.
3. Vào GitHub Repository của bạn > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**:
   - `CLOUDFLARE_API_TOKEN`: Token vừa tạo ở trên.
   - `CLOUDFLARE_ACCOUNT_ID`: Account ID của bạn.
   - `VITE_TURNSTILE_SITE_KEY`: Turnstile Site Key (ở Bước 2).

Mỗi khi bạn đẩy code lên nhánh `main`, file `.github/workflows/deploy.yml` sẽ tự động chạy toàn bộ quy trình:
1. `pnpm lint`, `pnpm typecheck`, `pnpm test`.
2. Đóng gói Frontend (`apps/web/dist`).
3. Chạy `wrangler d1 migrations apply freetier-loop-db --remote`.
4. Deploy lên Cloudflare Workers.

---

## 7. Deploy thủ công từ máy tính (Tùy chọn)

Nếu muốn deploy trực tiếp từ terminal mà không qua GitHub Actions:
```bash
# Tạo file apps/web/.env.production chứa Site Key
echo "VITE_API_BASE_URL=/" > apps/web/.env.production
echo "VITE_TURNSTILE_SITE_KEY=<YOUR_SITE_KEY>" >> apps/web/.env.production

# Build Web và Deploy Worker
pnpm deploy
```

