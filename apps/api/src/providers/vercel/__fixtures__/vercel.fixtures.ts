export const VERCEL_FIXTURES = {
  user: {
    user: {
      id: 'usr_vercel_01',
      email: 'owner@example.com',
      name: 'Vercel Owner',
      username: 'vercelowner',
    },
  },
  teamsEmpty: {
    teams: [],
    pagination: { count: 0, next: null, prev: null },
  },
  teamsPro: {
    teams: [
      {
        id: 'team_pro_01',
        slug: 'pro-team',
        name: 'Pro Team',
        billing: { plan: 'pro' },
      },
    ],
    pagination: { count: 1, next: null, prev: null },
  },
  projects: {
    projects: [
      {
        id: 'prj_vercel_01',
        name: 'marketing-web',
        framework: 'nextjs',
        buildCommand: 'pnpm build',
        outputDirectory: '.next',
        installCommand: 'pnpm install',
        rootDirectory: null,
        link: {
          type: 'github',
          repo: 'acme/marketing-web',
          repoId: 101010,
          org: 'acme',
          productionBranch: 'main',
        },
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_050_000_000,
      },
    ],
    pagination: { count: 1, next: null, prev: null },
  },
  projectDomains: {
    domains: [
      {
        name: 'app.example-registrar.com',
        apexName: 'example-registrar.com',
        projectId: 'prj_vercel_01',
        verified: true,
        gitBranch: null,
        redirect: null,
        redirectStatusCode: null,
      },
    ],
    pagination: { count: 1, next: null, prev: null },
  },
  projectEnvs: {
    envs: [
      {
        id: 'env_plain_01',
        key: 'NEXT_PUBLIC_SUPABASE_URL',
        value: 'https://oldref.supabase.co',
        type: 'plain',
        target: ['production', 'preview', 'development'],
      },
      {
        id: 'env_enc_01',
        key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.oldanon',
        type: 'encrypted',
        target: ['production', 'preview'],
      },
      {
        id: 'env_sec_01',
        key: 'SUPABASE_SERVICE_ROLE_KEY',
        value: '',
        type: 'sensitive',
        target: ['production'],
      },
    ],
  },
  transferRequest: {
    code: 'vtr_transfer_code_123456',
  },
  deployments: {
    deployments: [
      {
        uid: 'dpl_01',
        name: 'marketing-web',
        url: 'marketing-web-abc.vercel.app',
        state: 'READY',
        created: 1_730_000_000_000,
      },
    ],
    pagination: { count: 1, next: null, prev: null },
  },
} as const;
