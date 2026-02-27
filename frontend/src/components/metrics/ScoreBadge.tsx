import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';

interface ScoreBadgeProps {
  score: number | null;
  size?: 'sm' | 'lg';
  className?: string;
  nullReason?: string;
}

export default function ScoreBadge({ score, size = 'sm', className = '', nullReason }: ScoreBadgeProps) {
  const level = getMetricLevel('score', score);
  const colors = LEVEL_COLORS[level];

  const sizeStyles = size === 'lg'
    ? 'h-16 w-16 text-xl font-bold'
    : 'h-8 w-8 text-xs font-semibold';

  const title = score !== null
    ? `Score: ${Math.round(score)}`
    : nullReason ?? 'Нет данных';

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border ${colors.bg} ${colors.border} ${colors.text} ${sizeStyles} ${className}`}
      title={title}
    >
      {score !== null ? Math.round(score) : '—'}
    </div>
  );
}
