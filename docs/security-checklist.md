# Security Review Checklist — freetier-loop (`T-113`)

- [x] **No Public Sign-Up:** `disableSignUp: true` in `better-auth` and explicit `403 AUTH_NOT_ALLOWED` route blocker on `/api/auth/sign-up/*`.
- [x] **Admin Email Allowlist:** `ADMIN_EMAILS` enforced on sign-in and session lookup (`403 AUTH_NOT_ALLOWED` for non-allowlisted emails).
- [x] **Cloudflare Turnstile Captcha:** Enforced on `POST /api/auth/sign-in/email` via `x-captcha-response` header (`400 AUTH_CAPTCHA_FAILED` when missing or invalid).
- [x] **Rate Limiting & Account Lockout:**
  - IP rate limit: max 5 sign-in requests per 60 seconds (`429 AUTH_RATE_LIMITED`).
  - Account lockout: 5 failed password attempts locks the account for 15 minutes (`423 AUTH_LOCKED`).
- [x] **Password Hashing Within Worker CPU Budget:** `node:crypto` scrypt (`N=8192, r=8, p=1`) benchmarked under 10 ms CPU time with constant-time `timingSafeEqual` verification.
- [x] **AES-256-GCM Secret Encryption & Key Rotation:**
  - All provider API tokens and snapshot readable env var values are encrypted at rest using WebCrypto AES-256-GCM (`v{version}:{iv_b64}:{ciphertext_b64}`).
  - Key rotation supported via `ENCRYPTION_KEY_PREVIOUS` and `reencrypt()`.
- [x] **Zero Token / Secret Leakage:**
  - Provider Account DTOs only expose `tokenLast4` (never `encryptedToken` or plaintext `apiToken`).
  - Snapshot exports redact all env var values (`******`).
  - Write-only secrets (Vercel `sensitive`, Supabase function secrets, Cloudflare Worker secrets) are never stored in logs or `job_events`.
- [x] **Self-Protection Guardrail (`RESOURCE_SELF_PROTECTED`):**
  - Job creation and preflight steps block any migration targeting the hostname of `BETTER_AUTH_URL` or `SELF_PROTECTED_HOSTS`.
- [x] **Destructive Action Safeguards:**
  - Requires preflight verification, encrypted snapshot saved in DB, explicit typed resource-name confirmation (`CONFIRMATION_MISMATCH`), and audit log entry.
  - Cloudflare Registrar domains are protected from `DELETE /zones` (`CF_REGISTRAR_DOMAIN_MOVE` is non-destructive).
- [x] **Security Headers & CSP:**
  - `Content-Security-Policy` restricts scripts/frames/connections to `'self'` and `https://challenges.cloudflare.com`, with `frame-ancestors 'none'`.
  - `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `HttpOnly; SameSite=Lax` session cookies.

