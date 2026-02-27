# Design: Card Shows Actual Data State (Not Last Log)

## Problem

SubscriptionCard displays data/LLM status from the most recent `CollectionLog`. After multiple partial collection runs, this misrepresents reality:

- **Data line**: Shows "2/3" from last log, but 3/3 MetricReports actually exist
- **LLM line**: Shows "Cancelled" from old log state, but reports are pending LLM processing

## Solution

Query `MetricReport` table directly for real counts per period. Embed `currentPeriodStatus` in the existing `GET /api/subscriptions` response.

## Changes

### 1. Backend: `listSubscriptions()` in `subscriptions.service.ts`

After fetching subscriptions, run one aggregate query on `metric_reports`:

```sql
SELECT subscription_id,
       COUNT(*) as data_collected,
       COUNT(*) FILTER (WHERE llm_status = 'completed') as llm_completed,
       COUNT(*) FILTER (WHERE llm_status = 'pending') as llm_pending,
       COUNT(*) FILTER (WHERE llm_status = 'processing') as llm_processing,
       COUNT(*) FILTER (WHERE llm_status = 'failed') as llm_failed,
       COUNT(*) FILTER (WHERE llm_status = 'skipped') as llm_skipped
FROM metric_reports
WHERE subscription_id IN (:ids)
  AND period_start = :periodStart
GROUP BY subscription_id
```

Period resolution: current week Monday. If no data for current week, fallback to latest `period_start` per subscription.

Response adds `currentPeriodStatus` field:

```json
{
  "currentPeriodStatus": {
    "periodStart": "2026-02-23",
    "totalEmployees": 3,
    "dataCollected": 3,
    "llmCompleted": 1,
    "llmPending": 2,
    "llmProcessing": 0,
    "llmFailed": 0,
    "llmSkipped": 0
  }
}
```

`lastCollection` kept as-is for "last run date" display.

### 2. Frontend types

Add `CurrentPeriodStatus` to `subscription.ts`. Extend `Subscription` with `currentPeriodStatus: CurrentPeriodStatus | null`.

### 3. SubscriptionCard display logic

- **Data line**: Active collection running -> live polling progress. Otherwise -> `currentPeriodStatus.dataCollected / totalEmployees`.
- **LLM line**: `llmSubscriptionStatus` has active items -> live progress. Otherwise -> `currentPeriodStatus.llmCompleted / dataCollected`.
- **"Last collection" date**: Still from `lastCollection.completedAt`.

### 4. LLM completion refresh

When LLM queue transitions from non-empty to empty, call `loadSubscriptions()` to refresh `currentPeriodStatus` with final LLM counts.

### 5. Period resolution

- Current week = Monday of current ISO week
- If no MetricReports for current week -> use latest `period_start` found for that subscription
- Returns `null` if no MetricReports exist at all

## Test Scenarios

1. Two partial runs -> card shows cumulative "3/3" not last run's "2/3"
2. LLM progress updates in real-time via polling, then static from `currentPeriodStatus`
3. Partial data (YouTrack error) -> "Partially (2/3)"
4. Page reload -> correct state immediately from `currentPeriodStatus`
5. New subscription with no collections -> no data/LLM lines shown
