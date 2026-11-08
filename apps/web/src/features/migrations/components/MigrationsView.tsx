import {
  BENTO_SIZE,
  JOB_STATUS,
  type JobDto,
  MIGRATION_TEMPLATE,
  type MigrationTemplate,
} from '@freetier-loop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { formatApiError } from '../../../lib/error-messages';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';
import {
  PREBUILT_TEMPLATES,
  type PipelineStepItem,
  type PrebuiltTemplate,
  type SavedMigration,
  createStepItem,
} from '../model/types';
import { ExecutionTimelineCard } from './ExecutionTimeline/ExecutionTimelineCard';
import { JobEventLogCard } from './ExecutionTimeline/JobEventLogCard';
import { type MigrationTabId, MigrationTabs } from './MigrationTabs';
import { MigrationAccountsForm } from './PipelineBuilder/MigrationAccountsForm';
import { MigrationActionBar } from './PipelineBuilder/MigrationActionBar';
import { PipelineStepsList } from './PipelineBuilder/PipelineStepsList';
import { PrebuiltTemplatesList } from './PipelineBuilder/PrebuiltTemplatesList';
import { SavedMigrationsCard } from './SavedMigrations/SavedMigrationsCard';

export const MigrationsView = () => {
  const queryClient = useQueryClient();

  // Active Tab
  const [activeTab, setActiveTab] = useState<MigrationTabId>('builder');

  // Modular Pipeline State
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStepItem[]>([
    createStepItem('gitlab.rewire-vars'),
    createStepItem('gitlab.trigger-pipeline'),
    createStepItem('vercel.sync-rules'),
    createStepItem('vercel.move-domains'),
  ]);

  // Form selections
  const [template, setTemplate] = useState<MigrationTemplate>(
    MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER,
  );
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [gitlabAccountId, setGitlabAccountId] = useState('');
  const [migrationName, setMigrationName] = useState(
    'Cập nhật Token ➔ Deploy GitLab ➔ Transfer Vercel',
  );

  // Saved Migrations in LocalStorage
  const [savedMigrations, setSavedMigrations] = useState<SavedMigration[]>(() => {
    try {
      const raw = localStorage.getItem('freetier_saved_migrations');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // UI status / feedback
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [recommendationReason, setRecommendationReason] = useState<string | null>(null);

  // Queries
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
    queryKey: queryKeys.resources.all,
    queryFn: async () => {
      const res = await apiClient.api.v1.resources.$get({ query: {} });
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
    refetchInterval: 3000,
  });

  const activeJobId = selectedJobId ?? jobsQuery.data?.[0]?.id ?? '';

  const activeJobQuery = useQuery({
    queryKey: queryKeys.jobs.detail(activeJobId),
    queryFn: async () => {
      if (!activeJobId) return null;
      const res = await apiClient.api.v1.jobs[':id'].$get({
        param: { id: activeJobId },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
    enabled: Boolean(activeJobId),
    refetchInterval: 2000,
  });

  const eventsQuery = useQuery({
    queryKey: queryKeys.jobs.events(activeJobId),
    queryFn: async () => {
      if (!activeJobId) return [];
      const res = await apiClient.api.v1.jobs[':id'].events.$get({
        param: { id: activeJobId },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
    enabled: Boolean(activeJobId),
  });

  const accounts = accountsQuery.data ?? [];
  const resources = (resourcesQuery.data ?? [])
    .filter((r) => !r.parentId)
    .map((r) => ({
      id: r.id,
      providerAccountId: r.providerAccountId,
      name: r.name,
      kind: r.kind,
    }));
  const activeJob = activeJobQuery.data ?? (jobsQuery.data ?? [])[0] ?? null;
  const gitlabAccounts = accounts.filter((a) => a.provider === 'gitlab');

  useEffect(() => {
    if (!gitlabAccountId && gitlabAccounts[0]?.id) {
      setGitlabAccountId(gitlabAccounts[0].id);
    }
  }, [gitlabAccounts, gitlabAccountId]);

  // Pre-built template selection
  const handleSelectPrebuiltTemplate = (tpl: PrebuiltTemplate) => {
    setTemplate(tpl.id);
    setPipelineSteps(tpl.defaultSteps.map(createStepItem));
    setMigrationName(tpl.name);
    setSourceAccountId('');
    setTargetAccountId('');
    setResourceId('');
  };

  // Step operations
  const handleAddStep = (actionId: string) => {
    setPipelineSteps((prev) => [...prev, createStepItem(actionId)]);
  };

  const handleRemoveStep = (index: number) => {
    setPipelineSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveStep = (index: number, direction: -1 | 1) => {
    setPipelineSteps((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const current = next[index];
      const target = next[targetIndex];
      if (current === undefined || target === undefined) return prev;
      next[index] = target;
      next[targetIndex] = current;
      return next;
    });
  };

  const handleChangeStepAction = (index: number, newActionId: string) => {
    setPipelineSteps((prev) => {
      const next = [...prev];
      const current = next[index];
      if (current) {
        next[index] = { ...current, actionId: newActionId };
      }
      return next;
    });
  };

  // Save / Load Migrations
  const handleSaveMigration = () => {
    const nameToSave = migrationName.trim() || `Migration (${pipelineSteps.length} bước)`;
    const newSaved: SavedMigration = {
      id: `mig_${Date.now()}`,
      name: nameToSave,
      template,
      sourceAccountId,
      targetAccountId,
      resourceId,
      ...(gitlabAccountId ? { gitlabAccountId } : {}),
      steps: pipelineSteps.map((s) => s.actionId),
      createdAt: Date.now(),
    };
    const updated = [newSaved, ...savedMigrations.filter((m) => m.name !== nameToSave)];
    setSavedMigrations(updated);
    try {
      localStorage.setItem('freetier_saved_migrations', JSON.stringify(updated));
    } catch {
      // ignore
    }
    setSaveSuccessMessage(
      `Đã lưu "${nameToSave}" thành công! Lần sau bạn có thể mở trong tab "Migration đã lưu".`,
    );
    setTimeout(() => setSaveSuccessMessage(null), 4000);
  };

  const handleDeleteSavedMigration = (id: string) => {
    const updated = savedMigrations.filter((m) => m.id !== id);
    setSavedMigrations(updated);
    try {
      localStorage.setItem('freetier_saved_migrations', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleLoadSavedMigration = (item: SavedMigration) => {
    setTemplate(item.template);
    setSourceAccountId(item.sourceAccountId);
    setTargetAccountId(item.targetAccountId);
    setResourceId(item.resourceId);
    if (item.gitlabAccountId) {
      setGitlabAccountId(item.gitlabAccountId);
    }
    setPipelineSteps(item.steps.map(createStepItem));
    setMigrationName(item.name);
    setActiveTab('builder');
  };

  // Auto recommend strategy
  const handleAutoRecommend = async () => {
    if (!resourceId || !sourceAccountId || !targetAccountId) return;
    const res = await apiClient.api.v1['migration-templates'].recommend.$post({
      json: { resourceId, sourceAccountId, targetAccountId },
    });
    if (res.ok) {
      const json = await res.json();
      const recommended = json.data.strategy.recommendedTemplate;
      setTemplate(recommended);
      const foundTemplate = PREBUILT_TEMPLATES.find((t) => t.id === recommended);
      if (foundTemplate) {
        setPipelineSteps(foundTemplate.defaultSteps.map(createStepItem));
        setMigrationName(foundTemplate.name);
      }
      setRecommendationReason(json.data.strategy.reason);
    }
  };

  // Mutations
  const createAndPlanMutation = useMutation({
    mutationFn: async () => {
      const createRes = await apiClient.api.v1.jobs.$post({
        json: {
          template,
          sourceAccountId,
          targetAccountId,
          resourceId,
          input: {
            customStepTypes: pipelineSteps.map((s) => s.actionId),
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
      setActiveTab('timeline');
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

  const hasGitLabStep = pipelineSteps.some(
    (s) => s.actionId === 'gitlab.rewire-vars' || s.actionId === 'gitlab.trigger-pipeline',
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Migration Center · Pipeline Builder</h1>
        <p className="text-sm text-zinc-400">
          Xây dựng quy trình di chuyển tuần tự từng bước, nạp mẫu có sẵn, lưu cấu hình và thực thi
          an toàn.
        </p>
      </div>

      {/* Main Tab Navigation */}
      <MigrationTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        savedCount={savedMigrations.length}
        activeJobStatus={activeJob?.status}
      />

      {/* TAB 1: MODULAR PIPELINE BUILDER */}
      {activeTab === 'builder' && (
        <BentoGrid>
          <BentoCard
            title="Thiết kế Pipeline thực thi tuần tự"
            subtitle="Tùy biến các bước thực hiện, tự do thêm / bớt / đổi thứ tự và lưu thành mẫu tái sử dụng"
            size={BENTO_SIZE.FULL}
            icon={<SlidersHorizontal className="h-4 w-4" />}
          >
            <div className="space-y-6">
              <PrebuiltTemplatesList
                selectedTemplate={template}
                onSelectTemplate={handleSelectPrebuiltTemplate}
              />

              <PipelineStepsList
                steps={pipelineSteps}
                onChangeStepAction={handleChangeStepAction}
                onMoveStep={handleMoveStep}
                onRemoveStep={handleRemoveStep}
                onAddStep={handleAddStep}
              />

              <MigrationAccountsForm
                accounts={accounts}
                resources={resources}
                sourceAccountId={sourceAccountId}
                setSourceAccountId={setSourceAccountId}
                resourceId={resourceId}
                setResourceId={setResourceId}
                targetAccountId={targetAccountId}
                setTargetAccountId={setTargetAccountId}
                gitlabAccountId={gitlabAccountId}
                setGitlabAccountId={setGitlabAccountId}
                steps={pipelineSteps}
              />

              <MigrationActionBar
                migrationName={migrationName}
                setMigrationName={setMigrationName}
                onSaveMigration={handleSaveMigration}
                onAutoRecommend={() => void handleAutoRecommend()}
                isAutoRecommendDisabled={!resourceId || !sourceAccountId || !targetAccountId}
                onCreateAndPlan={() => createAndPlanMutation.mutate()}
                isCreateAndPlanDisabled={
                  !resourceId ||
                  !sourceAccountId ||
                  !targetAccountId ||
                  pipelineSteps.length === 0 ||
                  createAndPlanMutation.isPending ||
                  (hasGitLabStep && !gitlabAccountId)
                }
                isCreatingPlan={createAndPlanMutation.isPending}
                saveSuccessMessage={saveSuccessMessage ?? undefined}
                recommendationReason={recommendationReason ?? undefined}
                wizardError={wizardError ?? undefined}
              />
            </div>
          </BentoCard>
        </BentoGrid>
      )}

      {/* TAB 2: SAVED MIGRATIONS */}
      {activeTab === 'saved' && (
        <SavedMigrationsCard
          savedMigrations={savedMigrations}
          accounts={accounts}
          onOpenBuilder={() => setActiveTab('builder')}
          onDeleteSavedMigration={handleDeleteSavedMigration}
          onLoadSavedMigration={handleLoadSavedMigration}
        />
      )}

      {/* TAB 3: TIMELINE & EXECUTION */}
      {activeTab === 'timeline' && (
        <BentoGrid>
          <ExecutionTimelineCard
            activeJob={activeJob}
            onCompensate={(jobId) => compensateMutation.mutate(jobId)}
            confirmText={confirmText}
            setConfirmText={setConfirmText}
            onConfirmAndRun={(job) => confirmAndRunMutation.mutate(job)}
            isConfirmingAndRunning={confirmAndRunMutation.isPending}
            secretValues={secretValues}
            setSecretValues={setSecretValues}
            onCompleteManualStep={(jobId, stepId) => manualStepMutation.mutate({ jobId, stepId })}
            isCompletingManualStep={manualStepMutation.isPending}
          />

          <JobEventLogCard
            jobs={jobsQuery.data ?? []}
            activeJobId={activeJob?.id}
            onSelectJob={setSelectedJobId}
            events={eventsQuery.data ?? []}
          />
        </BentoGrid>
      )}
    </div>
  );
};
