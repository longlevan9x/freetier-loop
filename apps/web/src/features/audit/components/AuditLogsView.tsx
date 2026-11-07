import { BENTO_SIZE } from '@freetier-loop/shared';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

export const AuditLogsView = () => {
  const logsQuery = useQuery({
    queryKey: queryKeys.auditLogs.list(),
    queryFn: async () => {
      const res = await apiClient.api.v1['audit-logs'].$get({
        query: { limit: '50' },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
  });

  const logs = logsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Audit Trail</h1>
        <p className="text-sm text-zinc-400">
          Immutable log of all authentication events, token changes, snapshots, and migration jobs.
        </p>
      </div>

      <BentoGrid>
        <BentoCard
          title={`Audit Events (${logs.length})`}
          subtitle="Ordered newest first"
          size={BENTO_SIZE.FULL}
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={logsQuery.isPending}
        >
          {logs.length === 0 ? (
            <p className="text-xs text-zinc-500">No audit log events recorded yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-emerald-400">
                      {log.action}
                    </span>
                    <span className="text-zinc-300">
                      {log.targetType}: <span className="font-mono">{log.targetId}</span>
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-zinc-500">
                    {new Date(log.createdAt).toISOString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </BentoCard>
      </BentoGrid>
    </div>
  );
};
