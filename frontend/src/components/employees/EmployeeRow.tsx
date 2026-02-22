import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import ScoreBadge from '@/components/metrics/ScoreBadge';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';
import type { ProjectEmployeeRow } from '@/types/reports';

interface EmployeeRowProps {
  employee: ProjectEmployeeRow;
}

function MetricCell({ metric, value, suffix = '%' }: { metric: string; value: number | null; suffix?: string }) {
  const level = getMetricLevel(metric, value);
  const colors = LEVEL_COLORS[level];
  return (
    <td className="px-3 py-3 text-sm">
      <span className={colors.text}>
        {value !== null ? `${value.toFixed(1)}${suffix}` : 'Н/Д'}
      </span>
    </td>
  );
}

export default function EmployeeRow({ employee }: EmployeeRowProps) {
  const navigate = useNavigate();
  const hasConcerns = employee.llmConcerns && employee.llmConcerns.length > 0;

  return (
    <tr
      onClick={() => navigate(`/employees/${employee.youtrackLogin}`)}
      className="cursor-pointer border-b border-gray-200 dark:border-surface-border transition-colors hover:bg-gray-100/50 dark:hover:bg-surface-lighter/50 last:border-b-0"
    >
      <td className="px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-200">
        {employee.displayName}
      </td>
      <td className="px-3 py-3">
        <ScoreBadge score={employee.score} />
      </td>
      <MetricCell metric="utilization" value={employee.utilization} />
      <MetricCell metric="estimationAccuracy" value={employee.estimationAccuracy} />
      <td className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
        {employee.completedIssues}/{employee.totalIssues}
      </td>
      <td className="px-3 py-3">
        <TrendIndicator trend={employee.scoreTrend} />
      </td>
      <td className="px-3 py-3">
        {hasConcerns && (
          <AlertCircle size={16} className="text-amber-400" />
        )}
      </td>
    </tr>
  );
}
