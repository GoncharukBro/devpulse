import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import KpiCard from '@/components/metrics/KpiCard';
import WeeklyChart from '@/components/metrics/WeeklyChart';
import InfoTooltip from '@/components/metrics/InfoTooltip';
import Button from '@/components/ui/Button';
import TeamMembersList from '@/components/teams/TeamMembersList';
import EditTeamModal from '@/components/teams/EditTeamModal';
import { usePageTitle } from '@/hooks/usePageTitle';
import { teamsApi } from '@/api/endpoints/teams';
import type { TeamDetail } from '@/types/team';

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  usePageTitle(team?.name ?? 'Команда');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(false);
      const result = await teamsApi.get(id);
      setTeam(result);
    } catch {
      setError(true);
      toast.error('Не удалось загрузить данные команды');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!id || !team) return;
    const confirmed = window.confirm(`Удалить команду \u00AB${team.name}\u00BB? Это действие необратимо.`);
    if (!confirmed) return;

    setDeleting(true);
    try {
      await teamsApi.delete(id);
      toast.success('Команда удалена');
      navigate('/teams');
    } catch {
      // Error toast shown by interceptor
    } finally {
      setDeleting(false);
    }
  };

  if (!loading && error) {
    return (
      <>
        <PageHeader
          title="Команда"
          description="Сводка по команде"
          backLink={{ to: '/teams', label: 'Команды' }}
        />
        <Card>
          <div className="py-8 text-center">
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Не удалось загрузить данные</p>
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

  if (!loading && !team) {
    return (
      <>
        <PageHeader
          title="Команда"
          description="Сводка по команде"
          backLink={{ to: '/teams', label: 'Команды' }}
        />
        <EmptyState
          icon={Users}
          title="Команда не найдена"
          description="Информация о команде ещё не загружена или команда не существует"
          action={{ label: 'Вернуться к командам', to: '/teams' }}
        />
      </>
    );
  }

  const chartMetrics = [
    { key: 'avgScore', label: 'Score', color: '#6366f1' },
  ];

  return (
    <>
      <PageHeader
        title={team?.name ?? 'Загрузка...'}
        description="Сводка по команде"
        backLink={{ to: '/teams', label: 'Команды' }}
        actions={
          team ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Pencil size={14} />}
                onClick={() => setEditOpen(true)}
              >
                Редактировать
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 size={14} />}
                loading={deleting}
                onClick={handleDelete}
              >
                Удалить
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Средний Score"
          value={team?.avgScore ?? null}
          metric="score"
          trend={team?.scoreTrend}
          loading={loading}
        />
        <KpiCard
          title="Средняя загрузка"
          value={team?.avgUtilization ?? null}
          suffix="%"
          metric="utilization"
          loading={loading}
        />
        {loading ? (
          <KpiCard title="" value={null} metric="score" loading />
        ) : (
          <Card className="animate-slide-up">
            <div className="text-sm text-gray-500 dark:text-gray-400">Участников</div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {team?.members.length ?? 0}
            </div>
          </Card>
        )}
      </div>

      {/* Chart */}
      <div className="mb-6">
        {loading ? (
          <Card>
            <div className="animate-pulse">
              <div className="mb-3 h-5 w-40 rounded bg-gray-200 dark:bg-gray-700/50" />
              <div className="h-[280px] rounded bg-gray-200/70 dark:bg-gray-700/30" />
            </div>
          </Card>
        ) : team && team.weeklyTrend.length > 0 ? (
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Динамика Score</h3>
              <InfoTooltip
                title="Динамика Score команды"
                lines={[
                  'График изменения среднего Score по участникам команды за каждую неделю.',
                  'Фиолетовая линия — средний Score команды.',
                  'Позволяет отследить общий тренд продуктивности команды.',
                ]}
              />
            </div>
            <WeeklyChart data={team.weeklyTrend} metrics={chartMetrics} />
          </Card>
        ) : (
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Динамика Score</h3>
              <InfoTooltip
                title="Динамика Score команды"
                lines={[
                  'График изменения среднего Score по участникам команды за каждую неделю.',
                  'Фиолетовая линия — средний Score команды.',
                  'Позволяет отследить общий тренд продуктивности команды.',
                ]}
              />
            </div>
            <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-surface-border text-sm text-gray-400 dark:text-gray-500">
              Нет данных для графика
            </div>
          </Card>
        )}
      </div>

      {/* Members Table */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Участники</h3>
          <InfoTooltip
            title="Участники команды"
            lines={[
              'Список сотрудников, входящих в команду, с текущими метриками.',
              'Нажмите на сотрудника для перехода к его детальному профилю.',
            ]}
          />
        </div>
        <TeamMembersList members={team?.members ?? []} loading={loading} />
      </div>

      <EditTeamModal
        open={editOpen}
        team={team}
        onClose={() => setEditOpen(false)}
        onUpdated={load}
      />
    </>
  );
}
