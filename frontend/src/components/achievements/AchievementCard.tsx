import type { Achievement, AchievementRarity } from '@/types/achievement';

interface AchievementCardProps {
  achievement: Achievement;
  onClick: (achievement: Achievement) => void;
}

const RARITY_STYLES: Record<AchievementRarity, { gradient: string; badge: string; glow: string }> = {
  common: {
    gradient: 'from-gray-700 via-slate-600 to-blue-900',
    badge: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    glow: '',
  },
  rare: {
    gradient: 'from-blue-800 via-indigo-700 to-purple-800',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    glow: '',
  },
  epic: {
    gradient: 'from-purple-800 via-fuchsia-700 to-pink-700',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    glow: 'shadow-purple-500/20',
  },
  legendary: {
    gradient: 'from-amber-600 via-yellow-500 to-orange-600',
    badge: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
    glow: 'shadow-amber-500/30 animate-pulse-slow',
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

export default function AchievementCard({ achievement, onClick }: AchievementCardProps) {
  const rarity = achievement.rarity;
  const styles = RARITY_STYLES[rarity];

  return (
    <button
      onClick={() => onClick(achievement)}
      className={`group relative w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${styles.gradient} p-4 text-left shadow-lg ${styles.glow} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:brightness-110`}
    >
      {/* Shine overlay on hover */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute -left-1/2 -top-1/2 h-[200%] w-[200%] rotate-12 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      </div>

      {/* Icon */}
      <div className="mb-3 text-3xl">{getTypeIcon(achievement.type)}</div>

      {/* Title */}
      <h4 className="mb-1 text-sm font-bold text-white">{achievement.title}</h4>

      {/* Employee */}
      <p className="mb-1 text-xs text-white/70">
        {achievement.displayName ?? achievement.youtrackLogin}
      </p>

      {/* Project */}
      {achievement.projectName && (
        <p className="mb-2 text-xs text-white/50">{achievement.projectName}</p>
      )}

      {/* Rarity badge */}
      <div className={`mt-auto inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles.badge}`}>
        {RARITY_LABELS[rarity]}
      </div>
    </button>
  );
}
