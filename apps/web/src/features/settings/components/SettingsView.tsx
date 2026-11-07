import { BENTO_SIZE } from '@freetier-loop/shared';
import { useQuery } from '@tanstack/react-query';
import { Lock, Settings } from 'lucide-react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

export const SettingsView = () => {
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: async () => {
      const res = await apiClient.api.v1.settings.$get();
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
  });

  const data = settingsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security & Quota Settings</h1>
        <p className="text-sm text-zinc-400">
          Environment configuration, self-protected hosts, and free-tier quota thresholds.
        </p>
      </div>

      <BentoGrid>
        <BentoCard
          title="Access & Self-Protection Guard"
          subtitle="Configured via Worker environment secrets"
          size={BENTO_SIZE.MD}
          icon={<Lock className="h-4 w-4" />}
          loading={settingsQuery.isPending}
        >
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-zinc-400">Allowlisted Admin Emails: </span>
              <span className="font-mono text-zinc-200">
                {data?.adminEmails.length ? data.adminEmails.join(', ') : 'All seeded admins'}
              </span>
            </div>
            <div>
              <span className="text-zinc-400">Self-Protected Hosts: </span>
              <span className="font-mono text-emerald-400">
                {data?.selfProtectedHosts.length
                  ? data.selfProtectedHosts.join(', ')
                  : 'Auto-detected from BETTER_AUTH_URL'}
              </span>
            </div>
            <div>
              <span className="text-zinc-400">AES-256-GCM Key Version: </span>
              <span className="font-mono text-zinc-200">v{data?.encryptionKeyVersion ?? 1}</span>
            </div>
          </div>
        </BentoCard>

        <BentoCard
          title="Free-Tier Quota Thresholds"
          subtitle="Used by Usage Service & Cron sync"
          size={BENTO_SIZE.MD}
          icon={<Settings className="h-4 w-4" />}
        >
          <div className="space-y-1.5 font-mono text-xs text-zinc-300">
            <div>
              CF Workers Requests/day:{' '}
              {data?.freeTierLimits.CF_WORKERS_REQUESTS_PER_DAY.toLocaleString() ?? '100,000'}
            </div>
            <div>
              Vercel Deployments/day: {data?.freeTierLimits.VERCEL_DEPLOYMENTS_PER_DAY ?? 100}
            </div>
            <div>
              Supabase Active Free Projects/user:{' '}
              {data?.freeTierLimits.SUPABASE_ACTIVE_PROJECTS_MAX ?? 2}
            </div>
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
  );
};
