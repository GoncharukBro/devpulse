import { useCallback, useEffect, useState } from 'react';
import { Users, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import TeamCard from '@/components/teams/TeamCard';
import CreateTeamModal from '@/components/teams/CreateTeamModal';
import { usePageTitle } from '@/hooks/usePageTitle';
import { teamsApi } from '@/api/endpoints/teams';
import type { Team } from '@/types/team';

export default function TeamsListPage() {
  usePageTitle('Команды');
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const result = await teamsApi.list();
      setTeams(result);
    } catch {
      setError(true);
      toast.error('Не удалось загрузить команды');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loading && !error && teams.length === 0) {
    return (
      <>
        <PageHeader
          title="Команды"
          description="Ваши команды и их показатели"
          actions={
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setCreateOpen(true)}
            >
              Создать
            </Button>
          }
        />
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface/50 px-6 py-16 text-center">
          <div className="mb-4 rounded-full bg-surface-lighter p-4">
            <Users size={32} className="text-gray-500" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-gray-300">У вас пока нет команд</h3>
          <p className="mb-6 max-w-sm text-sm text-gray-500">
            Создайте первую команду, чтобы объединить сотрудников и отслеживать показатели
          </p>
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            Создать команду
          </Button>
        </div>
        <CreateTeamModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={load}
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Команды" description="Ваши команды и их показатели" />
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
      <PageHeader
        title="Команды"
        description="Ваши команды и их показатели"
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
          >
            Создать
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <div className="animate-pulse">
                <div className="mb-3 h-5 w-32 rounded bg-gray-700/50" />
                <div className="mb-2 h-8 w-16 rounded bg-gray-700/50" />
                <div className="h-4 w-full rounded bg-gray-700/50" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}

      <CreateTeamModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
      />
    </>
  );
}
