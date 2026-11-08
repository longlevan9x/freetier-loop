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

  // Active Tab: default to 'saved' (Quy trình đã lưu)
  const [activeTab, setActiveTab] = useState<MigrationTabId>('saved');

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
  const [gitlabProjectId, setGitlabProjectId] = useState('');
  const [githubAccountId, setGithubAccountId] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
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
    queryKey: queryKeys.resources.list({ topLevelOnly: 'true', limit: 100 }),
    queryFn: async () => {
      const res = await apiClient.api.v1.resources.$get({
        query: { topLevelOnly: 'true', limit: '100' },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 3000,
  });

  const accountResourcesQuery = useQuery({
    queryKey: queryKeys.resources.list({ accountId: sourceAccountId, limit: 100 }),
    queryFn: async () => {
      if (!sourceAccountId) return [];
      const res = await apiClient.api.v1.resources.$get({
        query: { accountId: sourceAccountId, limit: '100' },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
    enabled: Boolean(sourceAccountId),
    refetchInterval: 3000,
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
  const rawResources = [...(resourcesQuery.data ?? []), ...(accountResourcesQuery.data ?? [])];
  const uniqueResourcesMap = new Map<
    string,
    {
      id: string;
      providerAccountId: string;
      name: string;
      kind: string;
      data?: Record<string, unknown>;
    }
  >();
  for (const r of rawResources) {
    if (!r.parentId && !uniqueResourcesMap.has(r.id)) {
      uniqueResourcesMap.set(r.id, {
        id: r.id,
        providerAccountId: r.providerAccountId,
        name: r.name,
        kind: r.kind,
        data: r.data,
      });
    }
  }
  const resources = Array.from(uniqueResourcesMap.values());
  const activeJob = activeJobQuery.data ?? (jobsQuery.data ?? [])[0] ?? null;
  const gitlabAccounts = accounts.filter((a) => a.provider === 'gitlab');
  const selectedGitLabAccount = gitlabAccounts.find((a) => a.id === gitlabAccountId);
  const gitlabProjects = rawResources
    .filter(
      (r) =>
        r.kind === 'gitlab_project' &&
        (!gitlabAccountId || r.providerAccountId === gitlabAccountId),
    )
    .map((r) => ({ id: r.id, externalId: r.externalId, name: r.name }));

  const githubAccounts = accounts.filter((a) => a.provider === 'github');

  useEffect(() => {
    if (!gitlabAccountId && gitlabAccounts[0]?.id) {
      setGitlabAccountId(gitlabAccounts[0].id);
    }
  }, [gitlabAccounts, gitlabAccountId]);

  useEffect(() => {
    if (!githubAccountId && githubAccounts[0]?.id) {
      setGithubAccountId(githubAccounts[0].id);
    }
  }, [githubAccounts, githubAccountId]);

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
      ...(gitlabProjectId.trim() ? { gitlabProjectId: gitlabProjectId.trim() } : {}),
      ...(githubAccountId ? { githubAccountId } : {}),
      ...(githubRepo.trim() ? { githubRepo: githubRepo.trim() } : {}),
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

  const handleNewMigration = () => {
    setTemplate(MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER);
    setPipelineSteps([
      createStepItem('gitlab.rewire-vars'),
      createStepItem('gitlab.trigger-pipeline'),
      createStepItem('vercel.sync-rules'),
      createStepItem('vercel.move-domains'),
    ]);
    setMigrationName('Quy trình di chuyển mới');
    setSourceAccountId('');
    setTargetAccountId('');
    setResourceId('');
    setGitlabProjectId('');
    if (gitlabAccounts[0]?.id) {
      setGitlabAccountId(gitlabAccounts[0].id);
    }
    setGithubRepo('');
    if (githubAccounts[0]?.id) {
      setGithubAccountId(githubAccounts[0].id);
    }
    setWizardError(null);
    setActiveTab('builder');
  };

  const handleEditSavedMigration = (item: SavedMigration) => {
    setTemplate(item.template);
    setSourceAccountId(item.sourceAccountId);
    setTargetAccountId(item.targetAccountId);
    setResourceId(item.resourceId);
    if (item.gitlabAccountId) {
      setGitlabAccountId(item.gitlabAccountId);
    }
    setGitlabProjectId(item.gitlabProjectId ?? '');
    if (item.githubAccountId) {
      setGithubAccountId(item.githubAccountId);
    }
    setGithubRepo(item.githubRepo ?? '');
    setPipelineSteps(item.steps.map(createStepItem));
    setMigrationName(item.name);
    setWizardError(null);
    setActiveTab('builder');
  };

  const handleViewLogs = (item: SavedMigration) => {
    if (item.lastJobId) {
      setSelectedJobId(item.lastJobId);
    } else {
      const firstJob = jobsQuery.data?.[0];
      if (firstJob) {
        setSelectedJobId(firstJob.id);
      }
    }
    setActiveTab('timeline');
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
            ...(gitlabProjectId.trim() ? { gitlabProjectId: gitlabProjectId.trim() } : {}),
            ...(githubAccountId ? { githubAccountId } : {}),
            ...(githubRepo.trim() ? { githubRepo: githubRepo.trim() } : {}),
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

  const runSavedMutation = useMutation({
    mutationFn: async (item: SavedMigration) => {
      const createRes = await apiClient.api.v1.jobs.$post({
        json: {
          template: item.template,
          sourceAccountId: item.sourceAccountId,
          targetAccountId: item.targetAccountId,
          resourceId: item.resourceId,
          input: {
            customStepTypes: item.steps,
            ...(item.gitlabAccountId ? { gitlabAccountId: item.gitlabAccountId } : {}),
            ...(item.gitlabProjectId ? { gitlabProjectId: item.gitlabProjectId } : {}),
            ...(item.githubAccountId ? { githubAccountId: item.githubAccountId } : {}),
            ...(item.githubRepo ? { githubRepo: item.githubRepo } : {}),
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
      return { job: planBody.data, savedId: item.id };
    },
    onSuccess: ({ job, savedId }) => {
      setWizardError(null);
      setSelectedJobId(job.id);
      setConfirmText('');
      setSavedMigrations((prev) => {
        const next = prev.map((m) =>
          m.id === savedId ? { ...m, lastJobId: job.id, updatedAt: Date.now() } : m,
        );
        try {
          localStorage.setItem('freetier_saved_migrations', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      setActiveTab('timeline');
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
    onError: (err) => {
      setWizardError(formatApiError(err, 'Không thể khởi tạo migration'));
      setActiveTab('builder');
    },
  });

  const handleRunSavedMigration = (item: SavedMigration) => {
    setTemplate(item.template);
    setSourceAccountId(item.sourceAccountId);
    setTargetAccountId(item.targetAccountId);
    setResourceId(item.resourceId);
    if (item.gitlabAccountId) {
      setGitlabAccountId(item.gitlabAccountId);
    }
    setGitlabProjectId(item.gitlabProjectId ?? '');
    if (item.githubAccountId) {
      setGithubAccountId(item.githubAccountId);
    }
    setGithubRepo(item.githubRepo ?? '');
    setPipelineSteps(item.steps.map(createStepItem));
    setMigrationName(item.name);

    if (!item.sourceAccountId || !item.targetAccountId || !item.resourceId) {
      setWizardError(
        'Migration này chưa đủ thông tin tài khoản / tài nguyên. Hãy hoàn thiện trước khi chạy.',
      );
      setActiveTab('builder');
      return;
    }

    runSavedMutation.mutate(item);
  };

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
  const isGitLabUserToken = selectedGitLabAccount?.accountType === 'user';
  const isGitLabInvalid =
    hasGitLabStep && (!gitlabAccountId || (isGitLabUserToken && !gitlabProjectId.trim()));

  const hasGitHubStep = pipelineSteps.some(
    (s) => s.actionId === 'github.rewire-vars' || s.actionId === 'github.trigger-workflow',
  );
  const isGitHubInvalid = hasGitHubStep && (!githubAccountId || !githubRepo.trim());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Migration Center</h1>
        <p className="text-sm text-zinc-400">
          Quản lý quy trình đã lưu, thiết kế pipeline mới, thực thi chuyển tài nguyên và theo dõi
          log chi tiết.
        </p>
      </div>

      {/* Main Tab Navigation */}
      <MigrationTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewMigration={handleNewMigration}
        savedCount={savedMigrations.length}
        activeJobStatus={activeJob?.status}
      />

      {/* TAB 1: SAVED MIGRATIONS (Default view) */}
      {activeTab === 'saved' && (
        <SavedMigrationsCard
          savedMigrations={savedMigrations}
          accounts={accounts}
          onOpenBuilder={handleNewMigration}
          onDeleteSavedMigration={handleDeleteSavedMigration}
          onEditSavedMigration={handleEditSavedMigration}
          onRunSavedMigration={handleRunSavedMigration}
          onViewLogs={handleViewLogs}
          isStartingJob={runSavedMutation.isPending}
        />
      )}

      {/* TAB 2: MODULAR PIPELINE BUILDER */}
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
                gitlabProjectId={gitlabProjectId}
                setGitlabProjectId={setGitlabProjectId}
                gitlabProjects={gitlabProjects}
                githubAccountId={githubAccountId}
                setGithubAccountId={setGithubAccountId}
                githubRepo={githubRepo}
                setGithubRepo={setGithubRepo}
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
                  isGitLabInvalid ||
                  isGitHubInvalid
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
