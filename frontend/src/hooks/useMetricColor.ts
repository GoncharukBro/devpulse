export type MetricLevel = 'good' | 'warning' | 'danger' | 'neutral';

const THRESHOLDS: Record<string, { good: number | [number, number]; warning: number | [number, number]; inverted?: boolean }> = {
  score:              { good: 70, warning: 50 },
  utilization:        { good: [60, 100], warning: [40, 110] },
  estimationAccuracy: { good: 75, warning: 55 },
  focus:              { good: 65, warning: 45 },
  completionRate:     { good: 70, warning: 50 },
  avgCycleTimeHours:  { good: 48, warning: 96, inverted: true },
};

export function getMetricLevel(metric: string, value: number | null): MetricLevel {
  if (value === null || value === undefined) return 'neutral';

  const threshold = THRESHOLDS[metric];
  if (!threshold) return 'neutral';

  if (threshold.inverted) {
    const good = threshold.good as number;
    const warn = threshold.warning as number;
    if (value <= good) return 'good';
    if (value <= warn) return 'warning';
    return 'danger';
  }

  if (Array.isArray(threshold.good)) {
    const [goodLow, goodHigh] = threshold.good;
    const [warnLow, warnHigh] = threshold.warning as [number, number];
    if (value >= goodLow && value <= goodHigh) return 'good';
    if (value >= warnLow && value <= warnHigh) return 'warning';
    return 'danger';
  }

  const good = threshold.good as number;
  const warn = threshold.warning as number;
  if (value >= good) return 'good';
  if (value >= warn) return 'warning';
  return 'danger';
}

export const LEVEL_COLORS: Record<MetricLevel, { text: string; bg: string; border: string }> = {
  good:    { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  warning: { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  danger:  { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  neutral: { text: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20' },
};

export function useMetricColor(metric: string, value: number | null) {
  const level = getMetricLevel(metric, value);
  return { level, colors: LEVEL_COLORS[level] };
}
