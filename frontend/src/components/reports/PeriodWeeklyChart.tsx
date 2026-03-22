import WeeklyChart from '@/components/metrics/WeeklyChart';
import Card from '@/components/ui/Card';
import type { WeeklyDataItem } from '@/types/aggregated-report';

interface PeriodWeeklyChartProps {
  weeklyData: WeeklyDataItem[];
}

const METRIC_GROUPS = [
  {
    title: 'KPI',
    metrics: [
      { key: 'score', label: 'Score', color: '#6366f1' },
      { key: 'utilization', label: 'Загрузка', color: '#06b6d4' },
      { key: 'completionRate', label: 'Закрытие', color: '#10b981' },
    ],
  },
  {
    title: 'Задачи',
    metrics: [
      { key: 'completedIssues', label: 'Закрыто', color: '#10b981' },
      { key: 'totalIssues', label: 'Всего', color: '#6b7280' },
      { key: 'overdueIssues', label: 'Просрочено', color: '#ef4444' },
    ],
  },
];

export default function PeriodWeeklyChart({ weeklyData }: PeriodWeeklyChartProps) {
  if (!weeklyData.length) return null;

  return (
    <div className="space-y-4">
      {METRIC_GROUPS.map((group) => (
        <Card key={group.title}>
          <h4 className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-300">{group.title}</h4>
          <WeeklyChart data={weeklyData as unknown as Array<{ periodStart: string; [key: string]: string | number | null | undefined }>} metrics={group.metrics} />
        </Card>
      ))}
    </div>
  );
}
