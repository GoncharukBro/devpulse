import type { CatalogStats } from '@/types/achievement';

interface AchievementStatsProps {
  stats: CatalogStats | null;
  loading?: boolean;
}

export default function AchievementStats({ stats, loading }: AchievementStatsProps) {
  const items = [
    { icon: '\uD83C\uDF96\uFE0F', label: 'Открыто', value: stats ? `${stats.unlockedTypes}/${stats.totalTypes}` : '-' },
    { icon: '\uD83C\uDFC5', label: 'Получено', value: stats?.totalEarned ?? '-' },
    { icon: '\uD83D\uDC51', label: 'Legendary', value: stats?.legendaryCount ?? '-' },
    { icon: '\u26A1', label: 'На неделе', value: stats?.thisWeekCount ?? '-' },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-gray-200 dark:border-surface-border bg-white dark:bg-surface p-4 text-center transition-colors"
        >
          {loading ? (
            <div className="animate-pulse">
              <div className="mx-auto mb-2 h-6 w-6 rounded bg-gray-200 dark:bg-gray-700/50" />
              <div className="mx-auto mb-1 h-5 w-10 rounded bg-gray-200 dark:bg-gray-700/50" />
              <div className="mx-auto h-3 w-14 rounded bg-gray-200 dark:bg-gray-700/50" />
            </div>
          ) : (
            <>
              <div className="mb-1 text-xl">{item.icon}</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{item.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{item.label}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
