import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Users, Mail, Award, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import KpiCard from '@/components/metrics/KpiCard';
import WeeklyChart from '@/components/metrics/WeeklyChart';
import IssuesByTypeChart from '@/components/metrics/IssuesByTypeChart';
import SpentByTypeChart from '@/components/metrics/SpentByTypeChart';
import InfoTooltip from '@/components/metrics/InfoTooltip';
import LlmSummaryBlock from '@/components/employees/LlmSummaryBlock';
import AchievementPortfolioCard from '@/components/achievements/AchievementPortfolioCard';
import AchievementPortfolioDetail from '@/components/achievements/AchievementPortfolioDetail';
import CopyButton from '@/components/shared/CopyButton';
import MethodologyLink from '@/components/shared/MethodologyLink';
import PeriodFilter from '@/components/shared/PeriodFilter';
import StatusBadge from '@/components/shared/StatusBadge';
import EmailReportModal from '@/components/shared/EmailReportModal';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';
import { usePageTitle } from '@/hooks/usePageTitle';
import { reportsApi } from '@/api/endpoints/reports';
import { achievementsApi } from '@/api/endpoints/achievements';
import { formatDateShort, formatMetric, formatPeriod } from '@/utils/format';
import type {
  EmployeeSummaryDTO,
  EmployeeHistoryDTO,
  EmployeeReportDTO,
  PaginatedEmployeeReports,
  EmployeeReportListItem,
} from '@/types/reports';
import type { PortfolioAchievement, PortfolioResponse } from '@/types/achievement';

export default function EmployeePage() {
  const { login } = useParams<{ login: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navState = location.state as { from?: string; id?: string; name?: string } | null;

  // Read report selection from URL query params
  const urlPeriod = searchParams.get('period');
  const urlSubscription = searchParams.get('subscription');

  // Dynamic breadcrumb
  let backTo = '/employees';
  let backLabel = 'Сотрудники';
  if (navState?.from === 'project' && navState.id) {
    backTo = `/projects/${navState.id}`;
    backLabel = navState.name || 'Проект';
  } else if (navState?.from === 'team' && navState.id) {
    backTo = `/teams/${navState.id}`;
    backLabel = navState.name || 'Команда';
  }

  const [summary, setSummary] = useState<EmployeeSummaryDTO | null>(null);
  const [history, setHistory] = useState<EmployeeHistoryDTO | null>(null);
  const [report, setReport] = useState<EmployeeReportDTO | null>(null);
  const [reportsList, setReportsList] = useState<PaginatedEmployeeReports | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedPortfolioAchievement, setSelectedPortfolioAchievement] = useState<PortfolioAchievement | null>(null);
  const [portfolioDetailOpen, setPortfolioDetailOpen] = useState(false);

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(12);
  const [reportsPage, setReportsPage] = useState(1);

  usePageTitle(summary?.displayName ?? login ?? 'Сотрудник');

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

  // Load portfolio
  const loadPortfolio = useCallback(async () => {
    if (!login) return;
    try {
      const result = await achievementsApi.getPortfolio(login);
      setPortfolio(result);
    } catch {
      // Non-critical
    }
  }, [login]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { loadReportsList(); }, [loadReportsList]);
  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  // Auto-load report: from URL params or fallback to latest
  useEffect(() => {
    if (!summary || !summary.projects.length) return;

    // If URL has report params — load that specific report
    if (urlPeriod && urlSubscription) {
      loadReport(urlSubscription, urlPeriod);
      return;
    }

    // Fallback: load the latest report
    const project = selectedProject
      ? summary.projects.find((p) => p.subscriptionId === selectedProject)
      : summary.projects[0];
    if (!project) return;

    if (history && history.weeks.length > 0) {
      const latestWeek = history.weeks[history.weeks.length - 1];
      loadReport(project.subscriptionId, latestWeek.periodStart);
    }
  }, [summary, selectedProject, history, loadReport, urlPeriod, urlSubscription]);

  function handleReportRowClick(item: EmployeeReportListItem) {
    loadReport(item.subscriptionId, item.periodStart);
    setSearchParams(
      { period: item.periodStart, subscription: item.subscriptionId },
      { replace: true },
    );
  }

  if (!loading && error) {
    return (
      <>
        <div className="mb-8">
          <Link to={backTo} className="mb-3 inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 transition-colors hover:text-gray-600 dark:hover:text-gray-300">
            <ArrowLeft size={14} />
            {backLabel}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{login ?? 'Сотрудник'}</h1>
        </div>
        <Card>
          <div className="py-8 text-center">
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Не удалось загрузить данные</p>
            <button
              onClick={loadSummary}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
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
        <div className="mb-8">
          <Link to={backTo} className="mb-3 inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 transition-colors hover:text-gray-600 dark:hover:text-gray-300">
            <ArrowLeft size={14} />
            {backLabel}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{login ?? 'Сотрудник'}</h1>
        </div>
        <EmptyState
          icon={Users}
          title="Сотрудник не найден"
          description="Информация о сотруднике ещё не загружена или профиль не существует"
          action={{ label: `Вернуться: ${backLabel}`, to: backTo }}
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
      ? `${formatDateShort(report.periodStart)} — ${formatDateShort(report.periodEnd)}`
      : '';

    const lines = [
      `Отчёт: ${summary.displayName}${projectName ? ` (${projectName})` : ''}`,
      period ? `Период: ${period}` : '',
      '',
      `Score: ${formatMetric(displayScore)}${displayTrend === 'up' ? ' (\u2191)' : displayTrend === 'down' ? ' (\u2193)' : ''}`,
      `Загрузка: ${formatMetric(displayUtilization, '%')} | Точность оценок: ${formatMetric(displayEstimation, '%')} | Фокус: ${formatMetric(displayFocus, '%')}`,
    ];

    if (report) {
      lines.push(`Закрыто: ${report.completedIssues} из ${report.totalIssues} задач | Cycle Time: ${formatMetric(report.avgCycleTimeHours, 'ч')}`);
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
      {/* Back link */}
      <Link to={backTo} className="mb-3 inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 transition-colors hover:text-gray-600 dark:hover:text-gray-300">
        <ArrowLeft size={14} />
        {backLabel}
      </Link>

      {/* Header with avatar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xl font-bold text-brand-400">
            {initial}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary?.displayName ?? 'Загрузка...'}</h1>
            <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {login}
              {summary?.email && <span> &bull; {summary.email}</span>}
            </div>
            <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Цифровой профиль — загрузка, качество, динамика и AI-анализ
            </div>
            {summary && summary.projects.length > 0 && (
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Проекты: {summary.projects.map((p) => p.projectName).join(', ')}
              </div>
            )}
            {report?.periodStart && report?.periodEnd && (
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Показатели за неделю: {formatPeriod(report.periodStart, report.periodEnd)}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MethodologyLink />
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
      </div>

      {/* Project filter tabs */}
      {summary && summary.projects.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => { setSelectedProject(null); setReportsPage(1); setSearchParams({}, { replace: true }); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              !selectedProject
                ? 'bg-brand-500/20 text-brand-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-lighter hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Все проекты
          </button>
          {summary.projects.map((p) => (
            <button
              key={p.subscriptionId}
              onClick={() => { setSelectedProject(p.subscriptionId); setReportsPage(1); setSearchParams({}, { replace: true }); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedProject === p.subscriptionId
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-lighter hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {p.projectName}
            </button>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        <KpiCard title="Score" value={displayScore} metric="score" trend={summary?.trends?.score.direction} delta={summary?.trends?.score.delta} loading={loading} />
        <KpiCard title="Загрузка" value={displayUtilization} suffix="%" metric="utilization" trend={summary?.trends?.utilization.direction} delta={summary?.trends?.utilization.delta} loading={loading} />
        <KpiCard title="Точность" value={displayEstimation} suffix="%" metric="estimationAccuracy" trend={summary?.trends?.estimationAccuracy.direction} delta={summary?.trends?.estimationAccuracy.delta} loading={loading} />
        <KpiCard title="Фокус" value={displayFocus} suffix="%" metric="focus" trend={summary?.trends?.focus.direction} delta={summary?.trends?.focus.delta} loading={loading} />
        <KpiCard title="Закрытие" value={displayCompletion} suffix="%" metric="completionRate" trend={summary?.trends?.completionRate.direction} delta={summary?.trends?.completionRate.delta} loading={loading} />
        <KpiCard title="Cycle Time" value={displayCycle} suffix="ч" metric="avgCycleTimeHours" trend={summary?.trends?.cycleTime.direction} delta={summary?.trends?.cycleTime.delta} loading={loading} />
        <KpiCard title="Списано часов" value={report?.totalSpentHours ?? null} suffix="ч" metric="totalSpentHours" trend={summary?.trends?.spentHours.direction} delta={summary?.trends?.spentHours.delta} loading={loading} />
      </div>

      {/* Chart + LLM Summary */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
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
        <div>
          <LlmSummaryBlock
            summary={report?.llmSummary ?? null}
            achievements={report?.llmAchievements ?? null}
            concerns={report?.llmConcerns ?? null}
            recommendations={report?.llmRecommendations ?? null}
            isProcessing={report?.status === 'completed' && !report?.llmProcessedAt}
            loading={loading}
            llmStatus={report?.llmStatus}
            hasNoData={report != null && report.totalIssues === 0}
          />
        </div>
      </div>

      {/* Breakdowns */}
      {report && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Разбивка по типам задач</h3>
              <InfoTooltip
                title="Разбивка по типам задач"
                lines={[
                  'Распределение задач сотрудника по категориям за выбранный период.',
                  'Фичи, баги, техдолг, поддержка, документация, code review и прочее.',
                  'Помогает оценить, на что уходит основное рабочее время.',
                ]}
              />
            </div>
            <IssuesByTypeChart data={report.issuesByType} />
          </Card>
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Списание по типам</h3>
              <InfoTooltip
                title="Списание по типам"
                lines={[
                  'Сколько часов списано на каждый тип задач за выбранный период.',
                  'Данные из YouTrack (work items), сгруппированные по категориям.',
                  'Позволяет увидеть реальное распределение времени сотрудника.',
                ]}
              />
            </div>
            <SpentByTypeChart data={report.spentByType} />
          </Card>
        </div>
      )}

      {/* Reports history table */}
      {reportsList && reportsList.data.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">История отчётов</h3>
            <InfoTooltip
              title="История отчётов"
              lines={[
                'Таблица всех еженедельных отчётов сотрудника.',
                'Score, загрузка, количество закрытых задач и статус обработки.',
                'Нажмите на строку, чтобы загрузить детали конкретного отчёта.',
              ]}
            />
          </div>
          <Card noPadding>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-surface-border">
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Период</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Проект</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Score</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Загрузка</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Закрыто</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Статус</th>
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
                        className={`cursor-pointer border-b border-gray-200 dark:border-surface-border transition-colors last:border-b-0 ${
                          isActive ? 'bg-brand-500/5' : 'hover:bg-gray-100/50 dark:hover:bg-surface-lighter/50'
                        }`}
                      >
                        <td className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {formatDateShort(item.periodStart)} — {formatDateShort(item.periodEnd)}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{item.projectName}</td>
                        <td className={`px-3 py-3 text-sm font-medium ${scoreColors.text}`}>
                          {formatMetric(item.score)}
                        </td>
                        <td className={`px-3 py-3 text-sm ${utilColors.text}`}>
                          {formatMetric(item.utilization, '%')}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
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
              <div className="flex items-center justify-between border-t border-gray-200 dark:border-surface-border px-4 py-3">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {(reportsList.page - 1) * reportsList.limit + 1}&mdash;{Math.min(reportsList.page * reportsList.limit, reportsList.total)} из {reportsList.total}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setReportsPage((p) => Math.max(1, p - 1))}
                    disabled={reportsList.page <= 1}
                    className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-lighter disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label="Предыдущая страница"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setReportsPage((p) => p + 1)}
                    disabled={reportsList.page * reportsList.limit >= reportsList.total}
                    className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-lighter disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label="Следующая страница"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Achievements — Portfolio */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Award size={16} />
          <span className="text-sm font-medium">
            Ачивки
            {portfolio && portfolio.stats.unlockedTypes > 0 && (
              <span className="ml-1 text-gray-400 dark:text-gray-500">
                ({portfolio.stats.unlockedTypes}/{portfolio.stats.totalTypes} типов &bull; {portfolio.stats.totalLevels} уровней)
              </span>
            )}
          </span>
        </div>
        {portfolio && portfolio.achievements.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {portfolio.achievements.map((a) => (
              <AchievementPortfolioCard
                key={a.type}
                achievement={a}
                onClick={(ach) => {
                  setSelectedPortfolioAchievement(ach);
                  setPortfolioDetailOpen(true);
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">Пока нет ачивок</p>
        )}
      </Card>

      {/* Modals */}
      <EmailReportModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        type="employee"
        youtrackLogin={login}
        subscriptionId={selectedProject ?? summary?.projects[0]?.subscriptionId}
      />
      <AchievementPortfolioDetail
        achievement={selectedPortfolioAchievement}
        open={portfolioDetailOpen}
        onClose={() => setPortfolioDetailOpen(false)}
      />
    </>
  );
}
