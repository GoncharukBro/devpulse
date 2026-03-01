# Дизайн: Спарклайны на карточках проектов и команд

**Дата:** 2026-03-01

## Цель

Добавить мини-графики (спарклайны) тренда score на карточки проектов и команд.
Спарклайн — маленький линейный график без осей и подписей, 5 последних точек.

## Бэкенд

### ProjectSummaryDTO (GET /api/reports/projects/:subId)

Добавить поле `scoreHistory: number[]` — последние 5 значений среднего llmScore по сотрудникам подписки.

SQL-логика:
- `metric_reports WHERE subscription_id = :subId AND llm_status = 'completed'`
- `GROUP BY period_start`, `AVG(llm_score)`
- `ORDER BY period_start DESC LIMIT 5`, затем reverse (от старого к новому)
- Округлять до целого

### GET /api/teams (список команд)

Добавить `scoreHistory: number[]` в ответ каждой команды.

SQL-логика:
- `metric_reports WHERE subscription_id IN (user subs) AND youtrack_login IN (team members) AND llm_status = 'completed'`
- `GROUP BY period_start`, `AVG(llm_score)` (дедупликация по login: один login → среднее по проектам)
- `ORDER BY period_start DESC LIMIT 5`, затем reverse

### Граничные случаи

- Меньше 5 недель данных → вернуть сколько есть
- Нет данных → пустой массив `[]`

## Фронтенд

### Компонент Sparkline

Чистый SVG, без Recharts (слишком тяжело для 3-5 точек).

```
Размер: ~80x24px
SVG path для линии + linearGradient заливка под линией
Цвет линии:
  - зелёный (#22c55e) если последнее значение > первого (рост)
  - красный (#ef4444) если последнее < первого (падение)
  - серый (#9ca3af) если равны или недостаточно данных
Без осей, без подписей, без точек
Не рендерить если scoreHistory.length < 2
```

### Размещение

- **ProjectCard** (ProjectsListPage) — рядом со ScoreBadge в header
- **TeamCard** (TeamsListPage) — рядом со ScoreBadge в header

### Типы

```typescript
// Расширение существующих типов
interface ProjectSummaryDTO {
  // ... existing fields
  scoreHistory: number[];
}

interface Team {
  // ... existing fields
  scoreHistory: number[];
}
```

## Файлы для изменения

### Бэкенд
- `backend/src/modules/reports/reports.service.ts` — добавить scoreHistory в ProjectSummaryDTO
- `backend/src/modules/teams/teams.service.ts` — добавить scoreHistory в список команд

### Фронтенд
- `frontend/src/components/charts/Sparkline.tsx` — новый компонент
- `frontend/src/types/` — расширить ProjectSummaryDTO и Team типами scoreHistory
- `frontend/src/pages/ProjectsListPage.tsx` — добавить Sparkline в ProjectCard
- `frontend/src/components/teams/TeamCard.tsx` — добавить Sparkline
