import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ScoreBadge from '@/components/metrics/ScoreBadge';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';
import { usePageTitle } from '@/hooks/usePageTitle';
import { reportsApi } from '@/api/endpoints/reports';
import type { EmployeeListItem } from '@/types/reports';

type SortKey = 'displayName' | 'lastScore' | 'utilization' | 'estimationAccuracy' | 'completionRate';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 15;

const COLUMNS: Array<{ key: SortKey | null; label: string }> = [
  { key: 'displayName', label: 'Сотрудник' },
  { key: null, label: 'Проекты' },
  { key: 'lastScore', label: 'Score' },
  { key: 'utilization', label: 'Загрузка' },
  { key: 'estimationAccuracy', label: 'Точность' },
  { key: 'completionRate', label: 'Закрытие' },
  { key: null, label: 'Тренд' },
];

function MetricCell({ metric, value }: { metric: string; value: number | null }) {
  const level = getMetricLevel(metric, value);
  const colors = LEVEL_COLORS[level];
  return (
    <td className="px-3 py-3 text-sm">
      <span className={colors.text}>
        {value !== null ? `${value.toFixed(1)}%` : 'Н/Д'}
      </span>
    </td>
  );
}

export default function EmployeesListPage() {
  usePageTitle('Сотрудники');
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('displayName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await reportsApi.getEmployees();
      setEmployees(data);
    } catch {
      setError(true);
      toast.error('Не удалось загрузить сотрудников');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Extract unique projects from data
  const allProjects = useMemo(() => {
    const set = new Set<string>();
    for (const emp of employees) {
      for (const p of emp.projects) set.add(p);
    }
    return [...set].sort();
  }, [employees]);

  // Filter + sort + paginate
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return employees.filter((emp) => {
      if (q && !emp.displayName.toLowerCase().includes(q) && !emp.youtrackLogin.toLowerCase().includes(q)) {
        return false;
      }
      if (projectFilter && !emp.projects.includes(projectFilter)) {
        return false;
      }
      return true;
    });
  }, [employees, search, projectFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;

      switch (sortKey) {
        case 'displayName':
          aVal = a.displayName;
          bVal = b.displayName;
          break;
        case 'lastScore':
          aVal = a.lastScore;
          bVal = b.lastScore;
          break;
        case 'utilization':
          aVal = a.utilization;
          bVal = b.utilization;
          break;
        case 'estimationAccuracy':
          aVal = a.estimationAccuracy;
          bVal = b.estimationAccuracy;
          break;
        case 'completionRate':
          aVal = a.completionRate;
          bVal = b.completionRate;
          break;
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortDir === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, projectFilter]);

  function handleSort(key: SortKey | null) {
    if (!key) return;
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'displayName' ? 'asc' : 'desc');
    }
  }

  // ─── Empty state ───
  if (!loading && !error && employees.length === 0) {
    return (
      <>
        <PageHeader
          title="Сотрудники"
          description="Все специалисты под мониторингом — быстрый доступ к профилю и ключевым показателям"
        />
        <EmptyState
          icon={UserRound}
          title="Нет сотрудников"
          description="Добавьте проект для мониторинга"
          action={{ label: 'Сбор данных', to: '/collection' }}
        />
      </>
    );
  }

  // ─── Error state ───
  if (error) {
    return (
      <>
        <PageHeader
          title="Сотрудники"
          description="Все специалисты под мониторингом — быстрый доступ к профилю и ключевым показателям"
        />
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
        title="Сотрудники"
        description="Все специалисты под мониторингом — быстрый доступ к профилю и ключевым показателям"
      />

      {/* Toolbar: search + project filter */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или логину..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-border dark:bg-surface dark:text-gray-200 dark:placeholder-gray-500"
          />
        </div>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-border dark:bg-surface dark:text-gray-200"
        >
          <option value="">Все проекты</option>
          {allProjects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <Card noPadding>
          <div className="animate-pulse p-4">
            <div className="mb-3 h-4 w-40 rounded bg-gray-200 dark:bg-gray-700/50" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="mb-2 h-10 w-full rounded bg-gray-200 dark:bg-gray-700/50" />
            ))}
          </div>
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-surface-border">
                  {COLUMNS.map((col, i) => (
                    <th
                      key={i}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500 ${col.key ? 'cursor-pointer select-none hover:text-gray-600 dark:hover:text-gray-300' : ''}`}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {col.key && sortKey === col.key && (
                          sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                      Ничего не найдено
                    </td>
                  </tr>
                ) : (
                  paginated.map((emp) => (
                    <tr
                      key={emp.youtrackLogin}
                      onClick={() => navigate(`/employees/${emp.youtrackLogin}`)}
                      className="cursor-pointer border-b border-gray-200 dark:border-surface-border transition-colors hover:bg-gray-100/50 dark:hover:bg-surface-lighter/50 last:border-b-0"
                    >
                      {/* Сотрудник */}
                      <td className="px-3 py-3">
                        <div className="font-medium text-sm text-gray-700 dark:text-gray-200">
                          {emp.displayName}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          {emp.youtrackLogin}
                        </div>
                      </td>

                      {/* Проекты */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {emp.projects.map((p) => (
                            <Badge key={p} variant="info">{p}</Badge>
                          ))}
                        </div>
                      </td>

                      {/* Score */}
                      <td className="px-3 py-3">
                        <ScoreBadge score={emp.lastScore} />
                      </td>

                      {/* Загрузка */}
                      <MetricCell metric="utilization" value={emp.utilization} />

                      {/* Точность */}
                      <MetricCell metric="estimationAccuracy" value={emp.estimationAccuracy} />

                      {/* Закрытие */}
                      <MetricCell metric="completionRate" value={emp.completionRate} />

                      {/* Тренд */}
                      <td className="px-3 py-3">
                        <TrendIndicator trend={emp.scoreTrend} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {sorted.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-gray-200 dark:border-surface-border px-4 py-3">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} из {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-30 dark:hover:text-gray-300"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 text-xs text-gray-500 dark:text-gray-400">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-30 dark:hover:text-gray-300"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
