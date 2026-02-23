import { useState } from 'react';
import CatalogCard from './CatalogCard';
import CatalogCardDetail from './CatalogCardDetail';
import type { CatalogCategory, CatalogAchievement } from '@/types/achievement';

interface AchievementCatalogProps {
  categories: CatalogCategory[];
  loading?: boolean;
}

export default function AchievementCatalog({ categories, loading }: AchievementCatalogProps) {
  const [selected, setSelected] = useState<CatalogAchievement | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleClick = (a: CatalogAchievement) => {
    setSelected(a);
    setDetailOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-8">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <div className="mb-4 h-5 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700/50" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="animate-pulse rounded-xl border border-gray-200 dark:border-surface-border bg-white dark:bg-surface p-4">
                  <div className="mb-3 flex justify-between">
                    <div className="h-9 w-9 rounded bg-gray-200 dark:bg-gray-700/50" />
                    <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700/50" />
                  </div>
                  <div className="mb-2 h-4 w-32 rounded bg-gray-200 dark:bg-gray-700/50" />
                  <div className="h-3 w-40 rounded bg-gray-200 dark:bg-gray-700/50" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        {categories.map((cat) => {
          const allUnlocked = cat.unlockedCount === cat.totalCount;
          return (
            <div key={cat.id}>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-lg">{cat.icon}</span>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{cat.name}</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({cat.unlockedCount}/{cat.totalCount})
                </span>
                {allUnlocked && <span className="text-sm">{'\u2705'}</span>}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cat.achievements.map((a) => (
                  <CatalogCard key={a.type} achievement={a} onClick={handleClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <CatalogCardDetail
        achievement={selected}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}
