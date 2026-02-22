import { Loader2 } from 'lucide-react';
import type { CollectionProgress as CollectionProgressType, QueueItem } from '@/types/collection';

interface CollectionProgressProps {
  activeCollections: CollectionProgressType[];
  queue: QueueItem[];
}

export default function CollectionProgressPanel({ activeCollections, queue }: CollectionProgressProps) {
  if (activeCollections.length === 0 && queue.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Loader2 size={18} className="animate-spin text-brand-400" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Сбор метрик</h3>
      </div>

      <div className="space-y-3">
        {activeCollections.map((ac) => {
          const progress = ac.totalEmployees > 0
            ? Math.round((ac.processedEmployees / ac.totalEmployees) * 100)
            : 0;

          return (
            <div key={ac.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">
                  {ac.projectName}: {ac.currentEmployee ?? 'запуск...'} ({ac.processedEmployees}/{ac.totalEmployees})
                </span>
                <span className="text-gray-500 dark:text-gray-400">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-lighter">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })}

        {queue.length > 0 && (
          <div className="mt-2 text-sm text-gray-400 dark:text-gray-500">
            Очередь:{' '}
            {queue.map((q, i) => (
              <span key={q.subscriptionId + q.periodStart}>
                {i > 0 && ', '}
                {q.projectName} ({q.type})
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
