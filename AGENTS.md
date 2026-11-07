# AGENTS.md — freetier-loop (core rules, always on)

Admin console to manage & migrate resources (domains, DNS, projects, DB/functions, env/config)
between multiple **Cloudflare**, **Vercel** and **Supabase** accounts when one runs out of
free-tier quota. Single-admin, no public sign-up.

> Full plan: `docs/PLAN.md` · Tasks: `docs/TASKS.md` · Provider research: `docs/RESEARCH.md`
> Detailed rules: `.agents/rules/*.md` (read the relevant one before touching that area).

## Stack (do not change without an ADR in `docs/adr/`)
- Monorepo: **pnpm workspaces**. Node ≥ 22. TypeScript **strict** everywhere.
- `apps/web`: React 19 + Vite + TanStack Router + TanStack Query + Tailwind v4 + shadcn/ui.
- `apps/api`: **Hono** (runtime-agnostic) + `@hono/zod-validator` + **better-auth** + Drizzle ORM.
- DB: **Cloudflare D1** (SQLite dialect) via Drizzle; must also run on libSQL/SQLite (portability).
- Deploy: one Cloudflare Worker serves API (`/api/*`) + SPA static assets.
- Validation: **Zod** (shared schemas). Lint/format: **Biome**. Tests: **Vitest** (+ MSW).

## Non-negotiable principles
1. **Runtime-agnostic core.** Business code never imports `cloudflare:*`, never reads
   `process.env`/`c.env` directly. Config comes from `getConfig()` (Zod-parsed) and
   platform bindings are injected via adapters in `apps/api/src/platform/*`.
2. **Layering:** `routes → services → (repositories | providers)`. Routes only parse/validate
   and map HTTP; services hold business logic; repositories own SQL; providers own external HTTP.
   No layer skipping, no circular imports.
3. **SOLID:** depend on interfaces (`DnsProvider`, `ProjectProvider`, …), register
   implementations in a registry (open/closed), keep interfaces small (ISP).
4. **DRY:** one source of truth — Zod schemas + constants live in `packages/shared`
   and are reused by API and web. Never duplicate a type that can be inferred.
5. **No magic values.** Every string literal used as an identifier (status, provider,
   route, error code, header, limit, timeout) is a constant in `packages/shared/src/constants`.
   Use `as const` objects + derived union types. **No TS `enum`.**
6. **Secrets:** provider API tokens are stored only AES-GCM encrypted; never logged, never
   returned to the client (only `tokenLast4`). Never commit `.dev.vars`/`.env`.
7. **Destructive actions** (delete zone, remove domain, delete project) require: preflight,
   snapshot saved in DB, explicit typed confirmation, audit log entry.
8. **Free-plan aware:** a single Worker request must stay within **50 external subrequests**
   and ~10 ms CPU. Long operations are split into resumable, idempotent job steps.

## Naming conventions
| Thing | Convention | Example |
|---|---|---|
| Files/folders | kebab-case | `provider-accounts.service.ts` |
| React components | PascalCase file + export | `BentoCard.tsx` |
| Hooks | `use` + camelCase | `useProviderAccounts.ts` |
| Variables/functions | camelCase, verbs for functions | `listZones()` |
| Types/interfaces | PascalCase, no `I` prefix | `DnsProvider` |
| Constants | SCREAMING_SNAKE_CASE object, PascalCase type | `JOB_STATUS`, `JobStatus` |
| DB tables/columns | snake_case, plural tables | `provider_accounts.created_at` |
| API paths | kebab-case, plural nouns, `/api/v1/...` | `/api/v1/provider-accounts/:id/sync` |
| Env vars | SCREAMING_SNAKE_CASE; client vars prefixed `VITE_` | `TURNSTILE_SECRET_KEY` |
| Backend module files | `<feature>.<role>.ts` | `domains.routes.ts`, `domains.service.ts` |

## Workflow rules for agents
- Before coding a task, read its entry in `docs/TASKS.md`; tick it (`[x]`) when its
  acceptance criteria pass. Keep tasks small; one task ≈ one PR/commit series.
- Conventional Commits (`feat(api): …`, `fix(web): …`, `chore: …`).
- Every new service/provider method gets a unit test; every route gets an integration test.
- Run `pnpm lint && pnpm typecheck && pnpm test` before declaring a task done.
- If an external API behavior is uncertain, verify it (spike or docs) and record the
  finding in `docs/RESEARCH.md` instead of guessing.
- Communicate with the user in Vietnamese; code, comments, commit messages in English.

