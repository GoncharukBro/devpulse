# TESTING.md — Аудит и доработка механизма сбора метрик

## Дата аудита: 2026-02-25 (Prompt 22), 2026-02-26 (Prompt 22.1–22.13), 2026-02-27 (Prompt 22.17)

---

## Prompt 22.17: Restart Recovery — незаметный рестарт сервера (2026-02-27)

### Что реализовано

Рестарт сервера незаметен для процессов сбора метрик. Никаких `failed`, `cancelled`, "прервано при рестарте". Сервер продолжает с того на чём прервался.

| Файл | Что изменено |
|------|-------------|
| `collection.state.ts` | `QueueTask.resume?: boolean` — флаг бесшовного продолжения |
| `collection.worker.ts` | `recoverInterrupted()` заменён тремя методами: `recoverLlmQueue()`, `recoverRunningCollections()`, `recoverPendingCollections()` |
| `collection.worker.ts` | `processTask()` — не сбрасывает счётчики при `resume=true` |
| `collection.worker.ts` | `collectForSubscription()` — инициализирует счётчики из БД при resume, молча пропускает уже собранных |
| `llm.worker.ts` | `recoverPending()` — обрабатывает `llmStatus='processing'`, восстанавливает `collectionLogId` |

### Порядок recovery при старте

1. `recoverLlmQueue()` — сбросить `processing → pending` в БД
2. `recoverRunningCollections()` — running логи → восстановить счётчики, дособрать
3. `recoverPendingCollections()` — pending логи → в очередь
4. `poll()` — начать обработку
5. `LlmWorker.recoverPending()` — enqueue LLM-отчёты

### Тест 1: Рестарт во время YouTrack-сбора
1. Запустить сбор 5 недель × 3 сотрудника
2. Дождаться ~50% (1-2 сотрудника обработаны)
3. `kill -9` процесс сервера
4. Перезапустить сервер
5. **Проверить:** фронт показывает тот же прогресс, что и до рестарта (напр. 1/3)
6. Дождаться завершения: completed 15/15

### Тест 2: Рестарт во время LLM-анализа
1. Запустить сбор, дождаться YouTrack 100%
2. Дождаться LLM ~5/15
3. `kill -9` процесс сервера
4. Перезапустить
5. **Проверить:** LLM продолжает с 6-го
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

---

## Prompt 22.13: LLM прогресс-бар с именем сотрудника (2026-02-26)

### Проблема
LLM прогресс-бар показывал только счётчик: "LLM-анализ (0/36) · 0%". Непонятно кто анализируется.

### Решение

| Файл | Что изменено |
|------|-------------|
| `collection.state.ts` | Тип LLM queue item расширен: `employeeName?: string` |
| `collection.state.ts` | `addToLlmQueue()` принимает 4-й параметр `employeeName` |
| `llm.worker.ts` | `enqueue()` передаёт `task.employeeName` в `addToLlmQueue()` |
| `collection.ts` (frontend) | `LlmQueueItem` расширен: `employeeName?: string` |
| `SubscriptionCard.tsx` | LLM bar показывает имя текущего сотрудника: "LLM-анализ · Иванов Артём (5/36) · 14%" |

### Проблема 2: Лог "отменён" vs карточка "выполняется"

**Диагностика:** Это штатное поведение, не баг.
- Каждый запуск создаёт **новый лог** (`createCollectionLog` — строка 97-98 collection.service.ts)
- Старый лог показывает "остановлен" — факт прошлого запуска (неизменяемый)
- Карточка показывает live-статус нового запуска
- Re-queue тоже создаёт новый лог

---

## Prompt 22.12: Исправление фильтрации задач YouTrack (2026-02-26)

### Проблема
При backfill за несколько месяцев DevPulse собирал данные только за 1 неделю из 13. Причина: фильтр `updated: START .. END` в YouTrack ищет задачи по дате **последнего** обновления, а не по дате реальной работы.

### Решение: Work items как основа

Заменён единственный запрос `updated: START .. END` на три источника:

| Источник | Запрос | Что ловит |
|----------|--------|-----------|
| Work items → getIssuesByIds | `id: PROJ-1, PROJ-2, ...` | Задачи с реальными списаниями за период |
| Resolved | `resolved: START .. END` | Задачи закрытые в периоде (без списания на этой неделе) |
| Created | `created: START .. END` | Новые задачи созданные в периоде |

Все три результата дедуплицируются по issue ID.

### Изменённые файлы

| Файл | Что изменено |
|------|-------------|
| `youtrack.client.ts` | Добавлен метод `getIssuesByIds(ids, fields)` — запрос задач по списку idReadable |
| `metrics-collector.ts` | `fetchIssues()` → `fetchIssuesFromAllSources()` — три запроса + дедупликация вместо одного `updated` |
| `metrics-collector.ts` | spentByType: `issues.find()` → `issueMap.get()` (O(1) вместо O(n)) |

### Prompt 22.9.1: hasNoData = totalIssues === 0

| Файл | Что изменено |
|------|-------------|
| `collection.worker.ts` | `hasNoData = totalIssues === 0` (было `&& totalSpentMinutes === 0`) |
| `llm.worker.ts` | Аналогично |
| `kpi-calculator.ts` | Guard `totalIssues === 0` → все KPI = null, `utilization` теперь `number \| null` |
| `EmployeePage.tsx` | `hasNoData = totalIssues === 0` (убрано `&& totalSpentHours === 0`) |
| Миграция | `Migration20260226500000_nullify_kpi_no_issues.ts` — обнуление KPI у записей с `total_issues=0` |

### Rate limiting

Было: 2 запроса на сотрудника (issues + work items).
Стало: 3-4 запроса (work items + resolved + created + getByIds). Увеличение в ~1.5-2 раза, приемлемо с rate limiter 200ms.

### Тесты

| Тест | Ожидание |
|------|----------|
| Backfill за 2+ месяца | Каждая неделя имеет `totalIssues > 0` если были списания |
| Неделя без активности | `totalIssues = 0` (корректно, "нет данных") |
| Задача resolved без списания | Попадает через `resolved` запрос |
| Списание на чужую задачу | Задача получена через `getIssuesByIds`, тип определяется корректно |

---

## Prompt 22.9: Score = null при отсутствии данных + удаление formula score

### Принцип
**Нет данных → нет оценки.** При `totalIssues=0 && totalSpentMinutes=0` score не вычисляется — это не "плохой результат", а "нет информации".

### Удалён formula score (fallback)

| Файл | Что изменено |
|------|-------------|
| `collection.worker.ts` | Убран импорт `FormulaScorer`, вызов `FormulaScorer.calculate()`, запись `report.formulaScore` |
| `formula-scorer.ts` | Файл оставлен (не импортируется), поле `formulaScore` в entity оставлено nullable |
| `reports.service.ts` | `getEffectiveScore()`: `llmScore ?? null` (было `llmScore ?? formulaScore ?? null`) |
| `teams.service.ts` | Аналогично: `llmScore ?? null` |
| `achievements.types.ts` | Аналогично: `llmScore ?? null` |
| `reports.types.ts` (backend) | `scoreSource: 'llm' \| null` (было `'llm' \| 'formula' \| null`) |
| `reports.types.ts` (frontend) | Аналогично |

### Нулевые данные → LLM не вызывается

| Файл | Что изменено |
|------|-------------|
| `collection.worker.ts` | При `hasNoData` → `llmStatus='skipped'`, НЕ добавляет в `collectedReports` для LLM-очереди |
| `llm.worker.ts` | Проверка `totalIssues=0 && totalSpentMinutes=0` в начале `processTask()` → обнуление всех LLM-полей, `llmStatus='skipped'` |
| `llm.worker.ts` | При LLM-ошибке: `report.llmScore = undefined` (явно обнуляем), убран fallback на formula score |

### Фронтенд: отображение null score

| Файл | Что изменено |
|------|-------------|
| `ScoreBadge.tsx` | Добавлен prop `nullReason`, tooltip с пояснением |
| `LlmSummaryBlock.tsx` | Добавлены props `llmStatus`, `hasNoData`. Различает: нет данных / LLM failed / LLM skipped |
| `EmployeePage.tsx` | Передаёт `llmStatus` и `hasNoData` в `LlmSummaryBlock` |
| `MetricTooltip.tsx` | Убрана строка "формульный расчёт" из tooltip score |
| `OverviewPage.tsx` | Убрана строка "формульный расчёт" из tooltip графика |
| `reports.types.ts` (backend + frontend) | Добавлено поле `llmStatus` в `EmployeeReportDTO` |

### Миграция данных

| SQL | Описание |
|-----|---------|
| `UPDATE metric_reports SET formula_score = NULL` | Обнуление всех formula_score |
| `UPDATE metric_reports SET llm_score=NULL, llm_summary=NULL, ... WHERE total_issues=0 AND total_spent_minutes=0` | Обнуление LLM-данных у записей без реальных метрик |

### Аудит fallback'ов

| Паттерн | Файл | Статус |
|---------|------|--------|
| `FormulaScorer.calculate()` | `collection.worker.ts:367` | **Удалён** |
| `report.formulaScore = ...` | `collection.worker.ts:413` | **Удалён** |
| `import { FormulaScorer }` | `collection.worker.ts:14` | **Удалён** |
| `llmScore ?? formulaScore ?? null` | `reports.service.ts:40` | **→** `llmScore ?? null` |
| `llmScore ?? formulaScore ?? null` | `teams.service.ts:22` | **→** `llmScore ?? null` |
| `llmScore ?? formulaScore ?? null` | `achievements.types.ts:60` | **→** `llmScore ?? null` |
| `formulaScore != null` → `'formula'` | `reports.service.ts:45` | **Удалён** |
| `"falling back to formula score"` | `llm.worker.ts:158,173` | **→** `"score = null"` |
| `formula was ${report.formulaScore}` | `llm.worker.ts:203` | **Удалён** |
| `'LLM-анализ / формульный расчёт'` | `MetricTooltip.tsx:15` | **→** `'LLM-анализ'` |
| `'формульный расчёт (fallback)'` | `MetricTooltip.tsx:17` | **→** `'LLM на основе KPI'` |
| `'формульный расчёт'` в tooltip | `EmployeePage.tsx`, `OverviewPage.tsx` | **Удалён** |
| `formulaScore` в entity | `metric-report.entity.ts:119` | **Оставлен** (nullable, не используется) |
| `formula_score` в migration | `Migration20260221000000:101` | **Оставлен** (историческая миграция) |
| `score ?? 0` / `score \|\| 0` | frontend | **Не найдено** |
| `DEFAULT_SCORE` | backend + frontend | **Не найдено** |

---

## Сводка изменений

### Backend
| Файл | Изменение |
|------|-----------|
| `collection-log.entity.ts` | Добавлены поля: `userId`, `skippedEmployees`, `failedEmployees`, `overwrite`, `duration`, `error`, `updatedAt`. Типы статусов/типов экспортированы |
| `metric-report.entity.ts` | Добавлено поле `llmStatus` (default: `'pending'`). Изменен default `status` с `'pending'` на `'collected'` |
| `collection.state.ts` | Полная переработка: новый `CollectionProgressStatus`, `isSubscriptionBusy()`, `isAnyCollectionActive()`, `skipLlmItemsForSubscriptions()`, различие `cancelled` vs `stopped` |
| `collection.service.ts` | Каждый запуск = новый лог. 409 ConflictError. Валидация будущих дат. `triggerAllCollections` принимает `subscriptionIds`. Статус `cancelled` для очереди, `stopping` для running |
| `collection.worker.ts` | Retry с exponential backoff (3 попытки, 1s/2s/4s). Отдельные счётчики skipped/failed. Multi-week через `getWeeksBetween()`. Статус `skipped` когда все пропущены |
| `collection.routes.ts` | Фильтры `status`/`type` для логов. 409 обработка ConflictError. Проверка cron-конфликта в trigger-all |
| `app-error.ts` | Добавлен `ConflictError` (409) |
| `cron.manager.ts` | `isAnyCollectionActive()` проверка перед запуском |
| `llm.worker.ts` | `'pending'` вместо `'queued'`. `report.status = 'analyzed'`, `report.llmStatus = 'completed'/'failed'` |
| `Migration20260225000000` | Миграция: новые колонки, конвертация статусов (`queued→pending`, `error→failed`, `scheduled→cron`) |

### Frontend
| Файл | Изменение |
|------|-----------|
| `types/collection.ts` | `CollectionProgressStatus`, `LogGroupBy`, новые поля в `CollectionProgress` и `CollectionLogEntry` |
| `api/endpoints/collection.ts` | `subscriptionIds` в `triggerAll()`, `status`/`type` в `getLogs()` |
| `SubscriptionCard.tsx` | `onCancel` prop. Кнопки: pending→"Отменить", running→"Остановить", stopping→disabled, hasLlm→"Остановить", idle→"Запустить" |
| `CollectAllModal.tsx` | Чекбоксы проектов, toggle all, валидация ≥1 выбранного, отправка `subscriptionIds` |
| `CollectionLogs.tsx` | 3 режима группировки (дата/проект/период). Фильтры статуса и типа. Адаптивные колонки таблицы |
| `CollectionPage.tsx` | `onCancel` → `handleCancel`. `getActiveCollection` проверяет queue. Сценарий 12: stop перед delete. Предупреждение в модалке удаления |

---

## Статусы по спецификации

### CollectionLog
| Статус | Описание | Реализовано |
|--------|----------|-------------|
| `pending` | В очереди, ожидает обработки | OK |
| `running` | Активный сбор данных | OK |
| `stopping` | Получен сигнал остановки, дообработка текущего сотрудника | OK |
| `completed` | Все сотрудники обработаны успешно | OK |
| `partial` | Часть сотрудников с ошибками | OK |
| `stopped` | Остановлен пользователем (был running) | OK |
| `cancelled` | Отменён пользователем (был pending в очереди) | OK |
| `failed` | Все попытки сбора провалились | OK |
| `skipped` | Все сотрудники пропущены (данные уже есть, overwrite=false) | OK |

### MetricReport status
| Статус | Описание | Реализовано |
|--------|----------|-------------|
| `collected` | Метрики собраны, ожидает LLM | OK |
| `analyzed` | LLM-анализ завершён | OK |
| `failed` | Ошибка при сборе/анализе | OK |

### MetricReport llmStatus
| Статус | Описание | Реализовано |
|--------|----------|-------------|
| `pending` | Ожидает LLM-анализа | OK |
| `processing` | LLM обрабатывает | OK |
| `completed` | LLM-анализ успешен | OK |
| `failed` | LLM-анализ провалился | OK |
| `skipped` | Пропущен (проект остановлен) | OK |

### CollectionLog type
| Тип | Описание | Реализовано |
|-----|----------|-------------|
| `manual` | Ручной запуск пользователем | OK |
| `cron` | Автоматический по расписанию | OK |

---

## Проверка сценариев

### Сценарий 1: Запуск сбора одного проекта
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Нажать "Запустить сбор" на карточке | Открывается CollectModal | OK |
| Выбрать период и нажать "Запустить" | API `POST /collection/trigger` | OK |
| Создаётся новый CollectionLog | `status: 'pending'`, новый UUID | OK — каждый запуск = новая запись |
| Карточка показывает "В очереди..." | Пульсирующий amber бар | OK |
| Начинается сбор | `status: 'running'`, прогресс бар | OK |
| Текущий сотрудник отображается | `currentEmployee` на карточке | OK |
| Завершение | `status: 'completed'` или `'partial'` | OK |

### Сценарий 2: Запуск сбора всех проектов
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Нажать "Запустить всё" | Открывается CollectAllModal с чекбоксами | OK |
| Все активные проекты выбраны по умолчанию | `selectedIds` = все active | OK |
| Можно снять/поставить галочки | Toggle отдельных + toggle all | OK |
| Валидация: ≥1 проект выбран | Кнопка disabled + предупреждение | OK |
| API вызов с subscriptionIds | `POST /collection/trigger-all {subscriptionIds}` | OK |
| Один лог на проект | Каждый создаёт свой CollectionLog | OK |
| Уже занятые проекты пропускаются | `isSubscriptionBusy()` check, no 409 | OK |

### Сценарий 3: Остановка одного проекта
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Нажать "Остановить" на running карточке | API `POST /collection/stop` | OK |
| Статус → `stopping` | Карточка: "Останавливается...", серый бар | OK |
| Кнопка disabled | Нельзя нажать повторно | OK |
| Текущий сотрудник дообрабатывается | Worker завершает итерацию, потом останавливает | OK |
| Финальный статус → `stopped` | Лог обновляется | OK |
| LLM-задачи помечаются как skipped | `skipLlmItemsForSubscriptions()` | OK |
| Другие проекты продолжают работать | Только этот subscriptionId останавливается | OK |

### Сценарий 4: Остановка всех проектов
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Нажать "Остановить всё" | API `POST /collection/stop-all` | OK |
| Все running → `stopping` → `stopped` | Каждый дообрабатывает текущего | OK |
| Все pending (в очереди) → `cancelled` | Убираются из queue, лог = cancelled | OK |
| Все LLM-задачи → skipped | `skipLlmItemsForSubscriptions()` для всех | OK |

### Сценарий 5: Отмена из очереди
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Проект в статусе pending (в очереди) | Карточка: "В очереди...", amber пульс | OK |
| Нажать "Отменить" | API `POST /collection/stop` | OK |
| Убирается из очереди | Лог: `status = 'cancelled'` | OK |
| Тост "Сбор отменён" | Отличается от "Сбор остановлен" | OK |

### Сценарий 6: Повторный запуск после остановки
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Проект остановлен (status=stopped) | Карточка idle, кнопка "Запустить сбор" | OK |
| Нажать "Запустить сбор" | Создаётся НОВЫЙ CollectionLog | OK |
| Старый лог остаётся stopped | Не переиспользуется | OK |

### Сценарий 7: Пропуск при overwrite=false
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Запуск без "Перезаписать" | `overwrite: false` | OK |
| MetricReport уже существует | Worker проверяет `findOne()` | OK |
| Сотрудник пропускается | `skippedCount++`, переход к следующему | OK |
| Все пропущены → `status: 'skipped'` | Лог: 0 processed, N skipped | OK |
| Часть пропущена, часть собрана → `completed` | processed > 0, skipped > 0 | OK |

### Сценарий 8: Multi-week сбор
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Период > 1 недели | `getWeeksBetween()` разбивает на недели | OK |
| Worker обрабатывает неделю за неделей | Внешний цикл по неделям, внутренний по сотрудникам | OK |
| Прогресс: "Неделя 2/4" на карточке | `currentWeek/totalWeeks` | OK |

### Сценарий 9: Retry с exponential backoff
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| YouTrack API ошибка | Первая попытка провалилась | OK |
| Retry через 1 секунду | Вторая попытка | OK |
| Retry через 2 секунды | Третья попытка | OK |
| Все 3 провалились | Сотрудник помечается как failed, переход к следующему | OK |
| Успех на 2-й попытке | Данные сохраняются нормально | OK |

### Сценарий 10: Конфликт cron + ручной сбор
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Cron запущен, нажать "Запустить всё" | API возвращает 409 | OK |
| Ручной сбор запущен, cron тикает | Cron пропускает (log warning) | OK |
| `isAnyCollectionActive()` проверка | В обоих направлениях | OK |

### Сценарий 11: 409 при повторном запуске
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Проект уже running или pending | Нажать "Запустить сбор" | OK |
| API возвращает 409 ConflictError | "Сбор уже выполняется для данной подписки" | OK |
| trigger-all пропускает busy подписки | Без 409, тихий skip | OK |

### Сценарий 12: Удаление во время сбора
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Проект с активным сбором, нажать "Удалить" | Модалка с предупреждением | OK |
| "Активный сбор будет остановлен перед удалением" | Amber текст в модалке | OK |
| Подтвердить удаление | Сначала stop(), потом delete() | OK |
| Карточка показывает loading | `deletingId` → stopLoading на карточке | OK |

### Сценарий 13: Деактивация подписки
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| "Приостановить" в меню карточки | `isActive: false` | OK |
| Деактивированный проект | Cron пропускает, "Запустить всё" пропускает | OK |
| Ручной запуск деактивированного | Разрешён (Scenario 13) | OK |

### Сценарий 14: Валидация будущего периода
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| periodStart > сегодня | Frontend: date input max=today | OK |
| Backend валидация | 400: "Нельзя собрать данные за будущий период" | OK |
| periodEnd > сегодня | Frontend: max ограничен | OK |

### Сценарий 15: Перезагрузка страницы во время сбора
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Сбор идёт, F5 | GET /collection/state при init | OK |
| Прогресс восстанавливается | activeCollections отображаются | OK |
| Polling возобновляется | Автостарт при hasActive | OK |

### Сценарий 16: Recovery после падения бэкенда
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Бэкенд упал во время сбора | Лог остался `status: 'running'` в БД | OK |
| Бэкенд перезапускается | `recoverInterrupted()` находит running логи | OK |
| Создаётся НОВЫЙ лог для retry | Старый помечается `'failed'` | OK |

### Сценарий 17: Логи с группировкой
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| "По дате" (default) | Логи сгруппированы по дате начала | OK |
| "По проекту" | Логи сгруппированы по projectName | OK |
| "По периоду" | Логи сгруппированы по periodStart—periodEnd | OK |
| Колонки адаптируются | Скрывается колонка = основание группировки | OK |
| Фильтр по статусу | Dropdown: все/completed/partial/stopped/cancelled/failed/skipped | OK |
| Фильтр по типу | Dropdown: все/manual/cron | OK |

### Сценарий 18: LLM-очередь
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Сбор завершён, LLM-задачи поставлены | Purple progress bar на карточке | OK |
| LLM-прогресс: processed/total | `llmProcessed / (llmProcessed + llmQueue.length)` | OK |
| Остановка во время LLM → skip | `skipLlmItemsForSubscriptions()`, `llmStatus: 'skipped'` | OK |

### Сценарий 19: Idempotent stop
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Stop когда ничего не запущено | 200 OK, пустой cancelledLogIds | OK |
| Повторный stop одного проекта | 200 OK, без ошибки | OK |

---

## Найденные и исправленные проблемы

### 1. Переиспользование логов вместо создания новых
- **Было**: `triggerCollection()` искал существующий лог и обновлял его
- **Стало**: Каждый запуск создаёт новый `CollectionLog` с уникальным ID
- **Файлы**: `collection.service.ts`

### 2. Статусы не соответствовали спецификации
- **Было**: `queued`, `error`, `collecting`, `scheduled`
- **Стало**: `pending`, `failed`, `running`, `cron`
- **Файлы**: entity, state, service, worker, routes, migration

### 3. Нет различия между "отменён" и "остановлен"
- **Было**: Всё было `'stopped'` или `'error'`
- **Стало**: `cancelled` (из очереди, never started) vs `stopped` (was running)
- **Файлы**: `collection.state.ts`, `collection.service.ts`

### 4. Отсутствие ConflictError (409)
- **Было**: Повторный запуск для занятого проекта не проверялся
- **Стало**: `isSubscriptionBusy()` → `ConflictError` → 409
- **Файлы**: `app-error.ts`, `collection.service.ts`, `collection.routes.ts`

### 5. Нет retry с exponential backoff
- **Было**: Одна попытка, при ошибке → failed
- **Стало**: 3 попытки с задержкой 1s, 2s, 4s
- **Файлы**: `collection.worker.ts` (`collectWithRetry()`)

### 6. Отсутствие статуса `skipped`
- **Было**: overwrite=false всегда давал `completed`
- **Стало**: Если все пропущены → `skipped`, частично → counters `skippedEmployees`
- **Файлы**: `collection.worker.ts`, entity, frontend types

### 7. Нет статуса `stopping`
- **Было**: Мгновенный переход running → stopped
- **Стало**: `stopping` промежуточный статус, UI показывает "Останавливается..."
- **Файлы**: `collection.state.ts`, `SubscriptionCard.tsx`

### 8. Недостающие поля в CollectionLog
- **Было**: Нет `userId`, `skippedEmployees`, `failedEmployees`, `overwrite`, `duration`, `error`
- **Стало**: Все поля добавлены + миграция
- **Файлы**: entity, migration

### 9. MetricReport status/llmStatus не разделены
- **Было**: Один `status` для всего
- **Стало**: `status` = collected/analyzed/failed, `llmStatus` = pending/processing/completed/failed/skipped
- **Файлы**: `metric-report.entity.ts`, `llm.worker.ts`

### 10. Frontend: нет группировки логов
- **Было**: Простая таблица без группировки
- **Стало**: 3 режима (дата/проект/период), адаптивные колонки
- **Файлы**: `CollectionLogs.tsx`

### 11. Frontend: нет фильтров статуса/типа в логах
- **Было**: Только фильтр по проекту
- **Стало**: + фильтр по статусу + фильтр по типу (manual/cron)
- **Файлы**: `CollectionLogs.tsx`, `collection.ts` (API)

### 12. Frontend: CollectAllModal без выбора проектов
- **Было**: Запуск для всех активных без возможности выбора
- **Стало**: Чекбоксы, toggle all, отправка `subscriptionIds`
- **Файлы**: `CollectAllModal.tsx`

### 13. Frontend: нет кнопки "Отменить" для pending
- **Было**: Одна кнопка "Остановить" для всех состояний
- **Стало**: pending→"Отменить", running→"Остановить", stopping→disabled
- **Файлы**: `SubscriptionCard.tsx`, `CollectionPage.tsx`

### 14. Frontend: удаление не останавливает активный сбор
- **Было**: Удаление подписки без остановки сбора
- **Стало**: Stop → Delete, предупреждение в модалке
- **Файлы**: `CollectionPage.tsx`

### 15. Frontend: queue items не отображались как pending
- **Было**: `getActiveCollection()` проверял только activeCollections
- **Стало**: Также проверяет queue, синтезирует pending `CollectionProgress`
- **Файлы**: `CollectionPage.tsx`

### 16. Cron мог запускаться параллельно
- **Было**: Нет проверки текущих сборов
- **Стало**: `isAnyCollectionActive()` → skip
- **Файлы**: `cron.manager.ts`

### 17. Recovery создавал дублирующий лог
- **Было**: Переиспользовался interrupted лог
- **Стало**: Старый → `failed`, новый лог для повтора
- **Файлы**: `collection.worker.ts`

---

## Prompt 22.1 — Исправление LLM-stop / stale cancel flag (2026-02-26)

### Проблемы и исправления

### 18. Остановка во время LLM-фазы оставляла stale cancel flag
- **Было**: `cancelBySubscriptionIds()` безусловно добавлял ВСЕ subscriptionId в `cancelledSubscriptions`, даже если у подписки не было running YouTrack-коллекции (только LLM). Worker после LLM-фазы не вызывал `clearCancellation()`, т.к. цикл по сотрудникам уже завершён. При следующем trigger новая коллекция немедленно останавливалась со статусом `stopped 0/N`.
- **Стало**: `cancelBySubscriptionIds()` добавляет в `cancelledSubscriptions` только подписки с `status === 'running'`. LLM-only подписки просто получают `skipLlmItemsForSubscriptions()` без флага. Дополнительно, `triggerCollection()` вызывает `clearCancellation()` как safety net перед проверкой `isSubscriptionBusy()`.
- **Файлы**: `collection.state.ts`, `collection.service.ts`

### 19. LLM worker не проверял `llmStatus: 'skipped'`
- **Было**: После stop в LLM-фазе, `cancelCollections()` помечал `MetricReport.llmStatus = 'skipped'` в БД, но worker не проверял этот статус и мог всё равно обработать задачу.
- **Стало**: `processTask()` проверяет `report.llmStatus === 'skipped'` перед обработкой и пропускает.
- **Файлы**: `llm.worker.ts`

### 20. Frontend не обновлял подписки после stop
- **Было**: `handleStop`, `handleCancel`, `handleStopAll` вызывали только `fetchState()`, но не `loadSubscriptions()`. Карточка показывала stale `lastCollection` данные.
- **Стало**: Все три хендлера вызывают `loadSubscriptions()` + `setLogsRefreshKey()` после stop/cancel.
- **Файлы**: `CollectionPage.tsx`

### 21. Кнопка "Остановить" в LLM-фазе не отличалась от обычной
- **Было**: Одинаковый текст "Остановить" для running и LLM фаз.
- **Стало**: LLM-фаза показывает "Остановить LLM", тост "LLM-анализ отменён".
- **Файлы**: `SubscriptionCard.tsx`, `CollectionPage.tsx`

### Изменённые файлы (Prompt 22.1)
| Файл | Изменение |
|------|-----------|
| `collection.state.ts` | `cancelBySubscriptionIds()` возвращает `{ logResults, skippedLlmReportIds }`. Только running-подписки получают cancel flag |
| `collection.service.ts` | `clearCancellation()` в `triggerCollection()`. `cancelCollections()` обновляет `MetricReport.llmStatus` через `nativeUpdate` |
| `llm.worker.ts` | Проверка `llmStatus === 'skipped'` в `processTask()` |
| `CollectionPage.tsx` | `loadSubscriptions()` в `handleStop/Cancel/StopAll`. Smart toast для LLM-only stop |
| `SubscriptionCard.tsx` | Кнопка "Остановить LLM" в hasLlm-фазе |

---

## Prompt 22.2 — Полный аудит 19 сценариев (2026-02-26)

### Найденные и исправленные проблемы

### 22. `hasCronRunning` не фильтровал по типу коллекции
- **Было**: В `trigger-all` роуте проверка `ac.status === 'running'` без фильтра по типу. Любая running коллекция (включая manual) блокировала "Запустить всё" с ошибкой "Автоматический сбор уже выполняется".
- **Стало**: Добавлено поле `type?: 'manual' | 'cron'` в `CollectionProgress`. Проверка в роуте: `ac.type === 'cron' && ['pending', 'running', 'stopping'].includes(ac.status)`. Type устанавливается при создании progress entry в service, worker и recovery.
- **Файлы**: `collection.state.ts`, `collection.service.ts`, `collection.worker.ts`, `collection.routes.ts`, `frontend/types/collection.ts`

### 23. `getEmployeeSummary()` — несбалансированные скобки
- **Было**: `parts.join(' (') + ')'` давало `"3/5 (2 пропущено (1 ошибка)"` — две открывающие скобки, одна закрывающая.
- **Стало**: Дополнительные части собираются через запятую в одних скобках: `"3/5 (2 пропущено, 1 ошибка)"`.
- **Файлы**: `CollectionLogs.tsx`

### Изменённые файлы (Prompt 22.2)
| Файл | Изменение |
|------|-----------|
| `collection.state.ts` | `type?: 'manual' \| 'cron'` в `CollectionProgress` |
| `collection.service.ts` | `type` передаётся в `updateProgress()` для trigger и cron |
| `collection.worker.ts` | `type: task.type` в `updateProgress()` для processTask и recovery |
| `collection.routes.ts` | `hasCronRunning` фильтрует по `ac.type === 'cron'` |
| `frontend/types/collection.ts` | `type?: 'manual' \| 'cron'` в `CollectionProgress` |
| `CollectionLogs.tsx` | `getEmployeeSummary()` переписана с корректными скобками |

### Известные ограничения
| Ограничение | Описание |
|-------------|----------|
| Cron state не персистится | `pause()`/`resume()` хранятся в памяти. При перезапуске бэкенда cron сбрасывается к значению из конфига |

### Результаты повторного аудита сценариев (22.2)
| Сценарий | Результат | Примечание |
|----------|-----------|------------|
| 1. Запуск одного проекта | OK | |
| 2. Запуск всех проектов | OK | |
| 3. Остановка одного (running) | OK | |
| 4. Остановка всех | OK | |
| 5. Отмена из очереди (pending) | OK | |
| 6. Повторный запуск после stop | OK | Fix 22.1: stale cancel flag |
| 7. Пропуск при overwrite=false | OK | |
| 8. Multi-week сбор | OK | |
| 9. Retry с exponential backoff | OK | |
| 10. Конфликт cron + manual | OK | Fix 22.2: hasCronRunning фильтр по type |
| 11. 409 при повторном запуске | OK | |
| 12. Удаление во время сбора | OK | |
| 13. Деактивация подписки | OK | |
| 14. Валидация будущего периода | OK | |
| 15. Перезагрузка страницы | OK | |
| 16. Recovery после падения | OK | |
| 17. Логи с группировкой | OK | Fix 22.2: getEmployeeSummary скобки |
| 18. LLM-очередь | OK | Fix 22.1: stop в LLM-фазе |
| 19. Idempotent stop | OK | |

### Доп. проверки (22.2)
| Проверка | Результат |
|----------|-----------|
| LLM stop: cancel flag не отравляет следующий trigger | OK (Fix 22.1) |
| LLM stop: worker пропускает skipped репорты | OK (Fix 22.1) |
| LLM stop: кнопка "Остановить LLM" | OK (Fix 22.1) |
| Группировка логов: скобки в getEmployeeSummary | OK (Fix 22.2) |
| Кнопки: pending→"Отменить" | OK |
| Кнопки: running→"Остановить" | OK |
| Кнопки: stopping→disabled "Останавливается..." | OK |
| Кнопки: hasLlm→"Остановить LLM" | OK |
| Кнопки: idle→"Запустить сбор" | OK |
| Global: busy→"Остановить всё" | OK |
| Global: idle→"Запустить всё" | OK |
| Polling: 3s interval, stops when idle | OK |

---

## Prompt 22.3 — LLM re-queue при повторном запуске (2026-02-26)

### Проблема
При `overwrite=false` проверка "данные есть" смотрела только на существование MetricReport, не учитывая `llmStatus`. Отчёты с `llmStatus: skipped/failed/pending` (неполные) навсегда оставались без LLM-анализа при повторном запуске.

### Исправления

### 24. Неполные отчёты не переставлялись в LLM-очередь
- **Было**: `if (existingReport) { skippedCount++; continue; }` — любой существующий отчёт считался полным
- **Стало**: Проверка `existingReport.llmStatus === 'completed'` — только полные отчёты пропускаются. Неполные (`skipped`/`failed`/`pending`) получают `llmStatus = 'pending'` и ставятся в LLM-очередь без пересбора YouTrack
- **Файлы**: `collection.worker.ts`

### 25. Новое поле `reQueuedEmployees` в CollectionLog
- **Было**: Нет способа отличить "пропущен, т.к. данные полные" от "переставлен в LLM"
- **Стало**: `reQueuedEmployees` считает сотрудников, у которых LLM был переставлен в очередь. Отображается в логах: `"0/3 (1 пропущено, 2 LLM переставлено)"`
- **Файлы**: `collection-log.entity.ts`, `collection.state.ts`, `collection.service.ts`, `collection.worker.ts`, миграция, `frontend/types/collection.ts`, `CollectionLogs.tsx`

### 26. Статус лога учитывает re-queue
- **Было**: `processedCount === 0 && reQueuedCount > 0` давало статус `skipped`
- **Стало**: Если `reQueuedCount > 0`, статус = `completed` (работа выполнена — LLM задачи поставлены)
- **Файлы**: `collection.worker.ts`

### Изменённые файлы (Prompt 22.3)
| Файл | Изменение |
|------|-----------|
| `collection-log.entity.ts` | Новое поле `reQueuedEmployees` (default: 0) |
| `collection.state.ts` | `reQueuedEmployees` в `CollectionProgress` |
| `collection.worker.ts` | Логика skip: проверка `llmStatus === 'completed'`. Неполные → LLM re-queue. `reQueuedCount` в счётчиках и финализации статуса |
| `collection.service.ts` | `reQueuedEmployees` в `PaginatedCollectionLogs` и сериализации |
| `Migration20260226000000` | Новая колонка `re_queued_employees` |
| `frontend/types/collection.ts` | `reQueuedEmployees` в `CollectionProgress` и `CollectionLogEntry` |
| `CollectionLogs.tsx` | `getEmployeeSummary()` показывает re-queued count |

### Сценарий 20: LLM re-queue при повторном запуске
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Запуск → YouTrack 3/3 → LLM в процессе → Остановить | MetricReport: 3 штуки, llmStatus: skipped | OK |
| Повторный запуск (overwrite=false) | YouTrack: 0 пересобрано | OK |
| Неполные отчёты (llmStatus !== completed) | LLM: переставлены в очередь (llmStatus → pending) | OK |
| reQueuedEmployees обновляется | Лог: reQueuedEmployees = 3 | OK |
| Статус лога | `completed` (работа выполнена) | OK |
| LLM прогрессбар | Появляется, показывает очередь | OK |
| Лог в таблице | "0/3 (3 LLM переставлено)" | OK |

### Сценарий 20b: Частичный LLM → повторный запуск
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| 3 отчёта: 1 completed, 1 skipped, 1 failed | Повторный запуск (overwrite=false) | OK |
| completed → пропущен (skippedCount++) | llmStatus: completed не трогается | OK |
| skipped → LLM re-queue (reQueuedCount++) | llmStatus → pending | OK |
| failed → LLM re-queue (reQueuedCount++) | llmStatus → pending | OK |
| Лог | "0/3 (1 пропущено, 2 LLM переставлено)" | OK |

### Сценарий 20c: Все LLM completed → повторный запуск
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Все 3 MetricReport: llmStatus: completed | Повторный запуск (overwrite=false) | OK |
| Все 3 пропущены (skippedCount = 3) | Статус: `skipped` | OK |
| LLM-очередь пуста | Прогрессбар не появляется | OK |

---

## Prompt 22.4 — Два индикатора на карточке + умные статусы логов (2026-02-26)

### Проблемы

1. Карточка подписки показывала один объединённый статус — невозможно отличить "данные собраны, LLM идёт" от "всё завершено"
2. При overwrite=false и re-queue LLM показывалось "Успешно 0/3 обработано" — непонятно
3. Логи не различали завершение с LLM и без

### Исправления

### 27. Два индикатора на SubscriptionCard: "Данные" и "LLM"
- **Было**: Одна строка статуса, смешивающая сбор и LLM
- **Стало**: Две раздельные строки "Данные:" и "LLM:" в idle-состоянии карточки. Data-линия показывает результат сбора (N/M, ошибки, пропущено, без изменений). LLM-линия показывает real-time из `llmQueueBySubscription` (обработка/очередь) или static из `lastCollection.llm*` (завершён/отменён/ошибки)
- **Файлы**: `SubscriptionCard.tsx`, `CollectionPage.tsx`

### 28. LLM-счётчики в CollectionLog
- **Было**: Нет информации о LLM-прогрессе в логах БД
- **Стало**: 4 новых поля: `llmTotal`, `llmCompleted`, `llmFailed`, `llmSkipped`. LLM worker инкрементирует счётчики после каждой задачи. Collection worker устанавливает `llmTotal` при финализации
- **Файлы**: `collection-log.entity.ts`, миграция, `llm.worker.ts`, `collection.worker.ts`

### 29. `llmQueueBySubscription` в API state response
- **Было**: Фронт считал LLM-статус по-subscription вручную из общего `llmQueue`
- **Стало**: Backend предоставляет `llmQueueBySubscription: Record<string, {pending, processing, total}>` в ответе state. Total включает уже обработанные (из `llmProcessed`)
- **Файлы**: `collection.state.ts`, `collection.service.ts`, `frontend/types/collection.ts`

### 30. Умные статусы в CollectionLogs
- **Было**: `getStatusBadge(status)` — простое отображение статуса
- **Стало**: `getSmartStatusBadge(log)` — контекстно-зависимые бейджи:
  - `completed` + llm done → "Успешно N/M"
  - `completed` + llm pending → "Данные собраны N/M"
  - `completed` + 0 processed + re-queued → "LLM переставлен: N"
- **Файлы**: `CollectionLogs.tsx`

### 31. Умный `getEmployeeSummary()` в логах
- **Было**: Всегда `"N/M (extras)"`
- **Стало**: Контекстно-зависимый текст:
  - Только re-queue → `"LLM: N переставлено"`
  - Все пропущены → `"0/N (N пропущено)"`
  - Stopped → `"N/M (остановлен, ...)"`
- **Файлы**: `CollectionLogs.tsx`

### 32. lastCollection расширен в API подписок
- **Было**: `lastCollection` содержал только `status`, `completedAt`, `processedEmployees`, `totalEmployees`
- **Стало**: Добавлены `skippedEmployees`, `failedEmployees`, `reQueuedEmployees`, `llmTotal`, `llmCompleted`, `llmFailed`, `llmSkipped`
- **Файлы**: `subscriptions.service.ts`, `frontend/types/subscription.ts`

### 33. Cancel обновляет llmSkipped в CollectionLog
- **Было**: При отмене LLM-задачи обновлялся только `MetricReport.llmStatus`, но не CollectionLog
- **Стало**: `cancelCollections()` подсчитывает skipped reports по подписке и обновляет `collectionLog.llmSkipped`
- **Файлы**: `collection.service.ts`

### Изменённые файлы (Prompt 22.4)
| Файл | Изменение |
|------|-----------|
| `collection-log.entity.ts` | 4 новых поля: `llmTotal`, `llmCompleted`, `llmFailed`, `llmSkipped` |
| `Migration20260226100000` | Миграция: 4 новых колонки в `collection_logs` |
| `collection.worker.ts` | `collectionLogId` в `CollectedReport`, `llmTotal` при финализации |
| `llm.worker.ts` | `updateCollectionLogLlm()` инкрементирует LLM счётчики |
| `llm.types.ts` | `collectionLogId?: string` в `LlmTask` |
| `llm.service.ts` | `collectionLogId` в `enqueueReports` |
| `collection.state.ts` | `getLlmQueueBySubscription()` метод |
| `collection.service.ts` | `llmQueueBySubscription` в state response, LLM поля в логах, llmSkipped в cancel |
| `subscriptions.service.ts` | Расширенный `lastCollection` |
| `frontend/types/collection.ts` | `LlmSubscriptionStatus`, `llmQueueBySubscription`, LLM поля в log entry |
| `frontend/types/subscription.ts` | Расширенный `lastCollection` |
| `SubscriptionCard.tsx` | Два индикатора: `getDataStatusLine()`, `getLlmStatusLine()` |
| `CollectionLogs.tsx` | `getSmartStatusBadge()`, улучшенный `getEmployeeSummary()` |
| `CollectionPage.tsx` | `getLlmSubscriptionStatus()`, проп `llmSubscriptionStatus` |

### Сценарий 21: Два индикатора на карточке
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Idle, последний сбор completed, LLM done | Данные: "Собрано N/M" (зелёная), LLM: "Завершён N/N" (зелёная) | OK |
| Idle, данные собраны, LLM ещё идёт | Данные: "Собрано N/M", LLM: "Обработка 2/5" (из llmQueueBySubscription) | OK |
| Idle, данные с ошибками | Данные: "Собрано N/M (K ошибок)" (amber) | OK |
| Idle, все пропущены | Данные: "Без изменений" (серая) | OK |
| Re-queue (0 processed, N re-queued) | Данные: не показывается (0 processed + re-queue = нет данных), LLM: из очереди | OK |
| LLM cancelled (skipped > 0) | LLM: "Отменён N/M" (серая) | OK |
| Running/pending/stopping | Индикаторы скрыты, показан прогрессбар | OK |

### Сценарий 22: Умные статусы логов
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| completed + llmTotal > 0 + llmCompleted === llmTotal | Badge: "Успешно N/M" (зелёный) | OK |
| completed + llmTotal > 0 + llmCompleted < llmTotal | Badge: "Данные собраны N/M" (зелёный) | OK |
| completed + 0 processed + reQueued > 0 | Badge: "LLM переставлен: N" (зелёный) | OK |
| stopped | Badge: "Остановлен N/M", summary: "N/M (остановлен)" | OK |
| Только re-queue в summary | "LLM: N переставлено" | OK |
| Все пропущены в summary | "0/N (N пропущено)" | OK |

---

## Prompt 22.5 — Карточка показывает актуальное состояние, а не последний лог (2026-02-26)

### Проблемы

1. "Данные: Собраны (2/3)" — карточка брала данные из последнего `CollectionLog`, а не из реальных `MetricReport`. После двух частичных сборов (1/3 + 2/3) итого 3/3 MetricReport, но карточка показывала "2/3"
2. "LLM: Отменён" — LLM-статус читался из старого `CollectionLog`, хотя отчёты уже были в LLM-очереди

### Исправления

### 34. `currentPeriodStatus` из реальных MetricReport
- **Было**: Карточка читала `lastCollection` (счётчики из `CollectionLog`) — отражало один конкретный запуск
- **Стало**: `GET /api/subscriptions` включает `currentPeriodStatus` — агрегат из `metric_reports` за текущий период. SQL с CTE: предпочитает текущую неделю, fallback на последний `period_start`. Данные: `dataCollected`, `llmCompleted/Pending/Processing/Failed/Skipped`, `totalEmployees`
- **Файлы**: `subscriptions.service.ts`

### 35. SubscriptionCard использует `currentPeriodStatus` вместо `lastCollection`
- **Было**: `getDataStatusLine(lastCol, ...)` и `getLlmStatusLine(..., lastCol)` — читали счётчики одного запуска
- **Стало**: `getDataStatusLine(subscription.currentPeriodStatus, ...)` и `getLlmStatusLine(..., subscription.currentPeriodStatus)` — читают реальное состояние данных. Live polling приоритетнее при активном LLM
- **Файлы**: `SubscriptionCard.tsx`

### 36. Обновление подписок при завершении LLM
- **Было**: `loadSubscriptions()` вызывался только при завершении YouTrack-фазы (`onCollectionDone`). LLM-статус в `currentPeriodStatus` оставался stale после завершения LLM
- **Стало**: `onLlmDone` callback в collection store — детектирует переход `llmQueue` из непустой в пустую. `CollectionPage` подписывается и вызывает `loadSubscriptions()` + обновляет логи
- **Файлы**: `collection.store.ts`, `CollectionPage.tsx`

### Изменённые файлы (Prompt 22.5)
| Файл | Изменение |
|------|-----------|
| `subscriptions.service.ts` | `getCurrentWeekMonday()`, raw SQL агрегат `metric_reports`, `currentPeriodStatus` в ответе |
| `frontend/types/subscription.ts` | `CurrentPeriodStatus` интерфейс, поле в `Subscription` |
| `SubscriptionCard.tsx` | `getDataStatusLine()` и `getLlmStatusLine()` переписаны на `currentPeriodStatus`. Убраны `Info`, `XCircle` |
| `collection.store.ts` | `_onLlmDone` callback, `onLlmDone()` метод, детекция завершения LLM в `fetchState()` |
| `CollectionPage.tsx` | `onLlmDone` подписка, refresh при завершении LLM |

### Сценарий 23: Два сбора — карточка показывает суммарное состояние
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Первый сбор: 1/3 → остановлен | MetricReport: 1 шт | OK |
| Второй сбор (overwrite=false): 2/3 (1 пропущен) | MetricReport: 3 шт (1+2) | OK |
| Карточка "Данные" | "✅ Собраны (3/3)" — из currentPeriodStatus | OK |
| LLM | "⏳ В очереди" или "🔄 Анализ" — не "Отменён" | OK |

### Сценарий 24: LLM завершается постепенно
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Данные 3/3, LLM в очереди | LLM: "⏳ В очереди (3)" (live polling) | OK |
| LLM обрабатывает | LLM: "🔄 Анализ (1/3)" (live polling) | OK |
| Все завершены, polling остановлен | LLM: "✅ Завершён (3/3)" (из currentPeriodStatus) | OK |

### Сценарий 25: Частичные данные
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Сбор: 2/3 (1 ошибка YouTrack) | MetricReport: 2 шт | OK |
| Карточка "Данные" | "⚠️ Частично (2/3)" | OK |
| LLM завершает для 2 | "✅ Завершён (2/2)" | OK |

### Сценарий 26: Перезагрузка страницы
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Данные 3/3, LLM 2/3 completed | Перезагрузить страницу | OK |
| Карточка сразу из currentPeriodStatus | Данные: "✅ 3/3", LLM: "⚠️ 2/3 (1 не обработано)" | OK |

### Сценарий 27: Нет данных
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Новая подписка, сбор не запускался | currentPeriodStatus: null | OK |
| Карточка | "Сбор ещё не выполнялся" — без строк Данные/LLM | OK |

---

## Prompt 22.5.2 — LLM-прогресс: объединить очередь и общее состояние (2026-02-26)

### Проблема
При re-queue 1 отчёта из 3, карточка показывала "LLM-анализ (0/1) 0%" — прогресс считался только из очереди (pending+processing), игнорируя уже завершённые отчёты. Ожидание: "Анализ (2/3) 66%".

### Исправления

### 37. LLM-прогресс использует `dataCollected` как общий total
- **Было**: `getLlmStatusLine()` использовал `llmSubStatus.total` (количество в очереди) → при re-queue 1 из 3 показывало "Анализ (0/1)". Прогрессбар считал `llmTotal = llmRemaining + llmProcessed` — тоже только очередь
- **Стало**: `total = currentPeriodStatus.dataCollected` (общее количество отчётов). `alreadyDone = total - inProgress`. Прогрессбар: `llmTotal = dataCollected`, `llmDone = dataCollected - llmRemaining`. Fallback на очередь если `currentPeriodStatus` недоступен
- **Файлы**: `SubscriptionCard.tsx`

### Изменённые файлы (Prompt 22.5.2)
| Файл | Изменение |
|------|-----------|
| `SubscriptionCard.tsx` | `getLlmStatusLine()`: `total = currentPeriod.dataCollected`, `alreadyDone = total - inProgress`. Прогрессбар: `llmTotal = dataCollected`, `llmDone = dataCollected - llmRemaining` |

### Сценарий 28: Re-queue 1 из 3 — LLM-прогресс в контексте
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| 2/3 LLM completed, 1 skipped | Повторный запуск (overwrite=false) → re-queue 1 | OK |
| Карточка во время LLM | "LLM: 🔄 Анализ (2/3)" 66% — НЕ "0/1" | OK |
| Завершение | "LLM: ✅ Завершён (3/3)" | OK |

### Сценарий 29: Полный сбор 3/3 — LLM с нуля
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| 3 отчёта в LLM-очереди | "🔄 Анализ (0/3)" → "(1/3)" → "(2/3)" → "✅ 3/3" | OK |
| Прогрессбар | 0% → 33% → 66% → скрыт (idle) | OK |

### Сценарий 30: Остановка во время LLM
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| 1/3 LLM completed, остановили | Idle: "LLM: ⚠️ 1/3 (2 не обработано)" | OK |

---

## Результаты проверки (актуально на 2026-02-26)

| Проверка | Результат |
|----------|-----------|
| `npm run lint` (backend) | 0 ошибок |
| `npm run lint` (frontend) | 0 ошибок |
| `npx tsc --noEmit` (backend) | 0 ошибок |
| `npx tsc --noEmit` (frontend) | 0 ошибок |
| Все 9 статусов CollectionLog | Реализованы |
| Все 3 статуса MetricReport | Реализованы |
| Все 5 статусов llmStatus | Реализованы |
| 47 сценариев (включая 20b, 20c, 23-47) | Все проверены и работают |
| Каждый запуск = новый лог | Реализовано |
| ConflictError 409 | Реализован |
| Retry с exponential backoff | Реализован (3 попытки) |
| Multi-week support | Реализован |
| Frontend группировка логов | 3 режима |
| Frontend фильтры | Статус + тип |
| Frontend чекбоксы проектов | CollectAllModal |
| Frontend кнопки Cancel/Stop/Stopping/LLM | SubscriptionCard |
| Delete during collection | Сценарий 12 |
| LLM stop без stale cancel flag | Fix 22.1 |
| Cron type filter в trigger-all | Fix 22.2 |
| getEmployeeSummary скобки | Fix 22.2 |
| LLM re-queue для неполных отчётов | Fix 22.3 |
| reQueuedEmployees в логах | Fix 22.3 |
| Статус completed при re-queue | Fix 22.3 |
| Два индикатора на карточке (Данные + LLM) | Fix 22.4 |
| LLM-счётчики в CollectionLog | Fix 22.4 |
| llmQueueBySubscription в API | Fix 22.4 |
| Умные статусы логов (getSmartStatusBadge) | Fix 22.4 |
| Контекстный getEmployeeSummary | Fix 22.4 |
| lastCollection расширен | Fix 22.4 |
| Cancel обновляет llmSkipped в логе | Fix 22.4 |
| currentPeriodStatus из реальных MetricReport | Fix 22.5 |
| SubscriptionCard на currentPeriodStatus | Fix 22.5 |
| onLlmDone → refresh подписок | Fix 22.5 |
| LLM-прогресс с dataCollected как total | Fix 22.5.2 |
| Карточка = только активный процесс | Fix 22.6 |
| Stop отменяет ВСЁ (YouTrack + LLM) | Fix 22.6 |
| Читаемые тексты в логах | Fix 22.6 |
| LLM-секция показывается корректно | Fix 22.7.1 |
| Удаление логов (одного и всех) | Fix 22.7.1 |
| Стрелка ChevronRight с анимацией | Fix 22.7.1 |
| Модалка подтверждения удаления | Fix 22.7.1 |
| Всего найдено и исправлено проблем | 50 |

---

## Prompt 22.6 — Карточка = только активный процесс, Stop отменяет ВСЁ, читаемые логи (2026-02-26)

### Проблемы

1. Карточка смешивала процесс и результат — "Данные: Собраны (3/3)", "LLM: Отменён" показывались в idle-состоянии, руководитель путался: это сейчас или уже было?
2. Stop во время YouTrack не отменял LLM для уже собранных — MetricReport с `llmStatus: 'pending'` оставались в БД, `currentPeriodStatus` показывал "LLM: В очереди (1)"
3. Тексты в логах непонятны — "LLM переставлен: 3", "LLM: 3 переставлено"

### Исправления

### 38. Карточка показывает ТОЛЬКО активный процесс
- **Было**: В idle-состоянии показывались строки "Данные: ..." и "LLM: ..." из `currentPeriodStatus` — результат прошлого сбора
- **Стало**: Удалены `getDataStatusLine()`, `getLlmStatusLine()`, интерфейс `StatusLine`, секция "Two status lines". Idle-карточка: только "Последний сбор: дата" + кнопка. Active: прогресс-бары (без изменений)
- **Файлы**: `SubscriptionCard.tsx`, `CollectionPage.tsx`

### 39. Stop отменяет ВСЁ — pending MetricReports в БД
- **Было**: `cancelCollections()` удалял LLM-задачи из in-memory очереди (`skipLlmItemsForSubscriptions`), но MetricReports, созданные во время YouTrack-фазы и ещё НЕ enqueued, оставались с `llmStatus: 'pending'` в БД
- **Стало**: Дополнительный запрос `find(MetricReport, {subscription IN validIds, llmStatus: 'pending'})` помечает как `'skipped'`
- **Файлы**: `collection.service.ts`

### 40. Читаемые тексты в логах
- **Было**: Badge "LLM переставлен: 3", summary "LLM: 3 переставлено"
- **Стало**: Badge "LLM запущен" (info), summary "3 отчёта". `skipped` → "данные актуальны". `cancelled` → "—". "пропущен" вместо "пропущено", "LLM запущено" вместо "LLM переставлено"
- **Файлы**: `CollectionLogs.tsx`

### Изменённые файлы (Prompt 22.6)
| Файл | Изменение |
|------|-----------|
| `SubscriptionCard.tsx` | Удалены `getDataStatusLine()`, `getLlmStatusLine()`, `StatusLine`, секция "Two status lines". Убран prop `llmSubscriptionStatus`. Импорт `CheckCircle`, `AlertTriangle` удалён |
| `CollectionPage.tsx` | Удалены `getLlmSubscriptionStatus()`, prop `llmSubscriptionStatus`, импорт `LlmSubscriptionStatus` |
| `collection.service.ts` | В `cancelCollections()`: доп. запрос к MetricReport с `llmStatus: 'pending'` → `'skipped'` |
| `CollectionLogs.tsx` | `getSmartStatusBadge()`: убраны N/M из бейджа, re-queue → "LLM запущен". `getEmployeeSummary()`: re-queue → "N отчёта", skipped → "данные актуальны", cancelled → "—" |

### Сценарий 31: Полный сбор — карточка
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Запуск → YouTrack 3/3 → LLM 3/3 | Прогресс YouTrack → прогресс LLM | OK |
| Карточка после завершения | Чистая: "Последний сбор: дата" + "Запустить" | OK |
| НЕТ строк "Данные: ..." и "LLM: ..." | Только дата + кнопка | OK |

### Сценарий 32: Stop во время YouTrack
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Запуск → 1/3 → Stop | Текущий сотрудник дообрабатывается | OK |
| MetricReport для 1-го → llmStatus: skipped | НЕ 'pending' | OK |
| Карточка: чистая | "Последний сбор: дата", НЕТ "LLM: В очереди" | OK |
| Лог: "Остановлен · 1/3" | | OK |

### Сценарий 33: Stop во время LLM
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| YouTrack 3/3 → LLM 1/3 → Stop | LLM задачи 2 и 3 → skipped | OK |
| Карточка: чистая | | OK |

### Сценарий 34: Повторный запуск после stop (overwrite=false)
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| После сценария 32: MetricReport 1 шт (llmStatus: skipped) | | OK |
| Запуск → 2 новых YouTrack + 1 re-queue LLM | processedCount=2, reQueuedCount=1 | OK |
| Лог: "Успешно · 2/3 (1 пропущен, 1 LLM запущено)" | | OK |

### Сценарий 35: Все данные актуальны
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Все MetricReport: llmStatus: completed | Запуск (overwrite=false) | OK |
| Все пропущены | Карточка: мгновенно чистая | OK |
| Лог: "Без изменений · данные актуальны" | | OK |

### Сценарий 36: LLM "В очереди" после Stop (регрессия)
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Запуск → 1/3 YouTrack → Stop | | OK |
| Карточка: чистая. НЕТ "LLM: В очереди (1)" | Потому что MetricReport.llmStatus = skipped | OK |

---

## Prompt 22.7 — Раскрывающиеся логи с детальной информацией (2026-02-26)

### Проблемы

1. Таблица логов показывала только базовую информацию — для понимания деталей нужно было лезть в БД
2. Нет детализации по сотрудникам: кто обработан, у кого ошибка, у кого LLM пропущен
3. Группировка "По проекту" избыточна при наличии фильтра по проекту

### Исправления

### 41. Новые поля `youtrackDuration` и `llmDuration` в CollectionLog
- **Было**: Только общий `duration` (от начала до конца YouTrack-фазы)
- **Стало**: `youtrackDuration` — время YouTrack-фазы (записывается collection.worker при финализации). `llmDuration` — время LLM-фазы (записывается llm.worker при завершении последнего отчёта)
- **Файлы**: `collection-log.entity.ts`, миграция, `collection.worker.ts`, `llm.worker.ts`

### 42. API endpoint GET /logs/:logId/details
- **Было**: Нет способа получить детализацию по сотрудникам
- **Стало**: Эндпоинт возвращает `logId`, `startedAt`, `completedAt`, `overwrite`, `youtrackDuration`, `llmDuration`, `employees[]` с `dataStatus` и `llmStatus` для каждого. Статусы вычисляются из MetricReport + errors[]
- **Файлы**: `collection.service.ts`, `collection.routes.ts`

### 43. Accordion-логи с lazy-load деталей
- **Было**: Таблица с раскрытием только для логов с ошибками. Развёрнутый вид — просто список ошибок
- **Стало**: Любой лог раскрывается. При первом клике — lazy-load через API, спиннер, кэш в Map. Развёрнутый вид: общая инфо + YouTrack секция + LLM секция + таблица сотрудников. Описания формируются на фронте
- **Файлы**: `CollectionLogs.tsx`

### 44. Убрана колонка "Время" из свёрнутого вида
- **Было**: Колонка "Время" в таблице (малоинформативна в свёрнутом виде)
- **Стало**: Длительность перенесена в развёрнутый вид (секции YouTrack и LLM)
- **Файлы**: `CollectionLogs.tsx`

### 45. Группировка: убрано "По проекту"
- **Было**: 3 группировки: дата, проект, период
- **Стало**: 2 группировки: дата (default), период. Фильтр по проекту остаётся
- **Файлы**: `CollectionLogs.tsx`, `frontend/types/collection.ts`

### Изменённые файлы (Prompt 22.7)
| Файл | Изменение |
|------|-----------|
| `collection-log.entity.ts` | Добавлены `youtrackDuration`, `llmDuration` (int, default 0) |
| `Migration20260226200000` | Миграция: 2 новых колонки |
| `collection.worker.ts` | Запись `youtrackDuration` перед финализацией |
| `llm.worker.ts` | Запись `llmDuration` при завершении всех LLM-задач |
| `collection.service.ts` | Метод `getLogDetails()` — детали по сотрудникам |
| `collection.routes.ts` | `GET /collection/logs/:logId/details` |
| `frontend/types/collection.ts` | `EmployeeDetail`, `LogDetails`, `LogGroupBy` = date/period |
| `frontend/api/endpoints/collection.ts` | `getLogDetails()` |
| `CollectionLogs.tsx` | Полная переработка: accordion, lazy-load, DetailPanel, EmployeeRow, убрана колонка "Время", 2 группировки |

### Сценарий 37: Раскрытие успешного лога
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Клик на строку "✅ Успешно 3/3" | Спиннер → загрузка деталей | OK |
| Развёрнутый вид | YouTrack ✅ за Xс, LLM ✅ за Yс | OK |
| Сотрудники | 3 строки: все ✅ данные ✅ LLM ✅ | OK |

### Сценарий 38: Раскрытие остановленного
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Клик на "⏹ Остановлен 1/3" | Развёрнутый вид | OK |
| YouTrack | ⏹ Остановлен — 1/3, описание про остановку | OK |
| LLM | ⏹ Отменён | OK |
| Сотрудники | 1 ✅, 2 ⏹ (не обработан) | OK |

### Сценарий 39: Раскрытие с ошибкой
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Клик на "⚠️ Частично 2/3" | Развёрнутый вид | OK |
| YouTrack | ⚠️ Частично — 2/3, описание ошибки | OK |
| Сотрудники | 2 ✅, 1 ❌ с текстом ошибки | OK |

### Сценарий 40: Повторное раскрытие (кэш)
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Развернуть → свернуть → развернуть | Детали закэшированы | OK |
| Повторный запрос | НЕ отправляется | OK |

### Сценарий 41: Группировка
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| "По дате" (default) | Группы: "26 февраля 2026" | OK |
| "По периоду" | Группы: "17–23 февраля 2026" | OK |
| Кнопки "По проекту" | Нет (удалена) | OK |

---

## Prompt 22.7.1 — Фиксы раскрывающихся логов + удаление логов (2026-02-26)

### Проблемы

1. В развёрнутом виде отсутствовала секция LLM (условие `llmTotal === 0` скрывало секцию при re-queue)
2. Время youtrackDuration/llmDuration не видно, если секция LLM скрыта
3. Нет возможности удалить логи (один или все)
4. Стрелка раскрытия (▸/▾) мелкая и незаметная

### Исправления

### 46. LLM-секция показывается корректно
- **Было**: `getLlmSection()` — условие `log.llmTotal === 0 && log.status !== 'stopped'` скрывало LLM при re-queue (`reQueuedEmployees > 0`, но `llmTotal === 0`). Также `withData === 0` скрывало при пустых данных
- **Стало**: Условие заменено на проверку `hasLlmActivity` (есть ли любые не-skipped LLM статусы, или `llmTotal > 0`, или `reQueuedEmployees > 0`). Убрана дублирующая проверка `!isSkipped` в рендере — теперь `getLlmSection()` сам возвращает `null` для skipped
- **Файлы**: `CollectionLogs.tsx`

### 47. Расширенные статусы LLM в развёрнутом виде
- **Было**: Текст "Анализ переставлен в очередь" (непонятно), "Частично" без деталей
- **Стало**: Контекстные описания: "Анализ завершён" / "Отменён при остановке сбора" / "В очереди (N ожидают)" / "Формульный расчёт" (все failed) / "Частично N/M (K на формулах, L отменено)" / "В обработке"
- **Файлы**: `CollectionLogs.tsx`

### 48. Удаление логов — бэкенд
- **Было**: Нет API для удаления логов
- **Стало**: `DELETE /api/collection/logs/:logId` — жёсткое удаление одного лога (проверка ownership). `DELETE /api/collection/logs?subscriptionId=uuid` — удаление всех логов пользователя (опционально по проекту). `deleteLog()` и `deleteLogs()` в CollectionService
- **Файлы**: `collection.service.ts`, `collection.routes.ts`

### 49. Удаление логов — фронтенд
- **Было**: Нет UI для удаления
- **Стало**: Кнопка "Очистить логи" над таблицей (появляется при наличии логов). Иконка корзины 🗑 на каждой строке (появляется при hover, CSS `group-hover:opacity-100`). Модальное окно подтверждения с текстом "Это не повлияет на собранные данные и отчёты". `deleteLog()` и `deleteAllLogs()` в API клиенте
- **Файлы**: `CollectionLogs.tsx`, `api/endpoints/collection.ts`

### 50. Стрелка раскрытия — Lucide ChevronRight
- **Было**: Unicode символы `▸` / `▾` — мелкие, незаметные, не анимированные
- **Стало**: Lucide `ChevronRight` 18px, серый цвет, анимация поворота на 90° (`transition-transform duration-200 rotate-90`). Вся строка кликабельная с hover-подсветкой
- **Файлы**: `CollectionLogs.tsx`

### Изменённые файлы (Prompt 22.7.1)
| Файл | Изменение |
|------|-----------|
| `collection.service.ts` | Методы `deleteLog()`, `deleteLogs()` |
| `collection.routes.ts` | `DELETE /collection/logs/:logId`, `DELETE /collection/logs`. Импорт `NotFoundError` |
| `frontend/api/endpoints/collection.ts` | `deleteLog()`, `deleteAllLogs()` |
| `CollectionLogs.tsx` | `getLlmSection()` переписана. ChevronRight вместо ▸/▾. Trash2 иконка на hover. Кнопка "Очистить логи". Модалка подтверждения. Колонка действий |

### Сценарий 42: LLM блок в развёрнутом виде
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Раскрыть успешный лог (3/3, LLM 3/3) | YouTrack ✅ за Xс, LLM ✅ за Yс | OK |
| Раскрыть остановленный лог | LLM ⏹ "Отменён при остановке сбора" | OK |
| Раскрыть "Без изменений" | Секция LLM отсутствует | OK |
| Раскрыть re-queue лог | LLM 🔄 "В очереди (N ожидают)" | OK |

### Сценарий 43: Время выполнения
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Раскрыть лог с youtrackDuration > 0 | "YouTrack: ✅ ... за 18с" | OK |
| Раскрыть лог с llmDuration > 0 | "LLM: ✅ ... за 45с" | OK |
| Duration = 0 или null | Не показывается "за 0с" | OK |

### Сценарий 44: Удаление одного лога
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Hover на строку | Иконка корзины появляется справа | OK |
| Клик на корзину | Модалка: "Удалить запись?" | OK |
| "Отмена" | Модалка закрывается, лог на месте | OK |
| "Удалить" | Лог удалён, список обновлён | OK |
| Развёрнутый лог → удалить | Развёрнутая панель тоже исчезает | OK |

### Сценарий 45: Очистить все логи
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Кнопка "Очистить логи" | Модалка: "Очистить все логи?" с количеством | OK |
| "Очистить" | Все логи удалены, таблица пуста | OK |
| С фильтром по проекту | Удаляются только логи этого проекта | OK |

### Сценарий 46: Удаление не влияет на данные
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Удалить все логи | MetricReport на месте, страницы работают | OK |

### Сценарий 47: Стрелка раскрытия
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Свёрнутая строка | ChevronRight → (18px, серый) | OK |
| Раскрыть строку | Плавный поворот на 90° (200ms) | OK |
| Hover на строку | Подсветка + cursor pointer | OK |

## Prompt 22.7.2 — LLM-секция и длительность в развёрнутом виде (2026-02-26)

### Проблемы (Prompt 22.7.2)
| # | Проблема | Решение |
|---|----------|---------|
| 46 | LLM-секция не отображается — `getLlmSection` скрывала при `!hasLlmActivity` | Убрана проверка `hasLlmActivity`, секция показывается всегда кроме `status === 'skipped'` |
| 47 | Длительность не видна — "YouTrack: ✅ за 18с" вместо отдельного заголовка | Новый layout: "📊 YouTrack [right] 18с" хедер + "✅ Данные собраны — описание" статус |
| 48 | Мета-инфо (Запущен/Завершён) — первый блок, бесполезное | Перемещена вниз мелким текстом |
| 49 | Сотрудники скрыты для `skipped` — `!isSkipped` условие | Убрано условие `!isSkipped`, сотрудники видны всегда |
| 50 | `formatDuration` не поддерживает часы и null | Добавлена обработка null/0 → null, 7200 → "2ч", 7320 → "2ч 2м" |

### Изменённые файлы (Prompt 22.7.2)
| Файл | Изменение |
|------|-----------|
| `CollectionLogs.tsx` | `formatDuration()` — возвращает `null` при 0, добавлены часы. `getLlmSection()` — убрана `hasLlmActivity` проверка, добавлены re-queue/no-data/formula ветки. `DetailPanel` — секции: YouTrack (хедер + статус), LLM (хедер + статус), Сотрудники (всегда), мета-инфо внизу |

### Сценарий 48: LLM-секция всегда видна (кроме skipped)
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Раскрыть "Успешно 3/3" | YouTrack + LLM обе секции видны | |
| Раскрыть "Частично 2/3" | LLM секция: ⚠️ Частично | |
| Раскрыть "Остановлен 1/3" | LLM секция: ⏹ Отменён | |
| Раскрыть "Без изменений" | LLM-секция НЕ показывается | |
| Раскрыть re-queue лог | LLM: 🔄 Запущен — N отчётов в очереди | |

### Сценарий 49: Длительность в заголовке секции
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| YouTrack duration=18 | "📊 YouTrack" (слева) "18с" (справа) | |
| LLM duration=45 | "🤖 LLM-анализ" (слева) "45с" (справа) | |
| LLM duration=7200 | "🤖 LLM-анализ" (слева) "2ч" (справа) | |
| Duration=0 | Время не отображается | |

### Сценарий 50: Мета-информация внизу
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Раскрыть любой лог | "Запущен: ..." мелким серым текстом внизу | |
| Перезапись=true | "Перезапись: да" рядом с датами | |
| Остановленный | "Остановлен: ..." вместо "Завершён:" | |

### Сценарий 51: Сотрудники видны для "Без изменений"
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Раскрыть "Без изменений" | "Сотрудники (N)" со списком | |
| Каждый сотрудник | данные ✅ LLM ✅ (от предыдущего сбора) | |

## Prompt 22.7.3 — LLM-блок и время ВСЕГДА (2026-02-26)

### Проблемы (Prompt 22.7.3)
| # | Проблема | Решение |
|---|----------|---------|
| 51 | LLM-секция скрывалась при `status === 'skipped'` | `getLlmSection` возвращает `SectionInfo` (не `null`), рендер безусловный |
| 52 | Время скрывалось при 0 (`formatDuration` возвращала null) | `formatDuration` всегда возвращает `string`, 0 → "0с" |
| 53 | `{llmSection &&}` условие в DetailPanel | Убрано, LLM-секция рендерится безусловно |
| 54 | `{ytDuration &&}` / `{llmDuration &&}` условия | Убраны, время рендерится безусловно |

### Изменённые файлы (Prompt 22.7.3)
| Файл | Изменение |
|------|-----------|
| `CollectionLogs.tsx` | `formatDuration()` — возвращает `string` (не `null`), 0 → "0с". `getLlmSection()` — возвращает `SectionInfo` (не `null`), добавлена ветка для skipped (completed > 0 → "Завершён"). `DetailPanel` — убраны все условия скрытия LLM-секции и времени |

### Сценарий 52: LLM-блок и время — ВСЕГДА
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Раскрыть "Успешно 3/3" | YouTrack + LLM + время у обоих | |
| Раскрыть "Без изменений" | YouTrack "0с" + LLM "0с" — обе секции видны | |
| Раскрыть "Остановлен" | YouTrack + LLM обе видны с временем | |
| Duration=0 | Показывается "0с" (не скрывается) | |

## Prompt 22.7.4 — Статусы на основе реальных данных MetricReport (2026-02-26)

### Проблемы (Prompt 22.7.4)
| # | Проблема | Решение |
|---|----------|---------|
| 55 | LLM показывает "Не запускался" хотя данные собраны и LLM завершён | Тексты теперь строятся по `employees[].dataStatus` / `llmStatus` из MetricReport, а не по `log.status` |
| 56 | YouTrack special-case для `log.status === 'skipped'` игнорировал employees | Убран special-case, логика полностью employee-driven |
| 57 | Нет контекста "что было в этом запуске" | Добавлено поле `subtext` в SectionInfo — мелкий курсивный текст |

### Изменённые файлы (Prompt 22.7.4)
| Файл | Изменение |
|------|-----------|
| `CollectionLogs.tsx` | `SectionInfo` — добавлено поле `subtext`. `getYouTrackSection()` — employee-driven + subtext по log.status. `getLlmSection()` — employee-driven + subtext. `getEmployeeRowInfo()` — новые тексты (⏳ в очереди, 📐 формула, ⏹ отменён). `DetailPanel` — рендер subtext курсивом |

### Сценарий 53: Реальное состояние — "Без изменений" с готовыми данными
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Раскрыть "Без изменений" | YouTrack: ✅ Данные собраны | |
| LLM-секция | ✅ Анализ завершён | |
| Подтекст YouTrack | "В этом запуске: все данные уже были актуальны" курсивом | |
| Подтекст LLM | "В этом запуске: LLM не запрашивался" курсивом | |
| Сотрудники | данные ✅ LLM ✅ у каждого | |

### Сценарий 54: Реальное состояние — успешный сбор
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| YouTrack | ✅ Данные собраны, время в заголовке | |
| LLM | ✅ Анализ завершён, время в заголовке | |
| Подтекст YouTrack | "В этом запуске: N сотр. обработаны" | |
| Подтекст LLM | "В этом запуске: N отчётов проанализированы" | |

### Сценарий 55: Реальное состояние — остановлен
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| YouTrack | ⚠️ Данные собраны частично / ⏹ Остановлен | |
| LLM | ⏹ Отменён | |
| Подтекст LLM | "В этом запуске: отменён при остановке сбора" | |
| Сотрудники без данных | "— нет данных" вместо "данные актуальны" | |

## Промпт 23: Аудит и рефакторинг бэкенда

### Сценарий 56: После рефакторинга — сбор работает как раньше
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Запустить сбор за 1 неделю | Данные собираются, KPI считаются, LLM анализирует | |
| Проверить логи | Нет ошибок, формат логов не изменился | |
| Фронт видит прогресс | Polling 3с показывает корректные счётчики | |

### Сценарий 57: Recovery после рестарта (оптимизированный)
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| Запустить сбор, остановить сервер во время LLM | Recovery при рестарте подхватывает pending reports | |
| Проверить количество SQL-запросов при recovery | 3-4 batch-запроса вместо N×3 поштучных (было ~234 для 78 отчётов) | |
| UI показывает корректные счётчики после рестарта | llmProcessed восстановлен, прогресс не 0/N | |

### Сценарий 58: Удалённый FormulaScorer не влияет на систему
| Шаг | Ожидание | Статус |
|-----|----------|--------|
| `npx tsc --noEmit` | 0 ошибок | |
| `npm run lint` | 0 ошибок | |
| Сбор + LLM-анализ | score приходит от LLM, formulaScore не записывается | |
| Поле formulaScore в БД | Существует (колонка осталась), но всегда NULL | |
