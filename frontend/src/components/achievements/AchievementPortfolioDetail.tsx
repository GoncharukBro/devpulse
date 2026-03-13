import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import RarityStars from './RarityStars';
import RarityBadge from './RarityBadge';
import type { PortfolioAchievement, AchievementRarity } from '@/types/achievement';
import { ACHIEVEMENT_THRESHOLDS, RARITY_ORDER } from '@/types/achievement';

interface AchievementPortfolioDetailProps {
  achievement: PortfolioAchievement | null;
  open: boolean;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  speed_demon: '\u26A1',
  task_crusher: '\uD83D\uDD25',
  marathon_runner: '\uD83C\uDFC3',
  estimation_guru: '\uD83C\uDFAF',
  zero_bugs: '\uD83D\uDEE1\uFE0F',
  quick_closer: '\uD83D\uDE80',
  focus_master: '\uD83D\uDD2D',
  balanced_warrior: '\u2696\uFE0F',
  rising_star: '\u2B50',
  consistency_king: '\uD83D\uDC51',
  top_performer: '\uD83C\uDFC6',
  overachiever: '\uD83D\uDCC8',
  debt_slayer: '\u2694\uFE0F',
};

function getIcon(type: string): string {
  return TYPE_ICONS[type] ?? '\uD83C\uDFC5';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const MEDALLION_STYLE: Record<AchievementRarity, React.CSSProperties> = {
  common: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.2) 100%), linear-gradient(135deg, #64748b, #475569)',
    boxShadow: '0 4px 12px rgba(100,116,139,0.3), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2)',
  },
  rare: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.2) 100%), linear-gradient(135deg, #3b82f6, #2563eb)',
    boxShadow: '0 4px 12px rgba(59,130,246,0.3), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2)',
  },
  epic: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.2) 100%), linear-gradient(135deg, #8b5cf6, #7c3aed)',
    boxShadow: '0 4px 12px rgba(139,92,246,0.3), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2)',
  },
  legendary: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(0,0,0,0.2) 100%), linear-gradient(135deg, #f59e0b, #d97706)',
    boxShadow: '0 4px 14px rgba(245,158,11,0.4), inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -1px 1px rgba(0,0,0,0.2)',
  },
};

const RARITY_ROW_HIGHLIGHT: Record<AchievementRarity, string> = {
  common: 'bg-slate-500/10 border-l-2 border-l-slate-400',
  rare: 'bg-blue-500/10 border-l-2 border-l-blue-500',
  epic: 'bg-purple-500/10 border-l-2 border-l-purple-500',
  legendary: 'bg-amber-500/10 border-l-2 border-l-amber-400',
};

const PROGRESS_GRADIENT: Record<AchievementRarity, React.CSSProperties> = {
  common: {
    background: 'linear-gradient(90deg, #94a3b8, #cbd5e1)',
    boxShadow: '0 0 8px rgba(100,116,139,0.3)',
  },
  rare: {
    background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
    boxShadow: '0 0 8px rgba(59,130,246,0.4)',
  },
  epic: {
    background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
    boxShadow: '0 0 8px rgba(139,92,246,0.4)',
  },
  legendary: {
    background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
    boxShadow: '0 0 8px rgba(245,158,11,0.4)',
  },
};

export default function AchievementPortfolioDetail({ achievement, open, onClose }: AchievementPortfolioDetailProps) {
  if (!achievement) return null;

  const rarity = achievement.bestRarity;
  const thresholds = ACHIEVEMENT_THRESHOLDS[achievement.type];
  const bestRarityIndex = RARITY_ORDER.indexOf(rarity);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title=""
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      }
    >
      {/* Header */}
      <div className="mb-5 text-center">
        <div
          className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
          style={{
            ...MEDALLION_STYLE[rarity],
            transform: 'perspective(200px) rotateY(-5deg) rotateX(5deg)',
          }}
        >
          {getIcon(achievement.type)}
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {achievement.title}
        </h3>
        {thresholds && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {thresholds.description}
          </p>
        )}
        <div className="mt-1.5">
          <RarityBadge rarity={rarity} />
        </div>
      </div>

      {/* Levels table */}
      {thresholds && (
        <div className="mb-5">
          <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Уровни</h4>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-surface-border">
            {RARITY_ORDER.map((lvl, lvlIndex) => {
              const label = thresholds.levels[lvl];
              if (!label) return null;
              // Level is unlocked if its index <= bestRarityIndex (higher level implies lower levels passed)
              const unlocked = lvlIndex <= bestRarityIndex;
              const isBest = lvl === rarity;
              // Show date only if this exact rarity was explicitly earned
              const levelData = achievement.levels.find((l) => l.rarity === lvl);

              return (
                <div
                  key={lvl}
                  className={`flex items-center justify-between border-b border-gray-100 dark:border-surface-border px-3 py-2.5 last:border-b-0 ${
                    isBest ? RARITY_ROW_HIGHLIGHT[rarity] : unlocked ? '' : 'opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RarityStars bestRarity={lvl} />
                    <span className="text-sm text-gray-700 dark:text-gray-200 capitalize">{lvl}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
                    {unlocked ? (
                      <span className="text-base">{'\u2705'}</span>
                    ) : (
                      <span className="text-base">{'\uD83D\uDD12'}</span>
                    )}
                    {unlocked && levelData && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {formatDate(levelData.earnedAt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Streak section */}
      {(achievement.currentStreak > 0 || achievement.bestStreak > 0) && (
        <div className="mb-5 rounded-lg border border-gray-200 dark:border-surface-border px-4 py-3 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Серия</h4>
          {achievement.currentStreak > 0 ? (
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${achievement.currentStreak >= achievement.bestStreak && achievement.bestStreak > 0 ? 'text-amber-500' : 'text-orange-500'}`}>
                {'\uD83D\uDD25'} Текущая: {achievement.currentStreak} нед. подряд
                {achievement.currentStreak >= achievement.bestStreak && achievement.bestStreak > 0 && achievement.currentStreak > 1
                  && ` — рекорд! ${'\uD83C\uDFC6'}`}
              </span>
            </div>
          ) : null}
          {achievement.bestStreak > 0 && achievement.bestStreak > achievement.currentStreak && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {'\uD83C\uDFC6'} Рекорд: {achievement.bestStreak} нед.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Best result + progress to next level */}
      {achievement.bestValue !== null && (
        <div className="mb-5">
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
            Лучший результат: <span className="font-semibold text-gray-900 dark:text-white">{achievement.bestValue}</span>
            {rarity !== 'legendary' && ' '}
            {rarity === 'legendary' && (
              <span className="text-xs text-amber-500">(MAX)</span>
            )}
          </p>
          {achievement.nextLevel && (
            <div>
              <div className="relative mb-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${achievement.nextLevel.progress}%`,
                    ...PROGRESS_GRADIENT[achievement.nextLevel.rarity],
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0 animate-progress-shine"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {achievement.nextLevel.progress}% до {achievement.nextLevel.rarity.charAt(0).toUpperCase() + achievement.nextLevel.rarity.slice(1)}
                {' — '}{achievement.nextLevel.label}
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
