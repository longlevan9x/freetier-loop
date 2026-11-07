export const RESOURCE_KIND = {
  ZONE: 'zone',
  DNS_RECORD: 'dns_record',
  WORKER: 'worker',
  PAGES_PROJECT: 'pages_project',
  VERCEL_PROJECT: 'vercel_project',
  PROJECT_DOMAIN: 'project_domain',
  ENV_VAR: 'env_var',
  SUPABASE_PROJECT: 'supabase_project',
  EDGE_FUNCTION: 'edge_function',
} as const;

export type ResourceKind = (typeof RESOURCE_KIND)[keyof typeof RESOURCE_KIND];
export const RESOURCE_KIND_VALUES = Object.values(RESOURCE_KIND) as [
  ResourceKind,
  ...ResourceKind[],
];

export const DNS_RECORD_TYPE = {
  A: 'A',
  AAAA: 'AAAA',
  CNAME: 'CNAME',
  TXT: 'TXT',
  MX: 'MX',
  NS: 'NS',
  SRV: 'SRV',
  CAA: 'CAA',
} as const;

export type DnsRecordType = (typeof DNS_RECORD_TYPE)[keyof typeof DNS_RECORD_TYPE];
export const DNS_RECORD_TYPE_VALUES = Object.values(DNS_RECORD_TYPE) as [
  DnsRecordType,
  ...DnsRecordType[],
];

export const ZONE_STATUS = {
  ACTIVE: 'active',
  PENDING: 'pending',
  INITIALIZING: 'initializing',
  MOVED: 'moved',
  DELETED: 'deleted',
} as const;

export type ZoneStatus = (typeof ZONE_STATUS)[keyof typeof ZONE_STATUS];
export const ZONE_STATUS_VALUES = Object.values(ZONE_STATUS) as [ZoneStatus, ...ZoneStatus[]];

export const SUPABASE_PROJECT_STATUS = {
  ACTIVE_HEALTHY: 'ACTIVE_HEALTHY',
  INACTIVE: 'INACTIVE',
  COMING_UP: 'COMING_UP',
  GOING_DOWN: 'GOING_DOWN',
  PAUSING: 'PAUSING',
  RESTORING: 'RESTORING',
} as const;

export type SupabaseProjectStatus =
  (typeof SUPABASE_PROJECT_STATUS)[keyof typeof SUPABASE_PROJECT_STATUS];
export const SUPABASE_PROJECT_STATUS_VALUES = Object.values(SUPABASE_PROJECT_STATUS) as [
  SupabaseProjectStatus,
  ...SupabaseProjectStatus[],
];

export const USAGE_METRIC = {
  WORKERS_REQUESTS: 'workers_requests',
  D1_READS: 'd1_reads',
  D1_WRITES: 'd1_writes',
  VERCEL_DEPLOYMENTS: 'vercel_deployments',
  SUPABASE_ACTIVE_PROJECTS: 'supabase_active_projects',
  SUPABASE_DB_BYTES: 'supabase_db_bytes',
} as const;

export type UsageMetric = (typeof USAGE_METRIC)[keyof typeof USAGE_METRIC];
export const USAGE_METRIC_VALUES = Object.values(USAGE_METRIC) as [UsageMetric, ...UsageMetric[]];
