# TASKS — freetier-loop

> Quy ước: `[ ]` chưa làm · `[~]` đang làm · `[x]` xong. Mỗi task có **Deps** (task phải xong trước) và **AC** (tiêu chí nghiệm thu).
> Definition of Done chung: xem `.agents/rules/08-testing-quality.md`.
> Ước lượng: S ≤ 2h · M ≤ 1 ngày · L ≤ 2-3 ngày.

---

## M0 — Foundation

- [x] **T-001 Khởi tạo monorepo** (S)
  pnpm workspaces (`apps/*`, `packages/*`), `.nvmrc` (22), `.gitignore` (`.dev.vars`, `.env*`, `dist`, `.wrangler`), `.editorconfig`, root scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `db:*`).
  AC: `pnpm install` OK; `pnpm -r exec node -v` chạy được.
- [x] **T-002 `packages/config`** (S) — Deps: T-001
  `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), `biome.json` (lint + format + import sort), vitest preset.
  AC: `pnpm lint` và `pnpm typecheck` chạy trên package rỗng.
- [x] **T-003 `packages/shared` skeleton** (M) — Deps: T-002
  `constants/` (providers, job, domain, http, routes, limits, errors, auth, ui, ids), `schemas/` (envelope, pagination, provider-account, resource, job), `types/`, `lib/result.ts`. Áp dụng pattern `as const` + `*_VALUES`.
  AC: export từ `@shared/*`; unit test cho helper; không dùng `enum`.
- [x] **T-004 `packages/db` skeleton** (S) — Deps: T-003
  Drizzle + drizzle-kit config (dialect sqlite), `schema/index.ts`, helper `newId(prefix)` (UUIDv7/ULID), `timestamps()` mixin.
  AC: `pnpm db:generate` sinh migration rỗng không lỗi.
- [x] **T-005 `apps/api` skeleton (Hono)** (M) — Deps: T-003
  `createApp(deps)`, `AppEnv` type, middleware: requestId, logger, secureHeaders, onError (AppError → envelope), notFound; `GET /api/v1/health`; `config/env.schema.ts` + `getConfig()`; `entries/cloudflare.ts`.
  AC: `wrangler dev` → `/api/v1/health` trả `{ data: { status: 'ok' } }`; test route bằng `app.request()`.
- [x] **T-006 `apps/web` skeleton** (M) — Deps: T-003
  Vite + React 19 + TS, Tailwind v4, shadcn/ui init, TanStack Router (file-based) + Query, `config/env.ts` (Zod), `lib/rpc.ts` (`hc<AppType>`), theme provider (dark mặc định).
  AC: `pnpm --filter web dev` chạy; gọi `/api/v1/health` qua RPC có type; build thành công.
- [x] **T-007 Wrangler + D1 local** (S) — Deps: T-005, T-006
  `wrangler.jsonc` (assets SPA, `run_worker_first: ["/api/*"]`, `nodejs_compat`, binding `DB`), `.dev.vars.example`, script `dev` chạy song song Vite + wrangler (hoặc `@cloudflare/vite-plugin`).
  AC: mở `localhost` thấy SPA; `/api/*` vào Hono; deep link `/accounts` không 404.
- [x] **T-008 CI GitHub Actions** (S) — Deps: T-002
  lint → typecheck → test → build. Cache pnpm.
  AC: PR mẫu chạy xanh.
- [x] **T-009 README + ADR template** (S) — Deps: T-007
  Setup local, biến môi trường, lệnh thường dùng; `docs/adr/0000-template.md`, ADR 0001–0006 từ PLAN §12.
  AC: dev mới làm theo README chạy được trong ≤ 15 phút.

### Spikes (xác minh `[VERIFY]` trong RESEARCH.md)
- [x] **T-010 Spike Cloudflare API (+ Registrar)** (M) — Deps: T-005
  Với 2 account test: tạo zone pending ở đích khi zone nguồn (CF Registrar) đang active có được không?, `GET /accounts/{id}/registrar/domains`, luồng move domain CF Registrar hiện tại (dashboard vs ticket), `dns_records/batch` (giới hạn số record/batch), export/import BIND, `per_page` tối đa, Workers script content + metadata round-trip, GraphQL usage query.
  AC: RESEARCH.md cập nhật, bỏ nhãn [VERIFY] hoặc ghi kết luận; fixture JSON lưu `apps/api/src/providers/cloudflare/__fixtures__/`.
- [x] **T-011 Spike Vercel API (Hobby & Team)** (M) — Deps: T-005
  Transfer-request giữa Hobby↔Hobby / Hobby↔Team, create project từ git repo (version endpoint), env decrypt behaviour từng `type`, domain move (`PATCH /v3/domains` op `move-out`) và verification TXT, nguồn dữ liệu usage.
  AC: như T-010, fixture cho Vercel.
- [x] **T-012 Spike Supabase Management API** (M) — Deps: T-005
  Verify PAT (`/v1/organizations`, `/v1/projects`), create/pause/restore project, `/v1/projects/{ref}/api-keys`, `/v1/projects/{ref}/secrets` (xác nhận chỉ trả tên/digest), Edge Functions download body & deploy multipart, `/v1/projects/{ref}/database/query` (đếm dòng + `pg_database_size`), `/v2/projects/{ref}/transfers/previews` & `/transfers`.
  AC: như T-010, fixture lưu `apps/api/src/providers/supabase/__fixtures__/`.

## M1 — Auth & Security

- [x] **T-030 Benchmark password hashing trên Workers** (S) — Deps: T-007
  So sánh scrypt mặc định của better-auth với `node:crypto` scrypt (N=16384,r=16,p=1) về CPU time trên `wrangler dev --remote`/deploy thử.
  AC: chọn tham số < 10 ms CPU (hoặc ghi ADR chuyển sang Workers Paid); implement `platform/password-hasher.ts` + test.
- [x] **T-031 Schema auth + better-auth factory** (M) — Deps: T-004, T-030
  `@better-auth/cli generate` → `packages/db/src/schema/auth.ts`; `modules/auth/auth.factory.ts` (`createAuth(config, db)`): drizzleAdapter sqlite, `disableSignUp`, custom hasher, session TTL/cookieCache, trustedOrigins; mount `/api/auth/*`.
  AC: sign-in email/password thành công; `POST /api/auth/sign-up/email` bị từ chối (test).
- [x] **T-032 Seed admin CLI** (S) — Deps: T-031
  `pnpm db:seed:admin --email --password [--remote]` idempotent (hash bằng cùng hasher; insert `user` + `account` provider `credential`).
  AC: chạy 2 lần không tạo trùng; đăng nhập được.
- [x] **T-033 Allowlist + lockout** (M) — Deps: T-031
  `ADMIN_EMAILS` check (hooks before sign-in + databaseHooks session create), bảng `login_attempts`, khóa sau `LOGIN_MAX_FAILURES` lần trong `LOGIN_LOCK_MINUTES`, reset khi thành công; audit log sự kiện login.
  AC: test: email ngoài allowlist → 403 `AUTH_NOT_ALLOWED`; sai 5 lần → 423 `AUTH_LOCKED`.
- [x] **T-034 Rate limit better-auth** (S) — Deps: T-031
  `rateLimit` storage database + customRules `/sign-in/email` từ constants.
  AC: request thứ 6 trong 60s → 429.
- [x] **T-035 Turnstile server** (S) — Deps: T-031
  Plugin `captcha` provider `cloudflare-turnstile`, endpoints `['/sign-in/email']`; test keys cho dev/test.
  AC: thiếu header → 400; dùng always-fail secret → bị từ chối; always-pass → OK.
- [x] **T-036 `requireAuth` middleware + session context** (S) — Deps: T-031
  Load session vào `c.var.session`; mặc định chặn mọi `/api/v1/*` trừ `PUBLIC_API_ROUTES`.
  AC: test 401 trên route bảo vệ, 200 khi có cookie.
- [x] **T-037 Login page + Turnstile client** (M) — Deps: T-006, T-035
  `authClient` (better-auth/react), trang `/login` (form RHF + Zod, Turnstile widget, reset sau mỗi lần thử, map lỗi), route guard `beforeLoad`, logout, không có link đăng ký.
  AC: e2e: login thành công → dashboard; sai mật khẩu hiện lỗi; F5 giữ session.
- [x] **T-038 Security headers & CSP** (S) — Deps: T-005
  `secureHeaders` với CSP cho `challenges.cloudflare.com`, HSTS, frame-ancestors none, Referrer-Policy.
  AC: kiểm tra header trong test; Turnstile vẫn render.
- [x] **T-039 Crypto service (AES-GCM) + key rotation** (M) — Deps: T-005
  `platform/crypto.ts` WebCrypto: `encrypt/decrypt` format `v{n}:{iv}:{ct}`, hỗ trợ `ENCRYPTION_KEY_PREVIOUS`, CLI `pnpm secrets:reencrypt`.
  AC: round-trip test, ciphertext bị sửa → lỗi, rotate thành công.

## M2 — Provider accounts & Inventory

- [x] **T-040 Schema domain tables** (M) — Deps: T-004
  `provider_accounts`, `resources`, `usage_snapshots`, `jobs`, `job_steps`, `job_events`, `snapshots`, `audit_logs`, `login_attempts` + index.
  AC: migration apply local OK; types inferred export cho repositories.
- [x] **T-041 HTTP client dùng chung cho provider** (M) — Deps: T-005
  `createHttpClient`: timeout, retry/backoff 429/5xx + `Retry-After`, Zod parse, map lỗi → `AppError(PROVIDER_*)`, đếm `SubrequestBudget`.
  AC: unit test retry, timeout, budget exceeded → `PROVIDER_BUDGET_EXCEEDED`.
- [x] **T-042 Provider contracts + registry** (S) — Deps: T-003
  Interfaces capability (AccountVerifier, ZoneProvider, RegistrarDomainProvider, DnsRecordProvider, ProjectProvider, ProjectDomainProvider, EnvVarProvider, EdgeFunctionProvider, SqlQueryProvider, UsageProvider), `CAPABILITY` constants, `providerRegistry`.
  AC: registry trả lỗi `PROVIDER_CAPABILITY_UNSUPPORTED` khi thiếu capability.
- [x] **T-043 Cloudflare adapter — verify, zones, Registrar, DNS** (L) — Deps: T-041, T-042, T-010
  `endpoints.ts`, token verify + list accounts + kiểm tra permissions, list/get/create/delete zone, `listRegistrarDomains` (`/accounts/{id}/registrar/domains`), DNSSEC status, list/export/batch DNS.
  AC: contract test với fixture (pagination, errors, phát hiện domain thuộc CF Registrar).
- [x] **T-044 Cloudflare adapter — Workers/Pages domains, usage** (M) — Deps: T-043
  Workers custom domains, Pages project domains, GraphQL `workersInvocationsAdaptive` usage.
  AC: contract test.
- [x] **T-045 Vercel adapter (Hobby & Team)** (L) — Deps: T-041, T-042, T-011
  verify (`/v2/user`, `/v2/teams` → xác định `accountType: hobby | team`), projects list/get/create/transfer-request/accept, project domains add/remove/verify, env list/get/upsert (flag `readable`), deployments (trigger từ git).
  AC: contract test; env `sensitive` → `readable:false`.
- [x] **T-045B Supabase adapter** (L) — Deps: T-041, T-042, T-012
  verify + list organizations, projects list/get/create/delete + **pause/restore**, API keys (`anon`/`service_role`/publishable), function secrets list/bulk upsert (`readable:false`), Edge Functions list/download body/deploy, `database/query` (read-only: row counts, `pg_database_size`), org transfer preview + execute.
  AC: contract test với fixture; pause/restore & query hoạt động.
- [x] **T-046 Provider accounts module** (M) — Deps: T-039, T-040, T-043, T-045, T-045B
  Repository + service + routes CRUD (Cloudflare, Vercel, Supabase); khi thêm thì verify token, lưu encrypted, `tokenLast4`; rotate token; audit.
  AC: integration test; response không bao giờ chứa token.
- [x] **T-047 Inventory sync (chunked)** (M) — Deps: T-046
  `POST /provider-accounts/:id/sync` sync theo cursor (CF: zones + registrar flag → dns; Vercel: projects → domains/env metadata; Supabase: orgs → projects → functions/secrets metadata), upsert vào `resources`, ≤ budget/request.
  AC: account có > 50 zone (fixture) sync qua nhiều lần gọi, không trùng bản ghi.
- [x] **T-048 Resources query API + quick actions** (S) — Deps: T-047
  `GET /resources` (filter kind/account/q, keyset pagination), `GET /resources/:id` (kèm con), `POST /resources/:id/pause` & `/restore` (Supabase project).
  AC: test filter + pagination + pause/restore.
- [x] **T-049 Usage service (in-app alerts)** (M) — Deps: T-044, T-045B, T-046
  `GET /provider-accounts/:id/usage` (CF GraphQL; Vercel: deployments count + quota thủ công; Supabase: số active free projects / 2 + DB size qua `pg_database_size` + cảnh báo sắp bị auto-pause 7 ngày), lưu `usage_snapshots`, tính % so với `FREE_TIER_LIMITS`.
  AC: test tính %; status `quota_exceeded` khi ≥ 100% (hoặc ≥ 2 active free projects trên Supabase).

## M3 — Bento UI

- [x] **T-060 Design system bento** (M) — Deps: T-006
  Tokens Tailwind `@theme`, `BentoGrid`, `BentoCard` (size từ `BENTO_SIZE`, loading/error/empty), `BentoStat`, `BentoSkeleton`; Storybook-lite page `/dev/ui` (chỉ dev).
  AC: responsive 360px → 1920px, a11y focus, dark/light.
- [x] **T-061 App shell** (M) — Deps: T-037, T-060
  Sidebar (nav từ `WEB_ROUTES`), topbar, command palette (`cmdk`), toasts (sonner), error boundary, 404.
  AC: điều hướng bằng bàn phím; route guard hoạt động.
- [x] **T-062 Dashboard** (M) — Deps: T-049, T-061
  `GET /dashboard/summary` + bento cards (quota, health, domains, jobs, audit, quick actions).
  AC: hiển thị đúng với seed data; skeleton khi loading.
- [x] **T-063 Accounts pages** (M) — Deps: T-046, T-061
  List (bento cards theo provider), Add/Edit dialog (RHF + shared schema, hướng dẫn quyền token), verify, sync có progress (gọi lặp tới khi hết cursor), rotate, delete với typed confirm.
  AC: e2e thêm account (MSW mock provider).
- [x] **T-064 Domains & DNS pages** (M) — Deps: T-048, T-061
  Bảng zone/domain mọi account (filter provider/account/status), trang chi tiết: DNS records, NS, trạng thái, nút "Snapshot", "Migrate…".
  AC: hiển thị > 1000 record mượt (virtualized).
- [x] **T-065 Projects & Databases pages** (M) — Deps: T-048, T-061
  Vercel projects (badge Hobby/Team) / CF Workers & Pages / Supabase projects (trạng thái active/paused, nút Pause/Restore giải phóng slot, DB size, Edge Functions, secrets): domains, env (ẩn giá trị, badge `secret`), nút "Transfer / Recreate…".
  AC: env sensitive & Supabase secrets hiện badge "write-only"; nút Pause/Restore hoạt động.

## M4 — Job engine, Snapshots, Audit

- [x] **T-070 Audit log module** (S) — Deps: T-040, T-036
  `auditService.record()` dùng trong mọi mutation; `GET /audit-logs` + trang UI.
  AC: mọi route mutation đều có test ghi audit.
- [x] **T-071 Snapshot service** (M) — Deps: T-043, T-045, T-040
  Snapshot zone (DNS JSON + BIND + settings + worker domains), project (settings, env metadata, domains); lọc bỏ secrets; download.
  AC: snapshot không chứa giá trị secret (test); BIND tải được.
- [x] **T-072 Job engine core** (L) — Deps: T-040, T-042
  `Step` interface (plan/execute/verify/compensate), `STEP_REGISTRY`, `JobRunner.advance(jobId)` (lấy step kế tiếp, chạy 1 chunk, lưu cursor/kết quả/event, chuyển trạng thái), concurrency guard (optimistic lock `version`).
  AC: test state machine đầy đủ; retry; advance song song không chạy trùng.
- [x] **T-073 Jobs API** (M) — Deps: T-072
  create/plan/confirm (typed confirm)/advance/manual-input/cancel/retry/list/detail/events.
  AC: integration test toàn bộ vòng đời với fake steps.
- [x] **T-074 Migration wizard + timeline UI** (L) — Deps: T-073, T-060
  Wizard 4 bước (template → nguồn/đích → resource → plan/diff → confirm), timeline realtime (polling `refetchInterval`, tự gọi `advance` khi tab mở), form manual input trong card.
  AC: e2e với fake template chạy đến `completed`.

## M5 — Migration templates (MVP)

- [x] **T-090 Steps dùng chung + Strategy Resolver** (M) — Deps: T-072, T-071
  `preflight.verify-accounts`, `snapshot.resource`, `manual.confirm`, `manual.secret-input`, `manual.run-command`, `wait.poll` (poll điều kiện với backoff); `StrategyResolver` tự gợi ý template (`CF_REGISTRAR_DOMAIN_MOVE` vs `CF_ZONE_MOVE`, `VERCEL_PROJECT_TRANSFER` vs `RECREATE`, `SUPABASE_ORG_TRANSFER` vs `RECREATE`).
  AC: unit test từng step + idempotency + test StrategyResolver cho mọi tổ hợp.
- [x] **T-091A `CF_REGISTRAR_DOMAIN_MOVE` (ưu tiên cho domain CF Registrar)** (L) — Deps: T-090, T-043, T-044
  Steps: preflight (domain thuộc CF Registrar, > 10 ngày, DNSSEC off) → snapshot đầy đủ → tạo zone ở đích + batch import DNS + restore settings khả dụng (**không xóa nguồn**) → bước manual hướng dẫn move/support ticket + xác nhận Super Admin đích → poll zone đích `active` → rebind Worker/Pages custom domains → verify.
  AC: test với fixture end-to-end; không bao giờ gọi `DELETE /zones` trên domain CF Registrar.
- [x] **T-091B `CF_ZONE_MOVE` (cho domain registrar ngoài)** (M) — Deps: T-091A
  Steps: check DNSSEC → snapshot → delete source → create target → batch restore DNS (chunk) → restore settings → manual "đổi NS tại registrar" (hiện NS mới) → poll active → verify.
  AC: test với fixture; chạy lại bước restore không tạo record trùng.
- [x] **T-092 `DNS_REPOINT` & `ENV_REWIRE`** (M) — Deps: T-090, T-043, T-045
  `DNS_REPOINT`: batch patch DNS records trỏ sang deployment mới (có plan diff + rollback). `ENV_REWIRE`: cập nhật hàng loạt biến môi trường (`SUPABASE_URL`, anon/service key…) trên project Vercel/CF khi đổi backend.
  AC: diff đúng; rollback (compensate) khôi phục giá trị cũ.
- [x] **T-093 `VERCEL_PROJECT_RECREATE` (cho Hobby)** (L) — Deps: T-090, T-045
  snapshot → create project (git repo, build settings) → upsert env readable → manual nhập env sensitive → remove domain nguồn → add domain đích → verify TXT (manual nếu cần) → trigger deploy → verify.
  AC: test fixture; env sensitive sinh bước manual.
- [x] **T-094 `VERCEL_PROJECT_TRANSFER` (cho Team)** (M) — Deps: T-090, T-045
  preflight membership → transfer-request (token nguồn) → accept (token đích) → verify.
  AC: preflight tự chuyển sang gợi ý `VERCEL_PROJECT_RECREATE` khi phát hiện Hobby.
- [x] **T-095 `VERCEL_DOMAIN_MOVE`** (M) — Deps: T-090, T-045, T-011
  AC: theo kết quả spike T-011.
- [x] **T-096A `SUPABASE_PROJECT_RECREATE` & `SUPABASE_ORG_TRANSFER`** (L) — Deps: T-090, T-045B, T-092
  `ORG_TRANSFER`: preview → execute transfer giữa 2 org cùng user. `PROJECT_RECREATE` (sang user khác khi hết 2 slot free): snapshot (config, bảng + row counts, Edge Functions, tên secrets) → create project đích → bước `manual.run-command` sinh sẵn lệnh `pg_dump`/`psql` → verify row counts từng bảng qua `database/query` → deploy Edge Functions sang đích → manual nhập function secrets → chạy `ENV_REWIRE` cập nhật `SUPABASE_*` sang Vercel/CF → (tùy chọn) pause project nguồn.
  AC: test fixture; verify row counts phát hiện thiếu bảng/dòng; sinh đúng lệnh `pg_dump`.
- [x] **T-096B Template catalog API + docs** (S) — Deps: T-091A..T-096A
  `GET /migration-templates` (input schema dạng JSON Schema từ Zod), mô tả rủi ro/bước thủ công; doc `docs/runbooks/*.md` cho từng template.
  AC: wizard render form từ schema.

## M6 — Deploy & Hardening

- [ ] **T-110 Deploy Cloudflare production** (M) — Deps: M1–M5 *(chờ bạn cung cấp domain)*
  Tạo D1 remote, `wrangler secret put` các secret, apply migration remote, seed admin remote, custom domain, Turnstile hostname, deploy job trong CI (main).
  AC: login prod với Turnstile thật; health OK.
- [x] **T-111 Node entry (portability)** (M) — Deps: T-005, T-031
  `entries/node.ts` (`@hono/node-server`, `serveStatic` cho `apps/web/dist`, libSQL/better-sqlite3 + Drizzle migrator, in-memory/redis cache adapter), Dockerfile, `docker compose up`.
  AC: chạy toàn bộ app bằng Docker local, test suite services pass trên cả 2 runtime.
- [x] **T-112 E2E Playwright** (M) — Deps: T-074
  login → add account (mock) → sync → dry-run migration → complete.
  AC: chạy trong CI (headless).
- [x] **T-113 Security review** (S) — Deps: T-110
  Checklist: secrets không log, CSP, cookie flags, rate limit, lockout, typed confirm, audit đầy đủ, dependency audit (`pnpm audit`).
  AC: checklist trong `docs/security-checklist.md` tick đủ.
- [x] **T-114 Backup/restore D1** (S) — Deps: T-110
  Script `wrangler d1 export` định kỳ (CI schedule) + hướng dẫn restore.
  AC: restore thử thành công vào DB local.

## M7 — Phase 2 (sau MVP)

- [x] **T-130 Cron sync usage định kỳ** — `scheduled()` handler tự cập nhật `usage_snapshots` và trạng thái cảnh báo trong dashboard (không gửi thông báo ra kênh ngoài).
- [ ] **T-131 `CF_WORKER_MOVE` / `CF_PAGES_MOVE`** — upload script + bindings, secrets manual, routes/custom domains.
- [ ] **T-132 Bắt buộc 2FA (TOTP) + trang Sessions** — plugin `twoFactor`, revoke sessions.
- [x] **T-133 Gợi ý account đích** — chọn account còn nhiều quota/slot nhất cho migration.
- [ ] **T-134 Data migration D1/KV/R2 & Supabase Storage** — export/import có chunk.
- [ ] **T-135 Thêm provider** (Netlify/Render/Neon/Upstash) — chỉ thêm adapter + registry.
- [ ] **T-136 JobRunner bằng Cloudflare Workflows/Queues** — chạy nền không cần mở tab.
