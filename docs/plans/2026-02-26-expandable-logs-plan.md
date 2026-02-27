# Раскрывающиеся логи — План реализации

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Переработать таблицу логов сборов: свёрнутый вид — компактная строка, по клику — accordion с детальной информацией по YouTrack, LLM и каждому сотруднику.

**Architecture:** Новые поля `youtrackDuration`/`llmDuration` в CollectionLog entity + миграция. Новый API endpoint `GET /logs/:logId/details` собирает данные из CollectionLog + MetricReport. Фронт: переписанный CollectionLogs с accordion, lazy-load деталей, кэш, описания формируются на фронте.

**Tech Stack:** MikroORM, Fastify, React, Tailwind CSS, TypeScript

---

### Task 1: Миграция — youtrackDuration и llmDuration

**Files:**
- Create: `backend/src/migrations/Migration20260226200000_collection_log_durations.ts`
- Modify: `backend/src/entities/collection-log.entity.ts:76-77` (добавить поля)

**Step 1: Создать миграцию**

```typescript
// backend/src/migrations/Migration20260226200000_collection_log_durations.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260226200000_collection_log_durations extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "collection_logs"
        add column if not exists "youtrack_duration" int not null default 0,
        add column if not exists "llm_duration" int not null default 0;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "collection_logs"
        drop column if exists "youtrack_duration",
        drop column if exists "llm_duration";
    `);
  }
}
```

**Step 2: Добавить поля в entity**

В `backend/src/entities/collection-log.entity.ts`, после строки `duration`:

```typescript
  @Property({ default: 0 })
  youtrackDuration: number = 0;

  @Property({ default: 0 })
  llmDuration: number = 0;
```

**Step 3: Запустить миграцию**

Run: `cd backend && npx mikro-orm migration:up`

**Step 4: Проверить типы**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

**Step 5: Коммит**

```
feat: add youtrackDuration/llmDuration fields to CollectionLog
```

---

### Task 2: Воркер — записать youtrackDuration

**Files:**
- Modify: `backend/src/modules/collection/collection.worker.ts`

**Step 1: Записать youtrackDuration при финализации YouTrack-фазы**

В методе `collectForSubscription`, перед блоком `// Finalize` (строка ~485), после завершения циклов `for`, вычислить youtrackDuration:

```typescript
    // YouTrack phase duration: from startedAt to now (before LLM enqueue)
    const youtrackEndTime = new Date();
    collectionLog.youtrackDuration = Math.round(
      (youtrackEndTime.getTime() - collectionLog.startedAt.getTime()) / 1000,
    );
```

Добавить это ПЕРЕД строкой `collectionLog.completedAt = new Date();` в блоке Finalize.

**Step 2: Проверить типы**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

**Step 3: Коммит**

```
feat: record youtrackDuration in collection worker
```

---

### Task 3: LLM воркер — записать llmDuration

**Files:**
- Modify: `backend/src/modules/llm/llm.worker.ts`

**Step 1: Обновить updateCollectionLogLlm для вычисления llmDuration**

В методе `updateCollectionLogLlm` в `llm.worker.ts`, после инкремента счётчика, проверить завершение всех LLM-задач и записать `llmDuration`:

```typescript
  private async updateCollectionLogLlm(
    em: EntityManager,
    collectionLogId: string | undefined,
    field: 'llmCompleted' | 'llmFailed' | 'llmSkipped',
  ): Promise<void> {
    if (!collectionLogId) return;
    try {
      const log = await em.findOne(CollectionLog, { id: collectionLogId });
      if (log) {
        log[field]++;

        // Check if all LLM tasks are done → record llmDuration
        const done = log.llmCompleted + log.llmFailed + log.llmSkipped;
        if (log.llmTotal > 0 && done >= log.llmTotal && log.llmDuration === 0) {
          // llmDuration = time since YouTrack phase ended (completedAt) to now
          const llmEndTime = new Date();
          if (log.completedAt) {
            log.llmDuration = Math.round(
              (llmEndTime.getTime() - log.completedAt.getTime()) / 1000,
            );
          }
        }

        await em.flush();
      }
    } catch (err) {
      this.log.warn(`Failed to update CollectionLog LLM counter: ${(err as Error).message}`);
    }
  }
```

**Step 2: Проверить типы**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

**Step 3: Коммит**

```
feat: record llmDuration in LLM worker when all tasks complete
```

---

### Task 4: API endpoint — GET /logs/:logId/details

**Files:**
- Modify: `backend/src/modules/collection/collection.service.ts` (добавить метод)
- Modify: `backend/src/modules/collection/collection.routes.ts` (добавить route)

**Step 1: Добавить метод getLogDetails в CollectionService**

В конец класса `CollectionService` (перед `private` методами):

```typescript
  /**
   * Детали лога для развёрнутого вида: информация по каждому сотруднику.
   */
  async getLogDetails(
    logId: string,
    ownerId: string,
  ): Promise<{
    logId: string;
    startedAt: string;
    completedAt: string | null;
    overwrite: boolean;
    youtrackDuration: number;
    llmDuration: number;
    employees: Array<{
      login: string;
      displayName: string;
      dataStatus: 'collected' | 'failed' | 'stopped' | 'skipped';
      llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
      error: string | null;
    }>;
  }> {
    const log = await this.em.findOne(
      CollectionLog,
      { id: logId },
      { populate: ['subscription'] },
    );
    if (!log || !log.subscription) {
      throw new NotFoundError('Collection log not found');
    }

    // Verify ownership
    const sub = await this.em.findOne(Subscription, {
      id: log.subscription.id,
      ownerId,
    });
    if (!sub) throw new NotFoundError('Collection log not found');

    // Get active employees for this subscription
    const employees = await this.em.find(
      SubscriptionEmployee,
      { subscription: sub, isActive: true },
      { orderBy: { displayName: 'ASC' } },
    );

    // Get MetricReports for this period
    const reports = log.periodStart && log.periodEnd
      ? await this.em.find(MetricReport, {
          subscription: sub,
          periodStart: log.periodStart,
          periodEnd: log.periodEnd,
        })
      : [];

    const reportByLogin = new Map<string, MetricReport>();
    for (const r of reports) {
      reportByLogin.set(r.youtrackLogin, r);
    }

    // Build error map from log.errors
    const errorByLogin = new Map<string, string>();
    for (const err of log.errors) {
      errorByLogin.set(err.login, err.error);
    }

    const isStopped = log.status === 'stopped';
    const isSkipped = log.status === 'skipped';

    const employeeDetails = employees.map((emp) => {
      const report = reportByLogin.get(emp.youtrackLogin);
      const error = errorByLogin.get(emp.youtrackLogin) ?? null;

      let dataStatus: 'collected' | 'failed' | 'stopped' | 'skipped';
      if (error) {
        dataStatus = 'failed';
      } else if (report) {
        dataStatus = 'collected';
      } else if (isStopped) {
        dataStatus = 'stopped';
      } else if (isSkipped) {
        dataStatus = 'skipped';
      } else {
        dataStatus = 'skipped';
      }

      let llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
      if (report) {
        llmStatus = report.llmStatus as typeof llmStatus;
      } else if (isStopped) {
        llmStatus = 'skipped';
      } else {
        llmStatus = 'skipped';
      }

      return {
        login: emp.youtrackLogin,
        displayName: emp.displayName,
        dataStatus,
        llmStatus,
        error,
      };
    });

    return {
      logId: log.id,
      startedAt: log.startedAt.toISOString(),
      completedAt: log.completedAt?.toISOString() ?? null,
      overwrite: log.overwrite,
      youtrackDuration: log.youtrackDuration,
      llmDuration: log.llmDuration,
      employees: employeeDetails,
    };
  }
```

Не забыть добавить import `SubscriptionEmployee` в начале файла:

```typescript
import { SubscriptionEmployee } from '../../entities/subscription-employee.entity';
```

**Step 2: Добавить route**

В `collection.routes.ts`, после route `GET /collection/logs`, добавить:

```typescript
  // GET /api/collection/logs/:logId/details
  app.get<{ Params: { logId: string } }>('/collection/logs/:logId/details', async (request) => {
    const em = request.orm.em.fork();
    const service = new CollectionService(em);
    return service.getLogDetails(request.params.logId, request.user.id);
  });
```

**Step 3: Проверить типы**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

**Step 4: Коммит**

```
feat: add GET /logs/:logId/details endpoint for expanded log view
```

---

### Task 5: Фронтенд — типы и API

**Files:**
- Modify: `frontend/src/types/collection.ts`
- Modify: `frontend/src/api/endpoints/collection.ts`

**Step 1: Добавить типы LogDetails**

В `frontend/src/types/collection.ts`, перед `export type LogGroupBy`:

```typescript
export interface EmployeeDetail {
  login: string;
  displayName: string;
  dataStatus: 'collected' | 'failed' | 'stopped' | 'skipped';
  llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  error: string | null;
}

export interface LogDetails {
  logId: string;
  startedAt: string;
  completedAt: string | null;
  overwrite: boolean;
  youtrackDuration: number;
  llmDuration: number;
  employees: EmployeeDetail[];
}
```

**Step 2: Обновить LogGroupBy — убрать 'project'**

```typescript
export type LogGroupBy = 'date' | 'period';
```

**Step 3: Добавить API метод**

В `frontend/src/api/endpoints/collection.ts`, добавить import `LogDetails` и метод:

```typescript
  async getLogDetails(logId: string): Promise<LogDetails> {
    const response = await apiClient.get<LogDetails>(`/collection/logs/${logId}/details`);
    return response.data;
  },
```

**Step 4: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors (кроме ошибок в CollectionLogs.tsx из-за удаления 'project' из LogGroupBy — это нормально, исправим в Task 6)

**Step 5: Коммит**

```
feat: add LogDetails types and API method, remove 'project' grouping
```

---

### Task 6: Фронтенд — переписать CollectionLogs.tsx

**Files:**
- Modify: `frontend/src/components/collection/CollectionLogs.tsx` (полная переработка)

**Step 1: Переписать компонент**

Полная замена содержимого `CollectionLogs.tsx`. Ключевые изменения:

1. **GROUP_OPTIONS** — убрать `'project'`, оставить `'date'` и `'period'`
2. **Свёрнутый вид** — убрать колонку "Время", все строки кликабельны (не только с ошибками)
3. **LogRow** — при клике lazy-load `/logs/:logId/details`, кэш в `detailsCache` (Map в state)
4. **LogDetailPanel** — новый компонент: 3 блока (общая инфо, YouTrack, LLM) + таблица сотрудников
5. **Описания** — функции `getYoutrackSummary()` и `getLlmSummary()` формируют текст из данных

Полный код — в отдельном шаге ниже.

**Step 2: Описательные функции (написать в начале файла)**

```typescript
function getYoutrackStatusIcon(log: CollectionLogEntry, employees: EmployeeDetail[]): string {
  const collected = employees.filter(e => e.dataStatus === 'collected').length;
  const failed = employees.filter(e => e.dataStatus === 'failed').length;
  const stopped = employees.filter(e => e.dataStatus === 'stopped').length;
  const skipped = employees.filter(e => e.dataStatus === 'skipped').length;
  const total = employees.length;

  if (log.status === 'stopped') return '⏹';
  if (failed > 0 && collected > 0) return '⚠️';
  if (failed === total) return '❌';
  if (skipped === total) return 'ℹ️';
  if (collected === total || (collected + skipped === total && collected > 0)) return '✅';
  return '✅';
}

function getYoutrackDescription(log: CollectionLogEntry, employees: EmployeeDetail[]): string {
  const total = employees.length;
  const collected = employees.filter(e => e.dataStatus === 'collected').length;
  const failed = employees.filter(e => e.dataStatus === 'failed').length;
  const stopped = employees.filter(e => e.dataStatus === 'stopped').length;
  const skipped = employees.filter(e => e.dataStatus === 'skipped').length;

  if (log.status === 'stopped') {
    return `Сбор остановлен пользователем. ${collected} обработан, ${stopped} не начаты. Данные обработанных сохранены. LLM-задачи отменены.`;
  }
  if (skipped === total) {
    return 'Все сотрудники уже имеют данные за этот период. YouTrack не запрашивался.';
  }
  if (collected === total) {
    return `Все ${total} сотрудника обработаны успешно.`;
  }
  if (failed > 0) {
    const failedNames = employees.filter(e => e.dataStatus === 'failed').map(e => e.displayName);
    return `${collected} обработаны. ${failed} ошибка: ${failedNames.join(', ')}. Запустите сбор повторно, необработанные будут досбирáны.`;
  }
  if (collected + skipped === total && collected > 0) {
    return `${collected} обработаны, ${skipped} пропущены (данные актуальны).`;
  }
  return '';
}

function getLlmStatusIcon(log: CollectionLogEntry): string {
  if (log.status === 'stopped') return '⏹';
  if (log.status === 'skipped') return '';
  if (log.reQueuedEmployees > 0 && log.processedEmployees === 0) return '🔄';
  if (log.llmCompleted === log.llmTotal && log.llmTotal > 0) return '✅';
  if (log.llmFailed > 0) return '⚠️';
  return 'ℹ️';
}

function getLlmDescription(log: CollectionLogEntry): string {
  if (log.status === 'stopped') return 'Анализ отменён при остановке сбора.';
  if (log.status === 'skipped') return '';
  if (log.reQueuedEmployees > 0 && log.processedEmployees === 0) {
    return `${log.reQueuedEmployees} отчёта без LLM-анализа поставлены в очередь. Это произошло потому что предыдущий анализ был отменён.`;
  }
  if (log.llmTotal === 0) return '';
  if (log.llmCompleted === log.llmTotal) {
    return `Все ${log.llmTotal} отчёта проанализированы.`;
  }
  if (log.llmFailed > 0) {
    return `${log.llmCompleted} проанализированы, ${log.llmFailed} ошибок.`;
  }
  return `${log.llmCompleted}/${log.llmTotal} проанализированы.`;
}
```

**Step 3: LogDetailPanel (компонент развёрнутого вида)**

```typescript
function LogDetailPanel({ log, details }: { log: CollectionLogEntry; details: LogDetails }) {
  const ytIcon = getYoutrackStatusIcon(log, details.employees);
  const ytDesc = getYoutrackDescription(log, details.employees);
  const llmIcon = getLlmStatusIcon(log);
  const llmDesc = getLlmDescription(log);
  const hasLlm = log.llmTotal > 0 || log.status === 'stopped';

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const completedLabel = log.status === 'stopped' ? 'Остановлен' : 'Завершён';

  return (
    <div className="rounded-lg bg-surface-light/50 dark:bg-surface-light/30 p-4 mx-2 mb-2 space-y-3 text-sm">
      {/* General info */}
      <div className="space-y-1 text-gray-500 dark:text-gray-400">
        <div>Запущен: <span className="text-gray-700 dark:text-gray-300">{formatDateTime(details.startedAt)}</span></div>
        {details.completedAt && (
          <div>{completedLabel}: <span className="text-gray-700 dark:text-gray-300">{formatDateTime(details.completedAt)}</span></div>
        )}
        <div>Перезапись: <span className="text-gray-700 dark:text-gray-300">{details.overwrite ? 'да' : 'нет'}</span></div>
      </div>

      {/* YouTrack */}
      {log.status !== 'skipped' || details.employees.some(e => e.dataStatus === 'skipped') ? (
        <div>
          <div className="font-medium text-gray-700 dark:text-gray-200">
            📊 YouTrack: {ytIcon} {getYoutrackStatusLabel(log, details.employees)}
            {details.youtrackDuration > 0 && ` за ${formatDuration(details.youtrackDuration)}`}
          </div>
          {ytDesc && <div className="mt-1 text-gray-500 dark:text-gray-400">{ytDesc}</div>}
          {log.status === 'skipped' && (
            <div className="mt-1 text-gray-500 dark:text-gray-400">
              Для обновления данных запустите с галочкой "Перезаписать".
            </div>
          )}
        </div>
      ) : null}

      {/* LLM */}
      {hasLlm && (
        <div>
          <div className="font-medium text-gray-700 dark:text-gray-200">
            🤖 LLM: {llmIcon} {getLlmStatusLabel(log)}
            {details.llmDuration > 0 && ` за ${formatDuration(details.llmDuration)}`}
          </div>
          {llmDesc && <div className="mt-1 text-gray-500 dark:text-gray-400">{llmDesc}</div>}
        </div>
      )}

      {/* Employees table */}
      {details.employees.length > 0 && log.status !== 'skipped' && (
        <div>
          <div className="font-medium text-gray-700 dark:text-gray-200 mb-1">Сотрудники:</div>
          <div className="space-y-0.5">
            {details.employees.map((emp) => (
              <EmployeeRow key={emp.login} emp={emp} logStatus={log.status} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Вспомогательные функции для статус-лейблов**

```typescript
function getYoutrackStatusLabel(log: CollectionLogEntry, employees: EmployeeDetail[]): string {
  const total = employees.length;
  const collected = employees.filter(e => e.dataStatus === 'collected').length;
  const failed = employees.filter(e => e.dataStatus === 'failed').length;
  const stopped = employees.filter(e => e.dataStatus === 'stopped').length;
  const skipped = employees.filter(e => e.dataStatus === 'skipped').length;

  if (log.status === 'stopped') return `Остановлен — ${collected}/${total}`;
  if (skipped === total) return 'Данные актуальны';
  if (collected === total) return 'Данные собраны';
  if (failed > 0) return `Частично — ${collected}/${total}`;
  return 'Данные собраны';
}

function getLlmStatusLabel(log: CollectionLogEntry): string {
  if (log.status === 'stopped') return 'Отменён';
  if (log.reQueuedEmployees > 0 && log.processedEmployees === 0) return 'Анализ переставлен в очередь';
  if (log.llmCompleted === log.llmTotal && log.llmTotal > 0) return 'Анализ завершён';
  if (log.llmFailed > 0) return 'Частично';
  if (log.llmTotal > 0) return 'В процессе';
  return '';
}
```

**Step 5: EmployeeRow (компонент строки сотрудника)**

```typescript
function EmployeeRow({ emp, logStatus }: { emp: EmployeeDetail; logStatus: string }) {
  const icon = emp.dataStatus === 'collected'
    ? '✅'
    : emp.dataStatus === 'failed'
    ? '❌'
    : emp.dataStatus === 'stopped'
    ? '⏹'
    : '🔄';

  let detail = '';
  if (emp.dataStatus === 'collected') {
    detail = `данные ✅  LLM ${emp.llmStatus === 'completed' ? '✅' : emp.llmStatus === 'failed' ? '❌' : emp.llmStatus === 'skipped' && logStatus === 'stopped' ? '⏹ отменён' : emp.llmStatus === 'pending' ? '→ в очередь' : emp.llmStatus}`;
  } else if (emp.dataStatus === 'failed') {
    detail = `ошибка: ${emp.error ?? 'неизвестная ошибка'}`;
  } else if (emp.dataStatus === 'stopped') {
    detail = 'не обработан (остановлено)';
  } else {
    detail = 'данные ✅  LLM → в очередь';
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 py-0.5">
      <span>{icon}</span>
      <span className="text-gray-700 dark:text-gray-300 min-w-[140px]">{emp.displayName}</span>
      <span>{detail}</span>
    </div>
  );
}
```

**Step 6: Обновить LogRow, GROUP_OPTIONS и основной компонент**

Ключевые изменения в LogRow:
- Убрать колонку "Время" и иконку `<td>` expand
- Все строки кликабельны
- При раскрытии — lazy load + `LogDetailPanel`
- Кэш деталей: `detailsCache` в основном компоненте (Map, передаётся через prop или контекст)

Ключевые изменения в основном компоненте:
- `GROUP_OPTIONS` — убрать `{ value: 'project', label: 'По проекту' }`
- `detailsCache: Map<string, LogDetails>` — state для кэша деталей
- Убрать колонки "Время" и `<th>` для expand icon из thead

**Step 7: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

**Step 8: Проверить lint**

Run: `cd frontend && npm run lint`
Expected: 0 errors

**Step 9: Коммит**

```
feat: rewrite CollectionLogs with accordion expand and detail panel
```

---

### Task 7: Обновить TESTING.md

**Files:**
- Modify: `TESTING.md`

**Step 1: Добавить секцию Prompt 22.7**

Добавить в сводку изменений и тесты T1-T5 из промпта.

**Step 2: Коммит**

```
docs: update TESTING.md with Prompt 22.7 expandable logs
```

---

### Task 8: Финальная проверка

**Step 1: Backend lint + types**

Run: `cd backend && npm run lint && npx tsc --noEmit`
Expected: 0 errors

**Step 2: Frontend lint + types**

Run: `cd frontend && npm run lint && npx tsc --noEmit`
Expected: 0 errors

**Step 3: Ручная проверка тестов T1-T5**

- T1: Клик на "✅ Успешно 3/3" → спиннер → YouTrack ✅, LLM ✅, 3 сотрудника ✅
- T2: Клик на "⏹ Остановлен 1/3" → YouTrack ⏹, LLM ⏹, 1✅ + 2⏹
- T3: Клик на "⚠️ Частично 2/3" → YouTrack ⚠️, ошибка, 2✅ + 1❌
- T4: Развернуть → свернуть → развернуть → без повторного запроса
- T5: Группировки: "По дате" и "По периоду", нет "По проекту"
