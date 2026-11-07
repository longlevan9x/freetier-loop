---
trigger: model_decision
description: How to define constants, enums-as-objects, error codes, env config and TypeScript style. Read before adding any literal value, status, route path, or new type.
---

# Constants & code conventions

## Constants live in `packages/shared/src/constants/`
One file per domain, re-exported from `index.ts`:
`providers.ts`, `job.ts`, `domain.ts`, `http.ts` (headers, status), `routes.ts` (API + web paths),
`limits.ts` (rate limits, pagination, timeouts, subrequest budget), `errors.ts`, `auth.ts`, `ui.ts`.

### Pattern (mandatory — no TS `enum`)
```ts
export const PROVIDER = {
  CLOUDFLARE: 'cloudflare',
  VERCEL: 'vercel',
  SUPABASE: 'supabase',
} as const;
export type Provider = (typeof PROVIDER)[keyof typeof PROVIDER];
export const PROVIDER_VALUES = Object.values(PROVIDER) as [Provider, ...Provider[]];
// Zod reuse: z.enum(PROVIDER_VALUES)
```
- Labels for UI are a separate map keyed by the constant: `PROVIDER_LABEL: Record<Provider, string>`.
- Numbers carry units in the name: `SESSION_TTL_SECONDS`, `HTTP_TIMEOUT_MS`, `MAX_SUBREQUESTS_PER_INVOCATION`.

### API routes
```ts
export const API_PREFIX = '/api/v1' as const;
export const API_ROUTES = {
  PROVIDER_ACCOUNTS: '/provider-accounts',
  DOMAINS: '/domains',
  JOBS: '/jobs',
} as const;
```
Web routes likewise in `WEB_ROUTES`. Never hard-code a path string in components or route files.

## Errors
- `ERROR_CODE` constant map (e.g. `AUTH_UNAUTHORIZED`, `PROVIDER_RATE_LIMITED`, `JOB_STEP_FAILED`).
- Throw `AppError(code, message?, { status, cause, details })` in services; a single
  `onError` handler maps it to the standard envelope. Unknown errors → `INTERNAL_ERROR`, logged with requestId.
- Standard response envelope (shared Zod schema):
  - success: `{ data: T, meta?: { page, pageSize, total } }`
  - error: `{ error: { code: ErrorCode, message: string, details?: unknown, requestId: string } }`

## Environment / config
- All env vars are declared once in `apps/api/src/config/env.schema.ts` (Zod) and in
  `.dev.vars.example` / `.env.example`. `getConfig(rawEnv)` parses & freezes; fail fast on invalid.
- Client env: `apps/web/src/config/env.ts` parses `import.meta.env` with Zod. Only `VITE_*` keys.

## TypeScript style
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- No `any` (use `unknown` + narrowing). No non-null `!` except in tests.
- Prefer `type` for unions/DTOs, `interface` for contracts implemented by classes/adapters.
- Infer types from Zod (`z.infer`) and Drizzle (`$inferSelect`) — don't hand-write duplicates.
- Pure functions & early returns; max ~40 lines per function, ~300 lines per file (split otherwise).
- Named exports only (except where a framework requires default, e.g. Worker entry).
- Import order is enforced by Biome; use path aliases `@shared/*`, `@db/*`, `@/*` (web).
- Comments explain *why*, not *what*. TODOs must reference a task id: `// TODO(T-071): ...`.

