---
trigger: model_decision
description: Rules for Hono API code — routes, middleware, validation, RPC typing, error handling, Workers limits. Read before editing apps/api.
---

# Backend (Hono) rules

## App composition
- `createApp(deps?)` returns a `Hono<AppEnv>`; routes are mounted with `.route()` per module and
  chained so `export type AppType = typeof routes` works for `hono/client` (RPC).
- Middleware order: `requestId → logger → secureHeaders → cors (only if cross-origin configured)
  → deps injection → session loader → error handler (app.onError) → notFound`.
- `/api/auth/*` is delegated to better-auth: `app.on(['GET','POST'], '/api/auth/*', c => auth.handler(c.req.raw))`.
- Every other `/api/v1/*` route sits behind `requireAuth` middleware (default deny).
  Public routes are explicitly listed in `PUBLIC_API_ROUTES` (health only).

## Routes
- Validate **every** input with `zValidator('json' | 'query' | 'param', schema)`; schemas come
  from `packages/shared`. Never read `c.req.json()` unvalidated.
- Routes are thin: validate → call one service method → `c.json(ok(data), HTTP_STATUS.OK)`.
- Use constants for status codes (`HTTP_STATUS`) and paths (`API_ROUTES`).
- Mutations return the updated resource; list endpoints are paginated (`limit`/`cursor`) with
  defaults from `PAGINATION`.

## Services
- Class or factory with explicit deps; no global state; return domain objects or throw `AppError`.
- Writes touching multiple tables use `db.batch([...])` (D1 has no interactive transactions);
  design repositories to expose batchable statements.
- Write an `audit_logs` row for every mutation (who, action, target, before/after summary w/o secrets).

## Cloudflare Workers constraints (free plan — design for them)
- ≤ **50 external subrequests** per invocation → providers must paginate lazily, use bulk endpoints
  (e.g. Cloudflare `dns_records/batch`), and long work goes through the job engine one step per request.
- ~10 ms CPU → no heavy crypto per request beyond auth; password hashing uses the configured fast native path (see auth rule).
- No long-lived in-memory state; caches go through the `CacheStore` adapter (KV / in-memory for Node).
- Use `c.executionCtx.waitUntil` only through the `platform.defer()` adapter.

## HTTP client for providers
- One shared `createHttpClient({ baseUrl, token, timeoutMs, retry })` in `providers/http-client.ts`:
  timeout via `AbortSignal.timeout`, retries with exponential backoff on 429/5xx (respect `Retry-After`),
  maps provider errors → `AppError(PROVIDER_*)`, counts subrequests against a per-request budget.
- Provider responses are parsed with Zod at the boundary (only the fields we use, `.passthrough()` for snapshots).

## Logging
- Structured JSON logs `{ level, msg, requestId, ...ctx }` via `platform.logger`. Never log tokens,
  cookies, passwords, Authorization headers, decrypted secrets.

