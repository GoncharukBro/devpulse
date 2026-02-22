import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { collectionApi } from '@/api/endpoints/collection';
import type { CollectionLogEntry, PaginatedCollectionLogs } from '@/types/collection';
import type { Subscription } from '@/types/subscription';

interface CollectionLogsProps {
  subscriptions: Subscription[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="success">Успешно</Badge>;
    case 'partial':
      return <Badge variant="warning">Частично</Badge>;
    case 'error':
      return <Badge variant="danger">Ошибка</Badge>;
    case 'running':
      return <Badge variant="info">Выполняется</Badge>;
    case 'queued':
      return <Badge variant="neutral">В очереди</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'manual':
      return 'ручной';
    case 'scheduled':
      return 'cron';
    case 'backfill':
      return 'backfill';
    default:
      return type;
  }
}

export default function CollectionLogs({ subscriptions }: CollectionLogsProps) {
  const [data, setData] = useState<PaginatedCollectionLogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filterSubId, setFilterSubId] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const limit = 10;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await collectionApi.getLogs({
        page,
        limit,
        subscriptionId: filterSubId || undefined,
      });
      setData(result);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, filterSubId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const toggleExpand = (logId: string) => {
    setExpandedLog((prev) => (prev === logId ? null : logId));
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200">Логи сборов</h3>
        <select
          value={filterSubId}
          onChange={(e) => {
            setFilterSubId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 outline-none focus:border-brand-500"
        >
          <option value="">Все проекты</option>
          {subscriptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.projectName}
            </option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !data || data.data.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Нет записей</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-surface-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-light">
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Проект</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Период</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Тип</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Статус</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Обраб.</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Время</th>
                  <th className="w-8 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((log: CollectionLogEntry) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    expanded={expandedLog === log.id}
                    onToggle={() => toggleExpand(log.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg p-2 text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-surface-lighter disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                    p === page
                      ? 'bg-brand-500 text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-lighter'
                  }`}
                >
                  {p}
                </button>
              ))}
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
    </div>
  );
}

function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: CollectionLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-gray-200 dark:border-surface-border transition-colors hover:bg-gray-50/50 dark:hover:bg-surface-light/50"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{log.projectName ?? '—'}</td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
          {log.periodStart && log.periodEnd
            ? `${log.periodStart} — ${log.periodEnd}`
            : '—'}
        </td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{getTypeLabel(log.type)}</td>
        <td className="px-4 py-3">{getStatusBadge(log.status)}</td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
          {log.processedEmployees}/{log.totalEmployees}
        </td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{log.duration ?? '—'}</td>
        <td className="px-2 py-3 text-gray-400 dark:text-gray-500">
          {log.errors.length > 0 &&
            (expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
        </td>
      </tr>
      {expanded && log.errors.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-gray-50/30 dark:bg-surface-light/30 px-4 py-3">
            <div className="space-y-1">
              <span className="text-xs font-medium text-red-400">Ошибки:</span>
              {log.errors.map((err, i) => (
                <div key={i} className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="text-gray-600 dark:text-gray-300">{err.login}</span>: {err.error}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
