import { providerAccounts, usageSnapshots } from '@freetier-loop/db';
import {
  ACCOUNT_STATUS,
  type AccountStatus,
  type AccountType,
  ID_PREFIX,
  type Provider,
  type ProviderAccountDto,
  type QuotaConfig,
  type UsageMetric,
  newId,
} from '@freetier-loop/shared';
import { desc, eq } from 'drizzle-orm';
import type { SecretCipher } from '../../platform/crypto';
import type { AppDatabase } from '../../platform/db';

export type DecryptableProviderAccount = ProviderAccountDto & {
  decryptedToken: string;
};

export class ProviderAccountsRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly cipher: SecretCipher,
  ) {}

  private toDto(row: typeof providerAccounts.$inferSelect): ProviderAccountDto {
    return {
      id: row.id,
      provider: row.provider,
      label: row.label,
      externalAccountId: row.externalAccountId ?? null,
      accountType: row.accountType ?? null,
      tokenLast4: row.tokenLast4,
      status: row.status,
      scopesVerified: row.scopesVerified ?? [],
      quotaConfig: row.quotaConfig ?? null,
      lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.getTime() : null,
      lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.getTime() : null,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  async list(): Promise<ProviderAccountDto[]> {
    const rows = await this.db
      .select()
      .from(providerAccounts)
      .orderBy(desc(providerAccounts.createdAt));
    return rows.map((r) => this.toDto(r));
  }

  async findById(id: string): Promise<ProviderAccountDto | null> {
    const rows = await this.db
      .select()
      .from(providerAccounts)
      .where(eq(providerAccounts.id, id))
      .limit(1);
    return rows[0] ? this.toDto(rows[0]) : null;
  }

  async getDecryptable(id: string): Promise<DecryptableProviderAccount | null> {
    const rows = await this.db
      .select()
      .from(providerAccounts)
      .where(eq(providerAccounts.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const decryptedToken = await this.cipher.decrypt(row.encryptedToken);
    return {
      ...this.toDto(row),
      decryptedToken,
    };
  }

  async create(input: {
    provider: Provider;
    label: string;
    externalAccountId: string | null;
    accountType?: AccountType | null;
    apiToken: string;
    scopesVerified: string[];
    quotaConfig?: QuotaConfig | null;
    nowMs: number;
  }): Promise<ProviderAccountDto> {
    const now = new Date(input.nowMs);
    const id = newId(ID_PREFIX.PROVIDER_ACCOUNT, input.nowMs);
    const encryptedToken = await this.cipher.encrypt(input.apiToken);
    const tokenLast4 = input.apiToken.slice(-4);

    await this.db.insert(providerAccounts).values({
      id,
      provider: input.provider,
      label: input.label,
      externalAccountId: input.externalAccountId,
      accountType: input.accountType ?? null,
      encryptedToken,
      tokenLast4,
      status: ACCOUNT_STATUS.ACTIVE,
      scopesVerified: input.scopesVerified,
      quotaConfig: input.quotaConfig ?? null,
      lastVerifiedAt: now,
      lastSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      provider: input.provider,
      label: input.label,
      externalAccountId: input.externalAccountId,
      accountType: input.accountType ?? null,
      tokenLast4,
      status: ACCOUNT_STATUS.ACTIVE,
      scopesVerified: input.scopesVerified,
      quotaConfig: input.quotaConfig ?? null,
      lastVerifiedAt: input.nowMs,
      lastSyncedAt: null,
      createdAt: input.nowMs,
      updatedAt: input.nowMs,
    };
  }

  async update(
    id: string,
    patch: {
      label?: string;
      apiToken?: string;
      status?: AccountStatus;
      quotaConfig?: QuotaConfig | null;
      externalAccountId?: string | null;
      accountType?: AccountType | null;
      scopesVerified?: string[];
      lastVerifiedAt?: number;
      lastSyncedAt?: number;
    },
    nowMs: number,
  ): Promise<ProviderAccountDto | null> {
    const existingRows = await this.db
      .select()
      .from(providerAccounts)
      .where(eq(providerAccounts.id, id))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) return null;

    const encryptedToken = patch.apiToken
      ? await this.cipher.encrypt(patch.apiToken)
      : existing.encryptedToken;
    const tokenLast4 = patch.apiToken ? patch.apiToken.slice(-4) : existing.tokenLast4;
    const now = new Date(nowMs);

    await this.db
      .update(providerAccounts)
      .set({
        label: patch.label ?? existing.label,
        encryptedToken,
        tokenLast4,
        status: patch.status ?? existing.status,
        quotaConfig: patch.quotaConfig !== undefined ? patch.quotaConfig : existing.quotaConfig,
        externalAccountId:
          patch.externalAccountId !== undefined
            ? patch.externalAccountId
            : existing.externalAccountId,
        accountType: patch.accountType !== undefined ? patch.accountType : existing.accountType,
        scopesVerified: patch.scopesVerified ?? existing.scopesVerified,
        lastVerifiedAt:
          patch.lastVerifiedAt !== undefined
            ? new Date(patch.lastVerifiedAt)
            : existing.lastVerifiedAt,
        lastSyncedAt:
          patch.lastSyncedAt !== undefined ? new Date(patch.lastSyncedAt) : existing.lastSyncedAt,
        updatedAt: now,
      })
      .where(eq(providerAccounts.id, id));

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;
    await this.db.delete(providerAccounts).where(eq(providerAccounts.id, id));
    return true;
  }

  async saveUsageSnapshot(input: {
    providerAccountId: string;
    metric: UsageMetric;
    value: number;
    limit: number;
    nowMs: number;
  }): Promise<void> {
    const now = new Date(input.nowMs);
    const id = newId(ID_PREFIX.USAGE_SNAPSHOT, input.nowMs);
    await this.db.insert(usageSnapshots).values({
      id,
      providerAccountId: input.providerAccountId,
      metric: input.metric,
      value: input.value,
      limit: input.limit,
      periodStart: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}
