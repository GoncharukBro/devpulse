# Server Restart Recovery Design

## Принцип

Рестарт сервера **незаметен** для процессов сбора метрик. Никаких `failed`, `cancelled`, "прервано при рестарте". Сервер продолжает с того на чём прервался. Логи, статусы, счётчики — как будто рестарта не было.

## Текущее поведение (проблемы)

| Компонент | Текущее | Проблема |
|-----------|---------|----------|
| Running CollectionLog | `failed` + новый лог | Пользователь видит `failed`, счётчики сброшены |
| Pending CollectionLog | **теряется** | Логи pending не восстанавливаются |
| LLM processing | Только `status=collected` | `llmStatus=processing` не восстанавливается |
| Graceful shutdown | Работает | Достаточно, минимальные изменения |

## Новое поведение

### 1. Recovery running YouTrack-сборов

`CollectionLog.status='running'` → определить что собрано → досбор:

- Лог **остаётся** `running` (не создаём новый)
- Счётчики восстанавливаются из БД (processedEmployees, skippedEmployees, etc.)
- Задача добавляется в очередь с `overwrite=false` + `resume=true`
- In-memory collectionState заполняется текущими значениями из БД

**Counter continuity (resume=true):**

```
Инициализация в collectForSubscription:
  processedCount  = collectionLog.processedEmployees  // из БД (напр. 1)
  skippedCount    = collectionLog.skippedEmployees
  failedCount     = collectionLog.failedEmployees
  reQueuedCount   = collectionLog.reQueuedEmployees

Цикл по сотрудникам:
  Employee A: MetricReport есть → continue (ничего не инкрементим, уже учтён)
  Employee B: нет MetricReport → collect → processedCount++ → 2
  Employee C: нет MetricReport → collect → processedCount++ → 3
```

При resume=true скипнутые (уже собранные) сотрудники молча пропускаются.
processTask не сбрасывает счётчики на 0.

### 2. Recovery pending логов

`CollectionLog.status='pending'` → добавить в очередь:

- Лог остаётся `pending`
- Восстановить in-memory state
- Worker обработает в штатном порядке

### 3. Recovery LLM-очереди

`MetricReport.llmStatus IN ('pending', 'processing')`:

- `processing` → сбросить на `pending` (обработка прервалась)
- `pending` → оставить
- Оба → enqueue в LLM worker
- Восстановить collectionLogId через subscription+period

### 4. Порядок bootstrap

```
server.ts main():
  1. ORM init + migrations
  2. buildApp() + listen()
  3. initCollectionModule()
  4. worker.start():
     a) recoverLlmQueue()              ← LLM первым
     b) recoverRunningCollections()     ← running → досбор
     c) recoverPendingCollections()     ← pending → в очередь
     d) poll()
  5. cron.start()
  6. llmService.initialize() → llmWorker.start()
```

### 5. Graceful shutdown

Текущий shutdown остаётся. Минимальные изменения:
- cron.stop() → llmService.shutdown() → worker.stop() → app.close()
- Worker ждёт текущую задачу до 30с
- LLM worker ждёт до 60с
- Всё что не успело → recovery подхватит

## Изменяемые файлы

| Файл | Изменения |
|------|-----------|
| `collection.worker.ts` | Переписать `recoverInterrupted()` → 3 метода; модифицировать `processTask` и `collectForSubscription` для resume |
| `collection.state.ts` | Добавить `resume` в QueueTask |
| `llm.worker.ts` | Расширить `recoverPending()` для `llmStatus=processing` |
| `server.ts` | Порядок bootstrap (если нужно) |

## Сценарии тестирования

1. **Рестарт во время YouTrack**: 5 недель × 3 сотрудника → kill на 50% → рестарт → completed 15/15
2. **Рестарт во время LLM**: YouTrack 100%, LLM 5/15 → kill → рестарт → 15/15 analyzed
3. **Рестарт с pending логами**: 3 проекта → kill → рестарт → все три completed
4. **Чистый старт**: нет зависших → ничего не происходит
5. **Двойной рестарт**: kill → старт → kill → старт → данные не дублируются
