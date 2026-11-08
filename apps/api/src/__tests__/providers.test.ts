import {
  CAPABILITY,
  ERROR_CODE,
  PROVIDER,
  USAGE_METRIC,
  VERCEL_ACCOUNT_TYPE,
} from '@freetier-loop/shared';
import { describe, expect, it } from 'vitest';
import { CF_FIXTURES } from '../providers/cloudflare/__fixtures__/cloudflare.fixtures';
import {
  ProviderRegistry,
  SubrequestBudget,
  createDefaultProviderRegistry,
  createHttpClient,
} from '../providers/index';
import { SUPABASE_FIXTURES } from '../providers/supabase/__fixtures__/supabase.fixtures';
import { VERCEL_FIXTURES } from '../providers/vercel/__fixtures__/vercel.fixtures';

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('Providers & HTTP Client (T-041..T-045B)', () => {
  it('T-041: retries on 429/5xx, enforces SubrequestBudget, and maps error codes', async () => {
    let calls = 0;
    const budget = new SubrequestBudget(3);
    const client = createHttpClient({
      baseUrl: 'https://api.example.com',
      token: 'tok_test',
      maxRetries: 2,
      retryBaseMs: 1,
      budget,
      sleepFn: async () => undefined,
      fetchFn: async () => {
        calls++;
        if (calls === 1) {
          return jsonResponse({ error: 'rate limit' }, 429, { 'retry-after': '0' });
        }
        return jsonResponse({ ok: true }, 200);
      },
    });

    const res = await client.request<{ ok: boolean }>({ path: '/test' });
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
    expect(budget.used).toBe(2);

    await client.request({ path: '/test-2' });
    await expect(client.request({ path: '/test-3' })).rejects.toMatchObject({
      code: ERROR_CODE.PROVIDER_BUDGET_EXCEEDED,
    });
  });

  it('T-042: ProviderRegistry throws PROVIDER_CAPABILITY_UNSUPPORTED for unsupported capabilities', () => {
    const registry = createDefaultProviderRegistry();
    expect(() =>
      registry.getCapability(PROVIDER.VERCEL, CAPABILITY.REGISTRAR_DOMAINS),
    ).toThrowError(/does not support capability/);

    const emptyRegistry = new ProviderRegistry();
    expect(() => emptyRegistry.getCapability(PROVIDER.CLOUDFLARE, CAPABILITY.ZONES)).toThrowError(
      /No provider adapter registered/,
    );
  });

  it('T-043 & T-044: CloudflareAdapter verifies token, detects CF Registrar zones, batches DNS, and queries GraphQL usage', async () => {
    const registry = createDefaultProviderRegistry();
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/user/tokens/verify')) return jsonResponse(CF_FIXTURES.verifyToken);
      if (url.endsWith('/accounts?page=1&per_page=20')) return jsonResponse(CF_FIXTURES.accounts);
      if (url.includes('/registrar/domains')) return jsonResponse(CF_FIXTURES.registrarDomains);
      if (url.includes('/dns_records/batch')) return jsonResponse(CF_FIXTURES.dnsBatchResult);
      if (url.includes('/dns_records')) return jsonResponse(CF_FIXTURES.dnsRecords);
      if (url.includes('/zones/zone_registrar_01/settings'))
        return jsonResponse(CF_FIXTURES.zoneSettings);
      if (url.includes('/zones')) return jsonResponse(CF_FIXTURES.zones);
      if (url.includes('/graphql')) return jsonResponse(CF_FIXTURES.graphqlUsage);
      return jsonResponse({ success: true, result: {} });
    };

    const ctx = { token: 'cf_tok', externalAccountId: 'cf_acc_source_01', fetchFn };
    const verifier = registry.getCapability(PROVIDER.CLOUDFLARE, CAPABILITY.ACCOUNT_VERIFIER);
    const verified = await verifier.verify(ctx);
    expect(verified.valid).toBe(true);
    expect(verified.externalAccountId).toBe('cf_acc_source_01');

    const zoneProvider = registry.getCapability(PROVIDER.CLOUDFLARE, CAPABILITY.ZONES);
    const zones = await zoneProvider.listZones(ctx);
    expect(zones.items).toHaveLength(2);
    expect(zones.items[0]?.registrar).toBe(true);
    expect(zones.items[1]?.registrar).toBe(false);

    const settings = await zoneProvider.getZoneSettings(ctx, 'zone_registrar_01');
    expect(settings.ssl).toBe('strict');

    const dnsProvider = registry.getCapability(PROVIDER.CLOUDFLARE, CAPABILITY.DNS_RECORDS);
    const batchRes = await dnsProvider.batchApply(ctx, 'zone_registrar_01', {
      posts: [
        { type: 'A', name: 'example-registrar.com', content: '76.76.21.21', ttl: 1, proxied: true },
      ],
    });
    expect(batchRes.createdCount).toBe(1);

    const usageProvider = registry.getCapability(PROVIDER.CLOUDFLARE, CAPABILITY.USAGE);
    const usage = await usageProvider.getUsage(ctx);
    expect(usage[0]?.metric).toBe(USAGE_METRIC.WORKERS_REQUESTS);
    expect(usage[0]?.value).toBe(84_500);
    expect(usage[0]?.warning).toContain('85%');
  });

  it('T-045: VercelAdapter detects Hobby vs Team accounts and marks sensitive env vars as readable:false', async () => {
    const registry = createDefaultProviderRegistry();
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/v2/user')) return jsonResponse(VERCEL_FIXTURES.user);
      if (url.includes('/v2/teams')) return jsonResponse(VERCEL_FIXTURES.teamsEmpty);
      if (url.includes('/v9/projects/prj_vercel_01/domains'))
        return jsonResponse(VERCEL_FIXTURES.projectDomains);
      if (url.includes('/v10/projects/prj_vercel_01/env'))
        return jsonResponse(VERCEL_FIXTURES.projectEnvs);
      if (url.includes('/v9/projects')) return jsonResponse(VERCEL_FIXTURES.projects);
      if (url.includes('/transfer-request')) return jsonResponse(VERCEL_FIXTURES.transferRequest);
      return jsonResponse({});
    };

    const ctx = { token: 'vc_tok', fetchFn };
    const verifier = registry.getCapability(PROVIDER.VERCEL, CAPABILITY.ACCOUNT_VERIFIER);
    const verified = await verifier.verify(ctx);
    expect(verified.accountType).toBe(VERCEL_ACCOUNT_TYPE.HOBBY);

    const envProvider = registry.getCapability(PROVIDER.VERCEL, CAPABILITY.ENV_VARS);
    const envs = await envProvider.listEnvVars(ctx, 'prj_vercel_01');
    const plainVar = envs.find((e) => e.key === 'NEXT_PUBLIC_SUPABASE_URL');
    const sensitiveVar = envs.find((e) => e.key === 'SUPABASE_SERVICE_ROLE_KEY');
    expect(plainVar?.readable).toBe(true);
    expect(plainVar?.value).toBe('https://oldref.supabase.co');
    expect(sensitiveVar?.readable).toBe(false);
    expect(sensitiveVar?.value).toBeUndefined();
  });

  it('T-045B: SupabaseAdapter lists projects, pauses/restores, downloads Edge Functions, and runs read-only SQL checks', async () => {
    const registry = createDefaultProviderRegistry();
    let pausedCalled = false;
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/v1/organizations')) return jsonResponse(SUPABASE_FIXTURES.organizations);
      if (url.endsWith('/pause')) {
        pausedCalled = true;
        return jsonResponse({}, 200);
      }
      if (url.includes('/v1/projects/ref_sb_active_01/secrets'))
        return jsonResponse(SUPABASE_FIXTURES.secrets);
      if (url.includes('/v1/projects/ref_sb_active_01/functions/stripe-webhook/body'))
        return new Response(SUPABASE_FIXTURES.edgeFunctionBody, { status: 200 });
      if (url.includes('/v1/projects/ref_sb_active_01/functions'))
        return jsonResponse(SUPABASE_FIXTURES.edgeFunctions);
      if (url.includes('/v1/projects/ref_sb_active_01/database/query')) {
        const bodyStr = String(init?.body ?? '');
        if (bodyStr.includes('pg_database_size'))
          return jsonResponse(SUPABASE_FIXTURES.dbSizeQuery);
        if (bodyStr.includes('pg_stat_user_tables'))
          return jsonResponse(SUPABASE_FIXTURES.tableCountsQuery);
        return jsonResponse(SUPABASE_FIXTURES.extensionsQuery);
      }
      if (url.includes('/v1/projects')) return jsonResponse(SUPABASE_FIXTURES.projects);
      return jsonResponse({});
    };

    const ctx = { token: 'sbp_tok', fetchFn };
    const projectProvider = registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.PROJECTS);
    const projects = await projectProvider.listProjects(ctx);
    expect(projects.items).toHaveLength(2);
    await projectProvider.pauseProject?.(ctx, 'ref_sb_active_01');
    expect(pausedCalled).toBe(true);

    const fnProvider = registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.EDGE_FUNCTIONS);
    const fns = await fnProvider.listFunctions(ctx, 'ref_sb_active_01');
    expect(fns[0]?.slug).toBe('stripe-webhook');
    const body = await fnProvider.downloadFunctionBody(ctx, 'ref_sb_active_01', 'stripe-webhook');
    expect(body).toContain('Deno.serve');

    const sqlProvider = registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.SQL_QUERY);
    const sizeBytes = await sqlProvider.getDatabaseSizeBytes(ctx, 'ref_sb_active_01');
    expect(sizeBytes).toBe(142_606_336);
    const counts = await sqlProvider.getTableRowCounts(ctx, 'ref_sb_active_01');
    expect(counts).toHaveLength(2);

    const usageProvider = registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.USAGE);
    const usage = await usageProvider.getUsage(ctx);
    expect(usage[0]?.value).toBe(2);
    expect(usage[0]?.warning).toContain('slot full');
  });

  it('VercelAdapter reads and updates project rules (rewrites, redirects, headers)', async () => {
    const registry = createDefaultProviderRegistry();
    let patchedBody: Record<string, unknown> | null = null;
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/v9/projects/prj_123')) {
        if (init?.method === 'PATCH') {
          patchedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          return jsonResponse({ id: 'prj_123', ...patchedBody });
        }
        return jsonResponse({
          id: 'prj_123',
          name: 'my-project',
          rewrites: [{ source: '/api/(.*)', destination: '/api/v1/$1' }],
          redirects: [{ source: '/old', destination: '/new', permanent: true }],
          headers: [{ source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] }],
          cleanUrls: true,
          trailingSlash: false,
        });
      }
      return jsonResponse({});
    };

    const ctx = { token: 'ver_tok', fetchFn };
    const projectProvider = registry.getCapability(PROVIDER.VERCEL, CAPABILITY.PROJECTS);
    const rules = await projectProvider.getProjectRules!(ctx, 'prj_123');
    expect(rules.rewrites).toHaveLength(1);
    expect(rules.redirects).toHaveLength(1);
    expect(rules.headers).toHaveLength(1);
    expect(rules.cleanUrls).toBe(true);

    await projectProvider.updateProjectRules!(ctx, 'prj_123', {
      ...rules,
      cleanUrls: false,
    });
    expect(patchedBody).toMatchObject({ cleanUrls: false });
  });

  it('GitLabAdapter verifies token, lists projects, reads variables and upserts variable', async () => {
    const registry = createDefaultProviderRegistry();
    const variablesStore: Record<string, string> = {
      VERCEL_TOKEN: 'old_ver_token',
      VERCEL_ORG_ID: 'old_org_id',
    };

    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/personal_access_tokens/self')) {
        return jsonResponse({
          id: 1,
          name: 'dev-user',
          user_id: 9999,
          active: true,
          revoked: false,
          scopes: ['api'],
        });
      }
      if (url.includes('/api/v4/user')) {
        return jsonResponse({ id: 9999, username: 'dev-user', name: 'Dev User', state: 'active' });
      }
      if (url.includes('/api/v4/projects/123/variables/VERCEL_TOKEN')) {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as { value: string };
          variablesStore.VERCEL_TOKEN = body.value;
          return jsonResponse({ key: 'VERCEL_TOKEN', value: body.value });
        }
        return jsonResponse({ key: 'VERCEL_TOKEN', value: variablesStore.VERCEL_TOKEN });
      }
      if (url.includes('/api/v4/projects/123/variables/VERCEL_PROJECT_ID')) {
        return jsonResponse({ message: '404 Variable Not Found' }, 404);
      }
      if (url.includes('/api/v4/projects/123/variables')) {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { key: string; value: string };
          variablesStore[body.key] = body.value;
          return jsonResponse({ key: body.key, value: body.value }, 201);
        }
        return jsonResponse(
          Object.entries(variablesStore).map(([key, value]) => ({
            key,
            value,
            variable_type: 'env_var',
            protected: false,
            masked: key.includes('TOKEN'),
          })),
        );
      }
      if (url.includes('/api/v4/projects/123/pipeline')) {
        return jsonResponse({
          id: 888,
          status: 'pending',
          ref: 'main',
          sha: 'abc12345',
          web_url: 'https://gitlab.com/team/frontend-app/-/pipelines/888',
          created_at: '2026-11-08T10:00:00Z',
        });
      }
      if (url.includes('/api/v4/projects')) {
        return jsonResponse([
          {
            id: 123,
            name: 'frontend-app',
            path_with_namespace: 'team/frontend-app',
            web_url: 'https://gitlab.com/team/frontend-app',
            default_branch: 'main',
          },
        ]);
      }
      return jsonResponse({});
    };

    const ctx = { token: 'glpat_test123', fetchFn };
    const verifier = registry.getCapability(PROVIDER.GITLAB, CAPABILITY.ACCOUNT_VERIFIER);
    const verified = await verifier.verify(ctx);
    expect(verified.valid).toBe(true);
    expect(verified.externalAccountId).toBe('9999');
    expect(verified.labelSuggested).toBe('dev-user');

    const gitlab = registry.getCapability(PROVIDER.GITLAB, CAPABILITY.GITLAB_VARIABLES);
    const projects = await gitlab.listProjects(ctx);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('frontend-app');

    const vars = await gitlab.listVariables(ctx, 123);
    expect(vars).toHaveLength(2);
    expect(vars.find((v) => v.key === 'VERCEL_TOKEN')?.value).toBe('old_ver_token');

    // Update existing
    await gitlab.upsertVariable(ctx, 123, { key: 'VERCEL_TOKEN', value: 'new_ver_token' });
    expect(variablesStore.VERCEL_TOKEN).toBe('new_ver_token');

    // Create new
    await gitlab.upsertVariable(ctx, 123, { key: 'VERCEL_PROJECT_ID', value: 'prj_new_id' });
    expect(variablesStore.VERCEL_PROJECT_ID).toBe('prj_new_id');

    // Trigger pipeline
    const pipeline = await gitlab.triggerPipeline(ctx, 123, 'main');
    expect(pipeline.id).toBe(888);
    expect(pipeline.status).toBe('pending');
    expect(pipeline.ref).toBe('main');
    expect(pipeline.webUrl).toContain('/pipelines/888');
  });

  it('GitHubAdapter verifies token, lists repos, reads variables, upserts variable and triggers workflow', async () => {
    const registry = createDefaultProviderRegistry();
    const variablesStore: Record<string, string> = {
      VERCEL_TOKEN: 'old_gh_token',
      VERCEL_ORG_ID: 'old_gh_org',
    };

    let workflowDispatched = false;

    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/user/repos')) {
        return jsonResponse([
          {
            id: 101,
            name: 'frontend-next',
            full_name: 'octocat/frontend-next',
            html_url: 'https://github.com/octocat/frontend-next',
            default_branch: 'main',
            private: false,
          },
        ]);
      }
      if (url.endsWith('/user')) {
        return jsonResponse({
          id: 583231,
          login: 'octocat',
          name: 'The Octocat',
          type: 'User',
        });
      }
      if (url.includes('/actions/variables/VERCEL_TOKEN')) {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as { value: string };
          variablesStore.VERCEL_TOKEN = body.value;
          return new Response(null, { status: 204 });
        }
        return jsonResponse({
          name: 'VERCEL_TOKEN',
          value: variablesStore.VERCEL_TOKEN,
          created_at: '2026-11-08T00:00:00Z',
          updated_at: '2026-11-08T00:00:00Z',
        });
      }
      if (url.includes('/actions/variables/VERCEL_PROJECT_ID')) {
        return jsonResponse({ message: 'Not Found' }, 404);
      }
      if (url.includes('/actions/variables')) {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { name: string; value: string };
          variablesStore[body.name] = body.value;
          return new Response(null, { status: 201 });
        }
        return jsonResponse({
          total_count: Object.keys(variablesStore).length,
          variables: Object.entries(variablesStore).map(([name, value]) => ({
            name,
            value,
            created_at: '2026-11-08T00:00:00Z',
            updated_at: '2026-11-08T00:00:00Z',
          })),
        });
      }
      if (url.includes('/dispatches')) {
        workflowDispatched = true;
        return new Response(null, { status: 204 });
      }
      return jsonResponse({});
    };

    const ctx = { token: 'ghp_test123', fetchFn };
    const verifier = registry.getCapability(PROVIDER.GITHUB, CAPABILITY.ACCOUNT_VERIFIER);
    const verified = await verifier.verify(ctx);
    expect(verified.valid).toBe(true);
    expect(verified.externalAccountId).toBe('583231');
    expect(verified.labelSuggested).toBe('octocat');

    const github = registry.getCapability(PROVIDER.GITHUB, CAPABILITY.GITHUB_VARIABLES);
    const repos = await github.listRepos(ctx);
    expect(repos).toHaveLength(1);
    expect(repos[0]?.fullName).toBe('octocat/frontend-next');

    const vars = await github.listVariables(ctx, 'octocat/frontend-next');
    expect(vars).toHaveLength(2);
    expect(vars.find((v) => v.name === 'VERCEL_TOKEN')?.value).toBe('old_gh_token');

    // Update existing
    await github.upsertVariable(ctx, 'octocat/frontend-next', {
      name: 'VERCEL_TOKEN',
      value: 'new_gh_token',
    });
    expect(variablesStore.VERCEL_TOKEN).toBe('new_gh_token');

    // Create new
    await github.upsertVariable(ctx, 'octocat/frontend-next', {
      name: 'VERCEL_PROJECT_ID',
      value: 'prj_gh_123',
    });
    expect(variablesStore.VERCEL_PROJECT_ID).toBe('prj_gh_123');

    // Trigger workflow dispatch
    await github.triggerWorkflow(ctx, 'octocat/frontend-next', 'deploy.yml', 'main');
    expect(workflowDispatched).toBe(true);
  });
});
