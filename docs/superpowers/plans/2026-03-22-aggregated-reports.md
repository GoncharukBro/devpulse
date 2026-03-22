# Агрегированные отчёты за произвольный период

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать формирование, хранение и просмотр агрегированных отчётов за произвольный период по сотруднику, проекту или команде.

**Architecture:** Новая сущность `AggregatedReport` хранит снимок агрегированных метрик в jsonb-полях. Backend-сервис агрегирует существующие `MetricReport`-ы за выбранный диапазон недель, LLM генерирует периодную сводку. Frontend — новая страница `/reports` со списком отчётов, модалка создания, страница просмотра `/reports/:id`.

**Tech Stack:** MikroORM (PostgreSQL), Fastify, React, Zustand, Tailwind CSS, Recharts, Lucide icons.

---

## Файловая структура

### Backend — новые файлы

| Файл | Ответственность |
|------|----------------|
| `backend/src/entities/aggregated-report.entity.ts` | Сущность `AggregatedReport` (PG таблица) |
| `backend/src/migrations/Migration20260322000000_aggregated_reports.ts` | Миграция: создание таблицы + индексы |
| `backend/src/common/utils/metrics-utils.ts` | Общие утилиты агрегации (`avgNullable`, `calcMetricTrend`, `calcTrend`) |
| `backend/src/modules/aggregated-reports/aggregated-reports.service.ts` | Бизнес-логика: агрегация, предпросмотр, создание, LLM-сводка |
| `backend/src/modules/aggregated-reports/aggregated-reports.routes.ts` | Fastify-роуты API |
| `backend/src/modules/aggregated-reports/aggregated-reports.types.ts` | DTO-типы для API |
| `backend/src/modules/aggregated-reports/period-llm.prompt.ts` | LLM-промпт для периодной сводки |

### Backend — модифицируемые файлы

| Файл | Что меняется |
|------|-------------|
| `backend/src/entities/index.ts` | Добавить экспорт `AggregatedReport` |
| `backend/src/config/mikro-orm.config.ts` | Добавить `AggregatedReport` в массив entities |
| `backend/src/app.ts` | Зарегистрировать `aggregatedReportsRoutes` |
| `backend/src/modules/reports/reports.service.ts` | Заменить локальные `avgNullable`/`calcMetricTrend`/`calcTrend` на импорт из `common/utils/metrics-utils.ts` |
| `backend/src/modules/llm/llm.service.ts` | Добавить публичный метод `chatCompletion()` |
| `backend/src/server.ts` | Прокинуть `llmService` в роуты агрегированных отчётов |

### Frontend — новые файлы

| Файл | Ответственность |
|------|----------------|
| `frontend/src/pages/ReportsPage.tsx` | Страница `/reports`: список + кнопка «Сформировать» |
| `frontend/src/pages/AggregatedReportPage.tsx` | Страница `/reports/:id`: просмотр одного отчёта |
| `frontend/src/components/reports/CreateReportModal.tsx` | Модалка создания: date picker, выбор уровня/цели |
| `frontend/src/components/reports/ReportStatusBadge.tsx` | Бейдж статуса отчёта (generating/ready/failed) |
| `frontend/src/components/reports/PeriodKpiCards.tsx` | KPI-карточки агрегированного отчёта |
| `frontend/src/components/reports/PeriodWeeklyChart.tsx` | Графики динамики по неделям внутри периода |
| `frontend/src/components/reports/PeriodLlmSummary.tsx` | Блок LLM-сводки за период + понедельные сводки |
| `frontend/src/api/endpoints/aggregated-reports.ts` | API-клиент для агрегированных отчётов |
| `frontend/src/types/aggregated-report.ts` | TypeScript-типы (зеркало backend DTO) |

### Frontend — модифицируемые файлы

| Файл | Что меняется |
|------|-------------|
| `frontend/src/App.tsx` | Добавить роуты `/reports` и `/reports/:id` |
| `frontend/src/components/sidebar/Sidebar.tsx` | Добавить пункт «Отчёты» в навигацию |
| `frontend/src/utils/week.ts` | Добавить утилиты `getMonday`, `getWeekEnd`, `getWeeksCount` (local time, для UI-расчётов) |

---

## Типы данных

### Сущность `AggregatedReport`

```typescript
@Entity({ tableName: prefixedTable('aggregated_reports') })
class AggregatedReport {
  id: string;                          // uuid PK
  type: 'employee' | 'project' | 'team';

  // Цель отчёта (одно из трёх, остальные null)
  targetLogin?: string;               // youtrackLogin для employee — varchar(255)
  targetSubscriptionId?: string;       // subscription.id для project — varchar(255)
  targetTeamId?: string;              // team.id для team — varchar(255)

  // Имя цели (для отображения в списке без JOIN)
  targetName: string;                  // varchar(255)

  periodStart: Date;                   // Понедельник первой недели
  periodEnd: Date;                     // Воскресенье последней недели
  weeksCount: number;

  // Агрегированные метрики (суммы)
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentMinutes: number;
  totalEstimationMinutes: number;

  // Агрегированные KPI (средние)
  avgUtilization?: number;
  avgEstimationAccuracy?: number;
  avgFocus?: number;
  avgCompletionRate?: number;
  avgCycleTimeHours?: number;
  avgScore?: number;

  // Понедельные данные для графиков
  weeklyData: WeeklyDataItem[];        // jsonb

  // Понедельные тренды
  weeklyTrends: WeeklyTrendItem[];     // jsonb

  // Общий тренд за период (первая vs последняя неделя)
  overallTrend: OverallTrend;          // jsonb

  // Понедельные LLM-сводки (уже существующие)
  weeklyLlmSummaries: WeeklyLlmItem[]; // jsonb

  // LLM-сводка за весь период
  llmPeriodScore?: number;
  llmPeriodSummary?: string;           // text
  llmPeriodConcerns?: string[];        // jsonb
  llmPeriodRecommendations?: string[]; // jsonb

  // Для project/team — данные по сотрудникам
  employeesData?: EmployeeAggItem[];   // jsonb

  status: 'generating' | 'ready' | 'failed';
  errorMessage?: string;

  createdBy?: string;                  // userId
  createdAt: Date;
  updatedAt: Date;
}
```

### Вложенные jsonb-типы

```typescript
interface WeeklyDataItem {
  periodStart: string;
  periodEnd: string;
  score: number | null;
  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  completionRate: number | null;
  avgCycleTimeHours: number | null;
  totalSpentHours: number;
  completedIssues: number;
  totalIssues: number;
  overdueIssues: number;
}

interface WeeklyTrendItem {
  periodStart: string;
  // Тренд каждой метрики относительно предыдущей недели
  score: { direction: ScoreTrend; delta: number | null };
  utilization: { direction: ScoreTrend; delta: number | null };
  estimationAccuracy: { direction: ScoreTrend; delta: number | null };
  focus: { direction: ScoreTrend; delta: number | null };
  completionRate: { direction: ScoreTrend; delta: number | null };
}

interface OverallTrend {
  score: { direction: ScoreTrend; delta: number | null };
  utilization: { direction: ScoreTrend; delta: number | null };
  estimationAccuracy: { direction: ScoreTrend; delta: number | null };
  focus: { direction: ScoreTrend; delta: number | null };
  completionRate: { direction: ScoreTrend; delta: number | null };
  spentHours: { direction: ScoreTrend; delta: number | null };
}

interface WeeklyLlmItem {
  periodStart: string;
  score: number | null;
  summary: string | null;
  concerns: string[] | null;
  recommendations: string[] | null;
}

interface EmployeeAggItem {
  youtrackLogin: string;
  displayName: string;
  avgScore: number | null;
  avgUtilization: number | null;
  avgCompletionRate: number | null;
  completedIssues: number;
  totalIssues: number;
  scoreTrend: ScoreTrend;             // тренд только по score
}
```

### API DTO

```typescript
// POST /api/aggregated-reports/preview
interface PreviewRequest {
  type: 'employee' | 'project' | 'team';
  targetId: string;            // login | subscriptionId | teamId
  dateFrom: string;            // YYYY-MM-DD (произвольная дата)
  dateTo: string;              // YYYY-MM-DD (произвольная дата)
}
interface PreviewResponse {
  periodStart: string;         // Округлённый понедельник
  periodEnd: string;           // Округлённое воскресенье
  weeksCount: number;
  targetName: string;          // Имя сотрудника / проекта / команды
  availableWeeks: number;      // Сколько недель есть данные
  aggregatedMetrics: AggregatedMetricsDTO;
  weeklyData: WeeklyDataItem[];
}

interface AggregatedMetricsDTO {
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentHours: number;
  totalEstimationHours: number;
  avgUtilization: number | null;
  avgEstimationAccuracy: number | null;
  avgFocus: number | null;
  avgCompletionRate: number | null;
  avgCycleTimeHours: number | null;
  avgScore: number | null;
}

// POST /api/aggregated-reports
interface CreateRequest extends PreviewRequest {}
interface CreateResponse {
  id: string;
  status: 'generating';
}

// GET /api/aggregated-reports
interface ListQuery {
  type?: string;
  page?: string;
  limit?: string;
}
interface ListResponse {
  data: AggregatedReportListItem[];
  total: number;
  page: number;
  limit: number;
}

interface AggregatedReportListItem {
  id: string;
  type: 'employee' | 'project' | 'team';
  targetName: string;
  periodStart: string;
  periodEnd: string;
  weeksCount: number;
  avgScore: number | null;
  status: 'generating' | 'ready' | 'failed';
  createdAt: string;
}

// GET /api/aggregated-reports/:id
// → полный AggregatedReportDTO (все поля entity + targetName)

// DELETE /api/aggregated-reports/:id
// → 204 No Content
```

---

## Политика доступа

- **list**: отчёты видны всем авторизованным пользователям (не фильтруем по `createdBy`). Отчёты — общие артефакты аналитики, не личные.
- **delete**: любой авторизованный пользователь может удалить отчёт. `createdBy` сохраняется для аудита, но не для ограничения доступа.
- **Дубликаты**: допускаются. Пользователь может сформировать несколько отчётов за один и тот же период для одной цели — это нормально (разные моменты времени, данные могли измениться после пересбора).

---

## Задачи

### Task 1: Сущность AggregatedReport + миграция

**Files:**
- Create: `backend/src/entities/aggregated-report.entity.ts`
- Create: `backend/src/migrations/Migration20260322000000_aggregated_reports.ts`
- Modify: `backend/src/entities/index.ts`
- Modify: `backend/src/config/mikro-orm.config.ts`

- [ ] **Step 1: Создать entity файл**

Создать `backend/src/entities/aggregated-report.entity.ts` с полями по схеме выше.
Использовать паттерны из `metric-report.entity.ts`: `prefixedTable()`, `@PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })`, `@Property({ type: 'jsonb' })` для массивов.

Все target-поля (`targetLogin`, `targetSubscriptionId`, `targetTeamId`) — тип `varchar(255)`, **не uuid**, чтобы не было проблем с валидацией MikroORM.

- [ ] **Step 2: Добавить экспорт в entities/index.ts**

Добавить строку:
```typescript
export { AggregatedReport } from './aggregated-report.entity';
```

- [ ] **Step 3: Зарегистрировать в mikro-orm.config.ts**

Добавить `AggregatedReport` в импорт и массив `entities`.

- [ ] **Step 4: Создать миграцию**

Создать `Migration20260322000000_aggregated_reports.ts` с SQL для создания таблицы `devpulse_aggregated_reports`. Паттерн из существующих миграций: `extends Migration`, `override async up()`, `this.addSql(...)`.

Колонки: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`, `type varchar(20) NOT NULL`, `target_login varchar(255)`, `target_subscription_id varchar(255)`, `target_team_id varchar(255)`, `target_name varchar(255) NOT NULL`, `period_start date NOT NULL`, `period_end date NOT NULL`, `weeks_count int NOT NULL`, числовые метрики (`int DEFAULT 0`, `real`), jsonb-поля (`jsonb DEFAULT '[]'`, `jsonb DEFAULT '{}'`), LLM-поля (`text`, `jsonb`), `status varchar(20) NOT NULL DEFAULT 'generating'`, `error_message text`, `created_by varchar(255)`, timestamps (`created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`).

**Индексы** (добавить после CREATE TABLE):
```sql
CREATE INDEX idx_aggregated_reports_type ON devpulse_aggregated_reports (type);
CREATE INDEX idx_aggregated_reports_status ON devpulse_aggregated_reports (status);
CREATE INDEX idx_aggregated_reports_period ON devpulse_aggregated_reports (period_start, period_end);
CREATE INDEX idx_aggregated_reports_created_at ON devpulse_aggregated_reports (created_at DESC);
```

- [ ] **Step 5: Проверить миграцию**

Run: `cd backend && npx mikro-orm migration:pending`
Expected: одна pending миграция.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/entities/aggregated-report.entity.ts backend/src/entities/index.ts backend/src/config/mikro-orm.config.ts backend/src/migrations/Migration20260322000000_aggregated_reports.ts
git commit -m "feat: add AggregatedReport entity and migration"
```

---

### Task 2: Вынести общие утилиты агрегации

**Files:**
- Create: `backend/src/common/utils/metrics-utils.ts`
- Modify: `backend/src/modules/reports/reports.service.ts`

- [ ] **Step 1: Создать metrics-utils.ts**

Вынести из `reports.service.ts` в `backend/src/common/utils/metrics-utils.ts`:
```typescript
export function avgNullable(values: Array<number | null | undefined>): number | null
export function calcTrend(scores: Array<number | null>, threshold?: number): ScoreTrend
export function calcMetricTrend(current: number | null, prev: number | null, threshold?: number): MetricTrendDTO
export function minutesToHours(minutes: number): number
export function minutesByTypeToHours(byType: Record<string, number>): Record<string, number>
```

Также экспортировать типы `ScoreTrend` и `MetricTrendDTO` из этого файла (или из types).

- [ ] **Step 2: Обновить imports в reports.service.ts**

Заменить локальные определения `avgNullable`, `calcTrend`, `calcMetricTrend`, `minutesToHours`, `minutesByTypeToHours` на импорт из `../../common/utils/metrics-utils`.

Убедиться что `reports.service.ts` работает как раньше — без изменений логики.

- [ ] **Step 3: Коммит**

```bash
git add backend/src/common/utils/metrics-utils.ts backend/src/modules/reports/reports.service.ts
git commit -m "refactor: extract metric aggregation utils to common/utils/metrics-utils"
```

---

### Task 3: Подготовить LLM-сервис для прямых вызовов

**Files:**
- Modify: `backend/src/modules/llm/llm.service.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Добавить метод chatCompletion в LlmService**

```typescript
async chatCompletion(messages: ChatMessage[]): Promise<string | null> {
  if (!this.client) return null;
  return this.client.chatCompletion(messages);
}
```

- [ ] **Step 2: Экспортировать llmService из server.ts для доступа из роутов**

Использовать тот же паттерн что `setLlmServiceRef` для settings:
- Создать `setLlmServiceRef` в `aggregated-reports.routes.ts`
- Вызвать в `server.ts` после инициализации LLM

**Важно**: если `config.authEnabled === false`, то `llmService` будет `null`. В этом случае при создании отчёта LLM-сводка не генерируется, отчёт сразу получает `status = 'ready'` без LLM-полей.

- [ ] **Step 3: Коммит**

```bash
git add backend/src/modules/llm/llm.service.ts backend/src/server.ts
git commit -m "feat: add chatCompletion to LlmService for direct calls"
```

---

### Task 4: Backend — типы и сервис агрегации

**Files:**
- Create: `backend/src/modules/aggregated-reports/aggregated-reports.types.ts`
- Create: `backend/src/modules/aggregated-reports/aggregated-reports.service.ts`

- [ ] **Step 1: Создать файл типов**

`aggregated-reports.types.ts` — все DTO-интерфейсы: `PreviewRequest`, `PreviewResponse`, `AggregatedMetricsDTO`, `CreateRequest`, `CreateResponse`, `AggregatedReportDTO`, `AggregatedReportListItem`, вложенные jsonb-типы (`WeeklyDataItem`, `WeeklyTrendItem`, `OverallTrend`, `WeeklyLlmItem`, `EmployeeAggItem`).

- [ ] **Step 2: Создать сервис — конструктор и метод preview**

```typescript
export class AggregatedReportsService {
  constructor(
    private em: EntityManager,
    private llmService: LlmService | null,  // null если auth отключён
    private orm: MikroORM,                   // для fork() в async callbacks
  ) {}

  async preview(params: PreviewRequest & { userId: string }): Promise<PreviewResponse>
}
```

Логика `preview`:
1. Вызвать `getMonday(new Date(params.dateFrom))` → `periodStart`
2. Вызвать `getWeekRange(new Date(params.dateTo))` → `periodEnd = range.end`
3. Посчитать `weeksCount`
4. Определить `targetName` — в зависимости от `type` найти имя сотрудника/проекта/команды
5. В зависимости от `type`:
   - `employee`: найти `MetricReport` по `youtrackLogin` + `periodStart >= ... AND periodStart <= ...` + подписки пользователя
   - `project`: найти все `MetricReport` по `subscription.id` за период
   - `team`: найти все `MetricReport` по логинам из `TeamMember` за период
6. Агрегировать с использованием `avgNullable()` и `minutesToHours()` из `metrics-utils.ts`
7. Собрать `weeklyData` — для `employee` напрямую из MetricReport, для `project`/`team` агрегировать по неделям по всем сотрудникам
8. Вернуть `PreviewResponse`

- [ ] **Step 3: Добавить метод create**

```typescript
async create(params: CreateRequest & { userId: string }): Promise<{ id: string }>
```

Логика:
1. Выполнить ту же агрегацию что в preview (вынести общую логику в приватный метод)
2. Посчитать понедельные тренды (каждая неделя vs предыдущая) с `calcMetricTrend()`
3. Посчитать общий тренд (первая vs последняя неделя)
4. Собрать понедельные LLM-сводки из MetricReport
5. Для `project`/`team` — собрать `employeesData` (агрегация по каждому сотруднику)
6. Создать `AggregatedReport` entity в БД
7. Если `llmService !== null`:
   - Установить `status = 'generating'`
   - Запустить `generatePeriodLlmSummary(report.id)` через `setImmediate()`
   - **КРИТИЧНО**: внутри callback использовать `this.orm.em.fork()` для нового EntityManager, т.к. оригинальный `em` от HTTP-запроса уже невалиден
8. Если `llmService === null`:
   - Установить `status = 'ready'` (без LLM-полей)
9. Вернуть `{ id }`

- [ ] **Step 4: Добавить методы list, getById, delete**

```typescript
async list(params: { userId: string; type?: string; page?: number; limit?: number }): Promise<ListResponse>
async getById(id: string, userId: string): Promise<AggregatedReportDTO | null>
async delete(id: string, userId: string): Promise<void>
```

Метод `list`: сортировка по `createdAt DESC`, пагинация, опциональный фильтр по `type`. Без фильтра по `createdBy`.
Метод `delete`: удаление без проверки `createdBy`.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/modules/aggregated-reports/
git commit -m "feat: add AggregatedReportsService with preview, create, list, getById, delete"
```

---

### Task 5: Backend — LLM-промпт для периодной сводки

**Files:**
- Create: `backend/src/modules/aggregated-reports/period-llm.prompt.ts`
- Modify: `backend/src/modules/aggregated-reports/aggregated-reports.service.ts`

- [ ] **Step 1: Создать промпт для периодной сводки**

`period-llm.prompt.ts`:

```typescript
export interface PeriodPromptData {
  targetType: 'employee' | 'project' | 'team';
  targetName: string;
  periodStart: string;
  periodEnd: string;
  weeksCount: number;
  aggregatedMetrics: AggregatedMetricsDTO;
  weeklyData: WeeklyDataItem[];
  weeklyLlmSummaries: WeeklyLlmItem[];
}

export function buildPeriodAnalysisPrompt(data: PeriodPromptData): ChatMessage[]
```

System prompt — аналитик продуктивности, анализ за период из N недель.
Формат JSON: `{ "score": <0-100>, "summary": "...", "concerns": ["..."], "recommendations": ["..."] }`.

User prompt — на вход:
- Целевой объект (сотрудник/проект/команда) + период
- Агрегированные метрики (суммы, средние KPI)
- Понедельные скоры + тренды
- Понедельные LLM-сводки (уже существующие — скармливаем как контекст)

Правила: обращать внимание на динамику (рост/спад), аномалии, повторяющиеся проблемы, прогресс по рекомендациям.

- [ ] **Step 2: Реализовать метод generatePeriodLlmSummary в сервисе**

```typescript
private async generatePeriodLlmSummary(reportId: string): Promise<void>
```

Логика:
1. Создать **новый** `em = this.orm.em.fork()` (НЕ использовать `this.em` — он от HTTP-запроса и может быть невалиден)
2. Найти `AggregatedReport` по id через новый em
3. Собрать `PeriodPromptData` из weeklyData + weeklyLlmSummaries
4. Вызвать `this.llmService!.chatCompletion(messages)`
5. Распарсить ответ через `parseLlmResponse()` (переиспользовать из `llm.parser.ts`)
6. Обновить поля `llmPeriodScore`, `llmPeriodSummary`, `llmPeriodConcerns`, `llmPeriodRecommendations`
7. Установить `status = 'ready'` (или `'failed'` при ошибке + записать `errorMessage`)
8. `await em.flush()`

- [ ] **Step 3: Коммит**

```bash
git add backend/src/modules/aggregated-reports/
git commit -m "feat: add period LLM summary generation for aggregated reports"
```

---

### Task 6: Backend — API роуты + регистрация

**Files:**
- Create: `backend/src/modules/aggregated-reports/aggregated-reports.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Создать роуты**

```typescript
import { LlmService } from '../llm/llm.service';

let llmServiceRef: LlmService | null = null;
export function setAggregatedReportsLlmRef(service: LlmService | null): void {
  llmServiceRef = service;
}

export async function aggregatedReportsRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/aggregated-reports/preview
  // POST /api/aggregated-reports
  // GET  /api/aggregated-reports
  // GET  /api/aggregated-reports/:id
  // DELETE /api/aggregated-reports/:id
}
```

В каждом роуте:
- `const em = request.orm.em.fork()`
- `const service = new AggregatedReportsService(em, llmServiceRef, request.orm)`
- Валидация обязательных полей
- `request.user.id` для userId

**Важно**: API path = `/aggregated-reports` (не `/reports`, чтобы не конфликтовать с существующими `reports.routes.ts`).

- [ ] **Step 2: Зарегистрировать в app.ts**

Добавить импорт и `await instance.register(aggregatedReportsRoutes)` в блок регистрации роутов.

- [ ] **Step 3: Вызвать setAggregatedReportsLlmRef в server.ts**

После инициализации LLM-сервиса добавить:
```typescript
import { setAggregatedReportsLlmRef } from './modules/aggregated-reports/aggregated-reports.routes';
// ...
setAggregatedReportsLlmRef(llmService);
```

- [ ] **Step 4: Коммит**

```bash
git add backend/src/modules/aggregated-reports/aggregated-reports.routes.ts backend/src/app.ts backend/src/server.ts
git commit -m "feat: add aggregated reports API routes and wire LLM service"
```

---

### Task 7: Frontend — типы + API-клиент

**Files:**
- Create: `frontend/src/types/aggregated-report.ts`
- Create: `frontend/src/api/endpoints/aggregated-reports.ts`

- [ ] **Step 1: Создать типы**

`aggregated-report.ts` — зеркало backend DTO. Включить все интерфейсы: `AggregatedReportListItem`, `AggregatedReportDTO`, `PreviewRequest`, `PreviewResponse`, `AggregatedMetricsDTO`, `WeeklyDataItem`, `WeeklyTrendItem`, `OverallTrend`, `WeeklyLlmItem`, `EmployeeAggItem`.

- [ ] **Step 2: Создать API-клиент**

```typescript
export const aggregatedReportsApi = {
  async preview(params: PreviewRequest): Promise<PreviewResponse>,
  async create(params: CreateRequest): Promise<{ id: string }>,
  async list(params?: { type?: string; page?: number; limit?: number }): Promise<ListResponse>,
  async getById(id: string): Promise<AggregatedReportDTO>,
  async remove(id: string): Promise<void>,
}
```

Паттерн из `frontend/src/api/endpoints/reports.ts`: использовать `apiClient.get/post/delete`.
API path: `/aggregated-reports/...`.

- [ ] **Step 3: Коммит**

```bash
git add frontend/src/types/aggregated-report.ts frontend/src/api/endpoints/aggregated-reports.ts
git commit -m "feat: add frontend types and API client for aggregated reports"
```

---

### Task 8: Frontend — утилиты недель + модалка создания отчёта

**Files:**
- Modify: `frontend/src/utils/week.ts`
- Create: `frontend/src/components/reports/CreateReportModal.tsx`

- [ ] **Step 1: Добавить утилиты расчёта недель на фронте**

В `frontend/src/utils/week.ts` добавить функции в **local time** (для UI-расчётов, date picker работает в local time):
```typescript
export function getMonday(date: Date): Date        // понедельник (local time)
export function getWeekEnd(date: Date): Date        // воскресенье (local time)
export function getWeeksCount(from: Date, to: Date): number
```

**Важно**: эти функции используют local time (`getDay()`, `setDate()`), потому что `<input type="date">` возвращает дату в local time. Бэкенд сам конвертирует в UTC через `getMonday()` из `week-utils.ts`. Не трогать существующую `getCurrentWeekRange()`.

- [ ] **Step 2: Создать компонент модалки**

Структура `CreateReportModal.tsx`:
1. Props: `open: boolean`, `onClose: () => void`, `onCreated: () => void`
2. Два input[type="date"] — «От» и «До»
3. Под ними — информационный блок: «Будет агрегировано N недель: дд.мм.гг — дд.мм.гг» (вычислять через `getMonday`/`getWeekEnd`/`getWeeksCount`)
4. Select уровня: Сотрудник / Проект / Команда
5. Select цели — зависит от уровня:
   - Сотрудник → список из `reportsApi.getEmployees()`
   - Проект → список подписок (нужен эндпоинт — использовать `subscriptionsApi`)
   - Команда → список из `teamsApi.list()`
6. Кнопка «Предпросмотр» → вызов `aggregatedReportsApi.preview()` → показ быстрой сводки (метрики, кол-во доступных недель)
7. Кнопка «Сформировать» → вызов `aggregatedReportsApi.create()` → `onCreated()`, закрыть модалку, показать toast

Стилизация: паттерн из `EmailReportModal.tsx` — overlay, panel, close button.

- [ ] **Step 3: Коммит**

```bash
git add frontend/src/utils/week.ts frontend/src/components/reports/CreateReportModal.tsx
git commit -m "feat: add CreateReportModal with date range picker and preview"
```

---

### Task 9: Frontend — вспомогательные компоненты

**Files:**
- Create: `frontend/src/components/reports/ReportStatusBadge.tsx`
- Create: `frontend/src/components/reports/PeriodKpiCards.tsx`
- Create: `frontend/src/components/reports/PeriodWeeklyChart.tsx`
- Create: `frontend/src/components/reports/PeriodLlmSummary.tsx`

- [ ] **Step 1: ReportStatusBadge**

Бейдж: `generating` → жёлтый с анимацией pulse, `ready` → зелёный, `failed` → красный.
Паттерн из `StatusBadge.tsx`.

- [ ] **Step 2: PeriodKpiCards**

Карточки: Score, Utilization, EstimationAccuracy, Focus, CompletionRate, CycleTime + общий тренд (стрелка + дельта). Адаптировать паттерн из `EmployeeKpiSection.tsx`.

- [ ] **Step 3: PeriodWeeklyChart**

Графики динамики по неделям. Данные из `weeklyData`. Для каждого KPI — line chart. Понедельные тренды — цветные стрелки на точках. Использовать Recharts (или тот же компонент что используется в `EmployeeChartsSection`).

- [ ] **Step 4: PeriodLlmSummary**

Два раздела:
1. «Сводка за период» — `llmPeriodSummary`, `llmPeriodConcerns`, `llmPeriodRecommendations`, `llmPeriodScore`. Если `status === 'generating'` → показать индикатор загрузки.
2. «Понедельные сводки» — аккордеон/коллапс по неделям из `weeklyLlmSummaries`.

Паттерн из `LlmSummaryBlock.tsx`.

- [ ] **Step 5: Коммит**

```bash
git add frontend/src/components/reports/
git commit -m "feat: add report display components (KPI cards, charts, LLM summary)"
```

---

### Task 10: Frontend — страница списка отчётов

**Files:**
- Create: `frontend/src/pages/ReportsPage.tsx`

- [ ] **Step 1: Создать страницу**

Структура:
1. Заголовок «Отчёты» + кнопка «Сформировать отчёт» (открывает CreateReportModal)
2. Таблица отчётов:
   - Колонки: Тип (иконка), Цель (targetName), Период, Недель, Средний балл, Статус (ReportStatusBadge), Дата создания
   - Пагинация
   - Фильтр по типу (все / сотрудник / проект / команда)
3. Клик по строке → `navigate(/reports/${id})`
4. Кнопка удаления с confirmation (AlertDialog или confirm())

Состояние: `useState` для списка, пагинации, фильтра, модалки.
Загрузка: `useEffect` + `aggregatedReportsApi.list()`.

**Polling**: если в списке есть отчёты со статусом `generating`, запускать polling каждые 5 сек для обновления списка.

- [ ] **Step 2: Коммит**

```bash
git add frontend/src/pages/ReportsPage.tsx
git commit -m "feat: add ReportsPage with report list and create modal"
```

---

### Task 11: Frontend — страница просмотра отчёта

**Files:**
- Create: `frontend/src/pages/AggregatedReportPage.tsx`

- [ ] **Step 1: Создать страницу**

Структура:
1. Хлебные крошки: ← Отчёты
2. Заголовок: тип (иконка) + targetName + период + ReportStatusBadge
3. `PeriodKpiCards` — агрегированные метрики + общие тренды из `overallTrend`
4. `PeriodWeeklyChart` — графики динамики из `weeklyData`
5. Для `project`/`team`: таблица сотрудников из `employeesData` (login, name, avgScore, avgUtilization, completedIssues, scoreTrend)
6. `PeriodLlmSummary` — LLM-сводка за период + понедельные из `weeklyLlmSummaries`

Загрузка: `useParams()` → `aggregatedReportsApi.getById(id)`.
Polling: если `status === 'generating'` → polling каждые 5 сек до `ready`/`failed`.

- [ ] **Step 2: Коммит**

```bash
git add frontend/src/pages/AggregatedReportPage.tsx
git commit -m "feat: add AggregatedReportPage for viewing report details"
```

---

### Task 12: Frontend — роутинг + навигация

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/sidebar/Sidebar.tsx`

- [ ] **Step 1: Добавить роуты в App.tsx**

Внутри `<Route element={<MainLayout />}>` добавить:
```tsx
<Route path="/reports" element={<ReportsPage />} />
<Route path="/reports/:id" element={<AggregatedReportPage />} />
```

Добавить импорты для обеих страниц.

- [ ] **Step 2: Добавить пункт в Sidebar**

В массив `analyticsNav` добавить после «Ачивки»:
```typescript
{ label: 'Отчёты', to: '/reports', icon: FileText },
```

Добавить `FileText` в импорт из `lucide-react`.

- [ ] **Step 3: Проверить навигацию**

Запустить фронтенд, убедиться что пункт в sidebar отображается, переход на `/reports` работает.

- [ ] **Step 4: Коммит**

```bash
git add frontend/src/App.tsx frontend/src/components/sidebar/Sidebar.tsx
git commit -m "feat: add /reports routes and sidebar navigation"
```

---

### Task 13: Полная проверка flow

- [ ] **Step 1: Запустить backend + frontend**
- [ ] **Step 2: Открыть /reports, нажать «Сформировать отчёт»**
- [ ] **Step 3: Выбрать произвольные даты, проверить что отображается корректное количество недель и округлённые даты**
- [ ] **Step 4: Выбрать тип и цель, нажать «Предпросмотр» — проверить быструю агрегацию**
- [ ] **Step 5: Нажать «Сформировать» — проверить что отчёт появляется в списке со статусом generating**
- [ ] **Step 6: Проверить polling — статус должен обновиться до ready (или сразу ready если auth отключён)**
- [ ] **Step 7: Открыть отчёт — проверить что KPI-карточки, графики, LLM-сводка отображаются корректно**
- [ ] **Step 8: Проверить удаление отчёта**
- [ ] **Step 9: Проверить фильтрацию по типу в списке**
- [ ] **Step 10: Финальный коммит (если были правки)**

```bash
git commit -m "fix: integration adjustments for aggregated reports"
```
