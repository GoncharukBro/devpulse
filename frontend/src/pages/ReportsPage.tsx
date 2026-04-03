import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Trash2, User, FolderKanban, Users, ChevronDown, ChevronRight,
  Database, Brain, CheckCircle2, XCircle, AlertTriangle, Clock,
  ExternalLink, ArrowRight, Loader2, CheckCircle,
} from 'lucide-react';
import { aggregatedReportsApi } from '@/api/endpoints/aggregated-reports';
import CreateReportModal from '@/components/reports/CreateReportModal';
import ReportStatusBadge from '@/components/reports/ReportStatusBadge';
import type { ListResponse, AggregatedReportDTO } from '@/types/aggregated-report';

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

// ─── Pipeline visualization for expanded row (styled like CollectionLogs) ────

function getPhaseInfo(
  report: AggregatedReportDTO,
  phase: 'collecting' | 'analyzing',
): { icon: React.ReactNode; label: string; subtext?: string; progress?: string } {
  const s = report.status;
  const p = report.progress;
  const cd = report.collectedData as any;

  if (phase === 'collecting') {
    // Done
    if (s !== 'collecting' && cd) {
      const empCount = cd?.employees?.length ?? 0;
      const totalIssues = report.aggregatedMetrics?.totalIssues ?? 0;
      return {
        icon: <CheckCircle size={13} className="text-emerald-500 shrink-0" />,
        label: 'Данные собраны',
        subtext: `${empCount} сотр., ${totalIssues} задач`,
      };
    }
    // Active
    if (s === 'collecting' && p) {
      return {
        icon: <Loader2 size={13} className="text-brand-500 animate-spin shrink-0" />,
        label: p.currentStep ?? 'Сбор данных...',
        progress: `${p.completed}/${p.total}`,
      };
    }
    // Failed
    if (s === 'failed' && !cd) {
      return {
        icon: <XCircle size={13} className="text-red-500 shrink-0" />,
        label: 'Сбор не удался',
        subtext: report.errorMessage ?? undefined,
      };
    }
    // Pending
    return { icon: <Clock size={13} className="text-gray-400 shrink-0" />, label: 'Ожидание' };
  }

  // analyzing
  if (s === 'ready' || s === 'partial') {
    const analyzed = (report.employeesData as any[])?.filter((e: any) => e.llmScore != null).length ?? 0;
    const total = (report.employeesData as any[])?.filter((e: any) => e.projectName !== 'Итого').length ?? 0;
    return {
      icon: <CheckCircle size={13} className="text-emerald-500 shrink-0" />,
      label: 'Анализ завершён',
      subtext: total > 0 ? `${analyzed}/${total} сотр.` : undefined,
    };
  }
  if ((s === 'analyzing' || s === 'generating') && p) {
    return {
      icon: <Loader2 size={13} className="text-brand-500 animate-spin shrink-0" />,
      label: p.currentStep ?? 'Анализ...',
      progress: `${p.completed}/${p.total}`,
    };
  }
  if (s === 'failed' && cd) {
    return {
      icon: <XCircle size={13} className="text-red-500 shrink-0" />,
      label: 'Анализ не удался',
      subtext: report.errorMessage ?? undefined,
    };
  }
  return { icon: <Clock size={13} className="text-gray-400 shrink-0" />, label: 'Ожидание' };
}

function ReportPipeline({ report, onOpen }: { report: AggregatedReportDTO; onOpen: () => void }) {
  const cd = report.collectedData as any;
  const m = report.aggregatedMetrics;
  const isFinished = report.status === 'ready' || report.status === 'partial' || report.status === 'failed';
  const ytInfo = getPhaseInfo(report, 'collecting');
  const llmInfo = getPhaseInfo(report, 'analyzing');

  const employees = cd?.employees as any[] | undefined;

  return (
    <div className="space-y-2.5">
      {/* Pipeline: YouTrack → LLM (same style as CollectionLogs) */}
      <div className="flex items-stretch gap-0 rounded-md border border-gray-200 dark:border-surface-border overflow-hidden">
        {/* YouTrack */}
        <div className="flex-1 bg-white/50 dark:bg-surface-lighter/30 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">YouTrack</span>
            {ytInfo.progress && (
              <span className="text-xs text-brand-500 font-medium">{ytInfo.progress}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
            {ytInfo.icon}
            <span className="font-medium">{ytInfo.label}</span>
          </div>
          {ytInfo.subtext && (
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 italic">{ytInfo.subtext}</p>
          )}
          {/* Progress bar */}
          {report.progress && report.status === 'collecting' && report.progress.total > 0 && (
            <div className="mt-1.5 h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-1 rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${Math.round((report.progress.completed / report.progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Arrow separator */}
        <div className="flex items-center px-2 bg-gray-100/60 dark:bg-surface-lighter/40 select-none">
          <ArrowRight size={14} className="text-gray-300 dark:text-gray-600" />
        </div>

        {/* LLM */}
        <div className="flex-1 bg-white/50 dark:bg-surface-lighter/30 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">LLM-анализ</span>
            {llmInfo.progress && (
              <span className="text-xs text-brand-500 font-medium">{llmInfo.progress}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
            {llmInfo.icon}
            <span className="font-medium">{llmInfo.label}</span>
          </div>
          {llmInfo.subtext && (
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 italic">{llmInfo.subtext}</p>
          )}
          {/* Progress bar */}
          {report.progress && (report.status === 'analyzing' || report.status === 'generating') && report.progress.total > 0 && (
            <div className="mt-1.5 h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-1 rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${Math.round((report.progress.completed / report.progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Employees list (like CollectionLogs) */}
      {employees && employees.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-surface-border rounded-md border border-gray-200 dark:border-surface-border overflow-hidden">
          {employees.map((emp: any, i: number) => {
            const hasLlm = report.employeesData?.some(
              (e: any) => e.youtrackLogin === emp.login && e.projectName === emp.projectName && e.llmScore != null
            );
            return (
              <div
                key={`${emp.login}-${emp.projectName ?? i}`}
                className="flex items-center gap-3 px-3 py-1.5 text-xs bg-white/50 dark:bg-surface-lighter/30"
              >
                <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                <span className="font-medium text-gray-700 dark:text-gray-200 w-40 shrink-0 truncate">
                  {emp.displayName}
                </span>
                {emp.projectName && (
                  <span className="text-gray-400 dark:text-gray-500 w-32 truncate">{emp.projectName}</span>
                )}
                <span className="text-gray-400 dark:text-gray-500">
                  данные ✓ {hasLlm ? 'LLM ✓' : report.status === 'analyzing' ? 'LLM ⏳' : report.status === 'collecting' ? '' : 'LLM —'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
        <span>Создан: {formatDate(report.createdAt)}</span>
        {m && m.totalIssues > 0 && (
          <span>{m.completedIssues}/{m.totalIssues} задач · {Math.round(m.totalSpentHours)}ч{m.avgUtilization != null ? ` · загр. ${Math.round(m.avgUtilization)}%` : ''}</span>
        )}
        {report.errorMessage && (
          <span className="text-red-500">{report.errorMessage}</span>
        )}
        {isFinished && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="ml-auto flex items-center gap-1 text-brand-500 font-medium hover:text-brand-400 transition-colors"
          >
            Открыть отчёт <ExternalLink size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<AggregatedReportDTO | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expandPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    const hasInProgress = data?.data.some(
      r => r.status === 'generating' || r.status === 'collecting' || r.status === 'analyzing',
    );
    if (hasInProgress) {
      pollingRef.current = setInterval(loadData, 5000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [data, loadData]);

  // Expand/collapse row with detail loading + polling
  const toggleExpand = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedReport(null);
      if (expandPollingRef.current) {
        clearInterval(expandPollingRef.current);
        expandPollingRef.current = null;
      }
      return;
    }

    setExpandedId(id);
    setExpandedReport(null);
    setExpandedLoading(true);

    try {
      const detail = await aggregatedReportsApi.getById(id);
      setExpandedReport(detail);
    } catch {
      // ignore
    } finally {
      setExpandedLoading(false);
    }
  }, [expandedId]);

  // Poll expanded report while in progress
  useEffect(() => {
    if (!expandedId || !expandedReport) return;
    const isInProg = expandedReport.status === 'collecting' || expandedReport.status === 'analyzing' || expandedReport.status === 'generating';
    if (isInProg) {
      expandPollingRef.current = setInterval(async () => {
        try {
          const updated = await aggregatedReportsApi.getById(expandedId);
          setExpandedReport(updated);
        } catch { /* ignore */ }
      }, 3000);
    }
    return () => {
      if (expandPollingRef.current) {
        clearInterval(expandPollingRef.current);
        expandPollingRef.current = null;
      }
    };
  }, [expandedId, expandedReport?.status]);

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Отчёты</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Формирование отчётов за произвольный период с AI-анализом
          </p>
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
                const isExpanded = expandedId === report.id;
                return (
                  <React.Fragment key={report.id}>
                    <tr
                      onClick={() => toggleExpand(report.id)}
                      className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-surface-lighter"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                          <Icon size={16} className="text-gray-400 shrink-0" />
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

                    {/* Expanded pipeline row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50/50 dark:bg-surface-lighter/50 px-4 py-4">
                          {expandedLoading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
                              Загрузка...
                            </div>
                          ) : expandedReport ? (
                            <ReportPipeline report={expandedReport} onOpen={() => navigate(`/reports/${report.id}`)} />
                          ) : (
                            <p className="text-sm text-gray-500">Не удалось загрузить</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
