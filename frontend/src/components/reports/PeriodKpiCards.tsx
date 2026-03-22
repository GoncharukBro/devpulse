import KpiCard from '@/components/metrics/KpiCard';
import type { AggregatedMetricsDTO, OverallTrend } from '@/types/aggregated-report';

interface PeriodKpiCardsProps {
  metrics: AggregatedMetricsDTO;
  overallTrend: OverallTrend;
  loading?: boolean;
}

export default function PeriodKpiCards({ metrics, overallTrend, loading }: PeriodKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard title="Score" value={metrics.avgScore} metric="score" trend={overallTrend.score.direction} delta={overallTrend.score.delta} loading={loading} />
      <KpiCard title="Загрузка" value={metrics.avgUtilization} suffix="%" metric="utilization" trend={overallTrend.utilization.direction} delta={overallTrend.utilization.delta} loading={loading} />
      <KpiCard title="Точность" value={metrics.avgEstimationAccuracy} suffix="%" metric="estimationAccuracy" trend={overallTrend.estimationAccuracy.direction} delta={overallTrend.estimationAccuracy.delta} loading={loading} />
      <KpiCard title="Закрытие" value={metrics.avgCompletionRate} suffix="%" metric="completionRate" trend={overallTrend.completionRate.direction} delta={overallTrend.completionRate.delta} loading={loading} />
      <KpiCard title="Фокус" value={metrics.avgFocus} suffix="%" metric="focus" trend={overallTrend.focus?.direction} delta={overallTrend.focus?.delta} loading={loading} />
      <KpiCard title="Cycle Time" value={metrics.avgCycleTimeHours} suffix="ч" metric="avgCycleTimeHours" loading={loading} />
      <KpiCard title="Списано" value={metrics.totalSpentHours} suffix="ч" metric="totalSpentHours" trend={overallTrend.spentHours.direction} delta={overallTrend.spentHours.delta} loading={loading} />
    </div>
  );
}
