import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ArrowUp } from 'lucide-react';
import RarityBadge from './RarityBadge';
import type { Achievement, AchievementRarity } from '@/types/achievement';

interface AchievementFeedItemProps {
  login: string;
  displayName: string;
  achievements: Achievement[];
}

const RARITY_ORDER: Record<AchievementRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

const BORDER_COLORS: Record<AchievementRarity, string> = {
  common: 'border-l-slate-400',
  rare: 'border-l-blue-500',
  epic: 'border-l-purple-500',
  legendary: 'border-l-amber-400',
};

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

export function getBestRarity(achievements: Achievement[]): AchievementRarity {
  let best: AchievementRarity = 'common';
  for (const a of achievements) {
    if (RARITY_ORDER[a.rarity] > RARITY_ORDER[best]) best = a.rarity;
  }
  return best;
}

export function sortByRarity(achievements: Achievement[]): Achievement[] {
  return [...achievements].sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);
}

/**
 * Determine if an achievement is a level-up (not the first time — rarity > common,
 * or there are multiple achievements of same type for same employee in the list).
 */
function isLevelUp(achievement: Achievement, allAchievements: Achievement[]): boolean {
  // If rarity is not common, it's likely a level-up
  if (achievement.rarity !== 'common') {
    // Check if there are lower-rarity achievements of the same type for this employee
    return allAchievements.some(
      (a) => a.type === achievement.type &&
        a.youtrackLogin === achievement.youtrackLogin &&
        RARITY_ORDER[a.rarity] < RARITY_ORDER[achievement.rarity],
    );
  }
  return false;
}

export default function AchievementFeedItem({ login, displayName, achievements }: AchievementFeedItemProps) {
  const [expanded, setExpanded] = useState(false);
  const bestRarity = getBestRarity(achievements);
  const sorted = sortByRarity(achievements);

  // Deduplicate: for each type, show only best rarity
  const bestByType = new Map<string, Achievement>();
  for (const a of sorted) {
    if (!bestByType.has(a.type)) {
      bestByType.set(a.type, a);
    }
  }
  const uniqueAchievements = [...bestByType.values()];

  // Check if achievements span multiple projects
  const projects = new Set(uniqueAchievements.map((a) => a.projectName).filter(Boolean));
  const singleProject = projects.size <= 1;
  const projectName = singleProject ? (uniqueAchievements[0]?.projectName ?? '') : '';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } }}
      className={`cursor-pointer rounded-lg border border-gray-200 dark:border-surface-border border-l-4 ${BORDER_COLORS[bestRarity]} bg-white dark:bg-surface px-4 py-3 transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${bestRarity === 'legendary' ? 'shadow-[0_0_8px_rgba(245,158,11,0.15)]' : ''}`}
    >
      {/* Header — always visible */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-sm">{'\uD83D\uDC64'}</span>
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {displayName}
          </span>
          {projectName && (
            <span className="hidden sm:inline truncate text-sm text-gray-500 dark:text-gray-400">
              &bull; {projectName}
            </span>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
      </div>

      {/* Compact badges — visible when collapsed */}
      {!expanded && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {uniqueAchievements.map((a) => {
            const upgraded = isLevelUp(a, achievements);
            return (
              <span key={a.id} className="inline-flex items-center gap-1">
                <span className="text-sm leading-none">{getIcon(a.type)}</span>
                <RarityBadge rarity={a.rarity} />
                {upgraded && <ArrowUp size={10} className="text-green-500" />}
              </span>
            );
          })}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 space-y-2.5 animate-fade-in">
          {uniqueAchievements.map((a) => {
            const upgraded = isLevelUp(a, achievements);
            return (
              <div key={a.id} className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="shrink-0 text-lg leading-tight mt-0.5">{getIcon(a.type)}</span>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{a.title}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {!singleProject && a.projectName && <>{a.projectName} &bull; </>}
                      {a.description}
                    </p>
                    {a.currentStreak > 0 && (
                      <p className="text-[10px] text-orange-500">
                        {'\uD83D\uDD25'} {a.currentStreak} нед. подряд
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <RarityBadge rarity={a.rarity} />
                  {upgraded && <ArrowUp size={12} className="text-green-500" />}
                </div>
              </div>
            );
          })}

          {/* Profile link */}
          <div className="pt-1">
            <Link
              to={`/employees/${login}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 transition-colors"
            >
              &rarr; профиль
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
