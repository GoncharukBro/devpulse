import type { AchievementRarity } from '@/types/achievement';

interface RarityBadgeProps {
  rarity: AchievementRarity;
}

const BADGE_STYLES: Record<AchievementRarity, string> = {
  common: 'bg-slate-500/20 text-slate-300',
  rare: 'bg-blue-500/20 text-blue-400',
  epic: 'bg-purple-500/20 text-purple-400',
  legendary: 'bg-amber-500/20 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.3)]',
};

const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
};

export default function RarityBadge({ rarity }: RarityBadgeProps) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE_STYLES[rarity]}`}
    >
      {RARITY_LABELS[rarity]}
    </span>
  );
}
