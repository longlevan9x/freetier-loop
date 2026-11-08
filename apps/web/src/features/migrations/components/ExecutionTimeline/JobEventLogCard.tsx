import { BENTO_SIZE, type JobDto, type JobEventDto } from '@freetier-loop/shared';
import { History } from 'lucide-react';
import { BentoCard } from '../../../../components/bento/BentoCard';

export interface JobEventLogCardProps {
  jobs: JobDto[];
  activeJobId?: string | undefined;
  onSelectJob: (id: string) => void;
  events: JobEventDto[];
}

export const JobEventLogCard = ({
  jobs,
  activeJobId,
  onSelectJob,
  events,
}: JobEventLogCardProps) => {
  return (
    <BentoCard
      title="Lịch sử Job & Realtime Events"
      subtitle="Danh sách các job gần nhất và logs chi tiết từng bước"
      size={BENTO_SIZE.MD}
      icon={<History className="h-4 w-4" />}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          {jobs.slice(0, 5).map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => onSelectJob(j.id)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${
                activeJobId === j.id
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-zinc-950/60 text-zinc-300 hover:bg-zinc-800/50'
              }`}
            >
              <span className="truncate font-medium">{j.resourceName}</span>
              <span className="font-mono text-[11px]">{j.status}</span>
            </button>
          ))}
        </div>

        {events && events.length > 0 ? (
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px]">
            {events.map((ev) => (
              <div key={ev.id} className="text-zinc-300">
                <span className="text-zinc-500">[{ev.level}]</span> {ev.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </BentoCard>
  );
};
