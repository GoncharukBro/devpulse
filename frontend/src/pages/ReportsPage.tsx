import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Trash2, User, FolderKanban, Users, ChevronDown, ChevronRight, Database, Brain, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
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

type PipelineStep = {
  key: string;
  label: string;
  icon: React.ElementType;
  status: 'done' | 'active' | 'pending' | 'failed';
  detail?: string;
};

function getPipelineSteps(report: AggregatedReportDTO): PipelineStep[] {
  const s = report.status;
  const p = report.progress;

  const collecting: PipelineStep = {
    key: 'collecting',
    label: 'Сбор данных',
    icon: Database,
    status: s === 'collecting' ? 'active'
      : (s === 'analyzing' || s === 'ready' || s === 'partial') ? 'done'
      : s === 'failed' && !report.collectedData ? 'failed'
      : 'pending',
  };
  if (s === 'collecting' && p) {
    collecting.detail = `${p.completed}/${p.total}${p.currentStep ? ` · ${p.currentStep}` : ''}`;
  } else if (collecting.status === 'done' && report.collectedData) {
    const empCount = (report.collectedData as any)?.employees?.length ?? 0;
    collecting.detail = `${empCount} сотр.`;
  }

  const analyzing: PipelineStep = {
    key: 'analyzing',
    label: 'LLM-анализ',
    icon: Brain,
    status: s === 'analyzing' ? 'active'
      : (s === 'ready' || s === 'partial') ? 'done'
      : s === 'failed' && report.collectedData ? 'failed'
      : 'pending',
  };
  if (s === 'analyzing' && p) {
    analyzing.detail = `${p.completed}/${p.total}${p.currentStep ? ` · ${p.currentStep}` : ''}`;
  }

  const ready: PipelineStep = {
    key: 'ready',
    label: s === 'partial' ? 'Частично готов' : s === 'failed' ? 'Ошибка' : 'Готов',
    icon: s === 'failed' ? XCircle : s === 'partial' ? AlertTriangle : CheckCircle2,
    status: s === 'ready' ? 'done'
      : s === 'partial' ? 'done'
      : s === 'failed' ? 'failed'
      : 'pending',
  };
  if (s === 'ready' && report.aggregatedMetrics.avgScore != null) {
    ready.detail = `Score: ${Math.round(report.aggregatedMetrics.avgScore)}`;
  }
  if (report.errorMessage && s === 'failed') {
    ready.detail = report.errorMessage;
  }

  return [collecting, analyzing, ready];
}

const stepColors: Record<PipelineStep['status'], { dot: string; line: string; text: string }> = {
  done: { dot: 'bg-emerald-500', line: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  active: { dot: 'bg-brand-500 animate-pulse', line: 'bg-gray-300 dark:bg-gray-600', text: 'text-brand-500' },
  pending: { dot: 'bg-gray-300 dark:bg-gray-600', line: 'bg-gray-300 dark:bg-gray-600', text: 'text-gray-400 dark:text-gray-500' },
  failed: { dot: 'bg-red-500', line: 'bg-red-300', text: 'text-red-600 dark:text-red-400' },
};

function ReportPipeline({ report }: { report: AggregatedReportDTO }) {
  const steps = getPipelineSteps(report);

  return (
    <div className="flex items-start gap-0">
      {steps.map((step, i) => {
        const colors = stepColors[step.status];
        const StepIcon = step.icon;
        return (
          <React.Fragment key={step.key}>
            {/* Step */}
            <div className="flex flex-col items-center" style={{ minWidth: 120 }}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${colors.dot}`}>
                <StepIcon size={16} className="text-white" />
              </div>
              <span className={`mt-1.5 text-xs font-medium ${colors.text}`}>{step.label}</span>
              {step.detail && (
                <span className="mt-0.5 max-w-[140px] truncate text-center text-[10px] text-gray-500 dark:text-gray-400">
                  {step.detail}
                </span>
              )}
            </div>
            {/* Connector */}
            {i < steps.length - 1 && (
              <div className="mt-3.5 flex-1" style={{ minWidth: 40 }}>
                <div className={`h-0.5 w-full ${step.status === 'done' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
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
                const isExpanded = expandedId === report.id;
                const isInProgress = report.status === 'collecting' || report.status === 'analyzing' || report.status === 'generating';
                return (
                  <React.Fragment key={report.id}>
                    <tr
                      onClick={() => isInProgress ? toggleExpand(report.id) : navigate(`/reports/${report.id}`)}
                      className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-surface-lighter"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isInProgress ? (
                            isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />
                          ) : (
                            <Icon size={16} className="text-gray-400" />
                          )}
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
                            <ReportPipeline report={expandedReport} />
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
