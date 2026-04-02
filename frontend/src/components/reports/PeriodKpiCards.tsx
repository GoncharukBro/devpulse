import KpiCard from '@/components/metrics/KpiCard';
import type { AggregatedMetricsDTO, OverallTrend } from '@/types/aggregated-report';

interface PeriodKpiCardsProps {
  metrics: AggregatedMetricsDTO;
  overallTrend: OverallTrend;
  loading?: boolean;
  hideScore?: boolean;
}

export default function PeriodKpiCards({ metrics, overallTrend, loading, hideScore }: PeriodKpiCardsProps) {
  const t = overallTrend ?? {} as Partial<OverallTrend>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {!hideScore && <KpiCard title="Score" value={metrics.avgScore} metric="score" trend={t.score?.direction} delta={t.score?.delta} loading={loading} />}
      <KpiCard title="Загрузка" value={metrics.avgUtilization} suffix="%" metric="utilization" trend={t.utilization?.direction} delta={t.utilization?.delta} loading={loading} />
      <KpiCard title="Точность" value={metrics.avgEstimationAccuracy} suffix="%" metric="estimationAccuracy" trend={t.estimationAccuracy?.direction} delta={t.estimationAccuracy?.delta} loading={loading} />
      <KpiCard title="Закрытие" value={metrics.avgCompletionRate} suffix="%" metric="completionRate" trend={t.completionRate?.direction} delta={t.completionRate?.delta} loading={loading} />
      <KpiCard title="Фокус" value={metrics.avgFocus} suffix="%" metric="focus" trend={t.focus?.direction} delta={t.focus?.delta} loading={loading} />
      <KpiCard title="Cycle Time" value={metrics.avgCycleTimeHours} suffix="ч" metric="avgCycleTimeHours" loading={loading} />
      <KpiCard title="Списано" value={metrics.totalSpentHours} suffix="ч" metric="totalSpentHours" trend={t.spentHours?.direction} delta={t.spentHours?.delta} loading={loading} />
    </div>
  );
}
