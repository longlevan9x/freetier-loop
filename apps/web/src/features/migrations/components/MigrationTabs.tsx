import { JOB_STATUS } from '@freetier-loop/shared';
import { BookmarkCheck, SlidersHorizontal, Terminal } from 'lucide-react';

export type MigrationTabId = 'builder' | 'saved' | 'timeline';

export interface MigrationTabsProps {
  activeTab: MigrationTabId;
  onTabChange: (tab: MigrationTabId) => void;
  savedCount: number;
  activeJobStatus?: string | undefined;
}

export const MigrationTabs = ({
  activeTab,
  onTabChange,
  savedCount,
  activeJobStatus,
}: MigrationTabsProps) => {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
      <button
        type="button"
        onClick={() => onTabChange('builder')}
        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
          activeTab === 'builder'
            ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
            : 'bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Xây dựng Pipeline
      </button>

      <button
        type="button"
        onClick={() => onTabChange('saved')}
        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
          activeTab === 'saved'
            ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
            : 'bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
        }`}
      >
        <BookmarkCheck className="h-4 w-4" />
        Migration đã lưu
        {savedCount > 0 ? (
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
              activeTab === 'saved'
                ? 'bg-zinc-950 text-amber-300'
                : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {savedCount}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => onTabChange('timeline')}
        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
          activeTab === 'timeline'
            ? 'bg-zinc-100 text-zinc-950 shadow-md'
            : 'bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
        }`}
      >
        <Terminal className="h-4 w-4" />
        Tiến trình & Lịch sử
        {activeJobStatus ? (
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
              activeJobStatus === JOB_STATUS.RUNNING
                ? 'bg-emerald-500/30 text-emerald-300 animate-pulse'
                : activeJobStatus === JOB_STATUS.FAILED
                  ? 'bg-red-500/30 text-red-300'
                  : 'bg-zinc-700 text-zinc-300'
            }`}
          >
            {activeJobStatus}
          </span>
        ) : null}
      </button>
    </div>
  );
};
