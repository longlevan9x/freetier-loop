import { BENTO_SIZE, type BentoSize } from '@freetier-loop/shared';
import type { ReactNode } from 'react';

const SIZE_CLASSES: Record<BentoSize, string> = {
  [BENTO_SIZE.SM]: 'col-span-1 row-span-1',
  [BENTO_SIZE.MD]: 'col-span-1 md:col-span-2 row-span-1',
  [BENTO_SIZE.LG]: 'col-span-1 md:col-span-2 row-span-2',
  [BENTO_SIZE.XL]: 'col-span-1 md:col-span-4 row-span-2',
  [BENTO_SIZE.FULL]: 'col-span-1 md:col-span-4 xl:col-span-6 row-span-1',
};

export type BentoCardProps = {
  title: string;
  subtitle?: string;
  size?: BentoSize;
  icon?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
  error?: string | null;
  children?: ReactNode;
};

export const BentoCard = ({
  title,
  subtitle,
  size = BENTO_SIZE.MD,
  icon,
  action,
  loading = false,
  error = null,
  children,
}: BentoCardProps) => {
  const spanClass = SIZE_CLASSES[size];
  return (
    <section
      className={`${spanClass} flex flex-col justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 shadow-sm backdrop-blur transition-colors hover:border-zinc-700`}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon ? <span className="text-emerald-400">{icon}</span> : null}
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-100">{title}</h2>
            {subtitle ? <p className="text-xs text-zinc-400">{subtitle}</p> : null}
          </div>
        </div>
        {action ? <div>{action}</div> : null}
      </header>

      <div className="flex-1 text-sm text-zinc-300">
        {loading ? (
          <div className="h-16 w-full animate-pulse rounded-lg bg-zinc-800/60" />
        ) : error ? (
          <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
};
