/**
 * Формульный score — fallback-оценка если LLM недоступен.
 * Взвешенная сумма нормализованных KPI: 0-100.
 */

import { CalculatedKpi } from './kpi-calculator';
import { RawMetrics } from './metrics-collector';

interface WeightedMetric {
  value: number | null;
  weight: number;
  score: (v: number) => number;
}

export class FormulaScorer {
  static calculate(kpi: CalculatedKpi, raw: RawMetrics): number | null {
    const metrics: WeightedMetric[] = [
      {
        value: kpi.utilization,
        weight: 20,
        score: (v) => FormulaScorer.normUtilization(v),
      },
      {
        value: kpi.completionRate,
        weight: 25,
        score: (v) => FormulaScorer.norm(v, 70, 100),
      },
      {
        value: kpi.estimationAccuracy,
        weight: 20,
        score: (v) => FormulaScorer.norm(v, 70, 100),
      },
      {
        value: kpi.focus,
        weight: 15,
        score: (v) => FormulaScorer.norm(v, 60, 100),
      },
      {
        value: kpi.avgCycleTimeHours,
        weight: 10,
        score: (v) => FormulaScorer.cyclePenalty(v),
      },
      {
        value: raw.bugsAfterRelease + raw.bugsOnTest > 0 ? raw.bugsAfterRelease + raw.bugsOnTest : null,
        weight: 10,
        score: (v) => FormulaScorer.bugPenalty(v),
      },
    ];

    // Фильтруем метрики с null значениями и перераспределяем вес
    const activeMetrics = metrics.filter((m) => m.value !== null);
    if (activeMetrics.length === 0) return null;

    const totalWeight = activeMetrics.reduce((s, m) => s + m.weight, 0);

    let score = 0;
    for (const m of activeMetrics) {
      const normalizedWeight = (m.weight / totalWeight) * 100;
      score += (normalizedWeight / 100) * m.score(m.value!);
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Нормализация значения в 0-100:
   * - value < min → пропорционально (value/min * 50)
   * - value в [min, max] → 50 + (value-min)/(max-min) * 50
   * - value > max → 100 (cap)
   */
  private static norm(value: number, min: number, max: number): number {
    if (value < min) {
      return (value / min) * 50;
    }
    if (value <= max) {
      return 50 + ((value - min) / (max - min)) * 50;
    }
    return 100;
  }

  /**
   * Утилизация: оптимум 80-100%, штраф за переработку (>120%)
   */
  private static normUtilization(value: number): number {
    if (value < 80) {
      return (value / 80) * 50;
    }
    if (value <= 100) {
      return 50 + ((value - 80) / 20) * 50;
    }
    if (value <= 120) {
      // Лёгкая переработка — небольшой штраф
      return 100 - ((value - 100) / 20) * 20;
    }
    // Сильная переработка
    return Math.max(40, 80 - ((value - 120) / 40) * 40);
  }

  /**
   * Штраф за cycle time: меньше = лучше.
   * < 24h → 100, < 48h → 80, < 72h → 60, > 72h → снижение
   */
  private static cyclePenalty(hours: number): number {
    if (hours <= 24) return 100;
    if (hours <= 48) return 80;
    if (hours <= 72) return 60;
    if (hours <= 120) return 40;
    return 20;
  }

  /**
   * Штраф за баги: 0 = 100, 1 = 80, 2 = 60, 3+ = снижение
   */
  private static bugPenalty(count: number): number {
    if (count === 0) return 100;
    if (count === 1) return 80;
    if (count === 2) return 60;
    if (count <= 4) return 40;
    return 20;
  }
}
