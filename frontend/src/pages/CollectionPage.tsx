import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, Plus, Play, Square, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import SubscriptionCard from '@/components/collection/SubscriptionCard';
import CronControl from '@/components/collection/CronControl';
import AddProjectWizard from '@/components/collection/AddProjectWizard';
import EditSubscriptionModal from '@/components/collection/EditSubscriptionModal';
import CollectModal from '@/components/collection/CollectModal';
import CollectAllModal from '@/components/collection/CollectAllModal';
import CollectionLogs from '@/components/collection/CollectionLogs';
import Modal from '@/components/ui/Modal';
import { subscriptionsApi } from '@/api/endpoints/subscriptions';
import { collectionApi } from '@/api/endpoints/collection';
import { useCollectionStore } from '@/stores/collection.store';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { Subscription } from '@/types/subscription';
import type { CollectionProgress, CronState } from '@/types/collection';

export default function CollectionPage() {
  usePageTitle('Сбор данных');
  const [searchParams, setSearchParams] = useSearchParams();
  const openWizardFromQuery = useRef(searchParams.get('addProject') === 'true');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cronState, setCronState] = useState<CronState | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [stopAllLoading, setStopAllLoading] = useState(false);
  const [stopLoadingId, setStopLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modals
  const [wizardOpen, setWizardOpen] = useState(openWizardFromQuery.current);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalId, setEditModalId] = useState<string | null>(null);
  const [editModalMode, setEditModalMode] = useState<'employees' | 'fieldMapping'>('employees');
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [collectModalSubscription, setCollectModalSubscription] = useState<Subscription | null>(null);
  const [collectAllModalOpen, setCollectAllModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);

  // Collection store
  const collectionState = useCollectionStore((s) => s.state);
  const fetchState = useCollectionStore((s) => s.fetchState);
  const stopPolling = useCollectionStore((s) => s.stopPolling);
  const onCollectionDone = useCollectionStore((s) => s.onCollectionDone);
  const onLlmDone = useCollectionStore((s) => s.onLlmDone);

  const loadSubscriptions = useCallback(async () => {
    try {
      const data = await subscriptionsApi.list();
      setSubscriptions(data);
    } catch {
      // Error handled by interceptor
    }
  }, []);

  const loadCronState = useCallback(async () => {
    try {
      const data = await collectionApi.getCronState();
      setCronState(data);
    } catch {
      // Error handled by interceptor
    }
  }, []);

  // Clean up query param after opening wizard
  useEffect(() => {
    if (openWizardFromQuery.current) {
      searchParams.delete('addProject');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoadingPage(true);
      await Promise.all([loadSubscriptions(), fetchState(), loadCronState()]);
      setLoadingPage(false);
    };
    init();
    return () => stopPolling();
  }, [loadSubscriptions, fetchState, loadCronState, stopPolling]);

  // Refresh subscriptions when all collections finish
  useEffect(() => {
    onCollectionDone(() => {
      loadSubscriptions();
      setLogsRefreshKey((k) => k + 1);
    });
    return () => onCollectionDone(null);
  }, [onCollectionDone, loadSubscriptions]);

  // Refresh subscriptions when all LLM processing finishes
  useEffect(() => {
    onLlmDone(() => {
      loadSubscriptions();
      setLogsRefreshKey((k) => k + 1);
    });
    return () => onLlmDone(null);
  }, [onLlmDone, loadSubscriptions]);

  // Open collect modal for single project (only for owned subscriptions)
  const openCollectModal = (subscriptionId: string) => {
    const sub = subscriptions.find((s) => s.id === subscriptionId) ?? null;
    if (!sub?.isOwner) return;
    setCollectModalSubscription(sub);
    setCollectModalOpen(true);
  };

  // Stop single subscription (running → stopping → stopped, or LLM cancel)
  const handleStop = async (subscriptionId: string) => {
    const sub = subscriptions.find((s) => s.id === subscriptionId);
    if (!sub?.isOwner) return;
    setStopLoadingId(subscriptionId);
    try {
      const ac = getActiveCollection(subscriptionId);
      const isLlmOnly = !ac && getLlmItems(subscriptionId).length > 0;

      await collectionApi.stop({ subscriptionIds: [subscriptionId] });
      toast.success(isLlmOnly ? 'LLM-анализ отменён' : 'Сбор остановлен');
      fetchState();
      loadSubscriptions();
      setLogsRefreshKey((k) => k + 1);
    } catch {
      toast.error('Не удалось остановить сбор');
    } finally {
      setStopLoadingId(null);
    }
  };

  // Cancel single subscription (pending in queue → cancelled)
  const handleCancel = async (subscriptionId: string) => {
    const sub = subscriptions.find((s) => s.id === subscriptionId);
    if (!sub?.isOwner) return;
    setStopLoadingId(subscriptionId);
    try {
      await collectionApi.stop({ subscriptionIds: [subscriptionId] });
      toast.success('Сбор отменён');
      fetchState();
      loadSubscriptions();
      setLogsRefreshKey((k) => k + 1);
    } catch {
      toast.error('Не удалось отменить сбор');
    } finally {
      setStopLoadingId(null);
    }
  };

  // Stop all
  const handleStopAll = async () => {
    setStopAllLoading(true);
    try {
      await collectionApi.stopAll();
      toast.success('Все сборы остановлены');
      fetchState();
      loadSubscriptions();
      setLogsRefreshKey((k) => k + 1);
    } catch {
      toast.error('Не удалось остановить сборы');
    } finally {
      setStopAllLoading(false);
    }
  };

  // Toggle subscription active
  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await subscriptionsApi.update(id, { isActive });
      toast.success(isActive ? 'Включена в автосбор' : 'Исключена из автосбора');
      loadSubscriptions();
    } catch {
      toast.error('Не удалось обновить подписку');
    }
  };

  // Delete subscription
  const openDeleteConfirm = (id: string) => {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  };

  // Scenario 12: stop collection before deleting subscription
  const handleDeleteConfirmed = async () => {
    if (!deleteTargetId) return;
    setDeleteConfirmOpen(false);
    setDeletingId(deleteTargetId);

    try {
      // Check if subscription has active collection or LLM work
      const ac = getActiveCollection(deleteTargetId);
      const hasLlm = getLlmItems(deleteTargetId).length > 0;

      if (ac || hasLlm) {
        // Stop collection first
        await collectionApi.stop({ subscriptionIds: [deleteTargetId] });
        await fetchState();
      }

      await subscriptionsApi.delete(deleteTargetId);
      toast.success('Подписка удалена');
      loadSubscriptions();
      fetchState();
    } catch {
      toast.error('Не удалось удалить подписку');
    } finally {
      setDeletingId(null);
      setDeleteTargetId(null);
    }
  };

  // Edit modal (only for owned subscriptions)
  const openEditModal = (id: string, mode: 'employees' | 'fieldMapping') => {
    const sub = subscriptions.find((s) => s.id === id);
    if (!sub?.isOwner) return;
    setEditModalId(id);
    setEditModalMode(mode);
    setEditModalOpen(true);
  };

  // Cron
  const handlePauseCron = async () => {
    await collectionApi.pauseCron();
    toast.success('Автосбор приостановлен');
    loadCronState();
  };

  const handleResumeCron = async () => {
    await collectionApi.resumeCron();
    toast.success('Автосбор возобновлён');
    loadCronState();
  };

  // Find active collection for a subscription (checks both active and queue)
  const getActiveCollection = (subscriptionId: string): CollectionProgress | undefined => {
    // First check running/stopping collections
    const active = collectionState?.activeCollections.find((ac) => ac.subscriptionId === subscriptionId);
    if (active) return active;

    // Then check queue — synthesize a pending CollectionProgress
    const queued = collectionState?.queue.find((q) => q.subscriptionId === subscriptionId);
    if (queued) {
      return {
        id: '',
        subscriptionId: queued.subscriptionId,
        projectName: queued.projectName,
        status: 'pending',
        processedEmployees: 0,
        totalEmployees: 0,
        skippedEmployees: 0,
        failedEmployees: 0,
        reQueuedEmployees: 0,
        periodStart: queued.periodStart,
        periodEnd: queued.periodEnd,
        startedAt: '',
      };
    }

    return undefined;
  };

  // Get LLM queue items for a subscription
  const getLlmItems = (subscriptionId: string) =>
    collectionState?.llmQueue.filter((item) => item.subscriptionId === subscriptionId) ?? [];

  // Get LLM processed count for a subscription
  const getLlmProcessed = (subscriptionId: string) =>
    collectionState?.llmProcessed[subscriptionId] ?? 0;

  // Is any collection running globally?
  const isGlobalBusy =
    (collectionState?.activeCollections?.length ?? 0) > 0 ||
    (collectionState?.queue?.length ?? 0) > 0 ||
    (collectionState?.llmQueue?.length ?? 0) > 0;

  if (loadingPage) {
    return (
      <>
        <PageHeader title="Сбор данных" description="Управление проектами, запуск сборов и мониторинг процессов" />
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  const hasSubscriptions = subscriptions.length > 0;
  const hasOwnedSubscriptions = subscriptions.some((s) => s.isOwner);

  return (
    <>
      <PageHeader
        title="Сбор данных"
        description="Управление проектами, запуск сборов и мониторинг процессов"
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={16} />}
            onClick={() => setWizardOpen(true)}
          >
            Добавить проект
          </Button>
        }
      />

      {/* Cron + global actions */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <CronControl cronState={cronState} onPause={handlePauseCron} onResume={handleResumeCron} />
        {hasOwnedSubscriptions && (
          <div className="flex items-center gap-2 sm:ml-auto">
            {isGlobalBusy ? (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Square size={14} />}
                loading={stopAllLoading}
                onClick={handleStopAll}
              >
                Остановить всё
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Play size={14} />}
                onClick={() => setCollectAllModalOpen(true)}
                disabled={subscriptions.filter((s) => s.isActive && s.isOwner).length === 0}
              >
                Запустить всё
              </Button>
            )}
          </div>
        )}
      </div>

      {!hasSubscriptions ? (
        <EmptyState
          icon={Database}
          title="Нет зарегистрированных проектов"
          description="Добавьте первый проект для начала сбора метрик разработчиков"
          action={{ label: 'Добавить проект', to: '/collection' }}
        />
      ) : (
        <>
          {/* Worker health warnings */}
          {collectionState?.workersHealth && (
            !collectionState.workersHealth.collection.alive ||
            !collectionState.workersHealth.llm.alive
          ) && (
            <div className="mb-4 flex flex-col gap-2">
              {!collectionState.workersHealth.collection.alive && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>Воркер сбора данных не отвечает. Новые сборы не будут обрабатываться.</span>
                </div>
              )}
              {!collectionState.workersHealth.llm.alive && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>LLM-воркер не отвечает. Анализ отчётов приостановлен.</span>
                </div>
              )}
            </div>
          )}

          {/* Subscription cards grid */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subscriptions.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                subscription={sub}
                activeCollection={getActiveCollection(sub.id)}
                llmItems={getLlmItems(sub.id)}
                llmProcessed={getLlmProcessed(sub.id)}
                isOwner={sub.isOwner}
                onTrigger={openCollectModal}
                onStop={handleStop}
                onCancel={handleCancel}
                onEdit={(id) => openEditModal(id, 'employees')}
                onFieldMapping={(id) => openEditModal(id, 'fieldMapping')}
                onToggleActive={handleToggleActive}
                onDelete={openDeleteConfirm}
                triggerLoading={false}
                stopLoading={stopLoadingId === sub.id || deletingId === sub.id}
              />
            ))}
          </div>

          {/* Duplicate action buttons below cards when many subscriptions */}
          {subscriptions.length > 2 && hasOwnedSubscriptions && (
            <div className="mb-6 flex justify-end gap-2">
              {isGlobalBusy ? (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Square size={14} />}
                  loading={stopAllLoading}
                  onClick={handleStopAll}
                >
                  Остановить всё
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Play size={14} />}
                  onClick={() => setCollectAllModalOpen(true)}
                  disabled={subscriptions.filter((s) => s.isActive && s.isOwner).length === 0}
                >
                  Запустить всё
                </Button>
              )}
            </div>
          )}

          {/* Collection logs */}
          <CollectionLogs subscriptions={subscriptions} refreshKey={logsRefreshKey} />
        </>
      )}

      {/* Modals */}
      <AddProjectWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={loadSubscriptions}
        existingSubscriptions={subscriptions}
      />

      <EditSubscriptionModal
        open={editModalOpen}
        subscriptionId={editModalId}
        mode={editModalMode}
        onClose={() => setEditModalOpen(false)}
        onUpdated={loadSubscriptions}
      />

      <CollectModal
        open={collectModalOpen}
        onClose={() => setCollectModalOpen(false)}
        subscription={collectModalSubscription}
        onStarted={() => {
          fetchState();
          loadSubscriptions();
          setLogsRefreshKey((k) => k + 1);
        }}
      />

      <CollectAllModal
        open={collectAllModalOpen}
        onClose={() => setCollectAllModalOpen(false)}
        subscriptions={subscriptions}
        onStarted={() => {
          fetchState();
          loadSubscriptions();
          setLogsRefreshKey((k) => k + 1);
        }}
      />

      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Удаление подписки"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmOpen(false)}>
              Отмена
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteConfirmed}>
              Удалить
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Вы уверены, что хотите удалить подписку? Все собранные данные будут потеряны.
        </p>
        {deleteTargetId && (getActiveCollection(deleteTargetId) || getLlmItems(deleteTargetId).length > 0) && (
          <p className="mt-2 text-xs text-amber-500">
            Активный сбор будет остановлен перед удалением.
          </p>
        )}
      </Modal>
    </>
  );
}
