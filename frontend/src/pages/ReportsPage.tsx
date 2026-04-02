import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Trash2, User, FolderKanban, Users, ChevronDown, ChevronRight,
  Database, Brain, CheckCircle2, XCircle, AlertTriangle, Clock, BarChart3,
  ExternalLink, ListChecks,
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

// ─── Pipeline visualization for expanded row ───────────────────────────

type StepStatus = 'done' | 'active' | 'pending' | 'failed';

interface PipelineStep {
  key: string;
  label: string;
  icon: React.ElementType;
  status: StepStatus;
  detail?: string;
  progress?: { completed: number; total: number };
}

function resolveStepStatus(
  reportStatus: string,
  collectedData: unknown | null,
  phase: 'collecting' | 'analyzing' | 'ready',
): StepStatus {
  const s = reportStatus;
  if (phase === 'collecting') {
    if (s === 'collecting') return 'active';
    if (s === 'analyzing' || s === 'ready' || s === 'partial' || s === 'generating') return 'done';
    if (s === 'failed' && !collectedData) return 'failed';
    return 'pending';
  }
  if (phase === 'analyzing') {
    if (s === 'analyzing' || s === 'generating') return 'active';
    if (s === 'ready' || s === 'partial') return 'done';
    if (s === 'failed' && collectedData) return 'failed';
    return 'pending';
  }
  // ready
  if (s === 'ready') return 'done';
  if (s === 'partial') return 'done';
  if (s === 'failed') return 'failed';
  return 'pending';
}

function getPipelineSteps(report: AggregatedReportDTO): PipelineStep[] {
  const s = report.status;
  const p = report.progress;
  const cd = report.collectedData as any;

  const collecting: PipelineStep = {
    key: 'collecting',
    label: 'Сбор из YouTrack',
    icon: Database,
    status: resolveStepStatus(s, cd, 'collecting'),
  };
  if (s === 'collecting' && p) {
    collecting.progress = { completed: p.completed, total: p.total };
    collecting.detail = p.currentStep ?? undefined;
  } else if (collecting.status === 'done' && cd) {
    const empCount = cd?.employees?.length ?? 0;
    const totalIssues = report.aggregatedMetrics?.totalIssues ?? 0;
    collecting.detail = `${empCount} сотр., ${totalIssues} задач`;
  }

  const analyzing: PipelineStep = {
    key: 'analyzing',
    label: 'LLM-анализ',
    icon: Brain,
    status: resolveStepStatus(s, cd, 'analyzing'),
  };
  if ((s === 'analyzing' || s === 'generating') && p) {
    analyzing.progress = { completed: p.completed, total: p.total };
    analyzing.detail = p.currentStep ?? undefined;
  } else if (analyzing.status === 'done') {
    const analyzed = (report.employeesData as any[])?.filter((e: any) => e.llmScore != null).length ?? 0;
    analyzing.detail = analyzed > 0 ? `${analyzed} анализов` : undefined;
  }

  const ready: PipelineStep = {
    key: 'ready',
    label: s === 'partial' ? 'Частично готов' : s === 'failed' ? 'Ошибка' : 'Готов',
    icon: s === 'failed' ? XCircle : s === 'partial' ? AlertTriangle : CheckCircle2,
    status: resolveStepStatus(s, cd, 'ready'),
  };
  if ((s === 'ready' || s === 'partial') && report.aggregatedMetrics?.avgScore != null) {
    ready.detail = `Score: ${Math.round(report.aggregatedMetrics.avgScore)}`;
  }

  return [collecting, analyzing, ready];
}

const statusStyles: Record<StepStatus, { ring: string; bg: string; icon: string; label: string }> = {
  done:    { ring: 'ring-emerald-500/20', bg: 'bg-emerald-500',               icon: 'text-white',   label: 'text-emerald-600 dark:text-emerald-400' },
  active:  { ring: 'ring-brand-500/30',   bg: 'bg-brand-500 animate-pulse',   icon: 'text-white',   label: 'text-brand-500' },
  pending: { ring: 'ring-gray-300/20 dark:ring-gray-600/20', bg: 'bg-gray-300 dark:bg-gray-600', icon: 'text-gray-500 dark:text-gray-400', label: 'text-gray-400 dark:text-gray-500' },
  failed:  { ring: 'ring-red-500/20',     bg: 'bg-red-500',                   icon: 'text-white',   label: 'text-red-600 dark:text-red-400' },
};

function ReportPipeline({ report, onOpen }: { report: AggregatedReportDTO; onOpen: () => void }) {
  const steps = getPipelineSteps(report);
  const m = report.aggregatedMetrics;
  const cd = report.collectedData as any;
  const isFinished = report.status === 'ready' || report.status === 'partial' || report.status === 'failed';
  const elapsed = report.createdAt
    ? Math.round((Date.now() - new Date(report.createdAt).getTime()) / 1000)
    : 0;

  return (
    <div className="space-y-4">
      {/* Pipeline steps */}
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const st = statusStyles[step.status];
          const StepIcon = step.icon;
          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center" style={{ minWidth: 140 }}>
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ring-4 ${st.ring} ${st.bg}`}>
                  <StepIcon size={18} className={st.icon} />
                </div>
                <span className={`mt-2 text-xs font-semibold ${st.label}`}>{step.label}</span>
                {step.progress && (
                  <div className="mt-1.5 w-24">
                    <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-1.5 rounded-full bg-brand-500 transition-all duration-500"
                        style={{ width: `${step.progress.total > 0 ? Math.round((step.progress.completed / step.progress.total) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="mt-0.5 block text-center text-[10px] text-gray-500 dark:text-gray-400">
                      {step.progress.completed} / {step.progress.total}
                    </span>
                  </div>
                )}
                {!step.progress && step.detail && (
                  <span className="mt-1 max-w-[160px] truncate text-center text-[11px] text-gray-500 dark:text-gray-400">
                    {step.detail}
                  </span>
                )}
              </div>
              {i < steps.length - 1 && (
                <div className="mb-6 flex-1" style={{ minWidth: 32 }}>
                  <div className={`h-0.5 w-full rounded ${
                    step.status === 'done' ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Info cards row */}
      <div className="flex flex-wrap items-stretch gap-3">
        {/* Elapsed time */}
        {!isFinished && elapsed > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-surface px-3 py-2">
            <Clock size={14} className="text-gray-400" />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {elapsed < 60 ? `${elapsed}с` : `${Math.floor(elapsed / 60)}м ${elapsed % 60}с`}
            </span>
          </div>
        )}

        {/* Collected metrics summary */}
        {m && m.totalIssues > 0 && (
          <div className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-surface px-3 py-2">
            <div className="flex items-center gap-1.5">
              <ListChecks size={14} className="text-gray-400" />
              <span className="text-xs text-gray-600 dark:text-gray-300">
                <span className="font-medium">{m.completedIssues}</span>/{m.totalIssues} задач
              </span>
            </div>
            {m.overdueIssues > 0 && (
              <span className="text-xs text-red-500">
                {m.overdueIssues} просроч.
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-gray-400" />
              <span className="text-xs text-gray-600 dark:text-gray-300">
                <span className="font-medium">{Math.round(m.totalSpentHours)}</span>ч
              </span>
            </div>
            {m.avgUtilization != null && (
              <div className="flex items-center gap-1.5">
                <BarChart3 size={14} className="text-gray-400" />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  загр. <span className="font-medium">{Math.round(m.avgUtilization)}%</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Employees collected */}
        {cd?.employees?.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-surface px-3 py-2">
            <Users size={14} className="text-gray-400" />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">{cd.employees.length}</span> сотр. собрано
            </span>
          </div>
        )}

        {/* Error message */}
        {report.errorMessage && (
          <div className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 px-3 py-2">
            <XCircle size={14} className="text-red-500" />
            <span className="text-xs text-red-600 dark:text-red-400">{report.errorMessage}</span>
          </div>
        )}

        {/* Open report link (when finished) */}
        {isFinished && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/5 px-3 py-2 text-xs font-medium text-brand-500 transition-colors hover:bg-brand-500/10"
          >
            Открыть отчёт
            <ExternalLink size={12} />
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
          <div className="flex items-center gap-3">
            <FileText size={24} className="text-brand-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Отчёты</h1>
          </div>
          <p className="mt-1 ml-[36px] text-sm text-gray-500 dark:text-gray-400">
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
