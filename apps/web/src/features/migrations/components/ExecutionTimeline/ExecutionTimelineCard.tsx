import {
  BENTO_SIZE,
  JOB_STATUS,
  type JobDto,
  type JobStepDto,
  MIGRATION_TEMPLATE_LABEL,
  type MigrationTemplate,
  STEP_STATUS,
} from '@freetier-loop/shared';
import { AlertTriangle, CheckCircle2, RotateCcw, Terminal } from 'lucide-react';
import type React from 'react';
import { BentoCard } from '../../../../components/bento/BentoCard';
import { Button } from '../../../../components/ui/button';

export interface ExecutionTimelineCardProps {
  activeJob: JobDto | null | undefined;
  onCompensate: (jobId: string) => void;
  confirmText: string;
  setConfirmText: (text: string) => void;
  onConfirmAndRun: (job: JobDto) => void;
  isConfirmingAndRunning: boolean;
  secretValues: Record<string, string>;
  setSecretValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onCompleteManualStep: (jobId: string, stepId: string) => void;
  isCompletingManualStep: boolean;
}

export const ExecutionTimelineCard = ({
  activeJob,
  onCompensate,
  confirmText,
  setConfirmText,
  onConfirmAndRun,
  isConfirmingAndRunning,
  secretValues,
  setSecretValues,
  onCompleteManualStep,
  isCompletingManualStep,
}: ExecutionTimelineCardProps) => {
  if (!activeJob) {
    return (
      <BentoCard
        title="Chưa có Job nào đang chạy"
        subtitle="Hãy tạo một migration mới từ tab 'Xây dựng Pipeline' hoặc mở từ 'Migration đã lưu'"
        size={BENTO_SIZE.FULL}
        icon={<Terminal className="h-4 w-4" />}
      >
        <div className="py-8 text-center text-xs text-zinc-400">
          Chưa có job nào được chọn. Chọn job từ danh sách bên dưới hoặc tạo job mới.
        </div>
      </BentoCard>
    );
  }

  const isDraftOrPlanned =
    activeJob.status === JOB_STATUS.DRAFT || activeJob.status === JOB_STATUS.PLANNED;

  const templateLabel =
    MIGRATION_TEMPLATE_LABEL[activeJob.template as MigrationTemplate] ?? activeJob.template;

  return (
    <BentoCard
      title={`Tiến trình thực thi: ${activeJob.resourceName}`}
      subtitle={`${templateLabel} · Trạng thái: ${activeJob.status.toUpperCase()}`}
      size={BENTO_SIZE.XL}
      icon={<Terminal className="h-4 w-4" />}
      action={
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => onCompensate(activeJob.id)}
          className="gap-1 text-xs cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          Khôi phục khẩn cấp (Rollback)
        </Button>
      }
    >
      {isDraftOrPlanned ? (
        <div className="mb-4 rounded-xl border border-amber-800/60 bg-amber-950/30 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Xác nhận tên tài nguyên trước khi chạy
          </div>
          <p className="mt-1 text-xs text-zinc-300">
            Nhập chính xác{' '}
            <span className="font-mono font-bold text-white">{activeJob.resourceName}</span> để xác
            nhận thực thi từng bước an toàn:
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
              disabled={confirmText.trim() !== activeJob.resourceName || isConfirmingAndRunning}
              onClick={() => onConfirmAndRun(activeJob)}
              className="font-semibold text-zinc-950 cursor-pointer disabled:cursor-not-allowed"
            >
              {isConfirmingAndRunning ? 'Đang chạy các bước…' : 'Xác nhận & Khởi chạy'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Step Timeline */}
      <div className="space-y-2.5">
        {(activeJob.steps ?? []).map((step: JobStepDto) => {
          const isWaiting = step.status === STEP_STATUS.WAITING_MANUAL;
          const instructions = (step.result?.instructions as string[] | undefined) ?? [];
          const command = step.result?.command as string | undefined;
          const requiredSecrets = (step.result?.requiredSecrets as string[] | undefined) ?? [];

          return (
            <div key={step.id} className="rounded-xl border border-zinc-800/90 bg-zinc-950/60 p-3">
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
                        placeholder={`Nhập giá trị cho ${secKey}`}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100"
                      />
                    </div>
                  ))}

                  <Button
                    type="button"
                    size="sm"
                    disabled={isCompletingManualStep}
                    onClick={() => onCompleteManualStep(activeJob.id, step.id)}
                    className="gap-1.5 font-semibold text-zinc-950 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Xác nhận hoàn thành & Tiếp tục
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </BentoCard>
  );
};
