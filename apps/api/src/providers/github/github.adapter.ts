import { AppError, CAPABILITY, type Capability, ERROR_CODE, PROVIDER } from '@freetier-loop/shared';
import type {
  AccountVerifier,
  CapabilityMap,
  GitHubRepo,
  GitHubVariable,
  GitHubVariableProvider,
  ProviderAdapter,
  ProviderContext,
  VerifiedAccountInfo,
} from '../contracts';
import { createHttpClient } from '../http-client';
import { GITHUB_API_BASE_URL, GITHUB_ENDPOINTS } from './endpoints';

export class GitHubAdapter implements ProviderAdapter, AccountVerifier, GitHubVariableProvider {
  public readonly id = PROVIDER.GITHUB;

  private client(ctx: ProviderContext) {
    return createHttpClient({
      baseUrl: GITHUB_API_BASE_URL,
      token: ctx.token,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'freetier-loop',
      },
      ...(ctx.budget ? { budget: ctx.budget } : {}),
      ...(ctx.fetchFn ? { fetchFn: ctx.fetchFn } : {}),
    });
  }

  getCapability<K extends Capability>(capability: K): CapabilityMap[K] | null {
    switch (capability) {
      case CAPABILITY.ACCOUNT_VERIFIER:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.GITHUB_VARIABLES:
        return this as unknown as CapabilityMap[K];
      default:
        return null;
    }
  }

  async verify(ctx: ProviderContext): Promise<VerifiedAccountInfo> {
    const http = this.client(ctx);

    try {
      const user = await http.request<{
        id: number;
        login: string;
        name?: string | null;
        email?: string | null;
      }>({
        path: GITHUB_ENDPOINTS.USER,
      });

      if (!user.id || !user.login) {
        throw new AppError(ERROR_CODE.PROVIDER_AUTH_INVALID, 'Invalid GitHub API token');
      }

      return {
        valid: true,
        externalAccountId: String(user.id),
        labelSuggested: user.login,
        scopesVerified: ['repo', 'workflow'],
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        ERROR_CODE.PROVIDER_AUTH_INVALID,
        `GitHub token verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  async listRepos(ctx: ProviderContext): Promise<GitHubRepo[]> {
    const http = this.client(ctx);
    const repos = await http.request<
      Array<{
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        default_branch?: string;
        html_url: string;
        description?: string | null;
      }>
    >({
      path: GITHUB_ENDPOINTS.USER_REPOS,
      query: {
        per_page: 100,
        sort: 'updated',
      },
    });

    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: Boolean(r.private),
      defaultBranch: r.default_branch || 'main',
      htmlUrl: r.html_url,
      description: r.description ?? null,
    }));
  }

  private parseOwnerAndRepo(ownerAndRepo: string): { owner: string; repo: string } {
    const parts = ownerAndRepo.split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new AppError(
        ERROR_CODE.VALIDATION_ERROR,
        `Invalid GitHub repository format: "${ownerAndRepo}". Expected "owner/repo".`,
      );
    }
    return { owner: parts[0], repo: parts[1] };
  }

  async listVariables(ctx: ProviderContext, ownerAndRepo: string): Promise<GitHubVariable[]> {
    const http = this.client(ctx);
    const { owner, repo } = this.parseOwnerAndRepo(ownerAndRepo);

    try {
      const res = await http.request<{
        total_count: number;
        variables: Array<{
          name: string;
          value: string;
          created_at: string;
          updated_at: string;
        }>;
      }>({
        path: GITHUB_ENDPOINTS.VARIABLES(owner, repo),
      });

      return res.variables.map((v) => ({
        name: v.name,
        value: v.value,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      }));
    } catch {
      return [];
    }
  }

  async upsertVariable(
    ctx: ProviderContext,
    ownerAndRepo: string,
    variable: { name: string; value: string },
  ): Promise<void> {
    const http = this.client(ctx);
    const { owner, repo } = this.parseOwnerAndRepo(ownerAndRepo);

    // Try PATCH first (update existing)
    try {
      await http.request({
        path: GITHUB_ENDPOINTS.VARIABLE_DETAIL(owner, repo, variable.name),
        method: 'PATCH',
        body: {
          name: variable.name,
          value: variable.value,
        },
      });
      return;
    } catch {
      // If PATCH fails, POST to create
    }

    await http.request({
      path: GITHUB_ENDPOINTS.VARIABLES(owner, repo),
      method: 'POST',
      body: {
        name: variable.name,
        value: variable.value,
      },
    });
  }

  async triggerWorkflow(
    ctx: ProviderContext,
    ownerAndRepo: string,
    workflowId: string | number,
    ref?: string,
  ): Promise<void> {
    const http = this.client(ctx);
    const { owner, repo } = this.parseOwnerAndRepo(ownerAndRepo);

    await http.request({
      path: GITHUB_ENDPOINTS.DISPATCH_WORKFLOW(owner, repo, workflowId),
      method: 'POST',
      body: {
        ref: ref || 'main',
      },
    });
  }
}
