import { Layers, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../../../components/ui/select';
import { MODULAR_ACTIONS, type PipelineStepItem } from '../../model/types';
import { StepItemCard } from './StepItemCard';

export interface PipelineStepsListProps {
  steps: PipelineStepItem[];
  onChangeStepAction: (index: number, newActionId: string) => void;
  onMoveStep: (index: number, direction: -1 | 1) => void;
  onRemoveStep: (index: number) => void;
  onAddStep: (actionId: string) => void;
}

export const PipelineStepsList = ({
  steps,
  onChangeStepAction,
  onMoveStep,
  onRemoveStep,
  onAddStep,
}: PipelineStepsListProps) => {
  return (
    <div className="border-t border-zinc-800/80 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
            Các bước thực thi (Pipeline)
          </h4>
          <p className="mt-0.5 text-xs text-zinc-400">
            Thực hiện tuần tự từ trên xuống dưới. Có thể thêm, xóa hoặc đổi thứ tự.
          </p>
        </div>

        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
          {steps.length} bước trong quy trình
        </span>
      </div>

      {/* Steps List */}
      <div className="space-y-2.5">
        {steps.map((step, index) => (
          <StepItemCard
            key={step.id}
            step={step}
            index={index}
            totalSteps={steps.length}
            onChangeAction={(actionId) => onChangeStepAction(index, actionId)}
            onMoveStep={(direction) => onMoveStep(index, direction)}
            onRemoveStep={() => onRemoveStep(index)}
          />
        ))}
      </div>

      {/* Add Step Dropdown Button */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select onValueChange={onAddStep}>
          <SelectTrigger className="h-8 w-auto gap-1.5 border-dashed border-emerald-500/50 bg-emerald-950/20 text-xs font-semibold text-emerald-300 hover:bg-emerald-950/40 cursor-pointer">
            <Plus className="h-3.5 w-3.5" />
            <span>+ Thêm bước tiếp theo (Bước {steps.length + 1})</span>
          </SelectTrigger>
          <SelectContent>
            {MODULAR_ACTIONS.map((act) => (
              <SelectItem key={act.id} value={act.id}>
                {act.name} ({act.badge})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-[11px] text-zinc-500">
          * Hệ thống luôn tự động chèn 2 bước bảo vệ{' '}
          <code className="font-mono text-zinc-400">preflight.verify</code> và{' '}
          <code className="font-mono text-zinc-400">snapshot.resource</code> ở đầu.
        </span>
      </div>
    </div>
  );
};
