import type {
  Capability,
  DnsRecordType,
  Provider,
  SupabaseProjectStatus,
  UsageMetric,
  VercelAccountType,
  ZoneStatus,
} from '@freetier-loop/shared';
import type { SubrequestBudget } from './http-client';

export type ProviderContext = {
  token: string;
  externalAccountId?: string | null | undefined;
  budget?: SubrequestBudget | undefined;
  fetchFn?: typeof fetch | undefined;
};

export type VerifiedAccountInfo = {
  valid: boolean;
  externalAccountId: string;
  labelSuggested?: string | undefined;
  accountType?: VercelAccountType | undefined;
  scopesVerified: string[];
};

export type NormalizedZone = {
  id: string;
  name: string;
  status: ZoneStatus;
  nameServers: string[];
  registrar?: boolean;
  dnssecEnabled?: boolean;
  emailRoutingEnabled?: boolean;
  sslSettings?: Record<string, string>;
};

export type NormalizedRegistrarDomain = {
  id: string;
  name: string;
  registrar: string;
  locked: boolean;
  autoRenew: boolean;
  expiresAt?: string;
  createdAt?: string;
};

export type NormalizedDnsRecord = {
  id: string;
  type: DnsRecordType;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
  comment?: string;
};

export type DnsBatchInput = {
  deletes?: { id: string }[];
  patches?: (Partial<NormalizedDnsRecord> & { id: string })[];
  puts?: NormalizedDnsRecord[];
  posts?: Omit<NormalizedDnsRecord, 'id'>[];
};

export type NormalizedProject = {
  id: string;
  name: string;
  provider: Provider;
  framework?: string | null;
  gitRepo?: {
    type: string;
    repo: string;
    productionBranch: string;
  } | null;
  status?: SupabaseProjectStatus | string;
  region?: string;
  organizationId?: string;
  dbHost?: string;
  metadata?: Record<string, unknown>;
};

export type NormalizedProjectDomain = {
  name: string;
  projectId: string;
  verified: boolean;
  gitBranch?: string | null;
  verificationTxt?: string | null;
};

export type NormalizedEnvVar = {
  id?: string;
  key: string;
  value?: string;
  type: 'plain' | 'encrypted' | 'sensitive' | 'secret';
  readable: boolean;
  target: string[];
};

export type NormalizedEdgeFunction = {
  id: string;
  slug: string;
  name: string;
  version: number;
  verifyJwt: boolean;
  entrypointPath?: string;
  body?: string;
};

export type UsageMetricSnapshot = {
  metric: UsageMetric;
  value: number;
  limit: number;
  ratio: number;
  warning?: string;
};

export type GitLabVariable = {
  key: string;
  value: string;
  variable_type?: 'env_var' | 'file' | undefined;
  protected?: boolean | undefined;
  masked?: boolean | undefined;
  raw?: boolean | undefined;
  environment_scope?: string | undefined;
  description?: string | null | undefined;
};

export type GitLabProject = {
  id: number;
  name: string;
  pathWithNamespace: string;
  webUrl: string;
  defaultBranch?: string | undefined;
};

export type ProjectRules = {
  rewrites?: Array<{ source: string; destination: string }>;
  redirects?: Array<{ source: string; destination: string; permanent?: boolean }>;
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  cleanUrls?: boolean;
  trailingSlash?: boolean;
};

export interface AccountVerifier {
  verify(ctx: ProviderContext): Promise<VerifiedAccountInfo>;
}

export interface ZoneProvider {
  listZones(
    ctx: ProviderContext,
    cursor?: string,
  ): Promise<{ items: NormalizedZone[]; nextCursor: string | null }>;
  getZone(ctx: ProviderContext, zoneId: string): Promise<NormalizedZone>;
  createZone(
    ctx: ProviderContext,
    input: { name: string; accountId: string },
  ): Promise<NormalizedZone>;
  deleteZone(ctx: ProviderContext, zoneId: string): Promise<void>;
  getZoneSettings(ctx: ProviderContext, zoneId: string): Promise<Record<string, string>>;
  updateZoneSettings(
    ctx: ProviderContext,
    zoneId: string,
    settings: Record<string, string>,
  ): Promise<void>;
  getDnssecStatus(ctx: ProviderContext, zoneId: string): Promise<{ enabled: boolean }>;
  getEmailRoutingStatus(ctx: ProviderContext, zoneId: string): Promise<{ enabled: boolean }>;
}

export interface RegistrarDomainProvider {
  listRegistrarDomains(ctx: ProviderContext): Promise<NormalizedRegistrarDomain[]>;
}

export interface DnsRecordProvider {
  listRecords(
    ctx: ProviderContext,
    zoneId: string,
    cursor?: string,
  ): Promise<{ items: NormalizedDnsRecord[]; nextCursor: string | null }>;
  exportBind(ctx: ProviderContext, zoneId: string): Promise<string>;
  batchApply(
    ctx: ProviderContext,
    zoneId: string,
    batch: DnsBatchInput,
  ): Promise<{ createdCount: number; updatedCount: number; deletedCount: number }>;
}

export interface ProjectProvider {
  listProjects(
    ctx: ProviderContext,
    cursor?: string,
  ): Promise<{ items: NormalizedProject[]; nextCursor: string | null }>;
  getProject(ctx: ProviderContext, projectId: string): Promise<NormalizedProject>;
  createProject(
    ctx: ProviderContext,
    input: {
      name: string;
      framework?: string | null;
      gitRepo?: { type: string; repo: string; productionBranch?: string } | null;
      organizationId?: string;
      region?: string;
      dbPass?: string;
    },
  ): Promise<NormalizedProject>;
  transferProject?(
    ctx: ProviderContext,
    input: { projectId: string; targetContext: ProviderContext; targetOrgOrTeamId?: string },
  ): Promise<{ transferred: boolean; code?: string }>;
  pauseProject?(ctx: ProviderContext, projectId: string): Promise<void>;
  restoreProject?(ctx: ProviderContext, projectId: string): Promise<void>;
  getProjectRules?(ctx: ProviderContext, projectId: string): Promise<ProjectRules>;
  updateProjectRules?(ctx: ProviderContext, projectId: string, rules: ProjectRules): Promise<void>;
}

export interface ProjectDomainProvider {
  listProjectDomains(ctx: ProviderContext, projectId: string): Promise<NormalizedProjectDomain[]>;
  addProjectDomain(
    ctx: ProviderContext,
    projectId: string,
    domain: string,
  ): Promise<NormalizedProjectDomain>;
  removeProjectDomain(ctx: ProviderContext, projectId: string, domain: string): Promise<void>;
}

export interface EnvVarProvider {
  listEnvVars(ctx: ProviderContext, projectId: string): Promise<NormalizedEnvVar[]>;
  upsertEnvVars(
    ctx: ProviderContext,
    projectId: string,
    vars: NormalizedEnvVar[],
  ): Promise<{ upsertedCount: number }>;
}

export interface EdgeFunctionProvider {
  listFunctions(ctx: ProviderContext, projectId: string): Promise<NormalizedEdgeFunction[]>;
  downloadFunctionBody(ctx: ProviderContext, projectId: string, slug: string): Promise<string>;
  deployFunction(
    ctx: ProviderContext,
    projectId: string,
    fn: { slug: string; name: string; body: string; verifyJwt?: boolean },
  ): Promise<void>;
}

export interface SqlQueryProvider {
  getDatabaseSizeBytes(ctx: ProviderContext, projectId: string): Promise<number>;
  getTableRowCounts(
    ctx: ProviderContext,
    projectId: string,
  ): Promise<Array<{ schema: string; table: string; rowCount: number }>>;
  getInstalledExtensions(ctx: ProviderContext, projectId: string): Promise<string[]>;
}

export interface UsageProvider {
  getUsage(ctx: ProviderContext): Promise<UsageMetricSnapshot[]>;
}

export type GitLabPipeline = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  webUrl: string;
  createdAt: string;
};

export interface GitLabVariableProvider {
  listProjects(ctx: ProviderContext): Promise<GitLabProject[]>;
  listVariables(ctx: ProviderContext, projectIdOrPath: string | number): Promise<GitLabVariable[]>;
  upsertVariable(
    ctx: ProviderContext,
    projectIdOrPath: string | number,
    variable: {
      key: string;
      value: string;
      masked?: boolean;
      protected?: boolean;
    },
  ): Promise<void>;
  triggerPipeline(
    ctx: ProviderContext,
    projectIdOrPath: string | number,
    ref?: string,
  ): Promise<GitLabPipeline>;
}

export type CapabilityMap = {
  account_verifier: AccountVerifier;
  zones: ZoneProvider;
  registrar_domains: RegistrarDomainProvider;
  dns_records: DnsRecordProvider;
  projects: ProjectProvider;
  project_domains: ProjectDomainProvider;
  env_vars: EnvVarProvider;
  edge_functions: EdgeFunctionProvider;
  sql_query: SqlQueryProvider;
  usage: UsageProvider;
  gitlab_variables: GitLabVariableProvider;
};

export interface ProviderAdapter {
  readonly id: Provider;
  getCapability<K extends Capability>(capability: K): CapabilityMap[K] | null;
}
