import { API_PREFIX, API_ROUTES, ERROR_CODE, HEADER, HTTP_STATUS } from '@freetier-loop/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDefaultDeps } from '../platform/deps';

describe('@freetier-loop/api app skeleton', () => {
  it('responds 200 OK on GET /api/v1/health with standard envelope and security headers', async () => {
    const fixedNow = 1_730_000_000_000;
    const deps = createDefaultDeps(
      {},
      {
        clock: { nowMs: () => fixedNow },
      },
    );
    const app = createApp(deps);

    const res = await app.request(`${API_PREFIX}${API_ROUTES.HEALTH}`, {
      headers: { [HEADER.REQUEST_ID]: 'req-test-123' },
    });

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.headers.get(HEADER.REQUEST_ID)).toBe('req-test-123');
    expect(res.headers.get('content-security-policy')).toContain('challenges.cloudflare.com');

    const json = await res.json();
    expect(json).toEqual({
      data: {
        status: 'ok',
        timestamp: fixedNow,
      },
    });
  });

  it('returns standard error envelope on 404 Not Found', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/does-not-exist');

    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    const json = (await res.json()) as { error: { code: string; requestId: string } };
    expect(json.error.code).toBe(ERROR_CODE.NOT_FOUND);
    expect(typeof json.error.requestId).toBe('string');
  });
});
