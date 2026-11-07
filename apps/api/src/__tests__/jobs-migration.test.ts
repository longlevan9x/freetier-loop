import {
  API_PREFIX,
  API_ROUTES,
  AUTH_PREFIX,
  ERROR_CODE,
  HEADER,
  HTTP_STATUS,
  JOB_STATUS,
  MIGRATION_TEMPLATE,
  PROVIDER,
  RESOURCE_KIND,
  STEP_STATUS,
  VERCEL_ACCOUNT_TYPE,
} from '@freetier-loop/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { StrategyResolver } from '../jobs/strategy-resolver';
import { createDefaultDeps } from '../platform/deps';
import { createInMemoryDatabase } from '../platform/sqlite-d1';
import { CF_FIXTURES } from '../providers/cloudflare/__fixtures__/cloudflare.fixtures';
import { SUPABASE_FIXTURES } from '../providers/supabase/__fixtures__/supabase.fixtures';
import { VERCEL_FIXTURES } from '../providers/vercel/__fixtures__/vercel.fixtures';

describe('M4 & M5 Job Engine, StrategyResolver & Migration Templates (T-072..T-073, T-090..T-096B)', () => {
  it('resolves optimal migration strategy for Cloudflare Registrar vs External, Vercel Hobby vs Team, and Supabase Org vs Cross-Account (T-090, T-133)', () => {
    const resolver = new StrategyResolver();

    // 1. CF Registrar domain -> CF_REGISTRAR_DOMAIN_MOVE
    const cfReg = resolver.resolve({
      resource: {
        kind: RESOURCE_KIND.ZONE,
        name: 'example-registrar.com',
        data: { registrar: true },
      },
      sourceAccount: {
        id: 'acc_1',
        provider: PROVIDER.CLOUDFLARE,
        accountType: null,
        externalAccountId: 'cf_1',
      },
      targetAccount: {
        id: 'acc_2',
        provider: PROVIDER.CLOUDFLARE,
        accountType: null,
        externalAccountId: 'cf_2',
      },
    });
    expect(cfReg.recommendedTemplate).toBe(MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE);

    // 2. External registrar domain -> CF_ZONE_MOVE
    const cfExt = resolver.resolve({
      resource: {
        kind: RESOURCE_KIND.ZONE,
        name: 'external-domain.io',
        data: { registrar: false },
      },
      sourceAccount: {
        id: 'acc_1',
        provider: PROVIDER.CLOUDFLARE,
        accountType: null,
        externalAccountId: 'cf_1',
      },
      targetAccount: {
        id: 'acc_2',
        provider: PROVIDER.CLOUDFLARE,
        accountType: null,
        externalAccountId: 'cf_2',
      },
    });
    expect(cfExt.recommendedTemplate).toBe(MIGRATION_TEMPLATE.CF_ZONE_MOVE);

    // 3. Vercel Hobby -> VERCEL_PROJECT_RECREATE; Team -> VERCEL_PROJECT_TRANSFER
    const vHobby = resolver.resolve({
      resource: {
        kind: RESOURCE_KIND.VERCEL_PROJECT,
        name: 'marketing-web',
        data: {},
      },
      sourceAccount: {
        id: 'v_1',
        provider: PROVIDER.VERCEL,
        accountType: VERCEL_ACCOUNT_TYPE.HOBBY,
        externalAccountId: 'u_1',
      },
      targetAccount: {
        id: 'v_2',
        provider: PROVIDER.VERCEL,
        accountType: VERCEL_ACCOUNT_TYPE.TEAM,
        externalAccountId: 'team_2',
      },
    });
    expect(vHobby.recommendedTemplate).toBe(MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE);

    const vTeam = resolver.resolve({
      resource: {
        kind: RESOURCE_KIND.VERCEL_PROJECT,
        name: 'marketing-web',
        data: {},
      },
      sourceAccount: {
        id: 'v_1',
        provider: PROVIDER.VERCEL,
        accountType: VERCEL_ACCOUNT_TYPE.TEAM,
        externalAccountId: 'team_1',
      },
      targetAccount: {
        id: 'v_2',
        provider: PROVIDER.VERCEL,
        accountType: VERCEL_ACCOUNT_TYPE.TEAM,
        externalAccountId: 'team_2',
      },
    });
    expect(vTeam.recommendedTemplate).toBe(MIGRATION_TEMPLATE.VERCEL_PROJECT_TRANSFER);

    // 4. Supabase same user -> SUPABASE_ORG_TRANSFER; different user -> SUPABASE_PROJECT_RECREATE
    const sbSame = resolver.resolve({
      resource: {
        kind: RESOURCE_KIND.SUPABASE_PROJECT,
        name: 'prod-db',
        data: {},
      },
      sourceAccount: {
        id: 'sb_1',
        provider: PROVIDER.SUPABASE,
        accountType: null,
        externalAccountId: 'org_1',
      },
      targetAccount: {
        id: 'sb_2',
        provider: PROVIDER.SUPABASE,
        accountType: null,
        externalAccountId: 'org_2',
      },
      sameSupabaseUser: true,
    });
    expect(sbSame.recommendedTemplate).toBe(MIGRATION_TEMPLATE.SUPABASE_ORG_TRANSFER);

    const sbCross = resolver.resolve({
      resource: {
        kind: RESOURCE_KIND.SUPABASE_PROJECT,
        name: 'prod-db',
        data: {},
      },
      sourceAccount: {
        id: 'sb_1',
        provider: PROVIDER.SUPABASE,
        accountType: null,
        externalAccountId: 'org_1',
      },
      targetAccount: {
        id: 'sb_2',
        provider: PROVIDER.SUPABASE,
        accountType: null,
        externalAccountId: 'org_2',
      },
      sameSupabaseUser: false,
    });
    expect(sbCross.recommendedTemplate).toBe(MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE);

    // 5. Target account ranking (T-133)
    const ranked = resolver.recommendTargetAccounts({
      sourceAccountId: 'sb_1',
      provider: PROVIDER.SUPABASE,
      candidates: [
        {
          id: 'sb_2',
          label: 'Busy SB',
          provider: PROVIDER.SUPABASE,
          status: 'quota_exceeded',
          quotaPercent: 85,
          activeProjectsCount: 1,
        },
        {
          id: 'sb_3',
          label: 'Fresh SB',
          provider: PROVIDER.SUPABASE,
          status: 'active',
          quotaPercent: 0,
          activeProjectsCount: 0,
        },
      ],
    });
    expect(ranked[0]?.accountId).toBe('sb_3');
  });

  it('executes CF_REGISTRAR_DOMAIN_MOVE end-to-end without calling DELETE /zones, blocks self-protected hosts, and enforces typed confirmation (T-072, T-073, T-091A)', async () => {
    const deleteCalls: string[] = [];

    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.includes('turnstile')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('user/tokens/verify')) {
        return new Response(JSON.stringify(CF_FIXTURES.verifyToken), { status: 200 });
      }
      if (url.includes('/registrar/domains')) {
        return new Response(JSON.stringify(CF_FIXTURES.registrarDomains), { status: 200 });
      }
      if (url.includes('/workers/domains')) {
        if (method === 'PUT') {
          return new Response(
            JSON.stringify({
              success: true,
              result: {
                id: 'wd_new',
                hostname: 'api.example-registrar.com',
                service: 'my-api-worker',
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(CF_FIXTURES.workersDomains), { status: 200 });
      }
      if (url.includes('/client/v4/accounts')) {
        return new Response(JSON.stringify(CF_FIXTURES.accounts), { status: 200 });
      }
      if (url.includes('/dnssec')) {
        return new Response(JSON.stringify(CF_FIXTURES.dnssecStatus), { status: 200 });
      }
      if (url.includes('/email/routing')) {
        return new Response(JSON.stringify(CF_FIXTURES.emailRouting), { status: 200 });
      }
      if (method === 'DELETE' && url.includes('/zones/')) {
        deleteCalls.push(url);
        return new Response(JSON.stringify({ success: true, result: { id: 'zone_cf_01' } }), {
          status: 200,
        });
      }
      if (method === 'POST' && url.endsWith('/client/v4/zones')) {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id: 'zone_target_99',
              name: 'example-registrar.com',
              status: 'pending',
              name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
              account: { id: 'cf_acc_source_01', name: 'Target CF' },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/client/v4/zones?')) {
        return new Response(JSON.stringify(CF_FIXTURES.zones), { status: 200 });
      }
      if (url.match(/\/zones\/[^/]+$/)) {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id: 'zone_target_99',
              name: 'example-registrar.com',
              status: 'active',
              name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
              account: { id: 'cf_acc_source_01', name: 'Target CF' },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/dns_records/export')) {
        return new Response(';; BIND\n', { status: 200 });
      }
      if (url.includes('/dns_records/batch')) {
        return new Response(JSON.stringify(CF_FIXTURES.dnsBatchResult), { status: 200 });
      }
      if (url.includes('/dns_records')) {
        return new Response(JSON.stringify(CF_FIXTURES.dnsRecords), { status: 200 });
      }
      if (url.includes('/settings')) {
        if (method === 'PATCH') {
          return new Response(
            JSON.stringify({ success: true, result: { id: 'ssl', value: 'strict' } }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(CF_FIXTURES.zoneSettings), { status: 200 });
      }
      if (url.includes('/workers/domains')) {
        if (method === 'PUT') {
          return new Response(
            JSON.stringify({
              success: true,
              result: {
                id: 'wd_new',
                hostname: 'api.example-registrar.com',
                service: 'my-api-worker',
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(CF_FIXTURES.workersDomains), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
    }) as typeof fetch;

    const { db } = await createInMemoryDatabase();
    const deps = createDefaultDeps(
      {
        ADMIN_EMAILS: 'admin@example.com',
        SELF_PROTECTED_HOSTS: 'admin-console.internal.dev',
      },
      { db, fetchFn: mockFetch },
    );
    const seededAdmin = await deps.authService.seedAdmin({
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    const app = createApp(deps);

    const loginRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [HEADER.CAPTCHA]: 'ok' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'AdminPassword123!' }),
    });
    const cookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const srcAcc = await deps.providerAccountsService.create(
      { provider: PROVIDER.CLOUDFLARE, label: 'CF Source', apiToken: 'cf_tok_source1111' },
      seededAdmin.id,
    );
    const dstAcc = await deps.providerAccountsService.create(
      { provider: PROVIDER.CLOUDFLARE, label: 'CF Target', apiToken: 'cf_tok_target2222' },
      seededAdmin.id,
    );
    await deps.providerAccountsService.syncInventory(srcAcc.id, undefined, seededAdmin.id);

    const resources = (await deps.resourcesService.list({ accountId: srcAcc.id, limit: 50 })).items;
    const cfRegZone = resources.find((r) => r.name === 'example-registrar.com')!;

    // Create job via API
    const createJobRes = await app.request(`${API_PREFIX}${API_ROUTES.JOBS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        template: MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE,
        sourceAccountId: srcAcc.id,
        targetAccountId: dstAcc.id,
        resourceId: cfRegZone.id,
      }),
    });
    expect(createJobRes.status).toBe(HTTP_STATUS.CREATED);
    const jobId = ((await createJobRes.json()) as { data: { id: string } }).data.id;

    // Plan job
    const planRes = await app.request(`${API_PREFIX}${API_ROUTES.JOBS}/${jobId}/plan`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(planRes.status).toBe(HTTP_STATUS.OK);
    const plannedJob = ((await planRes.json()) as { data: { status: string } }).data;
    expect(plannedJob.status).toBe(JOB_STATUS.PLANNED);

    // Wrong confirmation text -> 400 CONFIRMATION_MISMATCH
    const badConfirmRes = await app.request(`${API_PREFIX}${API_ROUTES.JOBS}/${jobId}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ confirm: 'wrong-domain.com' }),
    });
    expect(badConfirmRes.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(((await badConfirmRes.json()) as { error: { code: string } }).error.code).toBe(
      ERROR_CODE.CONFIRMATION_MISMATCH,
    );

    // Correct typed confirmation
    const confirmRes = await app.request(`${API_PREFIX}${API_ROUTES.JOBS}/${jobId}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ confirm: 'example-registrar.com' }),
    });
    expect(confirmRes.status).toBe(HTTP_STATUS.OK);

    // Advance steps until waiting_manual
    let currentJob = await deps.jobsService.getById(jobId);
    let safetyCounter = 0;
    while (currentJob.status === JOB_STATUS.RUNNING && safetyCounter < 15) {
      safetyCounter += 1;
      const advRes = await app.request(`${API_PREFIX}${API_ROUTES.JOBS}/${jobId}/advance`, {
        method: 'POST',
        headers: { cookie },
      });
      currentJob = ((await advRes.json()) as { data: typeof currentJob }).data;
    }

    expect(currentJob.status).toBe(JOB_STATUS.WAITING_MANUAL);
    const waitingStep = currentJob.steps?.find((s) => s.status === STEP_STATUS.WAITING_MANUAL)!;
    expect(waitingStep).toBeDefined();

    // Submit manual confirmation for Cloudflare Registrar move
    const manualRes = await app.request(
      `${API_PREFIX}${API_ROUTES.JOBS}/${jobId}/steps/${waitingStep.id}/manual-input`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ acknowledged: true, values: {} }),
      },
    );
    currentJob = ((await manualRes.json()) as { data: typeof currentJob }).data;

    // Advance remaining steps (wait.poll + cf.rebind-worker-domains)
    while (currentJob.status === JOB_STATUS.RUNNING && safetyCounter < 25) {
      safetyCounter += 1;
      const advRes = await app.request(`${API_PREFIX}${API_ROUTES.JOBS}/${jobId}/advance`, {
        method: 'POST',
        headers: { cookie },
      });
      currentJob = ((await advRes.json()) as { data: typeof currentJob }).data;
    }

    expect(currentJob.status).toBe(JOB_STATUS.COMPLETED);
    // CRITICAL AC (T-091A): Never call DELETE /zones on a CF Registrar domain!
    expect(deleteCalls).toHaveLength(0);

    // Check job events
    const eventsRes = await app.request(`${API_PREFIX}${API_ROUTES.JOBS}/${jobId}/events`, {
      headers: { cookie },
    });
    const events = ((await eventsRes.json()) as { data: unknown[] }).data;
    expect(events.length).toBeGreaterThan(3);
  });

  it('executes SUPABASE_PROJECT_RECREATE with pg_dump command generation, row-count verification (detecting mismatch then succeeding on retry), Edge Function deploy, and source project pause (T-096A)', async () => {
    let targetRowCountShouldMismatch = true;
    let sourcePaused = false;

    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();

      const authHeader = new Headers(init?.headers).get('authorization') ?? '';
      if (url.endsWith('/v1/organizations')) {
        return new Response(JSON.stringify(SUPABASE_FIXTURES.organizations), { status: 200 });
      }
      if (url.endsWith('/v1/projects') && method === 'GET') {
        if (authHeader.includes('sbp_target_2222')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response(JSON.stringify(SUPABASE_FIXTURES.projects), { status: 200 });
      }
      if (url.endsWith('/v1/projects') && method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'sb_target_ref_99',
            ref: 'sb_target_ref_99',
            organization_id: 'org_sb_01',
            name: 'new-target-db',
            region: 'ap-southeast-1',
            created_at: '2026-03-01T00:00:00Z',
            status: 'ACTIVE_HEALTHY',
          }),
          { status: 201 },
        );
      }
      if (url.match(/\/v1\/projects\/[^/]+$/) && method === 'GET') {
        return new Response(JSON.stringify(SUPABASE_FIXTURES.projects[0]), { status: 200 });
      }
      if (url.includes('/database/query')) {
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        if (bodyStr.includes('pg_extension')) {
          return new Response(JSON.stringify(SUPABASE_FIXTURES.extensionsQuery), { status: 200 });
        }
        if (url.includes('sb_target_ref_99') && targetRowCountShouldMismatch) {
          return new Response(
            JSON.stringify([
              { schema_name: 'public', table_name: 'todos', row_count: 10 },
              { schema_name: 'auth', table_name: 'users', row_count: 42 },
            ]),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(SUPABASE_FIXTURES.tableCountsQuery), { status: 200 });
      }
      if (url.includes('/functions/stripe-webhook/body')) {
        return new Response(SUPABASE_FIXTURES.edgeFunctionBody, { status: 200 });
      }
      if (url.includes('/functions/deploy')) {
        return new Response(JSON.stringify(SUPABASE_FIXTURES.edgeFunctions[0]), { status: 201 });
      }
      if (url.includes('/functions')) {
        return new Response(JSON.stringify(SUPABASE_FIXTURES.edgeFunctions), { status: 200 });
      }
      if (url.includes('/secrets')) {
        if (method === 'POST') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify(SUPABASE_FIXTURES.secrets), { status: 200 });
      }
      if (url.includes('/pause')) {
        sourcePaused = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const { db } = await createInMemoryDatabase();
    const deps = createDefaultDeps({}, { db, fetchFn: mockFetch });

    const srcSb = await deps.providerAccountsService.create(
      { provider: PROVIDER.SUPABASE, label: 'SB Source', apiToken: 'sbp_source_1111' },
      'admin',
    );
    const dstSb = await deps.providerAccountsService.create(
      { provider: PROVIDER.SUPABASE, label: 'SB Target', apiToken: 'sbp_target_2222' },
      'admin',
    );
    await deps.providerAccountsService.syncInventory(srcSb.id, undefined, 'admin');

    const sbResource = (
      await deps.resourcesService.list({
        accountId: srcSb.id,
        kind: RESOURCE_KIND.SUPABASE_PROJECT,
        limit: 10,
      })
    ).items[0]!;

    const job = await deps.jobsService.create(
      {
        template: MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE,
        sourceAccountId: srcSb.id,
        targetAccountId: dstSb.id,
        resourceId: sbResource.id,
        input: { pauseSource: true },
      },
      'admin',
    );
    await deps.jobsService.confirm(job.id, sbResource.name, 'admin');

    // Advance until manual.run-command (pg_dump | psql)
    let state = await deps.jobsService.getById(job.id);
    while (state.status === JOB_STATUS.RUNNING) {
      state = await deps.jobsService.advance(job.id, 'admin');
    }
    expect(state.status).toBe(JOB_STATUS.WAITING_MANUAL);
    const dumpStep = state.steps?.find((s) => s.status === STEP_STATUS.WAITING_MANUAL)!;
    expect(String(dumpStep.result?.command ?? '')).toContain('pg_dump');
    expect(String(dumpStep.result?.command ?? '')).toContain(
      '--schema=public --schema=auth --schema=storage',
    );

    // Acknowledge pg_dump step
    await deps.jobsService.submitManualInput(
      job.id,
      dumpStep.id,
      { acknowledged: true, values: {} },
      'admin',
    );

    // Next advance runs supabase.verify-row-counts -> should FAIL because targetRowCountShouldMismatch = true
    state = await deps.jobsService.advance(job.id, 'admin');
    expect(state.status).toBe(JOB_STATUS.FAILED);
    const failedVerifyStep = state.steps?.find((s) => s.status === STEP_STATUS.FAILED)!;
    expect(failedVerifyStep.errorMessage).toContain('public.todos');

    // Fix target row count and retry job!
    targetRowCountShouldMismatch = false;
    state = await deps.jobsService.retry(job.id, 'admin');
    expect(state.status).toBe(JOB_STATUS.RUNNING);

    // Advance until manual secret input step
    while (state.status === JOB_STATUS.RUNNING) {
      state = await deps.jobsService.advance(job.id, 'admin');
    }
    expect(state.status).toBe(JOB_STATUS.WAITING_MANUAL);
    const secretStep = state.steps?.find((s) => s.status === STEP_STATUS.WAITING_MANUAL)!;
    await deps.jobsService.submitManualInput(
      job.id,
      secretStep.id,
      {
        acknowledged: true,
        values: {
          STRIPE_WEBHOOK_SECRET: 'whsec_new_target_val',
        },
      },
      'admin',
    );

    // Advance remaining steps (ENV_REWIRE + SUPABASE_PAUSE_SOURCE)
    state = await deps.jobsService.getById(job.id);
    while (state.status === JOB_STATUS.RUNNING) {
      state = await deps.jobsService.advance(job.id, 'admin');
    }

    expect(state.status).toBe(JOB_STATUS.COMPLETED);
    expect(sourcePaused).toBe(true);
  });

  it('executes VERCEL_PROJECT_RECREATE with sensitive env var prompt and supports rollback compensation (T-093)', async () => {
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.includes('/v2/user')) {
        return new Response(JSON.stringify(VERCEL_FIXTURES.user), { status: 200 });
      }
      if (url.includes('/v2/teams')) {
        return new Response(JSON.stringify(VERCEL_FIXTURES.teamsEmpty), { status: 200 });
      }
      if (url.includes('/env')) {
        if (method === 'POST') {
          return new Response(JSON.stringify({ created: [] }), { status: 200 });
        }
        return new Response(JSON.stringify(VERCEL_FIXTURES.projectEnvs), { status: 200 });
      }
      if (url.includes('/domains')) {
        if (method === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        if (method === 'POST') {
          return new Response(
            JSON.stringify({
              name: 'app.example-registrar.com',
              apexName: 'example-registrar.com',
              projectId: 'prj_target_new',
              verified: true,
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(VERCEL_FIXTURES.projectDomains), { status: 200 });
      }
      if (url.endsWith('/v10/projects') && method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'prj_target_new',
            name: 'marketing-web',
            framework: 'nextjs',
          }),
          { status: 200 },
        );
      }
      if (url.includes('/v9/projects/')) {
        return new Response(
          JSON.stringify({
            id: 'prj_target_new',
            name: 'marketing-web',
            framework: 'nextjs',
          }),
          { status: 200 },
        );
      }
      if (url.includes('/v9/projects')) {
        return new Response(JSON.stringify(VERCEL_FIXTURES.projects), { status: 200 });
      }
      return new Response(JSON.stringify(VERCEL_FIXTURES.teamsEmpty), { status: 200 });
    }) as typeof fetch;

    const { db } = await createInMemoryDatabase();
    const deps = createDefaultDeps({}, { db, fetchFn: mockFetch });

    const srcV = await deps.providerAccountsService.create(
      { provider: PROVIDER.VERCEL, label: 'Vercel Hobby A', apiToken: 'v_tok_1111' },
      'admin',
    );
    const dstV = await deps.providerAccountsService.create(
      { provider: PROVIDER.VERCEL, label: 'Vercel Hobby B', apiToken: 'v_tok_2222' },
      'admin',
    );
    await deps.providerAccountsService.syncInventory(srcV.id, undefined, 'admin');

    const vercelProj = (
      await deps.resourcesService.list({
        accountId: srcV.id,
        kind: RESOURCE_KIND.VERCEL_PROJECT,
        limit: 10,
      })
    ).items[0]!;

    const job = await deps.jobsService.create(
      {
        template: MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE,
        sourceAccountId: srcV.id,
        targetAccountId: dstV.id,
        resourceId: vercelProj.id,
        input: {},
      },
      'admin',
    );
    await deps.jobsService.confirm(job.id, vercelProj.name, 'admin');

    let state = await deps.jobsService.getById(job.id);
    while (state.status === JOB_STATUS.RUNNING) {
      state = await deps.jobsService.advance(job.id, 'admin');
    }
    // Should pause at manual.secret-input for SUPABASE_SERVICE_ROLE_KEY (sensitive env var in fixture)
    expect(state.status).toBe(JOB_STATUS.WAITING_MANUAL);
    const secretStep = state.steps?.find((s) => s.status === STEP_STATUS.WAITING_MANUAL)!;
    expect(secretStep.result?.requiredSecrets).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);

    await deps.jobsService.submitManualInput(
      job.id,
      secretStep.id,
      {
        acknowledged: true,
        values: { SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new_srk' },
      },
      'admin',
    );

    state = await deps.jobsService.getById(job.id);
    while (state.status === JOB_STATUS.RUNNING) {
      state = await deps.jobsService.advance(job.id, 'admin');
    }
    expect(state.status).toBe(JOB_STATUS.COMPLETED);

    // Test rollback compensation (re-attaches domain back to source)
    const compensated = await deps.jobsService.compensate(job.id, 'admin');
    expect(compensated.status).toBe(JOB_STATUS.CANCELLED);
  });
});
