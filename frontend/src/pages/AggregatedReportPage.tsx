import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, User, FolderKanban, Users, HelpCircle, Mail } from 'lucide-react';
import { aggregatedReportsApi } from '@/api/endpoints/aggregated-reports';
import ReportStatusBadge from '@/components/reports/ReportStatusBadge';
import PeriodKpiCards from '@/components/reports/PeriodKpiCards';
import PeriodWeeklyChart from '@/components/reports/PeriodWeeklyChart';
import PeriodLlmSummary from '@/components/reports/PeriodLlmSummary';
import CopyButton from '@/components/shared/CopyButton';
import AggregatedEmailModal from '@/components/shared/AggregatedEmailModal';
import Button from '@/components/ui/Button';
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
  const [emailModalOpen, setEmailModalOpen] = useState(false);
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

  // Polling while generating/collecting/analyzing
  useEffect(() => {
    const isInProgress = report?.status === 'generating'
      || report?.status === 'collecting'
      || report?.status === 'analyzing';
    if (isInProgress && id) {
      pollingRef.current = setInterval(async () => {
        try {
          const updated = await aggregatedReportsApi.getById(id);
          setReport(updated);
          const stillInProgress = updated.status === 'generating'
            || updated.status === 'collecting'
            || updated.status === 'analyzing';
          if (!stillInProgress && pollingRef.current) {
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

  function getCopyText() {
    if (!report) return '';
    const m = report.aggregatedMetrics;
    const lines = [
      `${report.type === 'employee' ? 'Сотрудник' : report.type === 'project' ? 'Проект' : 'Команда'}: ${report.targetName}`,
      `Период: ${formatDate(report.periodStart)} — ${formatDate(report.periodEnd)} (${report.weeksCount} нед.)`,
      '',
      `Score: ${m.avgScore !== null ? Math.round(m.avgScore) : '—'}`,
      `Загрузка: ${m.avgUtilization !== null ? Math.round(m.avgUtilization) + '%' : '—'}`,
      `Точность оценок: ${m.avgEstimationAccuracy !== null ? Math.round(m.avgEstimationAccuracy) + '%' : '—'}`,
      `Закрытие: ${m.avgCompletionRate !== null ? Math.round(m.avgCompletionRate) + '%' : '—'}`,
      `Задачи: ${m.completedIssues}/${m.totalIssues}`,
      `Списано часов: ${m.totalSpentHours !== null ? Math.round(m.totalSpentHours) : '—'}`,
    ];
    if (report.llmPeriodSummary) {
      lines.push('', 'Резюме:', report.llmPeriodSummary);
    }
    if (report.llmPeriodRecommendations?.length) {
      lines.push('', 'Рекомендации:');
      report.llmPeriodRecommendations.forEach((r) => lines.push(`- ${r}`));
    }
    return lines.join('\n');
  }

  const Icon = typeIcons[report.type] ?? User;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/reports')}
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
        >
          <ArrowLeft size={14} />
          Отчёты
        </button>
        <Link
          to="/methodology#aggregated-reports"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          <HelpCircle className="h-4 w-4" />
          Как это работает?
        </Link>
      </div>

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
        <div className="flex items-center gap-2">
          {report.status === 'ready' && (
            <>
              <CopyButton getText={getCopyText} />
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Mail size={14} />}
                onClick={() => setEmailModalOpen(true)}
              >
                На почту
              </Button>
            </>
          )}
          <ReportStatusBadge status={report.status} />
        </div>
      </div>

      {/* Progress bar */}
      {report.progress && (
        <div className="mb-6 rounded-lg border border-gray-200 dark:border-surface-border p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {report.progress.phase === 'collecting' ? 'Сбор данных с YouTrack' : 'LLM-анализ'}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {report.progress.completed}/{report.progress.total}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-surface-lighter">
            <div
              className="h-2 rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: `${report.progress.total > 0 ? Math.round((report.progress.completed / report.progress.total) * 100) : 0}%` }}
            />
          </div>
          {report.progress.currentStep && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{report.progress.currentStep}</p>
          )}
        </div>
      )}

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

      {/* Per-employee LLM analysis cards */}
      {report.employeesData?.some((e: any) => e.llmScore != null) && (
        <div className="mt-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Анализ по сотрудникам
          </h3>
          <div className="space-y-3">
            {(report.employeesData as any[])
              .filter((e) => e.llmScore != null)
              .map((e) => (
                <div
                  key={e.youtrackLogin + (e.projectName ?? '')}
                  className="rounded-lg border border-gray-200 dark:border-surface-border p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {e.displayName}
                      </span>
                      {e.projectName && e.projectName !== 'Итого' && (
                        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                          ({e.projectName})
                        </span>
                      )}
                      {e.projectName === 'Итого' && (
                        <span className="ml-2 rounded bg-gray-100 dark:bg-surface-lighter px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                          Итого
                        </span>
                      )}
                    </div>
                    <span className="text-lg font-bold text-brand-500">{e.llmScore}</span>
                  </div>
                  {e.llmSummary && (
                    <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{e.llmSummary}</p>
                  )}
                  {e.llmConcerns?.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-red-600 dark:text-red-400">Проблемы: </span>
                      <span className="text-gray-600 dark:text-gray-300">{e.llmConcerns.join('; ')}</span>
                    </div>
                  )}
                  {e.llmRecommendations?.length > 0 && (
                    <div className="mt-1 text-sm">
                      <span className="font-medium text-blue-600 dark:text-blue-400">Рекомендации: </span>
                      <span className="text-gray-600 dark:text-gray-300">{e.llmRecommendations.join('; ')}</span>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
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

      {id && (
        <AggregatedEmailModal
          open={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          reportId={id}
        />
      )}
    </div>
  );
}
