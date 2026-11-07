# Migration Templates Runbook — freetier-loop

This runbook documents the step-by-step execution, safety guardrails, manual operator prompts, and emergency rollback procedures for every migration template in **freetier-loop**.

---

## 1. `CF_REGISTRAR_DOMAIN_MOVE` (Cloudflare Registrar Domains — Primary Default)

### When to Use
Automatically selected by `StrategyResolver` when the source Cloudflare zone is registered with **Cloudflare Registrar** (`GET /accounts/{id}/registrar/domains`).

### Safety Guardrails
- **Never deletes the source zone.** Deleting a Cloudflare Registrar zone breaks domain registration routing.
- **DNSSEC preflight check:** Blocks execution if DNSSEC is enabled on the source zone (`DNSSEC_ACTIVE`).
- **SSL/TLS Sync:** Automatically copies `ssl` (`strict` / `full`), `always_use_https`, `min_tls_version`, and `automatic_https_rewrites` to prevent `ERR_TOO_MANY_REDIRECTS` after cutover.

### Step Sequence
1. `preflight.verify-accounts` — Verifies self-protection, source/target API tokens, and DNSSEC disabled.
2. `snapshot.resource` — Saves DNS records (JSON + BIND export), SSL/TLS settings, and Worker custom domains.
3. `cf.create-target-zone` — Pre-creates the zone on the target Cloudflare account (`pending` state).
4. `cf.batch-import-dns` — Idempotently imports DNS records in chunks of 200 via `/dns_records/batch`.
5. `cf.restore-zone-settings` — Applies SSL/TLS settings on the target zone.
6. `manual.confirm` — Guides operator to initiate the domain move in **Cloudflare Dashboard → Domain Registration → Manage Domains → Move to another Cloudflare account** and accept as Super Administrator in the target account.
7. `wait.poll` — Polls target zone until status becomes `active`.
8. `cf.rebind-worker-domains` — Re-attaches Worker and Pages custom domains on the target account.

---

## 2. `CF_ZONE_MOVE` (External Registrar Domains)

### When to Use
Selected when the domain is registered at an external registrar (Namecheap, Porkbun, GoDaddy, etc.) and uses Cloudflare for DNS/CDN.

### Step Sequence & Rollback
1. `preflight.verify-accounts` — Verifies tokens, self-protection, and DNSSEC disabled.
2. `snapshot.resource` — Full DNS + BIND + SSL/TLS snapshot.
3. `cf.delete-source-zone` — Removes zone from source account (`compensate()` can recreate it from snapshot if rollback is triggered).
4. `cf.create-target-zone` — Creates zone on target account and retrieves assigned Cloudflare nameservers.
5. `cf.batch-import-dns` & `cf.restore-zone-settings` — Restores DNS records and SSL/TLS configuration.
6. `manual.confirm` — Displays the new Cloudflare nameservers for the operator to update at the external registrar.
7. `wait.poll` — Polls until target zone is `active`.

---

## 3. `CF_WORKER_MOVE` (Cloudflare Workers & Pages)

### Step Sequence
1. `preflight.verify-accounts` & `snapshot.resource`
2. `cf.deploy-worker` — Downloads ES module bundle + metadata from source and uploads to target account.
3. `manual.secret-input` — Prompts operator to re-enter write-only Worker secret values.
4. `cf.rebind-worker-domains` — Re-attaches custom domain routes on the target account.

---

## 4. `VERCEL_PROJECT_RECREATE` (Vercel Hobby & Cross-Account Blue-Green)

### When to Use
Automatically selected when either source or target Vercel account is on the **Hobby** plan (where native transfer-request is restricted).

### Step Sequence (Blue-Green)
1. `preflight.verify-accounts` & `snapshot.resource` — Encrypts readable env vars at rest in snapshot; records sensitive env var keys.
2. `vercel.create-project` — Creates project on target account linked to the same Git repository and build settings.
3. `vercel.upsert-env` — Decrypts and copies readable (`plain` / `encrypted`) env vars to target project.
4. `manual.secret-input` — Prompts operator to enter values for `sensitive` (write-only) env vars.
5. `vercel.trigger-deploy` — Verifies target project deployment is `READY` **before** touching production domains.
6. `vercel.move-domains` — Detaches custom domains from source project and attaches them to target project (`compensate()` reverses domain attachment on rollback).

---

## 5. `VERCEL_PROJECT_TRANSFER` (Vercel Team Native Transfer)

### When to Use
Selected when both source and target Vercel accounts are **Team** accounts.
1. `preflight.verify-accounts` & `snapshot.resource`
2. `vercel.transfer-request` — Generates transfer code via `POST /projects/:id/transfer-request`.
3. `vercel.transfer-accept` — Accepts transfer code in the target Team account.

---

## 6. `SUPABASE_PROJECT_RECREATE` (Cross-Account Supabase Migration)

### When to Use
Selected when a user reaches the **2 active free projects per user** limit on Supabase and needs to migrate a project to a separate Supabase user account.

### Step Sequence (Blue-Green + Row-Count Verification)
1. `preflight.verify-accounts` & `snapshot.resource` — Captures project metadata, installed `pg_extension`s, per-table row counts across `public`/`auth`/`storage`, Edge Function bundles, and secret names.
2. `supabase.create-project` — Creates new Supabase project in the target account.
3. `manual.run-command` — Generates a ready-to-run `pg_dump | psql` pipeline covering `public`, `auth`, and `storage` schemas.
4. `supabase.verify-row-counts` — Queries `/v1/projects/{ref}/database/query` on the target project and verifies every table matches or exceeds the source row count. Fails safely if any table or rows are missing.
5. `supabase.deploy-functions` — Downloads Edge Function bundles from source and deploys them to target.
6. `supabase.upsert-secrets` — Prompts operator for write-only Edge Function secrets and bulk-upserts them.
7. `env.rewire-vars` — Updates `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in linked Vercel/Cloudflare projects.
8. `supabase.pause-source` — Pauses the source Supabase project to free its active slot (`compensate()` restores the project if rolled back).

---

## 7. `SUPABASE_ORG_TRANSFER`, `DNS_REPOINT`, & `ENV_REWIRE`

- **`SUPABASE_ORG_TRANSFER`:** Previews and executes native organization transfer (`POST /v2/projects/{ref}/transfers`) when moving between organizations owned by the same user.
- **`DNS_REPOINT`:** Batch-updates DNS records (`A`, `AAAA`, `CNAME`) with a before/after diff and 1-click rollback (`compensate()`).
- **`ENV_REWIRE`:** Bulk-updates backend URLs and keys across Vercel/Cloudflare projects with automatic rollback of previous values.

