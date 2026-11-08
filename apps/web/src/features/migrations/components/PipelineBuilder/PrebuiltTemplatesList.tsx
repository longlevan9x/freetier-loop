import type { MigrationTemplate } from '@freetier-loop/shared';
import { SlidersHorizontal } from 'lucide-react';
import { PREBUILT_TEMPLATES, type PrebuiltTemplate } from '../../model/types';

export interface PrebuiltTemplatesListProps {
  selectedTemplate: MigrationTemplate;
  onSelectTemplate: (tpl: PrebuiltTemplate) => void;
}

export const PrebuiltTemplatesList = ({
  selectedTemplate,
  onSelectTemplate,
}: PrebuiltTemplatesListProps) => {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
            <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />
            1. Chọn Mẫu Quy Trình (Pre-built Template)
          </h4>
          <p className="mt-0.5 text-xs text-zinc-400">
            Chọn mẫu sẵn có để tự động điền các bước khuyến nghị hoặc tự thêm bớt bước bên dưới.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {PREBUILT_TEMPLATES.map((tpl) => {
          const isSelected = selectedTemplate === tpl.id;
          const Icon = tpl.icon;

          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelectTemplate(tpl)}
              className={`group flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500/50 shadow-sm'
                  : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/40'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`rounded-lg p-2 ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-900 text-zinc-400 group-hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400">
                    {tpl.badge}
                  </span>
                </div>

                <h5
                  className={`mt-2 text-xs font-semibold ${
                    isSelected ? 'text-emerald-200' : 'text-zinc-200 group-hover:text-zinc-100'
                  }`}
                >
                  {tpl.name}
                </h5>

                <p className="mt-1 line-clamp-2 text-[11px] text-zinc-400">{tpl.description}</p>
              </div>

              <div className="mt-2.5 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-[10px] text-zinc-500">
                <span>{tpl.defaultSteps.length} bước tuần tự</span>
                {isSelected ? <span className="font-mono text-emerald-400">Đang chọn</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
