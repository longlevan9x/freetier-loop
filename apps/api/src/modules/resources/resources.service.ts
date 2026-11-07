import {
  AppError,
  CAPABILITY,
  ERROR_CODE,
  HTTP_STATUS,
  type ListResourcesQuery,
  type ResourceDto,
  SUPABASE_PROJECT_STATUS,
} from '@freetier-loop/shared';
import type { Clock } from '../../platform/deps';
import type { ProviderRegistry } from '../../providers/registry';
import type { AuditService } from '../audit/audit.service';
import type { ProviderAccountsRepository } from '../provider-accounts/provider-accounts.repository';
import type { ResourcesRepository } from './resources.repository';

export class ResourcesService {
  constructor(
    private readonly repo: ResourcesRepository,
    private readonly accountsRepo: ProviderAccountsRepository,
    private readonly registry: ProviderRegistry,
    private readonly auditService: AuditService,
    private readonly clock: Clock,
    private readonly fetchFn?: typeof fetch,
  ) {}

  async list(query: ListResourcesQuery) {
    return this.repo.list(query);
  }

  async getById(id: string): Promise<{ resource: ResourceDto; children: ResourceDto[] }> {
    const resource = await this.repo.findById(id);
    if (!resource) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Resource "${id}" not found`);
    }
    const children = await this.repo.listByParentId(resource.id);
    return { resource, children };
  }

  async pauseProject(id: string, userId?: string | null): Promise<ResourceDto> {
    const resource = await this.repo.findById(id);
    if (!resource) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Resource "${id}" not found`);
    }
    const account = await this.accountsRepo.getDecryptable(resource.providerAccountId);
    if (!account) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Provider account not found');
    }

    const projectProvider = this.registry.getCapability(account.provider, CAPABILITY.PROJECTS);
    if (!projectProvider.pauseProject) {
      throw new AppError(
        ERROR_CODE.PROVIDER_CAPABILITY_UNSUPPORTED,
        `Provider "${account.provider}" does not support project pausing`,
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    await projectProvider.pauseProject(
      {
        token: account.decryptedToken,
        externalAccountId: account.externalAccountId,
        ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
      },
      resource.externalId,
    );

    const updatedData = { ...resource.data, status: SUPABASE_PROJECT_STATUS.INACTIVE };
    await this.repo.updateData(resource.id, updatedData, this.clock.nowMs());
    await this.auditService.record({
      userId: userId ?? null,
      action: 'resource.project.paused',
      targetType: 'resource',
      targetId: resource.id,
      meta: { name: resource.name },
    });

    return { ...resource, data: updatedData, updatedAt: this.clock.nowMs() };
  }

  async restoreProject(id: string, userId?: string | null): Promise<ResourceDto> {
    const resource = await this.repo.findById(id);
    if (!resource) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Resource "${id}" not found`);
    }
    const account = await this.accountsRepo.getDecryptable(resource.providerAccountId);
    if (!account) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Provider account not found');
    }

    const projectProvider = this.registry.getCapability(account.provider, CAPABILITY.PROJECTS);
    if (!projectProvider.restoreProject) {
      throw new AppError(
        ERROR_CODE.PROVIDER_CAPABILITY_UNSUPPORTED,
        `Provider "${account.provider}" does not support project restoration`,
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    await projectProvider.restoreProject(
      {
        token: account.decryptedToken,
        externalAccountId: account.externalAccountId,
        ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
      },
      resource.externalId,
    );

    const updatedData = { ...resource.data, status: SUPABASE_PROJECT_STATUS.ACTIVE_HEALTHY };
    await this.repo.updateData(resource.id, updatedData, this.clock.nowMs());
    await this.auditService.record({
      userId: userId ?? null,
      action: 'resource.project.restored',
      targetType: 'resource',
      targetId: resource.id,
      meta: { name: resource.name },
    });

    return { ...resource, data: updatedData, updatedAt: this.clock.nowMs() };
  }
}
