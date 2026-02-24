import RarityStars from './RarityStars';
import type { CatalogAchievement, AchievementRarity } from '@/types/achievement';

interface CatalogCardProps {
  achievement: CatalogAchievement;
  onClick: (achievement: CatalogAchievement) => void;
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
  ai_pioneer: '\uD83E\uDD16',
  rising_star: '\u2B50',
  consistency_king: '\uD83D\uDC51',
  top_performer: '\uD83C\uDFC6',
  overachiever: '\uD83D\uDCC8',
  debt_slayer: '\u2694\uFE0F',
};

function getIcon(type: string): string {
  return TYPE_ICONS[type] ?? '\uD83C\uDFC5';
}

const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/* ── Medallion (icon container) background per rarity ── */
const MEDALLION_STYLE: Record<AchievementRarity | 'locked', React.CSSProperties> = {
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
  locked: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%, rgba(0,0,0,0.15) 100%), linear-gradient(135deg, #374151, #1f2937)',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.1), inset 0 -1px 1px rgba(0,0,0,0.2)',
  },
};

/* ── Card glow per rarity ── */
const CARD_GLOW: Record<AchievementRarity, string> = {
  common: '',
  rare: 'shadow-[0_0_15px_rgba(59,130,246,0.15),0_0_30px_rgba(59,130,246,0.05)]',
  epic: 'shadow-[0_0_15px_rgba(139,92,246,0.2),0_0_30px_rgba(139,92,246,0.08)]',
  legendary: '',
};

/* ── Hover glow intensification ── */
const HOVER_GLOW: Record<AchievementRarity, string> = {
  common: 'hover:shadow-[0_4px_20px_rgba(100,116,139,0.15)]',
  rare: 'hover:shadow-[0_0_25px_rgba(59,130,246,0.3),0_0_40px_rgba(59,130,246,0.1)]',
  epic: 'hover:shadow-[0_0_25px_rgba(139,92,246,0.35),0_0_40px_rgba(139,92,246,0.12)]',
  legendary: 'hover:shadow-[0_0_30px_rgba(245,158,11,0.4),0_0_50px_rgba(245,158,11,0.18)]',
};

/* ── Top gradient accent line color ── */
const ACCENT_GRADIENT: Record<AchievementRarity, string> = {
  common: 'from-transparent via-slate-400 to-transparent',
  rare: 'from-transparent via-blue-500 to-transparent',
  epic: 'from-transparent via-purple-500 to-transparent',
  legendary: 'from-transparent via-amber-400 to-transparent',
};

/* ── Background radial glow for unlocked cards ── */
const BG_GLOW: Record<AchievementRarity, React.CSSProperties> = {
  common: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(100,116,139,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.03) 0%, transparent 50%)',
  },
  rare: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(59,130,246,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.03) 0%, transparent 50%)',
  },
  epic: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(139,92,246,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.03) 0%, transparent 50%)',
  },
  legendary: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(245,158,11,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.04) 0%, transparent 50%)',
  },
};

/* ── Progress bar gradient colors ── */
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

export default function CatalogCard({ achievement, onClick }: CatalogCardProps) {
  const { unlocked, bestRarity, bestValue, nextLevel } = achievement;
  const icon = getIcon(achievement.type);

  /* ── Locked card ── */
  if (!unlocked) {
    const firstLevel = achievement.thresholds.common;
    return (
      <button
        onClick={() => onClick(achievement)}
        className="group relative w-full overflow-hidden rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-surface p-4 text-left opacity-50 saturate-[0.3] transition-all duration-300 hover:opacity-70 hover:saturate-50"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(100,116,139,0.03) 10px, rgba(100,116,139,0.03) 20px)',
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          {/* Locked medallion */}
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-[28px] grayscale"
            style={{
              ...MEDALLION_STYLE.locked,
              transform: 'perspective(200px) rotateY(-5deg) rotateX(5deg)',
            }}
          >
            {icon}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 transition-transform duration-300 group-hover:animate-lock-shake">
              {'\uD83D\uDD12'}
            </span>
            <RarityStars bestRarity={null} />
          </div>
        </div>
        <h4 className="mb-1 text-sm font-bold text-gray-500 dark:text-gray-400">
          {achievement.title}
        </h4>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          {achievement.description}
        </p>
        {firstLevel && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Для Common: {firstLevel.label}
          </p>
        )}
      </button>
    );
  }

  /* ── Unlocked card ── */
  const rarity = bestRarity!;
  const nextRarity = nextLevel?.rarity;

  return (
    <button
      onClick={() => onClick(achievement)}
      className={`group relative w-full overflow-hidden rounded-xl border border-transparent bg-white dark:bg-surface p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:[transform:translateY(-4px)_perspective(800px)_rotateX(2deg)] ${CARD_GLOW[rarity]} ${HOVER_GLOW[rarity]} ${rarity === 'legendary' ? 'animate-legendary-glow' : ''}`}
      style={BG_GLOW[rarity]}
    >
      {/* Top gradient accent line */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${ACCENT_GRADIENT[rarity]}`}
      />

      {/* Header: Medallion + Stars */}
      <div className="mb-3 flex items-center justify-between">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-[28px] transition-transform duration-300 group-hover:scale-110"
          style={{
            ...MEDALLION_STYLE[rarity],
            transform: 'perspective(200px) rotateY(-5deg) rotateX(5deg)',
          }}
        >
          {icon}
        </div>
        <RarityStars bestRarity={bestRarity} />
      </div>

      {/* Title */}
      <h4 className="mb-1 text-sm font-bold text-gray-900 dark:text-white">
        {achievement.title}
      </h4>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        {achievement.description}
      </p>

      {/* Best value */}
      {bestValue !== null && (
        <p className="mb-2 text-xs text-gray-600 dark:text-gray-300">
          Лучший: {bestValue}
          {achievement.type.includes('rate') ||
          achievement.type.includes('guru') ||
          achievement.type.includes('focus') ||
          achievement.type.includes('utilization')
            ? '%'
            : ''}
        </p>
      )}

      {/* Progress bar */}
      {nextLevel && nextRarity && (
        <div className="mb-2">
          <div className="relative mb-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${nextLevel.progress}%`,
                ...PROGRESS_GRADIENT[nextRarity],
              }}
            />
            {/* Running shine */}
            <div
              className="pointer-events-none absolute inset-0 animate-progress-shine"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
              }}
            />
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            До {RARITY_LABELS[nextRarity!]}: {nextLevel.progress}%
          </p>
        </div>
      )}

      {nextLevel && !nextLevel.rarity && (
        <p className="mb-2 text-[10px] font-medium text-amber-500">
          {nextLevel.label}
        </p>
      )}

      {achievement.maxStreak > 0 && (
        <p className="text-[10px] text-orange-500 mb-0.5">
          {'\uD83D\uDD25'} Макс. серия: {achievement.maxStreak} нед.
        </p>
      )}
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        {'\uD83D\uDC64'} {achievement.earnedCount} получил
        {achievement.earnedCount === 1 ? '' : 'и'}
      </p>
    </button>
  );
}
