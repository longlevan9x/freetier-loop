import type { ReactNode } from 'react';

export type BentoGridProps = {
  children: ReactNode;
  className?: string;
};

export const BentoGrid = ({ children, className = '' }: BentoGridProps) => {
  return (
    <div
      className={`grid grid-cols-1 gap-4 auto-rows-[minmax(140px,auto)] md:grid-cols-4 xl:grid-cols-6 ${className}`.trim()}
    >
      {children}
    </div>
  );
};
