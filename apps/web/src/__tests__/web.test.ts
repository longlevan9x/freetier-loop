import { BENTO_SIZE, ERROR_CODE } from '@freetier-loop/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BentoCard } from '../components/bento/BentoCard';
import { BentoGrid } from '../components/bento/BentoGrid';
import { BentoSkeleton } from '../components/bento/BentoSkeleton';
import { BentoStat } from '../components/bento/BentoStat';
import { parseWebEnv } from '../config/env';
import { ERROR_MESSAGES, formatApiError } from '../lib/error-messages';
import { queryKeys } from '../lib/query-keys';
import { createApiClient } from '../lib/rpc';

describe('@freetier-loop/web Bento UI, Error Mapping & Typed RPC (T-037, T-060..T-065, T-074)', () => {
  it('parses web environment without hardcoded secret defaults', () => {
    const env = parseWebEnv({ VITE_TURNSTILE_SITE_KEY: 'site_key_from_env' });
    expect(env.VITE_API_BASE_URL).toBe('/');
    expect(env.VITE_TURNSTILE_SITE_KEY).toBe('site_key_from_env');
  });

  it('builds deterministic query keys across all features', () => {
    expect(queryKeys.providerAccounts.detail('pa_123')).toEqual(['provider-accounts', 'pa_123']);
    expect(queryKeys.resources.detail('res_456')).toEqual(['resources', 'detail', 'res_456']);
    expect(queryKeys.jobs.detail('job_789')).toEqual(['jobs', 'job_789']);
    expect(queryKeys.jobs.events('job_789')).toEqual(['jobs', 'job_789', 'events']);
  });

  it('maps shared ERROR_CODE values to human-friendly messages', () => {
    const msg = formatApiError({
      error: {
        code: ERROR_CODE.RESOURCE_SELF_PROTECTED,
        message: 'Self protected domain',
      },
    });
    expect(msg).toContain(ERROR_MESSAGES[ERROR_CODE.RESOURCE_SELF_PROTECTED]);
    expect(msg).toContain('Self protected domain');
  });

  it('renders BentoGrid, BentoCard, BentoStat, and BentoSkeleton cleanly', () => {
    const html = renderToStaticMarkup(
      createElement(
        BentoGrid,
        null,
        createElement(
          BentoCard,
          {
            title: 'Cloudflare Quota',
            subtitle: '100k/day limit',
            size: BENTO_SIZE.XL,
          },
          createElement(BentoStat, {
            label: 'Requests Today',
            value: '84,500',
            hint: '84.5% of free tier',
            trend: 'warning',
          }),
        ),
        createElement(
          BentoCard,
          {
            title: 'Loading Card',
            size: BENTO_SIZE.SM,
            loading: true,
          },
          createElement(BentoSkeleton, { lines: 3 }),
        ),
      ),
    );

    expect(html).toContain('Cloudflare Quota');
    expect(html).toContain('84,500');
    expect(html).toContain('col-span-1 md:col-span-4 row-span-2');
  });

  it('creates typed Hono RPC client with all v1 endpoints', () => {
    const client = createApiClient('http://localhost:8787');
    expect(typeof client.api.v1.health.$get).toBe('function');
    expect(typeof client.api.v1['provider-accounts'].$get).toBe('function');
    expect(typeof client.api.v1.resources.$get).toBe('function');
    expect(typeof client.api.v1.jobs.$post).toBe('function');
    expect(typeof client.api.v1.snapshots.$get).toBe('function');
    expect(typeof client.api.v1['audit-logs'].$get).toBe('function');
  });
});
