export const PROVIDER = {
  CLOUDFLARE: 'cloudflare',
  VERCEL: 'vercel',
  SUPABASE: 'supabase',
  GITLAB: 'gitlab',
} as const;

export type Provider = (typeof PROVIDER)[keyof typeof PROVIDER];
export const PROVIDER_VALUES = Object.values(PROVIDER) as [Provider, ...Provider[]];

export const PROVIDER_LABEL: Record<Provider, string> = {
  [PROVIDER.CLOUDFLARE]: 'Cloudflare',
  [PROVIDER.VERCEL]: 'Vercel',
  [PROVIDER.SUPABASE]: 'Supabase',
  [PROVIDER.GITLAB]: 'GitLab',
};

export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  QUOTA_EXCEEDED: 'quota_exceeded',
  DISABLED: 'disabled',
  INVALID: 'invalid',
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];
export const ACCOUNT_STATUS_VALUES = Object.values(ACCOUNT_STATUS) as [
  AccountStatus,
  ...AccountStatus[],
];

export const VERCEL_ACCOUNT_TYPE = {
  HOBBY: 'hobby',
  TEAM: 'team',
} as const;

export type VercelAccountType = (typeof VERCEL_ACCOUNT_TYPE)[keyof typeof VERCEL_ACCOUNT_TYPE];
export const VERCEL_ACCOUNT_TYPE_VALUES = Object.values(VERCEL_ACCOUNT_TYPE) as [
  VercelAccountType,
  ...VercelAccountType[],
];

export const GITLAB_TOKEN_TYPE = {
  PROJECT: 'project',
  USER: 'user',
} as const;

export type GitLabTokenType = (typeof GITLAB_TOKEN_TYPE)[keyof typeof GITLAB_TOKEN_TYPE];
export const GITLAB_TOKEN_TYPE_VALUES = Object.values(GITLAB_TOKEN_TYPE) as [
  GitLabTokenType,
  ...GitLabTokenType[],
];

export const ACCOUNT_TYPE = {
  ...VERCEL_ACCOUNT_TYPE,
  ...GITLAB_TOKEN_TYPE,
} as const;

export const ACCOUNT_TYPE_VALUES = [
  ...VERCEL_ACCOUNT_TYPE_VALUES,
  ...GITLAB_TOKEN_TYPE_VALUES,
] as const;

export type AccountType = (typeof ACCOUNT_TYPE_VALUES)[number];

export const CAPABILITY = {
  ACCOUNT_VERIFIER: 'account_verifier',
  ZONES: 'zones',
  REGISTRAR_DOMAINS: 'registrar_domains',
  DNS_RECORDS: 'dns_records',
  PROJECTS: 'projects',
  PROJECT_DOMAINS: 'project_domains',
  ENV_VARS: 'env_vars',
  EDGE_FUNCTIONS: 'edge_functions',
  SQL_QUERY: 'sql_query',
  USAGE: 'usage',
  GITLAB_VARIABLES: 'gitlab_variables',
} as const;

export type Capability = (typeof CAPABILITY)[keyof typeof CAPABILITY];
export const CAPABILITY_VALUES = Object.values(CAPABILITY) as [Capability, ...Capability[]];
