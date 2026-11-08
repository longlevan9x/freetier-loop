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
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Database,
  ExternalLink,
  GitBranch,
  Globe,
  KeyRound,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { Button } from '../../../components/ui/button';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

const formatGitRepo = (gitRepo: unknown): string | null => {
  if (!gitRepo) return null;
  if (typeof gitRepo === 'string' && gitRepo.trim()) return gitRepo.trim();
  if (typeof gitRepo === 'object' && gitRepo !== null) {
    const record = gitRepo as Record<string, unknown>;
    if (typeof record.repo === 'string' && record.repo.trim()) {
      return record.repo.trim();
    }
    if (typeof record.name === 'string' && record.name.trim()) {
      return record.name.trim();
    }
    if (typeof record.url === 'string' && record.url.trim()) {
      return record.url.trim();
    }
  }
  return null;
};

export const ProjectsView = () => {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | 'vercel' | 'supabase'>('all');
  const [syncProgress, setSyncProgress] = useState<Record<string, string>>({});
  const [syncingAccounts, setSyncingAccounts] = useState<Record<string, boolean>>({});

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

  const projectDomainsQuery = useQuery({
    queryKey: queryKeys.resources.list({ kind: RESOURCE_KIND.PROJECT_DOMAIN }),
    queryFn: async () => {
      const res = await apiClient.api.v1.resources.$get({
        query: { kind: RESOURCE_KIND.PROJECT_DOMAIN, limit: '100' },
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

  const handleChunkedSync = async (accountId: string) => {
    if (syncingAccounts[accountId]) return;
    setSyncingAccounts((prev) => ({ ...prev, [accountId]: true }));
    setSyncProgress((prev) => ({ ...prev, [accountId]: 'Đang quét tài nguyên…' }));
    let cursor: string | undefined;
    try {
      do {
        const res = await apiClient.api.v1['provider-accounts'][':id'].sync.$post({
          param: { id: accountId },
          query: cursor ? { cursor } : {},
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw errBody ?? new Error('Sync failed');
        }
        const json = await res.json();
        cursor = json.data.nextCursor ?? undefined;
      } while (cursor);

      setSyncProgress((prev) => ({ ...prev, [accountId]: 'Đã đồng bộ thành công' }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerAccounts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
    } catch {
      setSyncProgress((prev) => ({ ...prev, [accountId]: 'Đồng bộ thất bại' }));
    } finally {
      setSyncingAccounts((prev) => ({ ...prev, [accountId]: false }));
    }
  };

  const accountMap = useMemo(() => {
    return new Map((accountsQuery.data ?? []).map((acc) => [acc.id, acc]));
  }, [accountsQuery.data]);

  const domainsByProjectId = useMemo(() => {
    const map = new Map<string, ResourceDto[]>();
    for (const d of projectDomainsQuery.data ?? []) {
      if (d.parentId) {
        const list = map.get(d.parentId) ?? [];
        list.push(d);
        map.set(d.parentId, list);
      }
    }
    return map;
  }, [projectDomainsQuery.data]);

  const getProjectDomains = (
    proj: ResourceDto,
    isVercel: boolean,
  ): Array<{ url: string; label: string; verified?: boolean | undefined }> => {
    if (isVercel) {
      const synced = domainsByProjectId.get(proj.id) ?? [];
      if (synced.length > 0) {
        return synced.map((d) => ({
          url: `https://${d.name}`,
          label: d.name,
          verified: typeof d.data?.verified === 'boolean' ? d.data.verified : undefined,
        }));
      }
      return [
        {
          url: `https://${proj.name}.vercel.app`,
          label: `${proj.name}.vercel.app`,
        },
      ];
    }

    const externalId = proj.externalId;
    const dbHost = typeof proj.data?.dbHost === 'string' ? proj.data.dbHost : null;
    const domains: Array<{ url: string; label: string; verified?: boolean | undefined }> = [];
    if (externalId) {
      domains.push({
        url: `https://${externalId}.supabase.co`,
        label: `${externalId}.supabase.co`,
        verified: true,
      });
    }
    if (dbHost && !domains.some((d) => d.label === dbHost)) {
      domains.push({
        url: `https://${dbHost}`,
        label: dbHost,
        verified: true,
      });
    }
    return domains;
  };

  const allAccounts = accountsQuery.data ?? [];
  const relevantAccounts = useMemo(() => {
    return allAccounts.filter(
      (a) => a.provider === PROVIDER.VERCEL || a.provider === PROVIDER.SUPABASE,
    );
  }, [allAccounts]);

  const allVercelProjects: ResourceDto[] = vercelQuery.data ?? [];
  const allSupabaseProjects: ResourceDto[] = supabaseQuery.data ?? [];
  const children: ResourceDto[] = detailQuery.data?.children ?? [];

  // Map projects by providerAccountId
  const projectsByAccountId = useMemo(() => {
    const map = new Map<string, ResourceDto[]>();
    for (const p of [...allVercelProjects, ...allSupabaseProjects]) {
      const list = map.get(p.providerAccountId) ?? [];
      list.push(p);
      map.set(p.providerAccountId, list);
    }
    return map;
  }, [allVercelProjects, allSupabaseProjects]);

  // Filter accounts by provider and search keyword
  const displayedAccounts = useMemo(() => {
    return relevantAccounts.filter((acc) => {
      if (providerFilter !== 'all' && acc.provider !== providerFilter) {
        return false;
      }
      if (!search.trim()) return true;

      const q = search.toLowerCase();
      const labelMatch = acc.label.toLowerCase().includes(q);
      const projects = projectsByAccountId.get(acc.id) ?? [];
      const projectMatch = projects.some((p) => p.name.toLowerCase().includes(q));
      return labelMatch || projectMatch;
    });
  }, [relevantAccounts, providerFilter, search, projectsByAccountId]);

  const hasAppAccount = relevantAccounts.length > 0;
  const needsSync =
    hasAppAccount &&
    allVercelProjects.length === 0 &&
    allSupabaseProjects.length === 0 &&
    !vercelQuery.isPending &&
    !supabaseQuery.isPending;

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
            Mỗi tài khoản hiển thị riêng một khung, kèm badge dịch vụ rõ ràng giúp quản lý nhiều tài
            khoản cùng lúc.
          </p>
        </div>

        {/* Global Summary Badges */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300">
            <Server className="h-3.5 w-3.5 text-zinc-300" />
            Vercel: <strong className="text-zinc-100">{allVercelProjects.length}</strong> dự án
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300">
            <Database className="h-3.5 w-3.5 text-emerald-400" />
            Supabase: <strong className="text-zinc-100">{allSupabaseProjects.length}</strong> dự án
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 backdrop-blur">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm theo tên dự án hoặc tài khoản…"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Provider Filter Tabs */}
        <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/80 p-1 text-xs">
          <button
            type="button"
            onClick={() => setProviderFilter('all')}
            className={`rounded-lg px-3 py-1 font-medium transition cursor-pointer ${
              providerFilter === 'all'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Tất cả ({relevantAccounts.length})
          </button>
          <button
            type="button"
            onClick={() => setProviderFilter('vercel')}
            className={`flex items-center gap-1 rounded-lg px-3 py-1 font-medium transition cursor-pointer ${
              providerFilter === 'vercel'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Server className="h-3 w-3" />
            Vercel ({relevantAccounts.filter((a) => a.provider === PROVIDER.VERCEL).length})
          </button>
          <button
            type="button"
            onClick={() => setProviderFilter('supabase')}
            className={`flex items-center gap-1 rounded-lg px-3 py-1 font-medium transition cursor-pointer ${
              providerFilter === 'supabase'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Database className="h-3 w-3 text-emerald-400" />
            Supabase ({relevantAccounts.filter((a) => a.provider === PROVIDER.SUPABASE).length})
          </button>
        </div>
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

      {/* ===================== ACCOUNT-CENTRIC BENTO GRID ===================== */}
      {/* Mỗi tài khoản là 1 khung riêng biệt */}
      {displayedAccounts.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="text-sm text-zinc-400">
            {search
              ? 'Không tìm thấy tài khoản hoặc dự án nào khớp với từ khóa tìm kiếm.'
              : 'Chưa có tài khoản Vercel hoặc Supabase nào được kết nối.'}
          </p>
          <div className="mt-4">
            <Link
              to={WEB_ROUTES.ACCOUNTS}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Kết nối tài khoản ngay
            </Link>
          </div>
        </div>
      ) : (
        <BentoGrid>
          {displayedAccounts.map((acc) => {
            const isVercel = acc.provider === PROVIDER.VERCEL;
            const isNeverSynced = !acc.lastSyncedAt;
            const rawProjects = projectsByAccountId.get(acc.id) ?? [];
            const projects = search.trim()
              ? rawProjects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
              : rawProjects;

            return (
              <BentoCard
                key={acc.id}
                title={acc.label}
                subtitle={`Token ••••${acc.tokenLast4}${acc.accountType ? ` · ${acc.accountType.toUpperCase()}` : ''}`}
                size={BENTO_SIZE.MD}
                icon={
                  isVercel ? (
                    <Server className="h-4 w-4 text-zinc-300" />
                  ) : (
                    <Database className="h-4 w-4 text-emerald-400" />
                  )
                }
                action={
                  <div className="flex items-center gap-2">
                    {/* Service Badge rõ ràng */}
                    {isVercel ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/90 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-200">
                        <Server className="h-3 w-3 text-zinc-400" />
                        Vercel {acc.accountType ? `(${acc.accountType.toUpperCase()})` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                        <Database className="h-3 w-3 text-emerald-400" />
                        Supabase
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-zinc-400">
                      {projects.length} dự án
                    </span>
                  </div>
                }
              >
                <div className="space-y-3 pt-1">
                  {/* Sync status / progress message */}
                  {(() => {
                    const progress = syncProgress[acc.id];
                    if (!progress) return null;
                    const isFailed = progress.includes('thất bại');
                    const isSyncing = syncingAccounts[acc.id];
                    return (
                      <div
                        className={`flex items-center gap-1.5 text-xs ${
                          isFailed
                            ? 'text-red-400'
                            : isSyncing
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                        }`}
                      >
                        {isSyncing ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : isFailed ? (
                          <AlertCircle className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {progress}
                      </div>
                    );
                  })()}

                  {/* Empty state per account */}
                  {projects.length === 0 ? (
                    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-4 text-center space-y-2">
                      <p className="text-xs text-zinc-400">
                        {isNeverSynced
                          ? 'Tài khoản này chưa được đồng bộ tài nguyên.'
                          : 'Tài khoản này hiện không có dự án nào.'}
                      </p>
                      {isNeverSynced ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={Boolean(syncingAccounts[acc.id])}
                          onClick={() => void handleChunkedSync(acc.id)}
                          className="gap-1.5 border-amber-500/50 text-amber-300 hover:bg-amber-950/30 text-xs"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${syncingAccounts[acc.id] ? 'animate-spin' : ''}`}
                          />
                          {syncingAccounts[acc.id] ? 'Đang đồng bộ…' : 'Đồng bộ tài nguyên ngay'}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    /* Project items for this account */
                    <div className="space-y-2">
                      {projects.map((proj) => {
                        const isSelected = selectedProjectId === proj.id;
                        const status = String(
                          proj.data.status ?? SUPABASE_PROJECT_STATUS.ACTIVE_HEALTHY,
                        );
                        const isPaused = status === SUPABASE_PROJECT_STATUS.INACTIVE;

                        return (
                          <div
                            key={proj.id}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 transition ${
                              isSelected
                                ? 'border-emerald-500/80 bg-emerald-950/20 shadow-sm'
                                : 'border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedProjectId(proj.id)}
                              className="text-left cursor-pointer flex-1 min-w-[170px]"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-zinc-100 hover:text-emerald-300 transition">
                                  {proj.name}
                                </span>

                                {!isVercel ? (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      isPaused
                                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    }`}
                                  >
                                    {isPaused ? 'Tạm dừng (Paused)' : 'Hoạt động (Active)'}
                                  </span>
                                ) : (
                                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                                    {typeof proj.data.framework === 'string' && proj.data.framework
                                      ? proj.data.framework
                                      : 'custom'}
                                  </span>
                                )}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {getProjectDomains(proj, isVercel).map((dom) => (
                                  <a
                                    key={dom.url}
                                    href={dom.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/90 px-2 py-0.5 text-[11px] font-mono text-emerald-400 hover:border-emerald-500/50 hover:bg-zinc-800 transition"
                                    title={`Mở trang web: ${dom.url}`}
                                  >
                                    <Globe className="h-3 w-3 text-emerald-400 shrink-0" />
                                    <span className="truncate max-w-[220px]">{dom.label}</span>
                                    <ExternalLink className="h-2.5 w-2.5 opacity-60 hover:opacity-100 shrink-0" />
                                  </a>
                                ))}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                <span>Ref: {proj.externalId}</span>
                                {!isVercel && proj.data.region ? (
                                  <span>· Region: {String(proj.data.region)}</span>
                                ) : null}
                                {isVercel ? (
                                  (() => {
                                    const git = proj.data.gitRepo as
                                      | { type?: string; repo?: string }
                                      | undefined;
                                    if (!git || !git.type) {
                                      return (
                                        <span className="inline-flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-500">
                                          Không kết nối Git
                                        </span>
                                      );
                                    }
                                    if (git.type.toLowerCase() === 'gitlab') {
                                      return (
                                        <span className="inline-flex items-center gap-1 rounded bg-orange-950/50 border border-orange-800/60 px-1.5 py-0.2 text-[10px] font-mono text-orange-300">
                                          <GitBranch className="h-2.5 w-2.5 text-orange-400" />
                                          GitLab: {git.repo}
                                        </span>
                                      );
                                    }
                                    if (git.type.toLowerCase() === 'github') {
                                      return (
                                        <span className="inline-flex items-center gap-1 rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.2 text-[10px] font-mono text-zinc-300">
                                          <GitBranch className="h-2.5 w-2.5 text-zinc-400" />
                                          GitHub: {git.repo}
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="inline-flex items-center gap-1 rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.2 text-[10px] font-mono text-zinc-300">
                                        <GitBranch className="h-2.5 w-2.5 text-zinc-400" />
                                        {git.type}: {git.repo}
                                      </span>
                                    );
                                  })()
                                ) : formatGitRepo(proj.data.gitRepo) ? (
                                  <span>· Repo: {formatGitRepo(proj.data.gitRepo)}</span>
                                ) : null}
                              </div>
                            </button>

                            <div className="flex items-center gap-1.5">
                              {/* Supabase Pause / Restore Action */}
                              {!isVercel ? (
                                isPaused ? (
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
                                )
                              ) : null}

                              {/* Migrate Link */}
                              <Link
                                to={WEB_ROUTES.MIGRATIONS}
                                className="inline-flex items-center gap-1 rounded-lg bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700 transition"
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
                </div>
              </BentoCard>
            );
          })}
        </BentoGrid>
      )}

      {/* ===================== INSPECTOR CARD ===================== */}
      <BentoCard
        title={
          selectedProjectResource
            ? `Chi tiết: ${selectedProjectResource.name} · Thuộc tài khoản: ${selectedProjectAccount?.label ?? 'Không xác định'}`
            : 'Bộ kiểm tra Biến môi trường & Edge Functions'
        }
        subtitle={
          selectedProjectAccount
            ? `Dịch vụ: ${PROVIDER_LABEL[selectedProjectAccount.provider]} · Ref: ${selectedProjectResource?.externalId ?? ''} · Token: ••••${selectedProjectAccount.tokenLast4}`
            : 'Bấm chọn một dự án ở các khung tài khoản phía trên để kiểm tra biến môi trường và functions.'
        }
        size={BENTO_SIZE.FULL}
        icon={<KeyRound className="h-4 w-4" />}
        loading={detailQuery.isFetching}
      >
        {selectedProjectId && children.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((item) => {
              const isEnv = item.kind === RESOURCE_KIND.ENV_VAR;
              const isDomain = item.kind === RESOURCE_KIND.PROJECT_DOMAIN;
              const isWriteOnly = isEnv && item.data.readable === false;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="font-mono font-medium text-zinc-200 truncate">{item.name}</div>
                    <div className="text-[11px] text-zinc-500">{item.kind}</div>
                  </div>
                  {isDomain ? (
                    <a
                      href={`https://${item.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-mono text-emerald-300 hover:underline shrink-0"
                    >
                      <Globe className="h-3 w-3" />
                      <span>Visit</span>
                      <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                    </a>
                  ) : isEnv ? (
                    isWriteOnly ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300 shrink-0">
                        write-only secret
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300 shrink-0">
                        readable (encrypted)
                      </span>
                    )
                  ) : (
                    <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300 shrink-0">
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
              : 'Bấm chọn một dự án ở các khung tài khoản phía trên để xem chi tiết biến môi trường và Edge Functions.'}
          </p>
        )}
      </BentoCard>
    </div>
  );
};
