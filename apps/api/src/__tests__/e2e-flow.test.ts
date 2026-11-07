import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  API_PREFIX,
  API_ROUTES,
  AUTH_PREFIX,
  HEADER,
  HTTP_STATUS,
  JOB_STATUS,
  MIGRATION_TEMPLATE,
  PROVIDER,
  STEP_STATUS,
} from '@freetier-loop/shared';
import { describe, expect, it } from 'vitest';
import {
  exportSqliteDatabase,
  restoreSqliteDatabase,
} from '../../../../packages/db/scripts/backup-d1';
import { createNodeRuntimeApp } from '../entries/node';
import { CF_FIXTURES } from '../providers/cloudflare/__fixtures__/cloudflare.fixtures';

function createMockFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
    return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
  }) as typeof fetch;
}

describe('E2E User Journey & Node Portability + Backup/Restore (T-111, T-112, T-114)', () => {
  it('completes login -> add accounts -> sync -> dry-run migration -> complete -> D1 SQLite backup & restore', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'freetier-e2e-'));
    const sqlitePath = join(tempDir, 'primary.sqlite');
    const restoredPath = join(tempDir, 'restored.sqlite');

    try {
      const nodeRuntime = await createNodeRuntimeApp({
        dbPath: sqlitePath,
        fetchFn: createMockFetch(),
        env: {
          ADMIN_EMAILS: 'admin@example.com',
          BETTER_AUTH_SECRET: '0123456789abcdef0123456789abcdef',
          BETTER_AUTH_URL: 'http://localhost:8787',
          ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
          TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
          VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
        },
      });

      await nodeRuntime.deps.authService.seedAdmin({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!9',
      });

      // 1. Login via Turnstile + email/password
      const loginRes = await nodeRuntime.app.request(`${AUTH_PREFIX}/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [HEADER.CAPTCHA]: 'XXXX.DUMMY.TOKEN.XXXX',
        },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'CorrectHorseBatteryStaple!9',
        }),
      });
      expect(loginRes.status).toBe(HTTP_STATUS.OK);
      const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';
      expect(sessionCookie).toContain('better-auth.session_token=');

      // 2. Add source and target Cloudflare accounts
      const srcAccRes = await nodeRuntime.app.request(
        `${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: sessionCookie,
          },
          body: JSON.stringify({
            provider: PROVIDER.CLOUDFLARE,
            label: 'CF Source Account',
            apiToken: 'cf_source_secret_token_123456',
          }),
        },
      );
      expect(srcAccRes.status).toBe(HTTP_STATUS.CREATED);
      const srcAcc = ((await srcAccRes.json()) as { data: { id: string } }).data;

      const dstAccRes = await nodeRuntime.app.request(
        `${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: sessionCookie,
          },
          body: JSON.stringify({
            provider: PROVIDER.CLOUDFLARE,
            label: 'CF Target Account',
            apiToken: 'cf_target_secret_token_654321',
          }),
        },
      );
      expect(dstAccRes.status).toBe(HTTP_STATUS.CREATED);
      const dstAcc = ((await dstAccRes.json()) as { data: { id: string } }).data;

      // 3. Sync inventory on source account
      const syncRes = await nodeRuntime.app.request(
        `${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}/${srcAcc.id}/sync`,
        {
          method: 'POST',
          headers: {
            cookie: sessionCookie,
          },
        },
      );
      expect(syncRes.status).toBe(HTTP_STATUS.OK);

      const resourcesRes = await nodeRuntime.app.request(`${API_PREFIX}${API_ROUTES.RESOURCES}`, {
        headers: { cookie: sessionCookie },
      });
      const resourcesBody = (await resourcesRes.json()) as {
        data: Array<{ id: string; name: string }>;
      };
      const zoneResource = resourcesBody.data.find((r) => r.name === 'example-registrar.com');
      expect(zoneResource).toBeDefined();
      if (!zoneResource) {
        throw new Error('Expected zoneResource to be defined');
      }

      // 4. Create migration job -> dry-run plan -> confirm -> advance to completion
      const createJobRes = await nodeRuntime.app.request(`${API_PREFIX}${API_ROUTES.JOBS}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          template: MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE,
          sourceAccountId: srcAcc.id,
          targetAccountId: dstAcc.id,
          resourceId: zoneResource.id,
          dryRun: false,
          params: {},
        }),
      });
      expect(createJobRes.status).toBe(HTTP_STATUS.CREATED);
      const createdJob = ((await createJobRes.json()) as { data: { id: string; status: string } })
        .data;

      const planRes = await nodeRuntime.app.request(
        `${API_PREFIX}${API_ROUTES.JOBS}/${createdJob.id}/plan`,
        {
          method: 'POST',
          headers: { cookie: sessionCookie },
        },
      );
      expect(planRes.status).toBe(HTTP_STATUS.OK);
      const plannedJob = ((await planRes.json()) as { data: { status: string } }).data;
      expect(plannedJob.status).toBe(JOB_STATUS.PLANNED);

      const confirmRes = await nodeRuntime.app.request(
        `${API_PREFIX}${API_ROUTES.JOBS}/${createdJob.id}/confirm`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: sessionCookie,
          },
          body: JSON.stringify({ confirm: 'example-registrar.com' }),
        },
      );
      expect(confirmRes.status).toBe(HTTP_STATUS.OK);

      // Advance until manual step, provide manual confirmation, then finish
      for (let i = 0; i < 10; i++) {
        const adv = await nodeRuntime.app.request(
          `${API_PREFIX}${API_ROUTES.JOBS}/${createdJob.id}/advance`,
          {
            method: 'POST',
            headers: { cookie: sessionCookie },
          },
        );
        const body = (await adv.json()) as {
          data: { status: string; steps: Array<{ id: string; status: string }> };
        };
        if (body.data.status === JOB_STATUS.WAITING_MANUAL) {
          const waitingStep = body.data.steps.find((s) => s.status === STEP_STATUS.WAITING_MANUAL);
          if (waitingStep) {
            await nodeRuntime.app.request(
              `${API_PREFIX}${API_ROUTES.JOBS}/${createdJob.id}/steps/${waitingStep.id}/manual-input`,
              {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  cookie: sessionCookie,
                },
                body: JSON.stringify({
                  values: { confirmed: 'true' },
                }),
              },
            );
          }
        }
        if (body.data.status === JOB_STATUS.COMPLETED) {
          break;
        }
      }

      const finalJobRes = await nodeRuntime.app.request(
        `${API_PREFIX}${API_ROUTES.JOBS}/${createdJob.id}`,
        {
          headers: { cookie: sessionCookie },
        },
      );
      const finalJob = ((await finalJobRes.json()) as { data: { status: string } }).data;
      expect(finalJob.status).toBe(JOB_STATUS.COMPLETED);

      // 5. Verify D1 / SQLite backup & restore (T-114)
      const dump = exportSqliteDatabase(sqlitePath);
      expect(dump.tableCount).toBeGreaterThanOrEqual(10);
      expect(dump.rowCount).toBeGreaterThan(5);

      restoreSqliteDatabase(restoredPath, dump.sql);
      const restoredDump = exportSqliteDatabase(restoredPath);
      expect(restoredDump.tableCount).toBe(dump.tableCount);
      expect(restoredDump.rowCount).toBe(dump.rowCount);
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore Windows file lock cleanup delay
      }
    }
  });
});
