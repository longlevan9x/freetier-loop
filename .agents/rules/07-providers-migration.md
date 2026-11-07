---
trigger: model_decision
description: Provider adapter contracts (Cloudflare, Vercel, Supabase) and the migration/transfer job engine. Read before adding provider calls, migration steps, or transfer features.
---

# Providers & migration engine rules

## Provider adapters (`apps/api/src/providers/`)
- Capabilities are small interfaces (ISP), one provider implements several:
  `AccountVerifier`, `ZoneProvider` (list/create/delete/get nameservers), `RegistrarDomainProvider`
  (list/get registrar domains), `DnsRecordProvider` (list/export/batch upsert), `ProjectProvider`
  (list/get/transfer/create/pause/restore), `ProjectDomainProvider`, `EnvVarProvider`
  (list/upsert, reports `readable:false` for secrets), `EdgeFunctionProvider` (list/download/deploy),
  `SqlQueryProvider` (read-only verification/size queries), `UsageProvider` (quota metrics).
- `providerRegistry.get(PROVIDER.CLOUDFLARE).capability(CAPABILITY.DNS_RECORDS)` — services ask for a
  capability, never `instanceof`/`if provider === 'vercel'` branching in services (OCP).
- Adding a new provider (Netlify, Render, …) = new folder + registry entry; no service changes.
- Each adapter has an `endpoints.ts` with versioned paths as constants (e.g. `CF_ENDPOINTS.DNS_BATCH`).
- Parse responses with Zod; map provider objects to shared domain types (`Zone`, `DnsRecord`, `Project`, `EnvVar`).
- Handle pagination internally but expose `cursor` so callers can stay within the subrequest budget.

## Known platform constraints (verified, see docs/RESEARCH.md — keep in sync)
- **Cloudflare Registrar domains (primary MVP case):** cannot delete-and-readd NS at an external registrar.
  Flow (`CF_REGISTRAR_DOMAIN_MOVE`): pre-create zone + batch import DNS in target (non-destructive) →
  disable DNSSEC → guided manual step (dashboard move / support ticket, target admin confirms) →
  poll target zone until `active`. **External registrar** domains use `CF_ZONE_MOVE` (snapshot → delete
  source → create target → restore DNS → user updates NS at registrar). Strategy resolver auto-selects by
  checking `RegistrarDomainProvider`.
- **Secrets are write-only** (Cloudflare Worker secrets, Vercel `sensitive` env vars, Supabase function
  secrets) → engine marks them `MANUAL_INPUT_REQUIRED` and asks the user to re-enter values.
- **Vercel projects (both Hobby and Team supported):** strategy resolver checks whether source+target
  allow native transfer (`/projects/:id/transfer-request` → accept). If yes → `VERCEL_PROJECT_TRANSFER`;
  if Hobby involved → `VERCEL_PROJECT_RECREATE` (create project from git repo, copy readable env vars,
  move domains, trigger deploy).
- **Supabase:** free limit = 2 active projects **per user across orgs** (paused don't count). Moving
  between orgs of the same user uses `SUPABASE_ORG_TRANSFER` (`/v2/projects/:ref/transfers`); moving to
  another user account uses `SUPABASE_PROJECT_RECREATE` (create project in target, copy Edge Functions +
  config via API, generate `pg_dump`/`psql` commands for manual DB copy, verify row counts via
  `database/query`, then `ENV_REWIRE` to update `SUPABASE_URL`/keys in linked Vercel/Cloudflare projects).
  Quick relief action: **pause/restore** project directly from UI.

## Job engine (`apps/api/src/jobs/`)
- A migration is a **Job** composed of ordered **Steps** (Command pattern). Each step type implements:
  `plan(ctx) → StepPlan` (dry run, human-readable diff), `execute(ctx) → StepResult`, optional `verify(ctx)`,
  optional `compensate(ctx)` (rollback when possible). Register step types in `STEP_REGISTRY`.
- Status machines are constants: `JOB_STATUS` (draft → planned → running → waiting_manual → completed | failed | cancelled)
  and `STEP_STATUS` (pending → running → succeeded | failed | skipped | waiting_manual).
- **Idempotency:** every step checks current remote state before acting (e.g. record exists → skip/update).
  Re-running a step must never duplicate resources.
- **Budget:** one step (or one chunk of a step) per HTTP invocation, ≤ `MAX_SUBREQUESTS_PER_STEP`. Driver is
  `POST /api/v1/jobs/:id/advance` (called by UI loop or cron/queue later). Chunk state is persisted in `job_steps.cursor`.
- **Safety & Blue-Green order:**
  1. **Self-protection:** preflight blocks any job targeting the admin app's own domain/zone/worker (`RESOURCE_SELF_PROTECTED`).
  2. **Create-Verify-Before-Cutover (Blue-Green):** wherever the provider allows (Vercel `RECREATE`, Supabase `RECREATE`, `CF_REGISTRAR_DOMAIN_MOVE`), create & deploy in the target and verify health **before** detaching the custom domain or pausing the source.
  3. **Snapshot & encrypted env values:** before any destructive step a `snapshot` step must have succeeded. Readable env var values inside snapshots are AES-GCM encrypted at rest and redacted on plain export.
  4. **Silent-loss guards:** Cloudflare zone snapshot/restore includes SSL/TLS mode (`ssl`, `always_use_https`, `min_tls_version`, `automatic_https_rewrites`) to prevent `ERR_TOO_MANY_REDIRECTS` after cutover, and preflight warns if Cloudflare Email Routing is enabled. Supabase `pg_dump` helper includes `public`, `auth`, `storage` schemas and preflight lists enabled `pg_extension`s + OAuth/webhook URLs that need updating.
  5. **Emergency restore:** if a cutover step fails after a source resource was removed, the job exposes a `compensate` action to restore from the snapshot back to the source account.
  6. **Confirmation:** destructive jobs require a single typed resource-name confirmation (no extra password prompt).
- Every step writes `job_events` (log lines) for the UI timeline; errors store provider error code + message (no secrets).
- Templates: `MIGRATION_TEMPLATE` constants (`CF_REGISTRAR_DOMAIN_MOVE`, `CF_ZONE_MOVE`, `CF_WORKER_MOVE`,
  `VERCEL_PROJECT_TRANSFER`, `VERCEL_PROJECT_RECREATE`, `VERCEL_DOMAIN_MOVE`, `SUPABASE_PROJECT_RECREATE`,
  `SUPABASE_ORG_TRANSFER`, `DNS_REPOINT`, `ENV_REWIRE`) define default step lists.

