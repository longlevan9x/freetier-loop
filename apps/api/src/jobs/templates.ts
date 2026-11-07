import {
  MIGRATION_TEMPLATE,
  MIGRATION_TEMPLATE_LABEL,
  type MigrationTemplate,
  PROVIDER,
  RESOURCE_KIND,
} from '@freetier-loop/shared';
import { STEP_TYPE, type StepType, type TemplateCatalogItem } from './job.types';
import { STEP_REGISTRY } from './steps';

const toStepSummaries = (types: StepType[]) =>
  types.map((t) => ({
    type: t,
    title: STEP_REGISTRY[t].title,
    destructive: STEP_REGISTRY[t].destructive,
  }));

export const MIGRATION_TEMPLATE_CATALOG: Record<MigrationTemplate, TemplateCatalogItem> = {
  [MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE]: {
    template: MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE],
    provider: PROVIDER.CLOUDFLARE,
    supportedResourceKinds: [RESOURCE_KIND.ZONE],
    description:
      'Non-destructive Blue-Green migration for domains registered on Cloudflare Registrar. Pre-creates target zone, batch imports DNS records and SSL/TLS settings without deleting the source zone, guides the Registrar account move, and polls until active.',
    destructive: false,
    manualSteps: [
      'Initiate Cloudflare Registrar domain move in Dashboard (or Support Ticket) and accept in target account as Super Administrator.',
    ],
    warnings: [
      'Never delete the source zone for a Cloudflare Registrar domain before transfer completes.',
      'DNSSEC must be disabled before initiating the Registrar move.',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        rebindWorkerDomains: {
          type: 'boolean',
          default: true,
          description: 'Re-attach Worker & Pages custom domains on the target account.',
        },
      },
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.CF_CREATE_TARGET_ZONE,
      STEP_TYPE.CF_BATCH_IMPORT_DNS,
      STEP_TYPE.CF_RESTORE_ZONE_SETTINGS,
      STEP_TYPE.MANUAL_CONFIRM,
      STEP_TYPE.WAIT_POLL,
      STEP_TYPE.CF_REBIND_WORKER_DOMAINS,
    ]),
  },

  [MIGRATION_TEMPLATE.CF_ZONE_MOVE]: {
    template: MIGRATION_TEMPLATE.CF_ZONE_MOVE,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.CF_ZONE_MOVE],
    provider: PROVIDER.CLOUDFLARE,
    supportedResourceKinds: [RESOURCE_KIND.ZONE],
    description:
      'Migrate a Cloudflare zone whose domain is registered at an external registrar (Namecheap, Porkbun, GoDaddy, etc.). Captures full DNS + SSL snapshot, removes source zone, recreates on target, batch-restores DNS, and prompts nameserver update.',
    destructive: true,
    manualSteps: ['Update nameservers at your external domain registrar to the new Cloudflare NS.'],
    warnings: [
      'Source zone is deleted after snapshot; emergency rollback can recreate it from snapshot.',
    ],
    inputSchema: {
      type: 'object',
      properties: {},
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.CF_DELETE_SOURCE_ZONE,
      STEP_TYPE.CF_CREATE_TARGET_ZONE,
      STEP_TYPE.CF_BATCH_IMPORT_DNS,
      STEP_TYPE.CF_RESTORE_ZONE_SETTINGS,
      STEP_TYPE.MANUAL_CONFIRM,
      STEP_TYPE.WAIT_POLL,
    ]),
  },

  [MIGRATION_TEMPLATE.CF_WORKER_MOVE]: {
    template: MIGRATION_TEMPLATE.CF_WORKER_MOVE,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.CF_WORKER_MOVE],
    provider: PROVIDER.CLOUDFLARE,
    supportedResourceKinds: [RESOURCE_KIND.WORKER, RESOURCE_KIND.PAGES_PROJECT],
    description:
      'Copy Cloudflare Worker ES module bundle, bindings metadata, write-only secrets, and custom domain routes to a target Cloudflare account.',
    destructive: false,
    manualSteps: ['Enter write-only Worker secret values if applicable.'],
    warnings: ['KV/D1/R2 data migration should be verified before switching custom domains.'],
    inputSchema: {
      type: 'object',
      properties: {},
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.CF_DEPLOY_WORKER,
      STEP_TYPE.MANUAL_SECRET_INPUT,
      STEP_TYPE.CF_REBIND_WORKER_DOMAINS,
    ]),
  },

  [MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE]: {
    template: MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE],
    provider: PROVIDER.VERCEL,
    supportedResourceKinds: [RESOURCE_KIND.VERCEL_PROJECT],
    description:
      'Blue-Green recreation of a Vercel project (supports Hobby & Team accounts). Creates the project on target from Git, copies readable env vars, prompts for sensitive env vars, verifies deployment readiness, and cuts over custom domains.',
    destructive: true,
    manualSteps: ['Re-enter any sensitive (write-only) environment variable values.'],
    warnings: ['Ensure the Vercel GitHub App is installed on the target account before starting.'],
    inputSchema: {
      type: 'object',
      properties: {},
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.VERCEL_CREATE_PROJECT,
      STEP_TYPE.VERCEL_UPSERT_ENV,
      STEP_TYPE.MANUAL_SECRET_INPUT,
      STEP_TYPE.VERCEL_TRIGGER_DEPLOY,
      STEP_TYPE.VERCEL_MOVE_DOMAINS,
    ]),
  },

  [MIGRATION_TEMPLATE.VERCEL_PROJECT_TRANSFER]: {
    template: MIGRATION_TEMPLATE.VERCEL_PROJECT_TRANSFER,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.VERCEL_PROJECT_TRANSFER],
    provider: PROVIDER.VERCEL,
    supportedResourceKinds: [RESOURCE_KIND.VERCEL_PROJECT],
    description:
      'Native Vercel Project Transfer between Team accounts via /projects/:id/transfer-request and accept.',
    destructive: true,
    manualSteps: [],
    warnings: [
      'Requires Team accounts. Hobby accounts automatically fall back to VERCEL_PROJECT_RECREATE.',
    ],
    inputSchema: {
      type: 'object',
      properties: {},
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.VERCEL_TRANSFER_REQUEST,
      STEP_TYPE.VERCEL_TRANSFER_ACCEPT,
    ]),
  },

  [MIGRATION_TEMPLATE.VERCEL_DOMAIN_MOVE]: {
    template: MIGRATION_TEMPLATE.VERCEL_DOMAIN_MOVE,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.VERCEL_DOMAIN_MOVE],
    provider: PROVIDER.VERCEL,
    supportedResourceKinds: [RESOURCE_KIND.PROJECT_DOMAIN, RESOURCE_KIND.VERCEL_PROJECT],
    description: 'Detach custom domain from source Vercel project and attach to target project.',
    destructive: true,
    manualSteps: [],
    warnings: ['Brief SSL certificate issuance window (15–60s) on the target project.'],
    inputSchema: {
      type: 'object',
      properties: {},
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.VERCEL_MOVE_DOMAINS,
    ]),
  },

  [MIGRATION_TEMPLATE.SUPABASE_ORG_TRANSFER]: {
    template: MIGRATION_TEMPLATE.SUPABASE_ORG_TRANSFER,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.SUPABASE_ORG_TRANSFER],
    provider: PROVIDER.SUPABASE,
    supportedResourceKinds: [RESOURCE_KIND.SUPABASE_PROJECT],
    description:
      'Native Supabase Organization Transfer (/v2/projects/:ref/transfers) between two organizations owned by the same user.',
    destructive: true,
    manualSteps: [],
    warnings: [
      'Target organization must have free project slots available under the user limit (2 active free projects per user).',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        targetOrganizationId: {
          type: 'string',
          description: 'Target Supabase Organization Slug/ID',
        },
      },
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.SUPABASE_ORG_TRANSFER,
    ]),
  },

  [MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE]: {
    template: MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE],
    provider: PROVIDER.SUPABASE,
    supportedResourceKinds: [RESOURCE_KIND.SUPABASE_PROJECT],
    description:
      'Cross-account Blue-Green Supabase migration when a user hits the 2-active-free-projects limit. Creates target project, generates pg_dump | psql command for public/auth/storage schemas, verifies table row counts via SQL API, deploys Edge Functions, prompts for function secrets, rewires linked frontend env vars, and optionally pauses the source project.',
    destructive: true,
    manualSteps: [
      'Run the generated pg_dump | psql terminal command to copy PostgreSQL schemas (public, auth, storage).',
      'Re-enter write-only Edge Function secret values if applicable.',
    ],
    warnings: [
      'Source project remains untouched until target DB row counts, Edge Functions, and ENV_REWIRE succeed.',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        dbPass: {
          type: 'string',
          description: 'Database password for the new target Supabase project',
        },
        pauseSource: {
          type: 'boolean',
          default: true,
          description:
            'Pause the source Supabase project after verification to free an active slot',
        },
        envVars: {
          type: 'object',
          description: 'Optional key-value map of SUPABASE_URL / keys to rewire',
        },
      },
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.SUPABASE_CREATE_PROJECT,
      STEP_TYPE.MANUAL_RUN_COMMAND,
      STEP_TYPE.SUPABASE_VERIFY_ROW_COUNTS,
      STEP_TYPE.SUPABASE_DEPLOY_FUNCTIONS,
      STEP_TYPE.SUPABASE_UPSERT_SECRETS,
      STEP_TYPE.ENV_REWIRE_VARS,
      STEP_TYPE.SUPABASE_PAUSE_SOURCE,
    ]),
  },

  [MIGRATION_TEMPLATE.DNS_REPOINT]: {
    template: MIGRATION_TEMPLATE.DNS_REPOINT,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.DNS_REPOINT],
    provider: PROVIDER.CLOUDFLARE,
    supportedResourceKinds: [RESOURCE_KIND.ZONE],
    description:
      'Batch repoint A/AAAA/CNAME records to a new deployment IP or hostname with diff preview and 1-click rollback.',
    destructive: true,
    manualSteps: [],
    warnings: ['Low TTL (60–300s) is recommended prior to cutover.'],
    inputSchema: {
      type: 'object',
      properties: {
        records: {
          type: 'array',
          description: 'List of DNS record changes ({ type, name, newContent })',
        },
      },
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.DNS_REPOINT_RECORDS,
    ]),
  },

  [MIGRATION_TEMPLATE.ENV_REWIRE]: {
    template: MIGRATION_TEMPLATE.ENV_REWIRE,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.ENV_REWIRE],
    provider: PROVIDER.VERCEL,
    supportedResourceKinds: [
      RESOURCE_KIND.VERCEL_PROJECT,
      RESOURCE_KIND.WORKER,
      RESOURCE_KIND.PAGES_PROJECT,
    ],
    description:
      'Bulk update backend connection environment variables (e.g. SUPABASE_URL, SUPABASE_ANON_KEY, API_URL) across Vercel or Cloudflare projects with rollback support.',
    destructive: false,
    manualSteps: [],
    warnings: ['Redeploy the frontend project after updating build-time environment variables.'],
    inputSchema: {
      type: 'object',
      properties: {
        envVars: {
          type: 'object',
          description: 'Key-value map of environment variables to update',
        },
      },
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.ENV_REWIRE_VARS,
    ]),
  },

  [MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER]: {
    template: MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER,
    label: MIGRATION_TEMPLATE_LABEL[MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER],
    provider: PROVIDER.VERCEL,
    supportedResourceKinds: [RESOURCE_KIND.VERCEL_PROJECT, RESOURCE_KIND.PROJECT_DOMAIN],
    description:
      '3-in-1 Full Cutover: Moves custom domains, syncs Vercel rules (rewrites, redirects, headers), and auto-rewires GitLab CI/CD variables (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID) in a single workflow.',
    destructive: true,
    manualSteps: [],
    warnings: [
      'GitLab pipeline variables will be updated to point to the target Vercel account.',
      'Ensure GitLab Personal/Project Access Token has api permission.',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        gitlabProjectId: {
          type: 'string',
          description: 'GitLab Project ID or path (e.g. 123456 or group/repo)',
        },
        gitlabToken: {
          type: 'string',
          description: 'GitLab Personal Access Token with api scope',
        },
      },
    },
    defaultSteps: toStepSummaries([
      STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      STEP_TYPE.SNAPSHOT_RESOURCE,
      STEP_TYPE.VERCEL_MOVE_DOMAINS,
      STEP_TYPE.VERCEL_SYNC_RULES,
      STEP_TYPE.GITLAB_REWIRE_VARS,
    ]),
  },
};
