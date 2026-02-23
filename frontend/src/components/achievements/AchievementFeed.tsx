import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import AchievementFeedItem, { getBestRarity } from './AchievementFeedItem';
import { achievementsApi } from '@/api/endpoints/achievements';
import type { Achievement, AchievementRarity } from '@/types/achievement';

const PAGE_SIZE = 20;

const RARITY_ORDER: Record<AchievementRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toISOString().slice(0, 10)}|${sunday.toISOString().slice(0, 10)}`;
}

function formatWeekRange(key: string): string {
  const [start, end] = key.split('|');
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  return `${s.toLocaleDateString('ru-RU', opts)} \u2013 ${e.toLocaleDateString('ru-RU', opts)} ${e.getFullYear()}`;
}

interface EmployeeGroup {
  login: string;
  displayName: string;
  achievements: Achievement[];
}

function groupByEmployee(items: Achievement[]): EmployeeGroup[] {
  const map = new Map<string, { displayName: string; achievements: Achievement[] }>();
  for (const a of items) {
    const existing = map.get(a.youtrackLogin);
    if (existing) {
      existing.achievements.push(a);
    } else {
      map.set(a.youtrackLogin, {
        displayName: a.displayName ?? a.youtrackLogin,
        achievements: [a],
      });
    }
  }

  // Sort employees by best rarity (legendary first), then by number of achievements
  return [...map.entries()]
    .map(([login, data]) => ({ login, ...data }))
    .sort((a, b) => {
      const rarityDiff = RARITY_ORDER[getBestRarity(b.achievements)] - RARITY_ORDER[getBestRarity(a.achievements)];
      if (rarityDiff !== 0) return rarityDiff;
      return b.achievements.length - a.achievements.length;
    });
}

export default function AchievementFeed() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterRarity, setFilterRarity] = useState('');

  const load = useCallback(async (p: number, reset: boolean) => {
    try {
      setLoading(true);
      const result = await achievementsApi.list({ page: p, limit: PAGE_SIZE });
      setAchievements((prev) => (reset ? result.data : [...prev, ...result.data]));
      setTotal(result.total);
    } catch {
      toast.error('Не удалось загрузить ачивки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1, true);
  }, [load]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next, false);
  };

  const uniqueEmployees = useMemo(
    () => [...new Set(achievements.map((a) => a.displayName ?? a.youtrackLogin))].sort(),
    [achievements],
  );
  const uniqueProjects = useMemo(
    () => [...new Set(achievements.filter((a) => a.projectName).map((a) => a.projectName!))].sort(),
    [achievements],
  );

  const filtered = useMemo(() => {
    let list = achievements;
    if (filterEmployee) list = list.filter((a) => (a.displayName ?? a.youtrackLogin) === filterEmployee);
    if (filterProject) list = list.filter((a) => a.projectName === filterProject);
    if (filterRarity) list = list.filter((a) => a.rarity === filterRarity);
    return list;
  }, [achievements, filterEmployee, filterProject, filterRarity]);

  // Group by week, then by employee
  const grouped = useMemo(() => {
    const weekMap = new Map<string, Achievement[]>();
    for (const a of filtered) {
      const key = getWeekKey(a.periodStart);
      const arr = weekMap.get(key) ?? [];
      arr.push(a);
      weekMap.set(key, arr);
    }

    return [...weekMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([weekKey, items]) => ({
        weekKey,
        totalCount: items.length,
        employees: groupByEmployee(items),
      }));
  }, [filtered]);

  const selectClass =
    'rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500';

  if (!loading && achievements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-surface-border bg-white/50 dark:bg-surface/50 px-6 py-16 text-center">
        <Trophy size={32} className="mb-4 text-gray-400 dark:text-gray-500" />
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Пока нет достижений. Они появятся автоматически после сбора метрик.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className={selectClass}>
          <option value="">Все сотрудники</option>
          {uniqueEmployees.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={selectClass}>
          <option value="">Все проекты</option>
          {uniqueProjects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={filterRarity}
          onChange={(e) => setFilterRarity(e.target.value as AchievementRarity | '')}
          className={selectClass}
        >
          <option value="">Все редкости</option>
          <option value="common">Common</option>
          <option value="rare">Rare</option>
          <option value="epic">Epic</option>
          <option value="legendary">Legendary</option>
        </select>
      </div>

      {/* Loading skeleton */}
      {loading && achievements.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-surface p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-5 w-5 rounded bg-gray-200 dark:bg-gray-700/50" />
                <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700/50" />
              </div>
              <div className="space-y-2 pl-7">
                <div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-700/50" />
                <div className="h-3 w-40 rounded bg-gray-200 dark:bg-gray-700/50" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grouped feed */}
      {!loading || achievements.length > 0 ? (
        <div className="space-y-6">
          {grouped.map(({ weekKey, totalCount, employees }) => (
            <div key={weekKey}>
              <div className="mb-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200 dark:bg-surface-border" />
                <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {formatWeekRange(weekKey)} ({totalCount})
                </span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-surface-border" />
              </div>
              <div className="space-y-3">
                {employees.map((emp) => (
                  <AchievementFeedItem
                    key={emp.login}
                    login={emp.login}
                    displayName={emp.displayName}
                    achievements={emp.achievements}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Load more */}
          {achievements.length < total && (
            <div className="text-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-surface px-6 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-surface-lighter disabled:opacity-50"
              >
                {loading ? 'Загрузка...' : 'Показать ещё'}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
