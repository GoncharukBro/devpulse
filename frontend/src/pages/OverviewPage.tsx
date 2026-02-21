import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Users, TrendingUp, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import KpiCard from '@/components/metrics/KpiCard';
import WeeklyChart from '@/components/metrics/WeeklyChart';
import ConcernsList from '@/components/metrics/ConcernsList';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import { reportsApi } from '@/api/endpoints/reports';
import type { OverviewDTO } from '@/types/reports';

export default function OverviewPage() {
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
        <PageHeader title="Обзор" description="Общая динамика по всем сотрудникам" />
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
        <PageHeader title="Обзор" description="Общая динамика по всем сотрудникам" />
        <Card>
          <div className="py-8 text-center">
            <p className="mb-4 text-sm text-gray-400">Не удалось загрузить данные</p>
            <button
              onClick={load}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
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

  return (
    <>
      <PageHeader title="Обзор" description="Общая динамика по всем сотрудникам" />

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <KpiCard title="" value={null} metric="score" loading />
            <KpiCard title="" value={null} metric="score" loading />
            <KpiCard title="" value={null} metric="score" loading />
            <KpiCard title="" value={null} metric="score" loading />
          </>
        ) : data ? (
          <>
            <Card>
              <div className="flex items-start justify-between">
                <span className="text-sm text-gray-400">Всего сотрудников</span>
                <Users size={16} className="text-gray-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-100">{data.totalEmployees}</div>
            </Card>
            <KpiCard
              title="Средний Score"
              value={data.avgScore}
              metric="score"
              trend={data.scoreTrend}
            />
            <KpiCard
              title="Средняя загрузка"
              value={data.avgUtilization}
              suffix="%"
              metric="utilization"
            />
            <Card>
              <div className="flex items-start justify-between">
                <span className="text-sm text-gray-400">Тренд Score</span>
                <Activity size={16} className="text-gray-500" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <TrendIndicator trend={data.scoreTrend} className="text-2xl" />
                <span className="text-sm text-gray-400">
                  {data.scoreTrend === 'up' ? 'Рост' : data.scoreTrend === 'down' ? 'Снижение' : 'Стабильно'}
                </span>
              </div>
            </Card>
          </>
        ) : null}
      </div>

      {/* Charts + Concerns */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <Card>
              <div className="animate-pulse">
                <div className="mb-3 h-5 w-40 rounded bg-gray-700/50" />
                <div className="h-[280px] rounded bg-gray-700/30" />
              </div>
            </Card>
          ) : data ? (
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-gray-400" />
                <h3 className="text-sm font-medium text-gray-300">Динамика по неделям</h3>
              </div>
              <WeeklyChart data={data.weeklyTrend} metrics={chartMetrics} />
            </Card>
          ) : null}
        </div>
        <div>
          <ConcernsList
            concerns={data?.concerns ?? []}
            loading={loading}
          />
        </div>
      </div>

      {/* Achievements placeholder */}
      <Card>
        <div className="flex items-center gap-2 text-gray-400">
          <BarChart3 size={16} />
          <span className="text-sm font-medium">Последние ачивки</span>
        </div>
        <p className="mt-3 text-sm text-gray-500">Скоро появятся</p>
      </Card>
    </>
  );
}
