import { useState } from 'react';
import { Clock, Pause, Play } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { CronState } from '@/types/collection';

interface CronControlProps {
  cronState: CronState | null;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
}

function formatSchedule(schedule: string): string {
  if (schedule.includes('0 0 * * 1')) return 'пн 00:00';
  if (schedule.includes('0 0 * * *')) return 'ежедневно 00:00';
  return schedule;
}

export default function CronControl({ cronState, onPause, onResume }: CronControlProps) {
  const [loading, setLoading] = useState(false);

  if (!cronState) return null;

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (cronState.enabled) {
        await onPause();
      } else {
        await onResume();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-light px-4 py-2.5 text-sm">
      <Clock size={16} className="text-gray-500 dark:text-gray-400" />
      <span className="text-gray-500 dark:text-gray-400">Автосбор:</span>
      {cronState.enabled ? (
        <>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Активен ({formatSchedule(cronState.schedule)})
          </span>
          <Button variant="ghost" size="sm" loading={loading} onClick={handleToggle} leftIcon={<Pause size={14} />}>
            Приостановить
          </Button>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
            <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500" />
            Приостановлен
          </span>
          <Button variant="ghost" size="sm" loading={loading} onClick={handleToggle} leftIcon={<Play size={14} />}>
            Возобновить
          </Button>
        </>
      )}
    </div>
  );
}
