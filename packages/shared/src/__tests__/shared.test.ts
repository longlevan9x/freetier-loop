import { describe, expect, it } from 'vitest';
import {
  ERROR_CODE,
  HTTP_STATUS,
  ID_PREFIX,
  MIGRATION_TEMPLATE,
  PROVIDER,
  PROVIDER_VALUES,
} from '../constants/index';
import { AppError, errResult, newId, okResult } from '../lib/index';
import { createProviderAccountSchema, ok } from '../schemas/index';

describe('@freetier-loop/shared', () => {
  it('exposes provider constants including cloudflare, vercel, and supabase', () => {
    expect(PROVIDER_VALUES).toEqual([PROVIDER.CLOUDFLARE, PROVIDER.VERCEL, PROVIDER.SUPABASE]);
  });

  it('includes CF_REGISTRAR_DOMAIN_MOVE and SUPABASE templates', () => {
    expect(MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE).toBe('CF_REGISTRAR_DOMAIN_MOVE');
    expect(MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE).toBe('SUPABASE_PROJECT_RECREATE');
  });

  it('generates sortable prefixed IDs', () => {
    const id1 = newId(ID_PREFIX.PROVIDER_ACCOUNT, 1_700_000_000_000);
    const id2 = newId(ID_PREFIX.PROVIDER_ACCOUNT, 1_700_000_001_000);
    expect(id1.startsWith('pa_')).toBe(true);
    expect(id1.length).toBe(29);
    expect(id1 < id2).toBe(true);
  });

  it('wraps Result and success envelopes cleanly', () => {
    const r1 = okResult(42);
    const r2 = errResult('boom');
    expect(r1).toEqual({ ok: true, value: 42 });
    expect(r2).toEqual({ ok: false, error: 'boom' });
    expect(ok({ status: 'ok' })).toEqual({ data: { status: 'ok' } });
  });

  it('maps AppError default status codes', () => {
    const err = new AppError(ERROR_CODE.RESOURCE_SELF_PROTECTED, 'Cannot touch admin zone');
    expect(err.code).toBe(ERROR_CODE.RESOURCE_SELF_PROTECTED);
    expect(err.status).toBe(HTTP_STATUS.FORBIDDEN);
  });

  it('validates createProviderAccountSchema with Zod', () => {
    const parsed = createProviderAccountSchema.safeParse({
      provider: 'supabase',
      label: 'Supabase Free #1',
      apiToken: 'sbp_0123456789abcdef',
    });
    expect(parsed.success).toBe(true);
  });
});
