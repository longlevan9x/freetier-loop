---
trigger: model_decision
description: Monorepo layout, layering, dependency direction and portability (Cloudflare ↔ Node). Read before creating folders, packages, or wiring dependencies.
---

# Architecture rules

## Repository layout (fixed)
```
freetier-loop/
├─ apps/
│  ├─ api/                     # Hono app (runtime-agnostic) + runtime entries
│  │  └─ src/
│  │     ├─ app.ts             # createApp(deps) → Hono instance, exports AppType
│  │     ├─ entries/
│  │     │  ├─ cloudflare.ts   # Worker fetch handler: builds deps from env bindings
│  │     │  └─ node.ts         # @hono/node-server + libSQL/better-sqlite3 (portability)
│  │     ├─ platform/          # adapters: db factory, kv/cache, crypto, clock, logger
│  │     ├─ config/            # getConfig(): Zod-parsed env → typed AppConfig
│  │     ├─ middleware/        # auth guard, error handler, request-id, rate-limit, secure headers
│  │     ├─ modules/<feature>/ # <feature>.routes.ts | .service.ts | .repository.ts | .schemas.ts
│  │     ├─ providers/         # cloudflare/, vercel/ (+ registry.ts, http-client.ts)
│  │     ├─ jobs/              # migration engine: planner, runner, steps/
│  │     └─ lib/               # pure helpers (result, errors, pagination)
│  └─ web/                     # React + Vite SPA
├─ packages/
│  ├─ shared/                  # constants, Zod schemas, DTO types, error codes (no runtime deps besides zod)
│  ├─ db/                      # Drizzle schema, migrations, seed scripts
│  └─ config/                  # tsconfig base, biome config, vitest preset
├─ docs/                       # PLAN.md, TASKS.md, RESEARCH.md, adr/
└─ wrangler.jsonc              # Cloudflare deploy config (root, points to apps/api entry + web dist)
```

## Dependency direction
`web → shared` · `api → shared, db` · `db → shared` · `shared → (zod only)`.
`apps/*` never import from each other except **types** (`import type { AppType }` for Hono RPC).

## Layering inside `apps/api`
```
routes (HTTP, validation, status codes)
  → services (business rules, orchestration, transactions)
      → repositories (Drizzle queries only)
      → providers (external HTTP: Cloudflare, Vercel)
```
- Routes must not touch Drizzle or `fetch`.
- Services receive dependencies through a `Deps` object (constructor/factory injection),
  never import singletons. This keeps them unit-testable with fakes.
- Repositories return domain types (from `packages/shared`), not raw rows with secrets.

## Dependency container
`createDeps(config, platform)` builds everything once per request (Workers) or once per
process (Node). Store in Hono context: `c.var.deps`. Type via `Hono<AppEnv>` where
`AppEnv = { Variables: { deps: Deps; session: Session | null; requestId: string } }`.

## Portability contract (must stay true)
- The only files allowed to reference Cloudflare-specific APIs: `entries/cloudflare.ts`,
  `platform/cloudflare/*`, `wrangler.jsonc`.
- DB access via Drizzle **sqlite-core** schema only → works on D1, libSQL/Turso, better-sqlite3.
- Crypto via **WebCrypto** (`crypto.subtle`) – available on Workers, Node ≥ 20, Bun, Deno.
- Static SPA must be servable by any static host; API base URL configurable via `VITE_API_BASE_URL`
  (default same-origin `/api`).
- Moving off Cloudflare = add `entries/<runtime>.ts` + platform adapter; zero changes in modules.

## ADRs
Any deviation from this file or the stack → write `docs/adr/NNNN-title.md` (context, decision, consequences).

