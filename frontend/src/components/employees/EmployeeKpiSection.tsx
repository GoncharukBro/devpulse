import KpiCard from '@/components/metrics/KpiCard';
import type { EmployeeSummaryDTO, EmployeeReportDTO } from '@/types/reports';

interface EmployeeKpiSectionProps {
  summary: EmployeeSummaryDTO | null;
  report: EmployeeReportDTO | null;
  loading: boolean;
}

export default function EmployeeKpiSection({ summary, report, loading }: EmployeeKpiSectionProps) {
  const displayScore = report?.score ?? summary?.avgScore ?? null;
  const displayUtilization = report?.utilization ?? summary?.avgUtilization ?? null;
  const displayEstimation = report?.estimationAccuracy ?? summary?.avgEstimationAccuracy ?? null;
  const displayFocus = report?.focus ?? summary?.avgFocus ?? null;
  const displayCompletion = report?.completionRate ?? null;
  const displayCycle = report?.avgCycleTimeHours ?? null;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard title="Score" value={displayScore} metric="score" trend={summary?.trends?.score.direction} delta={summary?.trends?.score.delta} loading={loading} />
      <KpiCard title="Загрузка" value={displayUtilization} suffix="%" metric="utilization" trend={summary?.trends?.utilization.direction} delta={summary?.trends?.utilization.delta} loading={loading} />
      <KpiCard title="Точность" value={displayEstimation} suffix="%" metric="estimationAccuracy" trend={summary?.trends?.estimationAccuracy.direction} delta={summary?.trends?.estimationAccuracy.delta} loading={loading} />
      <KpiCard title="Фокус" value={displayFocus} suffix="%" metric="focus" trend={summary?.trends?.focus.direction} delta={summary?.trends?.focus.delta} loading={loading} />
      <KpiCard title="Закрытие" value={displayCompletion} suffix="%" metric="completionRate" trend={summary?.trends?.completionRate.direction} delta={summary?.trends?.completionRate.delta} loading={loading} />
      <KpiCard title="Cycle Time" value={displayCycle} suffix="ч" metric="avgCycleTimeHours" trend={summary?.trends?.cycleTime.direction} delta={summary?.trends?.cycleTime.delta} loading={loading} />
      <KpiCard title="Списано часов" value={report?.totalSpentHours ?? null} suffix="ч" metric="totalSpentHours" trend={summary?.trends?.spentHours.direction} delta={summary?.trends?.spentHours.delta} loading={loading} />
    </div>
  );
}
