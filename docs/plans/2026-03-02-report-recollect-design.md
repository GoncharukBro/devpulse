# Пересборка отчёта со страницы сотрудника

**Дата**: 2026-03-02
**Подход**: Гибрид — report-centric API + лёгкая задача в воркере без CollectionLog

## Контекст

Пользователь хочет пересобрать конкретный отчёт (MetricReport) прямо со страницы сотрудника. Это означает: заново запросить данные из YouTrack за указанный период для одного сотрудника и запустить LLM-анализ.

Часть 2 (прогресс-бары на странице сбора) уже реализована — SubscriptionCard показывает прогресс, LLM-очередь, поллинг через Zustand store работает.

## Бэкенд

### Модель данных

- `MetricReport.status` — добавить значение `'collecting'`. Итого: `'collecting'` | `'collected'` | `'analyzed'` | `'failed'`
- Новых полей не требуется

### API

**`POST /api/reports/:reportId/recollect`**

Запрос: пустое тело
Ответ: `{ status: 'started', reportId: string }`

Логика:
1. Найти MetricReport по reportId (populate subscription)
2. Проверить subscription.ownerId === userId
3. Проверить report.status !== 'collecting' (не пересобирается уже)
4. Обновить `status = 'collecting'`, `llmStatus = 'pending'`, flush
5. Добавить задачу в `recollectQueue` в CollectionStateManager
6. Позвать `worker.nudge()`
7. Вернуть `{ status: 'started', reportId }`

### CollectionStateManager

Новый массив: `recollectQueue: RecollectTask[]`

```ts
interface RecollectTask {
  reportId: string;
  subscriptionId: string;
  youtrackLogin: string;
  periodStart: Date;
  periodEnd: Date;
}
```

Методы:
- `addToRecollectQueue(task: RecollectTask): void`
- `shiftRecollectQueue(): RecollectTask | undefined`

### CollectionWorker

В `poll()` — сначала проверять `recollectQueue`, потом обычную `queue`.

Новый метод `processRecollectTask(task: RecollectTask)`:
1. Fork EntityManager
2. Загрузить subscription с employees и fieldMapping
3. Вызвать `collectWithRetry()` для одного сотрудника
4. Обновить MetricReport новыми метриками
5. Вычислить KPI через KpiCalculator
6. `status = 'collected'`, `llmStatus = hasNoData ? 'skipped' : 'pending'`
7. Вызвать `achievementsGenerator.generateForReport()`
8. Вызвать `llmService.enqueueReports([...])` для LLM-очереди
9. При ошибке: `status = 'failed'`, `errorMessage = ...`

Не создаёт CollectionLog. Не мешает isSubscriptionBusy().

### Recovery при рестарте

Если сервер перезагрузился во время пересборки:
- MetricReport с `status = 'collecting'` → сбросить на `status = 'collected'` (или `'failed'`)
- Добавить в `recoverLlmQueue()` — если llmStatus='pending', LLM подхватит
- Простой подход: при старте найти все MetricReport с status='collecting', сбросить на 'failed' с errorMessage

## Фронтенд

### Типы

`EmployeeReportListItem` — добавить:
- `id: string` — reportId для вызова пересборки
- `llmStatus: string` — для StatusBadge

### StatusBadge

Обновить обработку:
- `status === 'collecting'` → Badge warning + анимированная точка, текст "Сбор..."
- `status === 'collected'` + `llmStatus` in ('pending','processing') → "Анализ..."
- `status === 'analyzed'` → "Готов" (success)
- `status === 'failed'` → "Ошибка" (danger)

### EmployeePage — таблица "История отчётов"

1. Новая колонка "Действия" (последняя, узкая, без заголовка)
2. Кнопка RefreshCw (lucide-react) в каждой строке:
   - `e.stopPropagation()` — не переключать отчёт
   - Disabled если status === 'collecting' или llmStatus in ('pending','processing')
   - При клике → модалка подтверждения
3. Модалка: "Пересобрать отчёт за {период}, {проект}?"
4. Подтверждение → POST /api/reports/:id/recollect

### Поллинг

- После запуска пересборки: `setInterval(() => loadReportsList(), 3000)`
- Остановить когда нет строк со status='collecting' и нет llmStatus in ('pending','processing') среди пересобираемых
- Или: вести Set<string> recollectingIds, после каждого poll проверять

### API (frontend)

```ts
recollectReport: (reportId: string) => api.post(`/reports/${reportId}/recollect`)
```

## Что НЕ делать

- Не менять логику основного сбора
- Не создавать CollectionLog для пересборки
- Не добавлять WebSocket/SSE
- Не менять cron
