import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { sharesApi } from '@/api/endpoints/shares';
import Button from '@/components/ui/Button';
import type { SubscriptionShare, ShareRole } from '@/types/subscription';

interface SharesManagerProps {
  subscriptionId: string;
}

const ROLE_OPTIONS: { value: ShareRole; label: string }[] = [
  { value: 'viewer', label: 'Просмотр' },
  { value: 'editor', label: 'Редактор' },
];

export default function SharesManager({ subscriptionId }: SharesManagerProps) {
  const [shares, setShares] = useState<SubscriptionShare[]>([]);
  const [total, setTotal] = useState(0);
  const [login, setLogin] = useState('');
  const [newRole, setNewRole] = useState<ShareRole>('viewer');
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    try {
      const result = await sharesApi.list(subscriptionId, { limit: 50 });
      setShares(result.items);
      setTotal(result.total);
    } catch {
      setError('Не удалось загрузить список доступов');
    }
  }, [subscriptionId]);

  useEffect(() => { loadShares(); }, [loadShares]);

  const handleAdd = async () => {
    if (!login.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await sharesApi.add(subscriptionId, login.trim(), newRole);
      setLogin('');
      setNewRole('viewer');
      await loadShares();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Ошибка при добавлении';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (shareId: number, role: ShareRole) => {
    setUpdatingId(shareId);
    setError(null);
    try {
      await sharesApi.updateRole(subscriptionId, shareId, role);
      setShares((prev) =>
        prev.map((s) => (s.id === shareId ? { ...s, role } : s)),
      );
    } catch {
      setError('Не удалось изменить роль');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (shareId: number) => {
    setRemovingId(shareId);
    try {
      await sharesApi.remove(subscriptionId, shareId);
      await loadShares();
    } catch {
      setError('Не удалось удалить доступ');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex gap-2">
        <input
          type="text"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Логин пользователя"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
                     dark:border-surface-border dark:bg-gray-800 dark:text-gray-100
                     focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as ShareRole)}
          className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm
                     dark:border-surface-border dark:bg-gray-800 dark:text-gray-100
                     focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <Button size="sm" onClick={handleAdd} disabled={loading || !login.trim()}>
          Добавить
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {shares.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Подписка пока ни с кем не разделена
        </p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-surface-border">
          {shares.map((share) => (
            <div key={share.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {share.sharedWithLogin}
                </span>
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(share.createdAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
              <select
                value={share.role}
                onChange={(e) => handleRoleChange(share.id, e.target.value as ShareRole)}
                disabled={updatingId === share.id}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs
                           dark:border-surface-border dark:bg-gray-800 dark:text-gray-200
                           focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
                           disabled:opacity-50"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => handleRemove(share.id)}
                disabled={removingId === share.id}
                title="Удалить"
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500
                           dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors
                           disabled:opacity-50 disabled:pointer-events-none"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {total > shares.length && (
        <p className="text-xs text-gray-400">Показано {shares.length} из {total}</p>
      )}
    </div>
  );
}
