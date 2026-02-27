import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import AchievementStats from '@/components/achievements/AchievementStats';
import AchievementFeed from '@/components/achievements/AchievementFeed';
import AchievementCatalog from '@/components/achievements/AchievementCatalog';
import { usePageTitle } from '@/hooks/usePageTitle';
import { achievementsApi } from '@/api/endpoints/achievements';
import type { CatalogResponse } from '@/types/achievement';

type TabId = 'feed' | 'catalog';

export default function AchievementsPage() {
  usePageTitle('Достижения');
  const [activeTab, setActiveTab] = useState<TabId>('catalog');
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      setCatalogLoading(true);
      setError(false);
      const result = await achievementsApi.getCatalog();
      setCatalog(result);
    } catch {
      setError(true);
      toast.error('Не удалось загрузить каталог достижений');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'catalog', label: 'Каталог' },
    { id: 'feed', label: 'Лента' },
  ];

  if (error && !catalog) {
    return (
      <>
        <PageHeader title="Достижения" description="Коллекция наград сотрудников за выдающиеся результаты по метрикам" />
        <Card>
          <div className="py-8 text-center">
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Не удалось загрузить данные</p>
            <button
              onClick={loadCatalog}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
            >
              Повторить
            </button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Достижения" description="Коллекция наград сотрудников за выдающиеся результаты по метрикам" />

      {/* Stats */}
      <AchievementStats stats={catalog?.stats ?? null} loading={catalogLoading} />

      {/* Tabs */}
      <div role="tablist" aria-label="Разделы достижений" className="mb-6 flex gap-1 rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              activeTab === tab.id
                ? 'bg-white dark:bg-surface text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'feed' && (
        <div id="tabpanel-feed" role="tabpanel">
          <AchievementFeed />
        </div>
      )}
      {activeTab === 'catalog' && (
        <div id="tabpanel-catalog" role="tabpanel">
          <AchievementCatalog
            categories={catalog?.categories ?? []}
            loading={catalogLoading}
          />
        </div>
      )}
    </>
  );
}
