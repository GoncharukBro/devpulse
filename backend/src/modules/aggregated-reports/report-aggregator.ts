/**
 * ReportAggregator — адаптивная гранулярность периодов и агрегация данных.
 */

import { minutesToHours, avgNullable, calcMetricTrend } from '../../common/utils/metrics-utils';
import type { MetricTrendDTO } from '../../common/utils/metrics-utils';
import {
  CollectedData,
  CollectedEmployeeData,
  CollectedTaskItem,
  AggregatedMetricsDTO,
  WeeklyDataItem,
  WeeklyTrendItem,
  OverallTrend,
  EmployeeAggItemV2,
  PeriodBreakdownItem,
} from './aggregated-reports.types';

export type Granularity = 'week' | 'month' | 'quarter';

/**
 * Выбирает гранулярность периода в зависимости от длины диапазона дат.
 */
export function chooseGranularity(dateFrom: Date, dateTo: Date): Granularity {
  const days = (dateTo.getTime() - dateFrom.getTime()) / 86400000;
  if (days <= 60) return 'week';
  if (days <= 548) return 'month';
  return 'quarter';
}

/**
 * Возвращает ISO-номер недели для даты (1–53).
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay() || 7; // 1=Пн .. 7=Вс
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Возвращает ISO-год для недели (может отличаться от calendar year в начале/конце года).
 */
function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  return d.getUTCFullYear();
}

/**
 * Формирует метку периода по дате и гранулярности.
 * - week:    "2025-W03"
 * - month:   "2025-01"
 * - quarter: "2025-Q1"
 */
export function getPeriodLabel(date: Date, granularity: Granularity): string {
  if (granularity === 'week') {
    const year = getISOWeekYear(date);
    const week = getISOWeek(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  if (granularity === 'month') {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  // quarter
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Строит одну строку PeriodBreakdown из данных сотрудника.
 */
function buildPeriodBreakdown(data: CollectedEmployeeData, label: string): PeriodBreakdownItem {
  return {
    label,
    totalIssues: data.metrics.totalIssues,
    completedIssues: data.metrics.completedIssues,
    overdueIssues: data.metrics.overdueIssues,
    totalSpentHours: minutesToHours(data.metrics.totalSpentMinutes),
    utilization: data.kpi.utilization,
    estimationAccuracy: data.kpi.estimationAccuracy,
    completionRate: data.kpi.completionRate,
    issuesByType: { ...data.metrics.issuesByType },
  };
}

/**
 * Строит EmployeeAggItemV2 из одной записи CollectedEmployeeData.
 */
function buildAggItem(data: CollectedEmployeeData, projectName: string): EmployeeAggItemV2 {
  return {
    youtrackLogin: data.login,
    displayName: data.displayName,
    projectName,
    avgScore: null,
    avgUtilization: data.kpi.utilization,
    avgCompletionRate: data.kpi.completionRate,
    completedIssues: data.metrics.completedIssues,
    totalIssues: data.metrics.totalIssues,
    scoreTrend: null,
    llmScore: null,
    llmSummary: null,
    llmConcerns: null,
    llmRecommendations: null,
    periodBreakdown: [buildPeriodBreakdown(data, 'total')],
  };
}

/**
 * Суммирует метрики двух PeriodBreakdownItem (для сводной строки "Итого").
 */
function mergePeriodBreakdown(a: PeriodBreakdownItem, b: PeriodBreakdownItem): PeriodBreakdownItem {
  const mergedIssuesByType: Record<string, number> = { ...a.issuesByType };
  for (const [type, count] of Object.entries(b.issuesByType)) {
    mergedIssuesByType[type] = (mergedIssuesByType[type] ?? 0) + count;
  }
  return {
    label: a.label,
    totalIssues: a.totalIssues + b.totalIssues,
    completedIssues: a.completedIssues + b.completedIssues,
    overdueIssues: a.overdueIssues + b.overdueIssues,
    totalSpentHours: Math.round((a.totalSpentHours + b.totalSpentHours) * 100) / 100,
    utilization: avgNullable([a.utilization, b.utilization]),
    estimationAccuracy: avgNullable([a.estimationAccuracy, b.estimationAccuracy]),
    completionRate: avgNullable([a.completionRate, b.completionRate]),
    issuesByType: mergedIssuesByType,
  };
}

/**
 * Агрегирует собранные данные в массив EmployeeAggItemV2.
 *
 * type === 'employee':
 *   - Одна строка на проект
 *   - Плюс строка "Итого" если проектов > 1
 *
 * type === 'project' | 'team':
 *   - Одна строка на уникального сотрудника (объединяем, если встречается в нескольких подписках)
 */
export function aggregateCollectedData(
  collected: CollectedData,
  type: 'employee' | 'project' | 'team',
  _dateFrom: Date,
  _dateTo: Date,
): EmployeeAggItemV2[] {
  if (collected.employees.length === 0) return [];

  if (type === 'employee') {
    const items: EmployeeAggItemV2[] = collected.employees.map((emp) =>
      buildAggItem(emp, emp.projectName),
    );

    if (items.length > 1) {
      // Сводная строка "Итого"
      const first = collected.employees[0];
      const summaryBreakdown = collected.employees
        .map((e) => buildPeriodBreakdown(e, 'total'))
        .reduce((acc, cur) => mergePeriodBreakdown(acc, cur));

      const summary: EmployeeAggItemV2 = {
        youtrackLogin: first.login,
        displayName: first.displayName,
        projectName: 'Итого',
        avgScore: null,
        avgUtilization: avgNullable(collected.employees.map((e) => e.kpi.utilization)),
        avgCompletionRate: avgNullable(collected.employees.map((e) => e.kpi.completionRate)),
        completedIssues: summaryBreakdown.completedIssues,
        totalIssues: summaryBreakdown.totalIssues,
        scoreTrend: null,
        llmScore: null,
        llmSummary: null,
        llmConcerns: null,
        llmRecommendations: null,
        periodBreakdown: [summaryBreakdown],
      };

      items.push(summary);
    }

    return items;
  }

  // type === 'project' | 'team': группируем по login
  const byLogin = new Map<string, EmployeeAggItemV2>();

  for (const emp of collected.employees) {
    const existing = byLogin.get(emp.login);
    if (!existing) {
      byLogin.set(emp.login, buildAggItem(emp, emp.projectName));
    } else {
      // Объединяем с существующей записью
      const existingBreakdown = existing.periodBreakdown![0];
      const newBreakdown = buildPeriodBreakdown(emp, 'total');
      const merged = mergePeriodBreakdown(existingBreakdown, newBreakdown);

      existing.completedIssues = merged.completedIssues;
      existing.totalIssues = merged.totalIssues;
      existing.avgUtilization = avgNullable([existing.avgUtilization, emp.kpi.utilization]);
      existing.avgCompletionRate = avgNullable([existing.avgCompletionRate, emp.kpi.completionRate]);
      existing.periodBreakdown = [merged];
    }
  }

  return Array.from(byLogin.values());
}

/**
 * Агрегирует метрики по всем сотрудникам в CollectedData.
 */
export function aggregateMetricsFromCollected(collected: CollectedData): AggregatedMetricsDTO {
  const emps = collected.employees;

  if (emps.length === 0) {
    return {
      totalIssues: 0,
      completedIssues: 0,
      overdueIssues: 0,
      totalSpentHours: 0,
      totalEstimationHours: 0,
      avgUtilization: null,
      avgEstimationAccuracy: null,
      avgFocus: null,
      avgCompletionRate: null,
      avgCycleTimeHours: null,
      avgScore: null,
    };
  }

  const totalIssues = emps.reduce((s, e) => s + e.metrics.totalIssues, 0);
  const completedIssues = emps.reduce((s, e) => s + e.metrics.completedIssues, 0);
  const overdueIssues = emps.reduce((s, e) => s + e.metrics.overdueIssues, 0);
  const totalSpentHours = minutesToHours(
    emps.reduce((s, e) => s + e.metrics.totalSpentMinutes, 0),
  );
  const totalEstimationHours = minutesToHours(
    emps.reduce((s, e) => s + e.metrics.totalEstimationMinutes, 0),
  );

  const avgUtilization = avgNullable(emps.map((e) => e.kpi.utilization));
  const avgEstimationAccuracy = avgNullable(emps.map((e) => e.kpi.estimationAccuracy));
  const avgFocus = avgNullable(emps.map((e) => e.kpi.focus));
  const avgCompletionRate = avgNullable(emps.map((e) => e.kpi.completionRate));
  const avgCycleTimeHours = avgNullable(emps.map((e) => e.kpi.avgCycleTimeHours));

  return {
    totalIssues,
    completedIssues,
    overdueIssues,
    totalSpentHours,
    totalEstimationHours,
    avgUtilization,
    avgEstimationAccuracy,
    avgFocus,
    avgCompletionRate,
    avgCycleTimeHours,
    avgScore: null,
  };
}

// ─── Period boundaries ──────────────────────────────────────────

interface PeriodBoundary {
  start: Date;
  end: Date;
}

/**
 * Генерирует границы подпериодов для заданного диапазона дат.
 */
function generatePeriodBoundaries(
  dateFrom: Date,
  dateTo: Date,
  granularity: Granularity,
): PeriodBoundary[] {
  const periods: PeriodBoundary[] = [];
  const cursor = new Date(dateFrom);

  while (cursor < dateTo) {
    let periodEnd: Date;

    if (granularity === 'week') {
      // ISO-неделя: ближайшее воскресенье (конец недели)
      const dayOfWeek = cursor.getUTCDay(); // 0=Вс, 1=Пн..6=Сб
      const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      periodEnd = new Date(cursor);
      periodEnd.setUTCDate(periodEnd.getUTCDate() + daysToSunday);
      periodEnd.setUTCHours(23, 59, 59, 999);
    } else if (granularity === 'month') {
      periodEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    } else {
      // quarter
      const quarterMonth = Math.floor(cursor.getUTCMonth() / 3) * 3 + 3;
      periodEnd = new Date(Date.UTC(cursor.getUTCFullYear(), quarterMonth, 0, 23, 59, 59, 999));
    }

    // Не выходить за dateTo
    const clampedEnd = periodEnd > dateTo ? new Date(dateTo) : periodEnd;

    periods.push({
      start: new Date(cursor),
      end: clampedEnd,
    });

    // Следующий период
    cursor.setTime(clampedEnd.getTime());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCHours(0, 0, 0, 0);
  }

  return periods;
}

/**
 * Проверяет, попадает ли timestamp (ms) в период [start, end].
 */
function isInPeriod(timestampMs: number, period: PeriodBoundary): boolean {
  return timestampMs >= period.start.getTime() && timestampMs <= period.end.getTime();
}

/**
 * Проверяет, попадает ли ISO-дата (YYYY-MM-DD) в период.
 */
function isDayInPeriod(dayIso: string, period: PeriodBoundary): boolean {
  const dayMs = new Date(dayIso + 'T12:00:00Z').getTime();
  return dayMs >= period.start.getTime() && dayMs <= period.end.getTime();
}

// ─── Build weekly data ──────────────────────────────────────────

/**
 * Строит weeklyData из собранных данных:
 * группирует задачи и списания по подпериодам, рассчитывает KPI.
 */
export function buildWeeklyData(
  collected: CollectedData,
  dateFrom: Date,
  dateTo: Date,
): WeeklyDataItem[] {
  // Нормализуем dateTo до конца дня, чтобы последний день попадал в период
  const normalizedDateTo = new Date(dateTo);
  normalizedDateTo.setUTCHours(23, 59, 59, 999);

  const granularity = chooseGranularity(dateFrom, normalizedDateTo);
  const periods = generatePeriodBoundaries(dateFrom, normalizedDateTo, granularity);

  if (periods.length <= 1) return [];

  // Собираем все задачи, spentByDay и spentByDayByType от всех сотрудников
  const allTasks: CollectedTaskItem[] = [];
  const mergedSpentByDay: Record<string, number> = {};
  const mergedSpentByDayByType: Record<string, Record<string, number>> = {};

  for (const emp of collected.employees) {
    if (emp.allTasks) {
      allTasks.push(...emp.allTasks);
    }
    if (emp.spentByDay) {
      for (const [day, minutes] of Object.entries(emp.spentByDay)) {
        mergedSpentByDay[day] = (mergedSpentByDay[day] || 0) + minutes;
      }
    }
    if (emp.spentByDayByType) {
      for (const [type, days] of Object.entries(emp.spentByDayByType)) {
        if (!mergedSpentByDayByType[type]) mergedSpentByDayByType[type] = {};
        for (const [day, minutes] of Object.entries(days)) {
          mergedSpentByDayByType[type][day] = (mergedSpentByDayByType[type][day] || 0) + minutes;
        }
      }
    }
  }

  // Доля рабочих недель в периоде (для расчёта utilization)
  // 5 рабочих дней из 7 → пропорционально
  const workingDaysInPeriod = (p: PeriodBoundary): number => {
    let count = 0;
    const cursor = new Date(p.start);
    while (cursor <= p.end) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) count++; // Пн-Пт
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
  };

  return periods.map((period) => {
    // Задачи, завершённые в этом периоде
    const completed = allTasks.filter(
      (t) => t.resolved != null && isInPeriod(t.resolved, period),
    );

    // Задачи, созданные в этом периоде
    const created = allTasks.filter(
      (t) => isInPeriod(t.created, period),
    );

    // Уникальные задачи активные в периоде (созданные ИЛИ завершённые)
    const activeIds = new Set<string>();
    for (const t of allTasks) {
      if (isInPeriod(t.created, period) || (t.resolved != null && isInPeriod(t.resolved, period))) {
        activeIds.add(t.id);
      }
    }

    // Списания за период
    let spentMinutes = 0;
    for (const [day, minutes] of Object.entries(mergedSpentByDay)) {
      if (isDayInPeriod(day, period)) {
        spentMinutes += minutes;
      }
    }

    const totalIssues = activeIds.size;
    const completedIssues = completed.length;
    const totalSpentHours = minutesToHours(spentMinutes);

    // KPI
    const workDays = workingDaysInPeriod(period);
    const expectedMinutes = workDays * 8 * 60 * collected.employees.length;
    const utilization = expectedMinutes > 0
      ? Math.round((spentMinutes / expectedMinutes) * 100 * 10) / 10
      : null;

    const completionRate = totalIssues > 0
      ? Math.round((completedIssues / totalIssues) * 100 * 10) / 10
      : null;

    // Estimation accuracy: по задачам, завершённым в этом периоде
    let estimationAccuracy: number | null = null;
    const completedWithEstimation = completed.filter(t => t.estimationMinutes > 0 && t.spentMinutes > 0);
    if (completedWithEstimation.length > 0) {
      const totalEst = completedWithEstimation.reduce((s, t) => s + t.estimationMinutes, 0);
      const totalSpent = completedWithEstimation.reduce((s, t) => s + t.spentMinutes, 0);
      const minVal = Math.min(totalEst, totalSpent);
      const maxVal = Math.max(totalEst, totalSpent);
      estimationAccuracy = Math.round((minVal / maxVal) * 100 * 10) / 10;
    }

    // Focus: доля feature + techDebt + documentation в потраченном за период
    let focus: number | null = null;
    if (spentMinutes > 0) {
      let focusMinutes = 0;
      const focusTypes = ['feature', 'techDebt', 'documentation'];
      for (const ft of focusTypes) {
        const typeDays = mergedSpentByDayByType[ft];
        if (!typeDays) continue;
        for (const [day, minutes] of Object.entries(typeDays)) {
          if (isDayInPeriod(day, period)) focusMinutes += minutes;
        }
      }
      focus = Math.round((focusMinutes / spentMinutes) * 100 * 10) / 10;
    }

    const periodStartStr = period.start.toISOString().slice(0, 10);
    const periodEndStr = period.end.toISOString().slice(0, 10);

    return {
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      score: null,
      utilization,
      estimationAccuracy,
      focus,
      completionRate,
      avgCycleTimeHours: null,
      totalSpentHours,
      completedIssues,
      totalIssues,
      overdueIssues: 0,
    };
  });
}

// ─── Build trends ───────────────────────────────────────────────

/**
 * Строит weeklyTrends из weeklyData (дельта между соседними периодами).
 */
export function buildWeeklyTrends(weeklyData: WeeklyDataItem[]): WeeklyTrendItem[] {
  if (weeklyData.length < 2) return [];

  const trends: WeeklyTrendItem[] = [];

  for (let i = 1; i < weeklyData.length; i++) {
    const prev = weeklyData[i - 1];
    const curr = weeklyData[i];

    trends.push({
      periodStart: curr.periodStart,
      score: calcMetricTrend(curr.score, prev.score),
      utilization: calcMetricTrend(curr.utilization, prev.utilization),
      estimationAccuracy: calcMetricTrend(curr.estimationAccuracy, prev.estimationAccuracy),
      focus: calcMetricTrend(curr.focus, prev.focus),
      completionRate: calcMetricTrend(curr.completionRate, prev.completionRate),
    });
  }

  return trends;
}

/**
 * Строит overallTrend — сравнение первого и последнего периода.
 */
export function buildOverallTrend(weeklyData: WeeklyDataItem[]): OverallTrend {
  const nil: MetricTrendDTO = { direction: null, delta: null };

  if (weeklyData.length < 2) {
    return {
      score: nil, utilization: nil, estimationAccuracy: nil,
      focus: nil, completionRate: nil, spentHours: nil,
    };
  }

  const first = weeklyData[0];
  const last = weeklyData[weeklyData.length - 1];

  return {
    score: calcMetricTrend(last.score, first.score),
    utilization: calcMetricTrend(last.utilization, first.utilization),
    estimationAccuracy: calcMetricTrend(last.estimationAccuracy, first.estimationAccuracy),
    focus: calcMetricTrend(last.focus, first.focus),
    completionRate: calcMetricTrend(last.completionRate, first.completionRate),
    spentHours: calcMetricTrend(last.totalSpentHours, first.totalSpentHours, 2),
  };
}
