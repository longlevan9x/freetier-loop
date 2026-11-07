import type { AppConfig } from '../config/env.schema';
import { getConfig } from '../config/env.schema';
import { AuditRepository } from '../modules/audit/audit.repository';
import { AuditService } from '../modules/audit/audit.service';
import { AuthService } from '../modules/auth/auth.service';
import { JobsRepository } from '../modules/jobs/jobs.repository';
import { JobsService } from '../modules/jobs/jobs.service';
import { ProviderAccountsRepository } from '../modules/provider-accounts/provider-accounts.repository';
import { ProviderAccountsService } from '../modules/provider-accounts/provider-accounts.service';
import { ResourcesRepository } from '../modules/resources/resources.repository';
import { ResourcesService } from '../modules/resources/resources.service';
import { SnapshotsRepository } from '../modules/snapshots/snapshots.repository';
import { SnapshotsService } from '../modules/snapshots/snapshots.service';
import { createDefaultProviderRegistry } from '../providers/index';
import type { ProviderRegistry } from '../providers/registry';
import { type SecretCipher, createSecretCipher } from './crypto';
import { type AppDatabase, type D1Binding, createAppDatabase, createNoopD1Binding } from './db';
import { type Logger, createConsoleLogger } from './logger';
import { type PasswordHasher, createNativeScryptHasher } from './password-hasher';

export interface Clock {
  nowMs(): number;
}

export interface PlatformAdapters {
  logger: Logger;
  clock: Clock;
  defer(promise: Promise<unknown>): void;
}

export interface DepsOverrides extends Partial<PlatformAdapters> {
  db?: AppDatabase;
  fetchFn?: typeof fetch;
  providerRegistry?: ProviderRegistry;
  cipher?: SecretCipher;
  hasher?: PasswordHasher;
}

export type Deps = {
  config: AppConfig;
  platform: PlatformAdapters;
  db: AppDatabase;
  cipher: SecretCipher;
  hasher: PasswordHasher;
  providerRegistry: ProviderRegistry;
  auditService: AuditService;
  authService: AuthService;
  providerAccountsService: ProviderAccountsService;
  resourcesService: ResourcesService;
  snapshotsService: SnapshotsService;
  jobsService: JobsService;
};

export const systemClock: Clock = {
  nowMs: () => Date.now(),
};

const parseSelfProtectedHosts = (config: AppConfig): string[] => {
  const hosts = new Set<string>();
  try {
    const authUrl = new URL(config.BETTER_AUTH_URL);
    if (authUrl.hostname && authUrl.hostname !== 'localhost') {
      hosts.add(authUrl.hostname.toLowerCase());
    }
  } catch {
    // ignore invalid URL
  }
  for (const h of config.SELF_PROTECTED_HOSTS) {
    const trimmed = h.trim().toLowerCase();
    if (trimmed.length > 0) {
      hosts.add(trimmed);
    }
  }
  return [...hosts];
};

export const createDefaultDeps = (
  rawEnv: Record<string, unknown> = {},
  overrides: DepsOverrides = {},
): Deps => {
  const config = getConfig(rawEnv);
  const platform: PlatformAdapters = {
    logger: overrides.logger ?? createConsoleLogger(),
    clock: overrides.clock ?? systemClock,
    defer:
      overrides.defer ??
      ((promise) => {
        void promise.catch(() => undefined);
      }),
  };

  const d1 = (rawEnv.DB as D1Binding | undefined) ?? createNoopD1Binding();
  const db = overrides.db ?? createAppDatabase(d1);
  const fetchFn = (overrides.fetchFn ?? globalThis.fetch).bind(globalThis);

  const cipher =
    overrides.cipher ??
    createSecretCipher({
      currentKeyBase64: config.ENCRYPTION_KEY,
      ...(config.ENCRYPTION_KEY_PREVIOUS
        ? { previousKeyBase64: config.ENCRYPTION_KEY_PREVIOUS }
        : {}),
    });

  const hasher = overrides.hasher ?? createNativeScryptHasher();
  const providerRegistry = overrides.providerRegistry ?? createDefaultProviderRegistry();

  const auditRepo = new AuditRepository(db);
  const auditService = new AuditService(auditRepo, platform.clock);

  const authService = new AuthService(db, config, hasher, platform.clock, auditService, fetchFn);

  const accountsRepo = new ProviderAccountsRepository(db, cipher);
  const resourcesRepo = new ResourcesRepository(db);
  const snapshotsRepo = new SnapshotsRepository(db);
  const jobsRepo = new JobsRepository(db);

  const providerAccountsService = new ProviderAccountsService(
    accountsRepo,
    resourcesRepo,
    providerRegistry,
    auditService,
    platform.clock,
    fetchFn,
  );

  const resourcesService = new ResourcesService(
    resourcesRepo,
    accountsRepo,
    providerRegistry,
    auditService,
    platform.clock,
    fetchFn,
  );

  const snapshotsService = new SnapshotsService(
    snapshotsRepo,
    resourcesRepo,
    accountsRepo,
    providerRegistry,
    cipher,
    auditService,
    platform.clock,
    fetchFn,
  );

  const jobsService = new JobsService(
    db,
    jobsRepo,
    accountsRepo,
    resourcesRepo,
    snapshotsService,
    providerRegistry,
    cipher,
    auditService,
    parseSelfProtectedHosts(config),
    fetchFn,
  );

  return {
    config,
    platform,
    db,
    cipher,
    hasher,
    providerRegistry,
    auditService,
    authService,
    providerAccountsService,
    resourcesService,
    snapshotsService,
    jobsService,
  };
};
