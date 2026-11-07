export type BentoSkeletonProps = {
  lines?: number;
};

export const BentoSkeleton = ({ lines = 3 }: BentoSkeletonProps) => {
  const widths = Array.from({ length: lines }, (_, idx) => Math.max(45, 95 - idx * 15));
  return (
    <div className="space-y-2.5 py-1" aria-busy="true" aria-label="Loading content">
      {widths.map((w) => (
        <div
          key={`skeleton-line-${w}`}
          className="h-4 animate-pulse rounded bg-zinc-800/70"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
};
