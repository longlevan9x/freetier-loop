# ADR-0001: Core Stack & Architecture Decisions

- **Status:** Accepted
- **Date:** 2026-11-07

## Context
We need a single-admin console to manage and rotate domains, DNS records, projects, databases, and environment variables across multiple **Cloudflare**, **Vercel**, and **Supabase** free-tier accounts when quotas are exhausted. It must deploy to Cloudflare (Workers + D1) on the free tier while remaining portable to Node/Docker.

## Decisions
1. **Authentication (`better-auth` over Auth.js):** First-class Hono + Cloudflare Workers + Drizzle (SQLite) support, native Cloudflare Turnstile `captcha` plugin, built-in database rate limiting, `disableSignUp: true`, and `twoFactor`.
2. **Single-Worker Deployment (`run_worker_first: ["/api/*"]`):** One Cloudflare Worker serves both `/api/*` (Hono) and the React SPA static assets (`single-page-application` fallback), eliminating CORS overhead in production while keeping API base URL configurable for split-origin or Node deployments.
3. **Database Portability (`drizzle-orm/sqlite-core`):** Schema uses only portable SQLite column types so the exact same repositories run on Cloudflare D1, libSQL/Turso, and `better-sqlite3`.
4. **Type-safe Frontend (`TanStack Router + Query` + `hc<AppType>`):** End-to-end RPC typing from Hono routes without codegen, paired with a Bento Grid UI system on Tailwind v4.
5. **Tooling (`Biome` + `Vitest`):** Single fast linter/formatter and unified test runner across packages.
6. **Step-based Resumable Job Engine:** Each `POST /api/v1/jobs/:id/advance` executes at most one step/chunk within the Cloudflare Workers free-plan 50-subrequest and ~10 ms CPU budget.
7. **Pragmatic Security & Blue-Green Safety:** Single AES-256-GCM encrypted token per account (`ENCRYPTION_KEY` in Worker Secret), self-protection against modifying the admin console's own domain/worker, encrypted env values in snapshots, SSL/TLS mode sync on Cloudflare zones, and Create-Verify-Before-Cutover ordering.

## Consequences
- Zero runtime lock-in inside business modules (`apps/api/src/modules/*`).
- All provider quirks (Cloudflare Registrar domains, Vercel Hobby vs Team, Supabase 2-project limit & `pg_dump` helper) are isolated behind capability interfaces and migration templates.

