import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Users, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import ScoreBadge from '@/components/metrics/ScoreBadge';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';
import { subscriptionsApi } from '@/api/endpoints/subscriptions';
import { reportsApi } from '@/api/endpoints/reports';
import type { Subscription } from '@/types/subscription';
import type { ProjectSummaryDTO } from '@/types/reports';

interface ProjectCardData {
  subscription: Subscription;
  summary: ProjectSummaryDTO | null;
  loading: boolean;
}

function MetricRow({ label, value, metric, suffix = '%' }: { label: string; value: number | null; metric: string; suffix?: string }) {
  const level = getMetricLevel(metric, value);
  const colors = LEVEL_COLORS[level];
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={colors.text}>
        {value !== null ? `${value.toFixed(1)}${suffix}` : 'Н/Д'}
      </span>
    </div>
  );
}

function ProjectCard({ data }: { data: ProjectCardData }) {
  const navigate = useNavigate();
  const { subscription, summary, loading } = data;

  if (loading) {
    return (
      <Card className="cursor-pointer transition-all hover:border-gray-600">
        <div className="animate-pulse">
          <div className="mb-3 h-5 w-32 rounded bg-gray-700/50" />
          <div className="mb-2 h-12 w-16 rounded bg-gray-700/50" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-gray-700/50" />
            <div className="h-4 w-3/4 rounded bg-gray-700/50" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="cursor-pointer transition-all hover:border-gray-600">
      <div onClick={() => navigate(`/projects/${subscription.id}`)}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-100">{subscription.projectName}</h3>
            <span className="text-xs text-gray-500">{subscription.projectShortName}</span>
          </div>
          {summary && (
            <div className="flex items-center gap-2">
              <ScoreBadge score={summary.avgScore} size="lg" />
              <TrendIndicator trend={summary.scoreTrend} />
            </div>
          )}
        </div>

        {summary ? (
          <>
            <div className="mb-4 flex items-center gap-1 text-sm text-gray-400">
              <Users size={14} />
              <span>{summary.totalEmployees} сотрудник(ов)</span>
            </div>
            <div className="space-y-1.5">
              <MetricRow label="Загрузка" value={summary.avgUtilization} metric="utilization" />
              <MetricRow label="Точность" value={summary.avgEstimationAccuracy} metric="estimationAccuracy" />
              <MetricRow label="Закрытие" value={summary.avgCompletionRate} metric="completionRate" />
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">Данные ещё не собраны</p>
        )}

        <div className="mt-4 flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300">
          Подробнее <ArrowRight size={12} />
        </div>
      </div>
    </Card>
  );
}

export default function ProjectsListPage() {
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const subscriptions = await subscriptionsApi.list();
      const initial: ProjectCardData[] = subscriptions.map((s) => ({
        subscription: s,
        summary: null,
        loading: true,
      }));
      setProjects(initial);
      setLoading(false);

      // Load summaries in parallel
      const summaries = await Promise.allSettled(
        subscriptions.map((s) => reportsApi.getProjectSummary(s.id)),
      );

      setProjects((prev) =>
        prev.map((p, i) => ({
          ...p,
          summary: summaries[i].status === 'fulfilled' ? summaries[i].value : null,
          loading: false,
        })),
      );
    } catch {
      setError(true);
      setLoading(false);
      toast.error('Не удалось загрузить проекты');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loading && !error && projects.length === 0) {
    return (
      <>
        <PageHeader title="Проекты" description="Зарегистрированные проекты и их метрики" />
        <EmptyState
          icon={FolderKanban}
          title="Нет проектов"
          description="Зарегистрируйте проект, чтобы начать отслеживать метрики"
          action={{ label: 'Зарегистрировать проект', to: '/collection' }}
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Проекты" description="Зарегистрированные проекты и их метрики" />
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

  return (
    <>
      <PageHeader title="Проекты" description="Зарегистрированные проекты и их метрики" />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <div className="animate-pulse">
                <div className="mb-3 h-5 w-32 rounded bg-gray-700/50" />
                <div className="mb-2 h-12 w-16 rounded bg-gray-700/50" />
                <div className="space-y-2">
                  <div className="h-4 w-full rounded bg-gray-700/50" />
                  <div className="h-4 w-3/4 rounded bg-gray-700/50" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.subscription.id} data={p} />
          ))}
        </div>
      )}
    </>
  );
}
