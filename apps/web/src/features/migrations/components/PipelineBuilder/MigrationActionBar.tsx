import { BookmarkCheck, BookmarkPlus, Check, Play, Sparkles } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

export interface MigrationActionBarProps {
  migrationName: string;
  setMigrationName: (name: string) => void;
  onSaveMigration: () => void;
  onAutoRecommend: () => void;
  isAutoRecommendDisabled: boolean;
  onCreateAndPlan: () => void;
  isCreateAndPlanDisabled: boolean;
  isCreatingPlan: boolean;
  saveSuccessMessage?: string | undefined;
  recommendationReason?: string | undefined;
  wizardError?: string | undefined;
}

export const MigrationActionBar = ({
  migrationName,
  setMigrationName,
  onSaveMigration,
  onAutoRecommend,
  isAutoRecommendDisabled,
  onCreateAndPlan,
  isCreateAndPlanDisabled,
  isCreatingPlan,
  saveSuccessMessage,
  recommendationReason,
  wizardError,
}: MigrationActionBarProps) => {
  return (
    <div className="border-t border-zinc-800/80 pt-5">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800/90 bg-zinc-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Name & Save */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <BookmarkPlus className="h-4 w-4 text-amber-400 shrink-0" />
          <input
            type="text"
            value={migrationName}
            onChange={(e) => setMigrationName(e.target.value)}
            placeholder="Đặt tên cho Migration này..."
            className="min-w-[220px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSaveMigration}
            className="h-8 text-xs text-amber-300 border-amber-800/60 hover:bg-amber-950/30 cursor-pointer"
          >
            <BookmarkCheck className="h-3.5 w-3.5 mr-1" />
            Lưu thành Migration
          </Button>
        </div>

        {/* Dry Run Button */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAutoRecommend}
            disabled={isAutoRecommendDisabled}
            className="h-8 gap-1.5 text-xs text-emerald-300 cursor-pointer disabled:cursor-not-allowed"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Phân tích mẫu phù hợp
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isCreateAndPlanDisabled}
            onClick={onCreateAndPlan}
            className="h-8 gap-1.5 text-xs font-semibold text-zinc-950 cursor-pointer disabled:cursor-not-allowed"
          >
            <Play className="h-3.5 w-3.5" />
            {isCreatingPlan ? 'Đang tạo Plan…' : 'Tạo & Chạy Dry-Run Plan'}
          </Button>
        </div>
      </div>

      {saveSuccessMessage ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-800/60 bg-amber-950/30 p-2.5 text-xs text-amber-300">
          <Check className="h-4 w-4 text-amber-400" />
          <span>{saveSuccessMessage}</span>
        </div>
      ) : null}

      {recommendationReason ? (
        <div className="mt-3 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-2.5 text-xs text-emerald-300">
          <strong>Phân tích chiến lược:</strong> {recommendationReason}
        </div>
      ) : null}

      {wizardError ? (
        <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-300">
          {wizardError}
        </div>
      ) : null}
    </div>
  );
};
