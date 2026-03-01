# UI/UX Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Реализовать все улучшения из UI/UX аудита — layout, компоненты, страничные доработки.

**Architecture:** Послойный подход: сначала системные изменения (layout, ConcernsList, period indicator), затем компоненты (графики, LLM-сводка), потом страничные доработки. Фронтенд — React + Tailwind + Recharts, бэкенд — NestJS + MikroORM.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Recharts, Zustand, NestJS

---

## Слой 1: Layout и системные изменения

### Task 1: ConcernsList — компактные карточки

Это первая задача, т.к. новый ConcernsList используется в нескольких местах.

**Files:**
- Modify: `frontend/src/components/metrics/ConcernsList.tsx`

**Step 1: Переписать ConcernsList на компактные карточки**

Заменить текущий вертикальный список на grid карточек:

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import ScoreBadge from '@/components/metrics/ScoreBadge';
import type { ConcernItem, OverviewConcernItem } from '@/types/reports';

interface ConcernsListProps {
  concerns: (ConcernItem | OverviewConcernItem)[];
  loading?: boolean;
}

interface GroupedConcern {
  youtrackLogin: string;
  displayName: string;
  projectName?: string;
  severity: 'warning' | 'danger';
  reasons: string[];
  score?: number | null;
}

function groupConcerns(concerns: (ConcernItem | OverviewConcernItem)[]): GroupedConcern[] {
  const map = new Map<string, GroupedConcern>();

  for (const c of concerns) {
    const projectName = 'projectName' in c ? c.projectName : undefined;
    const key = `${c.youtrackLogin}:${projectName ?? ''}`;

    const existing = map.get(key);
    if (existing) {
      existing.reasons.push(c.reason);
      if (c.severity === 'danger') existing.severity = 'danger';
    } else {
      map.set(key, {
        youtrackLogin: c.youtrackLogin,
        displayName: c.displayName,
        projectName,
        severity: c.severity,
        reasons: [c.reason],
        score: 'score' in c ? (c as any).score : null,
      });
    }
  }

  // Sort: danger first, then warning
  return Array.from(map.values()).sort((a, b) => {
    if (a.severity === 'danger' && b.severity !== 'danger') return -1;
    if (a.severity !== 'danger' && b.severity === 'danger') return 1;
    return 0;
  });
}

const INITIAL_SHOW = 5;

export default function ConcernsList({ concerns, loading }: ConcernsListProps) {
  const navigate = useNavigate();
  const grouped = useMemo(() => groupConcerns(concerns), [concerns]);
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <Card>
        <div className="animate-pulse">
          <div className="mb-3 h-5 w-48 rounded bg-gray-200 dark:bg-gray-700/50" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-gray-200 dark:bg-gray-700/50" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (!concerns.length) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <AlertTriangle size={16} />
          <span className="text-sm font-medium">Обратите внимание</span>
        </div>
        <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">Нет активных предупреждений</p>
      </Card>
    );
  }

  const visible = expanded ? grouped : grouped.slice(0, INITIAL_SHOW);
  const hasMore = grouped.length > INITIAL_SHOW;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
          <AlertTriangle size={16} className="text-amber-400" />
          <span className="text-sm font-medium">Обратите внимание</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">({grouped.length})</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((g) => (
          <button
            key={`${g.youtrackLogin}:${g.projectName ?? ''}`}
            onClick={() => navigate(`/employees/${g.youtrackLogin}`)}
            className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-surface-border p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-surface-lighter focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">
              {g.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                  {g.displayName}
                </span>
                {g.score != null && <ScoreBadge score={g.score} size="sm" />}
              </div>
              {g.projectName && (
                <div className="text-xs text-gray-400 dark:text-gray-500">{g.projectName}</div>
              )}
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                <span className={g.severity === 'danger' ? 'text-red-400' : 'text-amber-400'}>●</span>{' '}
                {g.reasons.join(' · ')}
              </div>
            </div>
          </button>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-brand-400 transition-colors hover:bg-brand-500/10"
        >
          {expanded ? (
            <>Свернуть <ChevronUp size={14} /></>
          ) : (
            <>Показать все ({grouped.length}) <ChevronDown size={14} /></>
          )}
        </button>
      )}
    </Card>
  );
}
```

**Важно:** Тип `ConcernItem` может не содержать поле `score`. Проверить типы в `frontend/src/types/reports.ts`. Если `score` нет — убрать ScoreBadge из карточки. Использовать `'score' in c ? c.score : null` для безопасного доступа.

**Step 2: Проверить визуально**

Run: `cd frontend && npm run dev`
Открыть /overview и /projects/:id — убедиться что карточки отображаются в grid, топ-5 видны, «Показать все» работает.

**Step 3: Commit**

```bash
git add frontend/src/components/metrics/ConcernsList.tsx
git commit -m "feat: redesign ConcernsList as compact card grid with top-5 + expand"
```

---

### Task 2: OverviewPage — одноколоночный layout

**Files:**
- Modify: `frontend/src/pages/OverviewPage.tsx:144-178`

**Step 1: Заменить двухколоночный layout на одноколоночный**

Строки 144-178 — блок `{/* Charts + Concerns */}`. Заменить:

```tsx
{/* Было: grid lg:grid-cols-3 с col-span-2 */}
{/* Стало: одноколоночный поток */}
<div className="mb-6">
  {loading ? (
    <Card>
      <div className="animate-pulse">
        <div className="mb-3 h-5 w-40 rounded bg-gray-200 dark:bg-gray-700/50" />
        <div className="h-[280px] rounded bg-gray-200/70 dark:bg-gray-700/30" />
      </div>
    </Card>
  ) : data ? (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp size={16} className="text-gray-500 dark:text-gray-400" />
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Динамика по неделям</h3>
        <InfoTooltip
          title="Динамика по неделям"
          lines={[
            'График изменения среднего Score по всем сотрудникам за каждую неделю.',
            'Фиолетовая линия — средний Score за неделю (LLM-оценка).\nЗелёная линия — средняя загрузка.',
            'Позволяет отследить общий тренд продуктивности команды.',
          ]}
        />
      </div>
      <WeeklyChart data={data.weeklyTrend} metrics={chartMetrics} />
    </Card>
  ) : null}
</div>

<div className="mb-6">
  <ConcernsList concerns={data?.concerns ?? []} loading={loading} />
</div>
```

**Step 2: Проверить визуально**

Открыть /overview — график на полную ширину, ConcernsList компактными карточками под ним.

**Step 3: Commit**

```bash
git add frontend/src/pages/OverviewPage.tsx
git commit -m "feat: overview page single-column layout"
```

---

### Task 3: ProjectPage — одноколоночный layout

**Files:**
- Modify: `frontend/src/pages/ProjectPage.tsx:197-227`

**Step 1: Заменить двухколоночный layout**

Строки 197-227 — блок `{/* Chart + Concerns */}`. Заменить на одноколоночный:

```tsx
{/* Chart — full width */}
<div className="mb-6">
  <Card>
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Динамика по неделям</h3>
        <InfoTooltip
          title="Динамика по неделям"
          lines={[
            'График изменения среднего Score и загрузки по проекту за каждую неделю.',
            'Фиолетовая линия — средний Score за неделю.\nЗелёная линия — средняя загрузка.',
            'Позволяет отследить тренд продуктивности команды проекта.',
          ]}
        />
      </div>
      <PeriodFilter value={weeks} onChange={setWeeks} />
    </div>
    {history ? (
      <WeeklyChart data={history.weeks} metrics={chartMetrics} />
    ) : (
      <div className="flex h-[280px] items-center justify-center">
        <div className="h-full w-full animate-pulse rounded bg-gray-200/70 dark:bg-gray-700/30" />
      </div>
    )}
  </Card>
</div>

{/* Concerns — full width, compact cards */}
<div className="mb-6">
  <ConcernsList concerns={summary?.concerns ?? []} loading={loading} />
</div>
```

**Step 2: Проверить визуально**

Открыть /projects/:id — график на полную ширину, карточки алертов под ним.

**Step 3: Commit**

```bash
git add frontend/src/pages/ProjectPage.tsx
git commit -m "feat: project page single-column layout"
```

---

### Task 4: Индикатор периода

**Files:**
- Create: `frontend/src/components/shared/PeriodIndicator.tsx`
- Modify: `frontend/src/pages/OverviewPage.tsx`
- Modify: `frontend/src/pages/ProjectPage.tsx`
- Modify: `frontend/src/pages/EmployeePage.tsx`

**Step 1: Создать компонент PeriodIndicator**

```tsx
import { Calendar } from 'lucide-react';

interface PeriodIndicatorProps {
  periodStart?: string;
  periodEnd?: string;
}

function formatShort(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDate();
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export default function PeriodIndicator({ periodStart, periodEnd }: PeriodIndicatorProps) {
  if (!periodStart || !periodEnd) return null;

  return (
    <div className="mb-6 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
      <Calendar size={12} />
      <span>Данные за неделю: {formatShort(periodStart)} — {formatShort(periodEnd)}</span>
    </div>
  );
}
```

**Step 2: Добавить на OverviewPage**

После блока KPI-карточек (после строки 142), перед графиком:

```tsx
<PeriodIndicator
  periodStart={data?.weeklyTrend?.[data.weeklyTrend.length - 1]?.periodStart}
  periodEnd={data?.weeklyTrend?.[data.weeklyTrend.length - 1]?.periodEnd}
/>
```

Добавить импорт: `import PeriodIndicator from '@/components/shared/PeriodIndicator';`

**Step 3: Добавить на ProjectPage**

После KPI-карточек (после строки 195), перед графиком:

```tsx
<PeriodIndicator
  periodStart={history?.weeks?.[history.weeks.length - 1]?.periodStart}
  periodEnd={history?.weeks?.[history.weeks.length - 1]?.periodEnd}
/>
```

**Step 4: Добавить на EmployeePage**

После KPI-карточек (после строки 343), перед графиком:

```tsx
<PeriodIndicator
  periodStart={report?.periodStart}
  periodEnd={report?.periodEnd}
/>
```

**Step 5: Commit**

```bash
git add frontend/src/components/shared/PeriodIndicator.tsx frontend/src/pages/OverviewPage.tsx frontend/src/pages/ProjectPage.tsx frontend/src/pages/EmployeePage.tsx
git commit -m "feat: add period indicator to overview, project, employee pages"
```

---

### Task 5: completionRate — фронтенд «—» вместо красного 0%

**Files:**
- Modify: `frontend/src/components/metrics/KpiCard.tsx`
- Modify: `frontend/src/pages/EmployeesListPage.tsx:31-41`

**Step 1: KpiCard — показывать «Н/Д» для null (уже работает)**

Проверить: KpiCard уже показывает 'Н/Д' когда `value === null` (строка 86). Это корректно.

**Step 2: EmployeesListPage — MetricCell для null значений**

Текущий MetricCell (строки 31-41) показывает «Н/Д» для null, но `0.0%` для нуля — а ноль может быть реальным значением. Оставить как есть, т.к. 0% — это корректное значение (пусть и красное). Фронтенд не может отличить «реальный 0%» от «маппинг не настроен».

**Вместо этого:** Добавить проверку — если value === 0 **и** metric === 'completionRate', показывать серым (не красным), т.к. это скорее всего отсутствие данных:

В `MetricCell` (строки 31-41) добавить логику:

```tsx
function MetricCell({ metric, value }: { metric: string; value: number | null }) {
  if (value === null) {
    return (
      <td className="px-3 py-3 text-sm">
        <span className="text-gray-400 dark:text-gray-500">—</span>
      </td>
    );
  }
  const level = getMetricLevel(metric, value);
  const colors = LEVEL_COLORS[level];
  return (
    <td className="px-3 py-3 text-sm">
      <span className={colors.text}>
        {value.toFixed(1)}%
      </span>
    </td>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/pages/EmployeesListPage.tsx
git commit -m "fix: show dash for null metric values in employees table"
```

---

### Task 6: completionRate — диагностика бэкенда

**Files:**
- Read: `backend/src/modules/collection/metrics-collector.ts:130-145`
- Read: `backend/src/modules/subscriptions/subscriptions.types.ts` (FieldMapping)

**Step 1: Диагностика**

Прочитать `metrics-collector.ts` и найти блок подсчёта `completedIssues`. Проверить:
- Как `issue.resolved` используется
- Есть ли альтернативный путь через статусы
- Какие поля запрашиваются у YouTrack API

**Step 2: Проверить данные**

Запрос к БД:
```sql
SELECT "completedIssues", "totalIssues", "completionRate"
FROM metric_report
ORDER BY "createdAt" DESC
LIMIT 10;
```

Если все `completedIssues = 0` при `totalIssues > 0` — проблема в сборе. Если `totalIssues = 0` — проблема в фильтрации задач.

**Step 3: Документировать находки**

Записать результат диагностики. НЕ фиксить бэкенд в рамках этого плана — это отдельная задача.

**Step 4: Commit (если были изменения)**

Нет изменений кода, только диагностика.

---

## Слой 2: Компоненты и графики

### Task 7: IssuesByTypeChart — адаптивное отображение

**Files:**
- Modify: `frontend/src/components/metrics/IssuesByTypeChart.tsx`

**Step 1: Добавить адаптивный режим (бары вместо donut при < 3 типах)**

```tsx
// Заменить содержимое IssuesByTypeChart.tsx
// Если chartData.length < 3 — рендерить горизонтальные бары
// Иначе — donut как сейчас

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';

// ... (TYPE_LABELS, COLORS остаются)

export default function IssuesByTypeChart({ data, height = 240 }: IssuesByTypeChartProps) {
  const chartData = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: TYPE_LABELS[key] || key,
      value,
    }));

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-surface-border text-sm text-gray-400 dark:text-gray-500" style={{ height }}>
        Нет данных
      </div>
    );
  }

  // Мало типов — горизонтальные бары (компактнее donut)
  if (chartData.length < 3) {
    const barHeight = Math.max(100, chartData.length * 50 + 40);
    return (
      <ResponsiveContainer width="100%" height={barHeight}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={90} />
          <RechartsTooltip content={<CustomTooltip />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
            {chartData.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Достаточно типов — donut
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
          {chartData.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <RechartsTooltip content={<CustomTooltip />} />
        <Legend verticalAlign="bottom" iconType="circle" iconSize={8}
          formatter={(value: string) => <span className="text-xs text-gray-500 dark:text-gray-400">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Проверить визуально**

Открыть /employees/:login — если 1-2 типа задач → горизонтальные бары, если 3+ → donut.

**Step 3: Commit**

```bash
git add frontend/src/components/metrics/IssuesByTypeChart.tsx
git commit -m "feat: adaptive IssuesByTypeChart - bars for few types, donut for many"
```

---

### Task 8: SpentByTypeChart — адаптивная высота

**Files:**
- Modify: `frontend/src/components/metrics/SpentByTypeChart.tsx`

**Step 1: Адаптивная высота**

Заменить фиксированный `height = 240` на расчётный:

```tsx
export default function SpentByTypeChart({ data, height }: SpentByTypeChartProps) {
  const chartData = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: TYPE_LABELS[key] || key,
      value: Number(value.toFixed(1)),
    }))
    .sort((a, b) => b.value - a.value);

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-surface-border text-sm text-gray-400 dark:text-gray-500" style={{ height: height ?? 120 }}>
        Нет данных
      </div>
    );
  }

  // Адаптивная высота: 40px на бар + 40px padding, минимум 100
  const computedHeight = height ?? Math.max(100, chartData.length * 40 + 40);

  return (
    <ResponsiveContainer width="100%" height={computedHeight}>
      {/* ... остальное без изменений */}
    </ResponsiveContainer>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/metrics/SpentByTypeChart.tsx
git commit -m "feat: adaptive height for SpentByTypeChart based on data count"
```

---

### Task 9: LlmSummaryBlock — max-height + «Читать полностью»

**Files:**
- Modify: `frontend/src/components/employees/LlmSummaryBlock.tsx`

**Step 1: Добавить ограничение высоты и кнопку раскрытия**

Обернуть контент в div с max-height и overflow:

```tsx
import { useState, useRef, useEffect } from 'react';
// ... остальные импорты

export default function LlmSummaryBlock({ ... }: LlmSummaryBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      setIsOverflowing(contentRef.current.scrollHeight > 400);
    }
  }, [summary, achievements, concerns, recommendations]);

  // ... loading, processing, empty states remain the same ...

  return (
    <Card>
      <h4 className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-300">LLM-сводка</h4>

      <div
        ref={contentRef}
        className={`${!expanded && isOverflowing ? 'max-h-[350px] overflow-hidden' : ''} relative`}
      >
        {/* summary, achievements, concerns, recommendations — без изменений */}

        {!expanded && isOverflowing && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-surface to-transparent" />
        )}
      </div>

      {isOverflowing && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-brand-400 transition-colors hover:text-brand-300"
        >
          {expanded ? 'Свернуть' : 'Читать полностью'}
        </button>
      )}
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/employees/LlmSummaryBlock.tsx
git commit -m "feat: LlmSummaryBlock max-height with expand/collapse"
```

---

## Слой 3: Страничные доработки

### Task 10: TeamCard — добавить Точность

**Files:**
- Modify: `frontend/src/components/teams/TeamCard.tsx:78-93`
- Check: `frontend/src/types/team.ts` — есть ли `avgEstimationAccuracy` в Team

**Step 1: Проверить тип Team**

Если `avgEstimationAccuracy` нет в типе `Team` — это бэкенд-ограничение. В этом случае добавить поле:
- В `frontend/src/types/team.ts`: `avgEstimationAccuracy: number | null;`
- Проверить, отдаёт ли бэкенд это поле. Если нет — пропустить эту задачу.

**Step 2: Добавить строку Точность**

В блоке metrics (строки 78-93) добавить после Загрузки:

```tsx
{team.avgEstimationAccuracy !== null && team.avgEstimationAccuracy !== undefined && (
  <div className="flex items-center justify-between text-sm">
    <span className="text-gray-400 dark:text-gray-500">Точность</span>
    <span className="font-medium text-gray-600 dark:text-gray-300">{team.avgEstimationAccuracy.toFixed(1)}%</span>
  </div>
)}
```

**Step 3: Commit**

```bash
git add frontend/src/components/teams/TeamCard.tsx frontend/src/types/team.ts
git commit -m "feat: add estimation accuracy to TeamCard"
```

---

### Task 11: TeamPage — расширить KPI и добавить ConcernsList

**Files:**
- Modify: `frontend/src/pages/TeamPage.tsx`

**Step 1: Добавить KPI-карточки Точность и Закрытие**

Заменить grid `sm:grid-cols-3` на `sm:grid-cols-3 xl:grid-cols-5` и добавить карточки:

```tsx
<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-5">
  <KpiCard title="Средний Score" value={team?.avgScore ?? null} metric="score" trend={team?.scoreTrend} loading={loading} />
  <KpiCard title="Средняя загрузка" value={team?.avgUtilization ?? null} suffix="%" metric="utilization" loading={loading} />
  <KpiCard title="Точность" value={team?.avgEstimationAccuracy ?? null} suffix="%" metric="estimationAccuracy" loading={loading} />
  <KpiCard title="Закрытие" value={team?.avgCompletionRate ?? null} suffix="%" metric="completionRate" loading={loading} />
  {loading ? (
    <KpiCard title="" value={null} metric="score" loading />
  ) : (
    <Card className="animate-slide-up">
      <div className="text-sm text-gray-500 dark:text-gray-400">Участников</div>
      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{team?.members.length ?? 0}</div>
    </Card>
  )}
</div>
```

**Важно:** Для этого нужно расширить `TeamDetail` на бэкенде (добавить `avgEstimationAccuracy`, `avgCompletionRate`, `concerns`). Если бэкенд не готов — поля будут null, KPI покажет «Н/Д».

**Step 2: Добавить ConcernsList после графика**

Импортировать ConcernsList и добавить после блока графика (после строки 192):

```tsx
import ConcernsList from '@/components/metrics/ConcernsList';
```

```tsx
{/* Concerns */}
{team && team.concerns && team.concerns.length > 0 && (
  <div className="mb-6">
    <ConcernsList concerns={team.concerns} />
  </div>
)}
```

**Step 3: Commit**

```bash
git add frontend/src/pages/TeamPage.tsx
git commit -m "feat: extend TeamPage with accuracy, completion KPIs and concerns"
```

---

### Task 12: ProjectPage — дедупликация LLM-рекомендаций

**Files:**
- Modify: `frontend/src/pages/ProjectPage.tsx:250-273`

**Step 1: Добавить функцию дедупликации**

Перед `return (` добавить:

```tsx
function deduplicateRecommendations(recs: string[]): string[] {
  const normalized = recs.map((r) => ({
    original: r,
    clean: r.toLowerCase().replace(/[.,;:!?()«»"'—–-]/g, '').trim(),
  }));

  const result: typeof normalized = [];
  for (const item of normalized) {
    const isDuplicate = result.some(
      (existing) =>
        existing.clean.includes(item.clean) || item.clean.includes(existing.clean)
    );
    if (isDuplicate) {
      // Если текущий длиннее — заменить
      const shorterIndex = result.findIndex((existing) => item.clean.includes(existing.clean));
      if (shorterIndex !== -1 && item.original.length > result[shorterIndex].original.length) {
        result[shorterIndex] = item;
      }
    } else {
      result.push(item);
    }
  }

  return result.map((r) => r.original);
}
```

**Step 2: Применить к рендеру**

Заменить строки 265-269:

```tsx
{deduplicateRecommendations(summary.aggregatedRecommendations).map((rec, i) => (
```

**Step 3: Добавить CopyButton к блоку рекомендаций**

В шапке блока (строка 252-263) добавить кнопку:

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
    <Lightbulb size={16} className="text-blue-400" />
    <h3 className="text-sm font-medium">LLM-рекомендации по проекту</h3>
    <InfoTooltip ... />
  </div>
  <CopyButton getText={() => deduplicateRecommendations(summary.aggregatedRecommendations).map((r, i) => `${i + 1}. ${r}`).join('\n')} />
</div>
```

**Step 4: Commit**

```bash
git add frontend/src/pages/ProjectPage.tsx
git commit -m "feat: deduplicate LLM recommendations and add copy button"
```

---

### Task 13: CollectionPage — продублировать «Запустить всё»

**Files:**
- Modify: `frontend/src/pages/CollectionPage.tsx`

**Step 1: Найти кнопку «Запустить всё» и grid карточек**

Найти JSX-блок с кнопками «Запустить всё» / «Остановить всё». Продублировать эти кнопки после grid карточек подписок.

**Step 2: Добавить дубль кнопки**

После закрывающего `</div>` grid карточек подписок добавить:

```tsx
{subscriptions.length > 2 && (
  <div className="mb-6 flex justify-end gap-2">
    {/* Те же кнопки что и вверху */}
  </div>
)}
```

Показывать только если > 2 карточек (иначе дублирование бессмысленно).

**Step 3: Commit**

```bash
git add frontend/src/pages/CollectionPage.tsx
git commit -m "feat: duplicate 'Run all' button below subscription cards"
```

---

### Task 14: Спарклайны — проверка API и условная реализация

**Files:**
- Check: `backend/src/modules/reports/reports.controller.ts` — list endpoints
- Check: `backend/src/modules/teams/teams.controller.ts`

**Step 1: Проверить API**

Проверить, отдают ли list endpoints историю score (массив из 5+ точек).
По результатам исследования: **бэкенд НЕ отдаёт историю score в list endpoints**.

**Step 2: Решение**

Если API не готов → **отложить спарклайны**. Записать как TODO для следующей итерации.

---

### Task 15: Стрики — диагностика (не блокирует)

**Files:**
- Read: бэкенд файлы с логикой стриков (achievements)

**Step 1: Найти логику подсчёта стриков**

Поиск в `backend/src/modules/achievements/` — как считается streak. Проверить:
- Откуда берётся число недель
- Учитывается ли дата начала данных
- Есть ли ограничение «стрик не может быть больше кол-ва собранных недель»

**Step 2: Документировать**

Записать находки. Это отдельная задача на фикс.

---

## Порядок выполнения

1. Task 1: ConcernsList (используется в Tasks 2, 3, 11)
2. Task 2: OverviewPage layout
3. Task 3: ProjectPage layout
4. Task 4: PeriodIndicator
5. Task 5: completionRate фронтенд
6. Task 6: completionRate диагностика (параллельно)
7. Task 7: IssuesByTypeChart
8. Task 8: SpentByTypeChart
9. Task 9: LlmSummaryBlock
10. Task 10: TeamCard
11. Task 11: TeamPage
12. Task 12: LLM дедупликация
13. Task 13: CollectionPage
14. Task 14: Спарклайны (условно)
15. Task 15: Стрики диагностика
