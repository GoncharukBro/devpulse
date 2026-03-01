# Спарклайны на карточках проектов и команд — План реализации

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Добавить мини-графики (спарклайны) тренда score на карточки проектов и команд.

**Architecture:** Расширяем бэкенд DTO (`ProjectSummaryDTO`, `TeamListItem`) полем `scoreHistory: number[]`. На фронте создаём чистый SVG компонент `Sparkline` и встраиваем его в `ProjectCard` и `TeamCard`.

**Tech Stack:** Node.js/MikroORM (бэкенд), React/SVG/Tailwind (фронтенд)

---

### Task 1: Бэкенд — добавить scoreHistory в ProjectSummaryDTO

**Files:**
- Modify: `backend/src/modules/reports/reports.types.ts:128-149` (интерфейс ProjectSummaryDTO)
- Modify: `backend/src/modules/reports/reports.service.ts:301-405` (метод getProjectSummary)

**Step 1: Добавить поле в тип ProjectSummaryDTO**

В файле `backend/src/modules/reports/reports.types.ts`, в интерфейсе `ProjectSummaryDTO` (строка 128), добавить поле `scoreHistory` после `aggregatedRecommendations`:

```typescript
  aggregatedRecommendations: string[];
  scoreHistory: number[];
```

**Step 2: Добавить вычисление scoreHistory в getProjectSummary**

В файле `backend/src/modules/reports/reports.service.ts`, в методе `getProjectSummary` (перед финальным `return` на строке 387), добавить вычисление `scoreHistory`. Использовать существующий метод `getProjectHistory` как вдохновение — он уже группирует отчёты по неделям:

```typescript
    // Score history (last 5 weeks)
    const allReports = await this.em.find(MetricReport, {
      subscription: sub,
      llmStatus: 'completed',
      llmScore: { $ne: null },
    }, { orderBy: { periodStart: 'ASC' } });

    const scoreByPeriod = new Map<string, number[]>();
    for (const r of allReports) {
      const key = formatYTDate(r.periodStart);
      if (!scoreByPeriod.has(key)) scoreByPeriod.set(key, []);
      scoreByPeriod.get(key)!.push(r.llmScore!);
    }

    const sortedPeriods = [...scoreByPeriod.keys()].sort().slice(-5);
    const scoreHistory = sortedPeriods.map((key) => {
      const scores = scoreByPeriod.get(key)!;
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    });
```

И в возвращаемом объекте добавить:

```typescript
    return {
      // ... существующие поля ...
      aggregatedRecommendations: uniqueRecs,
      scoreHistory,
    };
```

**Step 3: Проверить TypeScript**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 4: Commit**

```bash
git add backend/src/modules/reports/reports.types.ts backend/src/modules/reports/reports.service.ts
git commit -m "feat(reports): add scoreHistory to ProjectSummaryDTO"
```

---

### Task 2: Бэкенд — добавить scoreHistory в TeamListItem

**Files:**
- Modify: `backend/src/modules/teams/teams.types.ts:20-28` (интерфейс TeamListItem)
- Modify: `backend/src/modules/teams/teams.service.ts:47-73` (метод listTeams)

**Step 1: Добавить поле в тип TeamListItem**

В файле `backend/src/modules/teams/teams.types.ts`, в интерфейсе `TeamListItem`, добавить поле:

```typescript
export interface TeamListItem {
  id: string;
  name: string;
  membersCount: number;
  avgScore: number | null;
  avgUtilization: number | null;
  scoreTrend: ScoreTrend;
  scoreHistory: number[];
  createdAt: string;
}
```

**Step 2: Добавить приватный метод getTeamScoreHistory**

В файле `backend/src/modules/teams/teams.service.ts`, добавить приватный метод после `getTeamWeeklyTrend` (после строки 400):

```typescript
  private async getTeamScoreHistory(
    logins: string[],
    subIds: string[],
  ): Promise<number[]> {
    if (logins.length === 0 || subIds.length === 0) return [];

    const reports = await this.em.find(
      MetricReport,
      {
        subscription: { $in: subIds },
        youtrackLogin: { $in: logins },
        llmStatus: 'completed',
        llmScore: { $ne: null },
      },
      { orderBy: { periodStart: 'ASC' } },
    );

    // Group by period, then deduplicate by login (avg across projects)
    const byPeriod = new Map<string, Map<string, number[]>>();
    for (const r of reports) {
      const key = formatYTDate(r.periodStart);
      if (!byPeriod.has(key)) byPeriod.set(key, new Map());
      const loginMap = byPeriod.get(key)!;
      if (!loginMap.has(r.youtrackLogin)) loginMap.set(r.youtrackLogin, []);
      loginMap.get(r.youtrackLogin)!.push(r.llmScore!);
    }

    const sortedPeriods = [...byPeriod.keys()].sort().slice(-5);

    return sortedPeriods.map((periodKey) => {
      const loginMap = byPeriod.get(periodKey)!;
      const empAvgs: number[] = [];
      for (const scores of loginMap.values()) {
        empAvgs.push(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
      return Math.round(empAvgs.reduce((a, b) => a + b, 0) / empAvgs.length);
    });
  }
```

**Step 3: Вызвать метод в listTeams**

В методе `listTeams` (строки 57-72), добавить вызов `getTeamScoreHistory`:

```typescript
    for (const team of teams) {
      const logins = team.members.getItems().map((m) => m.youtrackLogin);
      const { avgScore, avgUtilization, scoreTrend } = await this.getTeamAggregates(logins, subIds);
      const scoreHistory = await this.getTeamScoreHistory(logins, subIds);

      result.push({
        id: team.id,
        name: team.name,
        membersCount: logins.length,
        avgScore,
        avgUtilization,
        scoreTrend,
        scoreHistory,
        createdAt: team.createdAt.toISOString(),
      });
    }
```

**Step 4: Проверить TypeScript**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 5: Commit**

```bash
git add backend/src/modules/teams/teams.types.ts backend/src/modules/teams/teams.service.ts
git commit -m "feat(teams): add scoreHistory to TeamListItem"
```

---

### Task 3: Фронтенд — обновить типы

**Files:**
- Modify: `frontend/src/types/reports.ts:133-154` (ProjectSummaryDTO)
- Modify: `frontend/src/types/team.ts:3-12` (Team)

**Step 1: Добавить scoreHistory в ProjectSummaryDTO**

В файле `frontend/src/types/reports.ts`, в интерфейсе `ProjectSummaryDTO`, добавить поле после `aggregatedRecommendations`:

```typescript
  aggregatedRecommendations: string[];
  scoreHistory: number[];
```

**Step 2: Добавить scoreHistory в Team**

В файле `frontend/src/types/team.ts`, в интерфейсе `Team`, добавить поле:

```typescript
export interface Team {
  id: string;
  name: string;
  membersCount: number;
  avgScore: number | null;
  avgUtilization: number | null;
  avgEstimationAccuracy: number | null;
  scoreTrend: ScoreTrend;
  scoreHistory: number[];
  createdAt: string;
}
```

**Step 3: Commit**

```bash
git add frontend/src/types/reports.ts frontend/src/types/team.ts
git commit -m "feat(types): add scoreHistory to ProjectSummaryDTO and Team"
```

---

### Task 4: Фронтенд — создать компонент Sparkline

**Files:**
- Create: `frontend/src/components/charts/Sparkline.tsx`

**Step 1: Создать компонент**

```tsx
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export default function Sparkline({ data, width = 80, height = 24, className }: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 2;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * chartW,
    y: padding + chartH - ((v - min) / range) * chartH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

  const first = data[0];
  const last = data[data.length - 1];
  const color = last > first ? '#22c55e' : last < first ? '#ef4444' : '#9ca3af';

  const gradientId = `spark-${color.slice(1)}`;

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

**Step 2: Проверить TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 3: Commit**

```bash
git add frontend/src/components/charts/Sparkline.tsx
git commit -m "feat(ui): add Sparkline SVG component"
```

---

### Task 5: Фронтенд — добавить Sparkline в ProjectCard

**Files:**
- Modify: `frontend/src/pages/ProjectsListPage.tsx:36-93` (компонент ProjectCard)

**Step 1: Добавить импорт**

В начало файла `frontend/src/pages/ProjectsListPage.tsx` добавить:

```typescript
import Sparkline from '@/components/charts/Sparkline';
```

**Step 2: Добавить Sparkline в header карточки**

В компоненте `ProjectCard`, в блоке с `ScoreBadge` и `TrendIndicator` (строки 63-68), добавить `Sparkline`:

Было:
```tsx
          {summary && (
            <div className="flex items-center gap-2">
              <ScoreBadge score={summary.avgScore} size="lg" />
              <TrendIndicator trend={summary.scoreTrend} />
            </div>
          )}
```

Стало:
```tsx
          {summary && (
            <div className="flex items-center gap-2">
              <Sparkline data={summary.scoreHistory} />
              <ScoreBadge score={summary.avgScore} size="lg" />
              <TrendIndicator trend={summary.scoreTrend} />
            </div>
          )}
```

**Step 3: Проверить TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 4: Commit**

```bash
git add frontend/src/pages/ProjectsListPage.tsx
git commit -m "feat(projects): add sparkline to ProjectCard"
```

---

### Task 6: Фронтенд — добавить Sparkline в TeamCard

**Files:**
- Modify: `frontend/src/components/teams/TeamCard.tsx:1-107`

**Step 1: Добавить импорт**

В начало файла `frontend/src/components/teams/TeamCard.tsx` добавить:

```typescript
import Sparkline from '@/components/charts/Sparkline';
```

**Step 2: Добавить Sparkline в header карточки**

В блоке с `ScoreBadge` и `TrendIndicator` (строки 25-29), добавить `Sparkline`:

Было:
```tsx
            {team.avgScore !== null && (
              <>
                <ScoreBadge score={team.avgScore} size="sm" />
                <TrendIndicator trend={team.scoreTrend} />
              </>
            )}
```

Стало:
```tsx
            {team.avgScore !== null && (
              <>
                <Sparkline data={team.scoreHistory} />
                <ScoreBadge score={team.avgScore} size="sm" />
                <TrendIndicator trend={team.scoreTrend} />
              </>
            )}
```

**Step 3: Проверить TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 4: Commit**

```bash
git add frontend/src/components/teams/TeamCard.tsx
git commit -m "feat(teams): add sparkline to TeamCard"
```

---

### Task 7: Финальная проверка — lint + tsc

**Step 1: Backend lint**

Run: `cd backend && npm run lint`
Expected: 0 ошибок

**Step 2: Frontend lint**

Run: `cd frontend && npm run lint`
Expected: 0 ошибок

**Step 3: Backend TypeScript**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 4: Frontend TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 5: Финальный commit (если были lint-фиксы)**

```bash
git add -A
git commit -m "fix: lint and type-check fixes for sparklines"
```
