import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import { aggregatedReportsApi } from '@/api/endpoints/aggregated-reports';
import { reportsApi } from '@/api/endpoints/reports';
import { subscriptionsApi } from '@/api/endpoints/subscriptions';
import { teamsApi } from '@/api/endpoints/teams';
import { getMonday, getWeekEnd, getWeeksCount, formatDateDisplay } from '@/utils/week';
import type { PreviewResponse } from '@/types/aggregated-report';

interface CreateReportModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type ReportType = 'employee' | 'project' | 'team';

interface TargetOption {
  id: string;
  name: string;
}

export default function CreateReportModal({ open, onClose, onCreated }: CreateReportModalProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [type, setType] = useState<ReportType>('employee');
  const [targetId, setTargetId] = useState('');
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate rounded period info
  const periodInfo = dateFrom && dateTo ? (() => {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const monday = getMonday(from);
    const sunday = getWeekEnd(to);
    const weeks = getWeeksCount(from, to);
    return { monday, sunday, weeks };
  })() : null;

  // Load targets when type changes
  useEffect(() => {
    if (!open) return;
    setTargetId('');
    setTargets([]);
    setPreview(null);
    setTargetsLoading(true);

    const loadTargets = async () => {
      try {
        if (type === 'employee') {
          const employees = await reportsApi.getEmployees();
          setTargets(employees.map(e => ({ id: e.youtrackLogin, name: e.displayName })));
        } else if (type === 'project') {
          const subs = await subscriptionsApi.list();
          setTargets(subs.map(s => ({ id: s.id, name: s.projectName })));
        } else {
          const teams = await teamsApi.list();
          setTargets(teams.map(t => ({ id: t.id, name: t.name })));
        }
      } catch {
        setError('Не удалось загрузить список');
      } finally {
        setTargetsLoading(false);
      }
    };
    loadTargets();
  }, [type, open]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setDateFrom('');
      setDateTo('');
      setType('employee');
      setTargetId('');
      setPreview(null);
      setError(null);
    }
  }, [open]);

  const canPreview = dateFrom && dateTo && targetId && !previewLoading;

  const handlePreview = useCallback(async () => {
    if (!canPreview) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const result = await aggregatedReportsApi.preview({
        type, targetId, dateFrom, dateTo,
      });
      setPreview(result);
    } catch {
      setError('Не удалось выполнить предпросмотр');
    } finally {
      setPreviewLoading(false);
    }
  }, [canPreview, type, targetId, dateFrom, dateTo]);

  const handleCreate = useCallback(async () => {
    if (!targetId || !dateFrom || !dateTo) return;
    setCreating(true);
    setError(null);
    try {
      await aggregatedReportsApi.create({ type, targetId, dateFrom, dateTo });
      onCreated();
      onClose();
    } catch {
      setError('Не удалось создать отчёт');
    } finally {
      setCreating(false);
    }
  }, [type, targetId, dateFrom, dateTo, onCreated, onClose]);

  const typeLabels: Record<ReportType, string> = {
    employee: 'Сотрудник',
    project: 'Проект',
    team: 'Команда',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Сформировать отчёт"
      autoFocus={false}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 dark:border-surface-border px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-surface-lighter"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={!canPreview}
            className="rounded-lg border border-brand-500 px-4 py-2 text-sm font-medium text-brand-500 transition-colors hover:bg-brand-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {previewLoading ? 'Загрузка...' : 'Предпросмотр'}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !targetId || !dateFrom || !dateTo}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Создание...' : 'Сформировать'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">От</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPreview(null); }}
              className="w-full rounded-lg border border-gray-300 dark:border-surface-border bg-white dark:bg-surface px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">До</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPreview(null); }}
              className="w-full rounded-lg border border-gray-300 dark:border-surface-border bg-white dark:bg-surface px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Period info */}
        {periodInfo && (
          <div className="rounded-lg bg-gray-50 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
            Будет агрегировано <span className="font-medium text-gray-900 dark:text-gray-100">{periodInfo.weeks} нед.</span>:{' '}
            {formatDateDisplay(periodInfo.monday)} — {formatDateDisplay(periodInfo.sunday)}
          </div>
        )}

        {/* Type selector */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Уровень</label>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value as ReportType); setPreview(null); }}
            className="w-full rounded-lg border border-gray-300 dark:border-surface-border bg-white dark:bg-surface px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="employee">Сотрудник</option>
            <option value="project">Проект</option>
            <option value="team">Команда</option>
          </select>
        </div>

        {/* Target selector */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {typeLabels[type]}
          </label>
          <select
            value={targetId}
            onChange={(e) => { setTargetId(e.target.value); setPreview(null); }}
            disabled={targetsLoading}
            className="w-full rounded-lg border border-gray-300 dark:border-surface-border bg-white dark:bg-surface px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          >
            <option value="">
              {targetsLoading ? 'Загрузка...' : 'Выберите...'}
            </option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Preview result */}
        {preview && (
          <div className="rounded-lg border border-gray-200 dark:border-surface-border p-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Предпросмотр: {preview.targetName}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {preview.periodStart} — {preview.periodEnd} · {preview.weeksCount} нед. · данные за {preview.availableWeeks} нед.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-gray-50 dark:bg-surface-lighter p-2">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{preview.aggregatedMetrics.avgScore !== null ? Math.round(preview.aggregatedMetrics.avgScore) : '—'}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Score</div>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-surface-lighter p-2">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{preview.aggregatedMetrics.completedIssues}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Закрыто задач</div>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-surface-lighter p-2">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{preview.aggregatedMetrics.totalSpentHours.toFixed(0)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Часов</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
