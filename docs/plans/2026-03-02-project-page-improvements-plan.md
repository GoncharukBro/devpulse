# Улучшение страницы проекта — План реализации

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Улучшить информационную архитектуру ProjectPage: динамическое описание, замена KPI «Сотрудников» на «Списано часов», удаление PeriodIndicator, изменение порядка блоков.

**Architecture:** Добавляем `totalSpentHours` в backend DTO и вычисляем как сумму `totalSpentMinutes / 60` всех отчётов за последний период. На фронте перестраиваем layout ProjectPage: описание с количеством сотрудников и периодом, новая KPI-карточка, другой порядок блоков.

**Tech Stack:** TypeScript, React, MikroORM, Tailwind CSS

---

### Task 1: Добавить totalSpentHours в backend ProjectSummaryDTO

**Files:**
- Modify: `backend/src/modules/reports/reports.types.ts:128-150`

**Step 1: Добавить поле в интерфейс**

В `ProjectSummaryDTO` (строка 142, после `avgCycleTimeHours`) добавить:

```typescript
  totalSpentHours: number | null;
```

**Step 2: Commit**

```bash
git add backend/src/modules/reports/reports.types.ts
git commit -m "feat: add totalSpentHours to ProjectSummaryDTO"
```

---

### Task 2: Вычислить totalSpentHours в getProjectSummary

**Files:**
- Modify: `backend/src/modules/reports/reports.service.ts:364-425`

**Step 1: Добавить вычисление после строки 369** (после `avgCycleTimeHours`)

```typescript
    const totalSpentHours = lastPeriodReports.length > 0
      ? lastPeriodReports.reduce((sum, r) => sum + (r.totalSpentMinutes ?? 0), 0) / 60
      : null;
```

**Step 2: Добавить поле в return-объект** (строка 418, после `avgCycleTimeHours`)

```typescript
      totalSpentHours,
```

**Step 3: Commit**

```bash
git add backend/src/modules/reports/reports.service.ts
git commit -m "feat: compute totalSpentHours in getProjectSummary"
```

---

### Task 3: Добавить totalSpentHours в frontend DTO

**Files:**
- Modify: `frontend/src/types/reports.ts:133-155`

**Step 1: Добавить поле в интерфейс ProjectSummaryDTO**

После строки 146 (`avgCycleTimeHours: number | null;`) добавить:

```typescript
  totalSpentHours: number | null;
```

**Step 2: Commit**

```bash
git add frontend/src/types/reports.ts
git commit -m "feat: add totalSpentHours to frontend ProjectSummaryDTO"
```

---

### Task 4: Добавить tooltip для totalSpentHours

**Files:**
- Modify: `frontend/src/components/metrics/MetricTooltip.tsx:12-55`

**Step 1: Добавить запись в METRIC_TOOLTIPS** (после `avgCycleTimeHours`, строка 54)

```typescript
  totalSpentHours: {
    title: 'Списано часов',
    source: 'YouTrack (work items)',
    description: 'Общее количество часов, списанных сотрудниками за период',
    calculation: 'Сумма списанного времени всех сотрудников проекта',
    interpretation: 'Информационная метрика без оценки «хорошо/плохо»',
  },
```

**Step 2: Commit**

```bash
git add frontend/src/components/metrics/MetricTooltip.tsx
git commit -m "feat: add totalSpentHours metric tooltip"
```

---

### Task 5: Обновить ProjectPage — описание, KPI, порядок блоков

**Files:**
- Modify: `frontend/src/pages/ProjectPage.tsx`

Это основная задача. Нужно внести 4 изменения в один файл.

**Step 1: Добавить import для formatPeriod**

В строке 20, рядом с `formatMetric`:

```typescript
import { formatMetric, formatPeriod } from '@/utils/format';
```

**Step 2: Добавить helper-функцию для склонения**

После строки 22 (перед `function deduplicateRecommendations`):

```typescript
function pluralEmployees(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} сотрудников`;
  if (mod10 === 1) return `${n} сотрудник`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} сотрудника`;
  return `${n} сотрудников`;
}
```

**Step 3: Построить динамическое описание**

Перед return (после `const chartMetrics = ...`, около строки 150), добавить:

```typescript
  const descriptionParts: string[] = [];
  if (summary) {
    descriptionParts.push(pluralEmployees(summary.totalEmployees));
    if (summary.lastPeriodStart && summary.lastPeriodEnd) {
      descriptionParts.push(`Показатели за неделю: ${formatPeriod(summary.lastPeriodStart, summary.lastPeriodEnd)}`);
    }
  }
  const pageDescription = descriptionParts.length > 0
    ? descriptionParts.join(' · ')
    : 'Метрики команды, тренды по неделям и рекомендации по проекту';
```

**Step 4: Заменить статическое описание в PageHeader**

Строка 155: заменить `description="Метрики команды, тренды по неделям и рекомендации по проекту"` на:

```typescript
        description={pageDescription}
```

Также обновить описание в блоках ошибки (строка 94) и «не найден» (строка 114) — оставить оригинальный текст, т.к. summary = null.

**Step 5: Заменить KPI-карточку «Сотрудников» на «Списано часов»**

Удалить строки 214-221 (блок с `loading ? ... : <Card>...Сотрудников...</Card>`).

Вместо него:

```tsx
        <KpiCard
          title="Списано часов"
          value={summary?.totalSpentHours ?? null}
          suffix="ч"
          metric="totalSpentHours"
          loading={loading}
        />
```

**Step 6: Удалить PeriodIndicator из render**

Удалить строки 224-227:

```tsx
      <PeriodIndicator
        periodStart={...}
        periodEnd={...}
      />
```

Также удалить import PeriodIndicator (строка 18).

**Step 7: Переставить блоки — EmployeeTable после LLM-рекомендаций**

Текущий порядок:
1. Concerns (строки 256-259)
2. EmployeeTable (строки 261-279)
3. LLM-рекомендации (строки 281-314)

Новый порядок:
1. Concerns
2. LLM-рекомендации
3. EmployeeTable (последний блок)

Вырезать блок EmployeeTable (строки 261-279) и вставить после блока LLM-рекомендаций (после строки 314).

**Step 8: Обновить getCopyText** — заменить «Сотрудников» на «Списано часов»

В функции `getCopyText` (строка 137):

Было: `\`Сотрудников: ${summary.totalEmployees}\``
Стало: `\`Списано часов: ${formatMetric(summary.totalSpentHours, 'ч')}\``

**Step 9: Commit**

```bash
git add frontend/src/pages/ProjectPage.tsx
git commit -m "feat: redesign ProjectPage layout and KPI cards"
```

---

### Task 6: Проверить сборку

**Step 1: Собрать бэкенд**

```bash
cd backend && npx tsc --noEmit
```

Expected: Success, no errors.

**Step 2: Собрать фронтенд**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Success, no errors.

**Step 3: Commit (если были исправления)**

---

## Итоговая структура ProjectPage

```
1. PageHeader: "{projectName}" + "{N} сотрудник(а/ов) · Показатели за неделю: {start}–{end}"
2. KPI: Score | Загрузка | Точность | Закрытие | Cycle Time | Списано часов
3. График динамики по неделям
4. Обратите внимание (concerns)
5. LLM-рекомендации
6. Сотрудники (таблица)
```
