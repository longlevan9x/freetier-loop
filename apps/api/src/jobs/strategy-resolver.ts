import {
  ACCOUNT_STATUS,
  MIGRATION_TEMPLATE,
  type MigrationTemplate,
  PROVIDER,
  type ProviderAccountDto,
  RESOURCE_KIND,
  type ResourceDto,
  VERCEL_ACCOUNT_TYPE,
} from '@freetier-loop/shared';

export interface StrategyRecommendation {
  recommendedTemplate: MigrationTemplate;
  alternatives: MigrationTemplate[];
  reason: string;
}

export interface TargetAccountScore {
  accountId: string;
  label: string;
  provider: string;
  score: number;
  reason: string;
}

export class StrategyResolver {
  resolve(input: {
    resource: Pick<ResourceDto, 'kind' | 'name' | 'data'> & { provider?: string };
    sourceAccount: Pick<
      ProviderAccountDto,
      'id' | 'provider' | 'accountType' | 'externalAccountId'
    >;
    targetAccount: Pick<
      ProviderAccountDto,
      'id' | 'provider' | 'accountType' | 'externalAccountId'
    >;
    sameSupabaseUser?: boolean;
  }): StrategyRecommendation {
    const data = input.resource.data ?? {};

    if (input.resource.kind === RESOURCE_KIND.ZONE) {
      const isCfRegistrar = Boolean(data.registrar || data.isCfRegistrar);
      if (isCfRegistrar) {
        return {
          recommendedTemplate: MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE,
          alternatives: [MIGRATION_TEMPLATE.DNS_REPOINT],
          reason:
            'Domain is registered with Cloudflare Registrar; non-destructive pre-creation + Registrar move is required (never delete source zone first).',
        };
      }
      return {
        recommendedTemplate: MIGRATION_TEMPLATE.CF_ZONE_MOVE,
        alternatives: [MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE, MIGRATION_TEMPLATE.DNS_REPOINT],
        reason:
          'Domain uses an external registrar; zone can be snapshotted, recreated on target, and cut over via nameserver update.',
      };
    }

    if (
      input.resource.kind === RESOURCE_KIND.WORKER ||
      input.resource.kind === RESOURCE_KIND.PAGES_PROJECT
    ) {
      return {
        recommendedTemplate: MIGRATION_TEMPLATE.CF_WORKER_MOVE,
        alternatives: [MIGRATION_TEMPLATE.ENV_REWIRE, MIGRATION_TEMPLATE.DNS_REPOINT],
        reason:
          'Cloudflare Worker/Pages service migration with script, bindings, and custom domains.',
      };
    }

    if (input.resource.kind === RESOURCE_KIND.VERCEL_PROJECT) {
      const bothTeam =
        input.sourceAccount.accountType === VERCEL_ACCOUNT_TYPE.TEAM &&
        input.targetAccount.accountType === VERCEL_ACCOUNT_TYPE.TEAM;
      if (bothTeam) {
        return {
          recommendedTemplate: MIGRATION_TEMPLATE.VERCEL_PROJECT_TRANSFER,
          alternatives: [MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE, MIGRATION_TEMPLATE.ENV_REWIRE],
          reason:
            'Both source and target Vercel accounts are Team tier; native Transfer Request API is supported.',
        };
      }
      return {
        recommendedTemplate: MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE,
        alternatives: [MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER, MIGRATION_TEMPLATE.ENV_REWIRE],
        reason:
          'At least one Vercel account is Hobby tier; project recreation from Git repository with Blue-Green domain cutover is required.',
      };
    }

    if (input.resource.kind === RESOURCE_KIND.PROJECT_DOMAIN) {
      return {
        recommendedTemplate: MIGRATION_TEMPLATE.VERCEL_DOMAIN_MOVE,
        alternatives: [MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER, MIGRATION_TEMPLATE.DNS_REPOINT],
        reason: 'Move custom domain attachment between accounts.',
      };
    }

    if (input.resource.kind === RESOURCE_KIND.SUPABASE_PROJECT) {
      if (input.sameSupabaseUser) {
        return {
          recommendedTemplate: MIGRATION_TEMPLATE.SUPABASE_ORG_TRANSFER,
          alternatives: [
            MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE,
            MIGRATION_TEMPLATE.ENV_REWIRE,
          ],
          reason:
            'Both organizations belong to the same Supabase user with free project slots available; native organization transfer is fastest.',
        };
      }
      return {
        recommendedTemplate: MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE,
        alternatives: [MIGRATION_TEMPLATE.SUPABASE_ORG_TRANSFER, MIGRATION_TEMPLATE.ENV_REWIRE],
        reason:
          'Moving across different Supabase user accounts (to gain fresh 2-project free quota) requires recreating the project, pg_dump/psql restore, Edge Functions copy, and ENV_REWIRE.',
      };
    }

    if (input.sourceAccount.provider === PROVIDER.CLOUDFLARE) {
      return {
        recommendedTemplate: MIGRATION_TEMPLATE.DNS_REPOINT,
        alternatives: [MIGRATION_TEMPLATE.ENV_REWIRE],
        reason: 'Default DNS repoint workflow for Cloudflare resource.',
      };
    }

    return {
      recommendedTemplate: MIGRATION_TEMPLATE.ENV_REWIRE,
      alternatives: [],
      reason: 'Default environment variable rewiring workflow.',
    };
  }

  recommendTargetAccounts(input: {
    sourceAccountId: string;
    provider: string;
    candidates: Array<{
      id: string;
      label: string;
      provider: string;
      status: string;
      quotaPercent?: number;
      activeProjectsCount?: number;
    }>;
  }): TargetAccountScore[] {
    return input.candidates
      .filter(
        (acc) =>
          acc.id !== input.sourceAccountId &&
          acc.provider === input.provider &&
          acc.status !== ACCOUNT_STATUS.INVALID &&
          acc.status !== ACCOUNT_STATUS.DISABLED,
      )
      .map((acc) => {
        const quotaUsed = acc.quotaPercent ?? 0;
        const activeProjects = acc.activeProjectsCount ?? 0;
        const baseScore = Math.max(0, 100 - quotaUsed - activeProjects * 25);
        const statusBonus = acc.status === ACCOUNT_STATUS.ACTIVE ? 10 : 0;
        const score = Math.min(100, Math.round(baseScore + statusBonus));
        return {
          accountId: acc.id,
          label: acc.label,
          provider: acc.provider,
          score,
          reason:
            acc.provider === PROVIDER.SUPABASE
              ? `${activeProjects}/2 active free projects (${quotaUsed}% quota)`
              : `${quotaUsed}% quota used (${acc.status})`,
        };
      })
      .sort((a, b) => b.score - a.score);
  }
}
