import type { AchievementRarity } from '@/types/achievement';

interface RarityStarsProps {
  bestRarity: AchievementRarity | null;
}

const RARITY_INDEX: Record<AchievementRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const STAR_COLORS: Record<AchievementRarity, string> = {
  common: 'text-slate-400',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
  legendary: 'text-amber-400',
};

/* Text-shadow glow for filled stars */
const STAR_GLOW: Record<AchievementRarity, React.CSSProperties> = {
  common: { textShadow: '0 0 4px rgba(148,163,184,0.4)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' },
  rare: { textShadow: '0 0 4px rgba(59,130,246,0.5)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' },
  epic: { textShadow: '0 0 5px rgba(139,92,246,0.5)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' },
  legendary: { textShadow: '0 0 6px rgba(245,158,11,0.6)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' },
};

export default function RarityStars({ bestRarity }: RarityStarsProps) {
  const filled = bestRarity ? RARITY_INDEX[bestRarity] : 0;
  const color = bestRarity ? STAR_COLORS[bestRarity] : '';
  const isLegendary = bestRarity === 'legendary';

  return (
    <span className="inline-flex gap-0.5 text-sm">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`${i <= filled ? color : 'text-gray-600'} ${i <= filled && isLegendary ? 'animate-star-shimmer' : ''}`}
          style={i <= filled && bestRarity ? {
            ...STAR_GLOW[bestRarity],
            ...(isLegendary ? { animationDelay: `${(i - 1) * 0.3}s` } : {}),
          } : undefined}
        >
          {i <= filled ? '\u2605' : '\u2606'}
        </span>
      ))}
    </span>
  );
}
