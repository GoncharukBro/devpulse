import { useState, useEffect, useCallback } from 'react';
import { Database, Plus, Play, Square } from 'lucide-react';
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
import type { CronState } from '@/types/collection';

export default function CollectionPage() {
  usePageTitle('Сбор данных');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cronState, setCronState] = useState<CronState | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [stopAllLoading, setStopAllLoading] = useState(false);
  const [stopLoadingId, setStopLoadingId] = useState<string | null>(null);

  // Modals
  const [wizardOpen, setWizardOpen] = useState(false);
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

  // Open collect modal for single project
  const openCollectModal = (subscriptionId: string) => {
    const sub = subscriptions.find((s) => s.id === subscriptionId) ?? null;
    setCollectModalSubscription(sub);
    setCollectModalOpen(true);
  };

  // Stop single subscription
  const handleStop = async (subscriptionId: string) => {
    setStopLoadingId(subscriptionId);
    try {
      await collectionApi.stop({ subscriptionIds: [subscriptionId] });
      toast.success('Сбор остановлен');
      fetchState();
      setLogsRefreshKey((k) => k + 1);
    } catch {
      toast.error('Не удалось остановить сбор');
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
      toast.success(isActive ? 'Подписка активирована' : 'Подписка приостановлена');
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

  const handleDeleteConfirmed = async () => {
    if (!deleteTargetId) return;
    setDeleteConfirmOpen(false);
    try {
      await subscriptionsApi.delete(deleteTargetId);
      toast.success('Подписка удалена');
      loadSubscriptions();
    } catch {
      toast.error('Не удалось удалить подписку');
    } finally {
      setDeleteTargetId(null);
    }
  };

  // Edit modal
  const openEditModal = (id: string, mode: 'employees' | 'fieldMapping') => {
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

  // Find active collection for a subscription
  const getActiveCollection = (subscriptionId: string) =>
    collectionState?.activeCollections.find((ac) => ac.subscriptionId === subscriptionId);

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
        <PageHeader title="Сбор данных" description="Управление сбором метрик" />
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  const hasSubscriptions = subscriptions.length > 0;

  return (
    <>
      <PageHeader
        title="Сбор данных"
        description="Управление сбором метрик"
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
        {hasSubscriptions && (
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
                disabled={subscriptions.filter((s) => s.isActive).length === 0}
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
          {/* Subscription cards grid */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subscriptions.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                subscription={sub}
                activeCollection={getActiveCollection(sub.id)}
                llmItems={getLlmItems(sub.id)}
                llmProcessed={getLlmProcessed(sub.id)}
                onTrigger={openCollectModal}
                onStop={handleStop}
                onEdit={(id) => openEditModal(id, 'employees')}
                onFieldMapping={(id) => openEditModal(id, 'fieldMapping')}
                onToggleActive={handleToggleActive}
                onDelete={openDeleteConfirm}
                triggerLoading={false}
                stopLoading={stopLoadingId === sub.id}
              />
            ))}
          </div>

          {/* Collection logs */}
          <CollectionLogs subscriptions={subscriptions} refreshKey={logsRefreshKey} />
        </>
      )}

      {/* Modals */}
      <AddProjectWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={loadSubscriptions}
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
      </Modal>
    </>
  );
}
