import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Users, TrendingUp, Activity, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import KpiCard from '@/components/metrics/KpiCard';
import WeeklyChart from '@/components/metrics/WeeklyChart';
import ConcernsList from '@/components/metrics/ConcernsList';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import { reportsApi } from '@/api/endpoints/reports';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { OverviewDTO } from '@/types/reports';
import type { Achievement, AchievementRarity } from '@/types/achievement';

const RARITY_STYLES: Record<AchievementRarity, string> = {
  common: 'from-gray-700 via-slate-600 to-blue-900',
  rare: 'from-blue-800 via-indigo-700 to-purple-800',
  epic: 'from-purple-800 via-fuchsia-700 to-pink-700',
  legendary: 'from-amber-600 via-yellow-500 to-orange-600',
};

const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

const TYPE_ICONS: Record<string, string> = {
  speed_demon: '\u26A1',
  quality_master: '\uD83C\uDFAF',
  focus_king: '\uD83D\uDD2D',
  streak_star: '\uD83D\uDD25',
  team_player: '\uD83E\uDD1D',
  early_bird: '\uD83C\uDF05',
  bug_hunter: '\uD83D\uDC1B',
  overachiever: '\uD83C\uDFC6',
};

function CompactAchievementCard({ achievement, onClick }: { achievement: Achievement; onClick: () => void }) {
  const gradient = RARITY_STYLES[achievement.rarity] ?? RARITY_STYLES.common;
  const icon = TYPE_ICONS[achievement.type] ?? '\uD83C\uDFC5';
  const label = RARITY_LABELS[achievement.rarity] ?? 'Common';

  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${gradient} p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110`}
    >
      <div className="flex items-start gap-2">
        <span className="text-xl">{icon}</span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-xs font-bold text-white">{achievement.title}</h4>
          <p className="truncate text-[11px] text-white/70">
            {achievement.displayName ?? achievement.youtrackLogin}
            {achievement.projectName && <span className="text-white/50"> &bull; {achievement.projectName}</span>}
          </p>
          <span className="mt-1 inline-block rounded-full border border-white/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white/80">
            {label}
          </span>
        </div>
      </div>
    </button>
  );
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

  const achievements = (data?.recentAchievements ?? []) as Achievement[];

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
            <Card className="animate-slide-up">
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
            <Card className="animate-slide-up">
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

      {/* Recent Achievements */}
      <Card className="min-w-0">
        <div className="mb-3 flex items-center gap-2 text-gray-400">
          <Trophy size={16} />
          <span className="text-sm font-medium">Последние ачивки</span>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-700/30" />
            ))}
          </div>
        ) : achievements.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {achievements.slice(0, 5).map((a) => (
              <CompactAchievementCard
                key={a.id}
                achievement={a}
                onClick={() => navigate('/achievements')}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Ачивки появятся после сбора метрик</p>
        )}
      </Card>
    </>
  );
}
