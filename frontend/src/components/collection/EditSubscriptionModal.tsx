import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Check, UserMinus, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import FieldMappingEditor from './FieldMappingEditor';
import SharesManager from './SharesManager';
import { subscriptionsApi } from '@/api/endpoints/subscriptions';
import { youtrackApi } from '@/api/endpoints/youtrack';
import type { SubscriptionDetail, SubscriptionEmployee, FieldMapping } from '@/types/subscription';
import type { YouTrackUser } from '@/types/youtrack';

interface EditSubscriptionModalProps {
  open: boolean;
  subscriptionId: string | null;
  mode: 'employees' | 'fieldMapping' | 'access';
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditSubscriptionModal({
  open,
  subscriptionId,
  mode,
  onClose,
  onUpdated,
}: EditSubscriptionModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionDetail | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Employees mode
  const [availableMembers, setAvailableMembers] = useState<YouTrackUser[]>([]);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [selectedNew, setSelectedNew] = useState<Set<string>>(new Set());

  // Field mapping mode
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    taskTypeMapping: {},
    typeFieldName: 'Type',
    cycleTimeStartStatuses: [],
    cycleTimeEndStatuses: [],
    releaseStatuses: [],
  });

  const loadSubscription = useCallback(async () => {
    if (!subscriptionId) return;
    setLoading(true);
    try {
      const data = await subscriptionsApi.get(subscriptionId);
      setSubscription(data);
      if (data.fieldMapping) {
        setFieldMapping(data.fieldMapping);
      }
    } catch {
      toast.error('Не удалось загрузить данные подписки');
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    if (open && subscriptionId) {
      setShowDeleteConfirm(false);
      setShowAddMembers(false);
      setSelectedNew(new Set());
      loadSubscription();
    }
  }, [open, subscriptionId, loadSubscription]);

  const loadAvailableMembers = async () => {
    if (!subscription) return;
    try {
      const members = await youtrackApi.getMembers(
        subscription.youtrackInstanceId,
        subscription.projectId,
      );
      const existingLogins = new Set(subscription.employees.map((e) => e.youtrackLogin));
      setAvailableMembers(members.filter((m) => !m.banned && !existingLogins.has(m.login)));
      setShowAddMembers(true);
    } catch {
      toast.error('Не удалось загрузить участников проекта');
    }
  };

  const handleRemoveEmployee = async (employee: SubscriptionEmployee) => {
    if (!subscriptionId) return;
    try {
      await subscriptionsApi.removeEmployee(subscriptionId, employee.id);
      toast.success(`${employee.displayName} удалён`);
      loadSubscription();
      onUpdated();
    } catch {
      toast.error('Не удалось удалить сотрудника');
    }
  };

  const handleAddEmployees = async () => {
    if (!subscriptionId || selectedNew.size === 0) return;
    const newEmployees = availableMembers
      .filter((m) => selectedNew.has(m.login))
      .map((m) => ({
        youtrackLogin: m.login,
        displayName: m.name,
        email: m.email,
        avatarUrl: m.avatarUrl,
      }));

    setSaving(true);
    try {
      await subscriptionsApi.addEmployees(subscriptionId, newEmployees);
      toast.success(`Добавлено ${newEmployees.length} сотрудников`);
      setShowAddMembers(false);
      setSelectedNew(new Set());
      loadSubscription();
      onUpdated();
    } catch {
      toast.error('Не удалось добавить сотрудников');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFieldMapping = async () => {
    if (!subscriptionId) return;
    setSaving(true);
    try {
      await subscriptionsApi.updateFieldMapping(subscriptionId, fieldMapping);
      toast.success('Маппинг полей обновлён');
      onUpdated();
      onClose();
    } catch {
      toast.error('Не удалось обновить маппинг');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!subscriptionId) return;
    setSaving(true);
    try {
      await subscriptionsApi.delete(subscriptionId);
      toast.success('Подписка удалена');
      onUpdated();
      onClose();
    } catch {
      toast.error('Не удалось удалить подписку');
    } finally {
      setSaving(false);
    }
  };

  const toggleNew = (login: string) => {
    setSelectedNew((prev) => {
      const next = new Set(prev);
      if (next.has(login)) next.delete(login);
      else next.add(login);
      return next;
    });
  };

  if (mode === 'access') {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={`Доступ — ${subscription?.projectName ?? ''}`}
        footer={
          <Button variant="secondary" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        }
      >
        {subscriptionId && <SharesManager subscriptionId={subscriptionId} />}
      </Modal>
    );
  }

  if (loading) {
    return (
      <Modal open={open} onClose={onClose} title="Загрузка...">
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </Modal>
    );
  }

  if (mode === 'fieldMapping') {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={`Маппинг полей — ${subscription?.projectName ?? ''}`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Отмена
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={handleSaveFieldMapping}>
              Сохранить
            </Button>
          </>
        }
      >
        <FieldMappingEditor value={fieldMapping} onChange={setFieldMapping} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Сотрудники — ${subscription?.projectName ?? ''}`}
      footer={
        <div className="flex w-full items-center justify-between">
          {subscription?.role === 'owner' && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Удалить подписку
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      }
    >
      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-400">
            <AlertTriangle size={16} />
            Подтверждение удаления
          </div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Будут удалены все данные подписки, включая собранные метрики и отчёты. Это действие необратимо.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" loading={saving} onClick={handleDelete}>
              Да, удалить
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {/* Current employees */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Текущие сотрудники ({subscription?.employees.filter((e) => e.isActive).length ?? 0})
          </span>
          <Button variant="ghost" size="sm" onClick={loadAvailableMembers} leftIcon={<Plus size={14} />}>
            Добавить
          </Button>
        </div>
        <div className="max-h-52 space-y-1 overflow-y-auto">
          {subscription?.employees.map((emp) => (
            <div
              key={emp.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                emp.isActive ? 'bg-gray-50 dark:bg-surface-light' : 'bg-gray-50/50 dark:bg-surface-light/50 opacity-60'
              }`}
            >
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-200">{emp.displayName}</span>
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{emp.youtrackLogin}</span>
                {!emp.isActive && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-600">(деактивирован)</span>
                )}
              </div>
              <button
                onClick={() => handleRemoveEmployee(emp)}
                className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-surface-lighter hover:text-red-400"
                title="Удалить"
              >
                <UserMinus size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add members panel */}
      {showAddMembers && (
        <div className="rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Добавить участников ({selectedNew.size} выбрано)
            </span>
            <button
              onClick={() => setShowAddMembers(false)}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={16} />
            </button>
          </div>
          {availableMembers.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">Все участники уже добавлены</p>
          ) : (
            <>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {availableMembers.map((member) => (
                  <label
                    key={member.login}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-surface-lighter"
                  >
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                        selectedNew.has(member.login)
                          ? 'border-brand-500 bg-brand-500'
                          : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-surface-lighter'
                      }`}
                    >
                      {selectedNew.has(member.login) && <Check size={10} className="text-white" />}
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedNew.has(member.login)}
                      onChange={() => toggleNew(member.login)}
                      className="hidden"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{member.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{member.login}</span>
                  </label>
                ))}
              </div>
              <div className="mt-3">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={selectedNew.size === 0}
                  loading={saving}
                  onClick={handleAddEmployees}
                >
                  Добавить ({selectedNew.size})
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
