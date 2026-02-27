import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { collectionApi } from '@/api/endpoints/collection';
import type { CollectionLogEntry, PaginatedCollectionLogs, LogGroupBy, LogDetails, EmployeeDetail } from '@/types/collection';
import type { Subscription } from '@/types/subscription';

/* ─────────────────── Props ─────────────────── */

interface CollectionLogsProps {
  subscriptions: Subscription[];
  refreshKey?: number;
}

/* ─────────────────── Утилиты форматирования ─────────────────── */

function formatDuration(seconds: number | null | undefined): string {
  const s = seconds ?? 0;
  if (s < 60) return `${s}с`;
  if (s < 3600) {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return sec > 0 ? `${min}м ${sec}с` : `${min}м`;
  }
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  return min > 0 ? `${h}ч ${min}м` : `${h}ч`;
}

function formatLogDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatPeriodGroup(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sDay = s.getDate();
  const eDay = e.getDate();
  const month = e.toLocaleDateString('ru-RU', { month: 'long' });
  const year = e.getFullYear();

  if (s.getMonth() === e.getMonth()) {
    return `${sDay}\u2013${eDay} ${month} ${year}`;
  }
  const sMonth = s.toLocaleDateString('ru-RU', { month: 'long' });
  return `${sDay} ${sMonth} \u2013 ${eDay} ${month} ${year}`;
}

function formatPeriodCell(start: string | null, end: string | null): string {
  if (!start || !end) return '\u2014';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sd = String(s.getDate()).padStart(2, '0');
  const sm = String(s.getMonth() + 1).padStart(2, '0');
  const ed = String(e.getDate()).padStart(2, '0');
  const em = String(e.getMonth() + 1).padStart(2, '0');
  return `${sd}.${sm}\u2013${ed}.${em}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/* ─────────────────── Статус-бейджи ─────────────────── */

function getSmartStatusBadge(log: CollectionLogEntry) {
  switch (log.status) {
    case 'completed':
      return <Badge variant="success">Успешно</Badge>;
    case 'partial':
      return <Badge variant="warning">Частично</Badge>;
    case 'stopped':
      return <Badge variant="neutral">Остановлен</Badge>;
    case 'cancelled':
      return <Badge variant="neutral">Отменён</Badge>;
    case 'skipped':
      return <Badge variant="neutral">Без изменений</Badge>;
    case 'failed':
      return <Badge variant="danger">Ошибка</Badge>;
    case 'running':
      return <Badge variant="info">Выполняется</Badge>;
    case 'pending':
      return <Badge variant="neutral">В очереди</Badge>;
    case 'stopping':
      return <Badge variant="neutral">Останавливается</Badge>;
    default:
      return <Badge variant="neutral">{log.status}</Badge>;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'manual':
      return 'ручной';
    case 'cron':
      return 'cron';
    default:
      return type;
  }
}

/* ─────────────────── Сводка по сотрудникам ─────────────────── */

function getEmployeeSummary(log: CollectionLogEntry): string {
  const { processedEmployees, totalEmployees, skippedEmployees, reQueuedEmployees, failedEmployees, status } = log;

  if (processedEmployees === 0 && reQueuedEmployees > 0 && status === 'completed') {
    return `LLM: ${reQueuedEmployees} отчёта`;
  }
  if (status === 'skipped') {
    return 'данные актуальны';
  }
  if (status === 'cancelled') {
    return '\u2014';
  }

  const base = `${processedEmployees}/${totalEmployees}`;
  const extras: string[] = [];

  if (skippedEmployees > 0) extras.push(`${skippedEmployees} пропущен`);
  if (failedEmployees > 0) extras.push(`${failedEmployees} ошибка`);
  if (reQueuedEmployees > 0) extras.push(`${reQueuedEmployees} LLM`);

  return extras.length > 0 ? `${base} (${extras.join(', ')})` : base;
}

/* ─────────────────── Группировка ─────────────────── */

function groupLogs(logs: CollectionLogEntry[], groupBy: LogGroupBy): Map<string, CollectionLogEntry[]> {
  const groups = new Map<string, CollectionLogEntry[]>();

  for (const log of logs) {
    let key: string;

    switch (groupBy) {
      case 'date':
        key = log.startedAt ? formatLogDate(log.startedAt) : 'Неизвестная дата';
        break;
      case 'period':
        key =
          log.periodStart && log.periodEnd
            ? formatPeriodGroup(log.periodStart, log.periodEnd)
            : 'Неизвестный период';
        break;
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(log);
  }

  return groups;
}

/* ─────────────────── Детализация: YouTrack ─────────────────── */

interface SectionInfo {
  icon: string;
  label: string;
  description: string;
  subtext: string;
}

function getYouTrackSection(log: CollectionLogEntry, employees: EmployeeDetail[]): SectionInfo {
  const collected = employees.filter((e) => e.dataStatus === 'collected').length;
  const failed = employees.filter((e) => e.dataStatus === 'failed').length;
  const stopped = employees.filter((e) => e.dataStatus === 'stopped').length;
  const total = employees.length;

  // Подтекст — что было в ЭТОМ запуске
  let subtext = '';
  if (log.status === 'skipped') {
    subtext = 'В этом запуске: все данные уже были актуальны';
  } else if (log.status === 'stopped') {
    subtext = `В этом запуске: остановлено на ${log.processedEmployees}/${log.totalEmployees}`;
  } else if (log.status === 'completed' || log.status === 'partial') {
    if (log.processedEmployees > 0) {
      subtext = `В этом запуске: ${log.processedEmployees} сотр. обработаны`;
    }
  }

  // Основной текст — реальное состояние данных
  if (total === 0) {
    return { icon: '\u2139\uFE0F', label: 'Нет сотрудников', description: '', subtext };
  }

  if (collected === total) {
    return { icon: '\u2705', label: 'Данные собраны', description: '', subtext };
  }

  if (collected > 0 && failed > 0) {
    const failedNames = employees
      .filter((e) => e.dataStatus === 'failed')
      .map((e) => `${e.displayName}: ${e.error ?? 'ошибка'}`)
      .join('. ');
    return {
      icon: '\u26A0\uFE0F',
      label: 'Данные собраны частично',
      description: failedNames,
      subtext,
    };
  }

  if (collected > 0 && stopped > 0) {
    return {
      icon: '\u26A0\uFE0F',
      label: 'Данные собраны частично',
      description: `${collected}/${total} обработаны, остальные остановлены`,
      subtext,
    };
  }

  if (collected > 0) {
    return {
      icon: '\u26A0\uFE0F',
      label: 'Данные собраны частично',
      description: `${collected}/${total}`,
      subtext,
    };
  }

  if (failed === total) {
    return {
      icon: '\u274C',
      label: 'Ошибка сбора',
      description: `Не удалось собрать данные (${total} сотр.)`,
      subtext,
    };
  }

  if (stopped > 0) {
    return {
      icon: '\u23F9',
      label: 'Остановлен',
      description: `0/${total} обработано`,
      subtext,
    };
  }

  // Все skipped — нет MetricReport
  return { icon: '\u2139\uFE0F', label: 'Нет данных', description: '', subtext };
}

/* ─────────────────── Детализация: LLM ─────────────────── */

function getLlmSection(log: CollectionLogEntry, employees: EmployeeDetail[]): SectionInfo {
  const completed = employees.filter((e) => e.llmStatus === 'completed').length;
  const failed = employees.filter((e) => e.llmStatus === 'failed').length;
  const pending = employees.filter((e) => e.llmStatus === 'pending').length;
  const processing = employees.filter((e) => e.llmStatus === 'processing').length;
  const skipped = employees.filter((e) => e.llmStatus === 'skipped').length;
  const withData = employees.filter((e) => e.dataStatus === 'collected').length;

  // Подтекст — что было в ЭТОМ запуске
  let subtext = '';
  if (log.status === 'skipped') {
    subtext = 'В этом запуске: LLM не запрашивался';
  } else if (log.reQueuedEmployees > 0 && log.processedEmployees === 0) {
    subtext = `В этом запуске: ${log.reQueuedEmployees} отчётов поставлены в очередь`;
  } else if (log.status === 'stopped' || log.status === 'cancelled') {
    subtext = 'В этом запуске: отменён при остановке сбора';
  } else if (log.llmCompleted > 0) {
    subtext = `В этом запуске: ${log.llmCompleted} отчётов проанализированы`;
  }

  // Основной текст — реальное состояние LLM из MetricReport
  if (withData === 0) {
    return { icon: '\u2139\uFE0F', label: 'Нет данных для анализа', description: '', subtext };
  }

  // Все с данными — completed
  if (completed === withData && failed === 0) {
    return { icon: '\u2705', label: 'Анализ завершён', description: '', subtext };
  }

  // Есть pending/processing
  if (pending > 0 || processing > 0) {
    return {
      icon: '\u23F3',
      label: 'В процессе',
      description: `${pending + processing} ожидают анализа`,
      subtext,
    };
  }

  // Все failed
  if (failed > 0 && completed === 0) {
    return {
      icon: '\uD83D\uDCD0',
      label: 'Формульный расчёт',
      description: 'LLM недоступен',
      subtext,
    };
  }

  // Частично (completed + failed/skipped)
  if (completed > 0 && (failed > 0 || skipped > 0)) {
    const extras: string[] = [];
    if (failed > 0) extras.push(`${failed} на формулах`);
    if (skipped > 0) extras.push(`${skipped} отменены`);
    return {
      icon: '\u26A0\uFE0F',
      label: 'Частично',
      description: `${completed}/${withData} проанализированы, ${extras.join(', ')}`,
      subtext,
    };
  }

  // Все skipped (например, остановлено)
  if (skipped === withData) {
    return { icon: '\u23F9', label: 'Отменён', description: '', subtext };
  }

  return { icon: '\u2139\uFE0F', label: 'Ожидание', description: '', subtext };
}

/* ─────────────────── Строка сотрудника ─────────────────── */

function getEmployeeRowInfo(emp: EmployeeDetail): { icon: string; text: string } {
  // Ошибка сбора данных
  if (emp.dataStatus === 'failed') {
    return { icon: '\u274C', text: `ошибка: ${emp.error ?? 'неизвестно'}` };
  }
  // Нет данных (нет MetricReport)
  if (emp.dataStatus === 'skipped' || emp.dataStatus === 'stopped') {
    return { icon: '\u2014', text: 'нет данных' };
  }
  // Данные собраны — смотрим на LLM
  if (emp.dataStatus === 'collected') {
    if (emp.llmStatus === 'completed') {
      return { icon: '\u2705', text: 'данные \u2705  LLM \u2705' };
    }
    if (emp.llmStatus === 'pending' || emp.llmStatus === 'processing') {
      return { icon: '\u23F3', text: 'данные \u2705  LLM \u23F3 в очереди' };
    }
    if (emp.llmStatus === 'skipped') {
      return { icon: '\u26A0\uFE0F', text: 'данные \u2705  LLM \u23F9 отменён' };
    }
    if (emp.llmStatus === 'failed') {
      return { icon: '\u26A0\uFE0F', text: 'данные \u2705  LLM \uD83D\uDCD0 формула' };
    }
  }

  return { icon: '\u2139\uFE0F', text: `${emp.dataStatus} / ${emp.llmStatus}` };
}

/* ─────────────────── Опции фильтров / группировки ─────────────────── */

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'completed', label: 'Успешно' },
  { value: 'partial', label: 'Частично' },
  { value: 'stopped', label: 'Остановлен' },
  { value: 'cancelled', label: 'Отменён' },
  { value: 'failed', label: 'Ошибка' },
  { value: 'skipped', label: 'Без изменений' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'Все типы' },
  { value: 'manual', label: 'Ручной' },
  { value: 'cron', label: 'Cron' },
];

const GROUP_OPTIONS: { value: LogGroupBy; label: string }[] = [
  { value: 'date', label: 'По дате' },
  { value: 'period', label: 'По периоду' },
];

/* ═══════════════════ Главный компонент ═══════════════════ */

export default function CollectionLogs({ subscriptions, refreshKey }: CollectionLogsProps) {
  const [data, setData] = useState<PaginatedCollectionLogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filterSubId, setFilterSubId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [groupBy, setGroupBy] = useState<LogGroupBy>('date');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Map<string, LogDetails>>(new Map());
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | 'all' | null>(null);
  const limit = 10;

  /* Загрузка логов */
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await collectionApi.getLogs({
        page,
        limit,
        subscriptionId: filterSubId || undefined,
        status: filterStatus || undefined,
        type: filterType || undefined,
      });
      setData(result);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, filterSubId, filterStatus, filterType]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  /* Раскрытие строки + lazy-load деталей */
  const toggleExpand = useCallback(
    async (logId: string) => {
      if (expandedLog === logId) {
        setExpandedLog(null);
        return;
      }
      setExpandedLog(logId);

      // Загружаем детали если нет в кеше
      if (!detailsCache.has(logId)) {
        setDetailsLoading(logId);
        try {
          const details = await collectionApi.getLogDetails(logId);
          setDetailsCache((prev) => {
            const next = new Map(prev);
            next.set(logId, details);
            return next;
          });
        } catch {
          // Error handled by interceptor
        } finally {
          setDetailsLoading(null);
        }
      }
    },
    [expandedLog, detailsCache],
  );

  /* Удаление одного лога */
  const handleDeleteLog = useCallback(
    async (logId: string) => {
      try {
        await collectionApi.deleteLog(logId);
        setDeleteTarget(null);
        setExpandedLog((prev) => (prev === logId ? null : prev));
        setDetailsCache((prev) => {
          const next = new Map(prev);
          next.delete(logId);
          return next;
        });
        fetchLogs();
      } catch {
        // Error handled by interceptor
      }
    },
    [fetchLogs],
  );

  /* Удаление всех логов */
  const handleDeleteAll = useCallback(async () => {
    try {
      await collectionApi.deleteAllLogs(filterSubId || undefined);
      setDeleteTarget(null);
      setExpandedLog(null);
      setDetailsCache(new Map());
      fetchLogs();
    } catch {
      // Error handled by interceptor
    }
  }, [fetchLogs, filterSubId]);

  /* Группировка */
  const groupedLogs = useMemo(() => {
    if (!data) return new Map<string, CollectionLogEntry[]>();
    return groupLogs(data.data, groupBy);
  }, [data, groupBy]);

  /* Количество колонок (для colSpan) */
  const colCount = groupBy === 'period' ? 6 : 7; // expand + Проект + [Период] + Тип + Статус + Обработано + действия

  const selectClass =
    'rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 outline-none focus:border-brand-500';

  return (
    <div>
      {/* ─── Заголовок + фильтры ─── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200">Логи сборов</h3>
          {data && data.data.length > 0 && (
            <button
              onClick={() => setDeleteTarget('all')}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-gray-400 dark:text-gray-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 dark:hover:text-red-400"
            >
              <Trash2 size={14} />
              Очистить логи
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Группировка */}
          <div className="flex rounded-lg border border-gray-200 dark:border-surface-border overflow-hidden">
            {GROUP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setGroupBy(opt.value)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  groupBy === opt.value
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 dark:bg-surface-lighter text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-surface-light'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Фильтр по проекту */}
          <select
            value={filterSubId}
            onChange={(e) => {
              setFilterSubId(e.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">Все проекты</option>
            {subscriptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.projectName}
              </option>
            ))}
          </select>

          {/* Фильтр по статусу */}
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Фильтр по типу */}
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── Контент ─── */}
      {loading && !data ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !data || data.data.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Нет записей</p>
      ) : (
        <>
          {[...groupedLogs.entries()].map(([groupLabel, logs]) => (
            <div key={groupLabel} className="mb-4">
              {/* Заголовок группы */}
              <div className="mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-gray-200 dark:bg-surface-border" />
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {groupLabel}
                </span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-surface-border" />
              </div>

              {/* Таблица */}
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-surface-border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-light">
                      <th className="w-8" />
                      <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Проект</th>
                      {groupBy !== 'period' && (
                        <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Период</th>
                      )}
                      <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Тип</th>
                      <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Статус</th>
                      <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Обработано</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log: CollectionLogEntry) => (
                      <LogRow
                        key={log.id}
                        log={log}
                        groupBy={groupBy}
                        expanded={expandedLog === log.id}
                        onToggle={() => toggleExpand(log.id)}
                        onDelete={() => setDeleteTarget(log.id)}
                        details={detailsCache.get(log.id) ?? null}
                        detailsLoading={detailsLoading === log.id}
                        colCount={colCount}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg p-2 text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-surface-lighter disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                      pageNum === page
                        ? 'bg-brand-500 text-white'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-lighter'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg p-2 text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-surface-lighter disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Диалог подтверждения удаления */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white dark:bg-surface-darker p-6 shadow-xl">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              {deleteTarget === 'all' ? 'Очистить все логи?' : 'Удалить запись?'}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
              {deleteTarget === 'all'
                ? `Будет удалено ${data?.total ?? 0} записей. Собранные данные и отчёты не пострадают.`
                : 'Это не повлияет на собранные данные и отчёты.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-surface-lighter"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (deleteTarget === 'all') {
                    handleDeleteAll();
                  } else {
                    handleDeleteLog(deleteTarget);
                  }
                }}
                className="rounded-lg bg-red-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-600"
              >
                {deleteTarget === 'all' ? 'Очистить' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ LogRow ═══════════════════ */

function LogRow({
  log,
  groupBy,
  expanded,
  onToggle,
  onDelete,
  details,
  detailsLoading,
  colCount,
}: {
  log: CollectionLogEntry;
  groupBy: LogGroupBy;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  details: LogDetails | null;
  detailsLoading: boolean;
  colCount: number;
}) {
  return (
    <>
      {/* Свёрнутая строка */}
      <tr
        className="group cursor-pointer border-b border-gray-200 dark:border-surface-border transition-colors hover:bg-gray-50/50 dark:hover:bg-surface-light/50"
        onClick={onToggle}
      >
        {/* Индикатор раскрытия */}
        <td className="w-8 pl-3 pr-1 py-3 select-none">
          <ChevronRight
            size={18}
            className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          />
        </td>

        {/* Проект */}
        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{log.projectName ?? '\u2014'}</td>

        {/* Период (скрыт при группировке по периоду) */}
        {groupBy !== 'period' && (
          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
            {formatPeriodCell(log.periodStart, log.periodEnd)}
          </td>
        )}

        {/* Тип */}
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{getTypeLabel(log.type)}</td>

        {/* Статус */}
        <td className="px-4 py-3">{getSmartStatusBadge(log)}</td>

        {/* Обработано */}
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{getEmployeeSummary(log)}</td>

        {/* Удалить */}
        <td className="w-10 pr-2 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-all hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
          >
            <Trash2 size={15} />
          </button>
        </td>
      </tr>

      {/* Развёрнутая панель */}
      {expanded && (
        <tr>
          <td colSpan={colCount} className="px-0 py-0">
            <div className="mx-3 my-3 rounded-lg bg-gray-50/60 dark:bg-surface-light/40 p-4">
              {detailsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="sm" />
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">Загрузка деталей...</span>
                </div>
              ) : details ? (
                <DetailPanel log={log} details={details} />
              ) : (
                <div className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                  Не удалось загрузить детали
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ═══════════════════ DetailPanel ═══════════════════ */

function DetailPanel({ log, details }: { log: CollectionLogEntry; details: LogDetails }) {
  const ytSection = getYouTrackSection(log, details.employees);
  const llmSection = getLlmSection(log, details.employees);

  return (
    <div className="space-y-3">
      {/* YouTrack секция */}
      <div className="rounded-md border border-gray-200 dark:border-surface-border bg-white/50 dark:bg-surface-lighter/30 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {'\uD83D\uDCCA'} YouTrack
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatDuration(details.youtrackDuration)}
          </span>
        </div>
        <div className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300">
          <span className="leading-none mt-px shrink-0">{ytSection.icon}</span>
          <span>
            {ytSection.label}
            {ytSection.description && (
              <span className="text-gray-400 dark:text-gray-500"> — {ytSection.description}</span>
            )}
          </span>
        </div>
        {ytSection.subtext && (
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 italic">{ytSection.subtext}</p>
        )}
      </div>

      {/* LLM секция — всегда */}
      <div className="rounded-md border border-gray-200 dark:border-surface-border bg-white/50 dark:bg-surface-lighter/30 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {'\uD83E\uDD16'} LLM-анализ
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatDuration(details.llmDuration)}
          </span>
        </div>
        <div className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300">
          <span className="leading-none mt-px shrink-0">{llmSection.icon}</span>
          <span>
            {llmSection.label}
            {llmSection.description && (
              <span className="text-gray-400 dark:text-gray-500"> — {llmSection.description}</span>
            )}
          </span>
        </div>
        {llmSection.subtext && (
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 italic">{llmSection.subtext}</p>
        )}
      </div>

      {/* Сотрудники — всегда */}
      {details.employees.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            Сотрудники ({details.employees.length})
          </h4>
          <div className="space-y-1">
            {details.employees.map((emp) => {
              const info = getEmployeeRowInfo(emp);
              return (
                <div
                  key={emp.login}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-gray-100/50 dark:hover:bg-surface-light/30"
                >
                  <span className="text-sm leading-none">{info.icon}</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200 min-w-[140px]">
                    {emp.displayName}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">{info.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Мета-информация — мелким текстом внизу */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500 pt-1">
        <span>Запущен: {formatDateTime(details.startedAt)}</span>
        {details.completedAt && (
          <span>
            {log.status === 'stopped' ? 'Остановлен' : 'Завершён'}: {formatDateTime(details.completedAt)}
          </span>
        )}
        {details.overwrite && <span>Перезапись: да</span>}
      </div>
    </div>
  );
}
