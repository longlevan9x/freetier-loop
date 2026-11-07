---
trigger: model_decision
description: Testing strategy, tooling, CI gates and definition of done. Read before writing tests or finishing a task.
---

# Testing & quality rules

## Tooling
- **Vitest** for all packages. API integration tests use `@cloudflare/vitest-pool-workers` (real D1 in Miniflare)
  for the Cloudflare entry, and plain Vitest + in-memory SQLite for runtime-agnostic services.
- **MSW** (or recorded fixtures in `__fixtures__/`) for Cloudflare/Vercel HTTP — tests never hit real APIs.
- **Playwright** smoke e2e: login (Turnstile test key), dashboard renders, create account, dry-run migration.
- Biome for lint+format; `tsc --noEmit` typecheck per package.

## What to test
- Services: unit tests with fake repositories/providers (happy path, errors, idempotency).
- Providers: contract tests against fixtures (pagination, error mapping, 429 retry).
- Job steps: plan/execute/verify/compensate + re-run idempotency + chunked cursor resume.
- Routes: auth required (401), validation (400), success shape, error envelope.
- Crypto: encrypt/decrypt round-trip, key rotation, tampered ciphertext fails.
- Auth: sign-up endpoint rejected, non-allowlisted email rejected, rate limit/lockout, captcha missing → 4xx.

## Definition of Done (per task)
1. Acceptance criteria in `docs/TASKS.md` met; task ticked.
2. `pnpm lint && pnpm typecheck && pnpm test` green.
3. No new magic strings; constants/schemas added to `packages/shared` where relevant.
4. Docs updated (README/RESEARCH/ADR) if behavior or setup changed.
5. No secrets in code, logs, fixtures.

## CI (GitHub Actions)
`install (pnpm, cache) → lint → typecheck → test → build web+api → (main only) wrangler d1 migrations apply --remote → wrangler deploy`.

