import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { Achievement, AchievementRarity } from '@/types/achievement';

interface AchievementDetailProps {
  achievement: Achievement | null;
  open: boolean;
  onClose: () => void;
}

const RARITY_STYLES: Record<AchievementRarity, { gradient: string; badge: string }> = {
  common: {
    gradient: 'from-gray-700 via-slate-600 to-blue-900',
    badge: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  },
  rare: {
    gradient: 'from-blue-800 via-indigo-700 to-purple-800',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  epic: {
    gradient: 'from-purple-800 via-fuchsia-700 to-pink-700',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  legendary: {
    gradient: 'from-amber-600 via-yellow-500 to-orange-600',
    badge: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  },
};

const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

const TYPE_ICONS: Record<string, string> = {
  speed_demon: '\u26A1',
  quality_master: '\uD83C\uDFAF',
  focus_king: '\uD83D\uDD2D',
  streak_star: '\uD83D\uDD25',
  team_player: '\uD83E\uDD1D',
  early_bird: '\uD83C\uDF05',
  bug_hunter: '\uD83D\uDC1B',
  overachiever: '\uD83C\uDFC6',
};

function getTypeIcon(type: string): string {
  return TYPE_ICONS[type] ?? '\uD83C\uDFC5';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AchievementDetail({ achievement, open, onClose }: AchievementDetailProps) {
  if (!achievement) return null;

  const rarity = achievement.rarity;
  const styles = RARITY_STYLES[rarity];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Детали ачивки"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      }
    >
      {/* Large card */}
      <div className={`mb-4 overflow-hidden rounded-xl bg-gradient-to-br ${styles.gradient} p-6 text-center`}>
        <div className="mb-3 text-5xl">{getTypeIcon(achievement.type)}</div>
        <h3 className="mb-1 text-lg font-bold text-white">{achievement.title}</h3>
        <div className={`mx-auto mt-2 inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${styles.badge}`}>
          {RARITY_LABELS[rarity]}
        </div>
      </div>

      {/* Info */}
      <div className="space-y-3">
        <div>
          <span className="text-xs text-gray-400 dark:text-gray-500">Сотрудник</span>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {achievement.displayName ?? achievement.youtrackLogin}
          </p>
        </div>

        {achievement.projectName && (
          <div>
            <span className="text-xs text-gray-400 dark:text-gray-500">Проект</span>
            <p className="text-sm text-gray-700 dark:text-gray-200">{achievement.projectName}</p>
          </div>
        )}

        <div>
          <span className="text-xs text-gray-400 dark:text-gray-500">Описание</span>
          <p className="text-sm text-gray-600 dark:text-gray-300">{achievement.description}</p>
        </div>

        <div className="flex gap-6">
          <div>
            <span className="text-xs text-gray-400 dark:text-gray-500">Период</span>
            <p className="text-sm text-gray-700 dark:text-gray-200">{formatDate(achievement.periodStart)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400 dark:text-gray-500">Получена</span>
            <p className="text-sm text-gray-700 dark:text-gray-200">{formatDate(achievement.createdAt)}</p>
          </div>
        </div>

        {Object.keys(achievement.metadata).length > 0 && (
          <div>
            <span className="text-xs text-gray-400 dark:text-gray-500">Метрики</span>
            <div className="mt-1 space-y-1">
              {Object.entries(achievement.metadata).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{key}</span>
                  <span className="text-gray-700 dark:text-gray-200">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
