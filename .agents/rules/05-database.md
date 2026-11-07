---
trigger: model_decision
description: Drizzle + D1 schema, migration and repository rules. Read before changing packages/db or writing queries.
---

# Database rules (Drizzle + D1/SQLite)

- Schema in `packages/db/src/schema/*.ts` using **`drizzle-orm/sqlite-core` only**.
- Table names snake_case plural; columns snake_case; TS properties camelCase (Drizzle maps them).
- Every table: `id text primary key` (prefixed ULID/UUIDv7 from `newId(ID_PREFIX.X)`, e.g. `pa_…`, `job_…`),
  `created_at integer (timestamp_ms) not null`, `updated_at integer (timestamp_ms) not null`.
- Status/type columns are `text` constrained with `{ enum: X_VALUES }` from shared constants.
- JSON columns: `text({ mode: 'json' }).$type<T>()` with a Zod schema to validate on read when shape matters.
- Index every foreign key and every column used in WHERE/ORDER BY on list screens.
- better-auth tables (`user`, `session`, `account`, `verification`, `rate_limit`) are generated with
  `@better-auth/cli generate` into `schema/auth.ts` — do not hand-edit; regenerate on plugin changes.

## Migrations
- Generate with `drizzle-kit generate` → `packages/db/migrations/`. Never edit an applied migration.
- Apply: `wrangler d1 migrations apply <DB> --local|--remote` (Cloudflare) or the Node migrator (portability).
- Seed scripts (`packages/db/scripts/`) are idempotent.

## Repositories
- One repository per aggregate in `apps/api/src/modules/<feature>/<feature>.repository.ts`.
- Methods are intention-revealing (`findActiveByProvider`, `markSynced`) – no generic `query(sql)`.
- Never select `encrypted_token` except in `ProviderCredentialsRepository.getDecryptable(id)`.
- Multi-statement writes via `db.batch()`; keep each batch small (D1 limits).
- Free-tier budget: avoid N+1, prefer `inArray`, paginate lists with keyset (`created_at,id`).

