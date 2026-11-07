import { TURNSTILE_TEST_KEYS } from '@freetier-loop/shared';
import { describe, expect, it } from 'vitest';
import { parseWebEnv } from '../config/env';
import { queryKeys } from '../lib/query-keys';
import { createApiClient } from '../lib/rpc';

describe('@freetier-loop/web skeleton', () => {
  it('parses default web environment with Turnstile test site key', () => {
    const env = parseWebEnv({});
    expect(env.VITE_API_BASE_URL).toBe('/');
    expect(env.VITE_TURNSTILE_SITE_KEY).toBe(TURNSTILE_TEST_KEYS.ALWAYS_PASS_SITE_KEY);
  });

  it('builds deterministic query keys', () => {
    expect(queryKeys.providerAccounts.detail('pa_123')).toEqual(['provider-accounts', 'pa_123']);
  });

  it('creates typed Hono RPC client', () => {
    const client = createApiClient('http://localhost:8787');
    expect(typeof client.api.v1.health.$get).toBe('function');
  });
});
