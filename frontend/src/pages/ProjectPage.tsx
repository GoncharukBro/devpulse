import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FolderKanban, Lightbulb, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import KpiCard from '@/components/metrics/KpiCard';
import WeeklyChart from '@/components/metrics/WeeklyChart';
import ConcernsList from '@/components/metrics/ConcernsList';
import EmployeeTable from '@/components/employees/EmployeeTable';
import CopyButton from '@/components/shared/CopyButton';
import PeriodFilter from '@/components/shared/PeriodFilter';
import EmailReportModal from '@/components/shared/EmailReportModal';
import Button from '@/components/ui/Button';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatMetric } from '@/utils/format';
import { reportsApi } from '@/api/endpoints/reports';
import type { ProjectSummaryDTO, ProjectHistoryDTO } from '@/types/reports';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<ProjectSummaryDTO | null>(null);
  const [history, setHistory] = useState<ProjectHistoryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [weeks, setWeeks] = useState(12);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  usePageTitle(summary?.projectName ?? 'Проект');

  const loadSummary = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(false);
      const result = await reportsApi.getProjectSummary(id);
      setSummary(result);
    } catch {
      setError(true);
      toast.error('Не удалось загрузить данные проекта');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadHistory = useCallback(async () => {
    if (!id) return;
    try {
      const result = await reportsApi.getProjectHistory(id, { weeks });
      setHistory(result);
    } catch {
      // History is non-critical
    }
  }, [id, weeks]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  if (!loading && error) {
    return (
      <>
        <PageHeader
          title="Проект"
          description="Динамика и метрики проекта"
          backLink={{ to: '/projects', label: 'Проекты' }}
        />
        <Card>
          <div className="py-8 text-center">
            <p className="mb-4 text-sm text-gray-400">Не удалось загрузить данные</p>
            <button
              onClick={loadSummary}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              Повторить
            </button>
          </div>
        </Card>
      </>
    );
  }

  if (!loading && !summary) {
    return (
      <>
        <PageHeader
          title="Проект"
          description="Динамика и метрики проекта"
          backLink={{ to: '/projects', label: 'Проекты' }}
        />
        <EmptyState
          icon={FolderKanban}
          title="Проект не найден"
          description="Информация по проекту ещё не загружена или проект не существует"
          action={{ label: 'Вернуться к проектам', to: '/projects' }}
        />
      </>
    );
  }

  function getCopyText() {
    if (!summary) return '';
    const lines = [
      `Проект: ${summary.projectName}`,
      '',
      `Score: ${formatMetric(summary.avgScore)}`,
      `Загрузка: ${formatMetric(summary.avgUtilization, '%')}`,
      `Точность оценок: ${formatMetric(summary.avgEstimationAccuracy, '%')}`,
      `Закрытие: ${formatMetric(summary.avgCompletionRate, '%')}`,
      `Cycle Time: ${formatMetric(summary.avgCycleTimeHours, 'ч')}`,
      `Сотрудников: ${summary.totalEmployees}`,
    ];
    if (summary.aggregatedRecommendations.length) {
      lines.push('', 'Рекомендации:');
      summary.aggregatedRecommendations.forEach((r) => lines.push(`- ${r}`));
    }
    return lines.join('\n');
  }

  const chartMetrics = [
    { key: 'avgScore', label: 'Score', color: '#6366f1' },
    { key: 'avgUtilization', label: 'Загрузка', color: '#10b981' },
  ];

  return (
    <>
      <PageHeader
        title={summary?.projectName ?? 'Загрузка...'}
        description="Динамика и метрики проекта"
        backLink={{ to: '/projects', label: 'Проекты' }}
        actions={
          summary ? (
            <div className="flex gap-2">
              <CopyButton getText={getCopyText} />
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Mail size={14} />}
                onClick={() => setEmailModalOpen(true)}
              >
                На почту
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          title="Score"
          value={summary?.avgScore ?? null}
          metric="score"
          trend={summary?.scoreTrend}
          loading={loading}
        />
        <KpiCard
          title="Загрузка"
          value={summary?.avgUtilization ?? null}
          suffix="%"
          metric="utilization"
          loading={loading}
        />
        <KpiCard
          title="Точность"
          value={summary?.avgEstimationAccuracy ?? null}
          suffix="%"
          metric="estimationAccuracy"
          loading={loading}
        />
        <KpiCard
          title="Закрытие"
          value={summary?.avgCompletionRate ?? null}
          suffix="%"
          metric="completionRate"
          loading={loading}
        />
        <KpiCard
          title="Cycle Time"
          value={summary?.avgCycleTimeHours ?? null}
          suffix="ч"
          metric="avgCycleTimeHours"
          loading={loading}
        />
        {loading ? (
          <KpiCard title="" value={null} metric="score" loading />
        ) : (
          <Card className="animate-slide-up">
            <div className="text-sm text-gray-400">Сотрудников</div>
            <div className="mt-2 text-2xl font-bold text-gray-100">{summary?.totalEmployees ?? 0}</div>
          </Card>
        )}
      </div>

      {/* Chart + Concerns */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">Динамика по неделям</h3>
              <PeriodFilter value={weeks} onChange={setWeeks} />
            </div>
            {history ? (
              <WeeklyChart data={history.weeks} metrics={chartMetrics} />
            ) : (
              <div className="flex h-[280px] items-center justify-center">
                <div className="h-full w-full animate-pulse rounded bg-gray-700/30" />
              </div>
            )}
          </Card>
        </div>
        <div>
          <ConcernsList concerns={summary?.concerns ?? []} loading={loading} />
        </div>
      </div>

      {/* Employee Table */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-gray-300">Сотрудники</h3>
        <EmployeeTable employees={summary?.employees ?? []} loading={loading} />
      </div>

      {/* LLM Recommendations */}
      {summary && summary.aggregatedRecommendations.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 text-gray-300">
            <Lightbulb size={16} className="text-blue-400" />
            <h3 className="text-sm font-medium">LLM-рекомендации по проекту</h3>
          </div>
          <ul className="mt-3 space-y-1.5">
            {summary.aggregatedRecommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="mt-1 text-gray-500">&bull;</span>
                {rec}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <EmailReportModal open={emailModalOpen} onClose={() => setEmailModalOpen(false)} />
    </>
  );
}
