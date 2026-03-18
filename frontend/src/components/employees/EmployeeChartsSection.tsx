import Card from '@/components/ui/Card';
import WeeklyChart from '@/components/metrics/WeeklyChart';
import InfoTooltip from '@/components/metrics/InfoTooltip';
import PeriodFilter from '@/components/shared/PeriodFilter';
import type { EmployeeHistoryDTO } from '@/types/reports';

interface EmployeeChartsSectionProps {
  history: EmployeeHistoryDTO | null;
  weeks: number;
  onWeeksChange: (weeks: number) => void;
}

const CHART_METRICS = [
  { key: 'score', label: 'Score', color: '#6366f1' },
  { key: 'utilization', label: 'Загрузка', color: '#10b981' },
];

export default function EmployeeChartsSection({
  history,
  weeks,
  onWeeksChange,
}: EmployeeChartsSectionProps) {
  return (
    <div className="mb-6">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Динамика по неделям</h3>
            <InfoTooltip
              title="Динамика по неделям"
              lines={[
                'График изменения Score и загрузки сотрудника за каждую неделю.',
                'Фиолетовая линия — Score (LLM-оценка).\nЗелёная линия — загрузка (% от 40-часовой недели).',
                'Позволяет отследить индивидуальный тренд продуктивности.',
              ]}
            />
          </div>
          <PeriodFilter value={weeks} onChange={onWeeksChange} />
        </div>
        {history ? (
          <WeeklyChart data={history.weeks} metrics={CHART_METRICS} />
        ) : (
          <div className="flex h-[280px] items-center justify-center">
            <div className="h-full w-full animate-pulse rounded bg-gray-200/70 dark:bg-gray-700/30" />
          </div>
        )}
      </Card>
    </div>
  );
}
