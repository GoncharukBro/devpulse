import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';

interface ScoreBadgeProps {
  score: number | null;
  size?: 'sm' | 'lg';
  className?: string;
}

export default function ScoreBadge({ score, size = 'sm', className = '' }: ScoreBadgeProps) {
  const level = getMetricLevel('score', score);
  const colors = LEVEL_COLORS[level];

  const sizeStyles = size === 'lg'
    ? 'h-16 w-16 text-xl font-bold'
    : 'h-8 w-8 text-xs font-semibold';

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border ${colors.bg} ${colors.border} ${colors.text} ${sizeStyles} ${className}`}
    >
      {score !== null ? Math.round(score) : '—'}
    </div>
  );
}
