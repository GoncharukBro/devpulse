# Рефакторинг системы категорий типов задач (taskTypeMapping)

## Контекст

Категории задач дублируются в 6 местах (3 на бэке, 3 на фронте). Лейблы дублируются в 3 местах. Имя поля YouTrack захардкожено как `'Type'`. Маппинг case-sensitive. LLM получает внутренние ключи вместо человекочитаемых названий. Цвета графиков привязаны к порядку данных, а не к категориям.

## Скоуп

Пять изменений:

1. Единый источник категорий
2. Фиксированные цвета + русские лейблы в графиках и UI
3. Настраиваемое имя поля Type
4. Case-insensitive маппинг
5. Русские лейблы в LLM-промпте

Автокомплит из YouTrack — вынесен из скоупа (YAGNI, отдельная итерация).

## Решения

### Подход к единому источнику: дублирование с синхронизацией

Каноническое определение на бэкенде, зеркальная копия на фронте с комментарием-ссылкой. Без shared-пакета, без API-эндпоинта. Категории — 7 статичных значений, меняются крайне редко.

---

## 1. Единый источник категорий

### Структура данных

```typescript
export interface TaskCategoryDefinition {
  key: string;
  labelRu: string;
  labelEn: string;
  color: string;
}

export const TASK_CATEGORIES: TaskCategoryDefinition[] = [
  { key: 'feature',       labelRu: 'Фичи',         labelEn: 'Feature',       color: '#6366f1' },
  { key: 'bugfix',        labelRu: 'Баги',          labelEn: 'Bugfix',        color: '#ef4444' },
  { key: 'techDebt',      labelRu: 'Техдолг',       labelEn: 'Tech Debt',     color: '#f59e0b' },
  { key: 'support',       labelRu: 'Поддержка',     labelEn: 'Support',       color: '#06b6d4' },
  { key: 'documentation', labelRu: 'Документация',  labelEn: 'Documentation', color: '#10b981' },
  { key: 'codeReview',    labelRu: 'Code Review',   labelEn: 'Code Review',   color: '#8b5cf6' },
  { key: 'other',         labelRu: 'Прочее',        labelEn: 'Other',         color: '#6b7280' },
];

export const VALID_TASK_CATEGORY_KEYS = TASK_CATEGORIES.map(c => c.key);

export function getCategoryLabelRu(key: string): string {
  return TASK_CATEGORIES.find(c => c.key === key)?.labelRu ?? key;
}
```

### Backend: `backend/src/modules/subscriptions/subscriptions.types.ts`

- Добавить `TaskCategoryDefinition`, `TASK_CATEGORIES`, `VALID_TASK_CATEGORY_KEYS`, `getCategoryLabelRu`
- Удалить старый `VALID_TASK_CATEGORIES` (массив строк)
- Все места валидации переходят на `VALID_TASK_CATEGORY_KEYS`

### Frontend: `frontend/src/types/subscription.ts`

- Добавить зеркальную копию `TaskCategoryDefinition` и `TASK_CATEGORIES` с комментарием:
  `// Mirror of backend/src/modules/subscriptions/subscriptions.types.ts`
- Удалить старые `TASK_CATEGORIES` (массив строк), `TASK_CATEGORY_LABELS`, `TaskCategory`

### Удаляемые дубли

| Файл | Что удаляется |
|------|---------------|
| `backend/.../subscriptions.types.ts` | `VALID_TASK_CATEGORIES` (массив строк) |
| `frontend/.../subscription.ts` | `TASK_CATEGORIES` (массив строк), `TASK_CATEGORY_LABELS`, `TaskCategory` |
| `frontend/.../IssuesByTypeChart.tsx` | `TYPE_LABELS`, `COLORS` |
| `frontend/.../SpentByTypeChart.tsx` | `TYPE_LABELS` (константы `COLORS` нет — цвет задан литералом `fill="#6366f1"` в `<Bar>`) |

---

## 2. Фиксированные цвета и русские лейблы

### Утилитный файл: `frontend/src/utils/task-categories.ts`

Хелперы, используемые обоими графиками:

```typescript
import { TASK_CATEGORIES } from '@/types/subscription';

export function getCategoryLabel(key: string): string {
  return TASK_CATEGORIES.find(c => c.key === key)?.labelRu ?? key;
}

export function getCategoryColor(key: string): string {
  return TASK_CATEGORIES.find(c => c.key === key)?.color ?? '#6b7280';
}
```

### Графики: `IssuesByTypeChart.tsx`, `SpentByTypeChart.tsx`

- `IssuesByTypeChart.tsx`: удалить локальные `TYPE_LABELS` и `COLORS`. Импортировать хелперы. `<Cell fill={chartData[index].color} />` — цвет привязан к категории, не к индексу.
- `SpentByTypeChart.tsx`: удалить локальный `TYPE_LABELS`. Заменить единый `fill="#6366f1"` в `<Bar>` на per-category цвета — либо через отдельные `<Bar>` секции, либо через `<Cell>` внутри `<Bar>` (аналогично PieChart). Импортировать хелперы.
- Формирование данных в обоих: каждый элемент chartData получает `color` по категории.

**Примечание:** привязка цветов к категориям изменит визуальное отображение для пользователей. Ранее цвета распределялись по порядку данных (bugfix мог быть зелёным), теперь bugfix всегда красный. Это осознанное улучшение UX.

### FieldMappingEditor.tsx

Dropdown категорий переходит на русские лейблы:

```typescript
// Было: TASK_CATEGORY_LABELS[cat as TaskCategory] → "Feature"
// Стало: cat.labelRu → "Фичи"

{TASK_CATEGORIES.map((cat) => (
  <option key={cat.key} value={cat.key}>
    {cat.labelRu}
  </option>
))}
```

---

## 3. Настраиваемое имя поля Type

### Проблема

В `metrics-collector.ts:266` захардкожено `f.name === 'Type'`. Если в YouTrack проекте поле называется `'Тип'`, `'Category'` или `'Issue Type'` — маппинг молча не работает.

### Backend: FieldMapping entity

```typescript
@Property({ type: 'text', default: 'Type' })
typeFieldName: string = 'Type';
```

### Backend: DEFAULT_FIELD_MAPPING

```typescript
export const DEFAULT_FIELD_MAPPING = {
  taskTypeMapping: { ... },
  typeFieldName: 'Type',
  // ...
};
```

### Backend: DTO

`CreateFieldMappingDto` и `UpdateFieldMappingDto` — добавить `typeFieldName?: string`.
`DEFAULT_FIELD_MAPPING` типизирован как `Required<CreateFieldMappingDto>` — поле `typeFieldName` автоматически станет обязательным в нём через `Required<>`.

### Backend: MetricsCollector

```typescript
// Было:
const typeField = issue.customFields.find((f) => f.name === 'Type');

// Стало:
const typeField = issue.customFields.find(
  (f) => f.name === this.fieldMapping.typeFieldName
);
```

### Backend: field-mapping.service.ts

`createFieldMapping` и `updateFieldMapping` — обработка `typeFieldName`. Валидация: непустая строка.

### Backend: API сериализация

`subscriptions.routes.ts` (GET/PUT field-mapping) и `subscriptions.service.ts` (getSubscriptionDetail) — добавить `typeFieldName` в ответ и приём.

### Frontend: типы

`FieldMapping`, `CreateFieldMappingDto`, `UpdateFieldMappingDto` — добавить `typeFieldName: string`.

### Frontend: FieldMappingEditor

Текстовое поле над секцией "Типы задач":

- Label: "Поле типа задачи в YouTrack"
- Default value: "Type"
- Подсказка: "Название кастомного поля в YouTrack, определяющего тип задачи. Обычно 'Type', но может быть 'Тип' или другое."

### Миграция

```sql
ALTER TABLE field_mappings
  ADD COLUMN type_field_name text NOT NULL DEFAULT 'Type';
```

Обратно-совместимая: существующие записи получают `'Type'`.

---

## 4. Case-insensitive маппинг

### Backend: MetricsCollector.resolveIssueType()

```typescript
private resolveIssueType(issue: YouTrackIssue): string {
  const typeField = issue.customFields.find(
    (f) => f.name === this.fieldMapping.typeFieldName
  );
  if (!typeField || !typeField.value) return 'other';

  // ...парсинг typeName (без изменений)...

  if (!typeName) return 'other';

  // Точное совпадение (быстрый путь, O(1))
  const mapping = this.fieldMapping.taskTypeMapping;
  const directMatch = mapping[typeName];
  if (directMatch) return directMatch;

  // Fallback: case-insensitive (O(n), n ≤ 10)
  const lowerTypeName = typeName.toLowerCase();
  const found = Object.entries(mapping).find(
    ([key]) => key.toLowerCase() === lowerTypeName
  );
  return found ? found[1] : 'other';
}
```

Одна точка изменения. Обратная совместимость: точное совпадение проверяется первым.

---

## 5. Русские лейблы в LLM-промпте

### Backend: llm.prompt.ts

```typescript
import { getCategoryLabelRu } from '../subscriptions/subscriptions.types';

// Было:
typeEntries.map(([k, v]) => `${k}:${v}`).join(', ')
// → "feature:5, bugfix:2"

// Стало:
typeEntries.map(([k, v]) => `${getCategoryLabelRu(k)}:${v}`).join(', ')
// → "Фичи:5, Баги:2"
```

Fallback на raw key если категория не найдена.

Также в строке формирования списка задач (строка 53):

```typescript
// Было:
const taskLines = tasks.map((t) => `- ${t.id}: ${t.summary} (${t.type})`);
// → "- PROJ-1: Задача (feature)"

// Стало:
const taskLines = tasks.map((t) => `- ${t.id}: ${t.summary} (${getCategoryLabelRu(t.type)})`);
// → "- PROJ-1: Задача (Фичи)"
```

Обе точки вывода типов конвертируются, промпт полностью согласован.

---

## Затрагиваемые файлы

### Backend (7 файлов)

| Файл | Изменение |
|------|-----------|
| `entities/field-mapping.entity.ts` | Добавить `typeFieldName` |
| `modules/subscriptions/subscriptions.types.ts` | Новый `TASK_CATEGORIES`, удалить старый, DTO |
| `modules/subscriptions/field-mapping.service.ts` | Обработка `typeFieldName`, валидация на `VALID_TASK_CATEGORY_KEYS` |
| `modules/subscriptions/subscriptions.routes.ts` | Валидация на `VALID_TASK_CATEGORY_KEYS`, сериализация `typeFieldName` |
| `modules/subscriptions/subscriptions.service.ts` | Сериализация `typeFieldName` |
| `modules/collection/metrics-collector.ts` | `typeFieldName` вместо хардкода, case-insensitive |
| `modules/llm/llm.prompt.ts` | Русские лейблы |

### Frontend (7 файлов)

| Файл | Изменение |
|------|-----------|
| `types/subscription.ts` | Новый `TASK_CATEGORIES`, удалить старые |
| `utils/task-categories.ts` | **Новый файл** — хелперы `getCategoryLabel`, `getCategoryColor` |
| `components/metrics/IssuesByTypeChart.tsx` | Использовать хелперы, удалить `TYPE_LABELS` и `COLORS` |
| `components/metrics/SpentByTypeChart.tsx` | Использовать хелперы, удалить `TYPE_LABELS`, заменить `fill` литерал на per-category цвета |
| `components/collection/FieldMappingEditor.tsx` | Русские лейблы в dropdown, поле `typeFieldName` |
| `components/collection/AddProjectWizard.tsx` | Добавить `typeFieldName: 'Type'` в локальный `DEFAULT_FIELD_MAPPING`; добавить `typeFieldName: fieldMapping.typeFieldName` в объект `handleCreate` (строки 200-205), где поля перечисляются вручную |
| `components/collection/EditSubscriptionModal.tsx` | Добавить `typeFieldName: 'Type'` в дефолтный `useState<FieldMapping>` (строка 39-44) |

### Миграция (1 файл)

| Файл | Изменение |
|------|-----------|
| `migrations/Migration20260313000000_add_type_field_name.ts` | `ALTER TABLE field_mappings ADD COLUMN type_field_name` |

**Итого: 14 файлов (включая 1 новый) + 1 миграция = 15 файлов.**

---

## Порядок реализации

1. Единый источник категорий (бэкенд + фронт) — фундамент
2. Фиксированные цвета и русские лейблы (графики + dropdown) — используют п.1
3. Case-insensitive маппинг — независимое изменение
4. Настраиваемое имя поля Type — миграция + entity + UI
5. Русские лейблы в LLM — используют п.1
6. Проверка компиляции TypeScript (бэкенд + фронтенд)

## Вне скоупа

- Автокомплит типов задач из YouTrack API (отдельная итерация)
- Настраиваемые категории для KPI focus (отдельная задача, хардкод в `kpi-calculator.ts:59-61`)
- Рефакторинг хардкода `'bugfix'` в `countBugsAfterRelease` (отдельная задача, `metrics-collector.ts:384`)
