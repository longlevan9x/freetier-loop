import { AppError, CAPABILITY, ERROR_CODE, PROVIDER, RESOURCE_KIND } from '@freetier-loop/shared';
import type { SecretCipher } from '../../platform/crypto';
import type { Clock } from '../../platform/deps';
import type { ProviderRegistry } from '../../providers/registry';
import type { AuditService } from '../audit/audit.service';
import type { ProviderAccountsRepository } from '../provider-accounts/provider-accounts.repository';
import type { ResourcesRepository } from '../resources/resources.repository';
import type { SnapshotRecord, SnapshotsRepository } from './snapshots.repository';

export const REDACTED_MASK = '******' as const;

export class SnapshotsService {
  constructor(
    private readonly repo: SnapshotsRepository,
    private readonly resourcesRepo: ResourcesRepository,
    private readonly accountsRepo: ProviderAccountsRepository,
    private readonly registry: ProviderRegistry,
    private readonly cipher: SecretCipher,
    private readonly auditService: AuditService,
    private readonly clock: Clock,
    private readonly fetchFn?: typeof fetch,
  ) {}

  private redactPayloadForClient(payload: Record<string, unknown>): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...payload };
    if (Array.isArray(copy.envVars)) {
      copy.envVars = copy.envVars.map((item) => {
        if (typeof item === 'object' && item !== null) {
          const {
            encryptedValue: _encrypted,
            value: _val,
            ...rest
          } = item as Record<string, unknown>;
          return {
            ...rest,
            redactedValue: REDACTED_MASK,
          };
        }
        return item;
      });
    }
    return copy;
  }

  async createForResource(
    resourceId: string,
    options?: { jobId?: string | null; userId?: string | null },
  ): Promise<SnapshotRecord> {
    const resource = await this.resourcesRepo.findById(resourceId);
    if (!resource) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Resource "${resourceId}" not found`);
    }

    const account = await this.accountsRepo.getDecryptable(resource.providerAccountId);
    if (!account) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'Source provider account not found');
    }

    const ctx = {
      token: account.decryptedToken,
      externalAccountId: account.externalAccountId,
      ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
    };

    let payload: Record<string, unknown> = {
      resourceId: resource.id,
      externalId: resource.externalId,
      name: resource.name,
      kind: resource.kind,
      provider: account.provider,
    };
    let bindZoneFile: string | null = null;

    if (account.provider === PROVIDER.CLOUDFLARE && resource.kind === RESOURCE_KIND.ZONE) {
      const zoneProvider = this.registry.getCapability(PROVIDER.CLOUDFLARE, CAPABILITY.ZONES);
      const dnsProvider = this.registry.getCapability(PROVIDER.CLOUDFLARE, CAPABILITY.DNS_RECORDS);
      const { items: dnsRecords } = await dnsProvider.listRecords(ctx, resource.externalId);
      const sslSettings = await zoneProvider
        .getZoneSettings(ctx, resource.externalId)
        .catch(() => ({}));
      const dnssec = await zoneProvider
        .getDnssecStatus(ctx, resource.externalId)
        .catch(() => ({ enabled: false }));
      const emailRouting = await zoneProvider
        .getEmailRoutingStatus(ctx, resource.externalId)
        .catch(() => ({ enabled: false }));
      bindZoneFile = await dnsProvider.exportBind(ctx, resource.externalId).catch(() => {
        return dnsRecords
          .map((r) => `${r.name}.\t${r.ttl}\tIN\t${r.type}\t${r.content}`)
          .join('\n');
      });

      payload = {
        ...payload,
        registrar: Boolean(resource.data.registrar),
        dnssecEnabled: dnssec.enabled,
        emailRoutingEnabled: emailRouting.enabled,
        sslSettings,
        dnsRecords,
      };
    } else if (
      account.provider === PROVIDER.VERCEL &&
      resource.kind === RESOURCE_KIND.VERCEL_PROJECT
    ) {
      const projProvider = this.registry.getCapability(PROVIDER.VERCEL, CAPABILITY.PROJECTS);
      const domProvider = this.registry.getCapability(PROVIDER.VERCEL, CAPABILITY.PROJECT_DOMAINS);
      const envProvider = this.registry.getCapability(PROVIDER.VERCEL, CAPABILITY.ENV_VARS);

      const project = await projProvider.getProject(ctx, resource.externalId);
      const domains = await domProvider.listProjectDomains(ctx, resource.externalId);
      const envs = await envProvider.listEnvVars(ctx, resource.externalId);

      const encryptedEnvs = [];
      for (const e of envs) {
        const encryptedValue =
          e.readable && e.value ? await this.cipher.encrypt(e.value) : undefined;
        encryptedEnvs.push({
          key: e.key,
          type: e.type,
          readable: e.readable,
          target: e.target,
          ...(encryptedValue ? { encryptedValue } : {}),
        });
      }

      payload = {
        ...payload,
        project,
        domains,
        envVars: encryptedEnvs,
      };
    } else if (
      account.provider === PROVIDER.SUPABASE &&
      resource.kind === RESOURCE_KIND.SUPABASE_PROJECT
    ) {
      const projProvider = this.registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.PROJECTS);
      const fnProvider = this.registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.EDGE_FUNCTIONS);
      const envProvider = this.registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.ENV_VARS);
      const sqlProvider = this.registry.getCapability(PROVIDER.SUPABASE, CAPABILITY.SQL_QUERY);

      const project = await projProvider.getProject(ctx, resource.externalId);
      const functions = await fnProvider.listFunctions(ctx, resource.externalId);
      const functionsWithBodies = [];
      for (const fn of functions) {
        const body = await fnProvider
          .downloadFunctionBody(ctx, resource.externalId, fn.slug)
          .catch(() => '');
        functionsWithBodies.push({ ...fn, body });
      }
      const secrets = await envProvider.listEnvVars(ctx, resource.externalId);
      const tableCounts = await sqlProvider
        .getTableRowCounts(ctx, resource.externalId)
        .catch(() => []);
      const extensions = await sqlProvider
        .getInstalledExtensions(ctx, resource.externalId)
        .catch(() => []);

      payload = {
        ...payload,
        project,
        tableCounts,
        extensions,
        edgeFunctions: functionsWithBodies,
        envVars: secrets.map((s) => ({
          key: s.key,
          type: s.type,
          readable: false,
          target: s.target,
        })),
        pgDumpCommandTemplate: `pg_dump --clean --if-exists --quote-all-identifiers --schema=public --schema=auth --schema=storage "postgresql://postgres:<SOURCE_DB_PASSWORD>@${project.dbHost ?? `db.${resource.externalId}.supabase.co`}:5432/postgres" | psql "postgresql://postgres:<TARGET_DB_PASSWORD>@<TARGET_DB_HOST>:5432/postgres"`,
      };
    }

    const nowMs = this.clock.nowMs();
    const record = await this.repo.create({
      jobId: options?.jobId ?? null,
      resourceId: resource.id,
      resourceName: resource.name,
      kind: resource.kind,
      payload,
      bindZoneFile,
      nowMs,
    });

    await this.auditService.record({
      userId: options?.userId ?? null,
      action: 'snapshot.created',
      targetType: 'snapshot',
      targetId: record.id,
      meta: { resourceId: resource.id, resourceName: resource.name, kind: resource.kind },
    });

    return {
      ...record,
      payload: this.redactPayloadForClient(record.payload),
    };
  }

  async getRawById(id: string): Promise<SnapshotRecord> {
    const record = await this.repo.findById(id);
    if (!record) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `Snapshot "${id}" not found`);
    }
    return record;
  }

  async getRedactedById(id: string): Promise<SnapshotRecord> {
    const record = await this.getRawById(id);
    return {
      ...record,
      payload: this.redactPayloadForClient(record.payload),
    };
  }

  async listAll(): Promise<SnapshotRecord[]> {
    const items = await this.repo.listAll();
    return items.map((r) => ({
      ...r,
      payload: this.redactPayloadForClient(r.payload),
    }));
  }
}
