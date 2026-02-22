import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Card from '@/components/ui/Card';
import type { ConcernItem, OverviewConcernItem } from '@/types/reports';

interface ConcernsListProps {
  concerns: (ConcernItem | OverviewConcernItem)[];
  loading?: boolean;
}

export default function ConcernsList({ concerns, loading }: ConcernsListProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card>
        <div className="animate-pulse">
          <div className="mb-3 h-5 w-48 rounded bg-gray-200 dark:bg-gray-700/50" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700/50" />
            <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700/50" />
            <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700/50" />
          </div>
        </div>
      </Card>
    );
  }

  if (!concerns.length) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <AlertTriangle size={16} />
          <span className="text-sm font-medium">Обратите внимание</span>
        </div>
        <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">Нет активных предупреждений</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
        <AlertTriangle size={16} className="text-amber-400" />
        <span className="text-sm font-medium">Обратите внимание</span>
      </div>
      <div className="mt-3 space-y-2">
        {concerns.map((c, i) => (
          <button
            key={i}
            onClick={() => navigate(`/employees/${c.youtrackLogin}`)}
            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-surface-lighter"
          >
            <span className={c.severity === 'danger' ? 'text-red-400' : 'text-amber-400'}>
              {c.severity === 'danger' ? '●' : '●'}
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              <span className="font-medium">{c.displayName}</span>
              {'projectName' in c && c.projectName && (
                <span className="text-gray-400 dark:text-gray-500"> ({c.projectName})</span>
              )}
              <span className="text-gray-500 dark:text-gray-400"> — {c.reason}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
