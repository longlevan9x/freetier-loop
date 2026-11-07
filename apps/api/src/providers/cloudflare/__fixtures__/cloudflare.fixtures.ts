export const CF_FIXTURES = {
  verifyToken: {
    success: true,
    errors: [],
    messages: [],
    result: {
      id: 'tok_cf_01',
      status: 'active',
    },
  },
  accounts: {
    success: true,
    errors: [],
    result: [
      {
        id: 'cf_acc_source_01',
        name: 'CF Free Account #1',
      },
    ],
    result_info: { page: 1, per_page: 50, total_pages: 1, count: 1, total_count: 1 },
  },
  zones: {
    success: true,
    errors: [],
    result: [
      {
        id: 'zone_registrar_01',
        name: 'example-registrar.com',
        status: 'active',
        name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
        account: { id: 'cf_acc_source_01', name: 'CF Free Account #1' },
      },
      {
        id: 'zone_external_01',
        name: 'example-external.com',
        status: 'active',
        name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
        account: { id: 'cf_acc_source_01', name: 'CF Free Account #1' },
      },
    ],
    result_info: { page: 1, per_page: 50, total_pages: 1, count: 2, total_count: 2 },
  },
  registrarDomains: {
    success: true,
    errors: [],
    result: [
      {
        id: 'reg_dom_01',
        name: 'example-registrar.com',
        current_registrar: 'Cloudflare',
        auto_renew: true,
        locked: true,
        expires_at: '2027-11-07T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      },
    ],
  },
  dnssecStatus: {
    success: true,
    errors: [],
    result: {
      status: 'disabled',
    },
  },
  dnsRecords: {
    success: true,
    errors: [],
    result: [
      {
        id: 'dns_rec_01',
        type: 'A',
        name: 'example-registrar.com',
        content: '76.76.21.21',
        ttl: 1,
        proxied: true,
      },
      {
        id: 'dns_rec_02',
        type: 'CNAME',
        name: 'app.example-registrar.com',
        content: 'cname.vercel-dns.com',
        ttl: 1,
        proxied: false,
      },
    ],
    result_info: { page: 1, per_page: 100, total_pages: 1, count: 2, total_count: 2 },
  },
  dnsBatchResult: {
    success: true,
    errors: [],
    result: {
      posts: [
        {
          id: 'dns_new_01',
          type: 'A',
          name: 'example-registrar.com',
          content: '76.76.21.21',
          ttl: 1,
          proxied: true,
        },
      ],
      patches: [],
      puts: [],
      deletes: [],
    },
  },
  zoneSettings: {
    success: true,
    errors: [],
    result: [
      { id: 'ssl', value: 'strict' },
      { id: 'always_use_https', value: 'on' },
      { id: 'min_tls_version', value: '1.2' },
      { id: 'automatic_https_rewrites', value: 'on' },
    ],
  },
  emailRouting: {
    success: true,
    errors: [],
    result: {
      enabled: false,
      name: 'example-registrar.com',
    },
  },
  workersDomains: {
    success: true,
    errors: [],
    result: [
      {
        id: 'wd_01',
        zone_id: 'zone_registrar_01',
        zone_name: 'example-registrar.com',
        hostname: 'api.example-registrar.com',
        service: 'my-api-worker',
        environment: 'production',
      },
    ],
  },
  graphqlUsage: {
    data: {
      viewer: {
        accounts: [
          {
            workersInvocationsAdaptive: [
              {
                sum: {
                  requests: 84_500,
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
  },
} as const;
