import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Play, Square, X, Clock, Hourglass, Users, Calendar, Bot, Database, Loader, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { Subscription } from '@/types/subscription';
import type { CollectionProgress, LlmQueueItem } from '@/types/collection';

interface SubscriptionCardProps {
  subscription: Subscription;
  activeCollection?: CollectionProgress;
  llmItems?: LlmQueueItem[];
  llmProcessed?: number;
  onTrigger: (id: string) => void;
  onStop: (id: string) => void;
  onCancel: (id: string) => void;
  onEdit: (id: string) => void;
  onFieldMapping: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  triggerLoading?: boolean;
  stopLoading?: boolean;
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
  onCancel,
  onEdit,
  onFieldMapping,
  onToggleActive,
  onDelete,
  triggerLoading,
  stopLoading,
}: SubscriptionCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isPending = !!activeCollection && activeCollection.status === 'pending';
  const isRunning = !!activeCollection && activeCollection.status === 'running';
  const isStopping = !!activeCollection && activeCollection.status === 'stopping';
  const hasLlm = llmItems.length > 0;
  const isBusy = isPending || isRunning || isStopping || hasLlm;

  const lastCol = subscription.lastCollection;

  // Header dot color — только busy/inactive/failed/ok
  const dotColor = isBusy
    ? 'bg-amber-400 animate-pulse'
    : !subscription.isActive
      ? 'bg-gray-500'
      : lastCol?.status === 'failed'
        ? 'bg-red-500'
        : lastCol
          ? 'bg-emerald-500'
          : 'bg-gray-500';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Collection progress percentage
  const collectionProgress = activeCollection && activeCollection.totalEmployees > 0
    ? Math.round((activeCollection.processedEmployees / activeCollection.totalEmployees) * 100)
    : 0;

  // LLM progress calculation — always use live queue counters (remaining + processed)
  // currentPeriodStatus.dataCollected counts only the latest week, not multi-week backfills
  const llmRemaining = llmItems.length;
  const llmTotal = llmRemaining + llmProcessed;
  const llmDone = llmProcessed;
  const llmProgress = llmTotal > 0 ? Math.round((llmDone / llmTotal) * 100) : 0;

  // Current LLM employee name (from processing item)
  const llmCurrentEmployee = llmItems.find((i) => i.status === 'processing')?.employeeName;

  // Show collection bar at 100% when collection done but LLM still working
  const showCollectionComplete = !isRunning && !isPending && !isStopping && hasLlm;

  // Multi-week progress label
  const weekLabel = activeCollection?.totalWeeks && activeCollection.totalWeeks > 1
    ? `Неделя ${activeCollection.currentWeek ?? 1}/${activeCollection.totalWeeks} · `
    : '';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-surface-border bg-white dark:bg-surface transition-colors hover:border-gray-400 dark:hover:border-gray-600">
      <div className="p-5">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
            <button
              onClick={() => navigate(`/projects/${subscription.id}`)}
              className="group flex items-center gap-1 text-base font-semibold text-gray-900 dark:text-gray-100 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
            >
              {subscription.projectName}
              <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-500 dark:text-brand-400" />
            </button>
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
                  {subscription.isActive ? 'Исключить из автосбора' : 'Включить в автосбор'}
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
          {lastCol && !isBusy && (
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400 dark:text-gray-500" />
              <span>Последний сбор: {formatDate(lastCol.completedAt)}</span>
            </div>
          )}
          {!lastCol && !isBusy && (
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gray-400 dark:text-gray-500" />
              <span className="text-gray-400 dark:text-gray-500">Сбор ещё не выполнялся</span>
            </div>
          )}
        </div>

        {/* Pending (queued) indicator */}
        {isPending && (
          <div className="mb-3">
            <div className="mb-1 flex items-center text-xs text-gray-500 dark:text-gray-400">
              <Loader size={12} className="mr-1 animate-spin text-amber-400" />
              В очереди...
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-lighter">
              <div className="h-full w-1/4 animate-pulse rounded-full bg-amber-400/60" />
            </div>
          </div>
        )}

        {/* Stopping indicator */}
        {isStopping && (
          <div className="mb-3">
            <div className="mb-1 flex items-center text-xs text-gray-500 dark:text-gray-400">
              <Loader size={12} className="mr-1 animate-spin text-gray-400" />
              Останавливается...
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-lighter">
              <div
                className="h-full rounded-full bg-gray-400 transition-all duration-500"
                style={{ width: `${collectionProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Collection progress bar — during running OR at 100% while LLM processes */}
        {(isRunning || showCollectionComplete) && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Database size={12} className="text-brand-500" />
                {isRunning
                  ? (
                    <>
                      {weekLabel}
                      {activeCollection?.currentEmployee ?? 'Запуск...'}
                      {activeCollection && (
                        <span className="text-gray-400">
                          ({activeCollection.processedEmployees}/{activeCollection.totalEmployees})
                        </span>
                      )}
                    </>
                  )
                  : 'Данные собраны'
                }
              </span>
              <span>{isRunning ? `${collectionProgress}%` : '100%'}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-lighter">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: isRunning ? `${collectionProgress}%` : '100%' }}
              />
            </div>
          </div>
        )}

        {/* LLM waiting state — shown during collection when LLM hasn't started */}
        {(isPending || isRunning || isStopping) && !hasLlm && (
          <div className="mb-3">
            <div className="mb-1 flex items-center text-xs text-gray-400 dark:text-gray-500">
              <Hourglass size={12} className="mr-1 text-gray-400 dark:text-gray-500" />
              LLM: Ожидание сбора данных
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-lighter" />
          </div>
        )}

        {/* LLM progress bar */}
        {hasLlm && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Bot size={12} className="text-purple-400" />
                LLM-анализ
                {llmCurrentEmployee && (
                  <span className="font-medium text-gray-600 dark:text-gray-300">
                    · {llmCurrentEmployee}
                  </span>
                )}
                <span className="text-gray-400">({llmDone}/{llmTotal})</span>
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

        {/* Actions — different buttons per state */}
        {isPending ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<X size={14} />}
              onClick={() => onCancel(subscription.id)}
              loading={stopLoading}
            >
              Отменить
            </Button>
          </div>
        ) : isRunning ? (
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
        ) : isStopping ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled>
              Останавливается...
            </Button>
          </div>
        ) : hasLlm ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Square size={14} />}
              onClick={() => onStop(subscription.id)}
              loading={stopLoading}
            >
              Остановить LLM
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Play size={14} />}
              onClick={() => onTrigger(subscription.id)}
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
