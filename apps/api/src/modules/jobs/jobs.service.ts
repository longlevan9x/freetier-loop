import { user } from '@freetier-loop/db';
import {
  AppError,
  type CreateJobInput,
  ERROR_CODE,
  ID_PREFIX,
  JOB_EVENT_LEVEL,
  JOB_STATUS,
  type JobDto,
  type JobEventDto,
  type JobEventLevel,
  type JobStepDto,
  type ManualStepInput,
  PROVIDER,
  STEP_STATUS,
  newId,
} from '@freetier-loop/shared';
import { eq } from 'drizzle-orm';
import {
  type JobRow,
  type JobStepRow,
  STEP_TYPE,
  type StepContext,
  type StepType,
  type TemplateCatalogItem,
} from '../../jobs/job.types';
import { STEP_REGISTRY } from '../../jobs/steps';
import {
  type StrategyRecommendation,
  StrategyResolver,
  type TargetAccountScore,
} from '../../jobs/strategy-resolver';
import { MIGRATION_TEMPLATE_CATALOG } from '../../jobs/templates';
import type { SecretCipher } from '../../platform/crypto';
import type { AppDatabase } from '../../platform/db';
import type { ProviderRegistry } from '../../providers/registry';
import type { AuditService } from '../audit/audit.service';
import type { ProviderAccountsRepository } from '../provider-accounts/provider-accounts.repository';
import type { ResourcesRepository } from '../resources/resources.repository';
import type { SnapshotsService } from '../snapshots/snapshots.service';
import type { JobsRepository } from './jobs.repository';

export class JobsService {
  private readonly inFlightJobIds = new Set<string>();
  private readonly strategyResolver = new StrategyResolver();

  constructor(
    private readonly db: AppDatabase,
    private readonly repo: JobsRepository,
    private readonly accountsRepo: ProviderAccountsRepository,
    private readonly resourcesRepo: ResourcesRepository,
    private readonly snapshotsService: SnapshotsService,
    private readonly providerRegistry: ProviderRegistry,
    private readonly cipher: SecretCipher,
    private readonly auditService: AuditService,
    private readonly selfProtectedHosts: string[] = [],
    private readonly fetchFn?: typeof fetch,
  ) {}

  listTemplates(): TemplateCatalogItem[] {
    return Object.values(MIGRATION_TEMPLATE_CATALOG);
  }

  async recommendStrategy(input: {
    resourceId: string;
    sourceAccountId: string;
    targetAccountId: string;
    sameSupabaseUser?: boolean | undefined;
  }): Promise<{
    strategy: StrategyRecommendation;
    targetRecommendations: TargetAccountScore[];
  }> {
    const resource = await this.resourcesRepo.findById(input.resourceId);
    if (!resource) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Resource not found');
    }
    const sourceAccount = await this.accountsRepo.findById(input.sourceAccountId);
    const targetAccount = await this.accountsRepo.findById(input.targetAccountId);
    if (!sourceAccount || !targetAccount) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Provider account not found');
    }
    const allAccounts = await this.accountsRepo.list();

    const strategy = this.strategyResolver.resolve({
      resource,
      sourceAccount,
      targetAccount,
      ...(input.sameSupabaseUser !== undefined ? { sameSupabaseUser: input.sameSupabaseUser } : {}),
    });

    const targetRecommendations = this.strategyResolver.recommendTargetAccounts({
      sourceAccountId: sourceAccount.id,
      provider: sourceAccount.provider,
      candidates: allAccounts,
    });

    return { strategy, targetRecommendations };
  }

  async list(): Promise<JobDto[]> {
    const rows = await this.repo.listJobs();
    const result: JobDto[] = [];
    for (const row of rows) {
      const steps = await this.repo.listSteps(row.id);
      result.push(this.toJobDto(row, steps));
    }
    return result;
  }

  async getById(id: string): Promise<JobDto> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Job not found');
    }
    const steps = await this.repo.listSteps(row.id);
    return this.toJobDto(row, steps);
  }

  async listEvents(jobId: string): Promise<JobEventDto[]> {
    await this.getById(jobId);
    const rows = await this.repo.listEvents(jobId);
    return rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      stepId: r.stepId ?? null,
      level: r.level,
      message: r.message,
      data: r.data ?? null,
      createdAt: r.createdAt.getTime(),
    }));
  }

  private async ensureCreatorUserExists(actorUserId: string): Promise<string> {
    const existing = await this.db.select().from(user).where(eq(user.id, actorUserId)).limit(1);
    if (existing[0]) {
      return existing[0].id;
    }
    const anyUser = await this.db.select().from(user).limit(1);
    if (anyUser[0]) {
      return anyUser[0].id;
    }
    const now = new Date();
    await this.db.insert(user).values({
      id: actorUserId,
      name: 'System Operator',
      email: `${actorUserId}@local.internal`,
      emailVerified: true,
      banned: false,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    });
    return actorUserId;
  }

  async create(input: CreateJobInput, actorUserId: string): Promise<JobDto> {
    const resource = await this.resourcesRepo.findById(input.resourceId);
    if (!resource) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Resource not found');
    }

    const normalizedName = resource.name.toLowerCase();
    const isSelfProtected = this.selfProtectedHosts.some(
      (h) => normalizedName === h.toLowerCase() || normalizedName.endsWith(`.${h.toLowerCase()}`),
    );
    if (isSelfProtected) {
      throw new AppError(
        ERROR_CODE.RESOURCE_SELF_PROTECTED,
        `Resource "${resource.name}" is self-protected and cannot be migrated.`,
      );
    }

    const srcAcc = await this.accountsRepo.findById(input.sourceAccountId);
    const dstAcc = await this.accountsRepo.findById(input.targetAccountId);
    if (!srcAcc || !dstAcc) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Source or target account not found');
    }

    const validUserId = await this.ensureCreatorUserExists(actorUserId);
    const templateCatalog = MIGRATION_TEMPLATE_CATALOG[input.template];
    const now = new Date();
    const jobId = newId(ID_PREFIX.JOB);

    const customStepTypes = (input.input as Record<string, unknown> | undefined)?.customStepTypes as
      | StepType[]
      | undefined;

    let stepTypesToRun: StepType[];
    if (customStepTypes && Array.isArray(customStepTypes) && customStepTypes.length > 0) {
      stepTypesToRun = [
        STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS,
        STEP_TYPE.SNAPSHOT_RESOURCE,
        ...customStepTypes.filter(
          (t) => t !== STEP_TYPE.PREFLIGHT_VERIFY_ACCOUNTS && t !== STEP_TYPE.SNAPSHOT_RESOURCE,
        ),
      ];
    } else {
      stepTypesToRun = templateCatalog.defaultSteps.map((s) => s.type);
    }

    const stepInserts = stepTypesToRun.map((type, index) => {
      const def = STEP_REGISTRY[type];
      return {
        id: newId(ID_PREFIX.JOB_STEP),
        jobId,
        position: index,
        type,
        title: def ? def.title : type,
        destructive: def ? def.destructive : false,
        status: STEP_STATUS.PENDING,
        cursor: null,
        result: null,
        errorCode: null,
        errorMessage: null,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };
    });

    const created = await this.repo.createJob(
      {
        id: jobId,
        template: input.template,
        status: JOB_STATUS.DRAFT,
        sourceAccountId: input.sourceAccountId,
        targetAccountId: input.targetAccountId,
        resourceId: resource.id,
        resourceName: resource.name,
        input: input.input ?? {},
        plan: null,
        confirmedAt: null,
        createdBy: validUserId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      stepInserts,
    );

    await this.logEvent(jobId, null, JOB_EVENT_LEVEL.INFO, `Created job (${input.template}).`);
    await this.auditService.record({
      userId: validUserId,
      action: 'job.create',
      targetType: 'job',
      targetId: jobId,
      meta: {
        template: input.template,
        resourceName: resource.name,
      },
    });

    const steps = await this.repo.listSteps(jobId);
    return this.toJobDto(created, steps);
  }

  async plan(jobId: string, actorUserId: string): Promise<JobDto> {
    const job = await this.repo.findById(jobId);
    if (!job) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Job not found');
    }
    const steps = await this.repo.listSteps(jobId);
    const stepPlans = [];

    for (const step of steps) {
      const def = STEP_REGISTRY[step.type as StepType];
      if (!def) continue;
      const ctx = await this.buildStepContext(job, step, steps);
      const planned = await def.plan(ctx);
      stepPlans.push(planned);
    }

    const planSummary = {
      template: job.template,
      resourceName: job.resourceName,
      destructive: stepPlans.some((p) => p.destructive),
      steps: stepPlans,
      generatedAt: Date.now(),
    };

    await this.repo.updateJobWithVersion(job.id, job.version, {
      status: JOB_STATUS.PLANNED,
      plan: planSummary,
    });

    await this.logEvent(
      job.id,
      null,
      JOB_EVENT_LEVEL.INFO,
      `Generated execution plan with ${stepPlans.length} steps.`,
    );
    await this.auditService.record({
      userId: job.createdBy || actorUserId,
      action: 'job.plan',
      targetType: 'job',
      targetId: job.id,
    });

    return this.getById(job.id);
  }

  async confirm(jobId: string, confirmText: string, actorUserId: string): Promise<JobDto> {
    const job = await this.repo.findById(jobId);
    if (!job) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Job not found');
    }
    if (confirmText.trim() !== job.resourceName) {
      throw new AppError(
        ERROR_CODE.CONFIRMATION_MISMATCH,
        `Confirmation text must match "${job.resourceName}"`,
      );
    }
    if (job.status !== JOB_STATUS.DRAFT && job.status !== JOB_STATUS.PLANNED) {
      throw new AppError(
        ERROR_CODE.JOB_INVALID_STATE,
        `Cannot confirm job in status "${job.status}"`,
      );
    }

    const updated = await this.repo.updateJobWithVersion(job.id, job.version, {
      status: JOB_STATUS.RUNNING,
      confirmedAt: new Date(),
    });
    if (!updated) {
      throw new AppError(
        ERROR_CODE.JOB_CONCURRENT_MODIFICATION,
        'Concurrent modification on job confirmation',
      );
    }

    await this.logEvent(
      job.id,
      null,
      JOB_EVENT_LEVEL.INFO,
      `Job confirmed for resource "${job.resourceName}".`,
    );
    await this.auditService.record({
      userId: job.createdBy || actorUserId,
      action: 'job.confirm',
      targetType: 'job',
      targetId: job.id,
      meta: { resourceName: job.resourceName },
    });

    return this.getById(job.id);
  }

  async advance(jobId: string, actorUserId: string): Promise<JobDto> {
    if (this.inFlightJobIds.has(jobId)) {
      throw new AppError(
        ERROR_CODE.JOB_CONCURRENT_MODIFICATION,
        'Job advance is already in progress',
      );
    }

    this.inFlightJobIds.add(jobId);
    try {
      const job = await this.repo.findById(jobId);
      if (!job) {
        throw new AppError(ERROR_CODE.NOT_FOUND, 'Job not found');
      }

      if (
        job.status === JOB_STATUS.COMPLETED ||
        job.status === JOB_STATUS.CANCELLED ||
        job.status === JOB_STATUS.FAILED ||
        job.status === JOB_STATUS.WAITING_MANUAL
      ) {
        return this.getById(job.id);
      }

      const locked = await this.repo.updateJobWithVersion(job.id, job.version, {
        status: JOB_STATUS.RUNNING,
      });
      if (!locked) {
        throw new AppError(
          ERROR_CODE.JOB_CONCURRENT_MODIFICATION,
          'Concurrent job advance detected',
        );
      }

      const currentJob = await this.repo.findById(jobId);
      if (!currentJob) {
        throw new AppError(ERROR_CODE.NOT_FOUND, 'Job not found');
      }
      const steps = await this.repo.listSteps(jobId);
      const nextStep = steps.find(
        (s) => s.status === STEP_STATUS.RUNNING || s.status === STEP_STATUS.PENDING,
      );

      if (!nextStep) {
        await this.repo.updateJobWithVersion(currentJob.id, currentJob.version, {
          status: JOB_STATUS.COMPLETED,
        });
        await this.logEvent(jobId, null, JOB_EVENT_LEVEL.INFO, 'All migration steps completed.');
        await this.auditService.record({
          userId: currentJob.createdBy || actorUserId,
          action: 'job.complete',
          targetType: 'job',
          targetId: jobId,
        });
        return this.getById(jobId);
      }

      await this.executeSingleStep(currentJob, nextStep, steps, actorUserId);
      return this.getById(jobId);
    } finally {
      this.inFlightJobIds.delete(jobId);
    }
  }

  async submitManualInput(
    jobId: string,
    stepId: string,
    input: ManualStepInput,
    actorUserId: string,
  ): Promise<JobDto> {
    const job = await this.repo.findById(jobId);
    if (!job) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Job not found');
    }
    const steps = await this.repo.listSteps(jobId);
    const step = steps.find((s) => s.id === stepId);
    if (!step) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Job step not found');
    }

    await this.executeSingleStep(job, step, steps, actorUserId, input);
    await this.auditService.record({
      userId: job.createdBy || actorUserId,
      action: 'job.manual_input',
      targetType: 'job',
      targetId: jobId,
      meta: {
        stepId,
        stepType: step.type,
        providedKeyCount: Object.keys(input.values).length,
      },
    });
    return this.getById(jobId);
  }

  async retry(jobId: string, actorUserId: string): Promise<JobDto> {
    const job = await this.repo.findById(jobId);
    if (!job) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Job not found');
    }
    const steps = await this.repo.listSteps(jobId);
    for (const step of steps) {
      if (step.status === STEP_STATUS.FAILED) {
        await this.repo.updateStep(step.id, {
          status: STEP_STATUS.PENDING,
          errorCode: null,
          errorMessage: null,
        });
      }
    }

    await this.repo.updateJobWithVersion(job.id, job.version, {
      status: JOB_STATUS.RUNNING,
    });
    await this.logEvent(job.id, null, JOB_EVENT_LEVEL.INFO, 'Job retry requested by operator.');
    await this.auditService.record({
      userId: job.createdBy || actorUserId,
      action: 'job.retry',
      targetType: 'job',
      targetId: job.id,
    });
    return this.getById(job.id);
  }

  async cancel(jobId: string, actorUserId: string): Promise<JobDto> {
    const job = await this.repo.findById(jobId);
    if (!job) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Job not found');
    }
    await this.repo.updateJobWithVersion(job.id, job.version, {
      status: JOB_STATUS.CANCELLED,
    });
    await this.logEvent(job.id, null, JOB_EVENT_LEVEL.WARN, 'Job cancelled by operator.');
    await this.auditService.record({
      userId: job.createdBy || actorUserId,
      action: 'job.cancel',
      targetType: 'job',
      targetId: job.id,
    });
    return this.getById(job.id);
  }

  async compensate(jobId: string, actorUserId: string): Promise<JobDto> {
    const job = await this.repo.findById(jobId);
    if (!job) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Job not found');
    }
    const steps = await this.repo.listSteps(jobId);
    const completedSteps = [...steps].filter((s) => s.status === STEP_STATUS.SUCCEEDED).reverse();

    for (const step of completedSteps) {
      const def = STEP_REGISTRY[step.type as StepType];
      if (!def?.compensate) continue;
      const ctx = await this.buildStepContext(job, step, steps);
      await def.compensate(ctx);
    }

    await this.repo.updateJobWithVersion(job.id, job.version, {
      status: JOB_STATUS.CANCELLED,
    });
    await this.logEvent(
      job.id,
      null,
      JOB_EVENT_LEVEL.WARN,
      'Executed rollback compensation for completed steps.',
    );
    await this.auditService.record({
      userId: job.createdBy || actorUserId,
      action: 'job.compensate',
      targetType: 'job',
      targetId: job.id,
    });
    return this.getById(job.id);
  }

  private async executeSingleStep(
    job: JobRow,
    step: JobStepRow,
    allSteps: JobStepRow[],
    actorUserId: string,
    manualInput?: ManualStepInput,
  ): Promise<void> {
    const def = STEP_REGISTRY[step.type as StepType] ?? STEP_REGISTRY[STEP_TYPE.MANUAL_CONFIRM];
    await this.repo.updateStep(step.id, {
      status: STEP_STATUS.RUNNING,
      attempts: step.attempts + 1,
    });

    const ctx = await this.buildStepContext(job, step, allSteps, manualInput);

    try {
      const result = await def.execute(ctx);
      await this.repo.updateStep(step.id, {
        status: result.status,
        cursor: result.cursor ?? null,
        result: result.result ?? step.result ?? null,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
      });

      const refreshedJob = (await this.repo.findById(job.id)) ?? job;
      const refreshedSteps = await this.repo.listSteps(job.id);

      if (result.status === STEP_STATUS.WAITING_MANUAL) {
        await this.repo.updateJobWithVersion(refreshedJob.id, refreshedJob.version, {
          status: JOB_STATUS.WAITING_MANUAL,
        });
        return;
      }

      if (result.status === STEP_STATUS.FAILED) {
        await this.repo.updateJobWithVersion(refreshedJob.id, refreshedJob.version, {
          status: JOB_STATUS.FAILED,
        });
        return;
      }

      const allDone = refreshedSteps.every(
        (s) => s.status === STEP_STATUS.SUCCEEDED || s.status === STEP_STATUS.SKIPPED,
      );
      if (allDone) {
        await this.repo.updateJobWithVersion(refreshedJob.id, refreshedJob.version, {
          status: JOB_STATUS.COMPLETED,
        });
        await this.logEvent(
          job.id,
          null,
          JOB_EVENT_LEVEL.INFO,
          `Migration job for "${job.resourceName}" completed successfully.`,
        );
        await this.auditService.record({
          userId: job.createdBy || actorUserId,
          action: 'job.complete',
          targetType: 'job',
          targetId: job.id,
        });
      } else {
        await this.repo.updateJobWithVersion(refreshedJob.id, refreshedJob.version, {
          status: JOB_STATUS.RUNNING,
        });
      }
    } catch (error) {
      const errCode = error instanceof AppError ? error.code : ERROR_CODE.JOB_STEP_FAILED;
      const errMessage = error instanceof Error ? error.message : 'Step execution failed';

      await this.repo.updateStep(step.id, {
        status: STEP_STATUS.FAILED,
        errorCode: errCode,
        errorMessage: errMessage,
      });
      const refreshedJob = (await this.repo.findById(job.id)) ?? job;
      await this.repo.updateJobWithVersion(refreshedJob.id, refreshedJob.version, {
        status: JOB_STATUS.FAILED,
      });
      await this.logEvent(job.id, step.id, JOB_EVENT_LEVEL.ERROR, errMessage);
    }
  }

  private async buildStepContext(
    job: JobRow,
    step: JobStepRow,
    allSteps: JobStepRow[],
    manualInput?: ManualStepInput,
  ): Promise<StepContext> {
    const resource = await this.resourcesRepo.findById(job.resourceId);
    if (!resource) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Resource not found');
    }
    const sourceAccount = await this.accountsRepo.getDecryptable(job.sourceAccountId);
    const targetAccount = await this.accountsRepo.getDecryptable(job.targetAccountId);
    if (!sourceAccount || !targetAccount) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Source or target account not found');
    }

    const inputData = (job.input as Record<string, unknown> | null) ?? {};
    const gitlabAccountId = inputData.gitlabAccountId as string | undefined;
    let gitlabAccount = null;
    if (gitlabAccountId) {
      gitlabAccount = await this.accountsRepo.getDecryptable(gitlabAccountId);
    } else {
      const allAccounts = await this.accountsRepo.list();
      const firstGitLab = allAccounts.find((a) => a.provider === PROVIDER.GITLAB);
      if (firstGitLab) {
        gitlabAccount = await this.accountsRepo.getDecryptable(firstGitLab.id);
      }
    }

    const githubAccountId = inputData.githubAccountId as string | undefined;
    let githubAccount = null;
    if (githubAccountId) {
      githubAccount = await this.accountsRepo.getDecryptable(githubAccountId);
    } else {
      const allAccounts = await this.accountsRepo.list();
      const firstGitHub = allAccounts.find((a) => a.provider === PROVIDER.GITHUB);
      if (firstGitHub) {
        githubAccount = await this.accountsRepo.getDecryptable(firstGitHub.id);
      }
    }

    return {
      job,
      step,
      allSteps,
      sourceAccount,
      targetAccount,
      resource,
      sourceCtx: {
        token: sourceAccount.decryptedToken,
        externalAccountId: sourceAccount.externalAccountId,
        ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
      },
      targetCtx: {
        token: targetAccount.decryptedToken,
        externalAccountId: targetAccount.externalAccountId,
        ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
      },
      ...(gitlabAccount
        ? {
            gitlabCtx: {
              token: gitlabAccount.decryptedToken,
              externalAccountId: gitlabAccount.externalAccountId,
              ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
            },
          }
        : {}),
      ...(githubAccount
        ? {
            githubCtx: {
              token: githubAccount.decryptedToken,
              externalAccountId: githubAccount.externalAccountId,
              ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
            },
          }
        : {}),
      providerRegistry: this.providerRegistry,
      snapshotsService: this.snapshotsService,
      cipher: this.cipher,
      selfProtectedHosts: this.selfProtectedHosts,
      ...(manualInput ? { manualInput } : {}),
      log: async (level: JobEventLevel, message: string, data?: Record<string, unknown>) => {
        await this.logEvent(job.id, step.id, level, message, data);
      },
    };
  }

  private async logEvent(
    jobId: string,
    stepId: string | null,
    level: JobEventLevel,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date();
    await this.repo.insertEvent({
      id: newId(ID_PREFIX.JOB_EVENT, now.getTime()),
      jobId,
      stepId,
      level,
      message,
      data: data ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  private toStepDto(row: JobStepRow): JobStepDto {
    return {
      id: row.id,
      jobId: row.jobId,
      position: row.position,
      type: row.type,
      title: row.title,
      destructive: row.destructive,
      status: row.status,
      cursor: row.cursor ?? null,
      result: row.result ?? null,
      errorCode: row.errorCode ?? null,
      errorMessage: row.errorMessage ?? null,
      attempts: row.attempts,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  private toJobDto(row: JobRow, steps: JobStepRow[]): JobDto {
    return {
      id: row.id,
      template: row.template,
      status: row.status,
      sourceAccountId: row.sourceAccountId,
      targetAccountId: row.targetAccountId,
      resourceId: row.resourceId,
      resourceName: row.resourceName,
      input: row.input ?? {},
      plan: row.plan ?? null,
      confirmedAt: row.confirmedAt ? row.confirmedAt.getTime() : null,
      createdBy: row.createdBy,
      version: row.version,
      steps: steps.map((s) => this.toStepDto(s)),
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }
}
