import RarityStars from './RarityStars';
import RarityBadge from './RarityBadge';
import type { PortfolioAchievement, AchievementRarity } from '@/types/achievement';

interface AchievementPortfolioCardProps {
  achievement: PortfolioAchievement;
  onClick: (achievement: PortfolioAchievement) => void;
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

/* ── Medallion background per rarity ── */
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

const CARD_GLOW: Record<AchievementRarity, string> = {
  common: '',
  rare: 'shadow-[0_0_15px_rgba(59,130,246,0.15),0_0_30px_rgba(59,130,246,0.05)]',
  epic: 'shadow-[0_0_15px_rgba(139,92,246,0.2),0_0_30px_rgba(139,92,246,0.08)]',
  legendary: '',
};

const HOVER_GLOW: Record<AchievementRarity, string> = {
  common: 'hover:shadow-[0_4px_20px_rgba(100,116,139,0.15)]',
  rare: 'hover:shadow-[0_0_25px_rgba(59,130,246,0.3),0_0_40px_rgba(59,130,246,0.1)]',
  epic: 'hover:shadow-[0_0_25px_rgba(139,92,246,0.35),0_0_40px_rgba(139,92,246,0.12)]',
  legendary: 'hover:shadow-[0_0_30px_rgba(245,158,11,0.4),0_0_50px_rgba(245,158,11,0.18)]',
};

const ACCENT_GRADIENT: Record<AchievementRarity, string> = {
  common: 'from-transparent via-slate-400 to-transparent',
  rare: 'from-transparent via-blue-500 to-transparent',
  epic: 'from-transparent via-purple-500 to-transparent',
  legendary: 'from-transparent via-amber-400 to-transparent',
};

const BG_GLOW: Record<AchievementRarity, React.CSSProperties> = {
  common: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(100,116,139,0.06) 0%, transparent 50%)',
  },
  rare: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(59,130,246,0.08) 0%, transparent 50%)',
  },
  epic: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(139,92,246,0.08) 0%, transparent 50%)',
  },
  legendary: {
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(245,158,11,0.1) 0%, transparent 50%)',
  },
};

export default function AchievementPortfolioCard({ achievement, onClick }: AchievementPortfolioCardProps) {
  const rarity = achievement.bestRarity;
  const { currentStreak, bestStreak } = achievement;
  const nearRecord = bestStreak > 0 && currentStreak >= bestStreak * 0.8 && currentStreak < bestStreak;

  // Find the date of the best rarity level
  const bestLevel = achievement.levels.find((l) => l.rarity === rarity);

  return (
    <button
      onClick={() => onClick(achievement)}
      className={`group relative w-full overflow-hidden rounded-xl border border-transparent bg-white dark:bg-surface p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:[transform:translateY(-4px)_perspective(800px)_rotateX(2deg)] ${CARD_GLOW[rarity]} ${HOVER_GLOW[rarity]} ${rarity === 'legendary' ? 'animate-legendary-glow' : ''}`}
      style={BG_GLOW[rarity]}
    >
      {/* Top gradient accent */}
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
          {getIcon(achievement.type)}
        </div>
        <RarityStars bestRarity={rarity} />
      </div>

      {/* Title + Badge */}
      <h4 className="mb-1 text-sm font-bold text-gray-900 dark:text-white truncate">
        {achievement.title}
      </h4>
      <div className="mb-2">
        <RarityBadge rarity={rarity} />
      </div>

      {/* Best value */}
      {achievement.bestValue !== null && (
        <p className="mb-2 text-xs text-gray-600 dark:text-gray-300 truncate">
          Лучший: {bestLevel?.description || String(achievement.bestValue)}
        </p>
      )}

      {/* Streak info */}
      <div className="mt-auto">
        {currentStreak > 0 ? (
          <div>
            <p className={`text-xs font-medium ${currentStreak >= bestStreak && bestStreak > 0 ? 'text-amber-500' : nearRecord ? 'text-green-500' : 'text-orange-500'}`}>
              {'\uD83D\uDD25'} {currentStreak} нед. подряд
              {currentStreak >= bestStreak && bestStreak > 0 && currentStreak > 1
                ? ` — рекорд! ${'\uD83C\uDFC6'}`
                : nearRecord
                  ? ' — Близко к рекорду!'
                  : ''}
            </p>
            {bestStreak > currentStreak && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                рекорд: {bestStreak}
              </p>
            )}
          </div>
        ) : bestStreak > 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Рекорд: {bestStreak} нед.
          </p>
        ) : null}
      </div>
    </button>
  );
}
