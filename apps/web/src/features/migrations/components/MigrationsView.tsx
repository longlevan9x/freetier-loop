import {
  BENTO_SIZE,
  JOB_STATUS,
  type JobDto,
  MIGRATION_TEMPLATE,
  MIGRATION_TEMPLATE_LABEL,
  MIGRATION_TEMPLATE_VALUES,
  type MigrationTemplate,
  STEP_STATUS,
} from '@freetier-loop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { formatApiError } from '../../../lib/error-messages';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

export const MigrationsView = () => {
  const queryClient = useQueryClient();
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [template, setTemplate] = useState<MigrationTemplate>(
    MIGRATION_TEMPLATE.CF_REGISTRAR_DOMAIN_MOVE,
  );
  const [recommendationReason, setRecommendationReason] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
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

  const handleAutoRecommend = async () => {
    if (!resourceId || !sourceAccountId || !targetAccountId) return;
    const res = await apiClient.api.v1['migration-templates'].recommend.$post({
      json: { resourceId, sourceAccountId, targetAccountId },
    });
    if (res.ok) {
      const json = await res.json();
      setTemplate(json.data.strategy.recommendedTemplate);
      setRecommendationReason(json.data.strategy.reason);
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
          input: {},
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
          subtitle="StrategyResolver automatically recommends the safest template for your resource"
          size={BENTO_SIZE.FULL}
          icon={<ArrowRightLeft className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-4">
            <div>
              <label htmlFor="mig-source" className="block text-xs font-medium text-zinc-400">
                1. Source Account
              </label>
              <select
                id="mig-source"
                value={sourceAccountId}
                onChange={(e) => {
                  setSourceAccountId(e.target.value);
                  setResourceId('');
                }}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Select source account…</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label} ({acc.provider})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="mig-resource" className="block text-xs font-medium text-zinc-400">
                2. Resource to Migrate
              </label>
              <select
                id="mig-resource"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Select resource…</option>
                {resources.map((res) => (
                  <option key={res.id} value={res.id}>
                    {res.name} ({res.kind})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="mig-target" className="block text-xs font-medium text-zinc-400">
                3. Target Account
              </label>
              <select
                id="mig-target"
                value={targetAccountId}
                onChange={(e) => setTargetAccountId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Select target account…</option>
                {accounts
                  .filter((a) => a.id !== sourceAccountId)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.label} ({acc.provider})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="mig-template" className="block text-xs font-medium text-zinc-400">
                4. Migration Template
              </label>
              <select
                id="mig-template"
                value={template}
                onChange={(e) => setTemplate(e.target.value as MigrationTemplate)}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                {MIGRATION_TEMPLATE_VALUES.map((tpl) => (
                  <option key={tpl} value={tpl}>
                    {MIGRATION_TEMPLATE_LABEL[tpl]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void handleAutoRecommend()}
              disabled={!resourceId || !sourceAccountId || !targetAccountId}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-emerald-300 hover:border-emerald-500/60 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Auto-Select Recommended Strategy
            </button>

            <button
              type="button"
              disabled={
                !resourceId ||
                !sourceAccountId ||
                !targetAccountId ||
                createAndPlanMutation.isPending
              }
              onClick={() => createAndPlanMutation.mutate()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
              {createAndPlanMutation.isPending ? 'Generating Plan…' : 'Create & Dry-Run Plan'}
            </button>
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
        </BentoCard>

        {activeJob ? (
          <BentoCard
            title={`Step 3–4: Execution Timeline — ${activeJob.resourceName}`}
            subtitle={`${MIGRATION_TEMPLATE_LABEL[activeJob.template]} · Status: ${activeJob.status.toUpperCase()}`}
            size={BENTO_SIZE.XL}
            icon={<Terminal className="h-4 w-4" />}
            action={
              <button
                type="button"
                onClick={() => compensateMutation.mutate(activeJob.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-800/60 bg-amber-950/40 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-900/50"
              >
                <RotateCcw className="h-3 w-3" />
                Emergency Rollback
              </button>
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
                  <button
                    type="button"
                    disabled={
                      confirmText.trim() !== activeJob.resourceName ||
                      confirmAndRunMutation.isPending
                    }
                    onClick={() => confirmAndRunMutation.mutate(activeJob)}
                    className="rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 disabled:opacity-40"
                  >
                    {confirmAndRunMutation.isPending ? 'Running Steps…' : 'Confirm & Execute'}
                  </button>
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

                        <button
                          type="button"
                          disabled={manualStepMutation.isPending}
                          onClick={() =>
                            manualStepMutation.mutate({ jobId: activeJob.id, stepId: step.id })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirm Completed & Continue
                        </button>
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
