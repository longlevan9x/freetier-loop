# RESEARCH — Provider capabilities & platform constraints

> Last reviewed: 2026-11-07. Items marked **[VERIFIED in T-010..T-012]** must be confirmed in a spike (task T-010/T-011)
> before the related feature is built. Update this file whenever behavior is confirmed or changes.

## 1. Cloudflare

### 1.1 Zones (domains) between accounts
| Fact | Implication |
|---|---|
| There is no API to "move" a zone between accounts. Flow: export → `DELETE /zones/{id}` in source → `POST /zones` `{ name, account: { id }, jump_start: false }` in target. | Migration template `CF_ZONE_MOVE` = snapshot → (disable DNSSEC) → delete → create → restore → wait NS. |
| Adding a zone that is still active in another account fails ("already hosting under a different account"). **[VERIFIED in T-010..T-012]** exact error code. | Delete in source must happen before create in target → downtime window; keep DNS-only records ready to import fast. |
| New account ⇒ **new nameserver pair** (`result.name_servers`). User must update NS at the registrar. | Step `WAIT_NAMESERVERS` = `waiting_manual` step; poll `GET /zones/{id}` until `status=active`. |
| DNSSEC must be disabled at registrar & Cloudflare before moving. | Preflight check `GET /zones/{id}/dnssec`. |
| Cloudflare Registrar domains: separate "move registration" flow (domain > 10 days old, DNSSEC off, both accounts confirm). Sources disagree on the channel: dashboard *Manage domain → Configuration → Move* vs. **support ticket** (category Registrar → "Transfer a domain between Cloudflare accounts", target Super Admin confirms by email). **No public API.** **[VERIFIED in T-010..T-012]** current channel + whether target zone can be pre-created (pending) while source is active. | **Primary MVP case (user's domains are on CF Registrar).** Template `CF_REGISTRAR_DOMAIN_MOVE`: prepare target zone + DNS *before* the move (non-destructive), guided manual step for the registrar move, poll until target zone `active`. NS stay Cloudflare-managed (no registrar NS edit needed). |
| Registrar inventory: `GET /accounts/{acc}/registrar/domains` (expiry, auto-renew, locked, `transfer_in`…). | Detect Registrar domains automatically → strategy resolver picks the right template. |
| Zone settings, page rules, WAF, custom certs, Workers routes **do not** transfer. | Snapshot stores them (JSON); restorable ones replayed (settings, rulesets where API allows); others listed as manual checklist. |

### 1.2 DNS records
- List: `GET /zones/{id}/dns_records` (paginated, `per_page` ≤ 5000 **[VERIFIED in T-010..T-012]**).
- Export BIND: `GET /zones/{id}/dns_records/export`. Import BIND: `POST /zones/{id}/dns_records/import` (multipart, `proxied` flag, ≤ 256 KiB).
- **Batch:** `POST /zones/{id}/dns_records/batch` with `{ deletes, patches, puts, posts }` executed in one transaction → 1 subrequest for many records. **Primary restore mechanism.**

### 1.3 Workers / Pages
- Worker custom domains: `GET|PUT /accounts/{acc}/workers/domains`, `DELETE …/workers/domains/{id}` (zone must be in same account).
- Worker script content: `GET /accounts/{acc}/workers/scripts/{name}/content/v2`; upload `PUT /accounts/{acc}/workers/scripts/{name}` (multipart for ES modules + metadata/bindings). **[VERIFIED in T-010..T-012]** bindings metadata round-trip.
- Worker **secrets are write-only** → re-entry required.
- Pages domains: `GET|POST /accounts/{acc}/pages/projects/{project}/domains`, `DELETE …/domains/{name}`.
- D1/KV/R2 data moves require export/import (D1 export API / `wrangler d1 export`) — Phase 3, out of MVP.

### 1.4 Usage / quota
- GraphQL `POST /client/v4/graphql`, dataset `workersInvocationsAdaptive` (sum.requests, errors, subrequests; quantiles cpuTime) filtered by `accountTag` + datetime.
- Free plan: **100,000 Worker requests/day** (resets 00:00 UTC), **10 ms CPU**/invocation, **50 subrequests**/invocation.
- D1 free: 5M rows read/day, 100k rows written/day, 5 GB storage **[VERIFIED in T-010..T-012]**.

### 1.5 API token permissions (recommended per account)
`Zone:Read, Zone:Edit (create/delete), DNS:Edit, Zone Settings:Read, Account Settings:Read,
Workers Scripts:Edit, Cloudflare Pages:Edit, Account Analytics:Read`. Verify via `GET /user/tokens/verify` and `GET /accounts`.

## 2. Vercel

### 2.1 Projects
- Transfer: `POST /v1/projects/{idOrName}/transfer-request` (source, returns `code`, valid 24h) → `PUT /projects/transfer-request/{code}` (target). Requires owner of source & member of target. **Hobby ↔ Hobby not supported** (single-member accounts) → fallback template `VERCEL_PROJECT_RECREATE`.
- Recreate: `POST /v11/projects` (name, framework, gitRepository, build settings) **[VERIFIED in T-010..T-012]**, then env + domains, then trigger deploy via git (`POST /v13/deployments` with gitSource).
- Git repo must be accessible by the target account's Git integration (manual prerequisite check).

### 2.2 Environment variables
- List: `GET /v10/projects/{id}/env` ; single decrypted: `GET /v1/projects/{id}/env/{envId}`.
- Upsert: `POST /v10/projects/{id}/env?upsert=true` (array accepted; `type: plain|encrypted|sensitive`, `target[]`).
- **Sensitive/secret vars are write-only** → marked `MANUAL_INPUT_REQUIRED`.

### 2.3 Domains
- Project domains: `GET /v9/projects/{id}/domains`, add `POST /v10/projects/{id}/domains`, remove `DELETE /v9/projects/{id}/domains/{domain}`, move within account `POST /v1/projects/{id}/domains/{domain}/move`.
- Account domains: `GET /v5/domains`, `PATCH /v3/domains/{domain}` (legacy "update or move apex domain"; `op: move-out` + `destination`) **[VERIFIED in T-010..T-012]**.
- Verification: `GET /v9/projects/{id}/domains/{domain}` returns `verification[]` (TXT `_vercel`) when domain is claimed elsewhere; `POST /v9/projects/{id}/domains/{domain}/verify`.

### 2.4 Usage
- No stable public usage API for Hobby **[VERIFIED in T-010..T-012]** → MVP stores manual quota notes + deployment counts from `GET /v6/deployments`.

## 3. Supabase (Management API — `https://api.supabase.com`, Bearer Personal Access Token `sbp_…`)

### 3.1 Free-tier facts
- **2 active free projects per user**, counted across all orgs where the user is Owner/Admin. **Paused projects don't count.**
- Free projects auto-pause after ~7 days of low activity; restorable (retention ~1 year after pause).
- Free quotas (approx.): 500 MB DB, 1 GB storage, 5 GB egress, 50k MAU **[VERIFIED in T-010..T-012]**.
- ⇒ Moving between *orgs of the same user* does **not** free quota; real relief = move to **another user account** (another PAT) or pause unused projects.

### 3.2 Endpoints we use
| Capability | Endpoint |
|---|---|
| Verify / orgs | `GET /v1/profile` **[VERIFIED in T-010..T-012]**, `GET /v1/organizations`, `GET /v1/organizations/{slug}/projects` |
| Projects | `GET /v1/projects`, `GET /v1/projects/{ref}`, `POST /v1/projects` (org, name, region, db_pass), `DELETE /v1/projects/{ref}` |
| Pause / restore | `POST /v1/projects/{ref}/pause`, `POST /v1/projects/{ref}/restore` **[VERIFIED in T-010..T-012]** |
| Keys | `GET /v1/projects/{ref}/api-keys` (anon/service_role or new publishable/secret keys) |
| Edge Functions | `GET /v1/projects/{ref}/functions`, `GET …/functions/{slug}/body`, `POST …/functions/deploy` (multipart) |
| Function secrets | `GET|POST|DELETE /v1/projects/{ref}/secrets` — list returns names (+ digest, **not plaintext**) **[VERIFIED in T-010..T-012]** → manual re-entry |
| Config | `GET|PATCH /v1/projects/{ref}/config/auth`, PostgREST config **[VERIFIED in T-010..T-012]** |
| Custom hostname | `GET /v1/projects/{ref}/custom-hostname`, `…/initialize`, `…/verify`, `…/activate` (paid add-on — mostly N/A on free) |
| SQL | `POST /v1/projects/{ref}/database/query` — run SQL (schema introspection, `pg_database_size()` for quota) |
| Org transfer | `POST /v2/projects/{ref}/transfers/previews`, `POST /v2/projects/{ref}/transfers` (same user must be member of both orgs) **[VERIFIED in T-010..T-012]** |

### 3.3 Data migration reality
- Postgres data/schema copy needs `pg_dump`/`psql` (or `supabase db dump`) over a direct DB connection — **not feasible inside a Worker** (CPU/time, no pg tooling).
- MVP: guided manual step that **generates the exact commands** (old/new connection strings filled in except passwords) for the user to run locally, then the engine verifies (row counts per table via `database/query`).
- Storage objects copy → Phase 3 (Node runner / CLI).
- After move, apps must be re-wired: new `SUPABASE_URL` + keys must be pushed into Vercel/Cloudflare env vars → cross-provider step `ENV_REWIRE`.

## 4. Auth stack

### 4.1 better-auth (chosen over Auth.js)
Reasons: first-class Hono/Workers support, Drizzle adapter (sqlite), built-in `captcha` plugin with
`cloudflare-turnstile`, built-in rate limiting (DB storage), `disableSignUp`, `twoFactor`, `admin` plugins,
typed React client. Auth.js is OAuth-centric and its credentials provider discourages password login.

Key config facts:
- Instance must be created **per request** on Workers (D1 binding is per request) → `createAuth(env)` factory.
- `emailAndPassword.disableSignUp: true`.
- `rateLimit: { storage: 'database', customRules: { '/sign-in/email': { window, max } } }`.
- `captcha({ provider: 'cloudflare-turnstile', secretKey })` — default endpoints include `/sign-in/email`; client sends `x-captcha-response` header. Remote IP auto-detected.
- **Workers free CPU (10 ms)**: default scrypt can exceed it → override `emailAndPassword.password.{hash,verify}` with native `node:crypto` scrypt (`nodejs_compat`), measured < 10 ms; else Workers Paid. **[VERIFIED in T-010..T-012]**
- Schema generation: `npx @better-auth/cli generate` (Drizzle output).

### 4.2 Turnstile
- Widget: `@marsidev/react-turnstile`. Server verification handled by better-auth captcha plugin (`https://challenges.cloudflare.com/turnstile/v0/siteverify`).
- Test keys (always pass): site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`.
  Always-fail: site `2x00000000000000000000AB`, secret `2x0000000000000000000000000000000AA`.
- CSP must allow `https://challenges.cloudflare.com` (script-src, frame-src).

## 5. Deployment
- Single Worker with **Static Assets**: `assets.directory = apps/web/dist`, `not_found_handling = "single-page-application"`, `run_worker_first = ["/api/*"]`.
- `@cloudflare/vite-plugin` for local dev parity (optional; alternative: Vite proxy → `wrangler dev`).
- `compatibility_flags = ["nodejs_compat"]` (needed for `node:crypto` scrypt & better-auth deps).
- Portability: `entries/node.ts` with `@hono/node-server` + `serveStatic` + libSQL/better-sqlite3 → Docker/Fly/Render/VPS.


## 6. User decisions (2026-11-07)
- Vercel: both Hobby and Team accounts → strategy resolver chooses TRANSFER vs RECREATE per job.
- Domains: registered at **Cloudflare Registrar** (primary case) → `CF_REGISTRAR_DOMAIN_MOVE` is the MVP zone template.
- Providers in MVP: Cloudflare, Vercel, **Supabase**.
- Production domain: TBD (user will provide) → blocks T-110 only; dev uses localhost + Turnstile test keys.
- Notifications (Telegram/Discord/Email): **not needed** → in-app alerts only.
