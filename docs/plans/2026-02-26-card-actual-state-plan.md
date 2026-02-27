# Card Shows Actual State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make SubscriptionCard show real data/LLM status from MetricReport table instead of last CollectionLog counters.

**Architecture:** Add an aggregate SQL query on `metric_reports` to `listSubscriptions()`, returning `currentPeriodStatus` per subscription. Frontend reads this for static data/LLM display, with live polling taking priority during active collection/LLM processing. Store detects LLM completion to trigger refresh.

**Tech Stack:** MikroORM raw SQL (PostgreSQL), React/Zustand, TypeScript

---

### Task 1: Backend — Add `currentPeriodStatus` to `listSubscriptions()`

**Files:**
- Modify: `backend/src/modules/subscriptions/subscriptions.service.ts:35-82`

**Step 1: Add helper function `getCurrentWeekMonday()`**

At the top of the file, add:

```typescript
function getCurrentWeekMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return monday.toISOString().split('T')[0];
}
```

**Step 2: Add aggregate query inside `listSubscriptions()`**

After the existing `em.find(Subscription, ...)` call (line 45-48), and before the `.map()` (line 50), add a raw SQL query to get MetricReport counts. There are two queries:

1. Try current week first:
```typescript
const subIds = subscriptions.map((s) => s.id);
if (subIds.length === 0) return [];

const currentWeekStart = getCurrentWeekMonday();

// Get metric report counts for current period per subscription
const periodStatusRows: Array<{
  subscription_id: string;
  period_start: string;
  data_collected: string;
  llm_completed: string;
  llm_pending: string;
  llm_processing: string;
  llm_failed: string;
  llm_skipped: string;
}> = await em.getConnection().execute(`
  WITH target_period AS (
    SELECT subscription_id,
           COALESCE(
             NULLIF(MAX(CASE WHEN period_start = ? THEN period_start END), NULL),
             MAX(period_start)
           ) AS period_start
    FROM metric_reports
    WHERE subscription_id IN (${subIds.map(() => '?').join(',')})
    GROUP BY subscription_id
  )
  SELECT mr.subscription_id,
         tp.period_start::text AS period_start,
         COUNT(*)::text AS data_collected,
         COUNT(*) FILTER (WHERE mr.llm_status = 'completed')::text AS llm_completed,
         COUNT(*) FILTER (WHERE mr.llm_status = 'pending')::text AS llm_pending,
         COUNT(*) FILTER (WHERE mr.llm_status = 'processing')::text AS llm_processing,
         COUNT(*) FILTER (WHERE mr.llm_status = 'failed')::text AS llm_failed,
         COUNT(*) FILTER (WHERE mr.llm_status = 'skipped')::text AS llm_skipped
  FROM metric_reports mr
  JOIN target_period tp ON mr.subscription_id = tp.subscription_id
                       AND mr.period_start = tp.period_start
  GROUP BY mr.subscription_id, tp.period_start
`, [currentWeekStart, ...subIds]);

// Build lookup map
const periodStatusMap = new Map<string, typeof periodStatusRows[0]>();
for (const row of periodStatusRows) {
  periodStatusMap.set(row.subscription_id, row);
}
```

**Step 3: Add `currentPeriodStatus` to the response mapping**

Inside the existing `.map()` callback, after the `lastCollection` block, add:

```typescript
const periodRow = periodStatusMap.get(sub.id);
// ...
currentPeriodStatus: periodRow
  ? {
      periodStart: periodRow.period_start,
      totalEmployees: sub.employees.getItems().filter((e) => e.isActive).length,
      dataCollected: parseInt(periodRow.data_collected, 10),
      llmCompleted: parseInt(periodRow.llm_completed, 10),
      llmPending: parseInt(periodRow.llm_pending, 10),
      llmProcessing: parseInt(periodRow.llm_processing, 10),
      llmFailed: parseInt(periodRow.llm_failed, 10),
      llmSkipped: parseInt(periodRow.llm_skipped, 10),
    }
  : null,
```

**Step 4: Run lint and typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (no new type errors — return type is `Promise<object[]>`)

**Step 5: Commit**

```bash
git add backend/src/modules/subscriptions/subscriptions.service.ts
git commit -m "feat: add currentPeriodStatus from metric_reports to subscriptions API"
```

---

### Task 2: Frontend types — Add `CurrentPeriodStatus`

**Files:**
- Modify: `frontend/src/types/subscription.ts:1-24`

**Step 1: Add the new interface and extend Subscription**

Add before the `Subscription` interface:

```typescript
export interface CurrentPeriodStatus {
  periodStart: string;
  totalEmployees: number;
  dataCollected: number;
  llmCompleted: number;
  llmPending: number;
  llmProcessing: number;
  llmFailed: number;
  llmSkipped: number;
}
```

Add to the `Subscription` interface (after `lastCollection` field, line 22):

```typescript
  currentPeriodStatus: CurrentPeriodStatus | null;
```

**Step 2: Run typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (the field is added but not yet consumed — no breakage)

**Step 3: Commit**

```bash
git add frontend/src/types/subscription.ts
git commit -m "feat: add CurrentPeriodStatus type to Subscription"
```

---

### Task 3: SubscriptionCard — Use `currentPeriodStatus` for static display

**Files:**
- Modify: `frontend/src/components/collection/SubscriptionCard.tsx:30-143`

**Step 1: Rewrite `getDataStatusLine()` to use `currentPeriodStatus`**

Replace the current `getDataStatusLine` function (lines 30-85) with:

```typescript
function getDataStatusLine(
  currentPeriod: Subscription['currentPeriodStatus'],
  isPending: boolean,
  isRunning: boolean,
  isStopping: boolean,
): StatusLine | null {
  if (isPending || isRunning || isStopping) return null; // shown via progress bars
  if (!currentPeriod) return null;

  const { dataCollected, totalEmployees } = currentPeriod;

  if (dataCollected === 0) return null;

  if (dataCollected >= totalEmployees) {
    return {
      icon: <CheckCircle size={14} className="text-emerald-500" />,
      text: `Собраны (${dataCollected}/${totalEmployees})`,
      color: 'text-emerald-500',
    };
  }

  return {
    icon: <AlertTriangle size={14} className="text-amber-500" />,
    text: `Частично (${dataCollected}/${totalEmployees})`,
    color: 'text-amber-500',
  };
}
```

**Step 2: Rewrite `getLlmStatusLine()` to use `currentPeriodStatus`**

Replace the current `getLlmStatusLine` function (lines 87-143) with:

```typescript
function getLlmStatusLine(
  llmSubStatus: LlmSubscriptionStatus | undefined,
  currentPeriod: Subscription['currentPeriodStatus'],
): StatusLine | null {
  // 1. Priority: real-time polling (LLM actively processing)
  if (llmSubStatus && (llmSubStatus.processing > 0 || llmSubStatus.pending > 0)) {
    const completed = llmSubStatus.total - llmSubStatus.pending - llmSubStatus.processing;
    if (llmSubStatus.processing > 0) {
      return {
        icon: <Loader size={14} className="animate-spin text-purple-400" />,
        text: `Анализ (${completed}/${llmSubStatus.total})`,
        color: 'text-purple-500',
      };
    }
    return {
      icon: <Clock size={14} className="text-purple-400" />,
      text: `В очереди (${llmSubStatus.pending})`,
      color: 'text-purple-500',
    };
  }

  // 2. Static state from currentPeriodStatus
  if (!currentPeriod) return null;
  const { dataCollected, llmCompleted, llmFailed, llmSkipped, llmPending } = currentPeriod;
  if (dataCollected === 0) return null;

  if (llmCompleted === dataCollected) {
    return {
      icon: <CheckCircle size={14} className="text-emerald-500" />,
      text: `Завершён (${llmCompleted}/${dataCollected})`,
      color: 'text-emerald-500',
    };
  }
  if (llmSkipped > 0 && llmCompleted === 0 && llmFailed === 0) {
    return {
      icon: <Square size={14} className="text-gray-400" />,
      text: 'Отменён',
      color: 'text-gray-500',
    };
  }
  if (llmFailed > 0 && llmCompleted === 0) {
    return {
      icon: <AlertTriangle size={14} className="text-amber-500" />,
      text: 'Формулы (LLM недоступен)',
      color: 'text-amber-500',
    };
  }
  if (llmCompleted > 0) {
    const remaining = dataCollected - llmCompleted;
    return {
      icon: <AlertTriangle size={14} className="text-amber-500" />,
      text: `${llmCompleted}/${dataCollected} (${remaining} не обработано)`,
      color: 'text-amber-500',
    };
  }
  if (llmPending > 0) {
    return {
      icon: <Clock size={14} className="text-purple-400" />,
      text: `В очереди (${llmPending})`,
      color: 'text-purple-500',
    };
  }

  return null;
}
```

**Step 3: Update call sites in the component body**

At line 181-182, change the calls from:

```typescript
const dataLine = getDataStatusLine(lastCol, isPending, isRunning, isStopping);
const llmLine = getLlmStatusLine(llmSubscriptionStatus, lastCol);
```

To:

```typescript
const dataLine = getDataStatusLine(subscription.currentPeriodStatus, isPending, isRunning, isStopping);
const llmLine = getLlmStatusLine(llmSubscriptionStatus, subscription.currentPeriodStatus);
```

**Step 4: Update header dot color logic**

At lines 185-195, update the dot color to use `currentPeriodStatus` instead of `lastCol` for the "has data" check:

```typescript
const dotColor = (isPending || isRunning || isStopping || hasLlm)
  ? 'bg-amber-400 animate-pulse'
  : !subscription.isActive
    ? 'bg-gray-500'
    : lastCol?.status === 'failed'
      ? 'bg-red-500'
      : subscription.currentPeriodStatus
        ? 'bg-emerald-500'
        : 'bg-gray-500';
```

**Step 5: Run typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/components/collection/SubscriptionCard.tsx
git commit -m "feat: SubscriptionCard reads data/LLM status from currentPeriodStatus"
```

---

### Task 4: Collection store — Detect LLM completion and refresh subscriptions

**Files:**
- Modify: `frontend/src/stores/collection.store.ts:5-15,23-50`

**Step 1: Add `_onLlmDone` callback to the store interface**

Add to the `CollectionStore` interface (after `_onCollectionDone` at line 9):

```typescript
_onLlmDone: (() => void) | null;
```

Add to the interface methods (after `onCollectionDone` at line 14):

```typescript
onLlmDone: (callback: (() => void) | null) => void;
```

**Step 2: Add initial state and method**

In the `create<CollectionStore>` body, add:

After `_onCollectionDone: null,` (line 21):
```typescript
_onLlmDone: null,
```

After `onCollectionDone` method (lines 68-70):
```typescript
onLlmDone(callback: (() => void) | null) {
  set({ _onLlmDone: callback });
},
```

**Step 3: Add LLM completion detection in `fetchState()`**

Inside `fetchState()`, after the existing collection completion detection (lines 35-39), add:

```typescript
// Detect LLM completion
const wasLlmActive = prevState && prevState.llmQueue.length > 0;
if (wasLlmActive && !llmActive) {
  get()._onLlmDone?.();
}
```

**Step 4: Run typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/stores/collection.store.ts
git commit -m "feat: collection store detects LLM completion for refresh"
```

---

### Task 5: CollectionPage — Wire up LLM completion refresh

**Files:**
- Modify: `frontend/src/pages/CollectionPage.tsx:44-86`

**Step 1: Subscribe to `onLlmDone` from the store**

At line 48, add:

```typescript
const onLlmDone = useCollectionStore((s) => s.onLlmDone);
```

**Step 2: Register LLM done callback**

After the existing `onCollectionDone` useEffect (lines 80-86), add:

```typescript
// Refresh subscriptions when all LLM processing finishes
useEffect(() => {
  onLlmDone(() => {
    loadSubscriptions();
    setLogsRefreshKey((k) => k + 1);
  });
  return () => onLlmDone(null);
}, [onLlmDone, loadSubscriptions]);
```

**Step 3: Run typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/pages/CollectionPage.tsx
git commit -m "feat: refresh subscriptions when LLM processing completes"
```

---

### Task 6: Lint check and final verification

**Files:**
- All modified files

**Step 1: Run backend lint**

Run: `cd backend && npm run lint`
Expected: 0 errors

**Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: 0 errors

**Step 3: Run backend typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

**Step 4: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

**Step 5: Update TESTING.md**

Add the 5 test scenarios from the design doc to TESTING.md under a new section for this feature.

**Step 6: Commit**

```bash
git add TESTING.md
git commit -m "docs: add card actual state test scenarios to TESTING.md"
```
