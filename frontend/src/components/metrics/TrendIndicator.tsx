import type { ScoreTrend } from '@/types/reports';

interface TrendIndicatorProps {
  trend: ScoreTrend;
  value?: string | null;
  className?: string;
}

export default function TrendIndicator({ trend, value, className = '' }: TrendIndicatorProps) {
  if (!trend) {
    return <span className={`text-gray-400 dark:text-gray-500 ${className}`}>—</span>;
  }

  const config = {
    up:     { icon: '↑', color: 'text-emerald-400' },
    down:   { icon: '↓', color: 'text-red-400' },
    stable: { icon: '→', color: 'text-gray-400' },
  } as const;

  const { icon, color } = config[trend];

  return (
    <span className={`inline-flex items-center gap-1 font-medium ${color} ${className}`}>
      <span className="text-lg leading-none">{icon}</span>
      {value && <span className="text-xs">{value}</span>}
    </span>
  );
}
