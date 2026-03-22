import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Trash2, User, FolderKanban, Users } from 'lucide-react';
import { aggregatedReportsApi } from '@/api/endpoints/aggregated-reports';
import CreateReportModal from '@/components/reports/CreateReportModal';
import ReportStatusBadge from '@/components/reports/ReportStatusBadge';
import type { ListResponse } from '@/types/aggregated-report';

const typeIcons: Record<string, React.ElementType> = {
  employee: User,
  project: FolderKanban,
  team: Users,
};

const typeLabels: Record<string, string> = {
  employee: 'Сотрудник',
  project: 'Проект',
  team: 'Команда',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const result = await aggregatedReportsApi.list({
        type: typeFilter || undefined,
        page,
        limit: 20,
      });
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // Polling for generating reports
  useEffect(() => {
    const hasGenerating = data?.data.some(r => r.status === 'generating');
    if (hasGenerating) {
      pollingRef.current = setInterval(loadData, 5000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [data, loadData]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Удалить отчёт?')) return;
    try {
      await aggregatedReportsApi.remove(id);
      loadData();
    } catch {
      // ignore
    }
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText size={24} className="text-brand-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Отчёты</h1>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          Сформировать отчёт
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 dark:border-surface-border bg-white dark:bg-surface px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
        >
          <option value="">Все типы</option>
          <option value="employee">Сотрудники</option>
          <option value="project">Проекты</option>
          <option value="team">Команды</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-lg bg-gray-100 dark:bg-surface-lighter" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-surface-border p-12 text-center">
          <FileText size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">Нет отчётов</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">Нажмите «Сформировать отчёт» для создания</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-surface-border">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-surface-lighter">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Тип</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Цель</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Период</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Нед.</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Score</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Статус</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Создан</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-surface-border">
              {data.data.map((report) => {
                const Icon = typeIcons[report.type] ?? FileText;
                return (
                  <tr
                    key={report.id}
                    onClick={() => navigate(`/reports/${report.id}`)}
                    className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-surface-lighter"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-300">{typeLabels[report.type]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{report.targetName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-300">{report.weeksCount}</td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                      {report.avgScore !== null ? Math.round(report.avgScore) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ReportStatusBadge status={report.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(report.createdAt)}
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, report.id)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                        title="Удалить"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-gray-300 dark:border-surface-border px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            ←
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-gray-300 dark:border-surface-border px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            →
          </button>
        </div>
      )}

      <CreateReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={loadData}
      />
    </div>
  );
}
