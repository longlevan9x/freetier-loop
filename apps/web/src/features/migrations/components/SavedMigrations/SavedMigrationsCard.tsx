import { BENTO_SIZE } from '@freetier-loop/shared';
import { BookmarkCheck, FolderHeart, Play, Trash2 } from 'lucide-react';
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
  onLoadSavedMigration: (saved: SavedMigration) => void;
}

export const SavedMigrationsCard = ({
  savedMigrations,
  accounts,
  onOpenBuilder,
  onDeleteSavedMigration,
  onLoadSavedMigration,
}: SavedMigrationsCardProps) => {
  return (
    <BentoGrid>
      <BentoCard
        title={`Migration đã lưu (${savedMigrations.length})`}
        subtitle="Mở lại các quy trình đã cấu hình sẵn để chạy ngay mà không cần thiết lập lại từ đầu"
        size={BENTO_SIZE.FULL}
        icon={<BookmarkCheck className="h-4 w-4 text-amber-400" />}
      >
        {savedMigrations.length === 0 ? (
          <div className="py-12 text-center">
            <FolderHeart className="mx-auto h-10 w-10 text-zinc-600" />
            <h4 className="mt-3 text-sm font-semibold text-zinc-200">
              Chưa có Migration nào được lưu
            </h4>
            <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
              Hãy chuyển sang tab "Xây dựng Pipeline", chọn các bước và tài khoản theo ý muốn, sau
              đó bấm "Lưu thành Migration" để sử dụng lại bất kỳ lúc nào.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={onOpenBuilder}
              className="mt-4 text-xs font-semibold text-zinc-950 cursor-pointer"
            >
              Xây dựng Migration ngay
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {savedMigrations.map((item) => {
              const src = accounts.find((a) => a.id === item.sourceAccountId);
              const dst = accounts.find((a) => a.id === item.targetAccountId);

              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition-all hover:border-amber-500/50"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md border border-amber-800/60 bg-amber-950/30 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                        {item.steps.length} bước thực thi
                      </span>

                      <button
                        type="button"
                        onClick={() => onDeleteSavedMigration(item.id)}
                        className="cursor-pointer text-zinc-500 hover:text-red-400 transition-colors"
                        title="Xóa Migration này"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <h4 className="mt-2.5 text-sm font-semibold text-zinc-100">{item.name}</h4>

                    {/* Pipeline visual sequence */}
                    <div className="mt-2.5 space-y-1 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-2 text-[11px]">
                      {item.steps.map((st, i) => {
                        const act = MODULAR_ACTIONS.find((a) => a.id === st);
                        return (
                          <div
                            key={`${item.id}_${st}_${i}`}
                            className="flex items-center gap-1.5 text-zinc-300 truncate"
                          >
                            <span className="font-mono text-[10px] text-emerald-400">#{i + 1}</span>
                            <span className="truncate">{act ? act.name : st}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Accounts info */}
                    <div className="mt-3 space-y-1 text-[11px] text-zinc-400">
                      <div>
                        Nguồn: <span className="text-zinc-200">{src?.label ?? 'Chưa gán'}</span>
                      </div>
                      <div>
                        Đích: <span className="text-zinc-200">{dst?.label ?? 'Chưa gán'}</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onLoadSavedMigration(item)}
                    className="mt-4 w-full gap-1.5 text-xs font-semibold text-zinc-950 cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Mở & Chạy Migration này
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </BentoCard>
    </BentoGrid>
  );
};
