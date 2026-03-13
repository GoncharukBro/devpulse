import { useNavigate } from 'react-router-dom';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import RarityStars from './RarityStars';
import RarityBadge from './RarityBadge';
import type { CatalogAchievement, AchievementRarity } from '@/types/achievement';
import { RARITY_ORDER } from '@/types/achievement';

interface CatalogCardDetailProps {
  achievement: CatalogAchievement | null;
  open: boolean;
  onClose: () => void;
}

const RARITY_INDEX: Record<AchievementRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
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
  rising_star: '\u2B50',
  consistency_king: '\uD83D\uDC51',
  top_performer: '\uD83C\uDFC6',
  overachiever: '\uD83D\uDCC8',
  debt_slayer: '\u2694\uFE0F',
};

function getIcon(type: string): string {
  return TYPE_ICONS[type] ?? '\uD83C\uDFC5';
}

/* ── Medallion styles per rarity (matching CatalogCard / AchievementDetail) ── */
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

/* ── Row highlight for best rarity level ── */
const RARITY_ROW_HIGHLIGHT: Record<AchievementRarity, string> = {
  common: 'bg-slate-500/10 border-l-2 border-l-slate-400',
  rare: 'bg-blue-500/10 border-l-2 border-l-blue-500',
  epic: 'bg-purple-500/10 border-l-2 border-l-purple-500',
  legendary: 'bg-amber-500/10 border-l-2 border-l-amber-400',
};

/* ── Progress bar gradient ── */
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function CatalogCardDetail({ achievement, open, onClose }: CatalogCardDetailProps) {
  const navigate = useNavigate();

  if (!achievement) return null;

  const bestRarity = achievement.bestRarity;
  const bestIndex = bestRarity ? RARITY_INDEX[bestRarity] : -1;

  const handlePersonClick = (login: string) => {
    onClose();
    navigate(`/employees/${login}`);
  };

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
      {/* ── Header: Medallion + Title + Badge ── */}
      <div className="mb-5 text-center">
        {bestRarity ? (
          <div
            className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
            style={{
              ...MEDALLION_STYLE[bestRarity],
              transform: 'perspective(200px) rotateY(-5deg) rotateX(5deg)',
            }}
          >
            {getIcon(achievement.type)}
          </div>
        ) : (
          <div className="mb-3 text-5xl">{getIcon(achievement.type)}</div>
        )}
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {achievement.title}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {achievement.description}
        </p>
        {bestRarity && (
          <div className="mt-1.5">
            <RarityBadge rarity={bestRarity} />
          </div>
        )}
      </div>

      {/* ── Levels table ── */}
      <div className="mb-5">
        <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Уровни</h4>
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-surface-border">
          {RARITY_ORDER.map((rarity) => {
            const threshold = achievement.thresholds[rarity];
            if (!threshold) return null;
            const unlocked = achievement.unlocked && bestIndex >= RARITY_INDEX[rarity];
            const isBest = rarity === bestRarity;

            return (
              <div
                key={rarity}
                className={`flex items-center justify-between border-b border-gray-100 dark:border-surface-border px-3 py-2.5 last:border-b-0 ${
                  isBest && bestRarity
                    ? RARITY_ROW_HIGHLIGHT[bestRarity]
                    : unlocked
                      ? ''
                      : 'opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <RarityStars bestRarity={rarity} />
                  <span className="text-sm text-gray-700 dark:text-gray-200 capitalize">{rarity}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{threshold.label}</span>
                  <span className="text-base">{unlocked ? '\u2705' : '\uD83D\uDD12'}</span>
                  {isBest && (
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                      &larr; лучший
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Best result & progress ── */}
      {achievement.unlocked && achievement.bestValue !== null && (
        <div className="mb-5">
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
            Лучший результат: <span className="font-semibold text-gray-900 dark:text-white">{achievement.bestValue}</span>
          </p>
          {achievement.nextLevel && achievement.nextLevel.rarity && (
            <div>
              <div className="relative mb-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${achievement.nextLevel.progress}%`,
                    ...PROGRESS_GRADIENT[achievement.nextLevel.rarity],
                  }}
                />
                {/* Running shine */}
                <div
                  className="pointer-events-none absolute inset-0 animate-progress-shine"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {achievement.nextLevel.progress}% до {achievement.nextLevel.rarity.charAt(0).toUpperCase() + achievement.nextLevel.rarity.slice(1)}
              </p>
            </div>
          )}
          {achievement.nextLevel && !achievement.nextLevel.rarity && (
            <p className="text-xs font-medium text-amber-500">{achievement.nextLevel.label}</p>
          )}
        </div>
      )}

      {/* ── Who earned ── */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Кто получал ({achievement.earnedCount})
        </h4>
        {achievement.earnedBy.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-surface-border px-4 py-6 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">Пока никто не получил</p>
            {achievement.thresholds.common && (
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Для получения уровня Common необходимо: {achievement.thresholds.common.label}
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-surface-border rounded-lg border border-gray-200 dark:border-surface-border">
            {achievement.earnedBy.map((person, i) => (
              <div key={i} className="px-3 py-2.5">
                <p className="text-sm">
                  <button
                    onClick={() => handlePersonClick(person.youtrackLogin)}
                    className="font-medium text-brand-500 hover:text-brand-600 hover:underline cursor-pointer transition-colors"
                  >
                    {person.displayName}
                  </button>
                  {person.projectName && (
                    <span className="font-normal text-gray-500 dark:text-gray-400"> &bull; {person.projectName}</span>
                  )}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <RarityBadge rarity={person.rarity} />
                  <span>{formatDate(person.periodStart)}</span>
                  {person.description && <span>&bull; {person.description}</span>}
                  {person.currentStreak > 0 && (
                    <span className="text-orange-500">{'\uD83D\uDD25'} {person.currentStreak} нед.</span>
                  )}
                  {person.bestStreak > 0 && (
                    <span>рекорд: {person.bestStreak}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
