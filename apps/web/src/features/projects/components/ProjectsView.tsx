import {
  BENTO_SIZE,
  PROVIDER,
  PROVIDER_LABEL,
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
  Cloud,
  Database,
  Filter,
  KeyRound,
  Layers,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { Button } from '../../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

export const ProjectsView = () => {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [groupByAccount, setGroupByAccount] = useState<boolean>(true);

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

  const accountMap = useMemo(() => {
    return new Map((accountsQuery.data ?? []).map((acc) => [acc.id, acc]));
  }, [accountsQuery.data]);

  const allAccounts = accountsQuery.data ?? [];
  const relevantAccounts = useMemo(() => {
    return allAccounts.filter(
      (a) => a.provider === PROVIDER.VERCEL || a.provider === PROVIDER.SUPABASE,
    );
  }, [allAccounts]);

  const allVercelProjects: ResourceDto[] = vercelQuery.data ?? [];
  const allSupabaseProjects: ResourceDto[] = supabaseQuery.data ?? [];
  const children: ResourceDto[] = detailQuery.data?.children ?? [];

  // Filter projects by search and selected account
  const filteredVercelProjects = useMemo(() => {
    return allVercelProjects.filter((p) => {
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchesAccount =
        selectedAccountId === 'all' || p.providerAccountId === selectedAccountId;
      return matchesSearch && matchesAccount;
    });
  }, [allVercelProjects, search, selectedAccountId]);

  const filteredSupabaseProjects = useMemo(() => {
    return allSupabaseProjects.filter((p) => {
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchesAccount =
        selectedAccountId === 'all' || p.providerAccountId === selectedAccountId;
      return matchesSearch && matchesAccount;
    });
  }, [allSupabaseProjects, search, selectedAccountId]);

  const hasAppAccount = relevantAccounts.length > 0;
  const needsSync =
    hasAppAccount &&
    allVercelProjects.length === 0 &&
    allSupabaseProjects.length === 0 &&
    !vercelQuery.isPending &&
    !supabaseQuery.isPending;

  // Group Vercel projects by account
  const vercelProjectsByAccount = useMemo(() => {
    const groups: {
      accountId: string;
      accountLabel: string;
      accountType: string | null;
      tokenLast4: string;
      projects: ResourceDto[];
    }[] = [];
    const map = new Map<string, ResourceDto[]>();

    for (const p of filteredVercelProjects) {
      const list = map.get(p.providerAccountId) ?? [];
      list.push(p);
      map.set(p.providerAccountId, list);
    }

    for (const [accId, projs] of map.entries()) {
      const acc = accountMap.get(accId);
      groups.push({
        accountId: accId,
        accountLabel: acc?.label ?? `Account ${accId.slice(0, 8)}`,
        accountType: acc?.accountType ?? null,
        tokenLast4: acc?.tokenLast4 ?? '••••',
        projects: projs,
      });
    }

    return groups;
  }, [filteredVercelProjects, accountMap]);

  // Group Supabase projects by account
  const supabaseProjectsByAccount = useMemo(() => {
    const groups: {
      accountId: string;
      accountLabel: string;
      tokenLast4: string;
      projects: ResourceDto[];
    }[] = [];
    const map = new Map<string, ResourceDto[]>();

    for (const p of filteredSupabaseProjects) {
      const list = map.get(p.providerAccountId) ?? [];
      list.push(p);
      map.set(p.providerAccountId, list);
    }

    for (const [accId, projs] of map.entries()) {
      const acc = accountMap.get(accId);
      groups.push({
        accountId: accId,
        accountLabel: acc?.label ?? `Account ${accId.slice(0, 8)}`,
        tokenLast4: acc?.tokenLast4 ?? '••••',
        projects: projs,
      });
    }

    return groups;
  }, [filteredSupabaseProjects, accountMap]);

  const selectedProjectResource = detailQuery.data?.resource;
  const selectedProjectAccount = selectedProjectResource
    ? accountMap.get(selectedProjectResource.providerAccountId)
    : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects & Databases</h1>
          <p className="text-sm text-zinc-400">
            Quản lý dự án Vercel và cơ sở dữ liệu Supabase theo từng tài khoản kết nối.
          </p>
        </div>

        {/* Global Stats Counter */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300">
            <Server className="h-3.5 w-3.5 text-zinc-400" />
            Vercel: <strong className="text-zinc-100">{allVercelProjects.length}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300">
            <Database className="h-3.5 w-3.5 text-emerald-400" />
            Supabase: <strong className="text-zinc-100">{allSupabaseProjects.length}</strong>
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 backdrop-blur">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm dự án theo tên…"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Account Selector */}
          <div className="w-64">
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger>
                <div className="flex items-center gap-1.5 truncate">
                  <Filter className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <SelectValue placeholder="Lọc theo tài khoản" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả tài khoản ({relevantAccounts.length})</SelectItem>
                {relevantAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    [{PROVIDER_LABEL[acc.provider]}] {acc.label} (••••{acc.tokenLast4})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Group By Account Toggle */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setGroupByAccount((prev) => !prev)}
          className={`gap-1.5 text-xs ${groupByAccount ? 'border-emerald-500/60 text-emerald-300 bg-emerald-950/20' : 'text-zinc-400'}`}
        >
          <Layers className="h-3.5 w-3.5" />
          {groupByAccount ? 'Đang nhóm theo Tài khoản' : 'Xem dạng danh sách phẳng'}
        </Button>
      </div>

      {/* Empty State Banner if accounts exist but never synced */}
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
        {/* ===================== VERCEL PROJECTS ===================== */}
        <BentoCard
          title={`Vercel Projects (${filteredVercelProjects.length})`}
          subtitle="Deployments, Custom Domains, và Environment Variables"
          size={BENTO_SIZE.MD}
          icon={<Server className="h-4 w-4" />}
          loading={vercelQuery.isPending}
        >
          {filteredVercelProjects.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">
              {search || selectedAccountId !== 'all'
                ? 'Không tìm thấy dự án Vercel nào phù hợp bộ lọc.'
                : 'Chưa có dự án Vercel nào được đồng bộ.'}
            </p>
          ) : groupByAccount ? (
            /* Grouped View by Account */
            <div className="space-y-4">
              {vercelProjectsByAccount.map((group) => (
                <div
                  key={group.accountId}
                  className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 space-y-2.5"
                >
                  {/* Account Header */}
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded bg-zinc-800 text-zinc-300">
                        <Cloud className="h-3 w-3 text-emerald-400" />
                      </span>
                      <span className="text-xs font-semibold text-zinc-200">
                        {group.accountLabel}
                      </span>
                      {group.accountType ? (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono uppercase text-zinc-400">
                          {group.accountType}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500">
                      ••••{group.tokenLast4} · {group.projects.length} dự án
                    </span>
                  </div>

                  {/* Account's Projects */}
                  <div className="space-y-2">
                    {group.projects.map((proj) => {
                      const isSelected = selectedProjectId === proj.id;
                      return (
                        <div
                          key={proj.id}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 transition ${
                            isSelected
                              ? 'border-emerald-500/80 bg-emerald-950/20 shadow-sm'
                              : 'border-zinc-800/70 bg-zinc-900/40 hover:border-zinc-700'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedProjectId(proj.id)}
                            className="text-left cursor-pointer flex-1 min-w-[160px]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-zinc-100 hover:text-emerald-300 transition">
                                {proj.name}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-zinc-400">
                              Framework:{' '}
                              <span className="font-mono text-zinc-300">
                                {String(proj.data.framework ?? 'custom')}
                              </span>
                              {proj.data.gitRepo ? (
                                <span className="ml-2 text-zinc-500">
                                  Repo: {String(proj.data.gitRepo)}
                                </span>
                              ) : null}
                            </div>
                          </button>

                          <Link
                            to={WEB_ROUTES.MIGRATIONS}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition"
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            Transfer / Recreate…
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Flat List View with prominent Account Badge */
            <div className="space-y-2.5">
              {filteredVercelProjects.map((proj) => {
                const acc = accountMap.get(proj.providerAccountId);
                const isSelected = selectedProjectId === proj.id;
                return (
                  <div
                    key={proj.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 transition ${
                      isSelected
                        ? 'border-emerald-500/80 bg-emerald-950/20 shadow-sm'
                        : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(proj.id)}
                      className="text-left cursor-pointer flex-1 min-w-[200px]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-100 text-sm hover:text-emerald-300 transition">
                          {proj.name}
                        </span>
                        {/* Account Owner Badge */}
                        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                          <Cloud className="h-3 w-3" />
                          {acc?.label ?? 'Vercel Account'}
                        </span>
                        {acc?.accountType ? (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono uppercase text-zinc-400">
                            {acc.accountType}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Framework: {String(proj.data.framework ?? 'custom')}
                      </div>
                    </button>

                    <Link
                      to={WEB_ROUTES.MIGRATIONS}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 transition"
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

        {/* ===================== SUPABASE PROJECTS ===================== */}
        <BentoCard
          title={`Supabase Projects (${filteredSupabaseProjects.length})`}
          subtitle="Free-tier cho phép 2 active project / user — Tạm dừng (Pause) để giải phóng slot"
          size={BENTO_SIZE.MD}
          icon={<Database className="h-4 w-4" />}
          loading={supabaseQuery.isPending}
        >
          {filteredSupabaseProjects.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">
              {search || selectedAccountId !== 'all'
                ? 'Không tìm thấy dự án Supabase nào phù hợp bộ lọc.'
                : 'Chưa có dự án Supabase nào được đồng bộ.'}
            </p>
          ) : groupByAccount ? (
            /* Grouped View by Account */
            <div className="space-y-4">
              {supabaseProjectsByAccount.map((group) => (
                <div
                  key={group.accountId}
                  className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 space-y-2.5"
                >
                  {/* Account Header */}
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded bg-zinc-800 text-zinc-300">
                        <Database className="h-3 w-3 text-emerald-400" />
                      </span>
                      <span className="text-xs font-semibold text-zinc-200">
                        {group.accountLabel}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500">
                      ••••{group.tokenLast4} · {group.projects.length} dự án
                    </span>
                  </div>

                  {/* Account's Projects */}
                  <div className="space-y-2">
                    {group.projects.map((proj) => {
                      const status = String(
                        proj.data.status ?? SUPABASE_PROJECT_STATUS.ACTIVE_HEALTHY,
                      );
                      const isPaused = status === SUPABASE_PROJECT_STATUS.INACTIVE;
                      const isSelected = selectedProjectId === proj.id;
                      return (
                        <div
                          key={proj.id}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 transition ${
                            isSelected
                              ? 'border-emerald-500/80 bg-emerald-950/20 shadow-sm'
                              : 'border-zinc-800/70 bg-zinc-900/40 hover:border-zinc-700'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedProjectId(proj.id)}
                            className="text-left cursor-pointer flex-1 min-w-[160px]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-zinc-100 hover:text-emerald-300 transition">
                                {proj.name}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  isPaused
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {isPaused ? 'Tạm dừng (Paused)' : 'Hoạt động (Active)'}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-zinc-400 font-mono">
                              Ref: {proj.externalId} · Region:{' '}
                              {String(proj.data.region ?? 'default')}
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
                                Khôi phục
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
                                Tạm dừng slot
                              </Button>
                            )}
                            <Link
                              to={WEB_ROUTES.MIGRATIONS}
                              className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700 transition"
                            >
                              <ArrowRightLeft className="h-3 w-3" />
                              Chuyển…
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Flat List View with prominent Account Badge */
            <div className="space-y-2.5">
              {filteredSupabaseProjects.map((proj) => {
                const acc = accountMap.get(proj.providerAccountId);
                const status = String(proj.data.status ?? SUPABASE_PROJECT_STATUS.ACTIVE_HEALTHY);
                const isPaused = status === SUPABASE_PROJECT_STATUS.INACTIVE;
                const isSelected = selectedProjectId === proj.id;
                return (
                  <div
                    key={proj.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 transition ${
                      isSelected
                        ? 'border-emerald-500/80 bg-emerald-950/20 shadow-sm'
                        : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(proj.id)}
                      className="text-left cursor-pointer flex-1 min-w-[200px]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-100 text-sm hover:text-emerald-300 transition">
                          {proj.name}
                        </span>
                        {/* Account Owner Badge */}
                        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                          <Database className="h-3 w-3" />
                          {acc?.label ?? 'Supabase Account'}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isPaused
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {isPaused ? 'Tạm dừng (Paused)' : 'Hoạt động (Active)'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 font-mono">
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
                          Khôi phục
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
                          Tạm dừng slot
                        </Button>
                      )}
                      <Link
                        to={WEB_ROUTES.MIGRATIONS}
                        className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700 transition"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        Chuyển…
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BentoCard>

        {/* ===================== INSPECTOR CARD ===================== */}
        <BentoCard
          title={
            selectedProjectResource
              ? `Chi tiết: ${selectedProjectResource.name} · Thuộc tài khoản: ${selectedProjectAccount?.label ?? 'Không xác định'}`
              : 'Bộ kiểm tra Biến môi trường & Edge Functions'
          }
          subtitle={
            selectedProjectAccount
              ? `Nhà cung cấp: ${PROVIDER_LABEL[selectedProjectAccount.provider]} · Ref: ${selectedProjectResource?.externalId ?? ''} · Token: ••••${selectedProjectAccount.tokenLast4}`
              : 'Bấm chọn một dự án Vercel hoặc Supabase ở trên để xem chi tiết biến môi trường và functions.'
          }
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
              {selectedProjectId
                ? 'Dự án này không có biến môi trường hoặc Edge Function nào được đồng bộ.'
                : 'Bấm chọn một dự án Vercel hoặc Supabase ở trên để xem chi tiết biến môi trường và Edge Functions.'}
            </p>
          )}
        </BentoCard>
      </BentoGrid>
    </div>
  );
};
