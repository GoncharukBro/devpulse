import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Play, Square, Clock, Users, Calendar, CheckCircle, AlertTriangle, XCircle, Bot, Database, Loader } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import type { Subscription } from '@/types/subscription';
import type { CollectionProgress, LlmQueueItem } from '@/types/collection';

interface SubscriptionCardProps {
  subscription: Subscription;
  activeCollection?: CollectionProgress;
  llmItems?: LlmQueueItem[];
  llmProcessed?: number;
  onTrigger: (id: string) => void;
  onStop: (id: string) => void;
  onEdit: (id: string) => void;
  onFieldMapping: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  triggerLoading?: boolean;
  stopLoading?: boolean;
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
  if (status === 'stopped') {
    return { color: 'bg-gray-500', label: 'Остановлен', variant: 'neutral' };
  }
  if (status === 'failed' || status === 'error') {
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
  llmItems = [],
  llmProcessed = 0,
  onTrigger,
  onStop,
  onEdit,
  onFieldMapping,
  onToggleActive,
  onDelete,
  triggerLoading,
  stopLoading,
}: SubscriptionCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isQueued = !!activeCollection && activeCollection.status === 'queued';
  const isCollecting = !!activeCollection && activeCollection.status === 'collecting';
  const hasLlm = llmItems.length > 0;
  const isBusy = isQueued || isCollecting || hasLlm;

  // Status info — only relevant when idle (no active processes)
  const statusInfo = getStatusIndicator(subscription);

  // Header dot color reflects current phase
  const dotColor = isQueued
    ? 'bg-amber-400 animate-pulse'
    : isCollecting
      ? 'bg-brand-500 animate-pulse'
      : hasLlm
        ? 'bg-purple-500 animate-pulse'
        : statusInfo.color;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Collection progress percentage (guard against division by zero)
  const collectionProgress = activeCollection && activeCollection.totalEmployees > 0
    ? Math.round((activeCollection.processedEmployees / activeCollection.totalEmployees) * 100)
    : 0;

  // LLM progress calculation
  const llmRemaining = llmItems.length;
  const llmTotal = llmRemaining + llmProcessed;
  const llmProgress = llmTotal > 0 ? Math.round((llmProcessed / llmTotal) * 100) : 0;

  // Show collection bar at 100% when collection done but LLM still working
  const showCollectionComplete = !isCollecting && hasLlm;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-surface-border bg-white dark:bg-surface transition-colors hover:border-gray-400 dark:hover:border-gray-600">
      <div className="p-5">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
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
              {/* Status badge — only when fully idle (no collection, no LLM) */}
              {!isBusy && (
                <div className="flex items-center gap-2">
                  {subscription.lastCollection.status === 'completed' && <CheckCircle size={14} className="text-emerald-500" />}
                  {subscription.lastCollection.status === 'partial' && <AlertTriangle size={14} className="text-amber-500" />}
                  {subscription.lastCollection.status === 'stopped' && <Square size={14} className="text-gray-400 dark:text-gray-500" />}
                  {(subscription.lastCollection.status === 'error' || subscription.lastCollection.status === 'failed') && <XCircle size={14} className="text-red-500" />}
                  {!['completed', 'partial', 'error', 'failed', 'stopped'].includes(subscription.lastCollection.status) && <Clock size={14} className="text-gray-400 dark:text-gray-500" />}
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  <span>
                    {subscription.lastCollection.processedEmployees}/{subscription.lastCollection.totalEmployees} обработано
                  </span>
                </div>
              )}
            </>
          )}
          {!subscription.lastCollection && !isBusy && (
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gray-400 dark:text-gray-500" />
              <span className="text-gray-400 dark:text-gray-500">Сбор ещё не выполнялся</span>
            </div>
          )}
        </div>

        {/* Queued indicator */}
        {isQueued && (
          <div className="mb-3">
            <div className="mb-1 flex items-center text-xs text-gray-500 dark:text-gray-400">
              <Loader size={12} className="mr-1 animate-spin text-amber-400" />
              Ожидание в очереди...
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-lighter">
              <div className="h-full w-1/4 animate-pulse rounded-full bg-amber-400/60" />
            </div>
          </div>
        )}

        {/* Collection progress bar — during collection OR at 100% while LLM processes */}
        {(isCollecting || showCollectionComplete) && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Database size={12} className="text-brand-500" />
                {isCollecting
                  ? (activeCollection?.currentEmployee ?? 'Запуск...')
                  : 'Сбор завершён'
                }
                {isCollecting && activeCollection && (
                  <span className="text-gray-400">
                    ({activeCollection.processedEmployees}/{activeCollection.totalEmployees})
                  </span>
                )}
              </span>
              <span>{isCollecting ? `${collectionProgress}%` : '100%'}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-lighter">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: isCollecting ? `${collectionProgress}%` : '100%' }}
              />
            </div>
          </div>
        )}

        {/* LLM progress bar */}
        {hasLlm && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Bot size={12} className="text-purple-400" />
                LLM-анализ
                <span className="text-gray-400">({llmProcessed}/{llmTotal})</span>
              </span>
              <span>{llmProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-lighter">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-500"
                style={{ width: `${llmProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        {isBusy ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Square size={14} />}
              onClick={() => onStop(subscription.id)}
              loading={stopLoading}
            >
              Остановить
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Play size={14} />}
              onClick={() => onTrigger(subscription.id)}
              disabled={!subscription.isActive}
              loading={triggerLoading}
            >
              Запустить сбор
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
