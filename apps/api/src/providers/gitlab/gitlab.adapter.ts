import {
  AppError,
  CAPABILITY,
  type Capability,
  ERROR_CODE,
  GITLAB_TOKEN_TYPE,
  PROVIDER,
} from '@freetier-loop/shared';
import type {
  AccountVerifier,
  CapabilityMap,
  GitLabPipeline,
  GitLabProject,
  GitLabVariable,
  GitLabVariableProvider,
  ProviderAdapter,
  ProviderContext,
  VerifiedAccountInfo,
} from '../contracts';
import { createHttpClient } from '../http-client';
import { GITLAB_API_BASE_URL, GITLAB_ENDPOINTS } from './endpoints';

export class GitLabAdapter implements ProviderAdapter, AccountVerifier, GitLabVariableProvider {
  public readonly id = PROVIDER.GITLAB;

  private client(ctx: ProviderContext) {
    return createHttpClient({
      baseUrl: GITLAB_API_BASE_URL,
      token: ctx.token,
      ...(ctx.budget ? { budget: ctx.budget } : {}),
      ...(ctx.fetchFn ? { fetchFn: ctx.fetchFn } : {}),
    });
  }

  getCapability<K extends Capability>(capability: K): CapabilityMap[K] | null {
    switch (capability) {
      case CAPABILITY.ACCOUNT_VERIFIER:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.GITLAB_VARIABLES:
        return this as unknown as CapabilityMap[K];
      default:
        return null;
    }
  }

  async verify(ctx: ProviderContext): Promise<VerifiedAccountInfo> {
    const http = this.client(ctx);

    // 1. Try /personal_access_tokens/self (metadata for PAT)
    try {
      const patRes = await http.request<{
        id: number;
        name?: string;
        active?: boolean;
        revoked?: boolean;
        user_id?: number;
        scopes?: string[];
      }>({
        path: '/personal_access_tokens/self',
      });

      if (patRes.revoked || patRes.active === false) {
        return {
          valid: false,
          externalAccountId: String(patRes.user_id ?? patRes.id),
          scopesVerified: patRes.scopes ?? [],
        };
      }

      // Check if user endpoint is accessible (to determine if it's a real user PAT)
      let isUser = false;
      let username = '';
      try {
        const u = await http.request<{ username?: string }>({ path: GITLAB_ENDPOINTS.USER });
        if (u.username && !u.username.startsWith('project_')) {
          isUser = true;
          username = u.username;
        }
      } catch {
        isUser = false;
      }

      if (isUser) {
        return {
          valid: true,
          externalAccountId: String(patRes.user_id ?? patRes.id),
          labelSuggested: username || patRes.name || 'GitLab',
          accountType: GITLAB_TOKEN_TYPE.USER,
          scopesVerified: patRes.scopes ?? ['api'],
        };
      }

      // If not a user PAT, it's a Project Access Token
      let projectId = String(patRes.id);
      let projectName = patRes.name;
      try {
        const projects = await http.request<Array<{ id: number; name: string }>>({
          path: GITLAB_ENDPOINTS.PROJECTS,
          query: { membership: true, per_page: 1 },
        });
        if (projects[0]) {
          projectId = String(projects[0].id);
          projectName = projects[0].name;
        }
      } catch {
        // ignore
      }

      return {
        valid: true,
        externalAccountId: projectId,
        labelSuggested: projectName ? `GitLab (${projectName})` : 'GitLab Project Token',
        accountType: GITLAB_TOKEN_TYPE.PROJECT,
        scopesVerified: patRes.scopes ?? ['api'],
      };
    } catch (patErr) {
      if (patErr instanceof AppError && patErr.code === ERROR_CODE.PROVIDER_AUTH_INVALID) {
        throw patErr;
      }

      // 2. Try /user (standard for classic PAT)
      try {
        const userRes = await http.request<{
          id: number;
          username: string;
          name?: string;
          state?: string;
        }>({
          path: GITLAB_ENDPOINTS.USER,
        });

        const isProjectBot = userRes.username.startsWith('project_');
        return {
          valid: userRes.state !== 'blocked',
          externalAccountId: String(userRes.id),
          labelSuggested: userRes.username || userRes.name || undefined,
          accountType: isProjectBot ? GITLAB_TOKEN_TYPE.PROJECT : GITLAB_TOKEN_TYPE.USER,
          scopesVerified: ['api'],
        };
      } catch (userErr) {
        if (userErr instanceof AppError && userErr.code === ERROR_CODE.PROVIDER_AUTH_INVALID) {
          throw userErr;
        }

        // 3. Try /projects (for project-scoped tokens)
        try {
          const projects = await http.request<Array<{ id: number; name: string }>>({
            path: GITLAB_ENDPOINTS.PROJECTS,
            query: { membership: true, per_page: 1 },
          });

          return {
            valid: true,
            externalAccountId: projects[0] ? String(projects[0].id) : 'gitlab-token',
            labelSuggested: projects[0]?.name ? `GitLab (${projects[0].name})` : 'GitLab Account',
            accountType: GITLAB_TOKEN_TYPE.PROJECT,
            scopesVerified: ['api'],
          };
        } catch (projErr) {
          if (projErr instanceof AppError && projErr.code === ERROR_CODE.PROVIDER_AUTH_INVALID) {
            throw projErr;
          }

          // 4. If all endpoints returned 403, the token is verified as validly authenticated by GitLab,
          // but tightly scoped to specific resources (e.g. fine-grained Project CI/CD Variables only).
          if (
            projErr instanceof AppError &&
            projErr.code === ERROR_CODE.PROVIDER_PERMISSION_MISSING
          ) {
            return {
              valid: true,
              externalAccountId: 'gitlab-scoped',
              labelSuggested: 'GitLab Scoped Token',
              accountType: GITLAB_TOKEN_TYPE.PROJECT,
              scopesVerified: ['ci_variables'],
            };
          }

          throw projErr;
        }
      }
    }
  }

  async listProjects(ctx: ProviderContext): Promise<GitLabProject[]> {
    const http = this.client(ctx);
    try {
      const projects = await http.request<
        Array<{
          id: number;
          name: string;
          path_with_namespace: string;
          web_url: string;
          default_branch?: string;
        }>
      >({
        path: GITLAB_ENDPOINTS.PROJECTS,
        query: {
          membership: true,
          min_access_level: 30,
          per_page: 50,
        },
      });

      return projects.map((p) => ({
        id: p.id,
        name: p.name,
        pathWithNamespace: p.path_with_namespace,
        webUrl: p.web_url,
        defaultBranch: p.default_branch,
      }));
    } catch {
      // Fallback for Project Access Tokens: if externalAccountId or project detail is accessible
      if (
        ctx.externalAccountId &&
        ctx.externalAccountId !== 'gitlab-scoped' &&
        ctx.externalAccountId !== 'gitlab-token'
      ) {
        try {
          const p = await http.request<{
            id: number;
            name: string;
            path_with_namespace: string;
            web_url: string;
            default_branch?: string;
          }>({
            path: GITLAB_ENDPOINTS.PROJECT_DETAIL(ctx.externalAccountId),
          });
          return [
            {
              id: p.id,
              name: p.name,
              pathWithNamespace: p.path_with_namespace,
              webUrl: p.web_url,
              defaultBranch: p.default_branch,
            },
          ];
        } catch {
          return [];
        }
      }
      return [];
    }
  }

  async listVariables(
    ctx: ProviderContext,
    projectIdOrPath: string | number,
  ): Promise<GitLabVariable[]> {
    const http = this.client(ctx);
    const vars = await http.request<
      Array<{
        key: string;
        value: string;
        variable_type?: 'env_var' | 'file';
        protected?: boolean;
        masked?: boolean;
        raw?: boolean;
        environment_scope?: string;
        description?: string | null;
      }>
    >({
      path: GITLAB_ENDPOINTS.VARIABLES(projectIdOrPath),
    });

    return vars.map((v) => ({
      key: v.key,
      value: v.value,
      variable_type: v.variable_type,
      protected: v.protected,
      masked: v.masked,
      raw: v.raw,
      environment_scope: v.environment_scope,
      description: v.description,
    }));
  }

  async upsertVariable(
    ctx: ProviderContext,
    projectIdOrPath: string | number,
    variable: {
      key: string;
      value: string;
      masked?: boolean;
      protected?: boolean;
    },
  ): Promise<void> {
    const http = this.client(ctx);
    try {
      await http.request({
        method: 'PUT',
        path: GITLAB_ENDPOINTS.VARIABLE_DETAIL(projectIdOrPath, variable.key),
        body: {
          value: variable.value,
          ...(variable.masked !== undefined ? { masked: variable.masked } : {}),
          ...(variable.protected !== undefined ? { protected: variable.protected } : {}),
        },
      });
    } catch {
      await http.request({
        method: 'POST',
        path: GITLAB_ENDPOINTS.VARIABLES(projectIdOrPath),
        body: {
          key: variable.key,
          value: variable.value,
          ...(variable.masked !== undefined ? { masked: variable.masked } : {}),
          ...(variable.protected !== undefined ? { protected: variable.protected } : {}),
        },
      });
    }
  }

  async triggerPipeline(
    ctx: ProviderContext,
    projectIdOrPath: string | number,
    ref?: string,
  ): Promise<GitLabPipeline> {
    const http = this.client(ctx);
    let targetRef = ref;
    if (!targetRef) {
      try {
        const project = await http.request<{ default_branch?: string }>({
          path: GITLAB_ENDPOINTS.PROJECT_DETAIL(projectIdOrPath),
        });
        targetRef = project.default_branch || 'main';
      } catch {
        targetRef = 'main';
      }
    }

    const res = await http.request<{
      id: number;
      status: string;
      ref: string;
      sha: string;
      web_url: string;
      created_at: string;
    }>({
      method: 'POST',
      path: GITLAB_ENDPOINTS.PIPELINES(projectIdOrPath),
      body: {
        ref: targetRef,
      },
    });

    return {
      id: res.id,
      status: res.status,
      ref: res.ref,
      sha: res.sha,
      webUrl: res.web_url,
      createdAt: res.created_at,
    };
  }
}
