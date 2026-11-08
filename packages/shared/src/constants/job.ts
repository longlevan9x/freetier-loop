export const JOB_STATUS = {
  DRAFT: 'draft',
  PLANNED: 'planned',
  RUNNING: 'running',
  WAITING_MANUAL: 'waiting_manual',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export const JOB_STATUS_VALUES = Object.values(JOB_STATUS) as [JobStatus, ...JobStatus[]];

export const STEP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  WAITING_MANUAL: 'waiting_manual',
} as const;

export type StepStatus = (typeof STEP_STATUS)[keyof typeof STEP_STATUS];
export const STEP_STATUS_VALUES = Object.values(STEP_STATUS) as [StepStatus, ...StepStatus[]];

export const JOB_EVENT_LEVEL = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export type JobEventLevel = (typeof JOB_EVENT_LEVEL)[keyof typeof JOB_EVENT_LEVEL];
export const JOB_EVENT_LEVEL_VALUES = Object.values(JOB_EVENT_LEVEL) as [
  JobEventLevel,
  ...JobEventLevel[],
];

export const MIGRATION_TEMPLATE = {
  CF_REGISTRAR_DOMAIN_MOVE: 'CF_REGISTRAR_DOMAIN_MOVE',
  CF_ZONE_MOVE: 'CF_ZONE_MOVE',
  CF_WORKER_MOVE: 'CF_WORKER_MOVE',
  VERCEL_PROJECT_TRANSFER: 'VERCEL_PROJECT_TRANSFER',
  VERCEL_PROJECT_RECREATE: 'VERCEL_PROJECT_RECREATE',
  VERCEL_DOMAIN_MOVE: 'VERCEL_DOMAIN_MOVE',
  SUPABASE_ORG_TRANSFER: 'SUPABASE_ORG_TRANSFER',
  SUPABASE_PROJECT_RECREATE: 'SUPABASE_PROJECT_RECREATE',
  DNS_REPOINT: 'DNS_REPOINT',
  ENV_REWIRE: 'ENV_REWIRE',
  VERCEL_GITLAB_CUTOVER: 'VERCEL_GITLAB_CUTOVER',
  VERCEL_GITHUB_CUTOVER: 'VERCEL_GITHUB_CUTOVER',
} as const;

export type MigrationTemplate = (typeof MIGRATION_TEMPLATE)[keyof typeof MIGRATION_TEMPLATE];
export const MIGRATION_TEMPLATE_VALUES = Object.values(MIGRATION_TEMPLATE) as [
  MigrationTemplate,
  ...MigrationTemplate[],
];

export const MIGRATION_TEMPLATE_LABEL: Record<MigrationTemplate, string> = {
  [MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE]: 'Move Cloudflare Registrar Domain',
  [MIGRATION_TEMPLATE.CF_ZONE_MOVE]: 'Move Cloudflare Zone (External Registrar)',
  [MIGRATION_TEMPLATE.CF_WORKER_MOVE]: 'Move Cloudflare Worker',
  [MIGRATION_TEMPLATE.VERCEL_PROJECT_TRANSFER]: 'Transfer Vercel Project (Team)',
  [MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE]: 'Recreate Vercel Project (Hobby / Cross-Account)',
  [MIGRATION_TEMPLATE.VERCEL_DOMAIN_MOVE]: 'Move Vercel Domain',
  [MIGRATION_TEMPLATE.SUPABASE_ORG_TRANSFER]: 'Transfer Supabase Project Between Orgs',
  [MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE]: 'Recreate Supabase Project (Cross-Account)',
  [MIGRATION_TEMPLATE.DNS_REPOINT]: 'Repoint DNS Records',
  [MIGRATION_TEMPLATE.ENV_REWIRE]: 'Rewire Environment Variables',
  [MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER]: 'Vercel + GitLab Full Cutover (Domain, Rules, CI/CD)',
  [MIGRATION_TEMPLATE.VERCEL_GITHUB_CUTOVER]: 'Vercel + GitHub Full Cutover (Domain, Rules, CI/CD)',
};
