import { BENTO_SIZE } from '@freetier-loop/shared';
import {
  BookmarkCheck,
  FolderHeart,
  Pencil,
  Play,
  Plus,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { BentoCard } from '../../../../components/bento/BentoCard';
import { BentoGrid } from '../../../../components/bento/BentoGrid';
import { Button } from '../../../../components/ui/button';
import { MODULAR_ACTIONS, type SavedMigration } from '../../model/types';
import type { AccountOption } from '../PipelineBuilder/MigrationAccountsForm';

export interface SavedMigrationsCardProps {
  savedMigrations: SavedMigration[];
  accounts: AccountOption[];
  onOpenBuilder: () => void;
  onDeleteSavedMigration: (id: string) => void;
  onEditSavedMigration: (saved: SavedMigration) => void;
  onRunSavedMigration: (saved: SavedMigration) => void;
  onViewLogs: (saved: SavedMigration) => void;
  isStartingJob?: boolean;
}

export const SavedMigrationsCard = ({
  savedMigrations,
  accounts,
  onOpenBuilder,
  onDeleteSavedMigration,
  onEditSavedMigration,
  onRunSavedMigration,
  onViewLogs,
  isStartingJob = false,
}: SavedMigrationsCardProps) => {
  const [search, setSearch] = useState('');

  const filteredMigrations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return savedMigrations;
    return savedMigrations.filter((item) => {
      const src = accounts.find((a) => a.id === item.sourceAccountId);
      const dst = accounts.find((a) => a.id === item.targetAccountId);
      return (
        item.name.toLowerCase().includes(q) ||
        src?.label.toLowerCase().includes(q) ||
        dst?.label.toLowerCase().includes(q)
      );
    });
  }, [savedMigrations, search, accounts]);

  return (
    <BentoGrid>
      <BentoCard
        title={`Quy trình Migration đã lưu (${savedMigrations.length})`}
        subtitle="Quản lý, chỉnh sửa, chạy và xem log các quy trình di chuyển tài nguyên đã thiết lập"
        size={BENTO_SIZE.FULL}
        icon={<BookmarkCheck className="h-4 w-4 text-amber-400" />}
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={onOpenBuilder}
              className="gap-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo Migration mới
            </Button>
          </div>
        }
      >
        {savedMigrations.length === 0 ? (
          <div className="py-12 text-center">
            <FolderHeart className="mx-auto h-10 w-10 text-zinc-600" />
            <h4 className="mt-3 text-sm font-semibold text-zinc-200">
              Chưa có Migration nào được lưu
            </h4>
            <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
              Bắt đầu bằng cách tạo một quy trình mới: lựa chọn các bước cần chạy, cấu hình tài
              khoản và lưu lại để sử dụng lại bất kỳ lúc nào.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={onOpenBuilder}
              className="mt-4 gap-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Thiết kế quy trình mới
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search bar */}
            {savedMigrations.length > 2 && (
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Tìm kiếm migration đã lưu..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMigrations.map((item) => {
                const src = accounts.find((a) => a.id === item.sourceAccountId);
                const dst = accounts.find((a) => a.id === item.targetAccountId);

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition-all hover:border-violet-500/50 hover:bg-zinc-950"
                  >
                    <div>
                      {/* Header Card */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-md border border-violet-800/60 bg-violet-950/30 px-2 py-0.5 text-[10px] font-mono text-violet-300">
                          {item.steps.length} bước thực thi
                        </span>

                        <button
                          type="button"
                          onClick={() => onDeleteSavedMigration(item.id)}
                          className="cursor-pointer text-zinc-500 hover:text-red-400 transition-colors p-1"
                          title="Xóa Migration này"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <h4 className="mt-2.5 text-sm font-semibold text-zinc-100 line-clamp-1">
                        {item.name}
                      </h4>

                      {/* Visual sequence */}
                      <div className="mt-2.5 space-y-1 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-2 text-[11px]">
                        {item.steps.slice(0, 4).map((st, i) => {
                          const act = MODULAR_ACTIONS.find((a) => a.id === st);
                          return (
                            <div
                              key={`${item.id}_${st}_${i}`}
                              className="flex items-center gap-1.5 text-zinc-300 truncate"
                            >
                              <span className="font-mono text-[10px] text-emerald-400">
                                #{i + 1}
                              </span>
                              <span className="truncate">{act ? act.name : st}</span>
                            </div>
                          );
                        })}
                        {item.steps.length > 4 && (
                          <div className="text-[10px] text-zinc-500 pl-4 font-mono">
                            + {item.steps.length - 4} bước tiếp theo...
                          </div>
                        )}
                      </div>

                      {/* Accounts info */}
                      <div className="mt-3 space-y-1 text-[11px] text-zinc-400 border-t border-zinc-900 pt-2.5">
                        <div className="truncate">
                          Nguồn: <span className="text-zinc-200">{src?.label ?? 'Chưa gán'}</span>
                        </div>
                        <div className="truncate">
                          Đích: <span className="text-zinc-200">{dst?.label ?? 'Chưa gán'}</span>
                        </div>
                        {item.createdAt ? (
                          <div className="text-[10px] text-zinc-500 pt-0.5">
                            Lưu ngày: {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Action buttons: Run, Edit, View Log */}
                    <div className="mt-4 pt-3 border-t border-zinc-900 flex flex-col gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isStartingJob}
                        onClick={() => onRunSavedMigration(item)}
                        className="w-full gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-zinc-950 cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Chạy Migration này
                      </Button>

                      <div className="grid grid-cols-2 gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onEditSavedMigration(item)}
                          className="gap-1 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" />
                          Chỉnh sửa
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onViewLogs(item)}
                          className="gap-1 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
                        >
                          <Terminal className="h-3 w-3" />
                          Xem log
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </BentoCard>
    </BentoGrid>
  );
};
