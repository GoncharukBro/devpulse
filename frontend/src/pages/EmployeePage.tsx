import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Users, Mail, Award, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import KpiCard from '@/components/metrics/KpiCard';
import ScoreBadge from '@/components/metrics/ScoreBadge';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import WeeklyChart from '@/components/metrics/WeeklyChart';
import IssuesByTypeChart from '@/components/metrics/IssuesByTypeChart';
import SpentByTypeChart from '@/components/metrics/SpentByTypeChart';
import LlmSummaryBlock from '@/components/employees/LlmSummaryBlock';
import CopyButton from '@/components/shared/CopyButton';
import PeriodFilter from '@/components/shared/PeriodFilter';
import StatusBadge from '@/components/shared/StatusBadge';
import Button from '@/components/ui/Button';
import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';
import { reportsApi } from '@/api/endpoints/reports';
import type {
  EmployeeSummaryDTO,
  EmployeeHistoryDTO,
  EmployeeReportDTO,
  PaginatedEmployeeReports,
  EmployeeReportListItem,
} from '@/types/reports';

export default function EmployeePage() {
  const { login } = useParams<{ login: string }>();

  const [summary, setSummary] = useState<EmployeeSummaryDTO | null>(null);
  const [history, setHistory] = useState<EmployeeHistoryDTO | null>(null);
  const [report, setReport] = useState<EmployeeReportDTO | null>(null);
  const [reportsList, setReportsList] = useState<PaginatedEmployeeReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(12);
  const [reportsPage, setReportsPage] = useState(1);

  // Load summary
  const loadSummary = useCallback(async () => {
    if (!login) return;
    try {
      setLoading(true);
      setError(false);
      const result = await reportsApi.getEmployeeSummary(login);
      setSummary(result);
    } catch {
      setError(true);
      toast.error('Не удалось загрузить данные сотрудника');
    } finally {
      setLoading(false);
    }
  }, [login]);

  // Load history
  const loadHistory = useCallback(async () => {
    if (!login) return;
    try {
      const params: { subscriptionId?: string; weeks?: number } = { weeks };
      if (selectedProject) params.subscriptionId = selectedProject;
      const result = await reportsApi.getEmployeeHistory(login, params);
      setHistory(result);
    } catch {
      // Non-critical
    }
  }, [login, selectedProject, weeks]);

  // Load report for selected project
  const loadReport = useCallback(async (subscriptionId: string, periodStart: string) => {
    if (!login) return;
    try {
      const result = await reportsApi.getEmployeeReport(login, { subscriptionId, periodStart });
      setReport(result);
    } catch {
      toast.error('Не удалось загрузить отчёт');
    }
  }, [login]);

  // Load reports list
  const loadReportsList = useCallback(async () => {
    if (!login) return;
    try {
      const params: { subscriptionId?: string; page?: number; limit?: number } = {
        page: reportsPage,
        limit: 10,
      };
      if (selectedProject) params.subscriptionId = selectedProject;
      const result = await reportsApi.getEmployeeReports(login, params);
      setReportsList(result);
    } catch {
      // Non-critical
    }
  }, [login, selectedProject, reportsPage]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { loadReportsList(); }, [loadReportsList]);

  // Auto-load the latest report when summary and project are available
  useEffect(() => {
    if (!summary || !summary.projects.length) return;
    const project = selectedProject
      ? summary.projects.find((p) => p.subscriptionId === selectedProject)
      : summary.projects[0];
    if (!project) return;

    // Find the latest period from history
    if (history && history.weeks.length > 0) {
      const latestWeek = history.weeks[history.weeks.length - 1];
      loadReport(project.subscriptionId, latestWeek.periodStart);
    }
  }, [summary, selectedProject, history, loadReport]);

  function handleReportRowClick(item: EmployeeReportListItem) {
    loadReport(item.subscriptionId, item.periodStart);
  }

  if (!loading && error) {
    return (
      <>
        <PageHeader title={login ?? 'Сотрудник'} description="Профиль и метрики сотрудника" />
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
        <PageHeader title={login ?? 'Сотрудник'} description="Профиль и метрики сотрудника" />
        <EmptyState
          icon={Users}
          title="Данные по сотруднику не найдены"
          description="Информация о сотруднике ещё не загружена или профиль не существует"
        />
      </>
    );
  }

  const displayScore = report?.score ?? summary?.avgScore ?? null;
  const displayTrend = summary?.scoreTrend ?? null;
  const displayUtilization = report?.utilization ?? summary?.avgUtilization ?? null;
  const displayEstimation = report?.estimationAccuracy ?? summary?.avgEstimationAccuracy ?? null;
  const displayFocus = report?.focus ?? summary?.avgFocus ?? null;
  const displayCompletion = report?.completionRate ?? null;
  const displayCycle = report?.avgCycleTimeHours ?? null;

  function getCopyText() {
    if (!summary) return '';
    const projectName = selectedProject
      ? summary.projects.find((p) => p.subscriptionId === selectedProject)?.projectName ?? ''
      : 'Все проекты';

    const period = report
      ? `${formatDate(report.periodStart)} — ${formatDate(report.periodEnd)}`
      : '';

    const lines = [
      `Отчёт: ${summary.displayName}${projectName ? ` (${projectName})` : ''}`,
      period ? `Период: ${period}` : '',
      '',
      `Score: ${displayScore !== null ? displayScore.toFixed(1) : 'Н/Д'}${displayTrend === 'up' ? ' (↑)' : displayTrend === 'down' ? ' (↓)' : ''}`,
      `Загрузка: ${displayUtilization !== null ? displayUtilization.toFixed(1) + '%' : 'Н/Д'} | Точность оценок: ${displayEstimation !== null ? displayEstimation.toFixed(1) + '%' : 'Н/Д'} | Фокус: ${displayFocus !== null ? displayFocus.toFixed(1) + '%' : 'Н/Д'}`,
    ];

    if (report) {
      lines.push(`Закрыто: ${report.completedIssues} из ${report.totalIssues} задач | Cycle Time: ${report.avgCycleTimeHours !== null ? report.avgCycleTimeHours.toFixed(1) + 'ч' : 'Н/Д'}`);
    }

    if (report?.llmSummary) {
      lines.push('', `Сводка: ${report.llmSummary}`);
    }
    if (report?.llmAchievements?.length) {
      lines.push('', 'Достижения:');
      report.llmAchievements.forEach((a) => lines.push(`- ${a}`));
    }
    if (report?.llmConcerns?.length) {
      lines.push('', 'На что обратить внимание:');
      report.llmConcerns.forEach((c) => lines.push(`- ${c}`));
    }

    return lines.filter(Boolean).join('\n');
  }

  const chartMetrics = [
    { key: 'score', label: 'Score', color: '#6366f1' },
    { key: 'utilization', label: 'Загрузка', color: '#10b981' },
  ];

  const initial = summary?.displayName?.charAt(0).toUpperCase() ?? '?';

  return (
    <>
      {/* Header with avatar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xl font-bold text-brand-400">
            {initial}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{summary?.displayName ?? 'Загрузка...'}</h1>
            <div className="mt-0.5 text-sm text-gray-400">
              {login}
              {summary?.email && <span> • {summary.email}</span>}
            </div>
            {summary && summary.projects.length > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                Проекты: {summary.projects.map((p) => p.projectName).join(', ')}
              </div>
            )}
            {summary && (
              <div className="mt-2 flex items-center gap-2">
                <ScoreBadge score={summary.avgScore} size="sm" />
                <TrendIndicator trend={summary.scoreTrend} />
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <CopyButton getText={getCopyText} />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Mail size={14} />}
            onClick={() => toast('Функция в разработке', { icon: '📧' })}
          >
            На почту
          </Button>
        </div>
      </div>

      {/* Project filter tabs */}
      {summary && summary.projects.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => { setSelectedProject(null); setReportsPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              !selectedProject
                ? 'bg-brand-500/20 text-brand-400'
                : 'text-gray-400 hover:bg-surface-lighter hover:text-gray-200'
            }`}
          >
            Все проекты
          </button>
          {summary.projects.map((p) => (
            <button
              key={p.subscriptionId}
              onClick={() => { setSelectedProject(p.subscriptionId); setReportsPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedProject === p.subscriptionId
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'text-gray-400 hover:bg-surface-lighter hover:text-gray-200'
              }`}
            >
              {p.projectShortName}
            </button>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Score" value={displayScore} metric="score" trend={displayTrend} loading={loading} />
        <KpiCard title="Загрузка" value={displayUtilization} suffix="%" metric="utilization" loading={loading} />
        <KpiCard title="Точность" value={displayEstimation} suffix="%" metric="estimationAccuracy" loading={loading} />
        <KpiCard title="Фокус" value={displayFocus} suffix="%" metric="focus" loading={loading} />
        <KpiCard title="Закрытие" value={displayCompletion} suffix="%" metric="completionRate" loading={loading} />
        <KpiCard title="Cycle Time" value={displayCycle} suffix="ч" metric="avgCycleTimeHours" loading={loading} />
      </div>

      {/* Chart + LLM Summary */}
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
          <LlmSummaryBlock
            summary={report?.llmSummary ?? null}
            achievements={report?.llmAchievements ?? null}
            concerns={report?.llmConcerns ?? null}
            recommendations={report?.llmRecommendations ?? null}
            isProcessing={report?.status === 'completed' && !report?.llmProcessedAt}
            loading={loading}
          />
        </div>
      </div>

      {/* Breakdowns */}
      {report && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-medium text-gray-300">Разбивка по типам задач</h3>
            <IssuesByTypeChart data={report.issuesByType} />
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-medium text-gray-300">Списание по типам</h3>
            <SpentByTypeChart data={report.spentByType} />
          </Card>
        </div>
      )}

      {/* Reports history table */}
      {reportsList && reportsList.data.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-gray-300">История отчётов</h3>
          <Card noPadding>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Период</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Проект</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Score</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Загрузка</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Закрыто</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsList.data.map((item, i) => {
                    const scoreLevel = getMetricLevel('score', item.score);
                    const scoreColors = LEVEL_COLORS[scoreLevel];
                    const utilLevel = getMetricLevel('utilization', item.utilization);
                    const utilColors = LEVEL_COLORS[utilLevel];
                    const isActive =
                      report?.subscriptionId === item.subscriptionId &&
                      report?.periodStart === item.periodStart;

                    return (
                      <tr
                        key={i}
                        onClick={() => handleReportRowClick(item)}
                        className={`cursor-pointer border-b border-surface-border transition-colors last:border-b-0 ${
                          isActive ? 'bg-brand-500/5' : 'hover:bg-surface-lighter/50'
                        }`}
                      >
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {formatDate(item.periodStart)} — {formatDate(item.periodEnd)}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-400">{item.projectName}</td>
                        <td className={`px-3 py-3 text-sm font-medium ${scoreColors.text}`}>
                          {item.score !== null ? item.score.toFixed(1) : 'Н/Д'}
                        </td>
                        <td className={`px-3 py-3 text-sm ${utilColors.text}`}>
                          {item.utilization !== null ? `${item.utilization.toFixed(1)}%` : 'Н/Д'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {item.completedIssues}/{item.totalIssues}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {reportsList.total > reportsList.limit && (
              <div className="flex items-center justify-between border-t border-surface-border px-4 py-3">
                <span className="text-xs text-gray-500">
                  {(reportsList.page - 1) * reportsList.limit + 1}—{Math.min(reportsList.page * reportsList.limit, reportsList.total)} из {reportsList.total}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setReportsPage((p) => Math.max(1, p - 1))}
                    disabled={reportsList.page <= 1}
                    className="rounded p-1 text-gray-400 hover:bg-surface-lighter disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setReportsPage((p) => p + 1)}
                    disabled={reportsList.page * reportsList.limit >= reportsList.total}
                    className="rounded p-1 text-gray-400 hover:bg-surface-lighter disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Achievements placeholder */}
      <Card>
        <div className="flex items-center gap-2 text-gray-400">
          <Award size={16} />
          <span className="text-sm font-medium">NFT-ачивки</span>
        </div>
        <p className="mt-3 text-sm text-gray-500">Скоро появятся</p>
      </Card>
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}`;
}
