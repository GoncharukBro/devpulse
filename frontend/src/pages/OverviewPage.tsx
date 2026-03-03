import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import KpiCard from '@/components/metrics/KpiCard';
import WeeklyChart from '@/components/metrics/WeeklyChart';
import ConcernsList from '@/components/metrics/ConcernsList';
import InfoTooltip from '@/components/metrics/InfoTooltip';
import AchievementCardCompact from '@/components/achievements/AchievementCardCompact';
import MethodologyLink from '@/components/shared/MethodologyLink';
import { reportsApi } from '@/api/endpoints/reports';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatPeriod } from '@/utils/format';
import type { OverviewDTO } from '@/types/reports';
import type { Achievement } from '@/types/achievement';

function pluralEmployees(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} сотрудников`;
  if (mod10 === 1) return `${n} сотрудник`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} сотрудника`;
  return `${n} сотрудников`;
}

export default function OverviewPage() {
  usePageTitle('Обзор');
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const result = await reportsApi.getOverview();
      setData(result);
    } catch {
      setError(true);
      toast.error('Не удалось загрузить обзор');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loading && !error && data && data.totalEmployees === 0) {
    return (
      <>
        <PageHeader title="Обзор" description="Общая картина по всем сотрудникам — ключевые показатели, тренды и точки внимания" />
        <EmptyState
          icon={BarChart3}
          title="Нет данных"
          description="Добавьте проект для мониторинга, чтобы увидеть аналитику"
          action={{ label: 'Добавить проект', to: '/collection' }}
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Обзор" description="Общая картина по всем сотрудникам — ключевые показатели, тренды и точки внимания" />
        <Card>
          <div className="py-8 text-center">
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Не удалось загрузить данные</p>
            <button
              onClick={load}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
            >
              Повторить
            </button>
          </div>
        </Card>
      </>
    );
  }

  const chartMetrics = [
    { key: 'avgScore', label: 'Score', color: '#6366f1' },
    { key: 'avgUtilization', label: 'Загрузка', color: '#10b981' },
  ];

  const achievements = (data?.recentAchievements ?? []) as Achievement[];

  const metaLine = data
    ? [
        pluralEmployees(data.totalEmployees),
        data.lastPeriodStart && data.lastPeriodEnd
          ? `Показатели за неделю: ${formatPeriod(data.lastPeriodStart, data.lastPeriodEnd)}`
          : null,
      ].filter(Boolean).join(' · ')
    : null;

  const pageDescription = (
    <>
      Общая картина по всем сотрудникам — ключевые показатели, тренды и точки внимания
      {metaLine && (
        <span className="mt-0.5 block text-xs text-gray-400 dark:text-gray-500">{metaLine}</span>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title="Обзор"
        description={pageDescription}
        actions={<MethodologyLink />}
      />

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          title="Средний Score"
          value={data?.avgScore ?? null}
          metric="score"
          trend={data?.scoreTrend}
          loading={loading}
        />
        <KpiCard
          title="Средняя загрузка"
          value={data?.avgUtilization ?? null}
          suffix="%"
          metric="utilization"
          loading={loading}
        />
        <KpiCard
          title="Точность"
          value={data?.avgEstimationAccuracy ?? null}
          suffix="%"
          metric="estimationAccuracy"
          loading={loading}
        />
        <KpiCard
          title="Закрытие"
          value={data?.avgCompletionRate ?? null}
          suffix="%"
          metric="completionRate"
          loading={loading}
        />
        <KpiCard
          title="Списано часов"
          value={data?.totalSpentHours ?? null}
          suffix="ч"
          metric="totalSpentHours"
          loading={loading}
        />
      </div>

      {/* Chart — full width */}
      <div className="mb-6">
        {loading ? (
          <Card>
            <div className="animate-pulse">
              <div className="mb-3 h-5 w-40 rounded bg-gray-200 dark:bg-gray-700/50" />
              <div className="h-[280px] rounded bg-gray-200/70 dark:bg-gray-700/30" />
            </div>
          </Card>
        ) : data ? (
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-gray-500 dark:text-gray-400" />
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Динамика по неделям</h3>
              <InfoTooltip
                title="Динамика по неделям"
                lines={[
                  'График изменения среднего Score по всем сотрудникам за каждую неделю.',
                  'Фиолетовая линия — средний Score за неделю (LLM-оценка).\nЗелёная линия — средняя загрузка.',
                  'Позволяет отследить общий тренд продуктивности команды.',
                ]}
              />
            </div>
            <WeeklyChart data={data.weeklyTrend} metrics={chartMetrics} />
          </Card>
        ) : null}
      </div>

      {/* Concerns — full width */}
      <div className="mb-6">
        <ConcernsList
          concerns={data?.concerns ?? []}
          loading={loading}
        />
      </div>

      {/* Recent Achievements */}
      <Card className="min-w-0">
        <div className="mb-3 flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Trophy size={16} />
          <span className="text-sm font-medium">Последние ачивки</span>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200/70 dark:bg-gray-700/30" />
            ))}
          </div>
        ) : achievements.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {achievements.slice(0, 5).map((a) => (
              <AchievementCardCompact
                key={a.id}
                achievement={a}
                onClick={() => navigate('/achievements')}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">Ачивки появятся после сбора метрик</p>
        )}
      </Card>
    </>
  );
}
