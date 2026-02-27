/**
 * Расчёт вычисляемых KPI из сырых метрик.
 */

import { RawMetrics } from './metrics-collector';

export interface CalculatedKpi {
  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  avgComplexityHours: number | null;
  completionRate: number | null;
  avgCycleTimeHours: number | null;
}

const STANDARD_WEEK_MINUTES = 40 * 60; // 2400 min

export class KpiCalculator {
  static calculate(raw: RawMetrics): CalculatedKpi {
    // Нет задач → все KPI бессмысленны
    if (raw.totalIssues === 0) {
      return {
        utilization: null,
        estimationAccuracy: null,
        focus: null,
        avgComplexityHours: null,
        completionRate: null,
        avgCycleTimeHours: null,
      };
    }

    return {
      utilization: KpiCalculator.calcUtilization(raw),
      estimationAccuracy: KpiCalculator.calcEstimationAccuracy(raw),
      focus: KpiCalculator.calcFocus(raw),
      avgComplexityHours: KpiCalculator.calcAvgComplexity(raw),
      completionRate: KpiCalculator.calcCompletionRate(raw),
      avgCycleTimeHours: raw.avgCycleTimeHours,
    };
  }

  /** Загрузка: (totalSpent / 40h) * 100. 0 если нет списаний */
  private static calcUtilization(raw: RawMetrics): number {
    return Math.round((raw.totalSpentMinutes / STANDARD_WEEK_MINUTES) * 100 * 10) / 10;
  }

  /** Точность оценок: min(est, fact) / max(est, fact) * 100 */
  private static calcEstimationAccuracy(raw: RawMetrics): number | null {
    if (raw.totalEstimationMinutes === 0 || raw.totalSpentMinutes === 0) return null;
    const minVal = Math.min(raw.totalEstimationMinutes, raw.totalSpentMinutes);
    const maxVal = Math.max(raw.totalEstimationMinutes, raw.totalSpentMinutes);
    return Math.round((minVal / maxVal) * 100 * 10) / 10;
  }

  /** Фокус: (feature + techDebt + documentation время) / total * 100 */
  private static calcFocus(raw: RawMetrics): number | null {
    if (raw.totalSpentMinutes === 0) return null;
    const focusMinutes =
      (raw.spentByType['feature'] || 0) +
      (raw.spentByType['techDebt'] || 0) +
      (raw.spentByType['documentation'] || 0);
    return Math.round((focusMinutes / raw.totalSpentMinutes) * 100 * 10) / 10;
  }

  /** Средняя сложность: totalSpent (hours) / completedIssues */
  private static calcAvgComplexity(raw: RawMetrics): number | null {
    if (raw.completedIssues === 0) return null;
    return Math.round((raw.totalSpentMinutes / 60 / raw.completedIssues) * 10) / 10;
  }

  /** Скорость закрытия: completed / total * 100 (capped at 100%) */
  private static calcCompletionRate(raw: RawMetrics): number | null {
    if (raw.totalIssues === 0) return null;
    const rate = (raw.completedIssues / raw.totalIssues) * 100;
    return Math.round(Math.min(rate, 100) * 10) / 10;
  }
}
