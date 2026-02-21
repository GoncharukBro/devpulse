import { useState, useEffect, useCallback } from 'react';
import { Database, Plus, Play, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import SubscriptionCard from '@/components/collection/SubscriptionCard';
import CollectionProgressPanel from '@/components/collection/CollectionProgress';
import LlmQueueIndicator from '@/components/collection/LlmQueueIndicator';
import CronControl from '@/components/collection/CronControl';
import AddProjectWizard from '@/components/collection/AddProjectWizard';
import EditSubscriptionModal from '@/components/collection/EditSubscriptionModal';
import BackfillModal from '@/components/collection/BackfillModal';
import CollectionLogs from '@/components/collection/CollectionLogs';
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
  const [triggerAllLoading, setTriggerAllLoading] = useState(false);
  const [triggerLoadingId, setTriggerLoadingId] = useState<string | null>(null);

  // Modals
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalId, setEditModalId] = useState<string | null>(null);
  const [editModalMode, setEditModalMode] = useState<'employees' | 'fieldMapping'>('employees');
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillPreselectedId, setBackfillPreselectedId] = useState<string | undefined>();

  // Collection store
  const collectionState = useCollectionStore((s) => s.state);
  const fetchState = useCollectionStore((s) => s.fetchState);
  const stopPolling = useCollectionStore((s) => s.stopPolling);

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

  // Trigger single
  const handleTrigger = async (subscriptionId: string) => {
    setTriggerLoadingId(subscriptionId);
    try {
      await collectionApi.trigger({ subscriptionId });
      toast.success('Сбор запущен');
      fetchState();
    } catch {
      toast.error('Не удалось запустить сбор');
    } finally {
      setTriggerLoadingId(null);
    }
  };

  // Trigger all
  const handleTriggerAll = async () => {
    setTriggerAllLoading(true);
    try {
      await collectionApi.triggerAll();
      toast.success('Сбор запущен для всех проектов');
      fetchState();
    } catch {
      toast.error('Не удалось запустить сбор');
    } finally {
      setTriggerAllLoading(false);
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
  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить подписку? Все собранные данные будут потеряны.')) return;
    try {
      await subscriptionsApi.delete(id);
      toast.success('Подписка удалена');
      loadSubscriptions();
    } catch {
      toast.error('Не удалось удалить подписку');
    }
  };

  // Edit modal
  const openEditModal = (id: string, mode: 'employees' | 'fieldMapping') => {
    setEditModalId(id);
    setEditModalMode(mode);
    setEditModalOpen(true);
  };

  // Backfill
  const openBackfill = (preselectedId?: string) => {
    setBackfillPreselectedId(preselectedId);
    setBackfillOpen(true);
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

      {/* Cron + LLM indicators */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <CronControl cronState={cronState} onPause={handlePauseCron} onResume={handleResumeCron} />
        {collectionState && collectionState.llmQueue.length > 0 && (
          <LlmQueueIndicator items={collectionState.llmQueue} />
        )}
      </div>

      {/* Collection progress */}
      {collectionState && (
        <CollectionProgressPanel
          activeCollections={collectionState.activeCollections}
          queue={collectionState.queue}
        />
      )}

      {!hasSubscriptions ? (
        <EmptyState
          icon={Database}
          title="Нет зарегистрированных проектов"
          description="Добавьте первый проект для начала сбора метрик разработчиков"
          action={{ label: 'Добавить проект', to: '#' }}
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
                onTrigger={handleTrigger}
                onBackfill={(id) => openBackfill(id)}
                onEdit={(id) => openEditModal(id, 'employees')}
                onFieldMapping={(id) => openEditModal(id, 'fieldMapping')}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                triggerLoading={triggerLoadingId === sub.id}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="mb-8 flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Play size={14} />}
              loading={triggerAllLoading}
              onClick={handleTriggerAll}
              disabled={
                subscriptions.filter((s) => s.isActive).length === 0 ||
                (collectionState?.activeCollections?.length ?? 0) > 0
              }
            >
              Запустить всё
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Clock size={14} />}
              onClick={() => openBackfill()}
            >
              Backfill
            </Button>
          </div>

          {/* Collection logs */}
          <CollectionLogs subscriptions={subscriptions} />
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

      <BackfillModal
        open={backfillOpen}
        onClose={() => setBackfillOpen(false)}
        subscriptions={subscriptions}
        preselectedId={backfillPreselectedId}
        onStarted={() => {
          fetchState();
          loadSubscriptions();
        }}
      />
    </>
  );
}
