import { useState, useMemo, useEffect } from 'react';
import { Database, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { collectionApi } from '@/api/endpoints/collection';
import { getCurrentWeekRange } from '@/utils/week';
import type { Subscription } from '@/types/subscription';

interface CollectAllModalProps {
  open: boolean;
  onClose: () => void;
  subscriptions: Subscription[];
  onStarted: () => void;
}

export default function CollectAllModal({
  open,
  onClose,
  subscriptions,
  onStarted,
}: CollectAllModalProps) {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const activeSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.isActive),
    [subscriptions],
  );

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      const { start, end } = getCurrentWeekRange();
      setPeriodStart(start);
      setPeriodEnd(end);
      setOverwrite(false);
      // Select all active by default
      setSelectedIds(new Set(activeSubscriptions.map((s) => s.id)));
    }
  }, [open, activeSubscriptions]);

  const todayStr = new Date().toLocaleDateString('en-CA');

  const isValid = useMemo(() => {
    if (!periodStart || !periodEnd) return false;
    return periodStart < periodEnd && periodEnd <= todayStr && selectedIds.size > 0;
  }, [periodStart, periodEnd, todayStr, selectedIds.size]);

  const toggleSubscription = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === activeSubscriptions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeSubscriptions.map((s) => s.id)));
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await collectionApi.triggerAll({
        subscriptionIds: [...selectedIds],
        periodStart,
        periodEnd,
        overwrite,
      });
      toast.success(`Сбор запущен для ${selectedIds.size} проектов`);
      onStarted();
      onClose();
    } catch {
      toast.error('Не удалось запустить сбор');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Запустить сбор"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            disabled={!isValid}
            onClick={handleSubmit}
          >
            Запустить
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Projects with checkboxes */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">
              Проекты
              <span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500">
                ({selectedIds.size}/{activeSubscriptions.length})
              </span>
            </label>
            <button
              onClick={toggleAll}
              className="text-xs text-brand-500 hover:text-brand-600 transition-colors"
            >
              {selectedIds.size === activeSubscriptions.length ? 'Снять все' : 'Выбрать все'}
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-lighter">
            {activeSubscriptions.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                Нет активных проектов
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-surface-border">
                {activeSubscriptions.map((sub) => {
                  const isChecked = selectedIds.has(sub.id);
                  return (
                    <li
                      key={sub.id}
                      onClick={() => toggleSubscription(sub.id)}
                      className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-surface-light transition-colors"
                    >
                      <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                        isChecked
                          ? 'border-brand-500 bg-brand-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {isChecked && <Check size={10} className="text-white" />}
                      </div>
                      <Database size={14} className="flex-shrink-0 text-brand-500" />
                      <span className="text-sm text-gray-700 dark:text-gray-200 truncate">
                        {sub.projectName}
                      </span>
                      <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {sub.employeeCount} чел.
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selectedIds.size === 0 && activeSubscriptions.length > 0 && (
            <p className="mt-1 text-xs text-red-400">Выберите хотя бы один проект</p>
          )}
        </div>

        {/* Period */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-600 dark:text-gray-300">
            Период сбора
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-xs text-gray-400 dark:text-gray-500">Начало</span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                max={periodEnd || undefined}
                className="w-full rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none transition-colors focus:border-brand-500 dark:focus:border-brand-500"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs text-gray-400 dark:text-gray-500">Конец</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                min={periodStart || undefined}
                max={todayStr}
                className="w-full rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none transition-colors focus:border-brand-500 dark:focus:border-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Overwrite checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="relative mt-0.5 flex-shrink-0">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="peer sr-only"
            />
            <div className="h-5 w-5 rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-surface-lighter transition-colors peer-checked:border-brand-500 peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-gray-900 group-hover:border-gray-400 dark:group-hover:border-gray-500" />
            <svg
              className="absolute inset-0 h-5 w-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Перезаписать существующие данные
            </span>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              Если отключено, будут собраны только недостающие данные
            </p>
          </div>
        </label>

        {/* Validation */}
        {periodStart && periodEnd && periodStart >= periodEnd && (
          <p className="text-sm text-red-400">Дата начала должна быть раньше даты конца</p>
        )}
      </div>
    </Modal>
  );
}
