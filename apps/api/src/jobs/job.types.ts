import type { jobEvents, jobSteps, jobs } from '@freetier-loop/db';
import type {
  ErrorCode,
  JobEventLevel,
  MigrationTemplate,
  Provider,
  ResourceDto,
  ResourceKind,
  StepStatus,
} from '@freetier-loop/shared';
import type { DecryptableProviderAccount } from '../modules/provider-accounts/provider-accounts.repository';
import type { SnapshotsService } from '../modules/snapshots/snapshots.service';
import type { SecretCipher } from '../platform/crypto';
import type { ProviderContext } from '../providers/contracts';
import type { ProviderRegistry } from '../providers/registry';

export type JobRow = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;
export type JobStepRow = typeof jobSteps.$inferSelect;
export type JobStepInsert = typeof jobSteps.$inferInsert;
export type JobEventRow = typeof jobEvents.$inferSelect;
export type JobEventInsert = typeof jobEvents.$inferInsert;

export const STEP_TYPE = {
  PREFLIGHT_VERIFY_ACCOUNTS: 'preflight.verify-accounts',
  SNAPSHOT_RESOURCE: 'snapshot.resource',
  MANUAL_CONFIRM: 'manual.confirm',
  MANUAL_SECRET_INPUT: 'manual.secret-input',
  MANUAL_RUN_COMMAND: 'manual.run-command',
  WAIT_POLL: 'wait.poll',
  CF_CREATE_TARGET_ZONE: 'cf.create-target-zone',
  CF_DELETE_SOURCE_ZONE: 'cf.delete-source-zone',
  CF_BATCH_IMPORT_DNS: 'cf.batch-import-dns',
  CF_RESTORE_ZONE_SETTINGS: 'cf.restore-zone-settings',
  CF_REBIND_WORKER_DOMAINS: 'cf.rebind-worker-domains',
  CF_DEPLOY_WORKER: 'cf.deploy-worker',
  VERCEL_CREATE_PROJECT: 'vercel.create-project',
  VERCEL_UPSERT_ENV: 'vercel.upsert-env',
  VERCEL_MOVE_DOMAINS: 'vercel.move-domains',
  VERCEL_TRIGGER_DEPLOY: 'vercel.trigger-deploy',
  VERCEL_TRANSFER_REQUEST: 'vercel.transfer-request',
  VERCEL_TRANSFER_ACCEPT: 'vercel.transfer-accept',
  SUPABASE_ORG_TRANSFER: 'supabase.org-transfer',
  SUPABASE_CREATE_PROJECT: 'supabase.create-project',
  SUPABASE_VERIFY_ROW_COUNTS: 'supabase.verify-row-counts',
  SUPABASE_DEPLOY_FUNCTIONS: 'supabase.deploy-functions',
  SUPABASE_UPSERT_SECRETS: 'supabase.upsert-secrets',
  SUPABASE_PAUSE_SOURCE: 'supabase.pause-source',
  DNS_REPOINT_RECORDS: 'dns.repoint-records',
  ENV_REWIRE_VARS: 'env.rewire-vars',
  VERCEL_SYNC_RULES: 'vercel.sync-rules',
  GITLAB_REWIRE_VARS: 'gitlab.rewire-vars',
  GITLAB_TRIGGER_PIPELINE: 'gitlab.trigger-pipeline',
  GITHUB_REWIRE_VARS: 'github.rewire-vars',
  GITHUB_TRIGGER_WORKFLOW: 'github.trigger-workflow',
} as const;

export type StepType = (typeof STEP_TYPE)[keyof typeof STEP_TYPE];

export interface StepContext {
  job: JobRow;
  step: JobStepRow;
  allSteps: JobStepRow[];
  sourceAccount: DecryptableProviderAccount;
  targetAccount: DecryptableProviderAccount;
  resource: ResourceDto;
  sourceCtx: ProviderContext;
  targetCtx: ProviderContext;
  gitlabCtx?: ProviderContext;
  githubCtx?: ProviderContext;
  providerRegistry: ProviderRegistry;
  snapshotsService: SnapshotsService;
  cipher: SecretCipher;
  selfProtectedHosts: string[];
  manualInput?: {
    values: Record<string, string>;
    acknowledged: boolean;
  };
  log: (level: JobEventLevel, message: string, data?: Record<string, unknown>) => Promise<void>;
}

export interface StepPlan {
  type: StepType;
  title: string;
  summary: string;
  destructive: boolean;
  warnings?: string[];
  details?: Record<string, unknown>;
}

export interface StepResult {
  status: Extract<StepStatus, 'succeeded' | 'running' | 'waiting_manual' | 'skipped' | 'failed'>;
  cursor?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  errorCode?: ErrorCode;
  errorMessage?: string;
}

export interface StepDefinition {
  type: StepType;
  title: string;
  destructive: boolean;
  plan(ctx: StepContext): Promise<StepPlan>;
  execute(ctx: StepContext): Promise<StepResult>;
  verify?(ctx: StepContext): Promise<boolean>;
  compensate?(ctx: StepContext): Promise<void>;
}

export interface TemplateCatalogItem {
  template: MigrationTemplate;
  label: string;
  provider: Provider;
  supportedResourceKinds: ResourceKind[];
  description: string;
  destructive: boolean;
  manualSteps: string[];
  warnings: string[];
  inputSchema: Record<string, unknown>;
  defaultSteps: Array<{
    type: StepType;
    title: string;
    destructive: boolean;
  }>;
}
