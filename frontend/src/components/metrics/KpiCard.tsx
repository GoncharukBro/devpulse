import { useEffect, useRef, useState } from 'react';
import Card from '@/components/ui/Card';
import TrendIndicator from './TrendIndicator';
import MetricTooltip from './MetricTooltip';
import { useMetricColor } from '@/hooks/useMetricColor';
import type { ScoreTrend } from '@/types/reports';

interface KpiCardProps {
  title: string;
  value: number | null;
  suffix?: string;
  trend?: ScoreTrend;
  delta?: number | null;
  trendValue?: string | null;
  metric: string;
  loading?: boolean;
}

function formatDelta(delta: number, suffix?: string): string {
  const sign = delta > 0 ? '+' : '';
  const num = Number.isInteger(delta) ? delta : delta.toFixed(1);
  return `${sign}${num}${suffix ?? ''}`;
}

function AnimatedNumber({ value, suffix }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const start = 0;
    const end = value;
    const duration = 600;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);

      if (progress < 1) {
        ref.current = requestAnimationFrame(animate);
      }
    }

    ref.current = requestAnimationFrame(animate);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [value]);

  const formatted = Number.isInteger(value) ? Math.round(display) : display.toFixed(1);

  return (
    <span>
      {formatted}
      {suffix && <span className="text-lg">{suffix}</span>}
    </span>
  );
}

export default function KpiCard({
  title,
  value,
  suffix,
  trend,
  delta,
  trendValue,
  metric,
  loading,
}: KpiCardProps) {
  const { colors } = useMetricColor(metric, value);

  if (loading) {
    return (
      <Card>
        <div className="animate-pulse">
          <div className="mb-3 h-4 w-24 rounded bg-gray-200 dark:bg-gray-700/50" />
          <div className="mb-2 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700/50" />
          <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700/50" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">{title}</span>
        <MetricTooltip metric={metric} />
      </div>
      <div className="mt-2 flex items-end justify-between">
        <span className={`text-2xl font-bold ${value !== null ? colors.text : 'text-gray-400 dark:text-gray-500'}`}>
          {value !== null ? <AnimatedNumber value={value} suffix={suffix} /> : 'Н/Д'}
        </span>
        <TrendIndicator
          trend={trend ?? null}
          value={delta != null ? formatDelta(delta, suffix) : null}
        />
      </div>
      {trendValue && (
        <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{trendValue}</div>
      )}
    </Card>
  );
}
