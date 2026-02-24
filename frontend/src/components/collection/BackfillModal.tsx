import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { collectionApi } from '@/api/endpoints/collection';
import type { Subscription } from '@/types/subscription';

interface BackfillModalProps {
  open: boolean;
  onClose: () => void;
  subscriptions: Subscription[];
  preselectedId?: string;
  onStarted: () => void;
}

export default function BackfillModal({
  open,
  onClose,
  subscriptions,
  preselectedId,
  onStarted,
}: BackfillModalProps) {
  const [selectedId, setSelectedId] = useState(preselectedId ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset state when opening
  useState(() => {
    if (open) {
      setSelectedId(preselectedId ?? subscriptions[0]?.id ?? '');
      setDateFrom('');
      setDateTo('');
    }
  });

  const weeksEstimate = useMemo(() => {
    if (!dateFrom || !dateTo) return 0;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    if (from >= to) return 0;
    const diffMs = to.getTime() - from.getTime();
    return Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
  }, [dateFrom, dateTo]);

  const isValid = useMemo(() => {
    if (!selectedId || !dateFrom || !dateTo) return false;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const now = new Date();
    return from < to && to <= now;
  }, [selectedId, dateFrom, dateTo]);

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const result = await collectionApi.backfill({
        subscriptionId: selectedId,
        from: dateFrom,
        to: dateTo,
      });
      toast.success(`Восполнение запущено: ${result.weeksToProcess} недель`);
      onStarted();
      onClose();
    } catch {
      toast.error('Не удалось запустить восполнение');
    } finally {
      setLoading(false);
    }
  };

  const activeSubscriptions = subscriptions.filter((s) => s.isActive);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Восполнение пропусков"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" size="sm" loading={loading} disabled={!isValid} onClick={handleSubmit}>
            Запустить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">Проект</label>
          {preselectedId ? (
            <p className="rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
              {subscriptions.find((s) => s.id === preselectedId)?.projectName ?? '—'}
            </p>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500"
            >
              <option value="">Выберите проект</option>
              {activeSubscriptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.projectName} ({s.projectShortName})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">Начало</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              className="w-full rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">Конец</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              max={new Date().toISOString().split('T')[0]}
              className="w-full rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {weeksEstimate > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Будет обработано ~{weeksEstimate} {weeksEstimate === 1 ? 'неделя' : weeksEstimate < 5 ? 'недели' : 'недель'}
          </p>
        )}

        {dateFrom && dateTo && new Date(dateFrom) >= new Date(dateTo) && (
          <p className="text-sm text-red-400">Дата начала должна быть раньше даты конца</p>
        )}
      </div>
    </Modal>
  );
}
