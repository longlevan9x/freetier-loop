import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { MODULAR_ACTIONS, type PipelineStepItem } from '../../model/types';

export interface StepItemCardProps {
  step: PipelineStepItem;
  index: number;
  totalSteps: number;
  onChangeAction: (newActionId: string) => void;
  onMoveStep: (direction: -1 | 1) => void;
  onRemoveStep: () => void;
}

export const StepItemCard = ({
  step,
  index,
  totalSteps,
  onChangeAction,
  onMoveStep,
  onRemoveStep,
}: StepItemCardProps) => {
  const actionDef = MODULAR_ACTIONS.find((a) => a.id === step.actionId) || {
    id: step.actionId,
    name: step.actionId,
    badge: 'Action',
    description: '',
    category: 'vercel' as const,
    icon: MODULAR_ACTIONS[0]?.icon ?? ArrowDown,
  };
  const Icon = actionDef.icon;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 transition-all hover:border-zinc-700 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 font-mono text-xs font-bold text-emerald-400">
          {index + 1}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-zinc-100 truncate">{actionDef.name}</span>
            <span className="rounded bg-zinc-800/80 px-1.5 py-0.2 text-[9px] font-mono text-zinc-400 shrink-0">
              {actionDef.badge}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400">{actionDef.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
        <div className="w-48">
          <Select value={step.actionId} onValueChange={onChangeAction}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODULAR_ACTIONS.map((act) => (
                <SelectItem key={act.id} value={act.id}>
                  {act.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMoveStep(-1)}
          disabled={index === 0}
          className="h-7 w-7 cursor-pointer disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-100"
          title="Di chuyển lên"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMoveStep(1)}
          disabled={index === totalSteps - 1}
          className="h-7 w-7 cursor-pointer disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-100"
          title="Di chuyển xuống"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemoveStep}
          disabled={totalSteps <= 1}
          className="h-7 w-7 cursor-pointer disabled:cursor-not-allowed text-zinc-500 hover:text-red-400 hover:bg-red-950/20"
          title="Xóa bước này"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
