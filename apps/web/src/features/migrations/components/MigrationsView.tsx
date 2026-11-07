import {
  BENTO_SIZE,
  JOB_STATUS,
  type JobDto,
  MIGRATION_TEMPLATE,
  MIGRATION_TEMPLATE_LABEL,
  type MigrationTemplate,
  STEP_STATUS,
} from '@freetier-loop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRightLeft,
  BookmarkPlus,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  FileCode,
  GitBranch,
  Globe,
  Layers,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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

type TemplateCategory = 'all' | 'cloudflare' | 'vercel' | 'supabase' | 'cross' | 'presets';

export interface ModularAction {
  id: string;
  name: string;
  category: 'vercel' | 'cloudflare' | 'gitlab' | 'supabase';
  badge: string;
  description: string;
}

export interface CustomPreset {
  id: string;
  name: string;
  description: string;
  steps: string[];
}

export const MODULAR_ACTIONS: ModularAction[] = [
  {
    id: 'vercel.move-domains',
    name: 'Chuyển Custom Domain',
    category: 'vercel',
    badge: 'Domain Cutover',
    description: 'Gỡ custom domain khỏi project ở Account 1 và gắn vào project ở Account 2.',
  },
  {
    id: 'vercel.sync-rules',
    name: 'Đồng bộ Vercel Rules',
    category: 'vercel',
    badge: 'Rules & Routing',
    description: 'Sao chép toàn bộ rewrites, redirects, custom headers, cleanUrls sang Account 2.',
  },
  {
    id: 'gitlab.rewire-vars',
    name: 'Cập nhật GitLab CI/CD Variables',
    category: 'gitlab',
    badge: 'GitLab CI/CD',
    description:
      'Tự động đọc và ghi đè VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID trên GitLab repo.',
  },
  {
    id: 'vercel.create-project',
    name: 'Tạo mới Vercel Project',
    category: 'vercel',
    badge: 'Recreate',
    description: 'Tạo mới project trên Account 2 từ git repository của project cũ.',
  },
  {
    id: 'vercel.upsert-env',
    name: 'Sao chép Environment Variables',
    category: 'vercel',
    badge: 'Env Vars',
    description: 'Sao chép các biến môi trường cấu hình giữa 2 project Vercel.',
  },
  {
    id: 'vercel.trigger-deploy',
    name: 'Kích hoạt Deploy Vercel',
    category: 'vercel',
    badge: 'Deployment',
    description: 'Trigger deployment mới trên Vercel sau khi hoàn thành cutover.',
  },
  {
    id: 'dns.repoint-records',
    name: 'Cập nhật DNS Records',
    category: 'cloudflare',
    badge: 'DNS Routing',
    description: 'Repoint DNS A/CNAME records sang đích mới.',
  },
  {
    id: 'env.rewire-vars',
    name: 'Cập nhật cấu hình Backend',
    category: 'supabase',
    badge: 'Config',
    description: 'Cập nhật các chuỗi kết nối Database / API keys sang frontend apps.',
  },
];

const DEFAULT_TEMPLATE_STEPS: Partial<Record<MigrationTemplate, string[]>> = {
  [MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER]: [
    'vercel.move-domains',
    'vercel.sync-rules',
    'gitlab.rewire-vars',
  ],
  [MIGRATION_TEMPLATE.VERCEL_DOMAIN_MOVE]: ['vercel.move-domains'],
  [MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE]: [
    'vercel.create-project',
    'vercel.upsert-env',
    'vercel.trigger-deploy',
    'vercel.move-domains',
  ],
  [MIGRATION_TEMPLATE.DNS_REPOINT]: ['dns.repoint-records'],
  [MIGRATION_TEMPLATE.ENV_REWIRE]: ['env.rewire-vars'],
};

interface TemplateCardItem {
  id: MigrationTemplate;
  name: string;
  category: TemplateCategory;
  providerLabel: string;
  badge: string;
  description: string;
  icon: typeof Cloud;
}

const TEMPLATE_ITEMS: TemplateCardItem[] = [
  {
    id: MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE,
    name: 'Move Cloudflare Registrar Domain',
    category: 'cloudflare',
    providerLabel: 'Cloudflare',
    badge: 'Registrar',
    description: 'Transfer domain registration between Cloudflare accounts.',
    icon: Globe,
  },
  {
    id: MIGRATION_TEMPLATE.CF_ZONE_MOVE,
    name: 'Move Cloudflare Zone (Zero Downtime)',
    category: 'cloudflare',
    providerLabel: 'Cloudflare',
    badge: 'DNS Zone',
    description: 'Clone DNS records and transfer zone with dual-zone zero downtime.',
    icon: Cloud,
  },
  {
    id: MIGRATION_TEMPLATE.CF_WORKER_MOVE,
    name: 'Move Cloudflare Worker',
    category: 'cloudflare',
    providerLabel: 'Cloudflare',
    badge: 'Worker Script',
    description: 'Export script, bindings, env vars and redeploy to target account.',
    icon: Cpu,
  },
  {
    id: MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE,
    name: 'Recreate Vercel Project',
    category: 'vercel',
    providerLabel: 'Vercel',
    badge: 'Hobby / Cross-Account',
    description: 'Clone project config, Git links, and env vars to target account.',
    icon: Zap,
  },
  {
    id: MIGRATION_TEMPLATE.VERCEL_PROJECT_TRANSFER,
    name: 'Transfer Vercel Project',
    category: 'vercel',
    providerLabel: 'Vercel',
    badge: 'Team Transfer',
    description: 'Initiate official Vercel team transfer request for projects.',
    icon: Layers,
  },
  {
    id: MIGRATION_TEMPLATE.VERCEL_DOMAIN_MOVE,
    name: 'Move Vercel Custom Domain',
    category: 'vercel',
    providerLabel: 'Vercel',
    badge: 'Custom Domain',
    description: 'Detach custom domain from source project and re-attach on target.',
    icon: Globe,
  },
  {
    id: MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER,
    name: 'Vercel + GitLab Full Cutover',
    category: 'vercel',
    providerLabel: 'Vercel + GitLab',
    badge: '3-in-1 Action',
    description:
      'Moves custom domain, syncs Vercel rules (rewrites/redirects/headers), and rewires GitLab CI/CD variables in 1 action.',
    icon: GitBranch,
  },
  {
    id: MIGRATION_TEMPLATE.SUPABASE_PROJECT_RECREATE,
    name: 'Recreate Supabase Project',
    category: 'supabase',
    providerLabel: 'Supabase',
    badge: 'Database / Edge',
    description: 'Recreate PostgreSQL schema, extensions, and functions on new project.',
    icon: Database,
  },
  {
    id: MIGRATION_TEMPLATE.SUPABASE_ORG_TRANSFER,
    name: 'Transfer Supabase Org',
    category: 'supabase',
    providerLabel: 'Supabase',
    badge: 'Org Transfer',
    description: 'Directly transfer Supabase project to another organization.',
    icon: Database,
  },
  {
    id: MIGRATION_TEMPLATE.DNS_REPOINT,
    name: 'Repoint DNS Records',
    category: 'cross',
    providerLabel: 'Cross-Provider',
    badge: 'DNS Routing',
    description: 'Batch update CNAME / A records to switch traffic to target project.',
    icon: ArrowRightLeft,
  },
  {
    id: MIGRATION_TEMPLATE.ENV_REWIRE,
    name: 'Rewire Environment Variables',
    category: 'cross',
    providerLabel: 'Cross-Provider',
    badge: 'Config & Secrets',
    description: 'Sync and update environment variables and database URLs across apps.',
    icon: FileCode,
  },
];

const CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: 'all', label: 'All Templates' },
  { id: 'cloudflare', label: 'Cloudflare' },
  { id: 'vercel', label: 'Vercel' },
  { id: 'supabase', label: 'Supabase' },
  { id: 'cross', label: 'Cross-Provider' },
];

export const MigrationsView = () => {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory>('all');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [template, setTemplate] = useState<MigrationTemplate>(
    MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE,
  );
  const [selectedCustomSteps, setSelectedCustomSteps] = useState<string[]>(
    () => DEFAULT_TEMPLATE_STEPS[MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE] ?? [],
  );
  const [isCustomStepsOpen, setIsCustomStepsOpen] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [savedPresets, setSavedPresets] = useState<CustomPreset[]>(() => {
    try {
      const raw = localStorage.getItem('freetier_custom_migration_presets');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [recommendationReason, setRecommendationReason] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [gitlabAccountId, setGitlabAccountId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [wizardError, setWizardError] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: queryKeys.providerAccounts.all,
    queryFn: async () => {
      const res = await apiClient.api.v1['provider-accounts'].$get();
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
  });

  const resourcesQuery = useQuery({
    queryKey: queryKeys.resources.list({ accountId: sourceAccountId }),
    enabled: Boolean(sourceAccountId),
    queryFn: async () => {
      const res = await apiClient.api.v1.resources.$get({
        query: { accountId: sourceAccountId, limit: '100' },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
  });

  const jobsQuery = useQuery({
    queryKey: queryKeys.jobs.all,
    queryFn: async () => {
      const res = await apiClient.api.v1.jobs.$get();
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
  });

  const activeJobQuery = useQuery({
    queryKey: queryKeys.jobs.detail(selectedJobId ?? 'none'),
    enabled: Boolean(selectedJobId),
    queryFn: async () => {
      if (!selectedJobId) return null;
      const res = await apiClient.api.v1.jobs[':id'].$get({
        param: { id: selectedJobId },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
  });

  const eventsQuery = useQuery({
    queryKey: queryKeys.jobs.events(selectedJobId ?? 'none'),
    enabled: Boolean(selectedJobId),
    queryFn: async () => {
      if (!selectedJobId) return [];
      const res = await apiClient.api.v1.jobs[':id'].events.$get({
        param: { id: selectedJobId },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
  });

  const handleSelectTemplate = (newTemplate: MigrationTemplate) => {
    setTemplate(newTemplate);
    const defaultSteps = DEFAULT_TEMPLATE_STEPS[newTemplate];
    if (defaultSteps) {
      setSelectedCustomSteps(defaultSteps);
    }
    const selectedConfig = TEMPLATE_ITEMS.find((item) => item.id === newTemplate);
    if (selectedConfig && selectedConfig.category !== 'cross') {
      const currentSource = accounts.find((a) => a.id === sourceAccountId);
      if (currentSource && currentSource.provider !== selectedConfig.category) {
        setSourceAccountId('');
        setResourceId('');
      }
      const currentTarget = accounts.find((a) => a.id === targetAccountId);
      if (currentTarget && currentTarget.provider !== selectedConfig.category) {
        setTargetAccountId('');
      }
    }
  };

  const toggleCustomStep = (stepId: string) => {
    setSelectedCustomSteps((prev) =>
      prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId],
    );
  };

  const handleSavePreset = () => {
    if (!presetNameInput.trim() || selectedCustomSteps.length === 0) return;
    const newPreset: CustomPreset = {
      id: `preset_${Date.now()}`,
      name: presetNameInput.trim(),
      description: `${selectedCustomSteps.length} modular actions`,
      steps: [...selectedCustomSteps],
    };
    const next = [...savedPresets, newPreset];
    setSavedPresets(next);
    try {
      localStorage.setItem('freetier_custom_migration_presets', JSON.stringify(next));
    } catch {
      // ignore
    }
    setPresetNameInput('');
  };

  const handleDeletePreset = (id: string) => {
    const next = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(next);
    try {
      localStorage.setItem('freetier_custom_migration_presets', JSON.stringify(next));
    } catch {
      // ignore
    }
    if (next.length === 0 && categoryFilter === 'presets') {
      setCategoryFilter('all');
    }
  };

  const handleSelectPreset = (preset: CustomPreset) => {
    setSelectedCustomSteps(preset.steps);
    setTemplate(MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER);
  };

  const handleAutoRecommend = async () => {
    if (!resourceId || !sourceAccountId || !targetAccountId) return;
    const res = await apiClient.api.v1['migration-templates'].recommend.$post({
      json: { resourceId, sourceAccountId, targetAccountId },
    });
    if (res.ok) {
      const json = await res.json();
      const recommended = json.data.strategy.recommendedTemplate;
      setTemplate(recommended);
      const defaultSteps = DEFAULT_TEMPLATE_STEPS[recommended];
      if (defaultSteps) {
        setSelectedCustomSteps(defaultSteps);
      }
      setRecommendationReason(json.data.strategy.reason);
      const conf = TEMPLATE_ITEMS.find((t) => t.id === recommended);
      if (conf && categoryFilter !== 'all' && categoryFilter !== conf.category) {
        setCategoryFilter('all');
      }
    }
  };

  const createAndPlanMutation = useMutation({
    mutationFn: async () => {
      const createRes = await apiClient.api.v1.jobs.$post({
        json: {
          template,
          sourceAccountId,
          targetAccountId,
          resourceId,
          input: {
            customStepTypes: selectedCustomSteps,
            ...(gitlabAccountId ? { gitlabAccountId } : {}),
          },
        },
      });
      const createBody = await createRes.json();
      if (!createRes.ok) throw createBody;
      const jobId = createBody.data.id;

      const planRes = await apiClient.api.v1.jobs[':id'].plan.$post({
        param: { id: jobId },
      });
      const planBody = await planRes.json();
      if (!planRes.ok) throw planBody;
      return planBody.data;
    },
    onSuccess: (job) => {
      setWizardError(null);
      setSelectedJobId(job.id);
      setConfirmText('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
    onError: (err) => {
      setWizardError(formatApiError(err, 'Failed to create migration plan'));
    },
  });

  const confirmAndRunMutation = useMutation({
    mutationFn: async (job: JobDto) => {
      const confirmRes = await apiClient.api.v1.jobs[':id'].confirm.$post({
        param: { id: job.id },
        json: { confirm: confirmText },
      });
      const confirmBody = await confirmRes.json();
      if (!confirmRes.ok) throw confirmBody;

      let state = confirmBody.data;
      let guard = 0;
      while (state.status === JOB_STATUS.RUNNING && guard < 15) {
        guard += 1;
        const advRes = await apiClient.api.v1.jobs[':id'].advance.$post({
          param: { id: job.id },
        });
        if (!advRes.ok) break;
        const advBody = await advRes.json();
        state = advBody.data;
      }
      return state;
    },
    onSuccess: (job) => {
      setWizardError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(job.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.events(job.id) });
    },
    onError: (err) => {
      setWizardError(formatApiError(err, 'Failed to confirm/execute job'));
    },
  });

  const manualStepMutation = useMutation({
    mutationFn: async (input: { jobId: string; stepId: string }) => {
      const res = await apiClient.api.v1.jobs[':id'].steps[':stepId']['manual-input'].$post({
        param: { id: input.jobId, stepId: input.stepId },
        json: { acknowledged: true, values: secretValues },
      });
      const body = await res.json();
      if (!res.ok) throw body;

      let state = body.data;
      let guard = 0;
      while (state.status === JOB_STATUS.RUNNING && guard < 15) {
        guard += 1;
        const advRes = await apiClient.api.v1.jobs[':id'].advance.$post({
          param: { id: input.jobId },
        });
        if (!advRes.ok) break;
        const advBody = await advRes.json();
        state = advBody.data;
      }
      return state;
    },
    onSuccess: (job) => {
      setSecretValues({});
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(job.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.events(job.id) });
    },
  });

  const compensateMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiClient.api.v1.jobs[':id'].compensate.$post({
        param: { id: jobId },
      });
      return res.json();
    },
    onSuccess: (_, jobId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.events(jobId) });
    },
  });

  const accounts = accountsQuery.data ?? [];
  const resources = (resourcesQuery.data ?? []).filter((r) => !r.parentId);
  const activeJob = activeJobQuery.data ?? (jobsQuery.data ?? [])[0] ?? null;

  const gitlabAccounts = accounts.filter((a) => a.provider === 'gitlab');

  useEffect(() => {
    if (!gitlabAccountId && gitlabAccounts[0]?.id) {
      setGitlabAccountId(gitlabAccounts[0].id);
    }
  }, [gitlabAccounts, gitlabAccountId]);

  const currentTemplateConfig = TEMPLATE_ITEMS.find((item) => item.id === template);
  const allowedProvider =
    currentTemplateConfig && currentTemplateConfig.category !== 'cross'
      ? currentTemplateConfig.category
      : null;

  const sourceAccounts = allowedProvider
    ? accounts.filter((a) => a.provider === allowedProvider)
    : accounts;

  const targetAccounts = allowedProvider
    ? accounts.filter((a) => a.provider === allowedProvider && a.id !== sourceAccountId)
    : accounts.filter((a) => a.id !== sourceAccountId);

  const filteredTemplates =
    categoryFilter === 'all'
      ? TEMPLATE_ITEMS
      : TEMPLATE_ITEMS.filter((item) => item.category === categoryFilter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Migration Wizard & Job Timeline</h1>
        <p className="text-sm text-zinc-400">
          Plan, dry-run, confirm, and execute Blue-Green resource transfers with automatic snapshots
          and rollback.
        </p>
      </div>

      <BentoGrid>
        <BentoCard
          title="Step 1–2: Configure Migration & Generate Dry-Run Plan"
          subtitle="Choose a migration template, assign source/target accounts, and dry-run with snapshot safety"
          size={BENTO_SIZE.FULL}
          icon={<ArrowRightLeft className="h-4 w-4" />}
        >
          {/* Step 1: Migration Template Cards */}
          <div>
            <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    1
                  </span>
                  Select Migration Template
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Choose a pre-configured migration scenario for your cloud infrastructure
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {CATEGORIES.map((cat) => {
                  const count =
                    cat.id === 'all'
                      ? TEMPLATE_ITEMS.length
                      : TEMPLATE_ITEMS.filter((i) => i.category === cat.id).length;
                  const isActive = categoryFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-zinc-700 text-white shadow-sm'
                          : 'bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      {cat.label} <span className="text-[10px] opacity-60">({count})</span>
                    </button>
                  );
                })}
                {savedPresets.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('presets')}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      categoryFilter === 'presets'
                        ? 'bg-amber-900/60 text-amber-200 shadow-sm border border-amber-700/60'
                        : 'bg-zinc-900/80 text-amber-400/80 hover:bg-zinc-800 hover:text-amber-300'
                    }`}
                  >
                    My Presets{' '}
                    <span className="text-[10px] opacity-80">({savedPresets.length})</span>
                  </button>
                ) : null}
              </div>
            </div>

            {categoryFilter === 'presets' ? (
              /* Custom Presets Grid */
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {savedPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex flex-col justify-between rounded-xl border border-amber-900/40 bg-amber-950/20 p-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-md border border-amber-800/60 bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-mono text-amber-300">
                          Preset ({preset.steps.length} steps)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(preset.id)}
                          className="cursor-pointer text-zinc-500 hover:text-red-400 transition-colors"
                          title="Xóa preset này"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <h4 className="mt-2 text-xs font-semibold text-amber-200">{preset.name}</h4>
                      <p className="mt-1 text-[11px] text-zinc-400">{preset.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {preset.steps.map((st) => (
                          <span
                            key={st}
                            className="rounded bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-400"
                          >
                            {MODULAR_ACTIONS.find((a) => a.id === st)?.badge ?? st}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className="mt-3 cursor-pointer rounded-lg bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/30 text-center transition-colors"
                    >
                      Áp dụng Preset này
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              /* Template Cards Grid */
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {filteredTemplates.map((item) => {
                  const isSelected = template === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectTemplate(item.id)}
                      className={`group relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-500/80 bg-emerald-950/20 ring-1 ring-emerald-500/50 shadow-sm shadow-emerald-950/40'
                          : 'border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className={`rounded-lg p-1.5 ${
                              isSelected
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-zinc-800/80 text-zinc-400 group-hover:text-zinc-200'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          {isSelected ? (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Selected
                            </span>
                          ) : (
                            <span className="rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                              {item.badge}
                            </span>
                          )}
                        </div>

                        <h4
                          className={`mt-2 text-xs font-semibold leading-snug ${
                            isSelected
                              ? 'text-emerald-200'
                              : 'text-zinc-200 group-hover:text-zinc-100'
                          }`}
                        >
                          {item.name}
                        </h4>

                        <p className="mt-1 line-clamp-2 text-[11px] text-zinc-400">
                          {item.description}
                        </p>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-[10px] text-zinc-500">
                        <span>{item.providerLabel}</span>
                        {isSelected ? (
                          <span className="font-mono text-emerald-400">Active</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Action Pipeline Builder / Custom Steps */}
            <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
                  <h4 className="text-xs font-semibold text-zinc-200">
                    Tùy biến các bước hành động (Action Pipeline)
                  </h4>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    {selectedCustomSteps.length} bước được chọn
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomStepsOpen((prev) => !prev)}
                  className="cursor-pointer text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  {isCustomStepsOpen ? 'Thu gọn ▲' : 'Tùy biến các bước ▼'}
                </button>
              </div>

              {isCustomStepsOpen ? (
                <div className="mt-3.5 space-y-3 border-t border-zinc-800/60 pt-3">
                  <p className="text-xs text-zinc-400">
                    Chọn các bước hành động liên tiếp cần thực hiện. Hệ thống luôn tự động chèn 2
                    bước bảo vệ{' '}
                    <code className="font-mono text-emerald-400">preflight.verify-accounts</code> và{' '}
                    <code className="font-mono text-emerald-400">snapshot.resource</code> ở đầu để
                    sẵn sàng rollback nếu gặp lỗi.
                  </p>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {MODULAR_ACTIONS.map((action) => {
                      const isChecked = selectedCustomSteps.includes(action.id);
                      return (
                        <label
                          key={action.id}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                            isChecked
                              ? 'border-emerald-500/60 bg-emerald-950/20'
                              : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCustomStep(action.id)}
                            className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-medium text-zinc-200 truncate">
                                {action.name}
                              </span>
                              <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400 shrink-0">
                                {action.badge}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-400">
                              {action.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* Save as Preset form */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800/60 bg-zinc-950/60 p-2.5">
                    <BookmarkPlus className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-medium text-zinc-300">
                      Lưu thành Preset mẫu riêng:
                    </span>
                    <input
                      type="text"
                      value={presetNameInput}
                      onChange={(e) => setPresetNameInput(e.target.value)}
                      placeholder="Tên Preset (vd: Vercel Domain + Rules + GitLab)..."
                      className="flex-1 min-w-[200px] rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleSavePreset}
                      disabled={!presetNameInput.trim() || selectedCustomSteps.length === 0}
                      className="h-7 text-xs text-amber-300 border-amber-800/60 hover:bg-amber-950/30 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Lưu Preset
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {selectedCustomSteps.map((stepId) => {
                    const act = MODULAR_ACTIONS.find((a) => a.id === stepId);
                    return (
                      <span
                        key={stepId}
                        className="inline-flex items-center gap-1 rounded-md bg-zinc-800/90 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        {act ? act.name : stepId}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Source, Resource, Target Account */}
          <div className="mt-5 border-t border-zinc-800/80 pt-4">
            <div className="pb-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                  2
                </span>
                Select Accounts & Resource
              </h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                Specify source, target, and the resource to migrate under the chosen template
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label htmlFor="mig-source" className="block text-xs font-medium text-zinc-400">
                  Source Account{' '}
                  {allowedProvider ? `(${currentTemplateConfig?.providerLabel})` : ''}
                </label>
                <div className="mt-1">
                  <Select
                    value={sourceAccountId}
                    onValueChange={(val) => {
                      setSourceAccountId(val);
                      setResourceId('');
                    }}
                  >
                    <SelectTrigger id="mig-source">
                      <SelectValue placeholder="Select source account…" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.label} ({acc.provider})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label htmlFor="mig-resource" className="block text-xs font-medium text-zinc-400">
                  Resource to Migrate
                </label>
                <div className="mt-1">
                  <Select value={resourceId} onValueChange={(val) => setResourceId(val)}>
                    <SelectTrigger id="mig-resource">
                      <SelectValue
                        placeholder={
                          sourceAccountId ? 'Select resource…' : 'Select source account first'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {resources.map((res) => (
                        <SelectItem key={res.id} value={res.id}>
                          {res.name} ({res.kind})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label htmlFor="mig-target" className="block text-xs font-medium text-zinc-400">
                  Target Account{' '}
                  {allowedProvider ? `(${currentTemplateConfig?.providerLabel})` : ''}
                </label>
                <div className="mt-1">
                  <Select value={targetAccountId} onValueChange={(val) => setTargetAccountId(val)}>
                    <SelectTrigger id="mig-target">
                      <SelectValue placeholder="Select target account…" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.label} ({acc.provider})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {selectedCustomSteps.includes('gitlab.rewire-vars') ||
            template === MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER ? (
              <div className="mt-4 space-y-3 rounded-xl border border-violet-800/40 bg-violet-950/20 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-violet-300">
                  <GitBranch className="h-4 w-4" />
                  GitLab Project Access Token (Tự động liên kết Repository)
                </div>
                <p className="text-xs text-zinc-300">
                  Token GitLab dạng Project Access Token đã được gắn trực tiếp vào dự án. Hệ thống
                  sẽ tự động phát hiện project ID và cập nhật các biến CI/CD{' '}
                  <code className="font-mono text-violet-300">VERCEL_TOKEN</code>,{' '}
                  <code className="font-mono text-violet-300">VERCEL_ORG_ID</code>, và{' '}
                  <code className="font-mono text-violet-300">VERCEL_PROJECT_ID</code> trỏ về tài
                  khoản đích.
                </p>

                {gitlabAccounts.length > 1 ? (
                  <div className="max-w-xs">
                    <label
                      htmlFor="mig-gitlab-account"
                      className="block text-xs font-medium text-zinc-400"
                    >
                      Tài khoản GitLab sử dụng
                    </label>
                    <div className="mt-1">
                      <Select
                        value={gitlabAccountId}
                        onValueChange={(val) => setGitlabAccountId(val)}
                      >
                        <SelectTrigger id="mig-gitlab-account">
                          <SelectValue placeholder="Chọn tài khoản GitLab..." />
                        </SelectTrigger>
                        <SelectContent>
                          {gitlabAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.label} ({acc.provider})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleAutoRecommend()}
                disabled={!resourceId || !sourceAccountId || !targetAccountId}
                className="gap-1.5 text-emerald-300 cursor-pointer disabled:cursor-not-allowed"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Auto-Select Recommended Strategy
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={
                  !resourceId ||
                  !sourceAccountId ||
                  !targetAccountId ||
                  selectedCustomSteps.length === 0 ||
                  createAndPlanMutation.isPending
                }
                onClick={() => createAndPlanMutation.mutate()}
                className="gap-1.5 font-semibold text-zinc-950 cursor-pointer disabled:cursor-not-allowed"
              >
                <Play className="h-3.5 w-3.5" />
                {createAndPlanMutation.isPending ? 'Generating Plan…' : 'Create & Dry-Run Plan'}
              </Button>
            </div>

            {recommendationReason ? (
              <div className="mt-3 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-2.5 text-xs text-emerald-300">
                <strong>StrategyResolver:</strong> {recommendationReason}
              </div>
            ) : null}

            {wizardError ? (
              <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-300">
                {wizardError}
              </div>
            ) : null}
          </div>
        </BentoCard>

        {activeJob ? (
          <BentoCard
            title={`Step 3–4: Execution Timeline — ${activeJob.resourceName}`}
            subtitle={`${MIGRATION_TEMPLATE_LABEL[activeJob.template]} · Status: ${activeJob.status.toUpperCase()}`}
            size={BENTO_SIZE.XL}
            icon={<Terminal className="h-4 w-4" />}
            action={
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => compensateMutation.mutate(activeJob.id)}
                className="gap-1 text-xs"
              >
                <RotateCcw className="h-3 w-3" />
                Emergency Rollback
              </Button>
            }
          >
            {activeJob.status === JOB_STATUS.DRAFT || activeJob.status === JOB_STATUS.PLANNED ? (
              <div className="mb-4 rounded-xl border border-amber-800/60 bg-amber-950/30 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  Typed Resource Confirmation Required
                </div>
                <p className="mt-1 text-xs text-zinc-300">
                  Type{' '}
                  <span className="font-mono font-bold text-white">{activeJob.resourceName}</span>{' '}
                  to confirm and start step-by-step execution:
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={activeJob.resourceName}
                    className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      confirmText.trim() !== activeJob.resourceName ||
                      confirmAndRunMutation.isPending
                    }
                    onClick={() => confirmAndRunMutation.mutate(activeJob)}
                    className="font-semibold text-zinc-950"
                  >
                    {confirmAndRunMutation.isPending ? 'Running Steps…' : 'Confirm & Execute'}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2.5">
              {(activeJob.steps ?? []).map((step) => {
                const isWaiting = step.status === STEP_STATUS.WAITING_MANUAL;
                const instructions = (step.result?.instructions as string[] | undefined) ?? [];
                const command = step.result?.command as string | undefined;
                const requiredSecrets =
                  (step.result?.requiredSecrets as string[] | undefined) ?? [];

                return (
                  <div
                    key={step.id}
                    className="rounded-xl border border-zinc-800/90 bg-zinc-950/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                        <span className="font-mono text-zinc-500">#{step.position + 1}</span>
                        <span>{step.title}</span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${
                          step.status === STEP_STATUS.SUCCEEDED
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : step.status === STEP_STATUS.WAITING_MANUAL
                              ? 'bg-amber-500/20 text-amber-300'
                              : step.status === STEP_STATUS.FAILED
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>

                    {step.errorMessage ? (
                      <p className="mt-1.5 text-xs text-red-400">{step.errorMessage}</p>
                    ) : null}

                    {isWaiting ? (
                      <div className="mt-3 space-y-2.5 rounded-lg border border-amber-800/50 bg-amber-950/20 p-3">
                        {instructions.map((line) => (
                          <p key={line} className="text-xs text-zinc-200">
                            {line}
                          </p>
                        ))}

                        {command ? (
                          <pre className="overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-[11px] text-emerald-300">
                            {command}
                          </pre>
                        ) : null}

                        {requiredSecrets.map((secKey) => (
                          <div key={secKey}>
                            <label
                              htmlFor={`secret-${step.id}-${secKey}`}
                              className="block font-mono text-[11px] text-zinc-300"
                            >
                              {secKey}
                            </label>
                            <input
                              id={`secret-${step.id}-${secKey}`}
                              type="password"
                              value={secretValues[secKey] ?? ''}
                              onChange={(e) =>
                                setSecretValues((prev) => ({
                                  ...prev,
                                  [secKey]: e.target.value,
                                }))
                              }
                              placeholder={`Enter value for ${secKey}`}
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100"
                            />
                          </div>
                        ))}

                        <Button
                          type="button"
                          size="sm"
                          disabled={manualStepMutation.isPending}
                          onClick={() =>
                            manualStepMutation.mutate({ jobId: activeJob.id, stepId: step.id })
                          }
                          className="gap-1.5 font-semibold text-zinc-950"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirm Completed & Continue
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </BentoCard>
        ) : null}

        <BentoCard
          title="Job Event Log & History"
          subtitle="Select a job or inspect realtime step logs"
          size={BENTO_SIZE.MD}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              {(jobsQuery.data ?? []).slice(0, 5).map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setSelectedJobId(j.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                    activeJob?.id === j.id
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-zinc-950/60 text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  <span className="truncate font-medium">{j.resourceName}</span>
                  <span className="font-mono text-[11px]">{j.status}</span>
                </button>
              ))}
            </div>

            {eventsQuery.data && eventsQuery.data.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px]">
                {eventsQuery.data.map((ev) => (
                  <div key={ev.id} className="text-zinc-300">
                    <span className="text-zinc-500">[{ev.level}]</span> {ev.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
  );
};
