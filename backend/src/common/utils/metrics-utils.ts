/**
 * Общие утилиты агрегации метрик.
 */

import { ScoreTrend, MetricTrendDTO } from '../../modules/reports/reports.types';

export type { ScoreTrend, MetricTrendDTO };

export function avgNullable(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 100) / 100;
}

export function calcTrend(scores: Array<number | null>, threshold = 5): ScoreTrend {
  const valid = scores.filter((s): s is number => s !== null);
  if (valid.length < 2) return null;
  const last = valid[valid.length - 1];
  const prev = valid[valid.length - 2];
  const diff = last - prev;
  if (diff > threshold) return 'up';
  if (diff < -threshold) return 'down';
  return 'stable';
}

export function calcMetricTrend(current: number | null, prev: number | null, threshold = 5): MetricTrendDTO {
  if (current == null || prev == null) return { direction: null, delta: null };
  const delta = Math.round((current - prev) * 10) / 10;
  let direction: ScoreTrend;
  if (delta > threshold) direction = 'up';
  else if (delta < -threshold) direction = 'down';
  else direction = 'stable';
  return { direction, delta };
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function minutesByTypeToHours(byType: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(byType)) {
    result[k] = minutesToHours(v);
  }
  return result;
}
