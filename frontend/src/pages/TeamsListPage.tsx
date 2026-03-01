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

  const handleRename = async (id: string, newName: string) => {
    try {
      await teamsApi.update(id, { name: newName });
      setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name: newName } : t)));
      toast.success('Команда переименована');
    } catch {
      toast.error('Не удалось переименовать команду');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = confirm(`Вы уверены что хотите удалить команду \u00AB${name}\u00BB?`);
    if (!confirmed) return;

    try {
      await teamsApi.delete(id);
      toast.success('Команда удалена');
      setTeams((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast.error('Не удалось удалить команду');
    }
  };

  if (!loading && !error && teams.length === 0) {
    return (
      <>
        <PageHeader
          title="Команды"
          description="Объединяйте сотрудников из разных проектов и следите за показателями группы"
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
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-surface-border bg-gray-50 dark:bg-surface/50 px-6 py-16 text-center">
          <div className="mb-4 rounded-full bg-gray-100 dark:bg-surface-lighter p-4">
            <Users size={32} className="text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-gray-600 dark:text-gray-300">У вас пока нет команд</h3>
          <p className="mb-6 max-w-sm text-sm text-gray-400 dark:text-gray-500">
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
        <PageHeader title="Команды" description="Объединяйте сотрудников из разных проектов и следите за показателями группы" />
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

  return (
    <>
      <PageHeader
        title="Команды"
        description="Объединяйте сотрудников из разных проектов и следите за показателями группы"
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
                <div className="mb-3 h-5 w-32 rounded bg-gray-200 dark:bg-gray-700/50" />
                <div className="mb-2 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700/50" />
                <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700/50" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} onDelete={handleDelete} onRename={handleRename} />
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
