import {
  CAPABILITY,
  type Capability,
  FREE_TIER_LIMITS,
  PROVIDER,
  SUPABASE_PROJECT_STATUS,
  USAGE_METRIC,
} from '@freetier-loop/shared';
import type {
  AccountVerifier,
  CapabilityMap,
  EdgeFunctionProvider,
  EnvVarProvider,
  NormalizedEdgeFunction,
  NormalizedEnvVar,
  NormalizedProject,
  ProjectProvider,
  ProviderAdapter,
  ProviderContext,
  SqlQueryProvider,
  UsageMetricSnapshot,
  UsageProvider,
  VerifiedAccountInfo,
} from '../contracts';
import { createHttpClient } from '../http-client';
import { SUPABASE_API_BASE_URL, SUPABASE_ENDPOINTS } from './endpoints';

export class SupabaseAdapter
  implements
    ProviderAdapter,
    AccountVerifier,
    ProjectProvider,
    EnvVarProvider,
    EdgeFunctionProvider,
    SqlQueryProvider,
    UsageProvider
{
  public readonly id = PROVIDER.SUPABASE;

  private client(ctx: ProviderContext) {
    return createHttpClient({
      baseUrl: SUPABASE_API_BASE_URL,
      token: ctx.token,
      ...(ctx.budget ? { budget: ctx.budget } : {}),
      ...(ctx.fetchFn ? { fetchFn: ctx.fetchFn } : {}),
    });
  }

  getCapability<K extends Capability>(capability: K): CapabilityMap[K] | null {
    switch (capability) {
      case CAPABILITY.ACCOUNT_VERIFIER:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.PROJECTS:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.ENV_VARS:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.EDGE_FUNCTIONS:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.SQL_QUERY:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.USAGE:
        return this as unknown as CapabilityMap[K];
      default:
        return null;
    }
  }

  async verify(ctx: ProviderContext): Promise<VerifiedAccountInfo> {
    const http = this.client(ctx);
    const orgs = await http.request<Array<{ id: string; slug: string; name: string }>>({
      path: SUPABASE_ENDPOINTS.ORGANIZATIONS,
    });
    const firstOrg = orgs[0];
    return {
      valid: true,
      externalAccountId: ctx.externalAccountId ?? firstOrg?.id ?? 'supabase-default',
      ...(firstOrg?.name ? { labelSuggested: firstOrg.name } : {}),
      scopesVerified: ['organizations:read', 'projects:write', 'functions:write', 'secrets:write'],
    };
  }

  async listProjects(
    ctx: ProviderContext,
  ): Promise<{ items: NormalizedProject[]; nextCursor: string | null }> {
    const http = this.client(ctx);
    const rows = await http.request<
      Array<{
        id: string;
        ref?: string;
        organization_id: string;
        name: string;
        region: string;
        status: string;
        database?: { host?: string };
      }>
    >({
      path: SUPABASE_ENDPOINTS.PROJECTS,
    });

    const items: NormalizedProject[] = rows.map((r) => ({
      id: r.ref ?? r.id,
      name: r.name,
      provider: PROVIDER.SUPABASE,
      status: r.status,
      region: r.region,
      organizationId: r.organization_id,
      ...(r.database?.host ? { dbHost: r.database.host } : {}),
    }));

    return { items, nextCursor: null };
  }

  async getProject(ctx: ProviderContext, projectId: string): Promise<NormalizedProject> {
    const http = this.client(ctx);
    const r = await http.request<{
      id: string;
      ref?: string;
      organization_id: string;
      name: string;
      region: string;
      status: string;
      database?: { host?: string };
    }>({
      path: SUPABASE_ENDPOINTS.PROJECT_DETAIL(projectId),
    });

    return {
      id: r.ref ?? r.id,
      name: r.name,
      provider: PROVIDER.SUPABASE,
      status: r.status,
      region: r.region,
      organizationId: r.organization_id,
      ...(r.database?.host ? { dbHost: r.database.host } : {}),
    };
  }

  async createProject(
    ctx: ProviderContext,
    input: {
      name: string;
      organizationId?: string;
      region?: string;
      dbPass?: string;
    },
  ): Promise<NormalizedProject> {
    const http = this.client(ctx);
    const res = await http.request<{
      id: string;
      ref?: string;
      organization_id: string;
      name: string;
      region: string;
      status: string;
      database?: { host?: string };
    }>({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECTS,
      body: {
        name: input.name,
        organization_id: input.organizationId ?? ctx.externalAccountId ?? 'org_default',
        region: input.region ?? 'ap-southeast-1',
        db_pass: input.dbPass ?? 'TempDbPass_ChangeMe_123!',
      },
    });

    const ref = res.ref ?? res.id;
    return {
      id: ref,
      name: res.name,
      provider: PROVIDER.SUPABASE,
      status: res.status,
      region: res.region,
      organizationId: res.organization_id,
      dbHost: res.database?.host ?? `db.${ref}.supabase.co`,
    };
  }

  async pauseProject(ctx: ProviderContext, projectId: string): Promise<void> {
    const http = this.client(ctx);
    await http.request({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECT_PAUSE(projectId),
    });
  }

  async restoreProject(ctx: ProviderContext, projectId: string): Promise<void> {
    const http = this.client(ctx);
    await http.request({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECT_RESTORE(projectId),
    });
  }

  async transferProject(
    ctx: ProviderContext,
    input: { projectId: string; targetContext: ProviderContext; targetOrgOrTeamId?: string },
  ): Promise<{ transferred: boolean }> {
    const http = this.client(ctx);
    const targetOrgId =
      input.targetOrgOrTeamId ?? input.targetContext.externalAccountId ?? 'org_target';

    await http.request({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECT_TRANSFER_PREVIEW(input.projectId),
      body: { target_organization_id: targetOrgId },
    });

    await http.request({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECT_TRANSFER(input.projectId),
      body: { target_organization_id: targetOrgId },
    });

    return { transferred: true };
  }

  async getProjectApiKeys(
    ctx: ProviderContext,
    projectId: string,
  ): Promise<{ anonKey?: string; serviceRoleKey?: string }> {
    const http = this.client(ctx);
    const rows = await http.request<Array<{ name: string; api_key: string }>>({
      path: SUPABASE_ENDPOINTS.PROJECT_API_KEYS(projectId),
    });
    const anonKey = rows.find((r) => r.name === 'anon')?.api_key;
    const serviceRoleKey = rows.find((r) => r.name === 'service_role')?.api_key;
    return {
      ...(anonKey ? { anonKey } : {}),
      ...(serviceRoleKey ? { serviceRoleKey } : {}),
    };
  }

  async listEnvVars(ctx: ProviderContext, projectId: string): Promise<NormalizedEnvVar[]> {
    const http = this.client(ctx);
    const rows = await http.request<Array<{ name: string; value?: string }>>({
      path: SUPABASE_ENDPOINTS.PROJECT_SECRETS(projectId),
    });
    return rows.map((r) => ({
      key: r.name,
      type: 'secret',
      readable: false,
      target: ['production'],
    }));
  }

  async upsertEnvVars(
    ctx: ProviderContext,
    projectId: string,
    vars: NormalizedEnvVar[],
  ): Promise<{ upsertedCount: number }> {
    if (vars.length === 0) return { upsertedCount: 0 };
    const http = this.client(ctx);
    const payload = vars.map((v) => ({
      name: v.key,
      value: v.value ?? '',
    }));
    await http.request({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECT_SECRETS(projectId),
      body: payload,
    });
    return { upsertedCount: payload.length };
  }

  async listFunctions(ctx: ProviderContext, projectId: string): Promise<NormalizedEdgeFunction[]> {
    const http = this.client(ctx);
    const rows = await http.request<
      Array<{
        id: string;
        slug: string;
        name: string;
        version: number;
        verify_jwt?: boolean;
        entrypoint_path?: string;
      }>
    >({
      path: SUPABASE_ENDPOINTS.PROJECT_FUNCTIONS(projectId),
    });

    return rows.map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      version: f.version,
      verifyJwt: Boolean(f.verify_jwt),
      ...(f.entrypoint_path ? { entrypointPath: f.entrypoint_path } : {}),
    }));
  }

  async downloadFunctionBody(
    ctx: ProviderContext,
    projectId: string,
    slug: string,
  ): Promise<string> {
    const http = this.client(ctx);
    return http.request<string>({
      path: SUPABASE_ENDPOINTS.PROJECT_FUNCTION_BODY(projectId, slug),
      rawText: true,
    });
  }

  async deployFunction(
    ctx: ProviderContext,
    projectId: string,
    fn: { slug: string; name: string; body: string; verifyJwt?: boolean },
  ): Promise<void> {
    const http = this.client(ctx);
    await http.request({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECT_FUNCTION_DEPLOY(projectId),
      query: { slug: fn.slug },
      body: {
        slug: fn.slug,
        name: fn.name,
        body: fn.body,
        verify_jwt: fn.verifyJwt ?? false,
      },
    });
  }

  async getDatabaseSizeBytes(ctx: ProviderContext, projectId: string): Promise<number> {
    const http = this.client(ctx);
    const rows = await http.request<Array<{ db_bytes?: number }>>({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECT_DB_QUERY(projectId),
      body: {
        query: 'SELECT pg_database_size(current_database()) AS db_bytes;',
      },
    });
    return Number(rows[0]?.db_bytes ?? 0);
  }

  async getTableRowCounts(
    ctx: ProviderContext,
    projectId: string,
  ): Promise<Array<{ schema: string; table: string; rowCount: number }>> {
    const http = this.client(ctx);
    const rows = await http.request<
      Array<{ schema_name: string; table_name: string; row_count: number }>
    >({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECT_DB_QUERY(projectId),
      body: {
        query:
          "SELECT schemaname AS schema_name, relname AS table_name, n_live_tup AS row_count FROM pg_stat_user_tables WHERE schemaname IN ('public', 'auth', 'storage') ORDER BY schemaname, relname;",
      },
    });

    return rows.map((r) => ({
      schema: r.schema_name,
      table: r.table_name,
      rowCount: Number(r.row_count),
    }));
  }

  async getInstalledExtensions(ctx: ProviderContext, projectId: string): Promise<string[]> {
    const http = this.client(ctx);
    const rows = await http.request<Array<{ extname: string }>>({
      method: 'POST',
      path: SUPABASE_ENDPOINTS.PROJECT_DB_QUERY(projectId),
      body: {
        query: 'SELECT extname FROM pg_extension ORDER BY extname;',
      },
    });
    return rows.map((r) => r.extname);
  }

  async getUsage(ctx: ProviderContext): Promise<UsageMetricSnapshot[]> {
    const { items } = await this.listProjects(ctx);
    const activeCount = items.filter((p) => p.status !== SUPABASE_PROJECT_STATUS.INACTIVE).length;
    const limit = FREE_TIER_LIMITS.SUPABASE_ACTIVE_PROJECTS_MAX;
    const ratio = activeCount / limit;

    return [
      {
        metric: USAGE_METRIC.SUPABASE_ACTIVE_PROJECTS,
        value: activeCount,
        limit,
        ratio,
        ...(activeCount >= limit
          ? {
              warning: `Supabase free-tier project slot full (${activeCount}/${limit} active across user orgs). Pause an inactive project or recreate on another user account.`,
            }
          : {}),
      },
    ];
  }
}
