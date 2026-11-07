import {
  BENTO_SIZE,
  PROVIDER,
  RESOURCE_KIND,
  type ResourceDto,
  WEB_ROUTES,
} from '@freetier-loop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  Cloud,
  Globe,
  RefreshCw,
  Search,
  Shield,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { Button } from '../../../components/ui/button';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

export const DomainsView = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [recordPage, setRecordPage] = useState(0);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);

  const zonesQuery = useQuery({
    queryKey: queryKeys.resources.list({ kind: RESOURCE_KIND.ZONE, q: search }),
    queryFn: async () => {
      const res = await apiClient.api.v1.resources.$get({
        query: {
          kind: RESOURCE_KIND.ZONE,
          limit: '100',
          ...(search ? { q: search } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to load zones');
      const json = await res.json();
      return json.data;
    },
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.resources.detail(selectedZoneId ?? 'none'),
    enabled: Boolean(selectedZoneId),
    queryFn: async () => {
      if (!selectedZoneId) return null;
      const res = await apiClient.api.v1.resources[':id'].$get({
        param: { id: selectedZoneId },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
  });

  const snapshotMutation = useMutation({
    mutationFn: async (resourceId: string) => {
      const res = await apiClient.api.v1.snapshots.$post({
        json: { resourceId },
      });
      if (!res.ok) throw new Error('Snapshot failed');
      return res.json();
    },
    onSuccess: (res) => {
      setSnapshotStatus(`Snapshot ${res.data.id} saved (${res.data.resourceName})`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all });
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

  const zones: ResourceDto[] = zonesQuery.data ?? [];
  const children: ResourceDto[] = detailQuery.data?.children ?? [];
  const pageSize = 100;
  const visibleRecords = children.slice(recordPage * pageSize, (recordPage + 1) * pageSize);

  const accountMap = useMemo(() => {
    return new Map((accountsQuery.data ?? []).map((acc) => [acc.id, acc]));
  }, [accountsQuery.data]);

  const hasCfAccount = (accountsQuery.data ?? []).some((a) => a.provider === PROVIDER.CLOUDFLARE);
  const needsSync = hasCfAccount && zones.length === 0 && !zonesQuery.isPending && !search;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Domains & DNS Zones</h1>
          <p className="text-sm text-zinc-400">
            Inspect Cloudflare Registrar domains, external zones, nameservers, and DNS records.
          </p>
        </div>

        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter domain name…"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-9 pr-3 py-2 text-xs text-zinc-100"
          />
        </div>
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
                  Bạn đã kết nối tài khoản Cloudflare nhưng chưa quét tài nguyên
                </h3>
                <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                  Danh sách tên miền (Zones) và bản ghi DNS đang trống vì chưa được đồng bộ từ
                  Cloudflare API về hệ thống.
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

      {snapshotStatus ? (
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-300">
          {snapshotStatus}
        </div>
      ) : null}

      <BentoGrid>
        <BentoCard
          title={`Zones (${zones.length})`}
          subtitle="Click a zone to inspect DNS records or capture a BIND snapshot"
          size={BENTO_SIZE.XL}
          icon={<Globe className="h-4 w-4" />}
          loading={zonesQuery.isPending}
        >
          {zones.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No zones synced yet. Connect a Cloudflare account and click Sync Inventory.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {zones.map((zone) => {
                const acc = accountMap.get(zone.providerAccountId);
                const isRegistrar = Boolean(zone.data.registrar || zone.data.isCfRegistrar);
                const isSelected = selectedZoneId === zone.id;
                return (
                  <div
                    key={zone.id}
                    className={`flex flex-wrap items-center justify-between gap-3 py-3 px-2 rounded-lg transition ${
                      isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedZoneId(zone.id);
                        setRecordPage(0);
                      }}
                      className="flex flex-wrap items-center gap-2.5 text-left cursor-pointer"
                    >
                      <span className="font-semibold text-zinc-100">{zone.name}</span>
                      {acc ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                          <Cloud className="h-3 w-3" />
                          {acc.label}
                        </span>
                      ) : null}
                      {isRegistrar ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                          <Shield className="h-3 w-3" />
                          CF Registrar
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                          External Registrar
                        </span>
                      )}
                      <span className="font-mono text-xs text-zinc-500">
                        {String(zone.data.status ?? 'active')}
                      </span>
                    </button>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => snapshotMutation.mutate(zone.id)}
                        className="gap-1 h-7 text-xs"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Snapshot
                      </Button>
                      <Link
                        to={WEB_ROUTES.MIGRATIONS}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Migrate…
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BentoCard>

        <BentoCard
          title={
            detailQuery.data?.resource
              ? `DNS Records — ${detailQuery.data.resource.name}`
              : 'DNS Records Inspector'
          }
          subtitle={
            selectedZoneId
              ? `${children.length} records loaded (windowed ${pageSize}/view)`
              : 'Select a zone to view its DNS records'
          }
          size={BENTO_SIZE.MD}
          loading={detailQuery.isFetching}
        >
          {selectedZoneId && visibleRecords.length > 0 ? (
            <div className="space-y-2">
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {visibleRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between rounded border border-zinc-800/80 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-[11px]"
                  >
                    <span className="text-emerald-400">{String(rec.data.type)}</span>
                    <span className="truncate px-2 text-zinc-200">{String(rec.data.name)}</span>
                    <span className="truncate text-zinc-400">{String(rec.data.content)}</span>
                  </div>
                ))}
              </div>
              {children.length > pageSize ? (
                <div className="flex items-center justify-between pt-2 text-xs">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={recordPage === 0}
                    onClick={() => setRecordPage((p) => Math.max(0, p - 1))}
                    className="h-7 text-xs"
                  >
                    Prev 100
                  </Button>
                  <span className="text-zinc-400">
                    Page {recordPage + 1} / {Math.ceil(children.length / pageSize)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={(recordPage + 1) * pageSize >= children.length}
                    onClick={() => setRecordPage((p) => p + 1)}
                    className="h-7 text-xs"
                  >
                    Next 100
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              {selectedZoneId
                ? 'No child DNS records synced for this zone.'
                : 'Click any zone on the left to inspect its DNS records.'}
            </p>
          )}
        </BentoCard>
      </BentoGrid>
    </div>
  );
};
