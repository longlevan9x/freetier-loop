import { BENTO_SIZE } from '@freetier-loop/shared';
import { useQuery } from '@tanstack/react-query';
import { Camera, Download } from 'lucide-react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { webEnv } from '../../../config/env';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

export const SnapshotsView = () => {
  const snapshotsQuery = useQuery({
    queryKey: queryKeys.snapshots.all,
    queryFn: async () => {
      const res = await apiClient.api.v1.snapshots.$get();
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
  });

  const snapshots = snapshotsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resource Snapshots</h1>
        <p className="text-sm text-zinc-400">
          Point-in-time DNS (JSON + BIND) and project backups. Secret values are encrypted at rest
          and redacted on export.
        </p>
      </div>

      <BentoGrid>
        <BentoCard
          title={`Saved Snapshots (${snapshots.length})`}
          subtitle="Download redacted JSON or BIND zone files"
          size={BENTO_SIZE.FULL}
          icon={<Camera className="h-4 w-4" />}
          loading={snapshotsQuery.isPending}
        >
          {snapshots.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No snapshots recorded yet. Snapshots are created automatically before every migration
              or manually from the Domains page.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-zinc-100">{snap.resourceName}</span>
                    <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                      {snap.kind}
                    </span>
                    <div className="mt-0.5 font-mono text-[11px] text-zinc-500">ID: {snap.id}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`${webEnv.VITE_API_BASE_URL}/api/v1/snapshots/${snap.id}/download?format=json`}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-zinc-200 hover:border-emerald-500/60"
                    >
                      <Download className="h-3 w-3" />
                      JSON
                    </a>
                    {snap.bindZoneFile ? (
                      <a
                        href={`${webEnv.VITE_API_BASE_URL}/api/v1/snapshots/${snap.id}/download?format=bind`}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-2.5 py-1 text-emerald-300 hover:bg-emerald-900/40"
                      >
                        <Download className="h-3 w-3" />
                        BIND Zone
                      </a>
                    ) : null}
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
