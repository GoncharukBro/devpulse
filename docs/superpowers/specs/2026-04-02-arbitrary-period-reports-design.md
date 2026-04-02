# Отчёты за произвольный период с прямым сбором из YouTrack

**Дата:** 2026-04-02
**Статус:** Draft

---

## 1. Цель

Заменить текущую механику формирования отчётов (агрегация уже собранных понедельных MetricReport) на **прямой сбор метрик из YouTrack за произвольный период** с последующим LLM-анализом.

Руководитель выбирает любые даты (например, 3 марта — 15 июня), система собирает данные с YouTrack, вычисляет KPI, и формирует LLM-анализ, пригодный для принятия управленческих решений.

---

## 2. Текущее состояние

- `AggregatedReportsService.create()` читает **существующие** `MetricReport` из БД
- `MetricReport` — понедельные снимки (Monday→Sunday), создаваемые `CollectionWorker`
- Если за выбранный период нет MetricReport'ов — отчёт пустой
- Период округляется до понедельников через `roundPeriod()`
- Предпросмотр (`preview`) показывает уже собранные данные

## 3. Новый flow

```
Пользователь
  │ выбирает тип + цель + dateFrom + dateTo
  │ нажимает "Сформировать"
  ▼
POST /api/aggregated-reports
  │ создаёт AggregatedReport (status: 'collecting')
  │ запускает async pipeline через setImmediate
  ▼
Фаза 1: СБОР (status: 'collecting')
  │ Для каждого сотрудника:
  │   MetricsCollector.collectForEmployee(project, login, dateFrom, dateTo)
  │   KpiCalculator.calculate(rawMetrics)
  │ Сохраняет собранные данные в AggregatedReport.collectedData (JSONB)
  │ Обновляет progress после каждого сотрудника
  ▼
Фаза 2: АГРЕГАЦИЯ (в коде, без LLM)
  │ Группировка метрик по месяцам/неделям/кварталам (адаптивная нарезка)
  │ Расчёт KPI, трендов, типов задач по периодам
  │ Формирование таблицы динамики + топ-20 задач на сотрудника
  ▼
Фаза 3: LLM-АНАЛИЗ (status: 'analyzing')
  │ Уровень 1: per-employee (N вызовов через chatCompletion)
  │ Уровень 2: итоговая сводка (1 вызов, только для project/team)
  │ Обновляет progress после каждого LLM-вызова
  ▼
status: 'ready' / 'failed' / 'partial'
```

### Без промежуточных MetricReport

Собранные данные хранятся в JSONB-полях `AggregatedReport`, не создают записи в `MetricReport`. Это изолирует новую механику от существующего понедельного pipeline (крон, LLM-очередь, backfill).

### Без округления до недель

`dateFrom` и `dateTo` используются как есть. Если пользователь выбрал вторник — период начинается со вторника.

### Без предпросмотра

Кнопка "Предпросмотр" и endpoint `POST /preview` убираются. Пользователь выбирает параметры и сразу нажимает "Сформировать".

---

## 4. Entity: AggregatedReport — изменения

### Новые поля

```typescript
// Статус: добавляем 'collecting' и 'partial'
status: 'collecting' | 'analyzing' | 'ready' | 'failed' | 'partial'

// Прогресс выполнения (JSONB)
progress: {
  phase: 'collecting' | 'analyzing'
  total: number           // общее число шагов в текущей фазе
  completed: number       // завершённых шагов
  currentStep?: string    // "Сбор: Иванов И." / "Анализ: Петров С."
} | null

// Собранные raw-данные (JSONB)
collectedData: {
  employees: Array<{
    login: string
    displayName: string
    subscriptionId: string
    projectShortName: string
    metrics: {
      totalIssues: number
      completedIssues: number
      overdueIssues: number
      totalSpentMinutes: number
      totalEstimationMinutes: number
      issuesByType: Record<string, number>
      issuesWithoutEstimation: number
      issuesOverEstimation: number
      inProgressIssues: number
      bugsAfterRelease: number
      bugsOnTest: number
    }
    kpi: {
      utilization: number | null
      estimationAccuracy: number | null
      focus: number | null
      completionRate: number | null
      avgCycleTimeHours: number | null
    }
    topTasks: Array<{ id: string; summary: string; type: string; spentMinutes: number; overdueDays?: number }>
  }>
} | null
```

### Расширение employeesData

```typescript
employeesData: Array<{
  // Существующие поля (сохраняем)
  youtrackLogin: string
  displayName: string
  avgScore: number | null
  avgUtilization: number | null
  avgCompletionRate: number | null
  completedIssues: number
  totalIssues: number
  scoreTrend: string | null

  // Новые поля — LLM per-employee
  llmScore: number | null
  llmSummary: string | null
  llmConcerns: string[] | null
  llmRecommendations: string[] | null

  // Помесячная динамика (арифметика, не LLM)
  periodBreakdown: Array<{
    label: string               // "2025-01" / "2025-W03" / "2025-Q1"
    totalIssues: number
    completedIssues: number
    overdueIssues: number
    totalSpentHours: number
    utilization: number | null
    estimationAccuracy: number | null
    completionRate: number | null
    issuesByType: Record<string, number>
  }> | null
}> | null
```

### Поля weeklyData, weeklyTrends, weeklyLlmSummaries

Оставляем в entity для обратной совместимости со старыми отчётами. Для новых отчётов не заполняем.

---

## 5. Адаптивная нарезка периодов

Для таблицы динамики в LLM-промпте. Максимум ~18 строк.

```typescript
function chooseGranularity(dateFrom: Date, dateTo: Date): 'week' | 'month' | 'quarter' {
  const days = (dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 60) return 'week';       // до 2 мес → по неделям (макс ~8 строк)
  if (days <= 548) return 'month';     // 2-18 мес → по месяцам (макс ~18 строк)
  return 'quarter';                     // 18+ мес → по кварталам (макс ~8 строк)
}
```

Нарезка применяется при агрегации — `GROUP BY` арифметический, не LLM.

---

## 6. LLM pipeline

### Ограничения

- `LLM_RATE_LIMIT=3` (3 req/min, 20 секунд между вызовами)
- `max_tokens=2000` на ответ
- Модель может быть слабой (`gemma3:4b`) или мощной — архитектура не должна зависеть от модели
- Промпт должен укладываться в ~4000 символов на вызов

### Количество вызовов — фиксированное

```
Отчёт по сотруднику:   1 вызов
Отчёт по проекту/команде (N чел):  N + 1 вызовов
```

Одинаково для любого периода (неделя, месяц, год).

### Уровень 1: per-employee анализ

Один вызов LLM на сотрудника. Промпт содержит:

1. **Агрегированные метрики** за весь период (~200 символов)
2. **Таблица динамики** по периодам с типами задач (~1200-1800 символов)
   - Каждая строка: задачи, закрыто, просрочено, время, загрузка%, точность%, completion%, типы
3. **ТОП-20 задач** — гибридная выборка за весь период (~1000-1600 символов)
   - Топ-10 по spentTime (на что ушло больше всего времени)
   - Топ-5 просроченных (по дням просрочки desc, где проблемы с дедлайнами)
   - Топ-5 бизнес-критичных (по spentTime desc, что было приоритетным)
   - С дедупликацией: если задача попадает в несколько категорий — считается один раз, слот заполняется следующей
   - Каждая задача: ID, summary, тип, потраченное время, дни просрочки (если есть)

Итого: ~2500-4000 символов. Укладывается в контекст любой модели.

Ожидаемый ответ (JSON):
```json
{
  "score": 78,
  "summary": "Развёрнутая сводка 3-5 предложений с анализом динамики",
  "concerns": ["Проблема 1", "Проблема 2"],
  "recommendations": ["Рекомендация 1", "Рекомендация 2"],
  "taskClassification": {
    "businessCritical": ["PROJ-123", "PROJ-456"],
    "technicallySignificant": ["PROJ-789"],
    "bugfixes": ["PROJ-101"],
    "other": ["PROJ-102"]
  }
}
```

### Уровень 2: итоговая сводка (только project/team)

Один вызов LLM. Промпт содержит:

1. **Общие метрики** проекта/команды (~200 символов)
2. **Мини-сводки** от уровня 1: login, displayName, score, summary (обрезанный до ~80 слов) (~1500-2500 символов)

Итого: ~2000-3000 символов.

Ожидаемый ответ (JSON):
```json
{
  "score": 74,
  "summary": "Общая сводка по команде/проекту",
  "concerns": ["Системная проблема 1"],
  "recommendations": ["Стратегическая рекомендация 1"]
}
```

### Fallback при сбоях

- LLM-вызов для сотрудника X failed → `employeesData[X].llmScore = null`, остальные продолжаются
- Итоговый вызов failed → per-employee анализы сохраняются, итоговая сводка пустая
- Все per-employee failed → `status = 'failed'`
- Часть per-employee failed → `status = 'partial'`
- Все succeeded + итоговый succeeded → `status = 'ready'`

### Тайминги

При `LLM_RATE_LIMIT=3`:
- 1 сотрудник: ~20 секунд
- 10 сотрудников: 11 × 20с = ~4 минуты
- 20 сотрудников: 21 × 20с = ~7 минут

Плюс время сбора с YouTrack (1-3 минуты в зависимости от периода и числа сотрудников).

---

## 7. API — изменения

### Убираем

- `POST /api/aggregated-reports/preview` — endpoint и весь preview-функционал

### Меняем

**`POST /api/aggregated-reports`**

Request (без изменений):
```typescript
{ type: 'employee' | 'project' | 'team', targetId: string, dateFrom: string, dateTo: string }
```

Response:
```typescript
{ id: string, status: 'collecting' }
```

Логика: создаёт `AggregatedReport` с `status: 'collecting'`, запускает async pipeline.

### Расширяем

**`GET /api/aggregated-reports/:id`**

Добавляем в DTO:
```typescript
{
  // ... существующие поля ...
  progress: { phase, total, completed, currentStep } | null
  employeesData: Array<{
    // ... существующие поля ...
    llmScore: number | null
    llmSummary: string | null
    llmConcerns: string[] | null
    llmRecommendations: string[] | null
    periodBreakdown: Array<{ label, totalIssues, completedIssues, ... }> | null
  }> | null
}
```

### Оставляем без изменений

- `GET /api/aggregated-reports` (список)
- `DELETE /api/aggregated-reports/:id`
- `GET /api/aggregated-reports/:id/email-preview`

---

## 8. Определение сотрудников для сбора

В зависимости от типа отчёта:

- **employee**: находим все подписки пользователя, где этот login активен → собираем по каждой подписке
- **project**: берём всех активных сотрудников подписки → собираем каждого
- **team**: берём members команды → для каждого находим подписки → собираем

Для каждого сотрудника один вызов `MetricsCollector.collectForEmployee()` за весь период `dateFrom..dateTo`. Если сотрудник участвует в нескольких подписках (для employee/team) — собираем по каждой подписке отдельно, агрегируем в коде.

---

## 9. Сбор данных с YouTrack

### Переиспользуемые компоненты

- `MetricsCollector.collectForEmployee(projectShortName, login, dateFrom, dateTo)` — уже поддерживает произвольные даты
- `KpiCalculator.calculate(rawMetrics)` — без изменений
- `getYouTrackService()` → `getClient(instanceId)` — без изменений

### Retry логика

Аналогично `CollectionWorker.collectWithRetry()`: 3 попытки с exponential backoff (1с, 2с, 4с). Реализуем как утилиту, переиспользуемую и в worker'е, и в отчётах.

### Обновление прогресса

После каждого успешного сбора сотрудника:
```typescript
report.progress = {
  phase: 'collecting',
  total: totalEmployees,
  completed: collectedCount,
  currentStep: `Сбор: ${displayName}`
};
await em.flush();
```

---

## 10. Фронтенд — изменения

### CreateReportModal

- Убираем кнопку "Предпросмотр" и preview-блок
- Убираем текст "Будет агрегировано N нед."
- Оставляем: выбор дат, тип, цель, кнопка "Сформировать"

### ReportStatusBadge

Новые статусы:
- `collecting` — синий, иконка загрузки, "Сбор данных"
- `analyzing` — фиолетовый, иконка мозга/AI, "Анализ"
- `partial` — жёлтый, "Частично готов"

### ReportsPage

Polling уже есть (5 сек для `generating`). Расширяем на `collecting` и `analyzing`.

### AggregatedReportPage

- **Прогресс-бар** при `collecting`/`analyzing`: полоска + текст из `progress.currentStep`
- **Per-employee секция**: карточки с `llmScore`, `llmSummary`, `llmConcerns`, раскрывающийся блок `periodBreakdown`
- **Итоговая сводка**: `llmPeriodScore`, `llmPeriodSummary`, `llmPeriodConcerns`, `llmPeriodRecommendations`

---

## 11. Обратная совместимость

- Старые отчёты (с `weeklyData`, `weeklyLlmSummaries`) продолжают отображаться — поля остаются в entity
- Фронт определяет тип отчёта по наличию `collectedData` (новый) vs `weeklyData` (старый)
- `POST /preview` endpoint можно убрать сразу — фронт перестанет его вызывать
- API `GET /list` возвращает оба типа в одном списке

---

## 12. Обработка ошибок

| Ситуация | Поведение |
|----------|-----------|
| YouTrack недоступен | Retry 3 раза, затем `status: 'failed'`, `errorMessage` |
| Подписка не найдена | `status: 'failed'`, `errorMessage: 'Subscription not found'` |
| Нет активных сотрудников | `status: 'failed'`, `errorMessage: 'No active employees'` |
| LLM недоступен | Метрики сохраняются, LLM-поля пустые, `status: 'partial'` |
| Часть LLM-вызовов failed | Успешные сохраняются, `status: 'partial'` |
| Все LLM-вызовы failed | Метрики есть, LLM нет, `status: 'partial'` |
| Период в будущем | Валидация на API: 400 |
| dateFrom > dateTo | Валидация на API: 400 |

---

## 13. Файлы для изменения

### Backend — изменить

| Файл | Что меняется |
|------|-------------|
| `entities/aggregated-report.entity.ts` | Новые поля: `progress`, `collectedData`, расширение `status` |
| `modules/aggregated-reports/aggregated-reports.service.ts` | Новый `create()` с pipeline, убрать `preview()`, новые private-методы |
| `modules/aggregated-reports/aggregated-reports.types.ts` | Новые типы для DTO, collectedData, periodBreakdown |
| `modules/aggregated-reports/aggregated-reports.routes.ts` | Убрать route preview |
| `modules/aggregated-reports/period-llm.prompt.ts` | Новые промпты: per-employee + summary |

### Backend — создать

| Файл | Назначение |
|------|-----------|
| `modules/aggregated-reports/report-collector.ts` | Прямой сбор из YouTrack (вызов MetricsCollector, retry, прогресс) |
| `modules/aggregated-reports/report-aggregator.ts` | Агрегация: адаптивная нарезка, группировка, KPI по периодам |
| `modules/aggregated-reports/report-llm-pipeline.ts` | Двухуровневый LLM pipeline: per-employee + summary |

### Frontend — изменить

| Файл | Что меняется |
|------|-------------|
| `components/reports/CreateReportModal.tsx` | Убрать preview, упростить |
| `components/reports/ReportStatusBadge.tsx` | Новые статусы: `collecting`, `analyzing`, `partial` |
| `pages/AggregatedReportPage.tsx` | Прогресс-бар, per-employee LLM-карточки, periodBreakdown |
| `types/aggregated-report.ts` | Новые типы |
| `api/endpoints/aggregated-reports.ts` | Убрать `preview()` |

### Миграция БД

Новые nullable колонки в `aggregated_report`: `progress`, `collected_data`. Расширение enum `status`.

---

## 14. Дополнительные уточнения

### Параллельные отчёты

Пользователь может создать несколько отчётов одновременно. Каждый `AggregatedReport` — независимый async pipeline со своим `orm.em.fork()`. Общий ресурс — rate limiter LLM. Если два отчёта анализируются одновременно, LLM-вызовы сериализуются через один `RateLimiter`, что удлиняет время, но не ломает работу.

### Email preview для нового типа отчёта

`GET /:id/email-preview` нужно обновить — использовать `employeesData` с новыми полями (`llmScore`, `llmSummary`, `periodBreakdown`) вместо `weeklyData`/`weeklyLlmSummaries`. Шаблон письма определяет тип отчёта по наличию `collectedData`.

### weeksCount для новых отчётов

Вычисляется приблизительно: `Math.ceil(days / 7)`. Используется только для отображения в списке.

### Отчёт по сотруднику: разбивка по проектам

Если сотрудник участвует в нескольких подписках (проектах), данные собираются по каждой подписке отдельно и хранятся **и по-проектно, и суммарно**:

- `collectedData.employees[]` — содержит отдельную запись на каждую пару (login, subscriptionId). Т.е. Иванов в DevPulse — одна запись, Иванов в CRM — другая.
- `employeesData[]` для типа `employee` содержит:
  - Per-project записи с метриками, KPI, periodBreakdown, topTasks каждого проекта
  - Суммарную запись (`projectName: 'Итого'`) с объединёнными данными:
    - Числовые метрики (задачи, время) — суммируются
    - Процентные KPI (utilization, completion rate) — усредняются
    - topTasks — объединяются и пересортировываются, берутся топ-20 (гибридная выборка)
    - issuesByType — суммы по категориям
    - periodBreakdown — суммарный по месяцам
- LLM-анализ (уровень 1) получает **суммарные** данные + таблицу "проект → основные метрики" для контекста
- На фронте: итоговая карточка + раскрывающийся блок по каждому проекту

### Старый статус 'generating'

В списке отчётов (`GET /list`) старые отчёты могут иметь `status: 'generating'`. Фронт отображает его как раньше. Новые отчёты используют `'collecting'` и `'analyzing'`.
