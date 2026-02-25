import { useState, useMemo, useEffect } from 'react';
import { Database } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { collectionApi } from '@/api/endpoints/collection';
import { getCurrentWeekRange } from '@/utils/week';
import type { Subscription } from '@/types/subscription';

interface CollectModalProps {
  open: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  onStarted: () => void;
}

export default function CollectModal({
  open,
  onClose,
  subscription,
  onStarted,
}: CollectModalProps) {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reset state and set current week range when modal opens
  useEffect(() => {
    if (open) {
      const { start, end } = getCurrentWeekRange();
      setPeriodStart(start);
      setPeriodEnd(end);
      setOverwrite(false);
    }
  }, [open]);

  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local tz

  const isValid = useMemo(() => {
    if (!periodStart || !periodEnd) return false;
    return periodStart < periodEnd && periodEnd <= todayStr;
  }, [periodStart, periodEnd, todayStr]);

  const handleSubmit = async () => {
    if (!isValid || !subscription) return;
    setLoading(true);
    try {
      if (overwrite) {
        await collectionApi.trigger({
          subscriptionId: subscription.id,
          periodStart,
          periodEnd,
        });
      } else {
        await collectionApi.backfill({
          subscriptionId: subscription.id,
          from: periodStart,
          to: periodEnd,
        });
      }
      toast.success(`Сбор запущен: ${subscription.projectName}`);
      onStarted();
      onClose();
    } catch {
      toast.error('Не удалось запустить сбор');
    } finally {
      setLoading(false);
    }
  };

  if (!subscription) return null;

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
        {/* Project */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-600 dark:text-gray-300">
            Проект
          </label>
          <div className="rounded-lg border border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-lighter">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <Database size={14} className="flex-shrink-0 text-brand-500" />
              <span className="text-sm text-gray-700 dark:text-gray-200 truncate">
                {subscription.projectName}
              </span>
              <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                {subscription.employeeCount} чел.
              </span>
            </div>
          </div>
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
                max={new Date().toISOString().split('T')[0]}
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
              Если отключено, будут собраны только недостающие недели
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
