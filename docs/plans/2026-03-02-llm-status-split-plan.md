# LLM Status Split + Overwrite Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Разделить статус `skipped` на `skipped` (отмена пользователем) и `no_data` (нет задач за период), чтобы фронтенд показывал корректную причину. Проверить и зафиксировать логику overwrite.

**Architecture:** Новое значение `no_data` добавляется в поле `llm_status` (varchar, без enum constraint). Миграция обновляет существующие записи. Бэкенд разделяет пути записи. Фронтенд отображает разные иконки/тексты.

**Tech Stack:** MikroORM + PostgreSQL (миграции), TypeScript (backend + frontend), React (компоненты)

---

## Task 1: Миграция БД — добавить статус no_data

**Files:**
- Create: `backend/src/migrations/Migration20260302000000_llm_status_no_data.ts`

**Step 1: Создать миграцию**

```typescript
import { Migration } from '@mikro-orm/migrations';

export class Migration20260302000000_llm_status_no_data extends Migration {
  override async up(): Promise<void> {
    // Перевести skipped → no_data для отчётов где причина = нет данных
    this.addSql(`
      UPDATE metric_reports
      SET llm_status = 'no_data'
      WHERE llm_status = 'skipped' AND total_issues = 0;
    `);
  }

  override async down(): Promise<void> {
    // Откатить: no_data → skipped
    this.addSql(`
      UPDATE metric_reports
      SET llm_status = 'skipped'
      WHERE llm_status = 'no_data';
    `);
  }
}
```

**Step 2: Применить миграцию к dev-базе**

Run: `cd backend && npx mikro-orm migration:up`
Expected: миграция применена, записи с `total_issues = 0` получили `llm_status = 'no_data'`

**Step 3: Проверить результат в БД**

Run: `docker exec devpulse-postgres psql -U devpulse -d devpulse -c "SELECT llm_status, COUNT(*) FROM metric_reports GROUP BY llm_status ORDER BY llm_status;"`
Expected: Появилась строка `no_data` с количеством записей, `skipped` уменьшился

**Step 4: Commit**

```bash
git add backend/src/migrations/Migration20260302000000_llm_status_no_data.ts
git commit -m "feat(db): add llm_status 'no_data' for reports with zero issues"
```

---

## Task 2: Backend entity и типы — обновить комментарии и union types

**Files:**
- Modify: `backend/src/entities/metric-report.entity.ts:125`
- Modify: `backend/src/modules/collection/collection.service.ts:604`
- Modify: `backend/src/modules/reports/reports.types.ts:47`

**Step 1: Обновить комментарий в entity**

В `backend/src/entities/metric-report.entity.ts:125`:

```typescript
// До:
// LLM status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'

// После:
// LLM status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'no_data'
```

**Step 2: Обновить union type в getLogDetails**

В `backend/src/modules/collection/collection.service.ts:604`:

```typescript
// До:
llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

// После:
llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'no_data';
```

И в строке 673:
```typescript
// До:
let llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

// После:
let llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'no_data';
```

**Step 3: Commit**

```bash
git add backend/src/entities/metric-report.entity.ts backend/src/modules/collection/collection.service.ts
git commit -m "feat(types): add 'no_data' to llmStatus union types"
```

---

## Task 3: collection.worker.ts — разделить skipped и no_data

**Files:**
- Modify: `backend/src/modules/collection/collection.worker.ts:338,437`

**Step 1: Строка 338 — при overwrite=false, пропускать и no_data отчёты**

```typescript
// До (строка 338):
if (existingReport.llmStatus === 'completed') {

// После:
if (existingReport.llmStatus === 'completed' || existingReport.llmStatus === 'no_data') {
```

Логика: если отчёт уже `completed` или `no_data`, при обычном сборе (overwrite=false) пропускаем. Повторно отправлять в LLM пустой отчёт нет смысла.

**Step 2: Строка 437 — hasNoData теперь ставит no_data**

```typescript
// До (строка 437):
report.llmStatus = hasNoData ? 'skipped' : 'pending';

// После:
report.llmStatus = hasNoData ? 'no_data' : 'pending';
```

**Step 3: Commit**

```bash
git add backend/src/modules/collection/collection.worker.ts
git commit -m "feat(collection): use 'no_data' instead of 'skipped' for empty reports"
```

---

## Task 4: llm.worker.ts — обработка no_data

**Files:**
- Modify: `backend/src/modules/llm/llm.worker.ts:130,145`

**Step 1: Строка 130 — проверка обоих статусов**

```typescript
// До (строка 130):
if (report.llmStatus === 'skipped') {

// После:
if (report.llmStatus === 'skipped' || report.llmStatus === 'no_data') {
```

**Step 2: Строка 145 — totalIssues === 0 ставит no_data**

```typescript
// До (строка 145):
report.llmStatus = 'skipped';

// После:
report.llmStatus = 'no_data';
```

**Step 3: Строка 147 — обновить счётчик**

Вызов `updateCollectionLogLlm` на строке 147 уже использует `'llmSkipped'`. Нам нужно решить: должен ли `no_data` инкрементировать `llmSkipped` или нет?

Решение: Да, `no_data` инкрементирует тот же счётчик `llmSkipped` (он считает «не анализировано LLM», что справедливо для обоих причин). Разделять счётчики в CollectionLog — избыточно. Без изменений.

**Step 4: Commit**

```bash
git add backend/src/modules/llm/llm.worker.ts
git commit -m "feat(llm-worker): handle 'no_data' status alongside 'skipped'"
```

---

## Task 5: subscriptions.service.ts — SQL-запрос подсчёта

**Files:**
- Modify: `backend/src/modules/subscriptions/subscriptions.service.ts:100-104`

**Step 1: Добавить COUNT для no_data**

```sql
-- До (строка 104):
COUNT(*) FILTER (WHERE mr.llm_status = 'skipped')::text AS llm_skipped

-- После:
COUNT(*) FILTER (WHERE mr.llm_status = 'skipped')::text AS llm_skipped,
COUNT(*) FILTER (WHERE mr.llm_status = 'no_data')::text AS llm_no_data
```

**Step 2: Обновить маппинг в том же файле**

Найти где строка `llm_skipped` парсится и добавить `llm_no_data`. Это примерно строки 150-155:

```typescript
// Добавить:
llmNoData: parseInt(periodRow.llm_no_data, 10),
```

**Step 3: Обновить интерфейс row-результата SQL-запроса**

В том же файле (примерно строка 69) добавить поле `llm_no_data: string` к интерфейсу row.

**Step 4: Commit**

```bash
git add backend/src/modules/subscriptions/subscriptions.service.ts
git commit -m "feat(subscriptions): count 'no_data' separately in period status SQL"
```

---

## Task 6: Frontend типы — обновить

**Files:**
- Modify: `frontend/src/types/collection.ts:126`
- Modify: `frontend/src/types/subscription.ts:1-10`

**Step 1: EmployeeDetail.llmStatus — добавить no_data**

В `frontend/src/types/collection.ts:126`:

```typescript
// До:
llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

// После:
llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'no_data';
```

**Step 2: CurrentPeriodStatus — добавить llmNoData**

В `frontend/src/types/subscription.ts`, после строки 9:

```typescript
// Добавить:
llmNoData: number;
```

**Step 3: Commit**

```bash
git add frontend/src/types/collection.ts frontend/src/types/subscription.ts
git commit -m "feat(frontend-types): add 'no_data' to llmStatus and subscription types"
```

---

## Task 7: CollectionLogs.tsx — разное отображение статусов

**Files:**
- Modify: `frontend/src/components/collection/CollectionLogs.tsx`

**Step 1: getLlmSection — подсчёт no_data (после строки 262)**

```typescript
// Добавить после строки 262:
const noData = employees.filter((e) => e.llmStatus === 'no_data').length;
```

**Step 2: getLlmSection — обновить логику секции**

Строка 283 — «Все с данными — completed» должен учитывать no_data:
```typescript
// До (строка 283):
if (completed === withData && failed === 0) {

// После:
if (completed + noData === withData && failed === 0 && skipped === 0) {
```

Строки 307-318 — Частично. `no_data` не должен считаться за «отменены»:
```typescript
// До (строка 308):
if (completed > 0 && (failed > 0 || skipped > 0)) {
  const extras: string[] = [];
  if (failed > 0) extras.push(`${failed} на формулах`);
  if (skipped > 0) extras.push(`${skipped} отменены`);

// После:
if (completed > 0 && (failed > 0 || skipped > 0)) {
  const extras: string[] = [];
  if (failed > 0) extras.push(`${failed} на формулах`);
  if (skipped > 0) extras.push(`${skipped} отменены`);
  if (noData > 0) extras.push(`${noData} без задач`);
```

Строки 320-323 — «Все skipped». Добавить отдельную ветку для all no_data:
```typescript
// Добавить ПЕРЕД строкой 320:
if (noData === withData) {
  return { icon: 'ℹ️', label: 'Нет задач за период', description: '', subtext };
}
```

**Step 3: getEmployeeRowInfo — строка 347-348**

```typescript
// До (строки 347-348):
if (emp.llmStatus === 'skipped') {
  return { icon: '⚠️', text: 'данные ✅  LLM ⏹ отменён' };
}

// После:
if (emp.llmStatus === 'no_data') {
  return { icon: 'ℹ️', text: 'данные ✅  LLM — нет задач' };
}
if (emp.llmStatus === 'skipped') {
  return { icon: '⚠️', text: 'данные ✅  LLM ⏹ отменён' };
}
```

**Step 4: Commit**

```bash
git add frontend/src/components/collection/CollectionLogs.tsx
git commit -m "feat(ui): distinguish 'no_data' from 'skipped' in collection logs"
```

---

## Task 8: LlmSummaryBlock.tsx — обновить отображение

**Files:**
- Modify: `frontend/src/components/employees/LlmSummaryBlock.tsx:66`

**Step 1: Добавить ветку для no_data**

```typescript
// До (строка 66):
} else if (llmStatus === 'skipped') {
  message = 'Нет данных для анализа за этот период.';
}

// После:
} else if (llmStatus === 'no_data' || llmStatus === 'skipped') {
  message = 'Нет данных для анализа за этот период.';
}
```

Здесь оба статуса показывают одно и то же сообщение, т.к. на странице сотрудника нет контекста «отмены». Если нужно различать — можно добавить, но UX одинаковый.

**Step 2: Commit**

```bash
git add frontend/src/components/employees/LlmSummaryBlock.tsx
git commit -m "feat(ui): handle 'no_data' in LLM summary block"
```

---

## Task 9: Проверка overwrite-логики

**Files:**
- Review: `backend/src/modules/collection/collection.worker.ts:331-375,437`

**Step 1: Верификация**

Проверить что при `overwrite=true`:

1. Блок `if (!overwrite)` (строки 331-375) полностью пропускается — ✅ уже работает
2. YouTrack данные пересобираются для всех сотрудников — ✅ уже работает
3. MetricReport upsert перезаписывает данные (строки 394-442) — ✅ уже работает
4. `llmStatus` устанавливается: `hasNoData ? 'no_data' : 'pending'` — ✅ после Task 3
5. Reports с данными добавляются в `collectedReports` → LLM-очередь — ✅ уже работает

Текущая логика overwrite корректна. Дополнительных изменений не требуется после Task 3, Step 2.

**Step 2: Документировать решение**

Добавить комментарий в collection.worker.ts на строке 331:

```typescript
// Skip if report already exists and overwrite is false.
// When overwrite=true, this block is skipped entirely — all employees
// get fresh YouTrack collection and new llmStatus (pending or no_data).
```

**Step 3: Commit**

```bash
git add backend/src/modules/collection/collection.worker.ts
git commit -m "docs(collection): clarify overwrite skip logic"
```

---

## Task 10: Финальная проверка TypeScript + build

**Step 1: Проверить backend**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 2: Проверить frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 3: Если ошибки — исправить пропущенные места**

Любое место, ссылающееся на `'skipped'` в контексте llmStatus, может потребовать добавления `'no_data'`. Типичные случаи:
- switch/case по llmStatus
- Сравнение === 'skipped' где нужно также учитывать 'no_data'
- Типы union без 'no_data'

**Step 4: Финальный commit**

```bash
git add -A
git commit -m "fix: resolve any remaining TypeScript errors for no_data status"
```
