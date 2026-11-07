import {
  ACCOUNT_STATUS,
  ACCOUNT_STATUS_VALUES,
  ERROR_CODE_VALUES,
  ID_PREFIX,
  JOB_EVENT_LEVEL_VALUES,
  JOB_STATUS,
  JOB_STATUS_VALUES,
  MIGRATION_TEMPLATE_VALUES,
  PROVIDER_VALUES,
  type QuotaConfig,
  RESOURCE_KIND_VALUES,
  STEP_STATUS,
  STEP_STATUS_VALUES,
  USAGE_METRIC_VALUES,
  VERCEL_ACCOUNT_TYPE_VALUES,
} from '@freetier-loop/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth';
import { primaryId, timestamps } from './common';

export const providerAccounts = sqliteTable(
  'provider_accounts',
  {
    id: primaryId(ID_PREFIX.PROVIDER_ACCOUNT),
    provider: text('provider', { enum: PROVIDER_VALUES }).notNull(),
    label: text('label').notNull(),
    externalAccountId: text('external_account_id'),
    accountType: text('account_type', { enum: VERCEL_ACCOUNT_TYPE_VALUES }),
    encryptedToken: text('encrypted_token').notNull(),
    tokenLast4: text('token_last4').notNull(),
    status: text('status', { enum: ACCOUNT_STATUS_VALUES })
      .notNull()
      .default(ACCOUNT_STATUS.ACTIVE),
    scopesVerified: text('scopes_verified', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    quotaConfig: text('quota_config', { mode: 'json' }).$type<QuotaConfig | null>(),
    lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp_ms' }),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    ...timestamps(),
  },
  (table) => [
    index('idx_provider_accounts_provider').on(table.provider),
    index('idx_provider_accounts_status').on(table.status),
  ],
);

export const resources = sqliteTable(
  'resources',
  {
    id: primaryId(ID_PREFIX.RESOURCE),
    providerAccountId: text('provider_account_id')
      .notNull()
      .references(() => providerAccounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: RESOURCE_KIND_VALUES }).notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    data: text('data', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    syncedAt: integer('synced_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    ...timestamps(),
  },
  (table) => [
    index('idx_resources_account_kind').on(table.providerAccountId, table.kind),
    index('idx_resources_parent_id').on(table.parentId),
    index('idx_resources_name').on(table.name),
  ],
);

export const usageSnapshots = sqliteTable(
  'usage_snapshots',
  {
    id: primaryId(ID_PREFIX.USAGE_SNAPSHOT),
    providerAccountId: text('provider_account_id')
      .notNull()
      .references(() => providerAccounts.id, { onDelete: 'cascade' }),
    metric: text('metric', { enum: USAGE_METRIC_VALUES }).notNull(),
    value: integer('value').notNull(),
    limit: integer('limit').notNull(),
    periodStart: integer('period_start', { mode: 'timestamp_ms' }).notNull(),
    ...timestamps(),
  },
  (table) => [
    index('idx_usage_snapshots_account_metric').on(
      table.providerAccountId,
      table.metric,
      table.periodStart,
    ),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: primaryId(ID_PREFIX.JOB),
    template: text('template', { enum: MIGRATION_TEMPLATE_VALUES }).notNull(),
    status: text('status', { enum: JOB_STATUS_VALUES }).notNull().default(JOB_STATUS.DRAFT),
    sourceAccountId: text('source_account_id')
      .notNull()
      .references(() => providerAccounts.id, { onDelete: 'restrict' }),
    targetAccountId: text('target_account_id')
      .notNull()
      .references(() => providerAccounts.id, { onDelete: 'restrict' }),
    resourceId: text('resource_id').notNull(),
    resourceName: text('resource_name').notNull(),
    input: text('input', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    plan: text('plan', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    index('idx_jobs_status').on(table.status),
    index('idx_jobs_source_account').on(table.sourceAccountId),
    index('idx_jobs_target_account').on(table.targetAccountId),
  ],
);

export const jobSteps = sqliteTable(
  'job_steps',
  {
    id: primaryId(ID_PREFIX.JOB_STEP),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    destructive: integer('destructive', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: STEP_STATUS_VALUES }).notNull().default(STEP_STATUS.PENDING),
    cursor: text('cursor', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    result: text('result', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    errorCode: text('error_code', { enum: ERROR_CODE_VALUES }),
    errorMessage: text('error_message'),
    attempts: integer('attempts').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('idx_job_steps_job_position').on(table.jobId, table.position)],
);

export const jobEvents = sqliteTable(
  'job_events',
  {
    id: primaryId(ID_PREFIX.JOB_EVENT),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    stepId: text('step_id'),
    level: text('level', { enum: JOB_EVENT_LEVEL_VALUES }).notNull(),
    message: text('message').notNull(),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    ...timestamps(),
  },
  (table) => [index('idx_job_events_job_id').on(table.jobId)],
);

export const snapshots = sqliteTable(
  'snapshots',
  {
    id: primaryId(ID_PREFIX.SNAPSHOT),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    resourceId: text('resource_id').notNull(),
    resourceName: text('resource_name').notNull(),
    kind: text('kind', { enum: RESOURCE_KIND_VALUES }).notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    bindZoneFile: text('bind_zone_file'),
    ...timestamps(),
  },
  (table) => [
    index('idx_snapshots_resource_id').on(table.resourceId),
    index('idx_snapshots_job_id').on(table.jobId),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: primaryId(ID_PREFIX.AUDIT_LOG),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    ip: text('ip'),
    ...timestamps(),
  },
  (table) => [
    index('idx_audit_logs_created_at').on(table.createdAt),
    index('idx_audit_logs_target').on(table.targetType, table.targetId),
  ],
);

export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    id: primaryId(ID_PREFIX.LOGIN_ATTEMPT),
    email: text('email').notNull().unique(),
    ip: text('ip'),
    failedCount: integer('failed_count').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
    ...timestamps(),
  },
  (table) => [index('idx_login_attempts_email').on(table.email)],
);
