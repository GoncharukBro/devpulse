import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Play, Clock, Users, Calendar, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import type { Subscription } from '@/types/subscription';
import type { CollectionProgress } from '@/types/collection';

interface SubscriptionCardProps {
  subscription: Subscription;
  activeCollection?: CollectionProgress;
  onTrigger: (id: string) => void;
  onBackfill: (id: string) => void;
  onEdit: (id: string) => void;
  onFieldMapping: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  triggerLoading?: boolean;
}

function getStatusIndicator(subscription: Subscription): {
  color: string;
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'neutral';
} {
  if (!subscription.isActive) {
    return { color: 'bg-gray-500', label: 'Деактивирован', variant: 'neutral' };
  }
  if (!subscription.lastCollection) {
    return { color: 'bg-gray-500', label: 'Нет данных', variant: 'neutral' };
  }
  const { status } = subscription.lastCollection;
  if (status === 'completed') {
    return { color: 'bg-emerald-500', label: 'Успешно', variant: 'success' };
  }
  if (status === 'partial') {
    return { color: 'bg-amber-500', label: 'Частично', variant: 'warning' };
  }
  if (status === 'error') {
    return { color: 'bg-red-500', label: 'Ошибка', variant: 'danger' };
  }
  return { color: 'bg-gray-500', label: status, variant: 'neutral' };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function SubscriptionCard({
  subscription,
  activeCollection,
  onTrigger,
  onBackfill,
  onEdit,
  onFieldMapping,
  onToggleActive,
  onDelete,
  triggerLoading,
}: SubscriptionCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const statusInfo = getStatusIndicator(subscription);
  const isCollecting = !!activeCollection && activeCollection.status === 'collecting';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const progress = activeCollection
    ? Math.round((activeCollection.processedEmployees / activeCollection.totalEmployees) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-surface-border bg-white dark:bg-surface transition-colors hover:border-gray-400 dark:hover:border-gray-600">
      <div className="p-5">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${statusInfo.color}`} />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{subscription.projectName}</h3>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-surface-lighter hover:text-gray-700 dark:hover:text-gray-200"
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-light py-1 shadow-xl">
                <button
                  onClick={() => { onEdit(subscription.id); setMenuOpen(false); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-lighter"
                >
                  Редактировать сотрудников
                </button>
                <button
                  onClick={() => { onFieldMapping(subscription.id); setMenuOpen(false); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-lighter"
                >
                  Настройка маппинга полей
                </button>
                <button
                  onClick={() => { onToggleActive(subscription.id, !subscription.isActive); setMenuOpen(false); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-lighter"
                >
                  {subscription.isActive ? 'Приостановить' : 'Активировать'}
                </button>
                <div className="my-1 border-t border-gray-200 dark:border-surface-border" />
                <button
                  onClick={() => { onDelete(subscription.id); setMenuOpen(false); }}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-100 dark:hover:bg-surface-lighter"
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Subtitle */}
        <p className="mb-4 text-sm text-gray-400 dark:text-gray-500">
          {subscription.youtrackInstanceName} &bull; {subscription.projectShortName}
        </p>

        {/* Info */}
        <div className="mb-4 space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-gray-400 dark:text-gray-500" />
            <span>{subscription.employeeCount} сотрудников</span>
          </div>
          {subscription.lastCollection && (
            <>
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400 dark:text-gray-500" />
                <span>Последний сбор: {formatDate(subscription.lastCollection.completedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                {subscription.lastCollection.status === 'completed' && <CheckCircle size={14} className="text-emerald-500" />}
                {subscription.lastCollection.status === 'partial' && <AlertTriangle size={14} className="text-amber-500" />}
                {subscription.lastCollection.status === 'error' && <XCircle size={14} className="text-red-500" />}
                {!['completed', 'partial', 'error'].includes(subscription.lastCollection.status) && <Clock size={14} className="text-gray-400 dark:text-gray-500" />}
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                <span>
                  {subscription.lastCollection.processedEmployees}/{subscription.lastCollection.totalEmployees} обработано
                </span>
              </div>
            </>
          )}
          {!subscription.lastCollection && (
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gray-400 dark:text-gray-500" />
              <span className="text-gray-400 dark:text-gray-500">Сбор ещё не выполнялся</span>
            </div>
          )}
        </div>

        {/* Collection progress */}
        {isCollecting && activeCollection && (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                {activeCollection.currentEmployee ?? 'Запуск...'} ({activeCollection.processedEmployees}/{activeCollection.totalEmployees})
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-lighter">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Play size={14} />}
            onClick={() => onTrigger(subscription.id)}
            disabled={!subscription.isActive || isCollecting}
            loading={triggerLoading}
          >
            {isCollecting ? 'Сбор...' : 'Запустить сбор'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Clock size={14} />}
            onClick={() => onBackfill(subscription.id)}
            disabled={!subscription.isActive || isCollecting}
          >
            Восполнить пропуски
          </Button>
        </div>
      </div>
    </div>
  );
}
