import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import AchievementCard from '@/components/achievements/AchievementCard';
import AchievementDetail from '@/components/achievements/AchievementDetail';
import AchievementFilters from '@/components/achievements/AchievementFilters';
import { usePageTitle } from '@/hooks/usePageTitle';
import { achievementsApi } from '@/api/endpoints/achievements';
import type { Achievement } from '@/types/achievement';

export default function AchievementsPage() {
  usePageTitle('Ачивки');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProject, setFilterProject] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const result = await achievementsApi.list();
      setAchievements(result.data);
    } catch {
      setError(true);
      toast.error('Не удалось загрузить ачивки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uniqueEmployees = useMemo(
    () => [...new Set(achievements.map((a) => a.displayName ?? a.youtrackLogin))].sort(),
    [achievements],
  );
  const uniqueTypes = useMemo(
    () => [...new Set(achievements.map((a) => a.type))].sort(),
    [achievements],
  );
  const uniqueProjects = useMemo(
    () => [...new Set(achievements.filter((a) => a.projectName).map((a) => a.projectName!))].sort(),
    [achievements],
  );

  const filtered = useMemo(() => {
    let list = achievements;
    if (filterEmployee) {
      list = list.filter(
        (a) => (a.displayName ?? a.youtrackLogin) === filterEmployee,
      );
    }
    if (filterType) {
      list = list.filter((a) => a.type === filterType);
    }
    if (filterProject) {
      list = list.filter((a) => a.projectName === filterProject);
    }
    return list;
  }, [achievements, filterEmployee, filterType, filterProject]);

  const handleCardClick = (achievement: Achievement) => {
    setSelectedAchievement(achievement);
    setDetailOpen(true);
  };

  if (error) {
    return (
      <>
        <PageHeader title="Ачивки" description="Галерея достижений сотрудников" />
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

  if (!loading && achievements.length === 0) {
    return (
      <>
        <PageHeader title="Ачивки" description="Галерея достижений сотрудников" />
        <EmptyState
          icon={Trophy}
          title="Пока нет ачивок"
          description="Они появятся автоматически после сбора метрик по проектам"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Ачивки" description="Галерея достижений сотрудников" />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <div className="animate-pulse">
                <div className="mb-3 h-8 w-8 rounded bg-gray-700/50" />
                <div className="mb-2 h-4 w-24 rounded bg-gray-700/50" />
                <div className="mb-2 h-3 w-16 rounded bg-gray-700/50" />
                <div className="h-3 w-12 rounded bg-gray-700/50" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {achievements.length > 0 && (
            <AchievementFilters
              employees={uniqueEmployees}
              types={uniqueTypes}
              projects={uniqueProjects}
              selectedEmployee={filterEmployee}
              selectedType={filterType}
              selectedProject={filterProject}
              onEmployeeChange={setFilterEmployee}
              onTypeChange={setFilterType}
              onProjectChange={setFilterProject}
            />
          )}

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface/50 px-6 py-16 text-center">
              <Trophy size={32} className="mb-4 text-gray-500" />
              <p className="text-sm text-gray-500">Нет ачивок по выбранным фильтрам</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((a) => (
                <AchievementCard key={a.id} achievement={a} onClick={handleCardClick} />
              ))}
            </div>
          )}
        </>
      )}

      <AchievementDetail
        achievement={selectedAchievement}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}
