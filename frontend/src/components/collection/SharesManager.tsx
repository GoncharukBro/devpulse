import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { sharesApi } from '@/api/endpoints/shares';
import Button from '@/components/ui/Button';
import type { SubscriptionShare } from '@/types/subscription';

interface SharesManagerProps {
  subscriptionId: string;
}

export default function SharesManager({ subscriptionId }: SharesManagerProps) {
  const [shares, setShares] = useState<SubscriptionShare[]>([]);
  const [total, setTotal] = useState(0);
  const [login, setLogin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    const result = await sharesApi.list(subscriptionId, { limit: 50 });
    setShares(result.items);
    setTotal(result.total);
  }, [subscriptionId]);

  useEffect(() => { loadShares(); }, [loadShares]);

  const handleAdd = async () => {
    if (!login.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await sharesApi.add(subscriptionId, login.trim());
      setLogin('');
      await loadShares();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Ошибка при добавлении';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (shareId: number) => {
    await sharesApi.remove(subscriptionId, shareId);
    await loadShares();
  };

  return (
    <div className="space-y-4">
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
            <div key={share.id} className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {share.sharedWithLogin}
                </span>
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(share.createdAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
              <button
                onClick={() => handleRemove(share.id)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500
                           dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
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
