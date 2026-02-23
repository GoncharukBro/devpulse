import { useNavigate } from 'react-router-dom';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import RarityStars from './RarityStars';
import RarityBadge from './RarityBadge';
import type { Achievement, AchievementRarity } from '@/types/achievement';
import { ACHIEVEMENT_THRESHOLDS, RARITY_ORDER } from '@/types/achievement';

interface AchievementDetailProps {
  achievement: Achievement | null;
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

/* ── Medallion styles per rarity (matching CatalogCard) ── */
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

/* ── Row highlight for current rarity level ── */
const RARITY_ROW_HIGHLIGHT: Record<AchievementRarity, string> = {
  common: 'bg-slate-500/10 border-l-2 border-l-slate-400',
  rare: 'bg-blue-500/10 border-l-2 border-l-blue-500',
  epic: 'bg-purple-500/10 border-l-2 border-l-purple-500',
  legendary: 'bg-amber-500/10 border-l-2 border-l-amber-400',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPeriod(periodStart: string): string {
  const start = new Date(periodStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString('ru-RU', {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' }),
  });
  const endStr = end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

  return `${startStr}\u2013${endStr}`;
}

export default function AchievementDetail({ achievement, open, onClose }: AchievementDetailProps) {
  const navigate = useNavigate();

  if (!achievement) return null;

  const rarity = achievement.rarity;
  const rarityIdx = RARITY_INDEX[rarity];
  const thresholds = ACHIEVEMENT_THRESHOLDS[achievement.type];

  const handlePersonClick = () => {
    onClose();
    navigate(`/employees/${achievement.youtrackLogin}`);
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
        <div className="mt-1.5">
          <RarityBadge rarity={rarity} />
        </div>
      </div>

      {/* ── Info rows ── */}
      <div className="mb-5 space-y-2.5 rounded-lg border border-gray-200 dark:border-surface-border px-4 py-3">
        {/* Employee */}
        <div className="flex items-baseline justify-between gap-4">
          <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">Сотрудник</span>
          <button
            onClick={handlePersonClick}
            className="truncate text-right text-sm font-medium text-brand-500 hover:text-brand-600 hover:underline cursor-pointer transition-colors"
          >
            {achievement.displayName ?? achievement.youtrackLogin}
          </button>
        </div>

        {/* Project */}
        {achievement.projectName && (
          <div className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">Проект</span>
            <span className="truncate text-right text-sm text-gray-700 dark:text-gray-200">
              {achievement.projectName}
            </span>
          </div>
        )}

        {/* Period */}
        <div className="flex items-baseline justify-between gap-4">
          <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">Период</span>
          <span className="text-sm text-gray-700 dark:text-gray-200">
            {formatPeriod(achievement.periodStart)}
          </span>
        </div>

        {/* Earned date */}
        <div className="flex items-baseline justify-between gap-4">
          <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">Получена</span>
          <span className="text-sm text-gray-700 dark:text-gray-200">
            {formatDate(achievement.createdAt)}
          </span>
        </div>
      </div>

      {/* ── Description ── */}
      {achievement.description && (
        <div className="mb-5">
          <h4 className="mb-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Описание
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {achievement.description}
          </p>
        </div>
      )}

      {/* ── Levels table ── */}
      {thresholds && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Уровни
          </h4>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-surface-border">
            {RARITY_ORDER.map((lvl) => {
              const lvlIdx = RARITY_INDEX[lvl];
              const label = thresholds.levels[lvl];
              if (!label) return null;

              const unlocked = lvlIdx <= rarityIdx;
              const isCurrent = lvl === rarity;

              return (
                <div
                  key={lvl}
                  className={`flex items-center justify-between border-b border-gray-100 dark:border-surface-border px-3 py-2.5 last:border-b-0 ${
                    isCurrent ? RARITY_ROW_HIGHLIGHT[rarity] : unlocked ? '' : 'opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RarityStars bestRarity={lvl} />
                    <span className="text-sm capitalize text-gray-700 dark:text-gray-200">
                      {lvl}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
                    <span className="text-base">
                      {unlocked ? '\u2705' : '\uD83D\uDD12'}
                    </span>
                    {isCurrent && (
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                        &larr; текущий
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
