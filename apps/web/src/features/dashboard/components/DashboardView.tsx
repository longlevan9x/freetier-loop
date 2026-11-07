import {
  ACCOUNT_STATUS,
  BENTO_SIZE,
  MIGRATION_TEMPLATE_LABEL,
  type MigrationTemplate,
  PROVIDER_LABEL,
  type Provider,
  WEB_ROUTES,
} from '@freetier-loop/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Cloud,
  Database,
  Globe,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { BentoStat } from '../../../components/bento/BentoStat';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

export const DashboardView = () => {
  const healthQuery = useQuery({
    queryKey: queryKeys.health.all,
    queryFn: async () => {
      const res = await apiClient.api.v1.health.$get();
      if (!res.ok) throw new Error('Health check failed');
      return res.json();
    },
  });

  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.summary,
    queryFn: async () => {
      const res = await apiClient.api.v1.dashboard.summary.$get();
      if (!res.ok) {
        return null;
      }
      const json = await res.json();
      return json.data;
    },
  });

  const summary = summaryQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quota & Migration Overview</h1>
          <p className="text-sm text-zinc-400">
            Manage and rotate resources across {PROVIDER_LABEL.cloudflare}, {PROVIDER_LABEL.vercel},
            and {PROVIDER_LABEL.supabase}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={WEB_ROUTES.ACCOUNTS}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </Link>
          <Link
            to={WEB_ROUTES.MIGRATIONS}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            New Migration
          </Link>
        </div>
      </div>

      <BentoGrid>
        <BentoCard
          title="Quota & Fleet Summary"
          subtitle="Connected free-tier accounts and active resources"
          size={BENTO_SIZE.XL}
          icon={<Cloud className="h-4 w-4" />}
          loading={summaryQuery.isPending}
        >
          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
            <BentoStat
              label="Connected Accounts"
              value={summary?.counts.totalAccounts ?? 0}
              hint={`${summary?.counts.healthyAccounts ?? 0} healthy · ${summary?.counts.warningAccounts ?? 0} quota alerts`}
              trend={(summary?.counts.warningAccounts ?? 0) > 0 ? 'warning' : 'normal'}
            />
            <BentoStat
              label="Cloudflare Zones"
              value={summary?.counts.zonesCount ?? 0}
              hint={`${summary?.counts.cfRegistrarZonesCount ?? 0} on CF Registrar`}
            />
            <BentoStat
              label="Vercel Projects"
              value={summary?.counts.vercelProjectsCount ?? 0}
              hint="Hobby & Team supported"
            />
            <BentoStat
              label="Supabase Projects"
              value={summary?.counts.supabaseProjectsCount ?? 0}
              hint="Max 2 active free / user"
            />
          </div>

          {summary && summary.accounts.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-zinc-400">Account Health Status</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {summary.accounts.slice(0, 6).map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-medium text-zinc-200">{acc.label}</div>
                      <div className="text-zinc-500">
                        {PROVIDER_LABEL[acc.provider as Provider]} · ••••{acc.tokenLast4}
                      </div>
                    </div>
                    {acc.status === ACCOUNT_STATUS.QUOTA_EXCEEDED ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        Quota Full
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </BentoCard>

        <BentoCard
          title="API & Worker Health"
          subtitle="Hono RPC typed connection"
          size={BENTO_SIZE.MD}
          icon={<Activity className="h-4 w-4" />}
          loading={healthQuery.isPending}
          error={healthQuery.error instanceof Error ? healthQuery.error.message : null}
        >
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="font-mono text-xs text-zinc-300">
                status: {healthQuery.data?.data.status ?? 'ok'}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Subrequest budget guard (≤ 45/req) & AES-256-GCM token vault active.
            </p>
          </div>
        </BentoCard>

        <BentoCard
          title="Cloudflare Registrar Domains"
          subtitle="Safe pre-staged DNS & guided transfer"
          size={BENTO_SIZE.MD}
          icon={<Globe className="h-4 w-4" />}
          action={
            <Link to={WEB_ROUTES.DOMAINS} className="text-xs text-emerald-400 hover:underline">
              Manage →
            </Link>
          }
        >
          <p className="text-xs text-zinc-400">
            Pre-creates target zone & batch-imports DNS records without deleting source zone before
            Cloudflare Registrar move.
          </p>
        </BentoCard>

        <BentoCard
          title="Supabase Free-Tier Slots"
          subtitle="Quick Pause / Restore & Cross-Account Recreate"
          size={BENTO_SIZE.MD}
          icon={<Database className="h-4 w-4" />}
          action={
            <Link to={WEB_ROUTES.PROJECTS} className="text-xs text-emerald-400 hover:underline">
              Projects →
            </Link>
          }
        >
          <p className="text-xs text-zinc-400">
            Includes 1-click Pause/Restore, Edge Functions migration, pg_dump helper, row-count
            verification & ENV_REWIRE.
          </p>
        </BentoCard>

        <BentoCard
          title="Security Guardrails"
          subtitle="AES-256-GCM & Blue-Green Cutover"
          size={BENTO_SIZE.MD}
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <p className="text-xs text-zinc-400">
            Self-protected admin domain, Turnstile login guard, and encrypted snapshots.
          </p>
        </BentoCard>

        <BentoCard
          title="Recent Migration Jobs"
          subtitle="Resumable step-by-step transfers"
          size={BENTO_SIZE.MD}
          icon={<ArrowRightLeft className="h-4 w-4" />}
          action={
            <Link to={WEB_ROUTES.MIGRATIONS} className="text-xs text-emerald-400 hover:underline">
              All Jobs →
            </Link>
          }
        >
          {summary && summary.recentJobs.length > 0 ? (
            <ul className="space-y-2 text-xs">
              {summary.recentJobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/50 px-2.5 py-1.5"
                >
                  <div>
                    <span className="font-medium text-zinc-200">{job.resourceName}</span>
                    <span className="ml-2 text-zinc-500">
                      {MIGRATION_TEMPLATE_LABEL[job.template as MigrationTemplate] ?? job.template}
                    </span>
                  </div>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    {job.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">No migration jobs created yet.</p>
          )}
        </BentoCard>

        <BentoCard
          title="Recent Audit Trail"
          subtitle="Every administrative action recorded"
          size={BENTO_SIZE.MD}
          action={
            <Link to={WEB_ROUTES.AUDIT_LOGS} className="text-xs text-emerald-400 hover:underline">
              Audit Log →
            </Link>
          }
        >
          {summary && summary.recentAuditLogs.length > 0 ? (
            <ul className="space-y-1.5 text-xs">
              {summary.recentAuditLogs.slice(0, 4).map((log) => (
                <li key={log.id} className="flex items-center justify-between text-zinc-400">
                  <span className="font-mono text-zinc-200">{log.action}</span>
                  <span className="text-zinc-500">{log.targetType}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">No recent audit events.</p>
          )}
        </BentoCard>
      </BentoGrid>
    </div>
  );
};
