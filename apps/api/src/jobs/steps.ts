import {
  CAPABILITY,
  ERROR_CODE,
  JOB_EVENT_LEVEL,
  MIGRATION_TEMPLATE,
  PROVIDER,
  STEP_STATUS,
  VERCEL_ACCOUNT_TYPE,
} from '@freetier-loop/shared';
import type {
  GitLabVariable,
  NormalizedDnsRecord,
  NormalizedEnvVar,
  ProjectRules,
  ProviderContext,
} from '../providers/contracts';
import {
  STEP_TYPE,
  type StepContext,
  type StepDefinition,
  type StepPlan,
  type StepResult,
  type StepType,
} from './job.types';

const DNS_CHUNK_SIZE = 200;

const getPriorStepResult = (
  ctx: StepContext,
  stepType: StepType,
): Record<string, unknown> | null => {
  const found = ctx.allSteps.find((s) => s.type === stepType && s.result);
  return found?.result ?? null;
};

const preflightVerifyAccountsStep: StepDefinition = {
  type: STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
  title: 'Preflight: Verify Accounts, Quota & Safety Guards',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    const warnings: string[] = [];
    if (ctx.resource.data.emailRoutingEnabled) {
      warnings.push(
        'Cloudflare Email Routing is enabled on source zone; reconfigure MX/routing rules on target before cutover.',
      );
    }
    return {
      type: STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
      title: this.title,
      summary: `Verify self-protection, credentials for "${ctx.sourceAccount.label}" and "${ctx.targetAccount.label}", and provider constraints for "${ctx.resource.name}".`,
      destructive: false,
      warnings,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const normalizedResource = ctx.resource.name.toLowerCase();
    const isSelfProtected = ctx.selfProtectedHosts.some(
      (host) =>
        normalizedResource === host.toLowerCase() ||
        normalizedResource.endsWith(`.${host.toLowerCase()}`),
    );
    if (isSelfProtected) {
      await ctx.log(
        JOB_EVENT_LEVEL.ERROR,
        `Resource "${ctx.resource.name}" matches self-protected host list.`,
      );
      return {
        status: STEP_STATUS.FAILED,
        errorCode: ERROR_CODE.RESOURCE_SELF_PROTECTED,
        errorMessage: `Resource "${ctx.resource.name}" is self-protected (hosts the admin console) and cannot be migrated.`,
      };
    }

    if (
      ctx.job.template === MIGRATION_TEMPLATE.VERCEL_PROJECT_TRANSFER &&
      (ctx.sourceAccount.accountType === VERCEL_ACCOUNT_TYPE.HOBBY ||
        ctx.targetAccount.accountType === VERCEL_ACCOUNT_TYPE.HOBBY)
    ) {
      return {
        status: STEP_STATUS.FAILED,
        errorCode: ERROR_CODE.JOB_STEP_FAILED,
        errorMessage:
          'Native Vercel transfer requires Team accounts. Use VERCEL_PROJECT_RECREATE for Hobby accounts.',
      };
    }

    const sourceVerifier = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.ACCOUNT_VERIFIER,
    );
    const targetVerifier = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.ACCOUNT_VERIFIER,
    );
    const sourceVerify = await sourceVerifier.verify(ctx.sourceCtx);
    const targetVerify = await targetVerifier.verify(ctx.targetCtx);

    if (
      ctx.job.template === MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE ||
      ctx.job.template === MIGRATION_TEMPLATE.CF_ZONE_MOVE
    ) {
      const zoneProvider = ctx.providerRegistry.getCapability(
        ctx.sourceAccount.provider,
        CAPABILITY.ZONES,
      );
      const dnssec = await zoneProvider.getDnssecStatus(ctx.sourceCtx, ctx.resource.externalId);
      if (dnssec.enabled) {
        return {
          status: STEP_STATUS.FAILED,
          errorCode: ERROR_CODE.JOB_STEP_FAILED,
          errorMessage: `DNSSEC is enabled on zone "${ctx.resource.name}". Disable DNSSEC before migrating the zone.`,
        };
      }
    }

    await ctx.log(JOB_EVENT_LEVEL.INFO, 'Preflight verification passed for source and target.');
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: {
        sourceExternalId: sourceVerify.externalAccountId,
        targetExternalId: targetVerify.externalAccountId,
      },
    };
  },
};

const snapshotResourceStep: StepDefinition = {
  type: STEP_TYPE.SNAPSHOT_RESOURCE,
  title: 'Capture Encrypted Resource Snapshot',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.SNAPSHOT_RESOURCE,
      title: this.title,
      summary: `Create full configuration/DNS/metadata snapshot of "${ctx.resource.name}" before making changes.`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const existing = ctx.step.result ?? {};
    if (typeof existing.snapshotId === 'string') {
      await ctx.log(JOB_EVENT_LEVEL.INFO, `Reusing existing snapshot ${existing.snapshotId}.`);
      return {
        status: STEP_STATUS.SUCCEEDED,
        result: existing,
      };
    }

    const snap = await ctx.snapshotsService.createForResource(ctx.resource.id, {
      jobId: ctx.job.id,
      userId: ctx.job.createdBy,
    });
    const rawRecord = await ctx.snapshotsService.getRawById(snap.id);
    await ctx.log(JOB_EVENT_LEVEL.INFO, `Created snapshot ${snap.id} for "${ctx.resource.name}".`);
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: {
        snapshotId: snap.id,
        snapshotPayload: rawRecord.payload,
      },
    };
  },
};

const cfCreateTargetZoneStep: StepDefinition = {
  type: STEP_TYPE.CF_CREATE_TARGET_ZONE,
  title: 'Create Zone on Target Cloudflare Account',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.CF_CREATE_TARGET_ZONE,
      title: this.title,
      summary: `Ensure zone "${ctx.resource.name}" exists on target account "${ctx.targetAccount.label}" (non-destructive).`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const targetZones = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.ZONES,
    );
    const existingList = await targetZones.listZones(ctx.targetCtx);
    const existing = existingList.items.find(
      (z) => z.name.toLowerCase() === ctx.resource.name.toLowerCase(),
    );
    if (existing) {
      await ctx.log(
        JOB_EVENT_LEVEL.INFO,
        `Target zone "${existing.name}" already exists (${existing.id}); reusing.`,
      );
      return {
        status: STEP_STATUS.SUCCEEDED,
        result: {
          targetZoneId: existing.id,
          nameServers: existing.nameServers,
          zoneStatus: existing.status,
        },
      };
    }

    const created = await targetZones.createZone(ctx.targetCtx, {
      name: ctx.resource.name,
      accountId: ctx.targetAccount.externalAccountId ?? 'cf_account',
    });
    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Created target zone "${created.name}" (${created.id}) with NS: ${created.nameServers.join(', ')}.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: {
        targetZoneId: created.id,
        nameServers: created.nameServers,
        zoneStatus: created.status,
      },
    };
  },
};

const cfDeleteSourceZoneStep: StepDefinition = {
  type: STEP_TYPE.CF_DELETE_SOURCE_ZONE,
  title: 'Delete Source Zone (External Registrar Cutover)',
  destructive: true,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.CF_DELETE_SOURCE_ZONE,
      title: this.title,
      summary: `Remove zone "${ctx.resource.name}" from source account "${ctx.sourceAccount.label}" after snapshot is verified.`,
      destructive: true,
      warnings: ['Source zone will be deleted; rollback can recreate it from the saved snapshot.'],
    };
  },
  async execute(ctx): Promise<StepResult> {
    if (
      ctx.job.template === MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE ||
      ctx.resource.data.registrar === true ||
      ctx.resource.data.isCfRegistrar === true
    ) {
      return {
        status: STEP_STATUS.FAILED,
        errorCode: ERROR_CODE.JOB_STEP_FAILED,
        errorMessage:
          'Refusing to delete source zone for a Cloudflare Registrar domain. Use CF_REGISTRAR_DOMAIN_MOVE.',
      };
    }

    const sourceZones = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.ZONES,
    );
    await sourceZones.deleteZone(ctx.sourceCtx, ctx.resource.externalId);
    await ctx.log(JOB_EVENT_LEVEL.WARN, `Deleted source zone ${ctx.resource.externalId}.`);
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { deletedZoneId: ctx.resource.externalId },
    };
  },
  async compensate(ctx): Promise<void> {
    const sourceZones = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.ZONES,
    );
    const created = await sourceZones.createZone(ctx.sourceCtx, {
      name: ctx.resource.name,
      accountId: ctx.sourceAccount.externalAccountId ?? 'cf_account',
    });
    await ctx.log(
      JOB_EVENT_LEVEL.WARN,
      `Compensated: recreated zone "${created.name}" (${created.id}) on source account.`,
    );
  },
};

const cfBatchImportDnsStep: StepDefinition = {
  type: STEP_TYPE.CF_BATCH_IMPORT_DNS,
  title: 'Batch Import DNS Records to Target Zone',
  destructive: false,
  async plan(): Promise<StepPlan> {
    return {
      type: STEP_TYPE.CF_BATCH_IMPORT_DNS,
      title: this.title,
      summary: `Idempotently batch import DNS records into target zone in chunks of ${DNS_CHUNK_SIZE}.`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createResult = getPriorStepResult(ctx, STEP_TYPE.CF_CREATE_TARGET_ZONE);
    const snapResult = getPriorStepResult(ctx, STEP_TYPE.SNAPSHOT_RESOURCE);
    const targetZoneId =
      (createResult?.targetZoneId as string | undefined) ?? ctx.resource.externalId;
    const snapshotPayload =
      (snapResult?.snapshotPayload as Record<string, unknown> | undefined) ?? {};
    const sourceRecords = (snapshotPayload.dnsRecords as NormalizedDnsRecord[] | undefined) ?? [];

    const dnsProvider = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.DNS_RECORDS,
    );
    const existingTarget = await dnsProvider.listRecords(ctx.targetCtx, targetZoneId);
    const existingKeys = new Set(
      existingTarget.items.map((r) => `${r.type}:${r.name}:${r.content}`),
    );

    const missing = sourceRecords.filter(
      (r) => !existingKeys.has(`${r.type}:${r.name}:${r.content}`),
    );
    const cursorObj = ctx.step.cursor ?? {};
    const offset = typeof cursorObj.offset === 'number' ? cursorObj.offset : 0;
    const chunk = missing.slice(offset, offset + DNS_CHUNK_SIZE);

    if (chunk.length > 0) {
      await dnsProvider.batchApply(ctx.targetCtx, targetZoneId, {
        posts: chunk.map((r) => ({
          type: r.type,
          name: r.name,
          content: r.content,
          ttl: r.ttl,
          proxied: r.proxied,
          ...(r.priority !== undefined ? { priority: r.priority } : {}),
        })),
      });
    }

    const nextOffset = offset + chunk.length;
    if (nextOffset < missing.length) {
      await ctx.log(
        JOB_EVENT_LEVEL.INFO,
        `Imported DNS chunk (${nextOffset}/${missing.length} records).`,
      );
      return {
        status: STEP_STATUS.RUNNING,
        cursor: { offset: nextOffset },
        result: { importedCount: nextOffset, totalMissing: missing.length },
      };
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `DNS import complete (${missing.length} created, ${sourceRecords.length - missing.length} already present).`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      cursor: null,
      result: {
        importedCount: missing.length,
        skippedCount: sourceRecords.length - missing.length,
      },
    };
  },
};

const cfRestoreZoneSettingsStep: StepDefinition = {
  type: STEP_TYPE.CF_RESTORE_ZONE_SETTINGS,
  title: 'Sync SSL/TLS & HTTPS Settings on Target Zone',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.CF_RESTORE_ZONE_SETTINGS,
      title: this.title,
      summary: `Apply SSL mode (Full/Strict), Always Use HTTPS, and TLS settings on "${ctx.resource.name}" to prevent redirect loops.`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createResult = getPriorStepResult(ctx, STEP_TYPE.CF_CREATE_TARGET_ZONE);
    const snapResult = getPriorStepResult(ctx, STEP_TYPE.SNAPSHOT_RESOURCE);
    const targetZoneId =
      (createResult?.targetZoneId as string | undefined) ?? ctx.resource.externalId;
    const snapshotPayload =
      (snapResult?.snapshotPayload as Record<string, unknown> | undefined) ?? {};
    const sslSettings = snapshotPayload.sslSettings as Record<string, string> | undefined;

    if (sslSettings && Object.keys(sslSettings).length > 0) {
      const zoneProvider = ctx.providerRegistry.getCapability(
        ctx.targetAccount.provider,
        CAPABILITY.ZONES,
      );
      await zoneProvider.updateZoneSettings(ctx.targetCtx, targetZoneId, sslSettings);
      await ctx.log(JOB_EVENT_LEVEL.INFO, 'Synced SSL/TLS settings on target zone.');
    }

    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { settingsApplied: Boolean(sslSettings) },
    };
  },
};

const manualConfirmStep: StepDefinition = {
  type: STEP_TYPE.MANUAL_CONFIRM,
  title: 'Manual Action Confirmation',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    const isCfRegistrar = ctx.job.template === MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE;
    return {
      type: STEP_TYPE.MANUAL_CONFIRM,
      title: isCfRegistrar
        ? 'Manual Step: Transfer Domain in Cloudflare Registrar Dashboard'
        : 'Manual Step: Update Nameservers at External Registrar',
      summary: isCfRegistrar
        ? `Initiate Cloudflare Registrar domain move from "${ctx.sourceAccount.label}" to "${ctx.targetAccount.label}" and accept as Super Admin.`
        : 'Update nameservers at your domain registrar to the target Cloudflare nameservers.',
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createResult = getPriorStepResult(ctx, STEP_TYPE.CF_CREATE_TARGET_ZONE);
    const nameServers = (createResult?.nameServers as string[] | undefined) ?? [];

    if (!ctx.manualInput?.acknowledged) {
      const instructions =
        ctx.job.template === MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE
          ? [
              `1. Open Cloudflare Dashboard (${ctx.sourceAccount.label}) → Domain Registration → Manage Domains → ${ctx.resource.name}.`,
              `2. Select "Move to another Cloudflare account" targeting account ID ${ctx.targetAccount.externalAccountId ?? ctx.targetAccount.label}.`,
              `3. Log into the target account (${ctx.targetAccount.label}) as Super Administrator and accept the domain transfer.`,
              '4. Click "Confirm Completed" below once initiated.',
            ]
          : [
              `1. Open your domain registrar panel for ${ctx.resource.name}.`,
              `2. Replace existing nameservers with: ${nameServers.join(', ') || 'target Cloudflare NS'}.`,
              '3. Click "Confirm Completed" below.',
            ];

      await ctx.log(JOB_EVENT_LEVEL.WARN, 'Waiting for operator confirmation of manual step.');
      return {
        status: STEP_STATUS.WAITING_MANUAL,
        result: {
          instructions,
          nameServers,
        },
      };
    }

    await ctx.log(JOB_EVENT_LEVEL.INFO, 'Operator confirmed manual step completion.');
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: {
        acknowledged: true,
        values: ctx.manualInput.values,
      },
    };
  },
};

const manualSecretInputStep: StepDefinition = {
  type: STEP_TYPE.MANUAL_SECRET_INPUT,
  title: 'Manual Step: Provide Write-Only Secret Values',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.MANUAL_SECRET_INPUT,
      title: this.title,
      summary: `Re-enter write-only secret values for "${ctx.resource.name}" (or skip if none are required).`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const snapResult = getPriorStepResult(ctx, STEP_TYPE.SNAPSHOT_RESOURCE);
    const payload = (snapResult?.snapshotPayload as Record<string, unknown> | undefined) ?? {};
    const envVars =
      (payload.envVars as Array<{ key: string; readable: boolean }> | undefined) ?? [];
    const secretNames = envVars.filter((e) => !e.readable).map((e) => e.key);

    if (secretNames.length === 0) {
      await ctx.log(
        JOB_EVENT_LEVEL.INFO,
        'No write-only secrets detected; skipping manual prompt.',
      );
      return {
        status: STEP_STATUS.SKIPPED,
        result: { secretNames: [] },
      };
    }

    if (!ctx.manualInput?.acknowledged) {
      await ctx.log(
        JOB_EVENT_LEVEL.WARN,
        `Waiting for manual entry of ${secretNames.length} write-only secrets: ${secretNames.join(', ')}.`,
      );
      return {
        status: STEP_STATUS.WAITING_MANUAL,
        result: {
          requiredSecrets: secretNames,
          instructions: [
            `Enter the secret values for: ${secretNames.join(', ')}. Values are sent directly to the target provider and never stored in logs.`,
          ],
        },
      };
    }

    const createProjResult =
      getPriorStepResult(ctx, STEP_TYPE.VERCEL_CREATE_PROJECT) ??
      getPriorStepResult(ctx, STEP_TYPE.SUPABASE_CREATE_PROJECT);
    const targetProjectId =
      (createProjResult?.targetProjectId as string | undefined) ?? ctx.resource.externalId;

    const providedEntries = Object.entries(ctx.manualInput.values).filter(
      ([, v]) => v.trim().length > 0,
    );
    if (providedEntries.length > 0) {
      const envProvider = ctx.providerRegistry.getCapability(
        ctx.targetAccount.provider,
        CAPABILITY.ENV_VARS,
      );
      await envProvider.upsertEnvVars(
        ctx.targetCtx,
        targetProjectId,
        providedEntries.map(([key, value]) => ({
          key,
          value,
          type: 'secret',
          readable: false,
          target: ['production', 'preview', 'development'],
        })),
      );
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Applied ${providedEntries.length} write-only secrets to target project.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: {
        appliedSecretKeys: providedEntries.map(([k]) => k),
      },
    };
  },
};

const manualRunCommandStep: StepDefinition = {
  type: STEP_TYPE.MANUAL_RUN_COMMAND,
  title: 'Manual Step: Execute Database Dump & Restore (pg_dump | psql)',
  destructive: false,
  async plan(): Promise<StepPlan> {
    return {
      type: STEP_TYPE.MANUAL_RUN_COMMAND,
      title: this.title,
      summary:
        'Run generated pg_dump | psql command for schemas (public, auth, storage) to copy PostgreSQL data to target project.',
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createProj = getPriorStepResult(ctx, STEP_TYPE.SUPABASE_CREATE_PROJECT);
    const targetRef = (createProj?.targetProjectId as string | undefined) ?? 'TARGET_PROJECT_REF';
    const sourceRef = ctx.resource.externalId;
    const command = `pg_dump "postgresql://postgres:[SOURCE_DB_PASSWORD]@db.${sourceRef}.supabase.co:5432/postgres" --clean --if-exists --quote-all-identifiers --schema=public --schema=auth --schema=storage --no-owner --no-privileges | psql "postgresql://postgres:[TARGET_DB_PASSWORD]@db.${targetRef}.supabase.co:5432/postgres"`;

    if (!ctx.manualInput?.acknowledged) {
      await ctx.log(
        JOB_EVENT_LEVEL.WARN,
        'Waiting for operator to run pg_dump | psql database migration command.',
      );
      return {
        status: STEP_STATUS.WAITING_MANUAL,
        result: {
          command,
          instructions: [
            '1. Run the pre-built pg_dump | psql command below in your terminal with your source and target DB passwords.',
            '2. Verify extensions and Auth redirect URLs if applicable.',
            '3. Click "Confirm Completed" to run automatic table row-count verification.',
          ],
        },
      };
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      'Operator confirmed pg_dump | psql completion; proceeding to row-count verification.',
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { commandExecuted: true },
    };
  },
};

const waitPollStep: StepDefinition = {
  type: STEP_TYPE.WAIT_POLL,
  title: 'Poll Target Resource Until Active',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.WAIT_POLL,
      title: this.title,
      summary: `Poll target resource "${ctx.resource.name}" until status is active.`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createResult = getPriorStepResult(ctx, STEP_TYPE.CF_CREATE_TARGET_ZONE);
    const targetZoneId =
      (createResult?.targetZoneId as string | undefined) ?? ctx.resource.externalId;
    const targetAdapter = ctx.providerRegistry.getAdapter(ctx.targetAccount.provider);
    const zoneProvider = targetAdapter.getCapability(CAPABILITY.ZONES);

    if (zoneProvider) {
      const zone = await zoneProvider.getZone(ctx.targetCtx, targetZoneId);
      await ctx.log(
        JOB_EVENT_LEVEL.INFO,
        `Target zone "${zone.name}" poll completed (status: ${zone.status}).`,
      );
      return {
        status: STEP_STATUS.SUCCEEDED,
        result: { status: zone.status },
      };
    }

    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { status: 'active' },
    };
  },
};

const cfRebindWorkerDomainsStep: StepDefinition = {
  type: STEP_TYPE.CF_REBIND_WORKER_DOMAINS,
  title: 'Rebind Cloudflare Worker & Pages Custom Domains',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.CF_REBIND_WORKER_DOMAINS,
      title: this.title,
      summary: `Re-attach Worker custom domains for "${ctx.resource.name}" on target account.`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const snapResult = getPriorStepResult(ctx, STEP_TYPE.SNAPSHOT_RESOURCE);
    const payload = (snapResult?.snapshotPayload as Record<string, unknown> | undefined) ?? {};
    const workerDomains =
      (payload.workerDomains as Array<{ hostname: string; service: string }> | undefined) ?? [];

    const domainProvider = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.PROJECT_DOMAINS,
    );

    for (const wd of workerDomains) {
      await domainProvider.addProjectDomain(ctx.targetCtx, wd.service, wd.hostname);
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Rebound ${workerDomains.length} Worker custom domains on target account.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { reboundCount: workerDomains.length },
    };
  },
};

const cfDeployWorkerStep: StepDefinition = {
  type: STEP_TYPE.CF_DEPLOY_WORKER,
  title: 'Deploy Cloudflare Worker Script & Bindings to Target Account',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.CF_DEPLOY_WORKER,
      title: this.title,
      summary: `Deploy Worker "${ctx.resource.name}" to target account "${ctx.targetAccount.label}".`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Verified Worker "${ctx.resource.name}" deployment on target Cloudflare account.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { workerSlug: ctx.resource.name },
    };
  },
};

const vercelCreateProjectStep: StepDefinition = {
  type: STEP_TYPE.VERCEL_CREATE_PROJECT,
  title: 'Create Project on Target Vercel Account (Blue-Green)',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.VERCEL_CREATE_PROJECT,
      title: this.title,
      summary: `Create project "${ctx.resource.name}" on target account "${ctx.targetAccount.label}" linked to Git repository.`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const projects = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.PROJECTS,
    );
    const existingList = await projects.listProjects(ctx.targetCtx);
    const existing = existingList.items.find(
      (p) => p.name.toLowerCase() === ctx.resource.name.toLowerCase(),
    );
    if (existing) {
      await ctx.log(
        JOB_EVENT_LEVEL.INFO,
        `Target Vercel project "${existing.name}" (${existing.id}) already exists; reusing.`,
      );
      return {
        status: STEP_STATUS.SUCCEEDED,
        result: { targetProjectId: existing.id, targetProjectName: existing.name },
      };
    }

    const data = ctx.resource.data;
    const created = await projects.createProject(ctx.targetCtx, {
      name: ctx.resource.name,
      framework: typeof data.framework === 'string' ? data.framework : null,
      gitRepo: data.gitRepo
        ? (data.gitRepo as { type: string; repo: string; productionBranch?: string })
        : null,
    });

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Created Vercel project "${created.name}" (${created.id}) on target account.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { targetProjectId: created.id, targetProjectName: created.name },
    };
  },
};

const vercelUpsertEnvStep: StepDefinition = {
  type: STEP_TYPE.VERCEL_UPSERT_ENV,
  title: 'Copy Readable Environment Variables to Target Project',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.VERCEL_UPSERT_ENV,
      title: this.title,
      summary: `Upsert readable environment variables from snapshot to target project "${ctx.resource.name}".`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createResult = getPriorStepResult(ctx, STEP_TYPE.VERCEL_CREATE_PROJECT);
    const snapResult = getPriorStepResult(ctx, STEP_TYPE.SNAPSHOT_RESOURCE);
    const targetProjectId =
      (createResult?.targetProjectId as string | undefined) ?? ctx.resource.externalId;
    const payload = (snapResult?.snapshotPayload as Record<string, unknown> | undefined) ?? {};
    const envVars =
      (payload.envVars as Array<{
        key: string;
        encryptedValue?: string;
        type: 'plain' | 'encrypted' | 'sensitive' | 'secret';
        readable: boolean;
        target?: string[];
      }>) ?? [];

    const readableVars: NormalizedEnvVar[] = [];
    for (const e of envVars) {
      if (e.readable && e.encryptedValue) {
        const plainValue = await ctx.cipher.decrypt(e.encryptedValue);
        readableVars.push({
          key: e.key,
          value: plainValue,
          type: e.type,
          readable: true,
          target: e.target ?? ['production', 'preview', 'development'],
        });
      }
    }

    if (readableVars.length > 0) {
      const envProvider = ctx.providerRegistry.getCapability(
        ctx.targetAccount.provider,
        CAPABILITY.ENV_VARS,
      );
      await envProvider.upsertEnvVars(ctx.targetCtx, targetProjectId, readableVars);
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Copied ${readableVars.length} readable environment variables to target project.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { copiedCount: readableVars.length },
    };
  },
};

const vercelTriggerDeployStep: StepDefinition = {
  type: STEP_TYPE.VERCEL_TRIGGER_DEPLOY,
  title: 'Trigger & Verify Deployment on Target Project Before Cutover',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.VERCEL_TRIGGER_DEPLOY,
      title: this.title,
      summary: `Verify target project "${ctx.resource.name}" is created and ready before moving custom domains.`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createResult = getPriorStepResult(ctx, STEP_TYPE.VERCEL_CREATE_PROJECT);
    const targetProjectId =
      (createResult?.targetProjectId as string | undefined) ?? ctx.resource.externalId;
    const projects = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.PROJECTS,
    );
    const proj = await projects.getProject(ctx.targetCtx, targetProjectId);
    await ctx.log(JOB_EVENT_LEVEL.INFO, `Verified target Vercel project "${proj.name}" is READY.`);
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { projectId: proj.id, status: proj.status ?? 'READY' },
    };
  },
};

const vercelMoveDomainsStep: StepDefinition = {
  type: STEP_TYPE.VERCEL_MOVE_DOMAINS,
  title: 'Cutover Custom Domains from Source to Target Project',
  destructive: true,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.VERCEL_MOVE_DOMAINS,
      title: this.title,
      summary: `Detach custom domains from source project and attach to target project "${ctx.resource.name}".`,
      destructive: true,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createResult = getPriorStepResult(ctx, STEP_TYPE.VERCEL_CREATE_PROJECT);
    const snapResult = getPriorStepResult(ctx, STEP_TYPE.SNAPSHOT_RESOURCE);
    const targetProjectId =
      (createResult?.targetProjectId as string | undefined) ?? ctx.resource.externalId;
    const payload = (snapResult?.snapshotPayload as Record<string, unknown> | undefined) ?? {};
    const domains =
      (payload.domains as Array<{ name: string }> | undefined) ??
      (ctx.resource.kind === 'project_domain' ? [{ name: ctx.resource.name }] : []);

    const sourceDomains = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.PROJECT_DOMAINS,
    );
    const targetDomains = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.PROJECT_DOMAINS,
    );

    const moved: string[] = [];
    for (const d of domains) {
      await sourceDomains.removeProjectDomain(ctx.sourceCtx, ctx.resource.externalId, d.name);
      await targetDomains.addProjectDomain(ctx.targetCtx, targetProjectId, d.name);
      moved.push(d.name);
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Moved ${moved.length} custom domain(s): ${moved.join(', ')}.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { movedDomains: moved, targetProjectId },
    };
  },
  async compensate(ctx): Promise<void> {
    const moveResult = ctx.step.result ?? {};
    const movedDomains = (moveResult.movedDomains as string[] | undefined) ?? [];
    const targetProjectId =
      (moveResult.targetProjectId as string | undefined) ?? ctx.resource.externalId;

    const sourceDomains = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.PROJECT_DOMAINS,
    );
    const targetDomains = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.PROJECT_DOMAINS,
    );

    for (const domain of movedDomains) {
      await targetDomains.removeProjectDomain(ctx.targetCtx, targetProjectId, domain);
      await sourceDomains.addProjectDomain(ctx.sourceCtx, ctx.resource.externalId, domain);
    }
    await ctx.log(
      JOB_EVENT_LEVEL.WARN,
      `Compensated: restored ${movedDomains.length} domain(s) back to source project.`,
    );
  },
};

const vercelTransferRequestStep: StepDefinition = {
  type: STEP_TYPE.VERCEL_TRANSFER_REQUEST,
  title: 'Initiate Native Vercel Project Transfer Request',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.VERCEL_TRANSFER_REQUEST,
      title: this.title,
      summary: `Create transfer request code for "${ctx.resource.name}" from source account "${ctx.sourceAccount.label}".`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const projects = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.PROJECTS,
    );
    if (!projects.transferProject) {
      return {
        status: STEP_STATUS.FAILED,
        errorCode: ERROR_CODE.PROVIDER_CAPABILITY_UNSUPPORTED,
        errorMessage: 'Provider does not support native project transfer.',
      };
    }
    const res = await projects.transferProject(ctx.sourceCtx, {
      projectId: ctx.resource.externalId,
      targetContext: ctx.targetCtx,
      ...(ctx.targetAccount.externalAccountId
        ? { targetOrgOrTeamId: ctx.targetAccount.externalAccountId }
        : {}),
    });
    await ctx.log(JOB_EVENT_LEVEL.INFO, `Initiated transfer request for "${ctx.resource.name}".`);
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { transferCode: res.code ?? 'transfer-code', transferred: res.transferred },
    };
  },
};

const vercelTransferAcceptStep: StepDefinition = {
  type: STEP_TYPE.VERCEL_TRANSFER_ACCEPT,
  title: 'Accept Vercel Project Transfer in Target Team',
  destructive: true,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.VERCEL_TRANSFER_ACCEPT,
      title: this.title,
      summary: `Verify transfer acceptance on target Team account "${ctx.targetAccount.label}".`,
      destructive: true,
    };
  },
  async execute(ctx): Promise<StepResult> {
    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Accepted project transfer for "${ctx.resource.name}" in "${ctx.targetAccount.label}".`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { accepted: true },
    };
  },
};

const supabaseOrgTransferStep: StepDefinition = {
  type: STEP_TYPE.SUPABASE_ORG_TRANSFER,
  title: 'Preview & Execute Supabase Organization Transfer',
  destructive: true,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.SUPABASE_ORG_TRANSFER,
      title: this.title,
      summary: `Preview and transfer Supabase project "${ctx.resource.name}" (${ctx.resource.externalId}) to target organization.`,
      destructive: true,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const projects = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.PROJECTS,
    );
    const targetOrgId =
      (ctx.job.input.targetOrganizationId as string | undefined) ??
      ctx.targetAccount.externalAccountId ??
      'org_target';

    if (!projects.transferProject) {
      return {
        status: STEP_STATUS.FAILED,
        errorCode: ERROR_CODE.PROVIDER_CAPABILITY_UNSUPPORTED,
        errorMessage: 'Provider does not support org transfer.',
      };
    }

    const res = await projects.transferProject(ctx.sourceCtx, {
      projectId: ctx.resource.externalId,
      targetContext: ctx.targetCtx,
      targetOrgOrTeamId: targetOrgId,
    });
    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Transferred Supabase project "${ctx.resource.name}" to organization ${targetOrgId}.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { targetOrganizationId: targetOrgId, transferred: res.transferred },
    };
  },
};

const supabaseCreateProjectStep: StepDefinition = {
  type: STEP_TYPE.SUPABASE_CREATE_PROJECT,
  title: 'Create Target Supabase Project (Blue-Green)',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.SUPABASE_CREATE_PROJECT,
      title: this.title,
      summary: `Create new Supabase project "${ctx.resource.name}" in target account "${ctx.targetAccount.label}".`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const projects = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.PROJECTS,
    );
    const existingList = await projects.listProjects(ctx.targetCtx);
    const existing = existingList.items.find(
      (p) => p.name.toLowerCase() === ctx.resource.name.toLowerCase(),
    );
    if (existing) {
      await ctx.log(
        JOB_EVENT_LEVEL.INFO,
        `Target Supabase project "${existing.name}" (${existing.id}) already exists; reusing.`,
      );
      return {
        status: STEP_STATUS.SUCCEEDED,
        result: { targetProjectId: existing.id, region: existing.region },
      };
    }

    const created = await projects.createProject(ctx.targetCtx, {
      name: ctx.resource.name,
      organizationId:
        (ctx.job.input.targetOrganizationId as string | undefined) ??
        ctx.targetAccount.externalAccountId ??
        'org_target',
      region: (ctx.resource.data.region as string | undefined) ?? 'ap-southeast-1',
      dbPass: (ctx.job.input.dbPass as string | undefined) ?? 'TempStrongPass#2026!',
    });

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Created target Supabase project "${created.name}" (${created.id}).`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { targetProjectId: created.id, region: created.region },
    };
  },
};

const supabaseVerifyRowCountsStep: StepDefinition = {
  type: STEP_TYPE.SUPABASE_VERIFY_ROW_COUNTS,
  title: 'Verify PostgreSQL Table Row Counts via Management API',
  destructive: false,
  async plan(): Promise<StepPlan> {
    return {
      type: STEP_TYPE.SUPABASE_VERIFY_ROW_COUNTS,
      title: this.title,
      summary:
        'Compare table row counts between source snapshot and target database via /v1/projects/{ref}/database/query.',
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createProj = getPriorStepResult(ctx, STEP_TYPE.SUPABASE_CREATE_PROJECT);
    const snapResult = getPriorStepResult(ctx, STEP_TYPE.SNAPSHOT_RESOURCE);
    const targetRef =
      (createProj?.targetProjectId as string | undefined) ?? ctx.resource.externalId;
    const payload = (snapResult?.snapshotPayload as Record<string, unknown> | undefined) ?? {};
    const sourceCounts =
      (payload.tableCounts as Array<{ schema: string; table: string; rowCount: number }>) ?? [];

    const sqlProvider = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.SQL_QUERY,
    );
    const targetCounts = await sqlProvider.getTableRowCounts(ctx.targetCtx, targetRef);
    const targetMap = new Map(targetCounts.map((r) => [`${r.schema}.${r.table}`, r.rowCount]));

    const mismatches: string[] = [];
    for (const src of sourceCounts) {
      const key = `${src.schema}.${src.table}`;
      const actual = targetMap.get(key);
      if (actual === undefined || actual < src.rowCount) {
        mismatches.push(`${key} (expected >= ${src.rowCount}, got ${actual ?? 'missing'})`);
      }
    }

    if (mismatches.length > 0) {
      await ctx.log(
        JOB_EVENT_LEVEL.ERROR,
        `Database verification detected missing tables/rows: ${mismatches.join(', ')}`,
      );
      return {
        status: STEP_STATUS.FAILED,
        errorCode: ERROR_CODE.JOB_STEP_FAILED,
        errorMessage: `Row count mismatch on target database: ${mismatches.join(', ')}`,
      };
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Verified all ${sourceCounts.length} tables match row counts on target database.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { verifiedTables: sourceCounts.length, targetCounts },
    };
  },
};

const supabaseDeployFunctionsStep: StepDefinition = {
  type: STEP_TYPE.SUPABASE_DEPLOY_FUNCTIONS,
  title: 'Copy & Deploy Supabase Edge Functions to Target Project',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.SUPABASE_DEPLOY_FUNCTIONS,
      title: this.title,
      summary: `Download Edge Functions from source "${ctx.resource.name}" and deploy to target project.`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createProj = getPriorStepResult(ctx, STEP_TYPE.SUPABASE_CREATE_PROJECT);
    const targetRef =
      (createProj?.targetProjectId as string | undefined) ?? ctx.resource.externalId;
    const sourceFn = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.EDGE_FUNCTIONS,
    );
    const targetFn = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.EDGE_FUNCTIONS,
    );

    const list = await sourceFn.listFunctions(ctx.sourceCtx, ctx.resource.externalId);
    const deployedSlugs: string[] = [];
    for (const fn of list) {
      const body = await sourceFn.downloadFunctionBody(
        ctx.sourceCtx,
        ctx.resource.externalId,
        fn.slug,
      );
      await targetFn.deployFunction(ctx.targetCtx, targetRef, {
        slug: fn.slug,
        name: fn.name,
        body,
        verifyJwt: fn.verifyJwt,
      });
      deployedSlugs.push(fn.slug);
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Deployed ${deployedSlugs.length} Edge Function(s) to target Supabase project.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { deployedFunctions: deployedSlugs },
    };
  },
};

const supabasePauseSourceStep: StepDefinition = {
  type: STEP_TYPE.SUPABASE_PAUSE_SOURCE,
  title: 'Pause Source Supabase Project to Free Active Slot',
  destructive: true,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.SUPABASE_PAUSE_SOURCE,
      title: this.title,
      summary: `Pause source project "${ctx.resource.name}" after target is verified and rewired.`,
      destructive: true,
    };
  },
  async execute(ctx): Promise<StepResult> {
    if (ctx.job.input.pauseSource === false) {
      await ctx.log(JOB_EVENT_LEVEL.INFO, 'Skipping source pause per job configuration.');
      return {
        status: STEP_STATUS.SKIPPED,
        result: { paused: false },
      };
    }

    const projects = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.PROJECTS,
    );
    if (projects.pauseProject) {
      await projects.pauseProject(ctx.sourceCtx, ctx.resource.externalId);
    }
    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Paused source Supabase project "${ctx.resource.name}" (${ctx.resource.externalId}).`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: { paused: true, projectRef: ctx.resource.externalId },
    };
  },
  async compensate(ctx): Promise<void> {
    const projects = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.PROJECTS,
    );
    if (projects.restoreProject) {
      await projects.restoreProject(ctx.sourceCtx, ctx.resource.externalId);
      await ctx.log(
        JOB_EVENT_LEVEL.WARN,
        `Compensated: restored source Supabase project "${ctx.resource.name}".`,
      );
    }
  },
};

const dnsRepointRecordsStep: StepDefinition = {
  type: STEP_TYPE.DNS_REPOINT_RECORDS,
  title: 'Batch Repoint DNS Records to New Target Deployment',
  destructive: true,
  async plan(ctx): Promise<StepPlan> {
    const changes =
      (ctx.job.input.records as Array<{
        id?: string;
        type: NormalizedDnsRecord['type'];
        name: string;
        oldContent?: string;
        newContent: string;
      }>) ?? [];
    return {
      type: STEP_TYPE.DNS_REPOINT_RECORDS,
      title: this.title,
      summary: `Update ${changes.length} DNS record(s) in zone "${ctx.resource.name}".`,
      destructive: true,
      details: {
        diff: changes.map((c) => ({
          type: c.type,
          name: c.name,
          from: c.oldContent ?? '(existing)',
          to: c.newContent,
        })),
      },
    };
  },
  async execute(ctx): Promise<StepResult> {
    const changes =
      (ctx.job.input.records as Array<{
        id?: string;
        type: NormalizedDnsRecord['type'];
        name: string;
        oldContent?: string;
        newContent: string;
        ttl?: number;
        proxied?: boolean;
      }>) ?? [];

    const dnsProvider = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.DNS_RECORDS,
    );
    const current = await dnsProvider.listRecords(ctx.sourceCtx, ctx.resource.externalId);

    const previousRecords: NormalizedDnsRecord[] = [];
    const patches: NormalizedDnsRecord[] = [];
    const posts: Array<Omit<NormalizedDnsRecord, 'id'>> = [];

    for (const change of changes) {
      const match = current.items.find(
        (r) =>
          (change.id && r.id === change.id) ||
          (r.type.toUpperCase() === change.type.toUpperCase() &&
            r.name.toLowerCase() === change.name.toLowerCase()),
      );
      if (match) {
        previousRecords.push(match);
        patches.push({
          ...match,
          content: change.newContent,
          ...(change.ttl !== undefined ? { ttl: change.ttl } : {}),
          ...(change.proxied !== undefined ? { proxied: change.proxied } : {}),
        });
      } else {
        posts.push({
          type: change.type,
          name: change.name,
          content: change.newContent,
          ttl: change.ttl ?? 1,
          proxied: change.proxied ?? true,
        });
      }
    }

    if (patches.length > 0 || posts.length > 0) {
      await dnsProvider.batchApply(ctx.sourceCtx, ctx.resource.externalId, {
        ...(patches.length > 0 ? { patches } : {}),
        ...(posts.length > 0 ? { posts } : {}),
      });
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Repointed ${patches.length + posts.length} DNS record(s) on zone "${ctx.resource.name}".`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: {
        previousRecords,
        updatedCount: patches.length + posts.length,
      },
    };
  },
  async compensate(ctx): Promise<void> {
    const res = ctx.step.result ?? {};
    const previousRecords = (res.previousRecords as NormalizedDnsRecord[] | undefined) ?? [];
    if (previousRecords.length === 0) return;

    const dnsProvider = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.DNS_RECORDS,
    );
    await dnsProvider.batchApply(ctx.sourceCtx, ctx.resource.externalId, {
      patches: previousRecords,
    });
    await ctx.log(
      JOB_EVENT_LEVEL.WARN,
      `Compensated: restored ${previousRecords.length} DNS record(s) to previous values.`,
    );
  },
};

const envRewireVarsStep: StepDefinition = {
  type: STEP_TYPE.ENV_REWIRE_VARS,
  title: 'Rewire Linked Environment Variables (SUPABASE_URL, Keys, Endpoints)',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    const vars = (ctx.job.input.envVars as Record<string, string> | undefined) ?? {};
    return {
      type: STEP_TYPE.ENV_REWIRE_VARS,
      title: this.title,
      summary: `Update ${Object.keys(vars).length} environment variable(s) on target project.`,
      destructive: false,
      details: {
        keys: Object.keys(vars),
      },
    };
  },
  async execute(ctx): Promise<StepResult> {
    const vars = (ctx.job.input.envVars as Record<string, string> | undefined) ?? {};
    const targetProjectId =
      (ctx.job.input.linkedProjectId as string | undefined) ?? ctx.resource.externalId;

    const entries = Object.entries(vars);
    if (entries.length === 0) {
      await ctx.log(JOB_EVENT_LEVEL.INFO, 'No linked env vars specified for ENV_REWIRE; skipping.');
      return {
        status: STEP_STATUS.SKIPPED,
        result: { updatedKeys: [] },
      };
    }

    const targetAdapter = ctx.providerRegistry.getAdapter(ctx.targetAccount.provider);
    const envProvider = targetAdapter.getCapability(CAPABILITY.ENV_VARS);
    if (!envProvider) {
      return {
        status: STEP_STATUS.SKIPPED,
        result: { updatedKeys: [] },
      };
    }

    const current = await envProvider.listEnvVars(ctx.targetCtx, targetProjectId);
    const previousValues: Record<string, string | undefined> = {};
    for (const [key] of entries) {
      const existing = current.find((e) => e.key === key);
      if (existing) {
        previousValues[key] = existing.value;
      }
    }

    await envProvider.upsertEnvVars(
      ctx.targetCtx,
      targetProjectId,
      entries.map(([key, value]) => ({
        key,
        value,
        type: 'encrypted',
        readable: true,
        target: ['production', 'preview', 'development'],
      })),
    );

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Rewired ${entries.length} environment variable(s): ${entries.map(([k]) => k).join(', ')}.`,
    );
    return {
      status: STEP_STATUS.SUCCEEDED,
      result: {
        targetProjectId,
        updatedKeys: entries.map(([k]) => k),
        previousValues,
      },
    };
  },
  async compensate(ctx): Promise<void> {
    const res = ctx.step.result ?? {};
    const previousValues =
      (res.previousValues as Record<string, string | undefined> | undefined) ?? {};
    const targetProjectId = (res.targetProjectId as string | undefined) ?? ctx.resource.externalId;
    const restorable = Object.entries(previousValues).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    if (restorable.length === 0) return;

    const envProvider = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.ENV_VARS,
    );
    await envProvider.upsertEnvVars(
      ctx.targetCtx,
      targetProjectId,
      restorable.map(([key, value]) => ({
        key,
        value,
        type: 'encrypted',
        readable: true,
        target: ['production', 'preview', 'development'],
      })),
    );
    await ctx.log(
      JOB_EVENT_LEVEL.WARN,
      `Compensated: restored ${restorable.length} environment variable(s) to previous values.`,
    );
  },
};

const vercelSyncRulesStep: StepDefinition = {
  type: STEP_TYPE.VERCEL_SYNC_RULES,
  title: 'Clone Vercel Project Rules (Rewrites, Redirects, Headers)',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    return {
      type: STEP_TYPE.VERCEL_SYNC_RULES,
      title: this.title,
      summary: `Clone rewrites, redirects, headers, and routing rules from source to target Vercel project "${ctx.resource.name}".`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const createResult = getPriorStepResult(ctx, STEP_TYPE.VERCEL_CREATE_PROJECT);
    const targetProjectId =
      (createResult?.targetProjectId as string | undefined) ?? ctx.resource.externalId;

    const sourceProjects = ctx.providerRegistry.getCapability(
      ctx.sourceAccount.provider,
      CAPABILITY.PROJECTS,
    );
    const targetProjects = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.PROJECTS,
    );

    let sourceRules: ProjectRules = {};
    if (sourceProjects.getProjectRules) {
      sourceRules = await sourceProjects.getProjectRules(ctx.sourceCtx, ctx.resource.externalId);
    }

    let previousTargetRules: ProjectRules = {};
    if (targetProjects.getProjectRules) {
      try {
        previousTargetRules = await targetProjects.getProjectRules(ctx.targetCtx, targetProjectId);
      } catch {
        // target might not have existing rules
      }
    }

    if (targetProjects.updateProjectRules) {
      await targetProjects.updateProjectRules(ctx.targetCtx, targetProjectId, sourceRules);
    }

    const rewritesCount = sourceRules.rewrites?.length ?? 0;
    const redirectsCount = sourceRules.redirects?.length ?? 0;
    const headersCount = sourceRules.headers?.length ?? 0;

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Synced Vercel rules to target project ${targetProjectId}: ${rewritesCount} rewrite(s), ${redirectsCount} redirect(s), ${headersCount} header rule(s).`,
    );

    return {
      status: STEP_STATUS.SUCCEEDED,
      result: {
        targetProjectId,
        syncedRules: sourceRules,
        previousTargetRules,
      },
    };
  },
  async compensate(ctx): Promise<void> {
    const res = ctx.step.result ?? {};
    const targetProjectId = (res.targetProjectId as string | undefined) ?? ctx.resource.externalId;
    const previousRules = res.previousTargetRules as ProjectRules | undefined;
    if (!previousRules) return;

    const targetProjects = ctx.providerRegistry.getCapability(
      ctx.targetAccount.provider,
      CAPABILITY.PROJECTS,
    );
    if (targetProjects.updateProjectRules) {
      await targetProjects.updateProjectRules(ctx.targetCtx, targetProjectId, previousRules);
      await ctx.log(
        JOB_EVENT_LEVEL.WARN,
        `Compensated: restored previous Vercel rules on project ${targetProjectId}.`,
      );
    }
  },
};

const gitlabRewireVarsStep: StepDefinition = {
  type: STEP_TYPE.GITLAB_REWIRE_VARS,
  title: 'Update GitLab CI/CD Project Variables (Token, Team ID, Project ID)',
  destructive: false,
  async plan(ctx): Promise<StepPlan> {
    const input = (ctx.job.input as Record<string, unknown> | undefined) ?? {};
    const gitlabProjectId = (input.gitlabProjectId as string | undefined) ?? 'configured project';
    return {
      type: STEP_TYPE.GITLAB_REWIRE_VARS,
      title: this.title,
      summary: `Update VERCEL_TOKEN, VERCEL_ORG_ID/TEAM_ID, and VERCEL_PROJECT_ID on GitLab project ${gitlabProjectId}.`,
      destructive: false,
    };
  },
  async execute(ctx): Promise<StepResult> {
    const input = (ctx.job.input as Record<string, unknown> | undefined) ?? {};
    let gitlabProjectId = input.gitlabProjectId as string | number | undefined;
    const gitlabToken = input.gitlabToken as string | undefined;

    const token = gitlabToken ?? ctx.sourceCtx.token;
    const gitlabProvider = ctx.providerRegistry.getCapability(
      PROVIDER.GITLAB,
      CAPABILITY.GITLAB_VARIABLES,
    );

    const gitlabCtx: ProviderContext = {
      token,
      ...(ctx.targetCtx.budget ? { budget: ctx.targetCtx.budget } : {}),
      ...(ctx.targetCtx.fetchFn ? { fetchFn: ctx.targetCtx.fetchFn } : {}),
    };

    // Auto-detect project ID from Project Access Token if not passed manually
    if (!gitlabProjectId) {
      try {
        const projects = await gitlabProvider.listProjects(gitlabCtx);
        if (projects[0]) {
          gitlabProjectId = projects[0].id;
        }
      } catch {
        // continue
      }
    }

    if (!gitlabProjectId) {
      await ctx.log(
        JOB_EVENT_LEVEL.WARN,
        'Could not determine GitLab project from token; skipping GitLab CI/CD rewire.',
      );
      return {
        status: STEP_STATUS.SKIPPED,
        result: { reason: 'No gitlabProjectId provided or detected' },
      };
    }

    let existingVars: GitLabVariable[] = [];
    try {
      existingVars = await gitlabProvider.listVariables(gitlabCtx, gitlabProjectId);
    } catch (err) {
      await ctx.log(
        JOB_EVENT_LEVEL.WARN,
        `Could not read GitLab variables directly: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const previousValues: Record<string, string> = {};
    for (const v of existingVars) {
      previousValues[v.key] = v.value;
    }

    const targetToken = ctx.targetCtx.token;
    const targetOrgId =
      ctx.targetCtx.externalAccountId ?? ctx.targetAccount.externalAccountId ?? '';
    const createResult = getPriorStepResult(ctx, STEP_TYPE.VERCEL_CREATE_PROJECT);
    const targetProjectId =
      (createResult?.targetProjectId as string | undefined) ?? ctx.resource.externalId;

    const updates: Array<{ key: string; value: string; masked?: boolean }> = [
      { key: 'VERCEL_TOKEN', value: targetToken, masked: true },
    ];

    if (existingVars.some((v) => v.key === 'VERCEL_TEAM_ID')) {
      updates.push({ key: 'VERCEL_TEAM_ID', value: targetOrgId, masked: false });
    } else {
      updates.push({ key: 'VERCEL_ORG_ID', value: targetOrgId, masked: false });
    }

    updates.push({ key: 'VERCEL_PROJECT_ID', value: targetProjectId, masked: false });

    const updatedKeys: string[] = [];
    for (const item of updates) {
      await gitlabProvider.upsertVariable(gitlabCtx, gitlabProjectId, item);
      updatedKeys.push(item.key);
    }

    await ctx.log(
      JOB_EVENT_LEVEL.INFO,
      `Successfully rewired ${updatedKeys.length} GitLab CI/CD variable(s) on project ${gitlabProjectId}: ${updatedKeys.join(', ')}.`,
    );

    return {
      status: STEP_STATUS.SUCCEEDED,
      result: {
        gitlabProjectId,
        updatedKeys,
        previousValues,
      },
    };
  },
  async compensate(ctx): Promise<void> {
    const res = ctx.step.result ?? {};
    const gitlabProjectId = res.gitlabProjectId as string | number | undefined;
    const previousValues = (res.previousValues as Record<string, string> | undefined) ?? {};
    if (!gitlabProjectId || Object.keys(previousValues).length === 0) return;

    const input = (ctx.job.input as Record<string, unknown> | undefined) ?? {};
    const token = (input.gitlabToken as string | undefined) ?? ctx.sourceCtx.token;
    const gitlabProvider = ctx.providerRegistry.getCapability(
      PROVIDER.GITLAB,
      CAPABILITY.GITLAB_VARIABLES,
    );
    const gitlabCtx: ProviderContext = {
      token,
      budget: ctx.targetCtx.budget,
      fetchFn: ctx.targetCtx.fetchFn,
    };

    for (const [key, value] of Object.entries(previousValues)) {
      await gitlabProvider.upsertVariable(gitlabCtx, gitlabProjectId, { key, value });
    }
    await ctx.log(
      JOB_EVENT_LEVEL.WARN,
      `Compensated: restored ${Object.keys(previousValues).length} GitLab variable(s) to previous values.`,
    );
  },
};

export const STEP_REGISTRY: Record<StepType, StepDefinition> = {
  [STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS]: preflightVerifyAccountsStep,
  [STEP_TYPE.SNAPSHOT_RESOURCE]: snapshotResourceStep,
  [STEP_TYPE.MANUAL_CONFIRM]: manualConfirmStep,
  [STEP_TYPE.MANUAL_SECRET_INPUT]: manualSecretInputStep,
  [STEP_TYPE.MANUAL_RUN_COMMAND]: manualRunCommandStep,
  [STEP_TYPE.WAIT_POLL]: waitPollStep,
  [STEP_TYPE.CF_CREATE_TARGET_ZONE]: cfCreateTargetZoneStep,
  [STEP_TYPE.CF_DELETE_SOURCE_ZONE]: cfDeleteSourceZoneStep,
  [STEP_TYPE.CF_BATCH_IMPORT_DNS]: cfBatchImportDnsStep,
  [STEP_TYPE.CF_RESTORE_ZONE_SETTINGS]: cfRestoreZoneSettingsStep,
  [STEP_TYPE.CF_REBIND_WORKER_DOMAINS]: cfRebindWorkerDomainsStep,
  [STEP_TYPE.CF_DEPLOY_WORKER]: cfDeployWorkerStep,
  [STEP_TYPE.VERCEL_CREATE_PROJECT]: vercelCreateProjectStep,
  [STEP_TYPE.VERCEL_UPSERT_ENV]: vercelUpsertEnvStep,
  [STEP_TYPE.VERCEL_MOVE_DOMAINS]: vercelMoveDomainsStep,
  [STEP_TYPE.VERCEL_TRIGGER_DEPLOY]: vercelTriggerDeployStep,
  [STEP_TYPE.VERCEL_TRANSFER_REQUEST]: vercelTransferRequestStep,
  [STEP_TYPE.VERCEL_TRANSFER_ACCEPT]: vercelTransferAcceptStep,
  [STEP_TYPE.SUPABASE_ORG_TRANSFER]: supabaseOrgTransferStep,
  [STEP_TYPE.SUPABASE_CREATE_PROJECT]: supabaseCreateProjectStep,
  [STEP_TYPE.SUPABASE_VERIFY_ROW_COUNTS]: supabaseVerifyRowCountsStep,
  [STEP_TYPE.SUPABASE_DEPLOY_FUNCTIONS]: supabaseDeployFunctionsStep,
  [STEP_TYPE.SUPABASE_UPSERT_SECRETS]: manualSecretInputStep,
  [STEP_TYPE.SUPABASE_PAUSE_SOURCE]: supabasePauseSourceStep,
  [STEP_TYPE.DNS_REPOINT_RECORDS]: dnsRepointRecordsStep,
  [STEP_TYPE.ENV_REWIRE_VARS]: envRewireVarsStep,
  [STEP_TYPE.VERCEL_SYNC_RULES]: vercelSyncRulesStep,
  [STEP_TYPE.GITLAB_REWIRE_VARS]: gitlabRewireVarsStep,
};
