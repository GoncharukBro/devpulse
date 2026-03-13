# Task Category Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate duplicated task category definitions into a single source, add configurable Type field name, case-insensitive mapping, fixed chart colors, and Russian labels in LLM prompts.

**Architecture:** Backend defines canonical `TASK_CATEGORIES` array with `{key, labelRu, labelEn, color}`. Frontend mirrors it. All consumers import from these two files. Charts use per-category colors. Metrics collector reads `typeFieldName` from FieldMapping entity and does case-insensitive lookup.

**Tech Stack:** TypeScript, MikroORM (PostgreSQL), React, Recharts, Fastify.

**Spec:** `docs/superpowers/specs/2026-03-13-task-category-refactoring-design.md`

**Note:** Project has no test framework configured. Steps focus on TypeScript compilation checks and manual verification.

---

## Chunk 1: Unified Category Source + Backend Changes

### Task 1: Define TaskCategoryDefinition on backend

**Files:**
- Modify: `backend/src/modules/subscriptions/subscriptions.types.ts`

- [ ] **Step 1: Replace VALID_TASK_CATEGORIES with new structure**

Open `backend/src/modules/subscriptions/subscriptions.types.ts`. Replace the old constant and add new types:

```typescript
// DELETE these lines (41-49):
// export const VALID_TASK_CATEGORIES = [
//   'feature', 'bugfix', 'techDebt', 'support',
//   'documentation', 'codeReview', 'other',
// ] as const;

// ADD instead:
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

- [ ] **Step 2: Add typeFieldName to DTOs**

In the same file, add `typeFieldName` to both DTOs:

```typescript
export interface CreateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  typeFieldName?: string;              // ← ADD
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}

export interface UpdateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  typeFieldName?: string;              // ← ADD
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}
```

Add `typeFieldName: 'Type'` to `DEFAULT_FIELD_MAPPING`:

```typescript
export const DEFAULT_FIELD_MAPPING: Required<CreateFieldMappingDto> = {
  taskTypeMapping: {
    Feature: 'feature',
    Bug: 'bugfix',
    Task: 'feature',
    Epic: 'feature',
    'User Story': 'feature',
    'Tech Debt': 'techDebt',
    Documentation: 'documentation',
    'Code Review': 'codeReview',
  },
  typeFieldName: 'Type',               // ← ADD
  cycleTimeStartStatuses: ['In Progress', 'В работе'],
  cycleTimeEndStatuses: ['Done', 'Verified', 'Fixed', 'Готово'],
  releaseStatuses: [],
};
```

- [ ] **Step 3: Verify compilation**

Run: `cd backend && npx tsc --noEmit`
Expected: Errors in `field-mapping.service.ts` and `subscriptions.routes.ts` referencing old `VALID_TASK_CATEGORIES` — these will be fixed in Task 2.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/subscriptions/subscriptions.types.ts
git commit -m "refactor(backend): unified TaskCategoryDefinition with labels, colors, and typeFieldName DTO"
```

---

### Task 2: Update backend consumers of VALID_TASK_CATEGORIES

**Files:**
- Modify: `backend/src/modules/subscriptions/field-mapping.service.ts`
- Modify: `backend/src/modules/subscriptions/subscriptions.routes.ts`

- [ ] **Step 1: Update field-mapping.service.ts imports and validation**

In `backend/src/modules/subscriptions/field-mapping.service.ts`, change the import (line 9):

```typescript
// Was:
import { ..., VALID_TASK_CATEGORIES } from './subscriptions.types';

// Becomes:
import { ..., VALID_TASK_CATEGORY_KEYS } from './subscriptions.types';
```

In `validateTaskTypeMapping` (line 17), replace:

```typescript
// Was:
if (!VALID_TASK_CATEGORIES.includes(value as (typeof VALID_TASK_CATEGORIES)[number])) {
  throw new ValidationError(
    `Invalid task category "${value}" for key "${key}". Valid: ${VALID_TASK_CATEGORIES.join(', ')}`,
  );

// Becomes:
if (!VALID_TASK_CATEGORY_KEYS.includes(value)) {
  throw new ValidationError(
    `Invalid task category "${value}" for key "${key}". Valid: ${VALID_TASK_CATEGORY_KEYS.join(', ')}`,
  );
```

- [ ] **Step 2: Add typeFieldName handling in createFieldMapping**

In `createFieldMapping` function, add validation after the existing `validateTaskTypeMapping` call (after line 45):

```typescript
if (data.typeFieldName !== undefined && (typeof data.typeFieldName !== 'string' || data.typeFieldName.trim() === '')) {
  throw new ValidationError('typeFieldName must be a non-empty string');
}
```

Then after line 49, add the assignment:

```typescript
mapping.taskTypeMapping = data.taskTypeMapping ?? DEFAULT_FIELD_MAPPING.taskTypeMapping;
mapping.typeFieldName = data.typeFieldName ?? DEFAULT_FIELD_MAPPING.typeFieldName;  // ← ADD
mapping.cycleTimeStartStatuses = ...
```

In `updateFieldMapping` function (after line 88), add:

```typescript
if (dto.typeFieldName !== undefined) {
  if (typeof dto.typeFieldName !== 'string' || dto.typeFieldName.trim() === '') {
    throw new ValidationError('typeFieldName must be a non-empty string');
  }
  mapping.typeFieldName = dto.typeFieldName;
}
```

- [ ] **Step 3: Update subscriptions.routes.ts**

In `backend/src/modules/subscriptions/subscriptions.routes.ts`, change the import (line 22):

```typescript
// Was:
import { ..., VALID_TASK_CATEGORIES } from './subscriptions.types';

// Becomes:
import { ..., VALID_TASK_CATEGORY_KEYS } from './subscriptions.types';
```

In `validateFieldMapping` function (line 30), replace:

```typescript
// Was:
(v) => !VALID_TASK_CATEGORIES.includes(v as (typeof VALID_TASK_CATEGORIES)[number]),

// Becomes:
(v) => !VALID_TASK_CATEGORY_KEYS.includes(v),
```

In line 33, replace:

```typescript
// Was:
throw new ValidationError(`... Valid: ${VALID_TASK_CATEGORIES.join(', ')}`);

// Becomes:
throw new ValidationError(`... Valid: ${VALID_TASK_CATEGORY_KEYS.join(', ')}`);
```

In GET field-mapping response (line 121) and PUT response (line 142), add `typeFieldName`:

```typescript
return {
  taskTypeMapping: mapping.taskTypeMapping,
  typeFieldName: mapping.typeFieldName,              // ← ADD
  cycleTimeStartStatuses: mapping.cycleTimeStartStatuses,
  ...
};
```

- [ ] **Step 4: Update subscriptions.service.ts serialization**

In `backend/src/modules/subscriptions/subscriptions.service.ts`, find the `fieldMapping` serialization block (around line 199) and add `typeFieldName`:

```typescript
fieldMapping: sub.fieldMapping
  ? {
      taskTypeMapping: sub.fieldMapping.taskTypeMapping,
      typeFieldName: sub.fieldMapping.typeFieldName,    // ← ADD
      cycleTimeStartStatuses: sub.fieldMapping.cycleTimeStartStatuses,
      ...
    }
  : null,
```

- [ ] **Step 5: Verify compilation**

Run: `cd backend && npx tsc --noEmit`
Expected: Errors about `typeFieldName` not existing on `FieldMapping` entity — fixed in Task 3.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/subscriptions/field-mapping.service.ts backend/src/modules/subscriptions/subscriptions.routes.ts backend/src/modules/subscriptions/subscriptions.service.ts
git commit -m "refactor(backend): migrate to VALID_TASK_CATEGORY_KEYS, add typeFieldName handling"
```

---

### Task 3: FieldMapping entity + migration

**Files:**
- Modify: `backend/src/entities/field-mapping.entity.ts`
- Create: `backend/src/migrations/Migration20260313000000_add_type_field_name.ts`

- [ ] **Step 1: Add typeFieldName to entity**

In `backend/src/entities/field-mapping.entity.ts`, add after line 17 (`taskTypeMapping`):

```typescript
@Property({ type: 'text', default: 'Type' })
typeFieldName: string = 'Type';
```

- [ ] **Step 2: Create migration**

Create `backend/src/migrations/Migration20260313000000_add_type_field_name.ts`:

```typescript
import { Migration } from '@mikro-orm/migrations';

export class Migration20260313000000_add_type_field_name extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE field_mappings
        ADD COLUMN type_field_name text NOT NULL DEFAULT 'Type';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE field_mappings
        DROP COLUMN type_field_name;
    `);
  }
}
```

- [ ] **Step 3: Verify full backend compilation**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add backend/src/entities/field-mapping.entity.ts backend/src/migrations/Migration20260313000000_add_type_field_name.ts
git commit -m "feat(backend): add typeFieldName to FieldMapping entity with migration"
```

---

### Task 4: MetricsCollector — typeFieldName + case-insensitive

**Files:**
- Modify: `backend/src/modules/collection/metrics-collector.ts`

- [ ] **Step 1: Replace hardcoded 'Type' with typeFieldName**

In `backend/src/modules/collection/metrics-collector.ts`, method `resolveIssueType` (line 266):

```typescript
// Was:
const typeField = issue.customFields.find((f) => f.name === 'Type');

// Becomes:
const typeField = issue.customFields.find(
  (f) => f.name === this.fieldMapping.typeFieldName
);
```

- [ ] **Step 2: Add case-insensitive fallback**

In the same method (line 280):

```typescript
// Was:
return this.fieldMapping.taskTypeMapping[typeName] || 'other';

// Becomes:
const mapping = this.fieldMapping.taskTypeMapping;
const directMatch = mapping[typeName];
if (directMatch) return directMatch;

const lowerTypeName = typeName.toLowerCase();
const found = Object.entries(mapping).find(
  ([key]) => key.toLowerCase() === lowerTypeName
);
return found ? found[1] : 'other';
```

- [ ] **Step 3: Verify compilation**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/collection/metrics-collector.ts
git commit -m "feat(backend): configurable typeFieldName + case-insensitive mapping fallback"
```

---

### Task 5: Russian labels in LLM prompt

**Files:**
- Modify: `backend/src/modules/llm/llm.prompt.ts`

- [ ] **Step 1: Add import and replace both label points**

In `backend/src/modules/llm/llm.prompt.ts`, add import at top (after line 5):

```typescript
import { getCategoryLabelRu } from '../subscriptions/subscriptions.types';
```

Replace line 40 (typesStr):

```typescript
// Was:
? typeEntries.map(([k, v]) => `${k}:${v}`).join(', ')

// Becomes:
? typeEntries.map(([k, v]) => `${getCategoryLabelRu(k)}:${v}`).join(', ')
```

Replace line 53 (taskLines):

```typescript
// Was:
const taskLines = tasks.map((t) => `- ${t.id}: ${t.summary} (${t.type})`);

// Becomes:
const taskLines = tasks.map((t) => `- ${t.id}: ${t.summary} (${getCategoryLabelRu(t.type)})`);
```

- [ ] **Step 2: Verify full backend compilation**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS — all backend changes compile.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/llm/llm.prompt.ts
git commit -m "feat(backend): Russian category labels in LLM prompt"
```

---

## Chunk 2: Frontend Changes

### Task 6: Update frontend types

**Files:**
- Modify: `frontend/src/types/subscription.ts`

- [ ] **Step 1: Replace old category types with new structure**

In `frontend/src/types/subscription.ts`, delete old constants (lines 98-118):

```typescript
// DELETE:
// export const TASK_CATEGORIES = [ 'feature', ... ] as const;
// export type TaskCategory = (typeof TASK_CATEGORIES)[number];
// export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = { ... };
```

Add new structure at the same location:

```typescript
/**
 * Категории задач — зеркало backend/src/modules/subscriptions/subscriptions.types.ts.
 * При добавлении/изменении категорий обновлять оба файла.
 */
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
```

- [ ] **Step 2: Add typeFieldName to FieldMapping interface**

In the same file, update `FieldMapping` interface (around line 54):

```typescript
export interface FieldMapping {
  taskTypeMapping: Record<string, string>;
  typeFieldName: string;                    // ← ADD
  cycleTimeStartStatuses: string[];
  cycleTimeEndStatuses: string[];
  releaseStatuses: string[];
}
```

Add to `CreateFieldMappingDto` (around line 78):

```typescript
export interface CreateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  typeFieldName?: string;                   // ← ADD
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}
```

Add to `UpdateFieldMappingDto` (around line 90):

```typescript
export interface UpdateFieldMappingDto {
  taskTypeMapping?: Record<string, string>;
  typeFieldName?: string;                   // ← ADD
  cycleTimeStartStatuses?: string[];
  cycleTimeEndStatuses?: string[];
  releaseStatuses?: string[];
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/subscription.ts
git commit -m "refactor(frontend): unified TaskCategoryDefinition, add typeFieldName to FieldMapping"
```

---

### Task 7: Create frontend utils

**Files:**
- Create: `frontend/src/utils/task-categories.ts`

- [ ] **Step 1: Create utility file**

Create `frontend/src/utils/task-categories.ts`:

```typescript
import { TASK_CATEGORIES } from '@/types/subscription';

export function getCategoryLabel(key: string): string {
  return TASK_CATEGORIES.find(c => c.key === key)?.labelRu ?? key;
}

export function getCategoryColor(key: string): string {
  return TASK_CATEGORIES.find(c => c.key === key)?.color ?? '#6b7280';
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/task-categories.ts
git commit -m "feat(frontend): add task-categories utility helpers"
```

---

### Task 8: Update IssuesByTypeChart

**Files:**
- Modify: `frontend/src/components/metrics/IssuesByTypeChart.tsx`

- [ ] **Step 1: Replace TYPE_LABELS and COLORS with helpers**

Delete `TYPE_LABELS` (lines 10-18) and `COLORS` (line 20).

Add import at top:

```typescript
import { getCategoryLabel, getCategoryColor } from '@/utils/task-categories';
```

Update `chartData` construction (line 50-55):

```typescript
const chartData = Object.entries(data)
  .filter(([, v]) => v > 0)
  .map(([key, value]) => ({
    name: getCategoryLabel(key),
    value,
    color: getCategoryColor(key),
  }));
```

Update `<Cell>` (line 83):

```typescript
// Was:
<Cell key={index} fill={COLORS[index % COLORS.length]} />

// Becomes:
<Cell key={index} fill={chartData[index].color} />
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/metrics/IssuesByTypeChart.tsx
git commit -m "refactor(frontend): IssuesByTypeChart uses unified categories with fixed colors"
```

---

### Task 9: Update SpentByTypeChart

**Files:**
- Modify: `frontend/src/components/metrics/SpentByTypeChart.tsx`

- [ ] **Step 1: Replace TYPE_LABELS and fixed fill with per-category colors**

Delete `TYPE_LABELS` (lines 11-19).

Add import at top:

```typescript
import { getCategoryLabel, getCategoryColor } from '@/utils/task-categories';
```

Update `chartData` construction (line 50-56):

```typescript
const chartData = Object.entries(data)
  .filter(([, v]) => v > 0)
  .map(([key, value]) => ({
    name: getCategoryLabel(key),
    value: Number(value.toFixed(1)),
    color: getCategoryColor(key),
  }))
  .sort((a, b) => b.value - a.value);
```

Replace the `<Bar>` element (line 91-95). Remove `fill="#6366f1"` and add `<Cell>` children:

```typescript
<Bar
  dataKey="value"
  radius={[0, 4, 4, 0]}
  barSize={20}
>
  {chartData.map((entry, index) => (
    <Cell key={index} fill={entry.color} />
  ))}
</Bar>
```

Add `Cell` to recharts import at top of file:

```typescript
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,                              // ← ADD
} from 'recharts';
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/metrics/SpentByTypeChart.tsx
git commit -m "refactor(frontend): SpentByTypeChart uses unified categories with per-bar colors"
```

---

### Task 10: Update FieldMappingEditor

**Files:**
- Modify: `frontend/src/components/collection/FieldMappingEditor.tsx`

- [ ] **Step 1: Update imports**

Replace line 4:

```typescript
// Was:
import { TASK_CATEGORIES, TASK_CATEGORY_LABELS, type TaskCategory } from '@/types/subscription';

// Becomes:
import { TASK_CATEGORIES } from '@/types/subscription';
```

- [ ] **Step 2: Update FieldMappingEditorProps to include typeFieldName handling**

The component already receives `value: FieldMapping` and `onChange`. The `typeFieldName` field is part of `FieldMapping`, so it flows through automatically.

Add a text input for `typeFieldName` at the start of the return JSX (before the "Типы задач" section, around line 52):

```typescript
{/* Type field name */}
<div>
  <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-300">
    Поле типа задачи в YouTrack
  </label>
  <input
    type="text"
    value={value.typeFieldName}
    onChange={(e) => updateMapping({ typeFieldName: e.target.value })}
    placeholder="Type"
    className="w-60 rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:border-brand-500"
  />
  <p className="mt-1 text-xs text-gray-500 dark:text-gray-600">
    Название кастомного поля в YouTrack, определяющего тип задачи. Обычно &lsquo;Type&rsquo;, но может быть &lsquo;Тип&rsquo; или другое.
  </p>
</div>
```

- [ ] **Step 3: Replace dropdown labels**

Update the category dropdown (lines 64-68):

```typescript
// Was:
{TASK_CATEGORIES.map((cat) => (
  <option key={cat} value={cat}>
    {TASK_CATEGORY_LABELS[cat as TaskCategory]}
  </option>
))}

// Becomes:
{TASK_CATEGORIES.map((cat) => (
  <option key={cat.key} value={cat.key}>
    {cat.labelRu}
  </option>
))}
```

Also update the `addStatus` type signature (line 40) — the `field` union type stays the same but references to `TASK_CATEGORIES` as string array need updating. Specifically, `addTaskType` (line 23) assigns `'feature'` as default — this stays unchanged since it's a string literal.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/collection/FieldMappingEditor.tsx
git commit -m "feat(frontend): FieldMappingEditor with typeFieldName input and Russian labels"
```

---

### Task 11: Update AddProjectWizard and EditSubscriptionModal

**Files:**
- Modify: `frontend/src/components/collection/AddProjectWizard.tsx`
- Modify: `frontend/src/components/collection/EditSubscriptionModal.tsx`

- [ ] **Step 1: Update AddProjectWizard DEFAULT_FIELD_MAPPING**

In `frontend/src/components/collection/AddProjectWizard.tsx`, add `typeFieldName` to the local `DEFAULT_FIELD_MAPPING` (around line 28-42):

```typescript
const DEFAULT_FIELD_MAPPING: FieldMapping = {
  taskTypeMapping: {
    Feature: 'feature',
    Bug: 'bugfix',
    Task: 'feature',
    Epic: 'feature',
    'User Story': 'feature',
    'Tech Debt': 'techDebt',
    Documentation: 'documentation',
    'Code Review': 'codeReview',
  },
  typeFieldName: 'Type',                    // ← ADD
  cycleTimeStartStatuses: ['In Progress'],
  cycleTimeEndStatuses: ['Done'],
  releaseStatuses: [],
};
```

- [ ] **Step 2: Update handleCreate field list**

In the same file, update `handleCreate` (lines 200-205) to include `typeFieldName`:

```typescript
// Was:
fieldMapping: useCustomMapping ? {
    taskTypeMapping: fieldMapping.taskTypeMapping,
    cycleTimeStartStatuses: fieldMapping.cycleTimeStartStatuses,
    cycleTimeEndStatuses: fieldMapping.cycleTimeEndStatuses,
    releaseStatuses: fieldMapping.releaseStatuses,
} : undefined,

// Becomes:
fieldMapping: useCustomMapping ? {
    taskTypeMapping: fieldMapping.taskTypeMapping,
    typeFieldName: fieldMapping.typeFieldName,
    cycleTimeStartStatuses: fieldMapping.cycleTimeStartStatuses,
    cycleTimeEndStatuses: fieldMapping.cycleTimeEndStatuses,
    releaseStatuses: fieldMapping.releaseStatuses,
} : undefined,
```

- [ ] **Step 3: Update EditSubscriptionModal default state**

In `frontend/src/components/collection/EditSubscriptionModal.tsx`, update the default `FieldMapping` state (lines 39-44):

```typescript
// Was:
const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
  taskTypeMapping: {},
  cycleTimeStartStatuses: [],
  cycleTimeEndStatuses: [],
  releaseStatuses: [],
});

// Becomes:
const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
  taskTypeMapping: {},
  typeFieldName: 'Type',                    // ← ADD
  cycleTimeStartStatuses: [],
  cycleTimeEndStatuses: [],
  releaseStatuses: [],
});
```

- [ ] **Step 4: Verify full frontend compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — all frontend changes compile.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/collection/AddProjectWizard.tsx frontend/src/components/collection/EditSubscriptionModal.tsx
git commit -m "feat(frontend): add typeFieldName to AddProjectWizard and EditSubscriptionModal"
```

---

### Task 12: Final verification

- [ ] **Step 1: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify no remaining references to old constants**

Search for orphaned references:

```bash
grep -r "VALID_TASK_CATEGORIES" backend/src/ --include="*.ts"
grep -r "TASK_CATEGORY_LABELS" frontend/src/ --include="*.ts" --include="*.tsx"
grep -r "TaskCategory" frontend/src/ --include="*.ts" --include="*.tsx"
grep -r "TYPE_LABELS" frontend/src/ --include="*.ts" --include="*.tsx"
```

Expected: No results for any of these (all replaced).

- [ ] **Step 4: Final commit if any fixups needed**

If grep found orphaned references, fix them and commit:

```bash
git add -A
git commit -m "fix: clean up remaining references to old category constants"
```
