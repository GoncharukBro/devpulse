# Report Recollect Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ability to recollect a single MetricReport from the employee page, triggering YouTrack data refresh + LLM re-analysis.

**Architecture:** New `recollectQueue` in CollectionStateManager, processed by CollectionWorker alongside the main queue. Report status (`collecting` → `collected` → `analyzed`) drives frontend polling. No CollectionLog created for recollect operations.

**Tech Stack:** Fastify (backend routes), MikroORM (entity updates), React + lucide-react (frontend UI), Zustand (no changes needed — polling is local)

---

### Task 1: Add `recollectQueue` to CollectionStateManager

**Files:**
- Modify: `backend/src/modules/collection/collection.state.ts`

**Step 1: Add RecollectTask interface and queue to state**

In `collection.state.ts`, add the `RecollectTask` interface after `QueueTask` (line 44):

```ts
export interface RecollectTask {
  reportId: string;
  subscriptionId: string;
  youtrackLogin: string;
  periodStart: Date;
  periodEnd: Date;
}
```

Add `recollectQueue` to the `CollectionState` interface (after line 52):

```ts
recollectQueue: RecollectTask[];
```

Initialize in the state object (after line 63, inside state initialization):

```ts
recollectQueue: [],
```

**Step 2: Add queue management methods**

Add to `CollectionStateManager` class (after `shiftQueue` method, around line 113):

```ts
addToRecollectQueue(task: RecollectTask): void {
  this.state.recollectQueue.push(task);
}

shiftRecollectQueue(): RecollectTask | undefined {
  return this.state.recollectQueue.shift();
}
```

**Step 3: Commit**

```bash
git add backend/src/modules/collection/collection.state.ts
git commit -m "feat(collection): add recollectQueue to CollectionStateManager"
```

---

### Task 2: Add `processRecollectTask` to CollectionWorker

**Files:**
- Modify: `backend/src/modules/collection/collection.worker.ts`

**Step 1: Update `poll()` to check recollect queue first**

In `poll()` method (line 132), replace the task acquisition logic:

```ts
private poll(): void {
  if (this.shouldStop) {
    this.isRunning = false;
    return;
  }

  // Recollect tasks have priority (fast, single-employee)
  const recollectTask = collectionState.shiftRecollectQueue();
  if (recollectTask) {
    this.processing = true;
    this.processRecollectTask(recollectTask)
      .catch((err) => {
        this.log.error(`Recollect task failed: ${(err as Error).message}`);
      })
      .finally(() => {
        this.processing = false;
        if (!this.shouldStop) {
          this.pollTimer = setTimeout(() => this.poll(), 100);
        } else {
          this.isRunning = false;
        }
      });
    return;
  }

  const task = collectionState.shiftQueue();
  if (task) {
    this.processing = true;
    collectionState.updateProgress(task.logId, { status: 'running' });
    this.processTask(task)
      .catch((err) => {
        this.log.error(`Worker task failed: ${(err as Error).message}`);
      })
      .finally(() => {
        this.processing = false;
        if (!this.shouldStop) {
          this.pollTimer = setTimeout(() => this.poll(), 100);
        } else {
          this.isRunning = false;
        }
      });
  } else {
    this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL);
  }
}
```

**Step 2: Add `processRecollectTask` method**

Add after `collectForSubscription` method (around line 565):

```ts
private async processRecollectTask(task: import('./collection.state').RecollectTask): Promise<void> {
  const em = this.orm.em.fork();

  const report = await em.findOne(MetricReport, { id: task.reportId }, { populate: ['subscription'] });
  if (!report) {
    this.log.warn(`Recollect: report ${task.reportId} not found, skipping`);
    return;
  }

  const subscription = report.subscription;
  if (!subscription) {
    this.log.warn(`Recollect: subscription not found for report ${task.reportId}`);
    report.status = 'failed';
    report.errorMessage = 'Subscription not found';
    await em.flush();
    return;
  }

  // Reload subscription with fieldMapping
  await em.populate(subscription, ['fieldMapping', 'employees']);

  const fieldMapping = subscription.fieldMapping;
  if (!fieldMapping) {
    this.log.error(`Recollect: no field mapping for subscription ${subscription.id}`);
    report.status = 'failed';
    report.errorMessage = 'No field mapping configured';
    await em.flush();
    return;
  }

  this.log.info(
    `Recollect started: ${subscription.projectName}, employee=${task.youtrackLogin}, ` +
    `period=${formatYTDate(task.periodStart)}..${formatYTDate(task.periodEnd)}`,
  );

  try {
    const ytService = getYouTrackService(this.log);
    const ytClient = ytService.getClient(subscription.youtrackInstanceId);

    const rawMetrics = await this.collectWithRetry(
      ytClient,
      fieldMapping,
      subscription.projectShortName,
      task.youtrackLogin,
      task.periodStart,
      task.periodEnd,
    );

    const kpi = KpiCalculator.calculate(rawMetrics);

    // Update report with new data
    report.totalIssues = rawMetrics.totalIssues;
    report.completedIssues = rawMetrics.completedIssues;
    report.inProgressIssues = rawMetrics.inProgressIssues;
    report.overdueIssues = rawMetrics.overdueIssues;
    report.issuesByType = rawMetrics.issuesByType;
    report.issuesWithoutEstimation = rawMetrics.issuesWithoutEstimation;
    report.issuesOverEstimation = rawMetrics.issuesOverEstimation;

    report.totalSpentMinutes = rawMetrics.totalSpentMinutes;
    report.spentByType = rawMetrics.spentByType;
    report.totalEstimationMinutes = rawMetrics.totalEstimationMinutes;
    report.estimationByType = rawMetrics.estimationByType;

    report.avgCycleTimeHours = kpi.avgCycleTimeHours ?? undefined;
    report.bugsAfterRelease = rawMetrics.bugsAfterRelease;
    report.bugsOnTest = rawMetrics.bugsOnTest;
    report.aiSavingMinutes = rawMetrics.aiSavingMinutes;

    report.utilization = kpi.utilization ?? undefined;
    report.estimationAccuracy = kpi.estimationAccuracy ?? undefined;
    report.focus = kpi.focus ?? undefined;
    report.avgComplexityHours = kpi.avgComplexityHours ?? undefined;
    report.completionRate = kpi.completionRate ?? undefined;

    const hasNoData = rawMetrics.totalIssues === 0;
    report.status = 'collected';
    report.llmStatus = hasNoData ? 'skipped' : 'pending';
    report.collectedAt = new Date();
    report.errorMessage = undefined;
    report.llmProcessedAt = undefined;
    // Clear old LLM data before re-analysis
    report.llmScore = undefined;
    report.llmSummary = undefined;
    report.llmAchievements = undefined;
    report.llmConcerns = undefined;
    report.llmRecommendations = undefined;
    report.llmTaskClassification = undefined;

    await em.flush();

    // Generate achievements
    if (this.achievementsGenerator) {
      try {
        await this.achievementsGenerator.generateForReport(report.id);
      } catch (achErr) {
        this.log.error(
          `Recollect achievement error for ${task.youtrackLogin}: ${(achErr as Error).message}`,
        );
      }
    }

    // Enqueue for LLM analysis
    if (this.llmService && !hasNoData) {
      const employee = subscription.employees
        .getItems()
        .find((e) => e.youtrackLogin === task.youtrackLogin);

      this.llmService.enqueueReports([{
        reportId: report.id,
        subscriptionId: subscription.id,
        login: task.youtrackLogin,
        name: employee?.displayName ?? task.youtrackLogin,
        project: subscription.projectName,
        taskSummaries: rawMetrics.taskSummaries.map((t) => ({
          id: t.id,
          summary: t.summary,
          type: t.type,
        })),
      }]);
    }

    this.log.info(
      `Recollect completed: ${subscription.projectName}, employee=${task.youtrackLogin}`,
    );
  } catch (err) {
    const errorMsg = (err as Error).message;
    this.log.error(
      `Recollect failed for ${task.youtrackLogin}: ${errorMsg}`,
    );
    report.status = 'failed';
    report.errorMessage = errorMsg;
    await em.flush();
  }
}
```

**Step 3: Add recovery for stuck recollect reports**

In `recoverLlmQueue()` method (around line 609), add before the existing logic:

```ts
// Recovery: reset 'collecting' reports to 'failed' (recollect was interrupted)
const collectingReports = await em.find(MetricReport, { status: 'collecting' });
if (collectingReports.length > 0) {
  for (const r of collectingReports) {
    r.status = 'failed';
    r.errorMessage = 'Recollect interrupted by server restart';
  }
  await em.flush();
  this.log.info(`Recovery: ${collectingReports.length} stuck 'collecting' reports reset to 'failed'`);
}
```

**Step 4: Commit**

```bash
git add backend/src/modules/collection/collection.worker.ts
git commit -m "feat(collection): add processRecollectTask to worker with recovery"
```

---

### Task 3: Add `recollectReport` method to CollectionService

**Files:**
- Modify: `backend/src/modules/collection/collection.service.ts`

**Step 1: Add recollectReport method**

Add after `triggerCollection` method (around line 180):

```ts
/**
 * Пересборка конкретного отчёта — запрос данных из YouTrack + LLM-анализ.
 */
async recollectReport(reportId: string, ownerId: string): Promise<{ status: string; reportId: string }> {
  const report = await this.em.findOne(
    MetricReport,
    { id: reportId },
    { populate: ['subscription'] },
  );

  if (!report) throw new NotFoundError('Report not found');

  // Verify ownership
  const subscription = await this.em.findOne(Subscription, {
    id: report.subscription.id,
    ownerId,
  });
  if (!subscription) throw new NotFoundError('Report not found');

  // Check if already recollecting
  if (report.status === 'collecting') {
    throw new ConflictError('Отчёт уже пересобирается');
  }

  // Mark as collecting
  report.status = 'collecting';
  report.llmStatus = 'pending';
  report.errorMessage = undefined;
  await this.em.flush();

  // Enqueue recollect task
  collectionState.addToRecollectQueue({
    reportId: report.id,
    subscriptionId: subscription.id,
    youtrackLogin: report.youtrackLogin,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
  });

  getCollectionWorker()?.nudge();

  return { status: 'started', reportId: report.id };
}
```

**Step 2: Commit**

```bash
git add backend/src/modules/collection/collection.service.ts
git commit -m "feat(collection): add recollectReport method to service"
```

---

### Task 4: Add API route for recollect

**Files:**
- Modify: `backend/src/modules/reports/reports.routes.ts`

**Step 1: Add recollect route**

Import `CollectionService` and error types at the top of the file (after existing imports):

```ts
import { CollectionService } from '../collection/collection.service';
import { ConflictError, NotFoundError } from '../../common/errors';
```

Add the route before the email-preview route (around line 166):

```ts
// POST /api/reports/:reportId/recollect
app.post<{ Params: { reportId: string } }>(
  '/reports/:reportId/recollect',
  async (request, reply) => {
    const em = request.orm.em.fork();
    const service = new CollectionService(em);

    try {
      const result = await service.recollectReport(
        request.params.reportId,
        request.user.id,
      );
      reply.status(202).send(result);
    } catch (err) {
      if (err instanceof NotFoundError) {
        reply.status(404).send({ message: (err as NotFoundError).message });
        return;
      }
      if (err instanceof ConflictError) {
        reply.status(409).send({ message: (err as ConflictError).message });
        return;
      }
      throw err;
    }
  },
);
```

**Step 2: Commit**

```bash
git add backend/src/modules/reports/reports.routes.ts
git commit -m "feat(reports): add POST /reports/:reportId/recollect endpoint"
```

---

### Task 5: Add `id` and `llmStatus` to EmployeeReportListItem

**Files:**
- Modify: `backend/src/modules/reports/reports.types.ts`
- Modify: `backend/src/modules/reports/reports.service.ts`
- Modify: `frontend/src/types/reports.ts`

**Step 1: Update backend DTO type**

In `backend/src/modules/reports/reports.types.ts`, add `id` and `llmStatus` to `EmployeeReportListItem` (around line 199):

```ts
export interface EmployeeReportListItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  score: number | null;
  scoreSource: 'llm' | null;
  utilization: number | null;
  completedIssues: number;
  totalIssues: number;
  status: string;
  llmStatus: string;
  subscriptionId: string;
  projectName: string;
}
```

**Step 2: Update service mapping**

In `backend/src/modules/reports/reports.service.ts`, in the `getEmployeeReportList` method (around line 726), update the map:

```ts
const data = reports.map((r) => ({
  id: r.id,
  periodStart: formatYTDate(r.periodStart),
  periodEnd: formatYTDate(r.periodEnd),
  score: getEffectiveScore(r),
  scoreSource: getScoreSource(r),
  utilization: r.utilization ?? null,
  completedIssues: r.completedIssues,
  totalIssues: r.totalIssues,
  status: r.status,
  llmStatus: r.llmStatus,
  subscriptionId: r.subscription.id,
  projectName: r.subscription.projectName,
}));
```

**Step 3: Update frontend type**

In `frontend/src/types/reports.ts`, update `EmployeeReportListItem` (line 203):

```ts
export interface EmployeeReportListItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  score: number | null;
  scoreSource: 'llm' | null;
  utilization: number | null;
  completedIssues: number;
  totalIssues: number;
  status: string;
  llmStatus: string;
  subscriptionId: string;
  projectName: string;
}
```

**Step 4: Commit**

```bash
git add backend/src/modules/reports/reports.types.ts backend/src/modules/reports/reports.service.ts frontend/src/types/reports.ts
git commit -m "feat(reports): add id and llmStatus to EmployeeReportListItem"
```

---

### Task 6: Add `recollectReport` to frontend API

**Files:**
- Modify: `frontend/src/api/endpoints/reports.ts`

**Step 1: Add API method**

Add after the `getEmployeeReports` method (around line 80):

```ts
async recollectReport(reportId: string): Promise<{ status: string; reportId: string }> {
  const response = await apiClient.post<{ status: string; reportId: string }>(
    `/reports/${reportId}/recollect`,
  );
  return response.data;
},
```

**Step 2: Commit**

```bash
git add frontend/src/api/endpoints/reports.ts
git commit -m "feat(reports): add recollectReport API method"
```

---

### Task 7: Update StatusBadge for new statuses

**Files:**
- Modify: `frontend/src/components/shared/StatusBadge.tsx`

**Step 1: Rewrite StatusBadge to handle all statuses**

```tsx
import Badge from '@/components/ui/Badge';

interface StatusBadgeProps {
  status: string;
  llmStatus?: string;
  llmProcessedAt?: string | null;
}

export default function StatusBadge({ status, llmStatus, llmProcessedAt }: StatusBadgeProps) {
  if (status === 'collecting') {
    return (
      <Badge variant="warning" className="animate-pulse">
        Сбор...
      </Badge>
    );
  }

  if (status === 'collected' && llmStatus && ['pending', 'processing'].includes(llmStatus)) {
    return (
      <Badge variant="warning" className="animate-pulse">
        Анализ...
      </Badge>
    );
  }

  if (status === 'analyzed' || (status === 'collected' && llmProcessedAt)) {
    return <Badge variant="success">Готов</Badge>;
  }

  if (status === 'collected') {
    return <Badge variant="info">Собрано</Badge>;
  }

  if (status === 'failed') {
    return <Badge variant="danger">Ошибка</Badge>;
  }

  if (status === 'processing') {
    return <Badge variant="warning">Обработка</Badge>;
  }

  if (status === 'error') {
    return <Badge variant="danger">Ошибка</Badge>;
  }

  return <Badge variant="neutral">{status}</Badge>;
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/shared/StatusBadge.tsx
git commit -m "feat(ui): update StatusBadge for collecting/analyzing statuses"
```

---

### Task 8: Add recollect button and polling to EmployeePage

**Files:**
- Modify: `frontend/src/pages/EmployeePage.tsx`

**Step 1: Add imports and state**

Add to imports (top of file):

```ts
import { RefreshCw } from 'lucide-react';
```

Add state after `selectedPortfolioAchievement` state (around line 65):

```ts
const [recollectingIds, setRecollectingIds] = useState<Set<string>>(new Set());
const [confirmRecollect, setConfirmRecollect] = useState<EmployeeReportListItem | null>(null);
```

**Step 2: Add recollect handler**

Add after `handleReportRowClick` (around line 173):

```ts
async function handleRecollect(item: EmployeeReportListItem) {
  setConfirmRecollect(null);
  try {
    await reportsApi.recollectReport(item.id);
    setRecollectingIds((prev) => new Set(prev).add(item.id));
    toast.success('Пересборка запущена');
    loadReportsList();
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    toast.error(message || 'Не удалось запустить пересборку');
  }
}
```

**Step 3: Add polling effect**

Add after existing useEffect hooks (around line 143):

```ts
// Poll reports list while any report is being recollected
useEffect(() => {
  if (recollectingIds.size === 0) return;

  const interval = setInterval(async () => {
    await loadReportsList();
  }, 3000);

  return () => clearInterval(interval);
}, [recollectingIds, loadReportsList]);

// Check if recollecting reports are done
useEffect(() => {
  if (recollectingIds.size === 0 || !reportsList) return;

  const stillActive = new Set<string>();
  for (const id of recollectingIds) {
    const item = reportsList.data.find((r) => r.id === id);
    if (item && (item.status === 'collecting' || (item.status === 'collected' && ['pending', 'processing'].includes(item.llmStatus)))) {
      stillActive.add(id);
    }
  }

  if (stillActive.size !== recollectingIds.size) {
    setRecollectingIds(stillActive);
    // Also refresh the detailed report view if it was recollected
    if (report) {
      const finishedReport = reportsList.data.find(
        (r) => recollectingIds.has(r.id) && !stillActive.has(r.id) &&
        r.subscriptionId === report.subscriptionId && r.periodStart === report.periodStart,
      );
      if (finishedReport) {
        loadReport(report.subscriptionId, report.periodStart);
      }
    }
  }
}, [reportsList, recollectingIds, report, loadReport]);
```

**Step 4: Add actions column to table header**

In the thead (line 453), add after the Status th:

```tsx
<th className="w-10 px-2 py-3"></th>
```

**Step 5: Add recollect button to table rows**

In each tr (after the StatusBadge td, around line 495), add:

```tsx
<td className="px-2 py-3">
  <button
    onClick={(e) => {
      e.stopPropagation();
      setConfirmRecollect(item);
    }}
    disabled={
      item.status === 'collecting' ||
      (item.status === 'collected' && ['pending', 'processing'].includes(item.llmStatus))
    }
    className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-surface-lighter focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    title="Пересобрать отчёт"
  >
    <RefreshCw
      size={14}
      className={
        item.status === 'collecting' ||
        (item.status === 'collected' && ['pending', 'processing'].includes(item.llmStatus))
          ? 'animate-spin'
          : ''
      }
    />
  </button>
</td>
```

**Step 6: Update StatusBadge usage to pass llmStatus**

Update the StatusBadge in table rows (line 495):

```tsx
<StatusBadge status={item.status} llmStatus={item.llmStatus} />
```

**Step 7: Add confirmation modal**

Add before the existing `EmailReportModal` (around line 565):

```tsx
{/* Recollect confirmation modal */}
{confirmRecollect && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-surface-card">
      <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100">
        Пересобрать отчёт?
      </h3>
      <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
        Отчёт за{' '}
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {formatDateShort(confirmRecollect.periodStart)} — {formatDateShort(confirmRecollect.periodEnd)}
        </span>
        , проект{' '}
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {confirmRecollect.projectName}
        </span>
        . Данные будут заново запрошены из YouTrack и проанализированы LLM.
      </p>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirmRecollect(null)}
        >
          Отмена
        </Button>
        <Button
          size="sm"
          onClick={() => handleRecollect(confirmRecollect)}
        >
          Пересобрать
        </Button>
      </div>
    </div>
  </div>
)}
```

**Step 8: Commit**

```bash
git add frontend/src/pages/EmployeePage.tsx
git commit -m "feat(employee): add recollect button with confirmation and polling"
```

---

### Task 9: Final integration test

**Files:** None (manual testing)

**Step 1: Start backend and frontend**

```bash
cd backend && npm run dev &
cd frontend && npm run dev &
```

**Step 2: Test recollect flow**

1. Open employee page with existing reports
2. Click RefreshCw button on a report row
3. Confirm in the modal
4. Verify: button shows spinning icon, status shows "Сбор..."
5. Wait for YouTrack collection to complete
6. Verify: status changes to "Анализ..."
7. Wait for LLM analysis to complete
8. Verify: status changes to "Готов", data refreshed
9. Verify: clicking on the recollected row shows updated report details

**Step 3: Test edge cases**

1. Try recollecting while already recollecting — button should be disabled
2. Reload page during recollection — status should show current state
3. Recollect a report with no data (totalIssues=0) — should skip LLM

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address integration testing feedback"
```
