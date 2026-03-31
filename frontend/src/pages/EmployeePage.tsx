import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Users, Award, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import AchievementPortfolioCard from '@/components/achievements/AchievementPortfolioCard';
import AchievementPortfolioDetail from '@/components/achievements/AchievementPortfolioDetail';
import EmailReportModal from '@/components/shared/EmailReportModal';
import EmployeeHeader from '@/components/employees/EmployeeHeader';
import EmployeeKpiSection from '@/components/employees/EmployeeKpiSection';
import EmployeeChartsSection from '@/components/employees/EmployeeChartsSection';
import EmployeeBreakdownSection from '@/components/employees/EmployeeBreakdownSection';
import LlmSummaryBlock from '@/components/employees/LlmSummaryBlock';
import ReportsSidebar from '@/components/employees/ReportsSidebar';
import ReportSelector from '@/components/employees/ReportSelector';
import { usePageTitle } from '@/hooks/usePageTitle';
import { reportsApi } from '@/api/endpoints/reports';
import { achievementsApi } from '@/api/endpoints/achievements';
import { formatDateShort, formatMetric } from '@/utils/format';
import type {
  EmployeeSummaryDTO,
  EmployeeHistoryDTO,
  EmployeeReportDTO,
  PaginatedEmployeeReports,
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

  // --- Data loading ---

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

  const loadReport = useCallback(async (subscriptionId: string, periodStart: string) => {
    if (!login) return;
    try {
      const result = await reportsApi.getEmployeeReport(login, { subscriptionId, periodStart });
      setReport(result);
    } catch {
      toast.error('Не удалось загрузить отчёт');
    }
  }, [login]);

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

    if (urlPeriod && urlSubscription) {
      loadReport(urlSubscription, urlPeriod);
      return;
    }

    const project = selectedProject
      ? summary.projects.find((p) => p.subscriptionId === selectedProject)
      : summary.projects[0];
    if (!project) return;

    if (history && history.weeks.length > 0) {
      const latestWeek = history.weeks[history.weeks.length - 1];
      loadReport(project.subscriptionId, latestWeek.periodStart);
    }
  }, [summary, selectedProject, history, loadReport, urlPeriod, urlSubscription]);

  // --- Handlers ---

  function handleSelectReport(subscriptionId: string, periodStart: string) {
    loadReport(subscriptionId, periodStart);
    setSearchParams(
      { period: periodStart, subscription: subscriptionId },
      { replace: true },
    );
  }

  // --- Computed ---

  const displayScore = report?.score ?? summary?.avgScore ?? null;
  const displayTrend = summary?.scoreTrend ?? null;
  const displayUtilization = report?.utilization ?? summary?.avgUtilization ?? null;
  const displayEstimation = report?.estimationAccuracy ?? summary?.avgEstimationAccuracy ?? null;
  const displayFocus = report?.focus ?? summary?.avgFocus ?? null;

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
      `Score: ${formatMetric(displayScore)}${displayTrend === 'up' ? ' (↑)' : displayTrend === 'down' ? ' (↓)' : ''}`,
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

  const reportPeriod = report?.periodStart && report?.periodEnd
    ? { start: report.periodStart, end: report.periodEnd }
    : null;

  // --- Error / empty states ---

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

  // --- Render ---

  return (
    <>
      {/* Header — full width above the two-column layout */}
      <EmployeeHeader
        summary={summary}
        login={login}
        backTo={backTo}
        backLabel={backLabel}
        reportPeriod={reportPeriod}
        getCopyText={getCopyText}
        onEmailClick={() => setEmailModalOpen(true)}
      />

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

      {/* Mobile report selector — visible only when sidebar is hidden */}
      <div className="xl:hidden">
        <ReportSelector
          reportsList={reportsList}
          activeSubscriptionId={report?.subscriptionId}
          activePeriodStart={report?.periodStart}
          onSelectReport={handleSelectReport}
        />
      </div>

      {/* Two-column layout: content + sidebar */}
      <div className="flex gap-6">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          <EmployeeKpiSection summary={summary} report={report} loading={loading} />
          <EmployeeChartsSection history={history} weeks={weeks} onWeeksChange={setWeeks} />
          {report && <EmployeeBreakdownSection report={report} />}

          {/* LLM Summary — below breakdowns */}
          <div className="mb-6">
            <LlmSummaryBlock
              summary={report?.llmSummary ?? null}
              achievements={report?.llmAchievements ?? null}
              concerns={report?.llmConcerns ?? null}
              recommendations={report?.llmRecommendations ?? null}
              isProcessing={report?.status === 'completed' && !report?.llmProcessedAt}
              loading={loading}
              llmStatus={report?.llmStatus}
              hasNoData={report != null && report.totalIssues === 0}
              score={report?.score ?? summary?.avgScore}
              scoreTrend={summary?.trends?.score.direction}
              scoreDelta={summary?.trends?.score.delta}
            />
          </div>

          {/* Achievements */}
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
        </div>

        {/* Right sidebar — hidden below xl */}
        <div className="hidden w-[320px] shrink-0 xl:block">
          <ReportsSidebar
            reportsList={reportsList}
            activeSubscriptionId={report?.subscriptionId}
            activePeriodStart={report?.periodStart}
            onSelectReport={handleSelectReport}
            loading={loading}
            page={reportsPage}
            onPageChange={setReportsPage}
          />
        </div>
      </div>

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
