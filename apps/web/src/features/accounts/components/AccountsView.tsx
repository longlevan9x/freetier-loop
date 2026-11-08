import {
  ACCOUNT_STATUS,
  BENTO_SIZE,
  PROVIDER,
  PROVIDER_LABEL,
  type Provider,
  type ProviderAccountDto,
  createProviderAccountSchema,
} from '@freetier-loop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
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
import { formatApiError } from '../../../lib/error-messages';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

type AccountKindOption =
  | 'cloudflare'
  | 'vercel'
  | 'supabase'
  | 'gitlab_project'
  | 'gitlab_user'
  | 'github';

interface AccountOptionConfig {
  value: AccountKindOption;
  label: string;
  provider: Provider;
  accountType?: 'project' | 'user';
  defaultLabelPlaceholder: string;
  summary: string;
  scopeRequirement: string;
  guideSteps: string[];
}

const DEFAULT_ACCOUNT_OPTION: AccountOptionConfig = {
  value: 'cloudflare',
  label: 'Cloudflare',
  provider: PROVIDER.CLOUDFLARE,
  defaultLabelPlaceholder: 'VD: Cloudflare Account 1',
  summary: 'Quản lý DNS, Domains, và Cloudflare Workers.',
  scopeRequirement:
    'Zone:Edit, DNS:Edit, Account Settings:Read, Workers Scripts:Edit, Analytics:Read',
  guideSteps: [
    'Cloudflare Dashboard > My Profile > API Tokens',
    'Create Custom Token với các quyền trên',
    'Account Resources: Include All accounts',
  ],
};

const ACCOUNT_OPTIONS: AccountOptionConfig[] = [
  DEFAULT_ACCOUNT_OPTION,
  {
    value: 'vercel',
    label: 'Vercel',
    provider: PROVIDER.VERCEL,
    defaultLabelPlaceholder: 'VD: Vercel Team hoặc Hobby',
    summary: 'Quản lý Projects, Deployments, Custom Domains, và Environment Variables.',
    scopeRequirement: 'Full-Account Token (hỗ trợ cả Hobby & Team accounts)',
    guideSteps: [
      'vercel.com/account/tokens',
      'Tạo token mới với phạm vi Full Account',
      'Dán token vào form bên dưới',
    ],
  },
  {
    value: 'supabase',
    label: 'Supabase',
    provider: PROVIDER.SUPABASE,
    defaultLabelPlaceholder: 'VD: Supabase Personal',
    summary: 'Quản lý Database, Project API keys, và Edge Functions.',
    scopeRequirement: 'Personal Access Token (PAT)',
    guideSteps: [
      'supabase.com/dashboard/account/tokens',
      'Tạo Personal Access Token mới',
      'Dán token vào form bên dưới',
    ],
  },
  {
    value: 'gitlab_project',
    label: 'GitLab (Project)',
    provider: PROVIDER.GITLAB,
    accountType: 'project',
    defaultLabelPlaceholder: 'VD: GitLab (Repo Frontend)',
    summary:
      'Project Access Token gắn trực tiếp với 1 repository. Tự động nhận diện project khi migration, không cần chọn thêm.',
    scopeRequirement: 'Role: Maintainer (hoặc Developer) · Scope: api',
    guideSteps: [
      'Repository GitLab > Settings > Access Tokens',
      'Role: Maintainer (hoặc Developer)',
      'Scopes: Tích chọn duy nhất api',
    ],
  },
  {
    value: 'gitlab_user',
    label: 'GitLab (User)',
    provider: PROVIDER.GITLAB,
    accountType: 'user',
    defaultLabelPlaceholder: 'VD: GitLab (@username)',
    summary:
      'Personal Access Token của tài khoản cá nhân, có quyền quản lý nhiều dự án. Khi migration sẽ hiển thị danh sách để chọn dự án.',
    scopeRequirement: 'Scope: api (Không dùng token chỉ có read_user)',
    guideSteps: [
      'GitLab > User Settings > Access Tokens',
      'Scopes: Tích chọn api',
      'Dán token vào form bên dưới',
    ],
  },
  {
    value: 'github',
    label: 'GitHub',
    provider: PROVIDER.GITHUB,
    defaultLabelPlaceholder: 'VD: GitHub (@username)',
    summary: 'Quản lý GitHub Repositories, Actions Variables & Secrets, Workflows.',
    scopeRequirement: 'Scopes: repo, workflow (Personal Access Token)',
    guideSteps: [
      'GitHub > Settings > Developer Settings > Personal Access Tokens',
      'Generate New Token (Classic) với quyền repo và workflow',
      'Dán token vào form bên dưới',
    ],
  },
];

export const AccountsView = () => {
  const queryClient = useQueryClient();
  const [accountKind, setAccountKind] = useState<AccountKindOption>('cloudflare');
  const [label, setLabel] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<Record<string, string>>({});
  const [syncingAccounts, setSyncingAccounts] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<ProviderAccountDto | null>(null);
  const [confirmLabel, setConfirmLabel] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);

  const currentConfig: AccountOptionConfig =
    ACCOUNT_OPTIONS.find((opt) => opt.value === accountKind) ?? DEFAULT_ACCOUNT_OPTION;

  const accountsQuery = useQuery({
    queryKey: queryKeys.providerAccounts.all,
    queryFn: async () => {
      const res = await apiClient.api.v1['provider-accounts'].$get();
      if (!res.ok) throw new Error('Failed to load provider accounts');
      const json = await res.json();
      return json.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = createProviderAccountSchema.safeParse({
        provider: currentConfig.provider,
        label,
        apiToken,
        ...(currentConfig.accountType ? { accountType: currentConfig.accountType } : {}),
      });
      if (!parsed.success) {
        throw { error: { message: parsed.error.issues[0]?.message ?? 'Invalid input' } };
      }
      const res = await apiClient.api.v1['provider-accounts'].$post({
        json: parsed.data,
      });
      const body = await res.json();
      if (!res.ok) throw body;
      return body;
    },
    onSuccess: (body) => {
      setLabel('');
      setApiToken('');
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerAccounts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
      if (body?.data?.id) {
        void handleChunkedSync(body.data.id);
      }
    },
    onError: (err) => {
      setFormError(formatApiError(err, 'Could not add provider account'));
    },
  });

  const handleChunkedSync = async (accountId: string) => {
    if (syncingAccounts[accountId]) return;
    setSyncingAccounts((prev) => ({ ...prev, [accountId]: true }));
    setSyncProgress((prev) => ({ ...prev, [accountId]: 'Đang đồng bộ batch 1…' }));
    let cursor: string | undefined;
    let total = 0;
    let chunkIndex = 1;
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
        total += json.data.syncedCount;
        cursor = json.data.nextCursor ?? undefined;
        chunkIndex += 1;
        if (cursor) {
          setSyncProgress((prev) => ({
            ...prev,
            [accountId]: `Đã quét ${total} tài nguyên (batch ${chunkIndex}…)`,
          }));
        }
      } while (cursor);

      setSyncProgress((prev) => ({ ...prev, [accountId]: `Đã đồng bộ ${total} tài nguyên` }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerAccounts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
    } catch {
      setSyncProgress((prev) => ({ ...prev, [accountId]: 'Đồng bộ thất bại' }));
    } finally {
      setSyncingAccounts((prev) => ({ ...prev, [accountId]: false }));
    }
  };

  const handleSyncAll = async () => {
    const accounts = accountsQuery.data ?? [];
    if (accounts.length === 0 || syncingAll) return;
    setSyncingAll(true);
    try {
      for (const acc of accounts) {
        await handleChunkedSync(acc.id);
      }
    } finally {
      setSyncingAll(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (input: { id: string; confirm: string }) => {
      const res = await apiClient.api.v1['provider-accounts'][':id'].$delete({
        param: { id: input.id },
        json: { confirm: input.confirm },
      });
      const body = await res.json();
      if (!res.ok) throw body;
      return body;
    },
    onSuccess: () => {
      setDeleteTarget(null);
      setConfirmLabel('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerAccounts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
    },
  });

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Provider Accounts</h1>
          <p className="text-sm text-zinc-400">
            Connect multiple Cloudflare, Vercel, and Supabase accounts. Tokens are encrypted with
            AES-256-GCM at rest.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSyncAll}
            disabled={syncingAll || (accountsQuery.data ?? []).length === 0}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
            {syncingAll ? 'Syncing All Accounts…' : 'Sync All Accounts'}
          </Button>
        </div>
      </div>

      <BentoGrid>
        <BentoCard
          title="Connect New Provider Account"
          subtitle={currentConfig.summary}
          size={BENTO_SIZE.FULL}
          icon={<Plus className="h-4 w-4" />}
        >
          <form onSubmit={handleAddSubmit} className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-4">
            <div>
              <label htmlFor="acc-provider" className="block text-xs font-medium text-zinc-400">
                Provider
              </label>
              <div className="mt-1">
                <Select
                  value={accountKind}
                  onValueChange={(val) => setAccountKind(val as AccountKindOption)}
                >
                  <SelectTrigger id="acc-provider">
                    <SelectValue placeholder="Chọn nhà cung cấp" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label htmlFor="acc-label" className="block text-xs font-medium text-zinc-400">
                Account Label
              </label>
              <input
                id="acc-label"
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={currentConfig.defaultLabelPlaceholder}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </div>

            <div>
              <label htmlFor="acc-token" className="block text-xs font-medium text-zinc-400">
                API Token / PAT
              </label>
              <input
                id="acc-token"
                type="password"
                required
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Paste provider API token"
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </div>

            <div className="flex items-end">
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full gap-2 font-semibold"
              >
                <KeyRound className="h-4 w-4" />
                {createMutation.isPending ? 'Verifying Token…' : 'Verify & Save Account'}
              </Button>
            </div>
          </form>

          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-xs text-zinc-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-violet-400">{currentConfig.label}:</span>
              <span className="text-zinc-300">{currentConfig.summary}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
              <div>
                <span className="text-zinc-500 font-medium">Yêu cầu quyền:</span>{' '}
                <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-zinc-300">
                  {currentConfig.scopeRequirement}
                </code>
              </div>
              <div className="text-zinc-500">Cách lấy: {currentConfig.guideSteps.join(' ➔ ')}</div>
            </div>
          </div>

          {formError ? (
            <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-300">
              {formError}
            </p>
          ) : null}
        </BentoCard>

        {(accountsQuery.data ?? []).map((acc) => {
          const isNeverSynced = !acc.lastSyncedAt;
          return (
            <BentoCard
              key={acc.id}
              title={acc.label}
              subtitle={`${PROVIDER_LABEL[acc.provider]} · Token ••••${acc.tokenLast4}${acc.accountType ? ` · ${acc.accountType.toUpperCase()}` : ''}`}
              size={BENTO_SIZE.MD}
              icon={<Cloud className="h-4 w-4" />}
              action={
                <div className="flex items-center gap-1.5">
                  {isNeverSynced ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 animate-pulse">
                      <AlertTriangle className="h-3 w-3" />
                      Chưa đồng bộ
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      acc.status === ACCOUNT_STATUS.ACTIVE
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    {acc.status}
                  </span>
                </div>
              }
            >
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <div>
                    External ID:{' '}
                    <span className="font-mono text-zinc-300">
                      {acc.externalAccountId ?? 'verified'}
                    </span>
                  </div>
                  {acc.lastSyncedAt ? (
                    <span className="text-[11px] text-zinc-500">
                      Đã sync:{' '}
                      {new Date(acc.lastSyncedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-400 font-medium">
                      Cần quét tài nguyên
                    </span>
                  )}
                </div>

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

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant={isNeverSynced ? 'default' : 'outline'}
                    size="sm"
                    disabled={Boolean(syncingAccounts[acc.id]) || syncingAll}
                    onClick={() => void handleChunkedSync(acc.id)}
                    className={
                      isNeverSynced
                        ? 'gap-1.5 bg-amber-500 text-zinc-950 hover:bg-amber-400 font-semibold shadow-md shadow-amber-500/20'
                        : 'gap-1.5'
                    }
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${syncingAccounts[acc.id] ? 'animate-spin' : ''}`}
                    />
                    {syncingAccounts[acc.id]
                      ? 'Đang đồng bộ…'
                      : isNeverSynced
                        ? 'Đồng bộ tài nguyên ngay'
                        : 'Sync Inventory'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setDeleteTarget(acc);
                      setConfirmLabel('');
                    }}
                    className="gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </BentoCard>
          );
        })}
      </BentoGrid>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h3 className="text-base font-semibold text-zinc-100">
              Delete Account "{deleteTarget.label}"?
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Type <span className="font-mono text-zinc-200">{deleteTarget.label}</span> to confirm
              deletion.
            </p>
            <input
              type="text"
              value={confirmLabel}
              onChange={(e) => setConfirmLabel(e.target.value)}
              placeholder={deleteTarget.label}
              className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={confirmLabel.trim() !== deleteTarget.label || deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate({ id: deleteTarget.id, confirm: confirmLabel })
                }
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
