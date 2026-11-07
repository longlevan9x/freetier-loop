import {
  BENTO_SIZE,
  PROVIDER,
  RESOURCE_KIND,
  type ResourceDto,
  SUPABASE_PROJECT_STATUS,
  WEB_ROUTES,
} from '@freetier-loop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRightLeft,
  Database,
  KeyRound,
  Pause,
  Play,
  RefreshCw,
  Server,
} from 'lucide-react';
import { useState } from 'react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { Button } from '../../../components/ui/button';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

export const ProjectsView = () => {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const vercelQuery = useQuery({
    queryKey: queryKeys.resources.list({ kind: RESOURCE_KIND.VERCEL_PROJECT }),
    queryFn: async () => {
      const res = await apiClient.api.v1.resources.$get({
        query: { kind: RESOURCE_KIND.VERCEL_PROJECT, limit: '100' },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
  });

  const supabaseQuery = useQuery({
    queryKey: queryKeys.resources.list({ kind: RESOURCE_KIND.SUPABASE_PROJECT }),
    queryFn: async () => {
      const res = await apiClient.api.v1.resources.$get({
        query: { kind: RESOURCE_KIND.SUPABASE_PROJECT, limit: '100' },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.resources.detail(selectedProjectId ?? 'none'),
    enabled: Boolean(selectedProjectId),
    queryFn: async () => {
      if (!selectedProjectId) return null;
      const res = await apiClient.api.v1.resources[':id'].$get({
        param: { id: selectedProjectId },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.api.v1.resources[':id'].pause.$post({
        param: { id },
      });
      if (!res.ok) throw new Error('Pause failed');
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.api.v1.resources[':id'].restore.$post({
        param: { id },
      });
      if (!res.ok) throw new Error('Restore failed');
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all });
    },
  });

  const accountsQuery = useQuery({
    queryKey: queryKeys.providerAccounts.all,
    queryFn: async () => {
      const res = await apiClient.api.v1['provider-accounts'].$get();
      if (!res.ok) throw new Error('Failed to load accounts');
      const json = await res.json();
      return json.data;
    },
  });

  const vercelProjects: ResourceDto[] = vercelQuery.data ?? [];
  const supabaseProjects: ResourceDto[] = supabaseQuery.data ?? [];
  const children: ResourceDto[] = detailQuery.data?.children ?? [];

  const hasAppAccount = (accountsQuery.data ?? []).some(
    (a) => a.provider === PROVIDER.VERCEL || a.provider === PROVIDER.SUPABASE,
  );
  const needsSync =
    hasAppAccount &&
    vercelProjects.length === 0 &&
    supabaseProjects.length === 0 &&
    !vercelQuery.isPending &&
    !supabaseQuery.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Projects & Databases</h1>
        <p className="text-sm text-zinc-400">
          Manage Vercel deployments (Hobby & Team) and Supabase PostgreSQL + Edge Function projects.
        </p>
      </div>

      {needsSync ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/25 p-5 shadow-lg shadow-amber-950/20 backdrop-blur">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Bạn đã kết nối tài khoản Vercel / Supabase nhưng chưa quét tài nguyên
                </h3>
                <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                  Danh sách dự án và biến môi trường đang trống vì chưa được đồng bộ từ Vercel và
                  Supabase API về hệ thống.
                </p>
              </div>
            </div>
            <Link
              to={WEB_ROUTES.ACCOUNTS}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Bấm vào đây để đồng bộ ngay
            </Link>
          </div>
        </div>
      ) : null}

      <BentoGrid>
        <BentoCard
          title={`Supabase Projects (${supabaseProjects.length})`}
          subtitle="Free tier allows 2 active projects per user across orgs — Pause inactive ones to free slots"
          size={BENTO_SIZE.MD}
          icon={<Database className="h-4 w-4" />}
          loading={supabaseQuery.isPending}
        >
          {supabaseProjects.length === 0 ? (
            <p className="text-xs text-zinc-500">No Supabase projects synced yet.</p>
          ) : (
            <div className="space-y-2.5">
              {supabaseProjects.map((proj) => {
                const status = String(proj.data.status ?? SUPABASE_PROJECT_STATUS.ACTIVE_HEALTHY);
                const isPaused = status === SUPABASE_PROJECT_STATUS.INACTIVE;
                return (
                  <div
                    key={proj.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(proj.id)}
                      className="text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100">{proj.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            isPaused
                              ? 'bg-zinc-800 text-zinc-400'
                              : 'bg-emerald-500/15 text-emerald-400'
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        Ref: {proj.externalId} · Region: {String(proj.data.region ?? 'default')}
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {isPaused ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => restoreMutation.mutate(proj.id)}
                          disabled={restoreMutation.isPending}
                          className="gap-1 h-7 text-xs border-emerald-700/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
                        >
                          <Play className="h-3 w-3" />
                          Restore
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => pauseMutation.mutate(proj.id)}
                          disabled={pauseMutation.isPending}
                          className="gap-1 h-7 text-xs border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50"
                        >
                          <Pause className="h-3 w-3" />
                          Pause Slot
                        </Button>
                      )}
                      <Link
                        to={WEB_ROUTES.MIGRATIONS}
                        className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        Transfer / Recreate…
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BentoCard>

        <BentoCard
          title={`Vercel Projects (${vercelProjects.length})`}
          subtitle="Supports native Team transfer & Hobby Blue-Green Git recreation"
          size={BENTO_SIZE.MD}
          icon={<Server className="h-4 w-4" />}
          loading={vercelQuery.isPending}
        >
          {vercelProjects.length === 0 ? (
            <p className="text-xs text-zinc-500">No Vercel projects synced yet.</p>
          ) : (
            <div className="space-y-2.5">
              {vercelProjects.map((proj) => {
                const accountType = String(proj.data.accountType ?? 'hobby').toUpperCase();
                return (
                  <div
                    key={proj.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(proj.id)}
                      className="text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100">{proj.name}</span>
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-mono text-zinc-300">
                          {accountType}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        Framework: {String(proj.data.framework ?? 'custom')}
                      </div>
                    </button>

                    <Link
                      to={WEB_ROUTES.MIGRATIONS}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      Transfer / Recreate…
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </BentoCard>

        <BentoCard
          title={
            detailQuery.data?.resource
              ? `Environment Variables, Domains & Functions — ${detailQuery.data.resource.name}`
              : 'Project Environment & Edge Functions Inspector'
          }
          subtitle="Secret values are never exposed; sensitive & function secrets are marked write-only"
          size={BENTO_SIZE.FULL}
          icon={<KeyRound className="h-4 w-4" />}
          loading={detailQuery.isFetching}
        >
          {selectedProjectId && children.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {children.map((item) => {
                const isEnv = item.kind === RESOURCE_KIND.ENV_VAR;
                const isWriteOnly = isEnv && item.data.readable === false;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-mono font-medium text-zinc-200">{item.name}</div>
                      <div className="text-[11px] text-zinc-500">{item.kind}</div>
                    </div>
                    {isEnv ? (
                      isWriteOnly ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                          write-only secret
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                          readable (encrypted)
                        </span>
                      )
                    ) : (
                      <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                        active
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Click any Supabase or Vercel project above to inspect its environment variables,
              domains, and Edge Functions.
            </p>
          )}
        </BentoCard>
      </BentoGrid>
    </div>
  );
};
