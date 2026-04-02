/**
 * ReportAggregator — адаптивная гранулярность периодов и агрегация данных.
 */

import { minutesToHours, avgNullable } from '../../common/utils/metrics-utils';
import {
  CollectedData,
  CollectedEmployeeData,
  AggregatedMetricsDTO,
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
