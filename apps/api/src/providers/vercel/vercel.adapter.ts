import {
  CAPABILITY,
  type Capability,
  FREE_TIER_LIMITS,
  PROVIDER,
  USAGE_METRIC,
  VERCEL_ACCOUNT_TYPE,
} from '@freetier-loop/shared';
import type {
  AccountVerifier,
  CapabilityMap,
  EnvVarProvider,
  NormalizedEnvVar,
  NormalizedProject,
  NormalizedProjectDomain,
  ProjectDomainProvider,
  ProjectProvider,
  ProviderAdapter,
  ProviderContext,
  UsageMetricSnapshot,
  UsageProvider,
  VerifiedAccountInfo,
} from '../contracts';
import { createHttpClient } from '../http-client';
import { VERCEL_API_BASE_URL, VERCEL_ENDPOINTS } from './endpoints';

export class VercelAdapter
  implements
    ProviderAdapter,
    AccountVerifier,
    ProjectProvider,
    ProjectDomainProvider,
    EnvVarProvider,
    UsageProvider
{
  public readonly id = PROVIDER.VERCEL;

  private client(ctx: ProviderContext) {
    return createHttpClient({
      baseUrl: VERCEL_API_BASE_URL,
      token: ctx.token,
      ...(ctx.budget ? { budget: ctx.budget } : {}),
      ...(ctx.fetchFn ? { fetchFn: ctx.fetchFn } : {}),
    });
  }

  private teamQuery(ctx: ProviderContext): Record<string, string | undefined> {
    if (ctx.externalAccountId?.startsWith('team_')) {
      return { teamId: ctx.externalAccountId };
    }
    return {};
  }

  getCapability<K extends Capability>(capability: K): CapabilityMap[K] | null {
    switch (capability) {
      case CAPABILITY.ACCOUNT_VERIFIER:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.PROJECTS:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.PROJECT_DOMAINS:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.ENV_VARS:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.USAGE:
        return this as unknown as CapabilityMap[K];
      default:
        return null;
    }
  }

  async verify(ctx: ProviderContext): Promise<VerifiedAccountInfo> {
    const http = this.client(ctx);
    const userRes = await http.request<{
      user: { id: string; email: string; username: string; name?: string };
    }>({
      path: VERCEL_ENDPOINTS.USER,
    });

    const teamsRes = await http.request<{
      teams: Array<{ id: string; slug: string; name: string; billing?: { plan?: string } }>;
    }>({
      path: VERCEL_ENDPOINTS.TEAMS,
    });

    const matchedTeam = ctx.externalAccountId
      ? teamsRes.teams.find(
          (t) => t.id === ctx.externalAccountId || t.slug === ctx.externalAccountId,
        )
      : teamsRes.teams[0];

    const isTeam = Boolean(matchedTeam && matchedTeam.billing?.plan !== 'hobby');
    const accountType = isTeam ? VERCEL_ACCOUNT_TYPE.TEAM : VERCEL_ACCOUNT_TYPE.HOBBY;
    const externalAccountId = matchedTeam?.id ?? userRes.user.id;
    const labelSuggested = matchedTeam?.name ?? userRes.user.username;

    return {
      valid: true,
      externalAccountId,
      labelSuggested,
      accountType,
      scopesVerified: ['projects:read', 'projects:write', 'domains:write', 'env:write'],
    };
  }

  async listProjects(
    ctx: ProviderContext,
    cursor?: string,
  ): Promise<{ items: NormalizedProject[]; nextCursor: string | null }> {
    const http = this.client(ctx);
    const res = await http.request<{
      projects: Array<{
        id: string;
        name: string;
        framework?: string | null;
        link?: { type: string; repo: string; productionBranch?: string };
      }>;
      pagination?: { next?: number | null };
    }>({
      path: VERCEL_ENDPOINTS.PROJECTS_LIST,
      query: {
        ...this.teamQuery(ctx),
        limit: 50,
        ...(cursor ? { until: cursor } : {}),
      },
    });

    const items: NormalizedProject[] = res.projects.map((p) => ({
      id: p.id,
      name: p.name,
      provider: PROVIDER.VERCEL,
      framework: p.framework ?? null,
      gitRepo: p.link
        ? {
            type: p.link.type,
            repo: p.link.repo,
            productionBranch: p.link.productionBranch ?? 'main',
          }
        : null,
    }));

    const nextCursor = res.pagination?.next ? String(res.pagination.next) : null;
    return { items, nextCursor };
  }

  async getProject(ctx: ProviderContext, projectId: string): Promise<NormalizedProject> {
    const http = this.client(ctx);
    const p = await http.request<{
      id: string;
      name: string;
      framework?: string | null;
      link?: { type: string; repo: string; productionBranch?: string };
    }>({
      path: VERCEL_ENDPOINTS.PROJECT_DETAIL(projectId),
      query: this.teamQuery(ctx),
    });

    return {
      id: p.id,
      name: p.name,
      provider: PROVIDER.VERCEL,
      framework: p.framework ?? null,
      gitRepo: p.link
        ? {
            type: p.link.type,
            repo: p.link.repo,
            productionBranch: p.link.productionBranch ?? 'main',
          }
        : null,
    };
  }

  async createProject(
    ctx: ProviderContext,
    input: {
      name: string;
      framework?: string | null;
      gitRepo?: { type: string; repo: string; productionBranch?: string } | null;
    },
  ): Promise<NormalizedProject> {
    const http = this.client(ctx);
    const res = await http.request<{
      id: string;
      name: string;
      framework?: string | null;
    }>({
      method: 'POST',
      path: VERCEL_ENDPOINTS.PROJECT_CREATE,
      query: this.teamQuery(ctx),
      body: {
        name: input.name,
        ...(input.framework ? { framework: input.framework } : {}),
        ...(input.gitRepo
          ? {
              gitRepository: {
                type: input.gitRepo.type,
                repo: input.gitRepo.repo,
              },
            }
          : {}),
      },
    });

    return {
      id: res.id,
      name: res.name,
      provider: PROVIDER.VERCEL,
      framework: res.framework ?? null,
      gitRepo: input.gitRepo
        ? {
            type: input.gitRepo.type,
            repo: input.gitRepo.repo,
            productionBranch: input.gitRepo.productionBranch ?? 'main',
          }
        : null,
    };
  }

  async transferProject(
    ctx: ProviderContext,
    input: { projectId: string; targetContext: ProviderContext; targetOrgOrTeamId?: string },
  ): Promise<{ transferred: boolean; code?: string }> {
    const sourceHttp = this.client(ctx);
    const reqRes = await sourceHttp.request<{ code: string }>({
      method: 'POST',
      path: VERCEL_ENDPOINTS.PROJECT_TRANSFER_REQUEST(input.projectId),
      query: this.teamQuery(ctx),
    });

    const targetHttp = this.client(input.targetContext);
    await targetHttp.request({
      method: 'PUT',
      path: VERCEL_ENDPOINTS.PROJECT_TRANSFER_ACCEPT(reqRes.code),
      query: input.targetOrgOrTeamId
        ? { teamId: input.targetOrgOrTeamId }
        : this.teamQuery(input.targetContext),
    });

    return { transferred: true, code: reqRes.code };
  }

  async listProjectDomains(
    ctx: ProviderContext,
    projectId: string,
  ): Promise<NormalizedProjectDomain[]> {
    const http = this.client(ctx);
    const res = await http.request<{
      domains: Array<{
        name: string;
        projectId: string;
        verified: boolean;
        gitBranch?: string | null;
        verification?: Array<{ type: string; domain: string; value: string }>;
      }>;
    }>({
      path: VERCEL_ENDPOINTS.PROJECT_DOMAINS(projectId),
      query: this.teamQuery(ctx),
    });

    return res.domains.map((d) => ({
      name: d.name,
      projectId: d.projectId,
      verified: d.verified,
      gitBranch: d.gitBranch ?? null,
      verificationTxt: d.verification?.[0]?.value ?? null,
    }));
  }

  async addProjectDomain(
    ctx: ProviderContext,
    projectId: string,
    domain: string,
  ): Promise<NormalizedProjectDomain> {
    const http = this.client(ctx);
    const res = await http.request<{
      name: string;
      projectId: string;
      verified: boolean;
      verification?: Array<{ type: string; domain: string; value: string }>;
    }>({
      method: 'POST',
      path: VERCEL_ENDPOINTS.PROJECT_DOMAIN_ADD(projectId),
      query: this.teamQuery(ctx),
      body: { name: domain },
    });

    return {
      name: res.name,
      projectId: res.projectId,
      verified: res.verified,
      verificationTxt: res.verification?.[0]?.value ?? null,
    };
  }

  async removeProjectDomain(
    ctx: ProviderContext,
    projectId: string,
    domain: string,
  ): Promise<void> {
    const http = this.client(ctx);
    await http.request({
      method: 'DELETE',
      path: VERCEL_ENDPOINTS.PROJECT_DOMAIN_DETAIL(projectId, domain),
      query: this.teamQuery(ctx),
    });
  }

  async listEnvVars(ctx: ProviderContext, projectId: string): Promise<NormalizedEnvVar[]> {
    const http = this.client(ctx);
    const res = await http.request<{
      envs: Array<{
        id: string;
        key: string;
        value?: string;
        type: 'plain' | 'encrypted' | 'sensitive' | 'secret';
        target: string[];
      }>;
    }>({
      path: VERCEL_ENDPOINTS.PROJECT_ENVS(projectId),
      query: {
        ...this.teamQuery(ctx),
        decrypt: 'true',
      },
    });

    return res.envs.map((e) => {
      const isSensitive = e.type === 'sensitive' || e.type === 'secret';
      return {
        id: e.id,
        key: e.key,
        ...(isSensitive || !e.value ? {} : { value: e.value }),
        type: e.type,
        readable: !isSensitive && Boolean(e.value),
        target: e.target,
      };
    });
  }

  async upsertEnvVars(
    ctx: ProviderContext,
    projectId: string,
    vars: NormalizedEnvVar[],
  ): Promise<{ upsertedCount: number }> {
    if (vars.length === 0) return { upsertedCount: 0 };
    const http = this.client(ctx);
    const payload = vars.map((v) => ({
      key: v.key,
      value: v.value ?? '',
      type: v.type === 'secret' ? 'sensitive' : v.type,
      target: v.target.length > 0 ? v.target : ['production', 'preview', 'development'],
    }));
    await http.request({
      method: 'POST',
      path: VERCEL_ENDPOINTS.PROJECT_ENVS(projectId),
      query: {
        ...this.teamQuery(ctx),
        upsert: 'true',
      },
      body: payload,
    });
    return { upsertedCount: payload.length };
  }

  async getUsage(ctx: ProviderContext): Promise<UsageMetricSnapshot[]> {
    const http = this.client(ctx);
    const res = await http.request<{
      deployments: Array<{ uid: string; created: number }>;
    }>({
      path: VERCEL_ENDPOINTS.DEPLOYMENTS,
      query: {
        ...this.teamQuery(ctx),
        limit: 100,
      },
    });

    const count = res.deployments.length;
    const limit = FREE_TIER_LIMITS.VERCEL_DEPLOYMENTS_PER_DAY;
    const ratio = count / limit;

    return [
      {
        metric: USAGE_METRIC.VERCEL_DEPLOYMENTS,
        value: count,
        limit,
        ratio,
        ...(ratio >= FREE_TIER_LIMITS.QUOTA_WARN_RATIO
          ? { warning: `Vercel deployments at ${Math.round(ratio * 100)}% of daily Hobby limit` }
          : {}),
      },
    ];
  }
}
