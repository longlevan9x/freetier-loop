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
   cp .env.example apps/web/.env
   ```
3. **Run quality checks & tests:**
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
4. **Start local dev servers (API Worker + Vite SPA):**
   ```bash
   pnpm dev
   ```
   - Web SPA: `http://localhost:5173` (proxies `/api/*` to `:8787`)
   - API Worker: `http://localhost:8787/api/v1/health`

