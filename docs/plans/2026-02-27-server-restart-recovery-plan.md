# Server Restart Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Сделать рестарт сервера незаметным — процессы сбора метрик продолжаются с того на чём прервались, без `failed`/`cancelled`, со стабильными счётчиками на фронте.

**Architecture:** Три recovery-метода в CollectionWorker (LLM → running → pending) + флаг `resume` в QueueTask для бесшовного продолжения счётчиков. LLM worker расширяется для обработки `llmStatus=processing`. Graceful shutdown без изменений (уже работает).

**Tech Stack:** MikroORM, PostgreSQL, TypeScript, Fastify

---

### Task 1: Добавить `resume` в QueueTask

**Files:**
- Modify: `backend/src/modules/collection/collection.state.ts:36-43`

**Step 1: Добавить поле `resume` в интерфейс QueueTask**

В файле `collection.state.ts`, изменить интерфейс `QueueTask`:

```typescript
export interface QueueTask {
  subscriptionId: string;
  logId: string;
  periodStart: Date;
  periodEnd: Date;
  type: 'cron' | 'manual';
  overwrite: boolean;
  resume?: boolean;
}
```

**Step 2: Запустить проверку типов**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок (новое поле опциональное)

**Step 3: Commit**

```bash
git add backend/src/modules/collection/collection.state.ts
git commit -m "feat: add resume flag to QueueTask for restart recovery"
```

---

### Task 2: Переписать recovery в CollectionWorker

**Files:**
- Modify: `backend/src/modules/collection/collection.worker.ts:109-117` (метод `start`)
- Modify: `backend/src/modules/collection/collection.worker.ts:582-655` (метод `recoverInterrupted` → 3 новых метода)

**Step 1: Заменить метод `start()` — новый порядок recovery**

В `collection.worker.ts`, метод `start()` (строка 109):

```typescript
async start(): Promise<void> {
  if (this.isRunning) return;
  this.isRunning = true;
  this.shouldStop = false;
  this.log.info('Collection worker started');

  await this.recoverLlmQueue();
  await this.recoverRunningCollections();
  await this.recoverPendingCollections();
  this.poll();
}
```

**Step 2: Написать метод `recoverLlmQueue()`**

Заменяет часть старого recovery. Находит MetricReport с `llmStatus IN ('pending', 'processing')`, сбрасывает `processing` → `pending`:

```typescript
/**
 * Recovery 1: LLM-очередь.
 * MetricReport с llmStatus 'pending' или 'processing' → вернуть в LLM-очередь.
 * processing → pending (обработка прервалась при рестарте).
 */
private async recoverLlmQueue(): Promise<void> {
  const em = this.orm.em.fork();

  const stuckReports = await em.find(
    MetricReport,
    { llmStatus: { $in: ['pending', 'processing'] } },
    { populate: ['subscription'] },
  );

  if (stuckReports.length === 0) return;

  let resetCount = 0;
  for (const report of stuckReports) {
    if (report.llmStatus === 'processing') {
      report.llmStatus = 'pending';
      resetCount++;
    }
  }

  if (resetCount > 0) {
    await em.flush();
  }

  this.log.info(
    `Recovery: ${stuckReports.length} LLM reports to re-process (${resetCount} reset from processing)`,
  );

  // Не enqueue здесь — LlmWorker.recoverPending() подхватит при своём старте
}
```

**Step 3: Написать метод `recoverRunningCollections()`**

Находит `CollectionLog.status = 'running'`, восстанавливает in-memory state с текущими счётчиками из БД, добавляет в очередь с `resume=true, overwrite=false`:

```typescript
/**
 * Recovery 2: Running YouTrack-сборы.
 * CollectionLog с status='running' → восстановить счётчики, дособрать.
 * Лог остаётся running. Фронт видит те же счётчики, что и до рестарта.
 */
private async recoverRunningCollections(): Promise<void> {
  const em = this.orm.em.fork();

  const runningLogs = await em.find(
    CollectionLog,
    { status: 'running' },
    { populate: ['subscription'] },
  );

  for (const log of runningLogs) {
    if (!log.subscription || !log.periodStart || !log.periodEnd) {
      log.status = 'failed';
      log.error = 'Нет данных подписки при recovery';
      log.completedAt = new Date();
      log.duration = Math.round(
        (log.completedAt.getTime() - log.startedAt.getTime()) / 1000,
      );
      await em.flush();
      continue;
    }

    const totalProgress =
      log.processedEmployees + log.skippedEmployees +
      log.failedEmployees + log.reQueuedEmployees;

    this.log.info(
      `Recovery running: ${log.subscription.projectName}, ` +
      `progress ${totalProgress}/${log.totalEmployees}, ` +
      `period ${formatYTDate(log.periodStart)}..${formatYTDate(log.periodEnd)}`,
    );

    // Восстановить in-memory state с текущими значениями из БД
    collectionState.updateProgress(log.id, {
      subscriptionId: log.subscription.id,
      projectName: log.subscription.projectName,
      status: 'running',
      type: log.type as 'manual' | 'cron',
      processedEmployees: totalProgress,
      totalEmployees: log.totalEmployees,
      skippedEmployees: log.skippedEmployees,
      failedEmployees: log.failedEmployees,
      reQueuedEmployees: log.reQueuedEmployees,
      periodStart: formatYTDate(log.periodStart),
      periodEnd: formatYTDate(log.periodEnd),
      startedAt: log.startedAt.toISOString(),
    });

    // Добавить в очередь — resume=true, overwrite=false
    collectionState.addToQueue({
      subscriptionId: log.subscription.id,
      logId: log.id,
      periodStart: log.periodStart,
      periodEnd: log.periodEnd,
      type: log.type as 'cron' | 'manual',
      overwrite: false,
      resume: true,
    });
  }

  await em.flush();
}
```

**Step 4: Написать метод `recoverPendingCollections()`**

Находит `CollectionLog.status = 'pending'`, добавляет в очередь:

```typescript
/**
 * Recovery 3: Pending сборы.
 * CollectionLog с status='pending' → добавить в очередь.
 * Они просто ждали своей очереди, продолжаем.
 */
private async recoverPendingCollections(): Promise<void> {
  const em = this.orm.em.fork();

  const pendingLogs = await em.find(
    CollectionLog,
    { status: 'pending' },
    { populate: ['subscription'] },
  );

  for (const log of pendingLogs) {
    if (!log.subscription || !log.periodStart || !log.periodEnd) {
      continue;
    }

    this.log.info(
      `Recovery pending: ${log.subscription.projectName}, ` +
      `period ${formatYTDate(log.periodStart)}..${formatYTDate(log.periodEnd)}`,
    );

    collectionState.updateProgress(log.id, {
      subscriptionId: log.subscription.id,
      projectName: log.subscription.projectName,
      status: 'pending',
      type: log.type as 'manual' | 'cron',
      processedEmployees: 0,
      totalEmployees: 0,
      skippedEmployees: 0,
      failedEmployees: 0,
      reQueuedEmployees: 0,
      periodStart: formatYTDate(log.periodStart),
      periodEnd: formatYTDate(log.periodEnd),
      startedAt: log.startedAt.toISOString(),
    });

    collectionState.addToQueue({
      subscriptionId: log.subscription.id,
      logId: log.id,
      periodStart: log.periodStart,
      periodEnd: log.periodEnd,
      type: log.type as 'cron' | 'manual',
      overwrite: log.overwrite,
    });
  }
}
```

**Step 5: Удалить старый метод `recoverInterrupted()`**

Удалить полностью строки 582-655 (метод `recoverInterrupted`). Он заменён тремя новыми методами выше.

**Step 6: Запустить проверку типов**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 7: Commit**

```bash
git add backend/src/modules/collection/collection.worker.ts
git commit -m "feat: replace recoverInterrupted with seamless 3-phase recovery"
```

---

### Task 3: Модифицировать processTask для resume

**Files:**
- Modify: `backend/src/modules/collection/collection.worker.ts:163-213` (метод `processTask`)

**Step 1: Добавить проверку `task.resume` в processTask**

При `resume=true`: не менять статус лога (уже running), не сбрасывать счётчики:

```typescript
private async processTask(task: QueueTask): Promise<void> {
  const em = this.orm.em.fork();
  const startStr = formatYTDate(task.periodStart);
  const endStr = formatYTDate(task.periodEnd);

  const subscription = await em.findOne(
    Subscription,
    { id: task.subscriptionId },
    { populate: ['employees', 'fieldMapping'] },
  );

  if (!subscription) {
    this.log.warn(`Subscription ${task.subscriptionId} not found, skipping task`);
    collectionState.removeProgress(task.logId);
    return;
  }

  // Reuse the existing CollectionLog
  const log = await em.findOne(CollectionLog, { id: task.logId });
  if (!log) {
    this.log.warn(`CollectionLog ${task.logId} not found, skipping task`);
    collectionState.removeProgress(task.logId);
    return;
  }

  if (!task.resume) {
    // Свежая задача — штатный запуск
    log.status = 'running';
    await em.flush();
  }
  // resume=true → лог уже running в БД, не трогаем

  const logId = task.logId;

  this.log.info(
    `Collection ${task.resume ? 'resumed' : 'started'}: ${subscription.projectName}, period ${startStr}..${endStr}`,
  );

  if (!task.resume) {
    // Свежая задача — сбросить счётчики
    collectionState.updateProgress(logId, {
      subscriptionId: subscription.id,
      projectName: subscription.projectName,
      status: 'running',
      type: task.type,
      processedEmployees: 0,
      totalEmployees: 0,
      skippedEmployees: 0,
      failedEmployees: 0,
      reQueuedEmployees: 0,
      periodStart: startStr,
      periodEnd: endStr,
      startedAt: new Date().toISOString(),
    });
  }
  // resume=true → счётчики уже восстановлены в recoverRunningCollections

  await this.collectForSubscription(subscription, task.periodStart, task.periodEnd, logId, em, task.overwrite, task.resume);
}
```

**Step 2: Запустить проверку типов**

Run: `cd backend && npx tsc --noEmit`
Expected: Ошибка — `collectForSubscription` ещё не принимает параметр `resume` (исправим в Task 4)

**Step 3: Commit (вместе с Task 4)**

---

### Task 4: Модифицировать collectForSubscription для resume

**Files:**
- Modify: `backend/src/modules/collection/collection.worker.ts:215-543` (метод `collectForSubscription`)

**Step 1: Добавить параметр `resume` в сигнатуру**

```typescript
private async collectForSubscription(
  subscription: Subscription,
  periodStart: Date,
  periodEnd: Date,
  logId: string,
  em: EntityManager,
  overwrite = false,
  resume = false,
): Promise<void> {
```

**Step 2: Инициализировать счётчики из БД при resume**

Заменить блок инициализации счётчиков (после строки с `collectionState.updateProgress`):

```typescript
  const collectionLog = await em.findOneOrFail(CollectionLog, { id: logId });

  // При resume — инициализировать счётчики из БД (бесшовное продолжение)
  let processedCount = resume ? collectionLog.processedEmployees : 0;
  let skippedCount = resume ? collectionLog.skippedEmployees : 0;
  let failedCount = resume ? collectionLog.failedEmployees : 0;
  let reQueuedCount = resume ? collectionLog.reQueuedEmployees : 0;
```

Также при resume не обновлять totalEmployees (уже в БД):

```typescript
  if (!resume) {
    collectionLog.totalEmployees = activeEmployees.length;
    await em.flush();

    collectionState.updateProgress(logId, {
      totalEmployees: totalUnits > activeEmployees.length ? totalUnits : activeEmployees.length,
      totalWeeks: totalWeeks > 1 ? totalWeeks : undefined,
    });
  }
```

**Step 3: При resume — молча пропускать уже собранных**

В начало цикла `for (const employee of activeEmployees)`, сразу после проверки `isCancelled/isStopping`, ПЕРЕД текущей логикой `overwrite`, добавить:

```typescript
        // Resume: молча пропустить уже собранных (не инкрементить счётчики)
        if (resume) {
          const existingReport = await em.findOne(MetricReport, {
            subscription,
            youtrackLogin: employee.youtrackLogin,
            periodStart: week.start,
          });
          if (existingReport) {
            continue;
          }
        }
```

Этот блок должен быть ПЕРЕД существующим блоком `if (!overwrite) { ... }`.

**Step 4: Запустить проверку типов**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 5: Commit**

```bash
git add backend/src/modules/collection/collection.worker.ts
git commit -m "feat: processTask and collectForSubscription support resume mode"
```

---

### Task 5: Расширить LLM worker recovery

**Files:**
- Modify: `backend/src/modules/llm/llm.worker.ts:294-328` (метод `recoverPending`)

**Step 1: Расширить поиск — включить `llmStatus=processing`**

Заменить метод `recoverPending()`:

```typescript
private async recoverPending(): Promise<void> {
  const em = this.orm.em.fork();

  // Найти отчёты с llmStatus 'pending' или 'processing'
  // processing → прервался при рестарте, нужно повторить
  const pendingReports = await em.find(
    MetricReport,
    {
      llmStatus: { $in: ['pending', 'processing'] },
      totalIssues: { $gt: 0 },  // Не отправлять пустые в LLM
    },
    { populate: ['subscription'] },
  );

  if (pendingReports.length === 0) return;

  // Сбросить processing → pending
  let resetCount = 0;
  for (const report of pendingReports) {
    if (report.llmStatus === 'processing') {
      report.llmStatus = 'pending';
      resetCount++;
    }
  }
  if (resetCount > 0) {
    await em.flush();
  }

  this.log.info(
    `LLM worker: recovering ${pendingReports.length} reports (${resetCount} reset from processing)`,
  );

  for (const report of pendingReports) {
    // Найти имя сотрудника
    const employee = await em.findOne(SubscriptionEmployee, {
      subscription: report.subscription,
      youtrackLogin: report.youtrackLogin,
    });

    const sub = await em.findOne(Subscription, { id: report.subscription.id });

    // Найти collectionLogId для привязки LLM-счётчиков
    const relatedLog = await em.findOne(
      CollectionLog,
      {
        subscription: report.subscription,
        periodStart: report.periodStart,
        status: { $nin: ['cancelled', 'failed'] },
      },
      { orderBy: { createdAt: 'DESC' } },
    );

    this.enqueue({
      reportId: report.id,
      subscriptionId: report.subscription.id,
      collectionLogId: relatedLog?.id,
      youtrackLogin: report.youtrackLogin,
      employeeName: employee?.displayName ?? report.youtrackLogin,
      projectName: sub?.projectName ?? 'Unknown',
      taskSummaries: [], // Недоступны после recovery
    });
  }
}
```

**Step 2: Запустить проверку типов**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 3: Commit**

```bash
git add backend/src/modules/llm/llm.worker.ts
git commit -m "feat: LLM recovery handles processing status and restores collectionLogId"
```

---

### Task 6: Убрать дублирование LLM recovery из CollectionWorker

**Files:**
- Modify: `backend/src/modules/collection/collection.worker.ts` (метод `recoverLlmQueue`)

**Step 1: Упростить recoverLlmQueue**

Метод `recoverLlmQueue` в CollectionWorker только сбрасывает `processing → pending` в БД.
Фактический enqueue в очередь делает `LlmWorker.recoverPending()` при своём старте.

Текущий код `recoverLlmQueue` (из Task 2) уже правильный — он НЕ enqueue-ит, только reset-ит statuses. Проверить что всё совместимо.

**Step 2: Проверить порядок bootstrap в server.ts**

В `server.ts`, текущий порядок:
1. `worker.start()` → вызывает `recoverLlmQueue()` (reset processing → pending)
2. `llmService.initialize()` → `llmWorker.start()` → `recoverPending()` (enqueue)

Это правильный порядок: сначала reset в БД, потом enqueue. Никаких изменений в `server.ts` не нужно.

**Step 3: Запустить проверку типов**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 4: Commit (если были изменения)**

---

### Task 7: Lint + TypeCheck + финальная проверка

**Files:**
- All modified files

**Step 1: Запустить lint**

Run: `cd backend && npm run lint`
Expected: 0 ошибок

**Step 2: Запустить TypeCheck**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 3: Финальный commit (если lint потребовал правки)**

```bash
git add -A
git commit -m "fix: lint fixes for restart recovery"
```

---

### Task 8: Обновить TESTING.md

**Files:**
- Modify: `TESTING.md`

**Step 1: Добавить сценарии тестирования restart recovery**

Добавить в TESTING.md секцию:

```markdown
## Restart Recovery

### Тест 1: Рестарт во время YouTrack-сбора
1. Запустить сбор 5 недель × 3 сотрудника
2. Дождаться ~50% (1-2 сотрудника обработаны)
3. `kill -9` процесс сервера
4. Перезапустить сервер
5. Проверить: фронт показывает тот же прогресс, что и до рестарта
6. Дождаться завершения: completed 15/15

### Тест 2: Рестарт во время LLM-анализа
1. Запустить сбор, дождаться YouTrack 100%
2. Дождаться LLM ~5/15
3. `kill -9` процесс сервера
4. Перезапустить
5. Проверить: LLM продолжает с 6-го
6. Финал: 15/15 analyzed

### Тест 3: Рестарт с pending логами
1. Запустить сбор для 3 проектов → первый running, остальные pending
2. `kill -9`
3. Перезапустить → все три в очереди
4. Результат: все три completed

### Тест 4: Чистый старт
1. Перезапустить без зависших процессов
2. В логах: "Recovery: 0 LLM reports", нет running/pending
3. Ничего не происходит

### Тест 5: Двойной рестарт
1. `kill -9` → старт → `kill -9` → старт
2. Данные не дублируются (MetricReport unique constraint)
3. Процесс продолжается штатно
```

**Step 2: Commit**

```bash
git add TESTING.md
git commit -m "docs: add restart recovery test scenarios"
```
