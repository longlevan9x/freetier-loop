import {
  ACCOUNT_STATUS,
  API_PREFIX,
  API_ROUTES,
  AUTH_PREFIX,
  HEADER,
  HTTP_STATUS,
  PROVIDER,
  RESOURCE_KIND,
} from '@freetier-loop/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDefaultDeps } from '../platform/deps';
import { createInMemoryDatabase } from '../platform/sqlite-d1';
import { CF_FIXTURES } from '../providers/cloudflare/__fixtures__/cloudflare.fixtures';
import { SUPABASE_FIXTURES } from '../providers/supabase/__fixtures__/supabase.fixtures';
import { VERCEL_FIXTURES } from '../providers/vercel/__fixtures__/vercel.fixtures';

const createMockProviderFetch = (opts?: { cfUsageRequestsToday?: number }): typeof fetch => {
  const zonesPage1 = Array.from({ length: 50 }, (_, idx) => ({
    id: `zone_${idx + 1}`,
    name: idx === 0 ? 'example-registrar.com' : `site-${idx + 1}.com`,
    status: 'active',
    name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
    account: { id: 'cf_acc_source_01', name: 'CF Account 1' },
  }));
  const zonesPage2 = [
    {
      id: 'zone_51',
      name: 'site-51.com',
      status: 'active',
      name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
      account: { id: 'cf_acc_source_01', name: 'CF Account 1' },
    },
    {
      id: 'zone_52',
      name: 'site-52.com',
      status: 'active',
      name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
      account: { id: 'cf_acc_source_01', name: 'CF Account 1' },
    },
  ];

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('turnstile')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // Cloudflare endpoints
    if (url.includes('api.cloudflare.com/client/v4/user/tokens/verify')) {
      return new Response(JSON.stringify(CF_FIXTURES.verifyToken), { status: 200 });
    }
    if (url.includes('/registrar/domains')) {
      return new Response(JSON.stringify(CF_FIXTURES.registrarDomains), { status: 200 });
    }
    if (url.includes('/workers/domains')) {
      return new Response(JSON.stringify(CF_FIXTURES.workersDomains), { status: 200 });
    }
    if (url.includes('api.cloudflare.com/client/v4/accounts')) {
      return new Response(JSON.stringify(CF_FIXTURES.accounts), { status: 200 });
    }
    if (url.includes('api.cloudflare.com/client/v4/zones?')) {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get('page') ?? '1');
      const items = page === 1 ? zonesPage1 : zonesPage2;
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: items,
          result_info: { page, per_page: 50, total_pages: 2, count: items.length, total_count: 52 },
        }),
        { status: 200 },
      );
    }
    if (url.match(/\/zones\/[^/]+$/)) {
      return new Response(
        JSON.stringify({
          success: true,
          result: zonesPage1[0],
        }),
        { status: 200 },
      );
    }
    if (url.includes('/dns_records/export')) {
      return new Response(';; BIND Export\nexample-registrar.com.\t1\tIN\tA\t192.0.2.10\n', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }
    if (url.includes('/dns_records')) {
      return new Response(JSON.stringify(CF_FIXTURES.dnsRecords), { status: 200 });
    }
    if (url.includes('/settings')) {
      return new Response(JSON.stringify(CF_FIXTURES.zoneSettings), { status: 200 });
    }
    if (url.includes('/dnssec')) {
      return new Response(JSON.stringify(CF_FIXTURES.dnssecStatus), { status: 200 });
    }
    if (url.includes('/email/routing')) {
      return new Response(JSON.stringify(CF_FIXTURES.emailRouting), { status: 200 });
    }
    if (url.includes('/workers/domains')) {
      return new Response(JSON.stringify(CF_FIXTURES.workersDomains), { status: 200 });
    }
    if (url.includes('api.cloudflare.com/client/v4/graphql')) {
      const requestsCount = opts?.cfUsageRequestsToday ?? 85_000;
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [
                    {
                      sum: {
                        requests: requestsCount,
                        errors: 12,
                        subrequests: 120_000,
                      },
                    },
                  ],
                },
              ],
            },
          },
          errors: null,
        }),
        { status: 200 },
      );
    }

    // Vercel endpoints
    if (url.includes('api.vercel.com/v2/user')) {
      return new Response(JSON.stringify(VERCEL_FIXTURES.user), { status: 200 });
    }
    if (url.includes('api.vercel.com/v2/teams')) {
      return new Response(JSON.stringify(VERCEL_FIXTURES.teamsPro), { status: 200 });
    }
    if (url.includes('api.vercel.com/v10/projects/prj_vercel_01/env') || url.includes('/env')) {
      return new Response(JSON.stringify(VERCEL_FIXTURES.projectEnvs), { status: 200 });
    }
    if (url.includes('/domains')) {
      return new Response(JSON.stringify(VERCEL_FIXTURES.projectDomains), { status: 200 });
    }
    if (url.includes('/v9/projects/prj_vercel_01')) {
      return new Response(JSON.stringify(VERCEL_FIXTURES.projects.projects[0]), { status: 200 });
    }
    if (url.includes('/v9/projects')) {
      return new Response(JSON.stringify(VERCEL_FIXTURES.projects), { status: 200 });
    }
    if (url.includes('/v6/deployments')) {
      return new Response(JSON.stringify(VERCEL_FIXTURES.deployments), { status: 200 });
    }

    // Supabase endpoints
    if (url.endsWith('api.supabase.com/v1/organizations')) {
      return new Response(JSON.stringify(SUPABASE_FIXTURES.organizations), { status: 200 });
    }
    if (url.endsWith('api.supabase.com/v1/projects')) {
      return new Response(JSON.stringify(SUPABASE_FIXTURES.projects), { status: 200 });
    }
    if (url.includes('/v1/projects/ref_sb_active_01') && !url.includes('/')) {
      return new Response(JSON.stringify(SUPABASE_FIXTURES.projects[0]), { status: 200 });
    }
    if (url.includes('/pause') || url.includes('/restore')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes('/functions')) {
      return new Response(JSON.stringify(SUPABASE_FIXTURES.edgeFunctions), { status: 200 });
    }
    if (url.includes('/secrets')) {
      return new Response(JSON.stringify(SUPABASE_FIXTURES.secrets), { status: 200 });
    }
    if (url.includes('/database/query')) {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      if (bodyStr.includes('pg_database_size')) {
        return new Response(JSON.stringify(SUPABASE_FIXTURES.dbSizeQuery), { status: 200 });
      }
      if (bodyStr.includes('pg_extension')) {
        return new Response(JSON.stringify(SUPABASE_FIXTURES.extensionsQuery), { status: 200 });
      }
      return new Response(JSON.stringify(SUPABASE_FIXTURES.tableCountsQuery), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
};

describe('M2 Provider Accounts, Chunked Inventory Sync, Resources, Usage & Snapshots (T-046..T-049, T-070, T-071)', () => {
  it('creates accounts without leaking tokens, syncs >50 zones across cursor chunks, queries resources, pauses/restores Supabase project, computes usage, and exports redacted snapshots', async () => {
    const { db } = await createInMemoryDatabase();
    const deps = createDefaultDeps(
      { ADMIN_EMAILS: 'admin@example.com' },
      { db, fetchFn: createMockProviderFetch({ cfUsageRequestsToday: 105_000 }) },
    );
    await deps.authService.seedAdmin({
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    const app = createApp(deps);

    const loginRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'AdminPassword123!',
      }),
    });
    const cookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    // 1. Create Cloudflare, Vercel, and Supabase accounts (T-046)
    const cfCreateRes = await app.request(`${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        provider: PROVIDER.CLOUDFLARE,
        label: 'CF Primary',
        apiToken: 'cf_secret_token_abcd1234',
      }),
    });
    expect(cfCreateRes.status).toBe(HTTP_STATUS.CREATED);
    const cfCreateJson = (await cfCreateRes.json()) as {
      data: { id: string; tokenLast4: string; apiToken?: string };
    };
    expect(cfCreateJson.data.tokenLast4).toBe('1234');
    expect(cfCreateJson.data.apiToken).toBeUndefined();
    const cfAccountId = cfCreateJson.data.id;

    const vercelCreateRes = await app.request(`${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        provider: PROVIDER.VERCEL,
        label: 'Vercel Team 1',
        apiToken: 'vercel_secret_token_9876',
      }),
    });
    expect(vercelCreateRes.status).toBe(HTTP_STATUS.CREATED);
    const vercelAccountId = ((await vercelCreateRes.json()) as { data: { id: string } }).data.id;

    const sbCreateRes = await app.request(`${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        provider: PROVIDER.SUPABASE,
        label: 'Supabase Account 1',
        apiToken: 'sbp_secret_token_5555',
      }),
    });
    expect(sbCreateRes.status).toBe(HTTP_STATUS.CREATED);
    const sbAccountId = ((await sbCreateRes.json()) as { data: { id: string } }).data.id;

    // 2. Chunked sync across >50 zones (T-047)
    const sync1Res = await app.request(
      `${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}/${cfAccountId}/sync`,
      {
        method: 'POST',
        headers: { cookie },
      },
    );
    expect(sync1Res.status).toBe(HTTP_STATUS.OK);
    const sync1Data = (
      (await sync1Res.json()) as {
        data: { syncedCount: number; nextCursor: string | null };
      }
    ).data;
    expect(sync1Data.syncedCount).toBeGreaterThanOrEqual(50);
    expect(sync1Data.nextCursor).toBe('2');

    const sync2Res = await app.request(
      `${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}/${cfAccountId}/sync?cursor=${sync1Data.nextCursor}`,
      {
        method: 'POST',
        headers: { cookie },
      },
    );
    const sync2Data = (
      (await sync2Res.json()) as {
        data: { syncedCount: number; nextCursor: string | null };
      }
    ).data;
    expect(sync2Data.syncedCount).toBeGreaterThanOrEqual(2);
    expect(sync2Data.nextCursor).toBeNull();

    // Sync Vercel & Supabase accounts
    await app.request(`${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}/${vercelAccountId}/sync`, {
      method: 'POST',
      headers: { cookie },
    });
    await app.request(`${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}/${sbAccountId}/sync`, {
      method: 'POST',
      headers: { cookie },
    });

    // 3. Query resources & test pause/restore on Supabase project (T-048)
    const zonesListRes = await app.request(
      `${API_PREFIX}${API_ROUTES.RESOURCES}?kind=${RESOURCE_KIND.ZONE}&limit=100`,
      { headers: { cookie } },
    );
    const zonesList = (
      (await zonesListRes.json()) as {
        data: Array<{ id: string; name: string; data: Record<string, unknown> }>;
      }
    ).data;
    expect(zonesList.length).toBe(52);
    const registrarZone = zonesList.find((z) => z.name === 'example-registrar.com')!;
    expect(registrarZone.data.registrar).toBe(true);

    const sbResourcesRes = await app.request(
      `${API_PREFIX}${API_ROUTES.RESOURCES}?kind=${RESOURCE_KIND.SUPABASE_PROJECT}`,
      { headers: { cookie } },
    );
    const sbProjects = (
      (await sbResourcesRes.json()) as {
        data: Array<{ id: string; name: string; data: Record<string, unknown> }>;
      }
    ).data;
    expect(sbProjects.length).toBe(2);

    const activeSbProject = sbProjects[0]!;
    const pauseRes = await app.request(
      `${API_PREFIX}${API_ROUTES.RESOURCES}/${activeSbProject.id}/pause`,
      {
        method: 'POST',
        headers: { cookie },
      },
    );
    expect(pauseRes.status).toBe(HTTP_STATUS.OK);
    const pausedDto = ((await pauseRes.json()) as { data: { data: { status: string } } }).data;
    expect(pausedDto.data.status).toBe('INACTIVE');

    const restoreRes = await app.request(
      `${API_PREFIX}${API_ROUTES.RESOURCES}/${activeSbProject.id}/restore`,
      {
        method: 'POST',
        headers: { cookie },
      },
    );
    expect(restoreRes.status).toBe(HTTP_STATUS.OK);

    // 4. Usage computation & quota_exceeded status (T-049)
    const cfUsageRes = await app.request(
      `${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}/${cfAccountId}/usage`,
      { headers: { cookie } },
    );
    expect(cfUsageRes.status).toBe(HTTP_STATUS.OK);
    const cfUsage = (
      (await cfUsageRes.json()) as {
        data: { account: { status: string }; metrics: Array<{ ratio: number }> };
      }
    ).data;
    expect(cfUsage.metrics[0]!.ratio).toBeGreaterThanOrEqual(1);
    expect(cfUsage.account.status).toBe(ACCOUNT_STATUS.QUOTA_EXCEEDED);

    const sbUsageRes = await app.request(
      `${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}/${sbAccountId}/usage`,
      { headers: { cookie } },
    );
    const sbUsage = (
      (await sbUsageRes.json()) as {
        data: { account: { status: string }; metrics: Array<{ ratio: number }> };
      }
    ).data;
    expect(sbUsage.account.status).toBe(ACCOUNT_STATUS.QUOTA_EXCEEDED);

    // 5. Snapshots service: redacts secrets & exports BIND (T-071)
    const vercelResList = await app.request(
      `${API_PREFIX}${API_ROUTES.RESOURCES}?kind=${RESOURCE_KIND.VERCEL_PROJECT}`,
      { headers: { cookie } },
    );
    const vercelProject = ((await vercelResList.json()) as { data: Array<{ id: string }> })
      .data[0]!;

    const projSnapRes = await app.request(`${API_PREFIX}${API_ROUTES.SNAPSHOTS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ resourceId: vercelProject.id }),
    });
    expect(projSnapRes.status).toBe(HTTP_STATUS.CREATED);
    const projSnap = (
      (await projSnapRes.json()) as {
        data: {
          id: string;
          payload: {
            envVars: Array<{
              key: string;
              value?: string;
              encryptedValue?: string;
              redactedValue?: string;
            }>;
          };
        };
      }
    ).data;
    for (const envVar of projSnap.payload.envVars) {
      expect(envVar.value).toBeUndefined();
      expect(envVar.encryptedValue).toBeUndefined();
      expect(envVar.redactedValue).toBe('******');
    }

    // Zone snapshot + BIND download
    const zoneSnapRes = await app.request(`${API_PREFIX}${API_ROUTES.SNAPSHOTS}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ resourceId: registrarZone.id }),
    });
    const zoneSnapId = ((await zoneSnapRes.json()) as { data: { id: string } }).data.id;

    const bindRes = await app.request(`${API_PREFIX}${API_ROUTES.SNAPSHOTS}/${zoneSnapId}/bind`, {
      headers: { cookie },
    });
    expect(bindRes.status).toBe(HTTP_STATUS.OK);
    const bindText = await bindRes.text();
    expect(bindText).toContain(';; BIND Export');
  });
});
