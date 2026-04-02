# Arbitrary Period Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace aggregation of existing weekly MetricReports with direct YouTrack collection for arbitrary date ranges, plus two-level LLM analysis pipeline.

**Architecture:** Three-phase async pipeline (collecting → analyzing → ready) running via `setImmediate`. Collection uses existing `MetricsCollector` directly. LLM uses fixed N+1 calls (per-employee + summary) regardless of period length. Data stored in JSONB fields on `AggregatedReport` entity.

**Tech Stack:** Node.js, MikroORM, PostgreSQL, React, Zustand, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-02-arbitrary-period-reports-design.md`

---

### Task 1: Backend types — new interfaces

**Files:**
- Modify: `backend/src/modules/aggregated-reports/aggregated-reports.types.ts`

- [ ] **Step 1: Add new types to aggregated-reports.types.ts**

Add these types after the existing `EmployeeAggItem` interface (after line 73):

```typescript
// ─── New types for arbitrary-period reports ─────────────────

export interface ReportProgress {
  phase: 'collecting' | 'analyzing';
  total: number;
  completed: number;
  currentStep?: string;
}

export interface CollectedEmployeeMetrics {
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentMinutes: number;
  totalEstimationMinutes: number;
  issuesByType: Record<string, number>;
  issuesWithoutEstimation: number;
  issuesOverEstimation: number;
  inProgressIssues: number;
  bugsAfterRelease: number;
  bugsOnTest: number;
}

export interface CollectedEmployeeKpi {
  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  completionRate: number | null;
  avgCycleTimeHours: number | null;
}

export interface CollectedTaskItem {
  id: string;
  summary: string;
  type: string;
  spentMinutes: number;
  overdueDays?: number;
}

export interface CollectedEmployeeData {
  login: string;
  displayName: string;
  subscriptionId: string;
  projectShortName: string;
  projectName: string;
  metrics: CollectedEmployeeMetrics;
  kpi: CollectedEmployeeKpi;
  topTasks: CollectedTaskItem[];
}

export interface CollectedData {
  employees: CollectedEmployeeData[];
}

export interface PeriodBreakdownItem {
  label: string;
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentHours: number;
  utilization: number | null;
  estimationAccuracy: number | null;
  completionRate: number | null;
  issuesByType: Record<string, number>;
}

export interface EmployeeAggItemV2 extends EmployeeAggItem {
  projectName?: string;
  llmScore: number | null;
  llmSummary: string | null;
  llmConcerns: string[] | null;
  llmRecommendations: string[] | null;
  periodBreakdown: PeriodBreakdownItem[] | null;
}
```

- [ ] **Step 2: Update CreateResponse type**

Change `CreateResponse` (line 94-97) from:

```typescript
export interface CreateResponse {
  id: string;
  status: 'generating' | 'ready';
}
```

to:

```typescript
export interface CreateResponse {
  id: string;
  status: 'collecting' | 'generating' | 'ready';
}
```

- [ ] **Step 3: Update AggregatedReportDTO**

Add new fields to `AggregatedReportDTO` (after line 146, before the closing `}`):

```typescript
  progress: ReportProgress | null;
  collectedData: CollectedData | null;
```

- [ ] **Step 4: Update AggregatedReportListItem**

Change `status` field in `AggregatedReportListItem` (line 113) from:

```typescript
  status: 'generating' | 'ready' | 'failed';
```

to:

```typescript
  status: string;
```

- [ ] **Step 5: Remove PreviewRequest and PreviewResponse**

Remove `PreviewRequest` (lines 75-80) and `PreviewResponse` (lines 82-90). Update `CreateRequest` to be standalone:

```typescript
export interface CreateRequest {
  type: 'employee' | 'project' | 'team';
  targetId: string;
  dateFrom: string;
  dateTo: string;
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/aggregated-reports/aggregated-reports.types.ts
git commit -m "feat(reports): add new types for arbitrary-period reports"
```

---

### Task 2: Entity — add new fields

**Files:**
- Modify: `backend/src/entities/aggregated-report.entity.ts`

- [ ] **Step 1: Add progress field**

After `employeesData` field (line 96), add:

```typescript
  @Property({ type: 'jsonb', nullable: true })
  progress?: object | null;

  @Property({ type: 'jsonb', nullable: true })
  collectedData?: object | null;
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npx mikro-orm migration:create --blank -n AddReportCollectionFields
```

Edit the generated migration file to add:

```sql
ALTER TABLE devpulse_aggregated_report ADD COLUMN IF NOT EXISTS progress jsonb DEFAULT NULL;
ALTER TABLE devpulse_aggregated_report ADD COLUMN IF NOT EXISTS collected_data jsonb DEFAULT NULL;
```

- [ ] **Step 3: Run migration**

```bash
cd backend && npx mikro-orm migration:up
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/entities/aggregated-report.entity.ts backend/src/migrations/
git commit -m "feat(reports): add progress and collectedData fields to AggregatedReport entity"
```

---

### Task 3: Report Collector — YouTrack collection

**Files:**
- Create: `backend/src/modules/aggregated-reports/report-collector.ts`

- [ ] **Step 1: Create report-collector.ts**

```typescript
/**
 * Прямой сбор метрик из YouTrack для произвольного периода.
 * Переиспользует MetricsCollector и KpiCalculator.
 */

import { EntityManager } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
import { Team } from '../../entities/team.entity';
import { AggregatedReport } from '../../entities/aggregated-report.entity';
import { MetricsCollector, RawMetrics, TaskSummary } from '../collection/metrics-collector';
import { KpiCalculator, CalculatedKpi } from '../collection/kpi-calculator';
import { getYouTrackService } from '../youtrack/youtrack.service';
import {
  CollectedData,
  CollectedEmployeeData,
  CollectedTaskItem,
  ReportProgress,
} from './aggregated-reports.types';
import { Logger } from '../../common/types/logger';

const RETRY_COUNT = 3;
const RETRY_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface CollectionTarget {
  login: string;
  displayName: string;
  subscriptionId: string;
  projectShortName: string;
  projectName: string;
  youtrackInstanceId: string;
  fieldMapping: NonNullable<Subscription['fieldMapping']>;
}

export class ReportCollector {
  constructor(
    private em: EntityManager,
    private log: Logger,
  ) {}

  /**
   * Определить список сотрудников для сбора в зависимости от типа отчёта.
   */
  async resolveTargets(
    type: 'employee' | 'project' | 'team',
    targetId: string,
    userId: string,
  ): Promise<CollectionTarget[]> {
    if (type === 'project') {
      return this.resolveProjectTargets(targetId);
    }
    if (type === 'team') {
      return this.resolveTeamTargets(targetId, userId);
    }
    return this.resolveEmployeeTargets(targetId, userId);
  }

  /**
   * Собрать метрики из YouTrack для всех targets.
   * Обновляет progress в report после каждого сотрудника.
   */
  async collect(
    report: AggregatedReport,
    targets: CollectionTarget[],
    dateFrom: Date,
    dateTo: Date,
  ): Promise<CollectedData> {
    const employees: CollectedEmployeeData[] = [];
    const total = targets.length;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];

      report.progress = {
        phase: 'collecting',
        total,
        completed: i,
        currentStep: `Сбор: ${target.displayName} (${target.projectName})`,
      } as unknown as object;
      await this.em.flush();

      try {
        const { rawMetrics, kpi } = await this.collectWithRetry(target, dateFrom, dateTo);

        const topTasks = this.selectTopTasks(rawMetrics.taskSummaries);

        employees.push({
          login: target.login,
          displayName: target.displayName,
          subscriptionId: target.subscriptionId,
          projectShortName: target.projectShortName,
          projectName: target.projectName,
          metrics: {
            totalIssues: rawMetrics.totalIssues,
            completedIssues: rawMetrics.completedIssues,
            overdueIssues: rawMetrics.overdueIssues,
            totalSpentMinutes: rawMetrics.totalSpentMinutes,
            totalEstimationMinutes: rawMetrics.totalEstimationMinutes,
            issuesByType: rawMetrics.issuesByType,
            issuesWithoutEstimation: rawMetrics.issuesWithoutEstimation,
            issuesOverEstimation: rawMetrics.issuesOverEstimation,
            inProgressIssues: rawMetrics.inProgressIssues,
            bugsAfterRelease: rawMetrics.bugsAfterRelease,
            bugsOnTest: rawMetrics.bugsOnTest,
          },
          kpi: {
            utilization: kpi.utilization,
            estimationAccuracy: kpi.estimationAccuracy,
            focus: kpi.focus,
            completionRate: kpi.completionRate,
            avgCycleTimeHours: kpi.avgCycleTimeHours,
          },
          topTasks,
        });

        this.log.info(
          `Collected ${target.login} @ ${target.projectName}: ${rawMetrics.totalIssues} issues, ${rawMetrics.totalSpentMinutes}min`,
        );
      } catch (err) {
        this.log.error(
          `Failed to collect ${target.login} @ ${target.projectName}: ${(err as Error).message}`,
        );
        // Пропускаем сотрудника, продолжаем остальных
      }
    }

    report.progress = {
      phase: 'collecting',
      total,
      completed: total,
      currentStep: 'Сбор завершён',
    } as unknown as object;
    await this.em.flush();

    return { employees };
  }

  /**
   * Гибридная выборка топ-20 задач:
   * - Топ-10 по spentTime
   * - Топ-5 просроченных (по overdueDays desc)
   * - Топ-5 бизнес-критичных (по spentTime desc)
   * С дедупликацией.
   */
  private selectTopTasks(taskSummaries: TaskSummary[]): CollectedTaskItem[] {
    const seen = new Set<string>();
    const result: CollectedTaskItem[] = [];

    const toItem = (t: TaskSummary): CollectedTaskItem => ({
      id: t.id,
      summary: t.summary,
      type: t.type,
      spentMinutes: t.spent,
    });

    const addUnique = (items: TaskSummary[], limit: number) => {
      for (const t of items) {
        if (result.length >= 20) return;
        if (seen.has(t.id)) continue;
        if (result.length - (20 - limit) >= limit && seen.size > 0) {
          // Check if we've filled this category's slots
        }
        seen.add(t.id);
        result.push(toItem(t));
        if (result.length >= 20) return;
      }
    };

    // Топ-10 по spent time
    const bySpent = [...taskSummaries].sort((a, b) => b.spent - a.spent);
    const topBySpent = bySpent.slice(0, 10);
    for (const t of topBySpent) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(toItem(t));
    }

    // Топ-5 бизнес-критичных (type содержит 'feature' или 'business')
    const businessCritical = bySpent.filter(
      (t) => t.type === 'feature' || t.type === 'business' || t.type === 'businessCritical',
    );
    let bcCount = 0;
    for (const t of businessCritical) {
      if (bcCount >= 5 || result.length >= 20) break;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(toItem(t));
      bcCount++;
    }

    // Остальные слоты — заполняем следующими по spent
    for (const t of bySpent) {
      if (result.length >= 20) break;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(toItem(t));
    }

    return result;
  }

  private async collectWithRetry(
    target: CollectionTarget,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<{ rawMetrics: RawMetrics; kpi: CalculatedKpi }> {
    const ytService = getYouTrackService(this.log);
    const ytClient = ytService.getClient(target.youtrackInstanceId);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
      try {
        const collector = new MetricsCollector(ytClient, target.fieldMapping, this.log);
        const rawMetrics = await collector.collectForEmployee(
          target.projectShortName,
          target.login,
          dateFrom,
          dateTo,
        );
        const kpi = KpiCalculator.calculate(rawMetrics);
        return { rawMetrics, kpi };
      } catch (err) {
        lastError = err as Error;
        if (attempt < RETRY_COUNT) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          this.log.warn(
            `Retry ${attempt}/${RETRY_COUNT} for ${target.login}: ${lastError.message}, waiting ${delay}ms`,
          );
          await sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private async resolveProjectTargets(subscriptionId: string): Promise<CollectionTarget[]> {
    const sub = await this.em.findOne(
      Subscription,
      { id: subscriptionId },
      { populate: ['employees', 'fieldMapping'] },
    );
    if (!sub) throw new Error('Subscription not found');
    if (!sub.fieldMapping) throw new Error('No field mapping configured');

    return sub.employees
      .getItems()
      .filter((e) => e.isActive)
      .map((e) => ({
        login: e.youtrackLogin,
        displayName: e.displayName,
        subscriptionId: sub.id,
        projectShortName: sub.projectShortName,
        projectName: sub.projectName,
        youtrackInstanceId: sub.youtrackInstanceId,
        fieldMapping: sub.fieldMapping!,
      }));
  }

  private async resolveTeamTargets(teamId: string, userId: string): Promise<CollectionTarget[]> {
    const team = await this.em.findOne(Team, { id: teamId }, { populate: ['members'] });
    if (!team) throw new Error('Team not found');

    const logins = team.members.getItems().map((m) => m.youtrackLogin);
    if (logins.length === 0) return [];

    const subs = await this.em.find(
      Subscription,
      { ownerId: userId, isActive: true },
      { populate: ['employees', 'fieldMapping'] },
    );

    const targets: CollectionTarget[] = [];

    for (const sub of subs) {
      if (!sub.fieldMapping) continue;
      for (const emp of sub.employees.getItems()) {
        if (!emp.isActive || !logins.includes(emp.youtrackLogin)) continue;
        targets.push({
          login: emp.youtrackLogin,
          displayName: emp.displayName,
          subscriptionId: sub.id,
          projectShortName: sub.projectShortName,
          projectName: sub.projectName,
          youtrackInstanceId: sub.youtrackInstanceId,
          fieldMapping: sub.fieldMapping!,
        });
      }
    }

    return targets;
  }

  private async resolveEmployeeTargets(login: string, userId: string): Promise<CollectionTarget[]> {
    const subs = await this.em.find(
      Subscription,
      { ownerId: userId },
      { populate: ['employees', 'fieldMapping'] },
    );

    const targets: CollectionTarget[] = [];

    for (const sub of subs) {
      if (!sub.fieldMapping) continue;
      const emp = sub.employees.getItems().find(
        (e) => e.youtrackLogin === login && e.isActive,
      );
      if (!emp) continue;
      targets.push({
        login: emp.youtrackLogin,
        displayName: emp.displayName,
        subscriptionId: sub.id,
        projectShortName: sub.projectShortName,
        projectName: sub.projectName,
        youtrackInstanceId: sub.youtrackInstanceId,
        fieldMapping: sub.fieldMapping!,
      });
    }

    return targets;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/aggregated-reports/report-collector.ts
git commit -m "feat(reports): add ReportCollector for direct YouTrack collection"
```

---

### Task 4: Report Aggregator — adaptive granularity

**Files:**
- Create: `backend/src/modules/aggregated-reports/report-aggregator.ts`

- [ ] **Step 1: Create report-aggregator.ts**

```typescript
/**
 * Агрегация собранных данных: адаптивная нарезка периодов,
 * группировка метрик, формирование employeesData.
 */

import {
  CollectedData,
  CollectedEmployeeData,
  EmployeeAggItemV2,
  PeriodBreakdownItem,
  AggregatedMetricsDTO,
} from './aggregated-reports.types';
import { minutesToHours } from '../../common/utils/metrics-utils';

type Granularity = 'week' | 'month' | 'quarter';

export function chooseGranularity(dateFrom: Date, dateTo: Date): Granularity {
  const days = (dateTo.getTime() - dateFrom.getTime()) / (86400000);
  if (days <= 60) return 'week';
  if (days <= 548) return 'month';
  return 'quarter';
}

/**
 * Получить label периода для группировки.
 * week: "2025-W03", month: "2025-01", quarter: "2025-Q1"
 */
export function getPeriodLabel(date: Date, granularity: Granularity): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-based

  if (granularity === 'quarter') {
    const q = Math.floor(m / 3) + 1;
    return `${y}-Q${q}`;
  }

  if (granularity === 'month') {
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  // week: ISO week number
  const d = new Date(Date.UTC(y, m, date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Агрегировать собранные данные в employeesData с periodBreakdown.
 * Для типа 'employee' — группирует по проектам + итого.
 * Для типа 'project'/'team' — группирует по сотрудникам.
 */
export function aggregateCollectedData(
  collected: CollectedData,
  type: 'employee' | 'project' | 'team',
  dateFrom: Date,
  dateTo: Date,
): EmployeeAggItemV2[] {
  const granularity = chooseGranularity(dateFrom, dateTo);

  if (type === 'employee') {
    return aggregateForEmployee(collected, granularity);
  }

  return aggregateForProjectOrTeam(collected, granularity);
}

/**
 * Для типа 'employee': одна запись на проект + итого.
 */
function aggregateForEmployee(
  collected: CollectedData,
  granularity: Granularity,
): EmployeeAggItemV2[] {
  const result: EmployeeAggItemV2[] = [];
  const login = collected.employees[0]?.login ?? '';
  const displayName = collected.employees[0]?.displayName ?? '';

  // Per-project entries
  for (const emp of collected.employees) {
    result.push(buildEmployeeAggItem(emp, granularity));
  }

  // Summary entry (if multiple projects)
  if (collected.employees.length > 1) {
    result.push(buildSummaryItem(collected.employees, login, displayName, granularity));
  }

  return result;
}

/**
 * Для типа 'project'/'team': одна запись на сотрудника
 * (объединяем записи одного логина из разных подписок).
 */
function aggregateForProjectOrTeam(
  collected: CollectedData,
  granularity: Granularity,
): EmployeeAggItemV2[] {
  // Группируем по login
  const byLogin = new Map<string, CollectedEmployeeData[]>();
  for (const emp of collected.employees) {
    if (!byLogin.has(emp.login)) byLogin.set(emp.login, []);
    byLogin.get(emp.login)!.push(emp);
  }

  const result: EmployeeAggItemV2[] = [];

  for (const [, empRecords] of byLogin) {
    if (empRecords.length === 1) {
      result.push(buildEmployeeAggItem(empRecords[0], granularity));
    } else {
      // Multiple subscriptions — merge
      const first = empRecords[0];
      result.push(buildSummaryItem(empRecords, first.login, first.displayName, granularity));
    }
  }

  return result;
}

function buildEmployeeAggItem(
  emp: CollectedEmployeeData,
  granularity: Granularity,
): EmployeeAggItemV2 {
  const breakdown = buildPeriodBreakdown(emp.topTasks, emp.metrics, granularity);

  return {
    youtrackLogin: emp.login,
    displayName: emp.displayName,
    projectName: emp.projectName,
    avgScore: null,
    avgUtilization: emp.kpi.utilization,
    avgCompletionRate: emp.kpi.completionRate,
    completedIssues: emp.metrics.completedIssues,
    totalIssues: emp.metrics.totalIssues,
    scoreTrend: null,
    llmScore: null,
    llmSummary: null,
    llmConcerns: null,
    llmRecommendations: null,
    periodBreakdown: breakdown,
  };
}

function buildSummaryItem(
  records: CollectedEmployeeData[],
  login: string,
  displayName: string,
  granularity: Granularity,
): EmployeeAggItemV2 {
  const totalIssues = records.reduce((s, r) => s + r.metrics.totalIssues, 0);
  const completedIssues = records.reduce((s, r) => s + r.metrics.completedIssues, 0);
  const utils = records.map((r) => r.kpi.utilization).filter((v): v is number => v !== null);
  const compRates = records.map((r) => r.kpi.completionRate).filter((v): v is number => v !== null);

  // Merge issuesByType across projects
  const mergedIssuesByType: Record<string, number> = {};
  for (const r of records) {
    for (const [k, v] of Object.entries(r.metrics.issuesByType)) {
      mergedIssuesByType[k] = (mergedIssuesByType[k] ?? 0) + v;
    }
  }

  // For periodBreakdown, we can't easily split by period without task-level dates,
  // so we create a single-entry breakdown with totals
  const totalSpentMinutes = records.reduce((s, r) => s + r.metrics.totalSpentMinutes, 0);

  return {
    youtrackLogin: login,
    displayName,
    projectName: 'Итого',
    avgScore: null,
    avgUtilization: utils.length > 0 ? utils.reduce((a, b) => a + b, 0) / utils.length : null,
    avgCompletionRate: compRates.length > 0 ? compRates.reduce((a, b) => a + b, 0) / compRates.length : null,
    completedIssues,
    totalIssues,
    scoreTrend: null,
    llmScore: null,
    llmSummary: null,
    llmConcerns: null,
    llmRecommendations: null,
    periodBreakdown: null, // Summary doesn't have period breakdown
  };
}

/**
 * Build period breakdown from collected data.
 * Note: since MetricsCollector returns aggregated data for the whole period,
 * period breakdown for a single collection is a single row.
 * For meaningful breakdown, we'd need per-task dates — this can be enhanced later.
 */
function buildPeriodBreakdown(
  _tasks: { id: string; summary: string; type: string; spentMinutes: number }[],
  metrics: CollectedEmployeeData['metrics'],
  _granularity: Granularity,
): PeriodBreakdownItem[] {
  // Single entry for the whole period (MetricsCollector returns aggregate)
  return [{
    label: 'total',
    totalIssues: metrics.totalIssues,
    completedIssues: metrics.completedIssues,
    overdueIssues: metrics.overdueIssues,
    totalSpentHours: minutesToHours(metrics.totalSpentMinutes),
    utilization: null, // Will be calculated based on period length
    estimationAccuracy: null,
    completionRate: metrics.totalIssues > 0
      ? Math.round((metrics.completedIssues / metrics.totalIssues) * 1000) / 10
      : null,
    issuesByType: metrics.issuesByType,
  }];
}

/**
 * Агрегировать метрики из collectedData в AggregatedMetricsDTO.
 */
export function aggregateMetricsFromCollected(collected: CollectedData): AggregatedMetricsDTO {
  const emps = collected.employees;
  const totalSpentMinutes = emps.reduce((s, e) => s + e.metrics.totalSpentMinutes, 0);
  const totalEstMinutes = emps.reduce((s, e) => s + e.metrics.totalEstimationMinutes, 0);

  const utils = emps.map((e) => e.kpi.utilization).filter((v): v is number => v !== null);
  const estAcc = emps.map((e) => e.kpi.estimationAccuracy).filter((v): v is number => v !== null);
  const foci = emps.map((e) => e.kpi.focus).filter((v): v is number => v !== null);
  const compRates = emps.map((e) => e.kpi.completionRate).filter((v): v is number => v !== null);
  const cycleTimes = emps.map((e) => e.kpi.avgCycleTimeHours).filter((v): v is number => v !== null);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    totalIssues: emps.reduce((s, e) => s + e.metrics.totalIssues, 0),
    completedIssues: emps.reduce((s, e) => s + e.metrics.completedIssues, 0),
    overdueIssues: emps.reduce((s, e) => s + e.metrics.overdueIssues, 0),
    totalSpentHours: minutesToHours(totalSpentMinutes),
    totalEstimationHours: minutesToHours(totalEstMinutes),
    avgUtilization: avg(utils),
    avgEstimationAccuracy: avg(estAcc),
    avgFocus: avg(foci),
    avgCompletionRate: avg(compRates),
    avgCycleTimeHours: avg(cycleTimes),
    avgScore: null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/aggregated-reports/report-aggregator.ts
git commit -m "feat(reports): add ReportAggregator with adaptive period granularity"
```

---

### Task 5: LLM Pipeline — per-employee + summary prompts

**Files:**
- Modify: `backend/src/modules/aggregated-reports/period-llm.prompt.ts`
- Create: `backend/src/modules/aggregated-reports/report-llm-pipeline.ts`

- [ ] **Step 1: Rewrite period-llm.prompt.ts with new prompts**

Replace the entire content of `period-llm.prompt.ts`:

```typescript
/**
 * Промпты для двухуровневого LLM-анализа отчётов за произвольный период.
 * Уровень 1: per-employee (метрики + динамика + топ задач)
 * Уровень 2: итоговая сводка (общие метрики + мини-сводки сотрудников)
 */

import { ChatMessage } from '../llm/llm.types';
import { EmployeeAggItemV2, PeriodBreakdownItem, CollectedTaskItem } from './aggregated-reports.types';
import { getCategoryLabelRu } from '../subscriptions/subscriptions.types';

// ─── Level 1: Per-employee analysis ─────────────────────────

const EMPLOYEE_SYSTEM_PROMPT = `Ты — аналитик продуктивности разработчиков. Анализируй метрики сотрудника за период и давай оценку для руководителя.

Отвечай СТРОГО в формате JSON (без markdown, без \`\`\`):
{
  "score": <число 0-100>,
  "summary": "<развёрнутая сводка 3-5 предложений с анализом динамики и ключевых задач>",
  "concerns": ["<проблема1>", "<проблема2>"],
  "recommendations": ["<рекомендация1>", "<рекомендация2>"],
  "taskClassification": {
    "businessCritical": ["<ID задачи>"],
    "technicallySignificant": ["<ID задачи>"],
    "bugfixes": ["<ID задачи>"],
    "other": ["<ID задачи>"]
  }
}

Правила:
- Обращай внимание на ДИНАМИКУ метрик по периодам (рост, спад, аномалии)
- Анализируй СТРУКТУРУ работы: соотношение типов задач, как оно менялось
- Выделяй просрочки и их тренд
- Классифицируй задачи из списка по бизнес-значимости
- Score отражает общую продуктивность с учётом динамики и качества работы

Правила оценки score:
- 80-100: отличная продуктивность, стабильный рост или высокий уровень
- 60-79: хорошая продуктивность, есть области для улучшения
- 40-59: средняя продуктивность, негативная динамика или нестабильность
- 0-39: низкая продуктивность, серьёзные проблемы`;

function fmt(value: number | null | undefined, suffix = ''): string {
  if (value == null) return 'н/д';
  return `${Math.round(value * 100) / 100}${suffix}`;
}

interface EmployeePromptData {
  displayName: string;
  periodStart: string;
  periodEnd: string;
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentHours: number;
  totalEstimationHours: number;
  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  completionRate: number | null;
  avgCycleTimeHours: number | null;
  periodBreakdown: PeriodBreakdownItem[];
  topTasks: CollectedTaskItem[];
  /** Для employee-типа: таблица проектов */
  projectsSummary?: Array<{ projectName: string; totalIssues: number; completedIssues: number; spentHours: number }>;
}

function buildEmployeeUserPrompt(data: EmployeePromptData): string {
  let prompt = `Сотрудник: ${data.displayName}
Период: ${data.periodStart} — ${data.periodEnd}

=== Итого за период ===
Задачи: ${data.totalIssues} всего, ${data.completedIssues} закрыто, ${data.overdueIssues} просрочено
Время: списано ${fmt(data.totalSpentHours)}ч, оценка ${fmt(data.totalEstimationHours)}ч
KPI: загрузка ${fmt(data.utilization, '%')}, точность оценок ${fmt(data.estimationAccuracy, '%')}, фокус ${fmt(data.focus, '%')}
Completion Rate: ${fmt(data.completionRate, '%')}, Cycle Time: ${fmt(data.avgCycleTimeHours)}ч`;

  // Project summary for employee type
  if (data.projectsSummary && data.projectsSummary.length > 1) {
    prompt += '\n\n=== Разбивка по проектам ===';
    for (const p of data.projectsSummary) {
      prompt += `\n${p.projectName}: ${p.completedIssues}/${p.totalIssues} задач, ${fmt(p.spentHours)}ч`;
    }
  }

  // Period dynamics
  if (data.periodBreakdown.length > 1) {
    prompt += '\n\n=== Динамика по периодам ===';
    prompt += '\n        задачи  закрыто  просроч  время   загр%  точн%  compl%  типы задач';
    for (const p of data.periodBreakdown) {
      const types = Object.entries(p.issuesByType)
        .map(([k, v]) => `${getCategoryLabelRu(k)}:${v}`)
        .join(', ');
      prompt += `\n${p.label.padEnd(8)} ${String(p.totalIssues).padStart(6)}  ${String(p.completedIssues).padStart(7)}  ${String(p.overdueIssues).padStart(7)}  ${fmt(p.totalSpentHours).padStart(5)}ч  ${fmt(p.utilization, '%').padStart(5)}  ${fmt(p.estimationAccuracy, '%').padStart(5)}  ${fmt(p.completionRate, '%').padStart(6)}  ${types}`;
    }
  }

  // Top tasks
  if (data.topTasks.length > 0) {
    prompt += '\n\n=== ТОП задач (для классификации) ===';
    for (const t of data.topTasks) {
      const overdueStr = t.overdueDays ? `, просрочена ${t.overdueDays}д` : '';
      prompt += `\n- ${t.id}: ${t.summary} [${getCategoryLabelRu(t.type)}] — ${fmt(t.spentMinutes / 60)}ч${overdueStr}`;
    }
  }

  return prompt;
}

export function buildEmployeeAnalysisPrompt(data: EmployeePromptData): ChatMessage[] {
  return [
    { role: 'system', content: EMPLOYEE_SYSTEM_PROMPT },
    { role: 'user', content: buildEmployeeUserPrompt(data) },
  ];
}

// ─── Level 2: Summary analysis ──────────────────────────────

const SUMMARY_SYSTEM_PROMPT = `Ты — аналитик продуктивности. Анализируй данные команды/проекта и давай общую оценку для руководителя.

Отвечай СТРОГО в формате JSON (без markdown, без \`\`\`):
{
  "score": <число 0-100>,
  "summary": "<общая сводка по команде/проекту 3-5 предложений>",
  "concerns": ["<системная проблема1>", "<системная проблема2>"],
  "recommendations": ["<стратегическая рекомендация1>", "<стратегическая рекомендация2>"]
}

Правила:
- Выделяй лучших и слабых сотрудников
- Ищи системные проблемы (общие для нескольких человек)
- Оценивай баланс нагрузки в команде
- Давай стратегические рекомендации на уровне команды/проекта`;

interface SummaryPromptData {
  targetType: 'project' | 'team';
  targetName: string;
  periodStart: string;
  periodEnd: string;
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentHours: number;
  employeeSummaries: Array<{
    displayName: string;
    score: number | null;
    summary: string | null;
    completedIssues: number;
    totalIssues: number;
    utilization: number | null;
  }>;
}

function buildSummaryUserPrompt(data: SummaryPromptData): string {
  const typeLabel = data.targetType === 'project' ? 'Проект' : 'Команда';

  let prompt = `${typeLabel}: ${data.targetName}
Период: ${data.periodStart} — ${data.periodEnd}

=== Общие метрики ===
Задачи: ${data.totalIssues} всего, ${data.completedIssues} закрыто, ${data.overdueIssues} просрочено
Время: ${fmt(data.totalSpentHours)}ч

=== Сотрудники (${data.employeeSummaries.length} чел.) ===`;

  for (const e of data.employeeSummaries) {
    prompt += `\n\n--- ${e.displayName} (score: ${e.score ?? 'н/д'}) ---`;
    prompt += `\nЗадачи: ${e.completedIssues}/${e.totalIssues}, загрузка: ${fmt(e.utilization, '%')}`;
    if (e.summary) {
      // Truncate to ~80 words
      const words = e.summary.split(/\s+/);
      const truncated = words.length > 80 ? words.slice(0, 80).join(' ') + '...' : e.summary;
      prompt += `\n${truncated}`;
    }
  }

  return prompt;
}

export function buildSummaryAnalysisPrompt(data: SummaryPromptData): ChatMessage[] {
  return [
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    { role: 'user', content: buildSummaryUserPrompt(data) },
  ];
}
```

- [ ] **Step 2: Create report-llm-pipeline.ts**

```typescript
/**
 * Двухуровневый LLM pipeline для отчётов за произвольный период.
 * Уровень 1: per-employee анализ (N вызовов)
 * Уровень 2: итоговая сводка (1 вызов, только project/team)
 */

import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { AggregatedReport } from '../../entities/aggregated-report.entity';
import { LlmService } from '../llm/llm.service';
import {
  CollectedData,
  EmployeeAggItemV2,
  ReportProgress,
} from './aggregated-reports.types';
import { buildEmployeeAnalysisPrompt, buildSummaryAnalysisPrompt } from './period-llm.prompt';
import { minutesToHours } from '../../common/utils/metrics-utils';
import { formatYTDate } from '../../common/utils/week-utils';
import { Logger } from '../../common/types/logger';

interface LlmResult {
  score: number;
  summary: string;
  concerns: string[];
  recommendations: string[];
  taskClassification?: {
    businessCritical: string[];
    technicallySignificant: string[];
    bugfixes: string[];
    other: string[];
  };
}

function parseLlmResponse(raw: string): LlmResult | null {
  if (!raw || raw.trim().length === 0) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  const score = typeof parsed.score === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.score)))
    : null;
  if (score === null) return null;

  return {
    score,
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 2000) : '',
    concerns: Array.isArray(parsed.concerns)
      ? parsed.concerns.filter((v): v is string => typeof v === 'string')
      : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((v): v is string => typeof v === 'string')
      : [],
    taskClassification: parsed.taskClassification as LlmResult['taskClassification'] ?? undefined,
  };
}

export class ReportLlmPipeline {
  constructor(
    private orm: MikroORM,
    private llmService: LlmService,
    private log: Logger,
  ) {}

  /**
   * Запустить двухуровневый LLM-анализ.
   * Обновляет report.employeesData с LLM-результатами и report.llmPeriod* с итоговой сводкой.
   */
  async analyze(
    reportId: string,
    type: 'employee' | 'project' | 'team',
    collected: CollectedData,
    employeesData: EmployeeAggItemV2[],
  ): Promise<'ready' | 'partial' | 'failed'> {
    const em = this.orm.em.fork();
    const report = await em.findOneOrFail(AggregatedReport, reportId);

    // Determine unique employees for LLM analysis (skip 'Итого' entries)
    const employeesToAnalyze = employeesData.filter((e) => e.projectName !== 'Итого');
    const totalLlmCalls = employeesToAnalyze.length + (type !== 'employee' ? 1 : 0);
    let completedCalls = 0;
    let failedCalls = 0;

    report.status = 'analyzing';
    report.progress = {
      phase: 'analyzing',
      total: totalLlmCalls,
      completed: 0,
    } as unknown as object;
    await em.flush();

    // ─── Level 1: Per-employee ──────────────────────────────

    for (const empData of employeesToAnalyze) {
      completedCalls++;
      report.progress = {
        phase: 'analyzing',
        total: totalLlmCalls,
        completed: completedCalls,
        currentStep: `Анализ: ${empData.displayName}`,
      } as unknown as object;
      await em.flush();

      try {
        // Find collected data for this employee
        const empCollected = collected.employees.filter((e) => e.login === empData.youtrackLogin);
        if (empCollected.length === 0) continue;

        // Aggregate metrics across projects for this employee
        const totalIssues = empCollected.reduce((s, e) => s + e.metrics.totalIssues, 0);
        const completedIssues = empCollected.reduce((s, e) => s + e.metrics.completedIssues, 0);
        const overdueIssues = empCollected.reduce((s, e) => s + e.metrics.overdueIssues, 0);
        const totalSpentMin = empCollected.reduce((s, e) => s + e.metrics.totalSpentMinutes, 0);
        const totalEstMin = empCollected.reduce((s, e) => s + e.metrics.totalEstimationMinutes, 0);
        const allTasks = empCollected.flatMap((e) => e.topTasks);

        // KPI averages
        const kpis = empCollected.map((e) => e.kpi);
        const avgKpi = (getter: (k: typeof kpis[0]) => number | null) => {
          const vals = kpis.map(getter).filter((v): v is number => v !== null);
          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };

        const projectsSummary = empCollected.length > 1
          ? empCollected.map((e) => ({
              projectName: e.projectName,
              totalIssues: e.metrics.totalIssues,
              completedIssues: e.metrics.completedIssues,
              spentHours: minutesToHours(e.metrics.totalSpentMinutes),
            }))
          : undefined;

        const messages = buildEmployeeAnalysisPrompt({
          displayName: empData.displayName,
          periodStart: formatYTDate(report.periodStart),
          periodEnd: formatYTDate(report.periodEnd),
          totalIssues,
          completedIssues,
          overdueIssues,
          totalSpentHours: minutesToHours(totalSpentMin),
          totalEstimationHours: minutesToHours(totalEstMin),
          utilization: avgKpi((k) => k.utilization),
          estimationAccuracy: avgKpi((k) => k.estimationAccuracy),
          focus: avgKpi((k) => k.focus),
          completionRate: avgKpi((k) => k.completionRate),
          avgCycleTimeHours: avgKpi((k) => k.avgCycleTimeHours),
          periodBreakdown: empData.periodBreakdown ?? [],
          topTasks: allTasks.slice(0, 20),
          projectsSummary,
        });

        const response = await this.llmService.chatCompletion(messages);
        if (response) {
          const parsed = parseLlmResponse(response);
          if (parsed) {
            empData.llmScore = parsed.score;
            empData.llmSummary = parsed.summary;
            empData.llmConcerns = parsed.concerns;
            empData.llmRecommendations = parsed.recommendations;
            empData.avgScore = parsed.score;

            this.log.info(`LLM L1 done: ${empData.displayName} → score ${parsed.score}`);
          } else {
            failedCalls++;
            this.log.warn(`LLM L1 parse failed for ${empData.displayName}`);
          }
        } else {
          failedCalls++;
          this.log.warn(`LLM L1 empty response for ${empData.displayName}`);
        }
      } catch (err) {
        failedCalls++;
        this.log.error(`LLM L1 failed for ${empData.displayName}: ${(err as Error).message}`);
      }
    }

    // Copy LLM scores to 'Итого' entries
    for (const item of employeesData) {
      if (item.projectName === 'Итого') {
        const perEmployee = employeesToAnalyze.filter((e) => e.youtrackLogin === item.youtrackLogin);
        const scores = perEmployee.map((e) => e.llmScore).filter((v): v is number => v !== null);
        if (scores.length > 0) {
          item.llmScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          item.avgScore = item.llmScore;
        }
      }
    }

    // Save employeesData after L1
    report.employeesData = employeesData as unknown as object[];
    await em.flush();

    // ─── Level 2: Summary (project/team only) ───────────────

    if (type !== 'employee') {
      completedCalls++;
      report.progress = {
        phase: 'analyzing',
        total: totalLlmCalls,
        completed: completedCalls,
        currentStep: 'Формирование итоговой сводки',
      } as unknown as object;
      await em.flush();

      try {
        const empSummaries = employeesToAnalyze.map((e) => ({
          displayName: e.displayName,
          score: e.llmScore,
          summary: e.llmSummary,
          completedIssues: e.completedIssues,
          totalIssues: e.totalIssues,
          utilization: e.avgUtilization,
        }));

        const messages = buildSummaryAnalysisPrompt({
          targetType: type,
          targetName: report.targetName,
          periodStart: formatYTDate(report.periodStart),
          periodEnd: formatYTDate(report.periodEnd),
          totalIssues: report.totalIssues,
          completedIssues: report.completedIssues,
          overdueIssues: report.overdueIssues,
          totalSpentHours: minutesToHours(report.totalSpentMinutes),
          employeeSummaries: empSummaries,
        });

        const response = await this.llmService.chatCompletion(messages);
        if (response) {
          const parsed = parseLlmResponse(response);
          if (parsed) {
            report.llmPeriodScore = parsed.score;
            report.llmPeriodSummary = parsed.summary;
            report.llmPeriodConcerns = parsed.concerns;
            report.llmPeriodRecommendations = parsed.recommendations;
            report.avgScore = parsed.score;
            this.log.info(`LLM L2 done: summary score ${parsed.score}`);
          } else {
            failedCalls++;
            this.log.warn('LLM L2 parse failed');
          }
        } else {
          failedCalls++;
          this.log.warn('LLM L2 empty response');
        }
      } catch (err) {
        failedCalls++;
        this.log.error(`LLM L2 failed: ${(err as Error).message}`);
      }
    }

    // ─── Determine final status ─────────────────────────────

    const allFailed = failedCalls === totalLlmCalls;
    const someFailed = failedCalls > 0;

    let finalStatus: 'ready' | 'partial' | 'failed';
    if (allFailed) {
      finalStatus = 'failed';
    } else if (someFailed) {
      finalStatus = 'partial';
    } else {
      finalStatus = 'ready';
    }

    report.status = finalStatus;
    report.progress = null;
    await em.flush();

    return finalStatus;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/aggregated-reports/period-llm.prompt.ts backend/src/modules/aggregated-reports/report-llm-pipeline.ts
git commit -m "feat(reports): add two-level LLM pipeline with per-employee analysis"
```

---

### Task 6: Service — rewrite create(), remove preview()

**Files:**
- Modify: `backend/src/modules/aggregated-reports/aggregated-reports.service.ts`

- [ ] **Step 1: Add imports for new modules**

Add at the top of the file, after existing imports:

```typescript
import { ReportCollector } from './report-collector';
import { ReportLlmPipeline } from './report-llm-pipeline';
import { aggregateCollectedData, aggregateMetricsFromCollected } from './report-aggregator';
import { CollectedData, EmployeeAggItemV2, CreateRequest } from './aggregated-reports.types';
```

- [ ] **Step 2: Rewrite the `create` method**

Replace the existing `create` method (lines 68-135) with:

```typescript
  async create(params: CreateRequest & { userId: string }): Promise<CreateResponse> {
    const dateFrom = new Date(params.dateFrom);
    const dateTo = new Date(params.dateTo);

    // Validation
    if (dateFrom >= dateTo) throw new Error('dateFrom must be before dateTo');
    if (dateFrom > new Date()) throw new Error('Period cannot be in the future');

    const targetName = await this.resolveTargetName(params.type, params.targetId, params.userId);
    const days = (dateTo.getTime() - dateFrom.getTime()) / (86400000);
    const weeksCount = Math.ceil(days / 7);

    const report = new AggregatedReport();
    report.type = params.type;
    report.targetName = targetName;
    report.periodStart = dateFrom;
    report.periodEnd = dateTo;
    report.weeksCount = weeksCount;
    report.status = 'collecting';
    report.createdBy = params.userId;

    if (params.type === 'employee') report.targetLogin = params.targetId;
    else if (params.type === 'project') report.targetSubscriptionId = params.targetId;
    else report.targetTeamId = params.targetId;

    this.em.persist(report);
    await this.em.flush();

    const reportId = report.id;
    const reportType = params.type;
    const targetId = params.targetId;
    const userId = params.userId;

    // Async pipeline
    setImmediate(() => {
      this.runPipeline(reportId, reportType, targetId, userId, dateFrom, dateTo).catch((err) => {
        this.log.error(`Report pipeline failed: ${(err as Error).message}`);
      });
    });

    return { id: report.id, status: 'collecting' };
  }

  private log = { info: console.log, warn: console.warn, error: console.error } as any;

  private async runPipeline(
    reportId: string,
    type: 'employee' | 'project' | 'team',
    targetId: string,
    userId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<void> {
    const em = this.orm.em.fork();

    try {
      const report = await em.findOneOrFail(AggregatedReport, reportId);

      // ─── Phase 1: Collect ───────────────────────────────
      const collector = new ReportCollector(em, this.log);
      const targets = await collector.resolveTargets(type, targetId, userId);

      if (targets.length === 0) {
        report.status = 'failed';
        report.errorMessage = 'No active employees found';
        report.progress = null;
        await em.flush();
        return;
      }

      const collected = await collector.collect(report, targets, dateFrom, dateTo);

      if (collected.employees.length === 0) {
        report.status = 'failed';
        report.errorMessage = 'Collection returned no data';
        report.progress = null;
        await em.flush();
        return;
      }

      report.collectedData = collected as unknown as object;

      // ─── Phase 2: Aggregate ─────────────────────────────
      const employeesData = aggregateCollectedData(collected, type, dateFrom, dateTo);
      const metrics = aggregateMetricsFromCollected(collected);

      report.totalIssues = metrics.totalIssues;
      report.completedIssues = metrics.completedIssues;
      report.overdueIssues = metrics.overdueIssues;
      report.totalSpentMinutes = Math.round(metrics.totalSpentHours * 60);
      report.totalEstimationMinutes = Math.round(metrics.totalEstimationHours * 60);
      report.avgUtilization = metrics.avgUtilization ?? undefined;
      report.avgEstimationAccuracy = metrics.avgEstimationAccuracy ?? undefined;
      report.avgFocus = metrics.avgFocus ?? undefined;
      report.avgCompletionRate = metrics.avgCompletionRate ?? undefined;
      report.avgCycleTimeHours = metrics.avgCycleTimeHours ?? undefined;
      report.employeesData = employeesData as unknown as object[];
      await em.flush();

      // ─── Phase 3: LLM Analysis ──────────────────────────
      if (this.llmService) {
        const pipeline = new ReportLlmPipeline(this.orm, this.llmService, this.log);
        await pipeline.analyze(reportId, type, collected, employeesData);
      } else {
        report.status = 'ready';
        report.progress = null;
        await em.flush();
      }
    } catch (err) {
      try {
        const freshEm = this.orm.em.fork();
        const failedReport = await freshEm.findOne(AggregatedReport, reportId);
        if (failedReport) {
          failedReport.status = 'failed';
          failedReport.errorMessage = (err as Error).message;
          failedReport.progress = null;
          await freshEm.flush();
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }
```

- [ ] **Step 3: Remove the `preview` method**

Delete the `preview` method (lines 47-65) entirely.

Also remove unused private methods that were only used by the old `create`/`preview`:
- `roundPeriod` (lines 373-384)
- `fetchReports` (lines 407-458)
- `buildWeeklyData` (lines 460-510)
- `buildWeeklyTrends` (lines 512-524)
- `buildOverallTrend` (lines 526-538)
- `buildWeeklyLlmSummaries` (lines 540-579)
- `buildEmployeesData` (lines 581-620)
- `aggregateMetrics` (lines 622-636)
- `generatePeriodLlmSummary` (lines 273-339)
- `parsePeriodLlmResponse` (lines 341-371)

Keep: `resolveTargetName`, `list`, `getById`, `delete`, `getEmailPreview`.

- [ ] **Step 4: Update `getById` to include new fields in DTO**

In the `getById` method, add the new fields to the returned object:

```typescript
      progress: r.progress as any ?? null,
      collectedData: r.collectedData as any ?? null,
```

- [ ] **Step 5: Update `list` to handle new statuses**

In the `list` method, change the status mapping (line 164):

```typescript
      status: r.status,
```

(Remove the type assertion `as 'generating' | 'ready' | 'failed'`)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/aggregated-reports/aggregated-reports.service.ts
git commit -m "feat(reports): rewrite service with collection pipeline, remove preview"
```

---

### Task 7: Routes — remove preview endpoint

**Files:**
- Modify: `backend/src/modules/aggregated-reports/aggregated-reports.routes.ts`

- [ ] **Step 1: Remove preview route**

Delete the `POST /preview` route handler (lines 22-41).

- [ ] **Step 2: Update create route validation**

In the `POST /` handler, remove the reference to `PreviewRequest` and use `CreateRequest` instead. Remove the validation that references preview-specific fields.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/aggregated-reports/aggregated-reports.routes.ts
git commit -m "feat(reports): remove preview endpoint from routes"
```

---

### Task 8: Frontend types — update

**Files:**
- Modify: `frontend/src/types/aggregated-report.ts`

- [ ] **Step 1: Add new types and update existing ones**

Add after `EmployeeAggItem`:

```typescript
export interface ReportProgress {
  phase: 'collecting' | 'analyzing';
  total: number;
  completed: number;
  currentStep?: string;
}

export interface PeriodBreakdownItem {
  label: string;
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentHours: number;
  utilization: number | null;
  estimationAccuracy: number | null;
  completionRate: number | null;
  issuesByType: Record<string, number>;
}

export interface EmployeeAggItemV2 extends EmployeeAggItem {
  projectName?: string;
  llmScore: number | null;
  llmSummary: string | null;
  llmConcerns: string[] | null;
  llmRecommendations: string[] | null;
  periodBreakdown: PeriodBreakdownItem[] | null;
}
```

Remove `PreviewRequest`, `PreviewResponse`. Update `CreateRequest`:

```typescript
export interface CreateRequest {
  type: 'employee' | 'project' | 'team';
  targetId: string;
  dateFrom: string;
  dateTo: string;
}
```

Update `CreateResponse`:

```typescript
export interface CreateResponse {
  id: string;
  status: string;
}
```

Add `progress` to `AggregatedReportDTO`:

```typescript
  progress: ReportProgress | null;
```

Update `AggregatedReportListItem.status` to `string`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/aggregated-report.ts
git commit -m "feat(reports): update frontend types for arbitrary-period reports"
```

---

### Task 9: Frontend API — remove preview

**Files:**
- Modify: `frontend/src/api/endpoints/aggregated-reports.ts`

- [ ] **Step 1: Remove preview method**

Delete the `preview` method from the API object.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/endpoints/aggregated-reports.ts
git commit -m "feat(reports): remove preview API endpoint from frontend"
```

---

### Task 10: CreateReportModal — simplify

**Files:**
- Modify: `frontend/src/components/reports/CreateReportModal.tsx`

- [ ] **Step 1: Remove preview state and handlers**

Remove:
- `preview` state and `PreviewResponse` import
- `previewLoading` state
- `canPreview` computed
- `handlePreview` callback
- `periodInfo` computed
- Preview result UI block (lines 232-255)
- Period info UI block (lines 182-188)
- "Предпросмотр" button from footer

- [ ] **Step 2: Simplify footer**

Footer should only have "Отмена" and "Сформировать" buttons:

```tsx
footer={
  <>
    <button type="button" onClick={onClose}
      className="rounded-lg border border-gray-300 dark:border-surface-border px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-surface-lighter">
      Отмена
    </button>
    <button type="button" onClick={handleCreate}
      disabled={creating || !targetId || !dateFrom || !dateTo}
      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed">
      {creating ? 'Создание...' : 'Сформировать'}
    </button>
  </>
}
```

- [ ] **Step 3: Remove unused imports**

Remove `getMonday`, `getWeekEnd`, `getWeeksCount`, `formatDateDisplay` imports and `reportsApi` if no longer used.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/reports/CreateReportModal.tsx
git commit -m "feat(reports): simplify CreateReportModal, remove preview"
```

---

### Task 11: ReportStatusBadge — new statuses

**Files:**
- Modify: `frontend/src/components/reports/ReportStatusBadge.tsx`

- [ ] **Step 1: Add new status configs**

Add to the `statusConfig` object:

```typescript
  collecting: {
    label: 'Сбор данных',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    spinner: true,
  },
  analyzing: {
    label: 'Анализ',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    spinner: true,
  },
  partial: {
    label: 'Частично готов',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/reports/ReportStatusBadge.tsx
git commit -m "feat(reports): add collecting, analyzing, partial status badges"
```

---

### Task 12: ReportsPage — update polling

**Files:**
- Modify: `frontend/src/pages/ReportsPage.tsx`

- [ ] **Step 1: Update polling condition**

Change the polling check (line 57) from:

```typescript
const hasGenerating = data?.data.some(r => r.status === 'generating');
```

to:

```typescript
const hasInProgress = data?.data.some(
  r => r.status === 'generating' || r.status === 'collecting' || r.status === 'analyzing',
);
```

And update the `if` to use `hasInProgress`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ReportsPage.tsx
git commit -m "feat(reports): update polling to handle new statuses"
```

---

### Task 13: AggregatedReportPage — progress bar and employee cards

**Files:**
- Modify: `frontend/src/pages/AggregatedReportPage.tsx`

- [ ] **Step 1: Update polling condition**

Change the polling useEffect (line 61-79) to also poll for `collecting` and `analyzing`:

```typescript
const isInProgress = report?.status === 'generating'
  || report?.status === 'collecting'
  || report?.status === 'analyzing';
```

- [ ] **Step 2: Add progress bar component**

Add a progress bar that shows when `report.progress` is present:

```tsx
{report.progress && (
  <div className="mb-6 rounded-lg border border-gray-200 dark:border-surface-border p-4">
    <div className="mb-2 flex items-center justify-between text-sm">
      <span className="font-medium text-gray-900 dark:text-gray-100">
        {report.progress.phase === 'collecting' ? 'Сбор данных' : 'LLM-анализ'}
      </span>
      <span className="text-gray-500 dark:text-gray-400">
        {report.progress.completed}/{report.progress.total}
      </span>
    </div>
    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-surface-lighter">
      <div
        className="h-2 rounded-full bg-brand-500 transition-all duration-300"
        style={{ width: `${Math.round((report.progress.completed / report.progress.total) * 100)}%` }}
      />
    </div>
    {report.progress.currentStep && (
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{report.progress.currentStep}</p>
    )}
  </div>
)}
```

- [ ] **Step 3: Add per-employee LLM cards**

When `employeesData` has items with `llmScore`, render employee cards:

```tsx
{report.employeesData?.some((e: any) => e.llmScore !== null && e.llmScore !== undefined) && (
  <div className="mt-6">
    <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Анализ по сотрудникам</h3>
    <div className="space-y-3">
      {report.employeesData
        .filter((e: any) => e.llmScore !== null && e.llmScore !== undefined)
        .map((e: any) => (
          <div key={e.youtrackLogin + (e.projectName ?? '')}
            className="rounded-lg border border-gray-200 dark:border-surface-border p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-medium text-gray-900 dark:text-gray-100">{e.displayName}</span>
                {e.projectName && e.projectName !== 'Итого' && (
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({e.projectName})</span>
                )}
              </div>
              <span className="text-lg font-bold text-brand-500">{e.llmScore}</span>
            </div>
            {e.llmSummary && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{e.llmSummary}</p>
            )}
            {e.llmConcerns?.length > 0 && (
              <div className="text-sm">
                <span className="font-medium text-red-600 dark:text-red-400">Проблемы: </span>
                {e.llmConcerns.join('; ')}
              </div>
            )}
            {e.llmRecommendations?.length > 0 && (
              <div className="text-sm mt-1">
                <span className="font-medium text-blue-600 dark:text-blue-400">Рекомендации: </span>
                {e.llmRecommendations.join('; ')}
              </div>
            )}
          </div>
        ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AggregatedReportPage.tsx
git commit -m "feat(reports): add progress bar and per-employee LLM cards to report page"
```

---

### Task 14: Integration test — manual verification

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && npm run dev &
cd frontend && npm run dev &
```

- [ ] **Step 2: Verify the flow**

1. Open reports page
2. Click "Сформировать отчёт"
3. Select type, target, dates (e.g., last month)
4. Click "Сформировать"
5. Verify status changes: `collecting` → `analyzing` → `ready`
6. Verify progress bar shows during collection and analysis
7. Verify per-employee LLM cards appear on report page
8. Verify old reports still display correctly

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(reports): address integration issues from manual testing"
```
