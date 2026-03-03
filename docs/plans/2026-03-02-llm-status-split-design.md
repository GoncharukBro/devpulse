# Разделение llmStatus: no_data + overwrite fix

## Проблема

Статус `skipped` перегружен — используется для 3 разных ситуаций:
1. Нет данных за период (totalIssues === 0)
2. Отмена пользователем (кнопка «Стоп»)
3. Fallback когда отчёт не найден (getLogDetails)

Фронтенд всегда показывает «LLM ⏹ отменён», что вводит в заблуждение.

Дополнительно: при overwrite=true текущая логика корректна для YouTrack-сбора (пересобирает всё), но фронтенд не различает причину пропуска LLM.

## Решение

### Часть 1: Новый статус `no_data`

**Значения llmStatus после изменения:**
`pending` | `processing` | `completed` | `failed` | `skipped` | `no_data`

- `no_data` — нет задач в YouTrack за период (totalIssues === 0)
- `skipped` — отменён пользователем (кнопка «Стоп») или fallback

### Затронутые файлы

#### Backend

| Файл | Изменение |
|------|-----------|
| `entities/metric-report.entity.ts:125-127` | Обновить комментарий к допустимым значениям |
| `modules/collection/collection.worker.ts:437` | `hasNoData ? 'no_data' : 'pending'` |
| `modules/collection/collection.worker.ts:51` | Без изменений (pending для нового отчёта) |
| `modules/collection/collection.worker.ts:338` | Добавить `no_data` к условиям пропуска: `['completed', 'no_data'].includes(llmStatus)` → skip |
| `modules/collection/collection.worker.ts:614` | recovery: добавить `no_data` к исключаемым статусам (не восстанавливать) |
| `modules/llm/llm.worker.ts:130` | Проверка: `report.llmStatus === 'skipped' \|\| report.llmStatus === 'no_data'` |
| `modules/llm/llm.worker.ts:145` | `report.llmStatus = 'no_data'` (totalIssues === 0) |
| `modules/llm/llm.worker.ts:298` | recovery: без изменений (ищет pending/processing) |
| `modules/collection/collection.service.ts:539` | Без изменений (skipped — отмена пользователем) |
| `modules/collection/collection.service.ts:566` | Без изменений (skipped — отмена pending при Стоп) |
| `modules/collection/collection.service.ts:604,673-679` | Добавить `no_data` к union type; fallback остаётся `skipped` |
| `modules/reports/reports.service.ts:145` | Без изменений (просто передаёт значение) |
| `modules/reports/reports.service.ts:394` | Без изменений (фильтрует по completed) |
| `modules/subscriptions/subscriptions.service.ts:100-104` | SQL: добавить COUNT для `no_data`; убрать `skipped` из подсчёта «пропущенных», разделить |
| `modules/teams/teams.service.ts` | Без изменений (не фильтрует по llmStatus) |

#### Frontend

| Файл | Изменение |
|------|-----------|
| `types/collection.ts:126` | Добавить `'no_data'` к union type EmployeeDetail.llmStatus |
| `types/reports.ts:53` | Без изменений (string) |
| `types/subscription.ts` | Добавить поле llmNoData к currentPeriodStatus |
| `components/collection/CollectionLogs.tsx:258-262` | Добавить подсчёт `no_data`; убрать из `skipped` |
| `components/collection/CollectionLogs.tsx:307-318` | Частичный раздел: no_data → «нет задач», skipped → «отменены» |
| `components/collection/CollectionLogs.tsx:320-323` | Все no_data → «Нет задач за период» (вместо «Отменён») |
| `components/collection/CollectionLogs.tsx:347-348` | `no_data` → «данные ✅ LLM — нет задач», `skipped` → «данные ✅ LLM ⏹ отменён» |
| `components/employees/LlmSummaryBlock.tsx:66` | `no_data` → «Нет данных для анализа» |
| `components/collection/SubscriptionCard.tsx` | Если отображает llmSkipped — разделить на skipped и noData |

#### Миграция

```sql
-- Новый статус no_data
UPDATE metric_reports
SET llm_status = 'no_data'
WHERE llm_status = 'skipped' AND total_issues = 0;
```

### Часть 2: Overwrite

Текущая логика overwrite в `collection.worker.ts:331-375` **уже корректна**:
- При `overwrite=true` — блок проверки `if (!overwrite)` полностью пропускается
- YouTrack данные пересобираются для всех сотрудников
- MetricReport перезаписывается (upsert на строках 394-442)
- `llmStatus` устанавливается: `hasNoData ? 'no_data' : 'pending'`
- `collectedReports` заполняется для всех с данными → LLM-очередь

**Требуется только одно изменение:** при overwrite=true в строке 437, после введения `no_data`, убедиться что `hasNoData ? 'no_data' : 'pending'` корректно работает и для перезаписанных отчётов.

**Проверить**: когда overwrite=true и сотрудник ранее имел `llmStatus='no_data'`, при пересборе если теперь есть данные → `llmStatus='pending'` (корректно, upsert перезаписывает).

### Визуализация статусов на фронтенде

| llmStatus | Иконка | Текст (строка сотрудника) | Цвет/стиль |
|-----------|--------|---------------------------|------------|
| `pending` | ⏳ | данные ✅ LLM ⏳ в очереди | нейтральный |
| `processing` | ⏳ | данные ✅ LLM ⏳ в очереди | нейтральный |
| `completed` | ✅ | данные ✅ LLM ✅ | зелёный |
| `failed` | ⚠️ | данные ✅ LLM 📐 формула | жёлтый |
| `no_data` | ℹ️ | данные ✅ LLM — нет задач | серый/приглушённый |
| `skipped` | ⏹ | данные ✅ LLM ⏹ отменён | жёлтый |

### Секция LLM в развёрнутом логе

| Состояние | Иконка | label | description |
|-----------|--------|-------|-------------|
| Все no_data | ℹ️ | Нет задач за период | — |
| Все completed | ✅ | Анализ завершён | — |
| Есть pending/processing | ⏳ | В процессе | N ожидают анализа |
| Все failed | 📐 | Формульный расчёт | LLM недоступен |
| completed + no_data | ✅ | Анализ завершён | N без задач |
| completed + skipped | ⚠️ | Частично | N проанализированы, M отменены |
| Все skipped | ⏹ | Отменён | — |
