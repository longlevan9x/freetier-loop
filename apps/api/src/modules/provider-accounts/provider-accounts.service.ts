import {
  ACCOUNT_STATUS,
  type AccountType,
  AppError,
  CAPABILITY,
  type CreateProviderAccountInput,
  ERROR_CODE,
  HTTP_STATUS,
  PROVIDER,
  type ProviderAccountDto,
  RESOURCE_KIND,
  type UpdateProviderAccountInput,
  WORKER_BUDGET,
} from '@freetier-loop/shared';
import type { Clock } from '../../platform/deps';
import type { UsageMetricSnapshot } from '../../providers/contracts';
import { SubrequestBudget } from '../../providers/http-client';
import type { ProviderRegistry } from '../../providers/registry';
import type { AuditService } from '../audit/audit.service';
import type { ResourcesRepository } from '../resources/resources.repository';
import type { ProviderAccountsRepository } from './provider-accounts.repository';

export class ProviderAccountsService {
  constructor(
    private readonly repo: ProviderAccountsRepository,
    private readonly resourcesRepo: ResourcesRepository,
    private readonly registry: ProviderRegistry,
    private readonly auditService: AuditService,
    private readonly clock: Clock,
    private readonly fetchFn?: typeof fetch,
  ) {}

  async list(): Promise<ProviderAccountDto[]> {
    return this.repo.list();
  }

  async getById(id: string): Promise<ProviderAccountDto> {
    const acc = await this.repo.findById(id);
    if (!acc) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Provider account "${id}" not found`);
    }
    return acc;
  }

  async create(
    input: CreateProviderAccountInput,
    userId?: string | null,
  ): Promise<ProviderAccountDto> {
    const verifier = this.registry.getCapability(input.provider, CAPABILITY.ACCOUNT_VERIFIER);
    const verified = await verifier.verify({
      token: input.apiToken,
      externalAccountId: input.externalAccountId ?? null,
      ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
    });

    if (!verified.valid) {
      throw new AppError(ERROR_CODE.PROVIDER_AUTH_INVALID, 'Provider API token is not active');
    }

    const nowMs = this.clock.nowMs();
    const created = await this.repo.create({
      provider: input.provider,
      label: input.label,
      externalAccountId: input.externalAccountId ?? verified.externalAccountId,
      accountType: input.accountType ?? verified.accountType ?? null,
      apiToken: input.apiToken,
      scopesVerified: verified.scopesVerified,
      quotaConfig: input.quotaConfig ?? null,
      nowMs,
    });

    await this.auditService.record({
      userId: userId ?? null,
      action: 'provider_account.created',
      targetType: 'provider_account',
      targetId: created.id,
      meta: {
        provider: created.provider,
        label: created.label,
        tokenLast4: created.tokenLast4,
      },
    });

    return created;
  }

  async update(
    id: string,
    input: UpdateProviderAccountInput,
    userId?: string | null,
  ): Promise<ProviderAccountDto> {
    const existing = await this.getById(id);
    const nowMs = this.clock.nowMs();

    let verifiedFields: {
      externalAccountId?: string | null;
      accountType?: AccountType | null;
      scopesVerified?: string[];
      lastVerifiedAt?: number;
    } = {};

    if (input.apiToken) {
      const verifier = this.registry.getCapability(existing.provider, CAPABILITY.ACCOUNT_VERIFIER);
      const verified = await verifier.verify({
        token: input.apiToken,
        externalAccountId: existing.externalAccountId,
        ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
      });
      if (!verified.valid) {
        throw new AppError(ERROR_CODE.PROVIDER_AUTH_INVALID, 'New API token is invalid');
      }
      verifiedFields = {
        externalAccountId: verified.externalAccountId,
        accountType: input.accountType ?? verified.accountType ?? null,
        scopesVerified: verified.scopesVerified,
        lastVerifiedAt: nowMs,
      };
    }

    const updated = await this.repo.update(
      id,
      {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.apiToken !== undefined ? { apiToken: input.apiToken } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.quotaConfig !== undefined ? { quotaConfig: input.quotaConfig } : {}),
        ...verifiedFields,
      },
      nowMs,
    );

    if (!updated) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Provider account "${id}" not found`);
    }

    await this.auditService.record({
      userId: userId ?? null,
      action: input.apiToken ? 'provider_account.token_rotated' : 'provider_account.updated',
      targetType: 'provider_account',
      targetId: updated.id,
      meta: { label: updated.label, tokenLast4: updated.tokenLast4 },
    });

    return updated;
  }

  async delete(id: string, confirmLabel: string, userId?: string | null): Promise<void> {
    const existing = await this.getById(id);
    if (confirmLabel.trim() !== existing.label) {
      throw new AppError(
        ERROR_CODE.CONFIRMATION_MISMATCH,
        `Confirmation text must match account label "${existing.label}"`,
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    await this.repo.delete(id);
    await this.auditService.record({
      userId: userId ?? null,
      action: 'provider_account.deleted',
      targetType: 'provider_account',
      targetId: id,
      meta: { label: existing.label, provider: existing.provider },
    });
  }

  async verifyById(id: string, userId?: string | null): Promise<ProviderAccountDto> {
    const decryptable = await this.repo.getDecryptable(id);
    if (!decryptable) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Provider account "${id}" not found`);
    }

    const verifier = this.registry.getCapability(decryptable.provider, CAPABILITY.ACCOUNT_VERIFIER);
    const nowMs = this.clock.nowMs();
    try {
      const verified = await verifier.verify({
        token: decryptable.decryptedToken,
        externalAccountId: decryptable.externalAccountId,
        ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
      });

      const updated = await this.repo.update(
        id,
        {
          status: verified.valid ? ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.INVALID,
          externalAccountId: verified.externalAccountId,
          accountType: verified.accountType ?? decryptable.accountType ?? null,
          scopesVerified: verified.scopesVerified,
          lastVerifiedAt: nowMs,
        },
        nowMs,
      );

      await this.auditService.record({
        userId: userId ?? null,
        action: 'provider_account.verified',
        targetType: 'provider_account',
        targetId: id,
        meta: { valid: verified.valid },
      });

      if (!updated) {
        throw new AppError(ERROR_CODE.NOT_FOUND, 'Provider account not found');
      }
      return updated;
    } catch (err) {
      await this.repo.update(id, { status: ACCOUNT_STATUS.INVALID }, nowMs);
      throw err;
    }
  }

  async syncInventory(
    id: string,
    cursor?: string,
    userId?: string | null,
  ): Promise<{ syncedCount: number; nextCursor: string | null }> {
    const decryptable = await this.repo.getDecryptable(id);
    if (!decryptable) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Provider account "${id}" not found`);
    }

    const budget = new SubrequestBudget(WORKER_BUDGET.MAX_SUBREQUESTS_PER_STEP);
    const ctx = {
      token: decryptable.decryptedToken,
      externalAccountId: decryptable.externalAccountId,
      budget,
      ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
    };
    const nowMs = this.clock.nowMs();
    let syncedCount = 0;
    let nextCursor: string | null = null;

    if (decryptable.provider === PROVIDER.CLOUDFLARE) {
      const zoneProvider = this.registry.getCapability(PROVIDER.CLOUDFLARE, CAPABILITY.ZONES);
      const dnsProvider = this.registry.getCapability(PROVIDER.CLOUDFLARE, CAPABILITY.DNS_RECORDS);
      const { items: zones, nextCursor: zCursor } = await zoneProvider.listZones(ctx, cursor);
      nextCursor = zCursor;

      for (const zone of zones) {
        const zoneResource = await this.resourcesRepo.upsert({
          providerAccountId: id,
          kind: RESOURCE_KIND.ZONE,
          externalId: zone.id,
          name: zone.name,
          data: {
            status: zone.status,
            nameServers: zone.nameServers,
            registrar: Boolean(zone.registrar),
          },
          nowMs,
        });
        syncedCount++;

        if (budget.remaining >= 2) {
          const { items: records } = await dnsProvider.listRecords(ctx, zone.id);
          for (const rec of records) {
            await this.resourcesRepo.upsert({
              providerAccountId: id,
              kind: RESOURCE_KIND.DNS_RECORD,
              externalId: rec.id,
              name: `${rec.type} ${rec.name}`,
              parentId: zoneResource.id,
              data: {
                type: rec.type,
                name: rec.name,
                content: rec.content,
                ttl: rec.ttl,
                proxied: rec.proxied,
              },
              nowMs,
            });
            syncedCount++;
          }
        }
      }
    } else if (decryptable.provider === PROVIDER.VERCEL) {
      const projectProvider = this.registry.getCapability(PROVIDER.VERCEL, CAPABILITY.PROJECTS);
      const domainProvider = this.registry.getCapability(
        PROVIDER.VERCEL,
        CAPABILITY.PROJECT_DOMAINS,
      );
      const envProvider = this.registry.getCapability(PROVIDER.VERCEL, CAPABILITY.ENV_VARS);

      const { items: projects, nextCursor: pCursor } = await projectProvider.listProjects(
        ctx,
        cursor,
      );
      nextCursor = pCursor;

      for (const proj of projects) {
        const projResource = await this.resourcesRepo.upsert({
          providerAccountId: id,
          kind: RESOURCE_KIND.VERCEL_PROJECT,
          externalId: proj.id,
          name: proj.name,
          data: {
            framework: proj.framework,
            gitRepo: proj.gitRepo,
            accountType: decryptable.accountType,
          },
          nowMs,
        });
        syncedCount++;

        if (budget.remaining >= 2) {
          const domains = await domainProvider.listProjectDomains(ctx, proj.id);
          for (const d of domains) {
            await this.resourcesRepo.upsert({
              providerAccountId: id,
              kind: RESOURCE_KIND.PROJECT_DOMAIN,
              externalId: `${proj.id}:${d.name}`,
              name: d.name,
              parentId: projResource.id,
              data: { verified: d.verified, verificationTxt: d.verificationTxt },
              nowMs,
            });
            syncedCount++;
          }
        }

        if (budget.remaining >= 2) {
          const envs = await envProvider.listEnvVars(ctx, proj.id);
          for (const e of envs) {
            await this.resourcesRepo.upsert({
              providerAccountId: id,
              kind: RESOURCE_KIND.ENV_VAR,
              externalId: `${proj.id}:${e.key}`,
              name: e.key,
              parentId: projResource.id,
              data: {
                type: e.type,
                readable: e.readable,
                target: e.target,
              },
              nowMs,
            });
            syncedCount++;
          }
        }
      }
    } else if (decryptable.provider === PROVIDER.SUPABASE) {
      const projectProvider = this.registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.PROJECTS);
      const fnProvider = this.registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.EDGE_FUNCTIONS);
      const envProvider = this.registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.ENV_VARS);

      const { items: projects } = await projectProvider.listProjects(ctx);
      for (const proj of projects) {
        const projResource = await this.resourcesRepo.upsert({
          providerAccountId: id,
          kind: RESOURCE_KIND.SUPABASE_PROJECT,
          externalId: proj.id,
          name: proj.name,
          data: {
            status: proj.status,
            region: proj.region,
            organizationId: proj.organizationId,
            dbHost: proj.dbHost,
          },
          nowMs,
        });
        syncedCount++;

        if (budget.remaining >= 2) {
          const fns = await fnProvider.listFunctions(ctx, proj.id);
          for (const fn of fns) {
            await this.resourcesRepo.upsert({
              providerAccountId: id,
              kind: RESOURCE_KIND.EDGE_FUNCTION,
              externalId: `${proj.id}:${fn.slug}`,
              name: fn.slug,
              parentId: projResource.id,
              data: { version: fn.version, verifyJwt: fn.verifyJwt },
              nowMs,
            });
            syncedCount++;
          }
        }

        if (budget.remaining >= 2) {
          const secrets = await envProvider.listEnvVars(ctx, proj.id);
          for (const s of secrets) {
            await this.resourcesRepo.upsert({
              providerAccountId: id,
              kind: RESOURCE_KIND.ENV_VAR,
              externalId: `${proj.id}:${s.key}`,
              name: s.key,
              parentId: projResource.id,
              data: { type: s.type, readable: false, target: s.target },
              nowMs,
            });
            syncedCount++;
          }
        }
      }
    } else if (decryptable.provider === PROVIDER.GITLAB) {
      const gitlabProvider = this.registry.getCapability(
        PROVIDER.GITLAB,
        CAPABILITY.GITLAB_VARIABLES,
      );
      try {
        const projects = await gitlabProvider.listProjects(ctx);
        for (const proj of projects) {
          const projResource = await this.resourcesRepo.upsert({
            providerAccountId: id,
            kind: RESOURCE_KIND.GITLAB_PROJECT,
            externalId: String(proj.id),
            name: proj.pathWithNamespace || proj.name,
            data: {
              id: proj.id,
              name: proj.name,
              pathWithNamespace: proj.pathWithNamespace,
              webUrl: proj.webUrl,
              defaultBranch: proj.defaultBranch,
            },
            nowMs,
          });
          syncedCount++;

          if (budget.remaining >= 2) {
            try {
              const vars = await gitlabProvider.listVariables(ctx, proj.id);
              for (const v of vars) {
                await this.resourcesRepo.upsert({
                  providerAccountId: id,
                  kind: RESOURCE_KIND.ENV_VAR,
                  externalId: `${proj.id}:${v.key}`,
                  name: v.key,
                  parentId: projResource.id,
                  data: {
                    type: v.variable_type ?? 'env_var',
                    masked: v.masked,
                    protected: v.protected,
                  },
                  nowMs,
                });
                syncedCount++;
              }
            } catch {
              // Ignore if variable listing is forbidden on specific project
            }
          }
        }
      } catch (err) {
        console.warn(
          'GitLab project sync skipped:',
          err instanceof Error ? err.message : String(err),
        );
      }
    } else if (decryptable.provider === PROVIDER.GITHUB) {
      const githubProvider = this.registry.getCapability(
        PROVIDER.GITHUB,
        CAPABILITY.GITHUB_VARIABLES,
      );
      try {
        const repos = await githubProvider.listRepos(ctx);
        for (const repo of repos) {
          const repoResource = await this.resourcesRepo.upsert({
            providerAccountId: id,
            kind: RESOURCE_KIND.GITHUB_REPO,
            externalId: String(repo.id),
            name: repo.fullName,
            data: {
              id: repo.id,
              name: repo.name,
              fullName: repo.fullName,
              private: repo.private,
              defaultBranch: repo.defaultBranch,
              htmlUrl: repo.htmlUrl,
              description: repo.description,
            },
            nowMs,
          });
          syncedCount++;

          if (budget.remaining >= 2) {
            try {
              const vars = await githubProvider.listVariables(ctx, repo.fullName);
              for (const v of vars) {
                await this.resourcesRepo.upsert({
                  providerAccountId: id,
                  kind: RESOURCE_KIND.ENV_VAR,
                  externalId: `${repo.id}:${v.name}`,
                  name: v.name,
                  parentId: repoResource.id,
                  data: {
                    type: 'actions_variable',
                    value: v.value,
                  },
                  nowMs,
                });
                syncedCount++;
              }
            } catch {
              // Ignore if variable listing is forbidden on specific repo
            }
          }
        }
      } catch (err) {
        console.warn('GitHub repo sync skipped:', err instanceof Error ? err.message : String(err));
      }
    }

    await this.repo.update(id, { lastSyncedAt: nowMs }, nowMs);
    await this.auditService.record({
      userId: userId ?? null,
      action: 'provider_account.synced',
      targetType: 'provider_account',
      targetId: id,
      meta: { syncedCount, nextCursor },
    });

    return { syncedCount, nextCursor };
  }

  async getUsage(id: string): Promise<{
    account: ProviderAccountDto;
    metrics: UsageMetricSnapshot[];
  }> {
    const decryptable = await this.repo.getDecryptable(id);
    if (!decryptable) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Provider account "${id}" not found`);
    }

    const usageProvider = this.registry.getCapability(decryptable.provider, CAPABILITY.USAGE);
    const metrics = await usageProvider.getUsage({
      token: decryptable.decryptedToken,
      externalAccountId: decryptable.externalAccountId,
      ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
    });

    const nowMs = this.clock.nowMs();
    let exceeded = false;
    for (const m of metrics) {
      await this.repo.saveUsageSnapshot({
        providerAccountId: id,
        metric: m.metric,
        value: m.value,
        limit: m.limit,
        nowMs,
      });
      if (m.ratio >= 1) {
        exceeded = true;
      }
    }

    const newStatus = exceeded ? ACCOUNT_STATUS.QUOTA_EXCEEDED : ACCOUNT_STATUS.ACTIVE;
    const updated =
      decryptable.status !== newStatus
        ? await this.repo.update(id, { status: newStatus }, nowMs)
        : null;

    const { decryptedToken: _omit, ...dto } = decryptable;
    return {
      account: updated ?? dto,
      metrics,
    };
  }
}
