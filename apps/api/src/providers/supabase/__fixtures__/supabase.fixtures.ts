export const SUPABASE_FIXTURES = {
  organizations: [
    {
      id: 'org_sb_01',
      slug: 'org-free-01',
      name: 'Personal Free Org #1',
    },
  ],
  projects: [
    {
      id: 'ref_sb_active_01',
      ref: 'ref_sb_active_01',
      organization_id: 'org_sb_01',
      name: 'saas-prod-db',
      region: 'ap-southeast-1',
      created_at: '2026-01-10T00:00:00Z',
      status: 'ACTIVE_HEALTHY',
      database: {
        host: 'db.ref_sb_active_01.supabase.co',
        version: '15.8.1.044',
      },
    },
    {
      id: 'ref_sb_active_02',
      ref: 'ref_sb_active_02',
      organization_id: 'org_sb_01',
      name: 'staging-db',
      region: 'ap-southeast-1',
      created_at: '2026-02-15T00:00:00Z',
      status: 'ACTIVE_HEALTHY',
      database: {
        host: 'db.ref_sb_active_02.supabase.co',
        version: '15.8.1.044',
      },
    },
  ],
  apiKeys: [
    {
      name: 'anon',
      api_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new_anon_key',
    },
    {
      name: 'service_role',
      api_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new_service_role_key',
    },
  ],
  secrets: [
    {
      name: 'STRIPE_WEBHOOK_SECRET',
      value: 'sha256:digest_only_not_plaintext',
    },
  ],
  edgeFunctions: [
    {
      id: 'fn_01',
      slug: 'stripe-webhook',
      name: 'stripe-webhook',
      status: 'ACTIVE',
      version: 3,
      verify_jwt: false,
      entrypoint_path: 'index.ts',
    },
  ],
  edgeFunctionBody: "Deno.serve(async () => new Response('ok'));",
  dbSizeQuery: [{ db_bytes: 142_606_336 }],
  tableCountsQuery: [
    { schema_name: 'public', table_name: 'todos', row_count: 125 },
    { schema_name: 'auth', table_name: 'users', row_count: 42 },
  ],
  extensionsQuery: [{ extname: 'uuid-ossp' }, { extname: 'pgcrypto' }],
  transferPreview: {
    valid: true,
    warnings: [],
    errors: [],
  },
} as const;
