import WeeklyChart from '@/components/metrics/WeeklyChart';
import Card from '@/components/ui/Card';
import type { WeeklyDataItem } from '@/types/aggregated-report';

interface PeriodWeeklyChartProps {
  weeklyData: WeeklyDataItem[];
}

function buildMetricGroups(data: WeeklyDataItem[]) {
  const has = (key: keyof WeeklyDataItem) => data.some((d) => d[key] != null && d[key] !== 0);

  const kpiMetrics = [];
  if (has('score')) kpiMetrics.push({ key: 'score', label: 'Score', color: '#6366f1' });
  if (has('utilization')) kpiMetrics.push({ key: 'utilization', label: 'Загрузка', color: '#06b6d4' });
  if (has('estimationAccuracy')) kpiMetrics.push({ key: 'estimationAccuracy', label: 'Точность', color: '#f59e0b' });
  if (has('completionRate')) kpiMetrics.push({ key: 'completionRate', label: 'Закрытие', color: '#10b981' });
  if (has('focus')) kpiMetrics.push({ key: 'focus', label: 'Фокус', color: '#8b5cf6' });

  const groups = [];

  if (kpiMetrics.length > 0) {
    groups.push({ title: 'KPI', metrics: kpiMetrics });
  }

  groups.push({
    title: 'Задачи',
    metrics: [
      { key: 'completedIssues', label: 'Закрыто', color: '#10b981' },
      { key: 'totalIssues', label: 'Всего', color: '#6b7280' },
      { key: 'totalSpentHours', label: 'Часы', color: '#8b5cf6' },
    ],
  });

  return groups;
}

export default function PeriodWeeklyChart({ weeklyData }: PeriodWeeklyChartProps) {
  if (!weeklyData.length) return null;

  const metricGroups = buildMetricGroups(weeklyData);

  return (
    <div className="space-y-4">
      {metricGroups.map((group) => (
        <Card key={group.title}>
          <h4 className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-300">{group.title}</h4>
          <WeeklyChart data={weeklyData as unknown as Array<{ periodStart: string; [key: string]: string | number | null | undefined }>} metrics={group.metrics} />
        </Card>
      ))}
    </div>
  );
}
