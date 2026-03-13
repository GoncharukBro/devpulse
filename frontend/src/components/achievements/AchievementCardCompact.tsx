import RarityStars from './RarityStars';
import RarityBadge from './RarityBadge';
import type { Achievement, AchievementRarity } from '@/types/achievement';

interface AchievementCardCompactProps {
  achievement: Achievement;
  onClick?: (achievement: Achievement) => void;
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/* ── Medallion (icon container) per rarity ── */
const MEDALLION_STYLE: Record<AchievementRarity, React.CSSProperties> = {
  common: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.2) 100%), linear-gradient(135deg, #64748b, #475569)',
    boxShadow: '0 3px 8px rgba(100,116,139,0.3), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2)',
  },
  rare: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.2) 100%), linear-gradient(135deg, #3b82f6, #2563eb)',
    boxShadow: '0 3px 8px rgba(59,130,246,0.3), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2)',
  },
  epic: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.2) 100%), linear-gradient(135deg, #8b5cf6, #7c3aed)',
    boxShadow: '0 3px 8px rgba(139,92,246,0.3), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2)',
  },
  legendary: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(0,0,0,0.2) 100%), linear-gradient(135deg, #f59e0b, #d97706)',
    boxShadow: '0 3px 10px rgba(245,158,11,0.4), inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -1px 1px rgba(0,0,0,0.2)',
  },
};

/* ── Card glow per rarity ── */
const CARD_GLOW: Record<AchievementRarity, string> = {
  common: '',
  rare: 'shadow-[0_0_12px_rgba(59,130,246,0.12),0_0_24px_rgba(59,130,246,0.04)]',
  epic: 'shadow-[0_0_12px_rgba(139,92,246,0.15),0_0_24px_rgba(139,92,246,0.06)]',
  legendary: '',
};

/* ── Hover glow ── */
const HOVER_GLOW: Record<AchievementRarity, string> = {
  common: 'hover:shadow-[0_4px_16px_rgba(100,116,139,0.12)]',
  rare: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.25),0_0_32px_rgba(59,130,246,0.08)]',
  epic: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.3),0_0_32px_rgba(139,92,246,0.1)]',
  legendary: 'hover:shadow-[0_0_25px_rgba(245,158,11,0.35),0_0_40px_rgba(245,158,11,0.15)]',
};

/* ── Top accent gradient ── */
const ACCENT_GRADIENT: Record<AchievementRarity, string> = {
  common: 'from-transparent via-slate-400 to-transparent',
  rare: 'from-transparent via-blue-500 to-transparent',
  epic: 'from-transparent via-purple-500 to-transparent',
  legendary: 'from-transparent via-amber-400 to-transparent',
};

/* ── Background radial glow ── */
const BG_GLOW: Record<AchievementRarity, React.CSSProperties> = {
  common: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(100,116,139,0.06) 0%, transparent 50%)',
  },
  rare: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(59,130,246,0.07) 0%, transparent 50%)',
  },
  epic: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(139,92,246,0.07) 0%, transparent 50%)',
  },
  legendary: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(245,158,11,0.08) 0%, transparent 50%)',
  },
};

export default function AchievementCardCompact({ achievement, onClick }: AchievementCardCompactProps) {
  const rarity = achievement.rarity;

  return (
    <button
      onClick={() => onClick?.(achievement)}
      className={`group relative w-full overflow-hidden rounded-lg border border-transparent bg-white dark:bg-surface p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:[transform:translateY(-2px)_perspective(800px)_rotateX(1.5deg)] ${CARD_GLOW[rarity]} ${HOVER_GLOW[rarity]} ${rarity === 'legendary' ? 'animate-legendary-glow' : ''}`}
      style={BG_GLOW[rarity]}
    >
      {/* Top accent line */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${ACCENT_GRADIENT[rarity]}`}
      />

      {/* Icon + Stars */}
      <div className="mb-2 flex items-center justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-lg transition-transform duration-300 group-hover:scale-110"
          style={{
            ...MEDALLION_STYLE[rarity],
            transform: 'perspective(200px) rotateY(-5deg) rotateX(5deg)',
          }}
        >
          {getIcon(achievement.type)}
        </div>
        <RarityStars bestRarity={rarity} />
      </div>

      {/* Title + Badge */}
      <h4 className="mb-0.5 text-sm font-bold text-gray-900 dark:text-white truncate">
        {achievement.title}
      </h4>
      <div className="mb-2">
        <RarityBadge rarity={rarity} />
      </div>

      {/* Description */}
      {achievement.description && (
        <p className="mb-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
          {achievement.description}
        </p>
      )}

      {/* Streak */}
      {achievement.currentStreak > 0 ? (
        <p className="text-[10px] text-orange-500 mb-0.5">
          {'\uD83D\uDD25'} {achievement.currentStreak} нед. подряд
          {achievement.currentStreak >= achievement.bestStreak && achievement.bestStreak > 0 && achievement.currentStreak > 1
            && ` — рекорд! ${'\uD83C\uDFC6'}`}
        </p>
      ) : achievement.bestStreak > 0 ? (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">
          Рекорд: {achievement.bestStreak} нед.
        </p>
      ) : null}

      {/* Project + Date */}
      <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
        {achievement.projectName && <>{achievement.projectName} &bull; </>}
        {formatDate(achievement.periodStart)}
      </p>
    </button>
  );
}
