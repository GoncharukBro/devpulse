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
import InfoTooltip from '@/components/metrics/InfoTooltip';
import EmployeeTable from '@/components/employees/EmployeeTable';
import CopyButton from '@/components/shared/CopyButton';
import PeriodFilter from '@/components/shared/PeriodFilter';
import EmailReportModal from '@/components/shared/EmailReportModal';
import Button from '@/components/ui/Button';
import MethodologyLink from '@/components/shared/MethodologyLink';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatMetric, formatPeriod } from '@/utils/format';
import { reportsApi } from '@/api/endpoints/reports';
import type { ProjectSummaryDTO, ProjectHistoryDTO } from '@/types/reports';

function pluralEmployees(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} сотрудников`;
  if (mod10 === 1) return `${n} сотрудник`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} сотрудника`;
  return `${n} сотрудников`;
}

function deduplicateRecommendations(recs: string[]): string[] {
  const normalized = recs.map((r) => ({
    original: r,
    clean: r.toLowerCase().replace(/[.,;:!?()«»"'\u2014\u2013-]/g, '').trim(),
  }));

  const result: typeof normalized = [];
  for (const item of normalized) {
    const isDuplicate = result.some(
      (existing) =>
        existing.clean.includes(item.clean) || item.clean.includes(existing.clean),
    );
    if (isDuplicate) {
      // If current is longer — replace the shorter one
      const shorterIndex = result.findIndex((existing) => item.clean.includes(existing.clean));
      if (shorterIndex !== -1 && item.original.length > result[shorterIndex].original.length) {
        result[shorterIndex] = item;
      }
    } else {
      result.push(item);
    }
  }

  return result.map((r) => r.original);
}

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
          description="Метрики команды, тренды по неделям и рекомендации по проекту"
          backLink={{ to: '/projects', label: 'Проекты' }}
        />
        <Card>
          <div className="py-8 text-center">
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Не удалось загрузить данные</p>
            <Button variant="primary" size="sm" onClick={loadSummary}>
              Повторить
            </Button>
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
          description="Метрики команды, тренды по неделям и рекомендации по проекту"
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
      `Списано часов: ${formatMetric(summary.totalSpentHours, 'ч')}`,
    ];
    if (summary.aggregatedRecommendations.length) {
      lines.push('', 'Рекомендации:');
      deduplicateRecommendations(summary.aggregatedRecommendations).forEach((r) => lines.push(`- ${r}`));
    }
    return lines.join('\n');
  }

  const chartMetrics = [
    { key: 'avgScore', label: 'Score', color: '#6366f1' },
    { key: 'avgUtilization', label: 'Загрузка', color: '#10b981' },
  ];

  const metaLine = summary
    ? [
        pluralEmployees(summary.totalEmployees),
        summary.lastPeriodStart && summary.lastPeriodEnd
          ? `Показатели за неделю: ${formatPeriod(summary.lastPeriodStart, summary.lastPeriodEnd)}`
          : null,
      ].filter(Boolean).join(' · ')
    : null;

  const pageDescription = (
    <>
      Метрики команды, тренды по неделям и рекомендации по проекту
      {metaLine && (
        <span className="mt-0.5 block text-xs text-gray-400 dark:text-gray-500">{metaLine}</span>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={summary?.projectName ?? 'Загрузка...'}
        description={pageDescription}
        backLink={{ to: '/projects', label: 'Проекты' }}
        topRight={<MethodologyLink />}
        actions={
          summary ? (
            <div className="flex items-center gap-2">
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
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Score"
          value={summary?.avgScore ?? null}
          metric="score"
          trend={summary?.trends?.score.direction}
          delta={summary?.trends?.score.delta}
          loading={loading}
        />
        <KpiCard
          title="Загрузка"
          value={summary?.avgUtilization ?? null}
          suffix="%"
          metric="utilization"
          trend={summary?.trends?.utilization.direction}
          delta={summary?.trends?.utilization.delta}
          loading={loading}
        />
        <KpiCard
          title="Точность"
          value={summary?.avgEstimationAccuracy ?? null}
          suffix="%"
          metric="estimationAccuracy"
          trend={summary?.trends?.estimationAccuracy.direction}
          delta={summary?.trends?.estimationAccuracy.delta}
          loading={loading}
        />
        <KpiCard
          title="Закрытие"
          value={summary?.avgCompletionRate ?? null}
          suffix="%"
          metric="completionRate"
          trend={summary?.trends?.completionRate.direction}
          delta={summary?.trends?.completionRate.delta}
          loading={loading}
        />
        <KpiCard
          title="Cycle Time"
          value={summary?.avgCycleTimeHours ?? null}
          suffix="ч"
          metric="avgCycleTimeHours"
          trend={summary?.trends?.cycleTime.direction}
          delta={summary?.trends?.cycleTime.delta}
          loading={loading}
        />
        <KpiCard
          title="Списано часов"
          value={summary?.totalSpentHours ?? null}
          suffix="ч"
          metric="totalSpentHours"
          trend={summary?.trends?.spentHours.direction}
          delta={summary?.trends?.spentHours.delta}
          loading={loading}
        />
      </div>

      {/* Chart */}
      <div className="mb-6">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Динамика по неделям</h3>
              <InfoTooltip
                title="Динамика по неделям"
                lines={[
                  'График изменения среднего Score и загрузки по проекту за каждую неделю.',
                  'Фиолетовая линия — средний Score за неделю.\nЗелёная линия — средняя загрузка.',
                  'Позволяет отследить тренд продуктивности команды проекта.',
                ]}
              />
            </div>
            <PeriodFilter value={weeks} onChange={setWeeks} />
          </div>
          {history ? (
            <WeeklyChart data={history.weeks} metrics={chartMetrics} />
          ) : (
            <div className="flex h-[280px] items-center justify-center">
              <div className="h-full w-full animate-pulse rounded bg-gray-200/70 dark:bg-gray-700/30" />
            </div>
          )}
        </Card>
      </div>

      {/* Concerns */}
      <div className="mb-6">
        <ConcernsList concerns={summary?.concerns ?? []} loading={loading} />
      </div>

      {/* LLM Recommendations */}
      {summary && summary.aggregatedRecommendations.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <Lightbulb size={16} className="text-blue-400" />
              <h3 className="text-sm font-medium">LLM-рекомендации по проекту</h3>
              <InfoTooltip
                title="LLM-рекомендации"
                lines={[
                  'Агрегированные рекомендации от LLM-анализа по всем сотрудникам проекта.',
                  'Формируются автоматически на основе метрик и выявленных паттернов.',
                  'Помогают руководителю обратить внимание на ключевые зоны роста команды.',
                ]}
              />
            </div>
            <CopyButton
              getText={() =>
                deduplicateRecommendations(summary.aggregatedRecommendations)
                  .map((r, i) => `${i + 1}. ${r}`)
                  .join('\n')
              }
            />
          </div>
          <ul className="mt-3 space-y-1.5">
            {deduplicateRecommendations(summary.aggregatedRecommendations).map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                <span className="mt-1 text-gray-400 dark:text-gray-500">&bull;</span>
                {rec}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Employee Table */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Сотрудники</h3>
          <InfoTooltip
            title="Сотрудники проекта"
            lines={[
              'Таблица с текущими метриками каждого сотрудника проекта.',
              'Score — оценка продуктивности, Загрузка — процент от 40-часовой недели.',
              'Нажмите на строку для перехода к детальному профилю.',
            ]}
          />
        </div>
        <EmployeeTable
          employees={summary?.employees ?? []}
          loading={loading}
          navState={{ from: 'project', id: id!, name: summary?.projectName ?? '' }}
        />
      </div>

      <EmailReportModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        type="project"
        subscriptionId={id}
      />
    </>
  );
}
