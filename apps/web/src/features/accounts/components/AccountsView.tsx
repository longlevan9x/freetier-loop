import {
  ACCOUNT_STATUS,
  BENTO_SIZE,
  PROVIDER,
  PROVIDER_LABEL,
  PROVIDER_VALUES,
  type Provider,
  type ProviderAccountDto,
  createProviderAccountSchema,
} from '@freetier-loop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Cloud, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
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

const TOKEN_SCOPE_GUIDE: Record<Provider, string> = {
  [PROVIDER.CLOUDFLARE]:
    'Required scopes: Zone:Edit, DNS:Edit, Account Settings:Read, Workers Scripts:Edit, Analytics:Read',
  [PROVIDER.VERCEL]:
    'Create a Full-Account Token at vercel.com/account/tokens (supports Hobby & Team accounts)',
  [PROVIDER.SUPABASE]:
    'Create a Personal Access Token (PAT) at supabase.com/dashboard/account/tokens',
};

export const AccountsView = () => {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<Provider>(PROVIDER.CLOUDFLARE);
  const [label, setLabel] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<ProviderAccountDto | null>(null);
  const [confirmLabel, setConfirmLabel] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);

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
      const parsed = createProviderAccountSchema.safeParse({ provider, label, apiToken });
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
    setSyncProgress((prev) => ({ ...prev, [accountId]: 'Syncing chunk 1…' }));
    let cursor: string | undefined;
    let total = 0;
    let chunkIndex = 1;
    try {
      do {
        const res = await apiClient.api.v1['provider-accounts'][':id'].sync.$post({
          param: { id: accountId },
          query: cursor ? { cursor } : {},
        });
        if (!res.ok) break;
        const json = await res.json();
        total += json.data.syncedCount;
        cursor = json.data.nextCursor ?? undefined;
        chunkIndex += 1;
        if (cursor) {
          setSyncProgress((prev) => ({
            ...prev,
            [accountId]: `Synced ${total} items (fetching chunk ${chunkIndex}…)`,
          }));
        }
      } while (cursor);

      setSyncProgress((prev) => ({ ...prev, [accountId]: `Synced ${total} resources` }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerAccounts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.resources.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
    } catch {
      setSyncProgress((prev) => ({ ...prev, [accountId]: 'Sync error' }));
    }
  };

  const handleSyncAll = async () => {
    const accounts = accountsQuery.data ?? [];
    if (accounts.length === 0 || syncingAll) return;
    setSyncingAll(true);
    for (const acc of accounts) {
      await handleChunkedSync(acc.id);
    }
    setSyncingAll(false);
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
          subtitle={TOKEN_SCOPE_GUIDE[provider]}
          size={BENTO_SIZE.FULL}
          icon={<Plus className="h-4 w-4" />}
        >
          <form onSubmit={handleAddSubmit} className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-4">
            <div>
              <label htmlFor="acc-provider" className="block text-xs font-medium text-zinc-400">
                Provider
              </label>
              <div className="mt-1">
                <Select value={provider} onValueChange={(val) => setProvider(val as Provider)}>
                  <SelectTrigger id="acc-provider">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_VALUES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PROVIDER_LABEL[p]}
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
                placeholder="e.g. CF Account #2 (Backup)"
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

          {formError ? (
            <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-300">
              {formError}
            </p>
          ) : null}
        </BentoCard>

        {(accountsQuery.data ?? []).map((acc) => (
          <BentoCard
            key={acc.id}
            title={acc.label}
            subtitle={`${PROVIDER_LABEL[acc.provider]} · Token ••••${acc.tokenLast4}${acc.accountType ? ` · ${acc.accountType.toUpperCase()}` : ''}`}
            size={BENTO_SIZE.MD}
            icon={<Cloud className="h-4 w-4" />}
            action={
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  acc.status === ACCOUNT_STATUS.ACTIVE
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}
              >
                {acc.status}
              </span>
            }
          >
            <div className="space-y-3 pt-1">
              <div className="text-xs text-zinc-400">
                External ID:{' '}
                <span className="font-mono text-zinc-300">
                  {acc.externalAccountId ?? 'verified'}
                </span>
              </div>

              {syncProgress[acc.id] ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {syncProgress[acc.id]}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleChunkedSync(acc.id)}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync Inventory
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
        ))}
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
