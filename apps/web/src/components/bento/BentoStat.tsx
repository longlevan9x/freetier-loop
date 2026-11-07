import type { ReactNode } from 'react';

export type BentoStatProps = {
  label: string;
  value: string | number;
  hint?: string;
  badge?: ReactNode;
  trend?: 'normal' | 'warning' | 'danger';
};

const TREND_COLOR: Record<NonNullable<BentoStatProps['trend']>, string> = {
  normal: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
};

export const BentoStat = ({ label, value, hint, badge, trend = 'normal' }: BentoStatProps) => {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        {badge}
      </div>
      <div className={`mt-1.5 text-xl font-bold tracking-tight ${TREND_COLOR[trend]}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
};
