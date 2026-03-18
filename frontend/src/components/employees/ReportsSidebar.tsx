import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';
import { formatDateShort, formatMetric } from '@/utils/format';
import type { EmployeeReportListItem, PaginatedEmployeeReports } from '@/types/reports';

interface ReportsSidebarProps {
  reportsList: PaginatedEmployeeReports | null;
  activeSubscriptionId: string | undefined;
  activePeriodStart: string | undefined;
  onSelectReport: (subscriptionId: string, periodStart: string) => void;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
}

function getScoreTrend(
  reports: EmployeeReportListItem[],
  index: number,
): { direction: 'up' | 'down' | 'stable'; delta: number } | null {
  // reports are sorted newest-first from API; next index = older report
  const current = reports[index];
  const prev = reports[index + 1];
  if (!prev || current.score == null || prev.score == null) return null;

  const delta = Math.round((current.score - prev.score) * 10) / 10;
  if (delta > 0) return { direction: 'up', delta };
  if (delta < 0) return { direction: 'down', delta };
  return { direction: 'stable', delta: 0 };
}

function TrendIndicator({ direction, delta }: { direction: 'up' | 'down' | 'stable'; delta: number }) {
  if (direction === 'up') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-emerald-400">
        <TrendingUp size={12} />
        +{Math.abs(delta)}
      </span>
    );
  }
  if (direction === 'down') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
        <TrendingDown size={12} />
        {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
      <Minus size={12} />
    </span>
  );
}

export default function ReportsSidebar({
  reportsList,
  activeSubscriptionId,
  activePeriodStart,
  onSelectReport,
  loading,
  page,
  onPageChange,
}: ReportsSidebarProps) {
  if (!reportsList || reportsList.data.length === 0) {
    return (
      <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-border dark:bg-surface" style={{ maxHeight: 'calc(100vh - 120px)' }}>
        <h3 className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-300">Отчёты</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {loading ? 'Загрузка...' : 'Нет отчётов'}
        </p>
      </div>
    );
  }

  const { data: reports, total, limit } = reportsList;
  const hasMore = page * limit < total;
  const hasPrev = page > 1;

  return (
    <div
      className="sticky top-6 flex flex-col rounded-xl border border-gray-200 bg-white dark:border-surface-border dark:bg-surface"
      style={{ maxHeight: 'calc(100vh - 120px)' }}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-surface-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Отчёты</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">{total}</span>
        </div>
      </div>

      {/* Scrollable report list */}
      <div className="flex-1 overflow-y-auto">
        {reports.map((item, i) => {
          const isActive =
            activeSubscriptionId === item.subscriptionId &&
            activePeriodStart === item.periodStart;
          const scoreLevel = getMetricLevel('score', item.score);
          const scoreColors = LEVEL_COLORS[scoreLevel];
          const trend = getScoreTrend(reports, i);

          return (
            <button
              key={`${item.subscriptionId}-${item.periodStart}`}
              onClick={() => onSelectReport(item.subscriptionId, item.periodStart)}
              className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 dark:border-surface-border ${
                isActive
                  ? 'border-l-2 border-l-brand-500 bg-brand-500/5'
                  : 'hover:bg-gray-50 dark:hover:bg-surface-lighter/50'
              }`}
            >
              {/* Row 1: period + trend */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {formatDateShort(item.periodStart)} — {formatDateShort(item.periodEnd)}
                </span>
                {trend && <TrendIndicator direction={trend.direction} delta={trend.delta} />}
              </div>

              {/* Row 2: project */}
              <div className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
                {item.projectName}
              </div>

              {/* Row 3: score + utilization + completed */}
              <div className="mt-1 flex items-center gap-3 text-xs">
                <span className={`font-medium ${scoreColors.text}`}>
                  {formatMetric(item.score)}
                </span>
                <span className="text-gray-400 dark:text-gray-500">
                  {formatMetric(item.utilization, '%')}
                </span>
                <span className="text-gray-400 dark:text-gray-500">
                  {item.completedIssues}/{item.totalIssues}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pagination */}
      {(hasPrev || hasMore) && (
        <div className="shrink-0 flex items-center justify-between border-t border-gray-200 px-4 py-2 dark:border-surface-border">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrev}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Новее
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={!hasMore}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Старше →
          </button>
        </div>
      )}
    </div>
  );
}
