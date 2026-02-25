# TESTING.md — Аудит механизма сбора метрик

## Дата аудита: 2026-02-25

---

## 1. Бэкенд — Процесс сбора

### 1.1. Запуск сбора (collection.routes.ts, collection.service.ts)

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| POST /api/collection/trigger принимает subscriptionId | OK | Валидация на 400 если отсутствует |
| POST /api/collection/trigger-all запускает все подписки | OK | Последовательно для каждой активной подписки |
| Период по умолчанию = текущая неделя (пн-вс) | OK | `getCurrentWeekRange()` в week-utils.ts |
| Валидация дат | OK | `parseDate()` проверяет формат |
| **overwrite параметр** | **ИСПРАВЛЕНО** | Добавлен `overwrite` в TriggerBody/TriggerAllBody, передается через `triggerCollection()` → `addToQueue()` → worker |
| Нельзя запустить сбор если уже идет по проекту | OK | Проверка `['queued', 'running', 'collecting']` в `triggerCollection()` |
| trigger-all: один лог на проект | OK | Цикл по подпискам, каждая создает свой CollectionLog |

### 1.2. Остановка сбора

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| POST /api/collection/stop принимает subscriptionIds[] | OK | Массив ID |
| POST /api/collection/stop-all останавливает все | OK | Берет все активные подписки владельца |
| **Статус остановленных логов** | **ИСПРАВЛЕНО** | Было `'error'` → стало `'stopped'` |
| **Текст ошибки при остановке** | **ИСПРАВЛЕНО** | Было «отменён» → стало «остановлен пользователем» |
| Текущий сотрудник дообрабатывается | OK | `isCancelled()` проверяется в начале итерации, не прерывает текущий запрос к YT |
| LLM-задачи для остановленного проекта удаляются | OK | `cancelBySubscriptionIds()` чистит `llmQueue` |
| Повторный вызов stop когда ничего не идет → 200 | OK | Возвращает пустой cancelledLogIds |

### 1.3. Статус сбора (collection.service.ts)

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| GET /api/collection/state возвращает текущее состояние | OK | Из in-memory state |
| activeCollections содержит прогресс | OK | Map → Array с id |
| **queue содержит projectName** | **ИСПРАВЛЕНО** | Было `''` → теперь берется из activeCollections по subscriptionId |
| llmQueue и llmProcessed сериализуются | OK | Map → Record для JSON |
| При перезагрузке бэкенда — recovered logs | OK | `recoverInterrupted()` в worker.start() |

### 1.4. Очередь сбора (collection.worker.ts)

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Сотрудники обрабатываются последовательно | OK | Цикл `for...of` |
| Между проектами последовательно | OK | shiftQueue → processTask → poll |
| Если обработка сотрудника упала — логируется, переходит к следующему | OK | try/catch в цикле |
| **Overwrite=false: пропуск существующих отчетов** | **ИСПРАВЛЕНО** | Добавлена проверка `existingReport` перед сбором |
| **Финальный статус allFailed** | **ИСПРАВЛЕНО** | Было `'error'` → стало `'failed'` |
| clearTimeout при остановке | OK | `stop()` очищает pollTimer |

### 1.5. Сбор данных из YouTrack (metrics-collector.ts)

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Запрос задач с фильтром assignee + updated | OK | `fetchIssues()` |
| Work items фильтруются по автору И проекту | OK | `fetchWorkItems()` фильтрует по login и projectShortName |
| Маппинг типов задач через fieldMapping | OK | `resolveIssueType()` |
| completedIssues = задачи с resolved в периоде | OK | Проверка `issue.resolved` в диапазоне |
| overdueIssues = dueDate < now и не resolved | OK | |
| issuesWithoutEstimation = нет estimation | OK | `getEstimation()` возвращает 0 → count++ |
| issuesOverEstimation = spent > estimation | OK | |
| AI-экономия из маппинга | OK | `fieldMapping.aiSavingWorkType` |
| Cycle Time: first start → last end | OK | `calculateAvgCycleTime()` |
| Cycle Time: нет маппинга → null | OK | Проверка `startStatuses.length === 0` |
| Баги после релиза: нет маппинга → 0 | OK | Проверка `releaseStatuses.length === 0` |

### 1.6. Расчет KPI (kpi-calculator.ts)

| KPI | Формула | Edge cases | Результат |
|-----|---------|------------|-----------|
| Загрузка | spent/2400*100 | spent=0 → 0% | OK |
| Точность оценок | min/max*100 | est=0 или spent=0 → null | OK |
| Фокус | productive/total*100 | total=0 → null | OK |
| Ср. сложность | spentHours/completed | completed=0 → null | OK |
| **Скорость закрытия** | completed/total*100 | **ИСПРАВЛЕНО**: completed>total → теперь cap 100% | |
| Cycle Time | avg(cycleTimes) | Пустой массив → null | OK |
| Округление до 1 знака | OK | `Math.round(x * 10) / 10` |

### 1.7. Formula Score (formula-scorer.ts)

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Веса нормализуются по сумме активных | OK | `totalWeight` пересчитывается |
| 0 активных метрик → null | OK | |
| Диапазон 0-100 (clamp) | OK | `Math.max(0, Math.min(100, score))` |
| **Bug penalty: 0 багов = 100 очков** | **ИСПРАВЛЕНО** | Было `value: null` при 0 багах (метрика пропускалась) → теперь `value: 0` → bugPenalty(0) = 100 |
| Утилизация: оптимум 80-100%, штраф >120% | OK | |
| cyclePenalty: < 24h → 100 | OK | |

### 1.8. Сохранение (MetricReport entity)

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Unique constraint [subscription, youtrackLogin, periodStart] | OK | Entity decorator |
| Upsert логика | OK | `findOne` → update или create |
| periodStart = понедельник | OK | backend `getMonday()` |
| createdAt / updatedAt | OK | `onUpdate` hook |
| JSON-поля (issuesByType, spentByType) | OK | `type: 'jsonb'` |

### 1.9. LLM Worker

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Задачи ставятся ПОСЛЕ сохранения MetricReport | OK | `enqueueReports` вызывается после `em.flush()` |
| Rate limiter через intervalMs | OK | `60_000 / rateLimit` |
| При ошибке LLM → fallback на formulaScore | OK | `report.status = 'completed'` с formulaScore |
| LLM результат пишется в существующий report (UPDATE) | OK | `em.flush()` обновляет |
| При остановке → LLM-задачи удаляются | OK | `cancelBySubscriptionIds` чистит llmQueue |
| Keycloak token через TokenService | OK | |
| Recovery pending reports при старте | OK | `recoverPending()` |

### 1.10. Ачивки после сбора

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| evaluateAchievements() после MetricReport | OK | `generateForReport()` вызывается в worker |
| Один раз за уровень | OK | Проверка bestExisting rarity |
| Серии (streaks) | OK | currentStreak++/reset |
| При overwrite — ачивки пересчитываются | OK | `generateForReport()` вызывается заново |
| Ачивки не понижаются (рейтинг) | OK | `isHigherRarity` check |
| Серии могут сброситься | OK | checkResult === null → currentStreak = 0 |

### 1.11. Cron

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| **Cron не запускается если сбор уже идет** | **ИСПРАВЛЕНО** | Добавлена проверка `activeCollections.size > 0 || queue.length > 0` |
| Cron за прошлую неделю | OK | `lastWeekDate.setDate(-7)` |
| Pause/Resume через API | OK | cron.stop() / cron.start() |
| Состояние в collectionState.cronEnabled | OK | In-memory (сбрасывается при перезагрузке — принято) |
| GET /api/collection/cron/state | OK | enabled, schedule, nextRun |

---

## 2. Фронтенд — UI сбора

### 2.1. Страница «Сбор данных»

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Cron индикатор (CronControl) | OK | Зеленый/серый, текст «Активен»/«Приостановлен» |
| Кнопка «Приостановить»/«Возобновить» | OK | С loading state |
| «Запустить всё» / «Остановить всё» переключаются | OK | isGlobalBusy toggle |
| Polling начинается при открытии страницы | OK | `fetchState()` в useEffect |
| Polling останавливается при уходе | OK | `stopPolling()` в cleanup |

### 2.2. Модалка «Запустить всё» (CollectAllModal)

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Список проектов = активные подписки | OK | `subscriptions.filter(isActive)` |
| Период по умолчанию = текущая неделя | OK | `getCurrentWeekRange()` |
| **Неделя начинается с понедельника** | **ИСПРАВЛЕНО** | frontend/utils/week.ts: было Sunday-based → Monday-based |
| Чекбокс «Перезаписать» | OK | По умолчанию выключен |
| **Overwrite передается в API** | **ИСПРАВЛЕНО** | Теперь всегда используется `triggerAll({overwrite})` |
| Валидация: periodStart < periodEnd | OK | |

### 2.3. Модалка «Запустить сбор» (CollectModal)

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Проект отображается | OK | subscription.projectName |
| **Overwrite передается в API** | **ИСПРАВЛЕНО** | Теперь `trigger({overwrite})` вместо backfill/trigger split |

### 2.4. Кнопка «Остановить»

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| На карточке: «Запустить» → «Остановить» | OK | `isBusy` toggle |
| Глобальная: «Запустить всё» → «Остановить всё» | OK | `isGlobalBusy` |
| Loading state при остановке | OK | `stopLoading` / `stopAllLoading` |

### 2.5. Прогресс сбора

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Прогресс бар на карточке проекта | OK | SubscriptionCard |
| **Division by zero guard** | **ИСПРАВЛЕНО** | `totalEmployees > 0` check |
| Текущий сотрудник отображается | OK | `currentEmployee` |
| LLM-прогресс отображается | OK | Отдельный progress bar (purple) |
| Queued индикатор | OK | Пульсирующий amber bar |

### 2.6. Polling и очистка

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Polling запускается при открытии | OK | `fetchState()` → autostart |
| Polling останавливается при уходе | OK | `stopPolling()` cleanup |
| Polling останавливается когда нет активных | OK | `!hasActive → stopPolling()` |
| clearInterval | OK | В `stopPolling()` |
| onCollectionDone callback | OK | Refresh subscriptions + logs |

### 2.7. Перезагрузка страницы во время сбора

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| GET /api/collection/state при загрузке | OK | `fetchState()` в init |
| Если сбор идет → показать прогресс | OK | activeCollections rendering |

### 2.8. Логи сборов

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Таблица с пагинацией | OK | `CollectionLogs` component |
| Фильтр по проекту | OK | Select dropdown |
| **Статус 'stopped'** | **ИСПРАВЛЕНО** | Добавлен Badge «Остановлен» |
| **Статус 'failed'** | **ИСПРАВЛЕНО** | Добавлен Badge «Ошибка» |
| **Статус 'collecting'** | **ИСПРАВЛЕНО** | Добавлен как alias для «Выполняется» |
| X/Y обработано | OK | `processedEmployees/totalEmployees` |
| Expand для ошибок | OK | ChevronDown/Up toggle |
| Один лог = один проект | OK | trigger-all создает по логу на подписку |

### 2.9. LLM-очередь

| Проверка | Результат | Примечание |
|----------|-----------|------------|
| Индикатор на карточке | OK | `llmItems.length > 0` → purple bar |
| Прогресс (processed/total) | OK | `llmProcessed` + `llmRemaining` |

---

## 3. Найденные баги и исправления

### Баг 1: Статус остановки = 'error' вместо 'stopped'
- **Файл**: `collection.service.ts:481`, `collection.worker.ts:247`
- **Проблема**: При остановке пользователем CollectionLog получал `status = 'error'`
- **Исправлено**: Заменено на `'stopped'`, текст ошибки на «Сбор остановлен пользователем»

### Баг 2: Финальный статус allFailed = 'error' вместо 'failed'
- **Файл**: `collection.worker.ts:398`
- **Проблема**: Когда все сотрудники завершились с ошибками, лог получал `'error'` (не отличался от остановки)
- **Исправлено**: `'error'` → `'failed'`

### Баг 3: completionRate не capped at 100%
- **Файл**: `kpi-calculator.ts:60-62`
- **Проблема**: Если `completedIssues > totalIssues` (возможно при пересчетах), rate > 100%
- **Исправлено**: Добавлен `Math.min(rate, 100)`

### Баг 4: Bug penalty скипалась при 0 багах
- **Файл**: `formula-scorer.ts:44`
- **Проблема**: При `bugsAfterRelease + bugsOnTest = 0` значение было `null` → метрика полностью пропускалась, вместо того чтобы давать 100 очков за отсутствие багов
- **Исправлено**: Убрано условие `> 0 ? ... : null`, теперь всегда число

### Баг 5: Overwrite не поддерживался
- **Файлы**: `collection.routes.ts`, `collection.service.ts`, `collection.state.ts`, `collection.worker.ts`
- **Проблема**: API не принимал параметр `overwrite`, worker не проверял существующие отчеты
- **Исправлено**: Добавлен `overwrite` через весь pipeline: routes → service → QueueTask → worker (skip if exists)

### Баг 6: Cron не проверял текущий сбор
- **Файл**: `cron.manager.ts:132`
- **Проблема**: Cron мог запуститься параллельно с ручным или другим cron-сбором
- **Исправлено**: Добавлена проверка `activeCollections.size > 0 || queue.length > 0` → skip

### Баг 7: Frontend неделя начиналась с воскресенья
- **Файл**: `frontend/src/utils/week.ts`
- **Проблема**: `getCurrentWeekRange()` возвращал Sunday-based range, не совпадая с бэкендом (ISO 8601 Monday)
- **Исправлено**: Переписано на Monday-based (пн 00:00 → вс или сегодня)

### Баг 8: Queue items без projectName
- **Файл**: `collection.service.ts:370`
- **Проблема**: В ответе `getCollectionState()` у queue items `projectName` был пустой строкой
- **Исправлено**: Теперь ищет projectName из activeCollections по subscriptionId

### Баг 9: Отсутствие 'stopped'/'failed' в фронтенде
- **Файлы**: `CollectionLogs.tsx`, `SubscriptionCard.tsx`, `types/collection.ts`
- **Проблема**: Новые статусы `'stopped'` и `'failed'` не отображались корректно
- **Исправлено**: Добавлены Badge/индикаторы для всех статусов

### Баг 10: Division by zero в SubscriptionCard
- **Файл**: `SubscriptionCard.tsx:100`
- **Проблема**: `processedEmployees / totalEmployees` при `totalEmployees = 0` давал NaN
- **Исправлено**: Guard `totalEmployees > 0`

### Баг 11: CollectionProgress status type неполный
- **Файлы**: `collection.state.ts:9`, `types/collection.ts:5`
- **Проблема**: Тип status не включал все возможные статусы ('stopped', 'failed', 'running', 'partial')
- **Исправлено**: Расширен до полного набора

---

## 4. Edge cases — работают корректно

| Edge case | Статус |
|-----------|--------|
| 0 подписок → пустая страница | OK |
| 0 активных сотрудников → лог completed (0/0) | OK |
| YouTrack timeout → retry в ytClient, ошибка логируется | OK |
| LLM недоступен → formulaScore используется | OK |
| Overwrite=false + данные уже есть → пропуск | OK |
| Overwrite=true → перезапись + пересчет ачивок | OK |
| Остановка одного проекта из trigger-all → другие продолжают | OK |
| Cron во время ручного сбора → пропуск с логированием | OK |
| Перезагрузка бэкенда → recover interrupted logs | OK |
| Быстрый mount/unmount → polling cleanup | OK |

---

## 5. Результаты

| Проверка | Результат |
|----------|-----------|
| `npm run lint` (backend) | 0 ошибок |
| `npm run lint` (frontend) | 0 ошибок |
| `npx tsc --noEmit` (backend) | 0 ошибок |
| `npx tsc --noEmit` (frontend) | 0 ошибок |
| Статусы CollectionLog: все 6 реализованы | pending, running, completed, partial, stopped, failed |
| Overwrite true/false | Реализовано через весь pipeline |
| Остановка сбора | Корректна, нет утечек |
| Прогресс отображается и восстанавливается | OK |
| Ошибки YouTrack/LLM — graceful handling | OK |
