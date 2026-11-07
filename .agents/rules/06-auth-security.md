---
trigger: model_decision
description: Authentication (better-auth), login restriction, Turnstile, secret encryption, security headers. Read before touching auth, sessions, credentials, or anything security-related.
---

# Auth & security rules

## better-auth configuration (single source: `apps/api/src/modules/auth/auth.factory.ts`)
- `createAuth(config, db)` factory — built per request on Workers (bindings are per-request), cached per process on Node.
- `database: drizzleAdapter(db, { provider: 'sqlite', schema })`.
- `emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: AUTH.MIN_PASSWORD_LENGTH }`.
- **No sign-up anywhere.** Admin users are created only by the seed CLI (`pnpm db:seed:admin`).
- **Login restriction (allowlist):** `databaseHooks.session.create.before` (and a `hooks.before` on
  `/sign-in/email`) rejects any email not in `ADMIN_EMAILS` config or with `user.banned = true`.
- **Brute-force limits:** `rateLimit: { enabled: true, storage: 'database', customRules: { '/sign-in/email': { window: 60, max: 5 } } }`
  values from `AUTH_RATE_LIMIT` constants, **plus** account lockout: N consecutive failures → lock for M minutes
  (tracked in `login_attempts` table; constants `LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`).
- Optional 2FA: `twoFactor()` plugin (TOTP) — enabled from settings page, enforced when `REQUIRE_2FA=true`.
- Session: cookie `httpOnly`, `secure`, `sameSite=lax`, `expiresIn = SESSION_TTL_SECONDS`, `updateAge` sliding;
  `cookieCache` enabled to save D1 reads. `trustedOrigins` from config.
- Password hashing: override `emailAndPassword.password.{hash,verify}` with `platform.passwordHasher`
  (native `node:crypto` scrypt with `nodejs_compat`) to stay under the Workers free CPU limit. Same
  implementation on Node → hashes are portable. Never roll a custom weak hash.

## Turnstile
- Server: better-auth `captcha({ provider: 'cloudflare-turnstile', secretKey, endpoints: ['/sign-in/email'] })`.
- Client sends token in header `x-captcha-response` (constant `HEADER.CAPTCHA`).
- Dev/test keys from Cloudflare docs (always-pass) configured only in `.dev.vars.example`; prod keys via secrets.
- Turnstile widget hostname list must include the production domain.

## Provider credentials & sensitive snapshot data
- Encrypt with **AES-256-GCM** (WebCrypto), random 12-byte IV per value, stored as
  `v{keyVersion}:{iv_b64}:{ciphertext_b64}`; key = `ENCRYPTION_KEY` secret (base64 32 bytes).
  Support rotation via `ENCRYPTION_KEY_PREVIOUS` + re-encrypt command.
- Apply the same AES-256-GCM encryption to any readable environment variable values stored in
  `snapshots` or `job_steps` (many projects store DB URLs/API keys in plain env vars). Redact values
  by default on JSON export unless explicitly exporting an encrypted bundle.
- Decrypt only inside providers/steps at call time; never cache plaintext beyond the request.
- API responses expose `tokenLast4`, `scopesVerified`, `lastVerifiedAt` — never the token.
- Single full-access token per account is supported for convenience (no extra vault passphrase or
  step-up password prompt beyond the authenticated admin session + typed resource-name confirmation).

## Self-protection (anti-lockout of the control plane)
- Never allow a migration job or delete action to target the zone, domain, or worker hosting this
  admin console itself (matched against `BETTER_AUTH_URL` / `SELF_PROTECTED_HOSTS` config). Reject in
  preflight with `ERROR_CODE.RESOURCE_SELF_PROTECTED`.

## HTTP security
- `secureHeaders()` with strict CSP (self + `challenges.cloudflare.com` for Turnstile), HSTS, frame-ancestors none.
- CSRF: rely on better-auth origin checks + `sameSite=lax`; all mutations are non-GET JSON.
- CORS disabled in same-origin deploy; when split-origin, allow only `WEB_ORIGIN` with credentials.
- All destructive endpoints require re-confirmation payload `{ confirm: '<resource name>' }`.

## Secrets hygiene
- `.dev.vars`, `.env*` (except `*.example`) are git-ignored. Production secrets via `wrangler secret put`.
- Never print secrets in logs, errors, audit logs, snapshots or test snapshots.

