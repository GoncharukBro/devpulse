import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, FolderKanban, Users } from 'lucide-react';
import { aggregatedReportsApi } from '@/api/endpoints/aggregated-reports';
import ReportStatusBadge from '@/components/reports/ReportStatusBadge';
import PeriodKpiCards from '@/components/reports/PeriodKpiCards';
import PeriodWeeklyChart from '@/components/reports/PeriodWeeklyChart';
import PeriodLlmSummary from '@/components/reports/PeriodLlmSummary';
import Card from '@/components/ui/Card';
import type { AggregatedReportDTO } from '@/types/aggregated-report';
import type { ScoreTrend } from '@/types/reports';

const typeIcons: Record<string, React.ElementType> = {
  employee: User,
  project: FolderKanban,
  team: Users,
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

function TrendArrow({ trend }: { trend: ScoreTrend }) {
  if (!trend) return <span className="text-gray-400">—</span>;
  if (trend === 'up') return <span className="text-emerald-500">↑</span>;
  if (trend === 'down') return <span className="text-red-500">↓</span>;
  return <span className="text-gray-400">→</span>;
}

export default function AggregatedReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<AggregatedReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        const data = await aggregatedReportsApi.getById(id);
        setReport(data);
        setLoading(false);
      } catch {
        setError('Отчёт не найден');
        setLoading(false);
      }
    };

    load();
  }, [id]);

  // Polling while generating
  useEffect(() => {
    if (report?.status === 'generating' && id) {
      pollingRef.current = setInterval(async () => {
        try {
          const updated = await aggregatedReportsApi.getById(id);
          setReport(updated);
          if (updated.status !== 'generating' && pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } catch {
          // ignore
        }
      }, 5000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [report?.status, id]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700/50" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 rounded-lg bg-gray-100 dark:bg-surface-lighter" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">{error ?? 'Отчёт не найден'}</p>
        <button
          type="button"
          onClick={() => navigate('/reports')}
          className="mt-4 text-sm text-brand-400 hover:text-brand-300"
        >
          ← Вернуться к списку
        </button>
      </div>
    );
  }

  const Icon = typeIcons[report.type] ?? User;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <button
        type="button"
        onClick={() => navigate('/reports')}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
      >
        <ArrowLeft size={14} />
        Отчёты
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
            <Icon size={20} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{report.targetName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatDate(report.periodStart)} — {formatDate(report.periodEnd)} · {report.weeksCount} нед.
            </p>
          </div>
        </div>
        <ReportStatusBadge status={report.status} />
      </div>

      {/* KPI Cards */}
      <PeriodKpiCards metrics={report.aggregatedMetrics} overallTrend={report.overallTrend} />

      {/* Charts */}
      <PeriodWeeklyChart weeklyData={report.weeklyData} />

      {/* Employees table (project/team) */}
      {report.employeesData && report.employeesData.length > 0 && (
        <Card>
          <h4 className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-300">Сотрудники</h4>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-surface-border">
                  <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Имя</th>
                  <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Score</th>
                  <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Загрузка</th>
                  <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Закрытие</th>
                  <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Задачи</th>
                  <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Тренд</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-surface-border">
                {report.employeesData.map((emp) => (
                  <tr key={emp.youtrackLogin}>
                    <td className="py-2 text-sm font-medium text-gray-900 dark:text-gray-100">{emp.displayName}</td>
                    <td className="py-2 text-center text-sm text-gray-600 dark:text-gray-300">{emp.avgScore !== null ? Math.round(emp.avgScore) : '—'}</td>
                    <td className="py-2 text-center text-sm text-gray-600 dark:text-gray-300">{emp.avgUtilization !== null ? `${Math.round(emp.avgUtilization)}%` : '—'}</td>
                    <td className="py-2 text-center text-sm text-gray-600 dark:text-gray-300">{emp.avgCompletionRate !== null ? `${Math.round(emp.avgCompletionRate)}%` : '—'}</td>
                    <td className="py-2 text-center text-sm text-gray-600 dark:text-gray-300">{emp.completedIssues}/{emp.totalIssues}</td>
                    <td className="py-2 text-center"><TrendArrow trend={emp.scoreTrend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* LLM Summary */}
      <PeriodLlmSummary
        llmPeriodScore={report.llmPeriodScore}
        llmPeriodSummary={report.llmPeriodSummary}
        llmPeriodConcerns={report.llmPeriodConcerns}
        llmPeriodRecommendations={report.llmPeriodRecommendations}
        weeklyLlmSummaries={report.weeklyLlmSummaries}
        status={report.status}
      />

      {/* Error message */}
      {report.errorMessage && (
        <Card>
          <p className="text-sm text-red-500 dark:text-red-400">Ошибка: {report.errorMessage}</p>
        </Card>
      )}
    </div>
  );
}
