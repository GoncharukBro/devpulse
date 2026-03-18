import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';
import { formatDateShort, formatMetric } from '@/utils/format';
import type { PaginatedEmployeeReports } from '@/types/reports';

interface ReportSelectorProps {
  reportsList: PaginatedEmployeeReports | null;
  activeSubscriptionId: string | undefined;
  activePeriodStart: string | undefined;
  onSelectReport: (subscriptionId: string, periodStart: string) => void;
}

export default function ReportSelector({
  reportsList,
  activeSubscriptionId,
  activePeriodStart,
  onSelectReport,
}: ReportSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!reportsList || reportsList.data.length === 0) return null;

  const reports = reportsList.data;
  const activeIndex = reports.findIndex(
    (r) => r.subscriptionId === activeSubscriptionId && r.periodStart === activePeriodStart,
  );
  const current = activeIndex >= 0 ? reports[activeIndex] : null;

  // prev = newer (lower index), next = older (higher index)
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < reports.length - 1;

  function goPrev() {
    if (hasPrev) {
      const r = reports[activeIndex - 1];
      onSelectReport(r.subscriptionId, r.periodStart);
    }
  }

  function goNext() {
    if (hasNext) {
      const r = reports[activeIndex + 1];
      onSelectReport(r.subscriptionId, r.periodStart);
    }
  }

  const scoreLevel = current ? getMetricLevel('score', current.score) : 'neutral';
  const scoreColors = LEVEL_COLORS[scoreLevel];

  return (
    <div ref={ref} className="relative mb-4">
      <div className="flex items-center gap-1">
        {/* Prev button */}
        <button
          onClick={goPrev}
          disabled={!hasPrev}
          className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-surface-lighter"
          aria-label="Предыдущий отчёт"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Current report display / dropdown trigger */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:border-surface-border dark:bg-surface dark:hover:bg-surface-lighter"
        >
          {current ? (
            <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {formatDateShort(current.periodStart)} — {formatDateShort(current.periodEnd)}
              </span>
              <span className="hidden truncate text-gray-400 sm:inline dark:text-gray-500">
                {current.projectName}
              </span>
              <span className={`font-medium ${scoreColors.text}`}>
                {formatMetric(current.score)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-500">Выберите отчёт</span>
          )}
          <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Next button */}
        <button
          onClick={goNext}
          disabled={!hasNext}
          className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-surface-lighter"
          aria-label="Следующий отчёт"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-surface-border dark:bg-surface">
          {reports.map((item) => {
            const isActive =
              activeSubscriptionId === item.subscriptionId &&
              activePeriodStart === item.periodStart;
            const level = getMetricLevel('score', item.score);
            const colors = LEVEL_COLORS[level];

            return (
              <button
                key={`${item.subscriptionId}-${item.periodStart}`}
                onClick={() => {
                  onSelectReport(item.subscriptionId, item.periodStart);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-500/5 text-brand-400'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-surface-lighter'
                }`}
              >
                <span className="font-medium">
                  {formatDateShort(item.periodStart)} — {formatDateShort(item.periodEnd)}
                </span>
                <span className="truncate text-gray-400 dark:text-gray-500">{item.projectName}</span>
                <span className={`ml-auto font-medium ${colors.text}`}>
                  {formatMetric(item.score)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
