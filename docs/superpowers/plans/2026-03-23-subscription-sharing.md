# Subscription Sharing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Позволить владельцу подписки предоставить viewer-only доступ другим пользователям Keycloak по логину.

**Architecture:** Новая сущность `SubscriptionShare` связывает подписку с логином получателя. Хелпер `subscriptionAccessFilter` заменяет фильтр `{ ownerId }` на `$or: [owner, shared]` во всех read-запросах. Мутации остаются owner-only. На фронте — бейдж «Общий доступ» и UI управления shares в настройках подписки.

**Tech Stack:** MikroORM + PostgreSQL (backend), React + Zustand + Tailwind (frontend), Fastify (routes)

**Spec:** `docs/superpowers/specs/2026-03-23-subscription-sharing-design.md`

---

## File Structure

### Backend — создать

| Файл | Ответственность |
|------|----------------|
| `backend/src/entities/subscription-share.entity.ts` | Сущность SubscriptionShare |
| `backend/src/migrations/Migration20260323000000_subscription_shares.ts` | Миграция: таблица + индексы |
| `backend/src/modules/subscriptions/subscription-access.ts` | Хелпер `subscriptionAccessFilter` + `findAccessibleSubscriptions` |
| `backend/src/modules/subscriptions/shares.service.ts` | CRUD для shares |
| `backend/src/modules/subscriptions/shares.routes.ts` | Маршруты `/api/subscriptions/:id/shares` |

### Backend — изменить

| Файл | Что меняется |
|------|-------------|
| `backend/src/entities/subscription.entity.ts` | Добавить `OneToMany → SubscriptionShare` |
| `backend/src/entities/index.ts` | Экспорт `SubscriptionShare` |
| `backend/src/modules/subscriptions/subscriptions.service.ts` | `listSubscriptions` и `getSubscription` — использовать `subscriptionAccessFilter` |
| `backend/src/modules/subscriptions/subscriptions.routes.ts` | Передавать `request.user.username` в list/get; подключить shares routes |
| `backend/src/modules/subscriptions/field-mapping.service.ts` | `getFieldMapping` — расширить фильтр для viewer |
| `backend/src/modules/reports/reports.service.ts` | `getUserSubscriptions` — принимать `userLogin`, использовать `subscriptionAccessFilter` |
| `backend/src/modules/reports/reports.routes.ts` | Передавать `request.user.username` в сервис |
| `backend/src/modules/aggregated-reports/aggregated-reports.service.ts` | `list`, `getById`, `delete` — фильтр по `createdBy` |
| `backend/src/modules/aggregated-reports/aggregated-reports.routes.ts` | Передавать `request.user.id` в list/getById/delete |

### Frontend — создать

| Файл | Ответственность |
|------|----------------|
| `frontend/src/api/endpoints/shares.ts` | API-клиент для shares CRUD |
| `frontend/src/components/collection/SharesManager.tsx` | UI управления shares (таблица + добавление) |
| `frontend/src/components/collection/SharedBadge.tsx` | Бейдж «Общий доступ» |

### Frontend — изменить

| Файл | Что меняется |
|------|-------------|
| `frontend/src/types/subscription.ts` | Добавить `isOwner`, типы для shares |
| `frontend/src/components/collection/SubscriptionCard.tsx` | Бейдж + скрытие мутаций для viewer |
| `frontend/src/pages/CollectionPage.tsx` | Скрытие кнопок запуска/остановки для shared подписок |
| `frontend/src/components/collection/EditSubscriptionModal.tsx` | Вкладка «Доступ» с SharesManager |

---

## Task 1: Сущность SubscriptionShare + миграция

**Files:**
- Create: `backend/src/entities/subscription-share.entity.ts`
- Create: `backend/src/migrations/Migration20260323000000_subscription_shares.ts`
- Modify: `backend/src/entities/subscription.entity.ts`
- Modify: `backend/src/entities/index.ts`

- [ ] **Step 1: Создать сущность SubscriptionShare**

```typescript
// backend/src/entities/subscription-share.entity.ts
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { Subscription } from './subscription.entity';
import { prefixedTable } from './table-prefix';

@Entity({ tableName: prefixedTable('subscription_shares') })
@Unique({ properties: ['subscription', 'sharedWithLogin'] })
export class SubscriptionShare {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Subscription, { deleteRule: 'cascade' })
  subscription!: Subscription;

  @Property({ length: 255 })
  sharedWithLogin!: string;

  @Property({ length: 255 })
  sharedBy!: string;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
```

- [ ] **Step 2: Добавить связь в Subscription entity**

В файле `backend/src/entities/subscription.entity.ts` добавить import `SubscriptionShare` и поле:

```typescript
import { SubscriptionShare } from './subscription-share.entity';

// внутри class Subscription, после поля collectionLogs:
@OneToMany(() => SubscriptionShare, (s) => s.subscription)
shares = new Collection<SubscriptionShare>(this);
```

Также добавить `SubscriptionShare` в import `Collection` (если ещё не импортирован).

- [ ] **Step 3: Экспортировать из index.ts**

В `backend/src/entities/index.ts` добавить:

```typescript
export { SubscriptionShare } from './subscription-share.entity';
```

- [ ] **Step 4: Создать миграцию**

```typescript
// backend/src/migrations/Migration20260323000000_subscription_shares.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20260323000000_subscription_shares extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE "devpulse_subscription_shares" (
        "id"                  serial      NOT NULL,
        "subscription_id"     uuid        NOT NULL,
        "shared_with_login"   varchar(255) NOT NULL,
        "shared_by"           varchar(255) NOT NULL,
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "devpulse_subscription_shares_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "devpulse_subscription_shares_subscription_fk"
          FOREIGN KEY ("subscription_id")
          REFERENCES "devpulse_subscriptions" ("id")
          ON DELETE CASCADE
      );
    `);

    this.addSql(`
      CREATE UNIQUE INDEX "devpulse_subscription_shares_sub_login_unique"
        ON "devpulse_subscription_shares" ("subscription_id", "shared_with_login");
    `);

    this.addSql(`
      CREATE INDEX "devpulse_subscription_shares_login_idx"
        ON "devpulse_subscription_shares" ("shared_with_login");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "devpulse_subscription_shares";`);
  }
}
```

- [ ] **Step 5: Запустить миграцию и проверить**

Run: `cd backend && npx mikro-orm migration:up`
Expected: миграция применена без ошибок

- [ ] **Step 6: Commit**

```bash
git add backend/src/entities/subscription-share.entity.ts \
       backend/src/entities/subscription.entity.ts \
       backend/src/entities/index.ts \
       backend/src/migrations/Migration20260323000000_subscription_shares.ts
git commit -m "feat(sharing): add SubscriptionShare entity and migration"
```

---

## Task 2: Хелпер subscriptionAccessFilter

**Files:**
- Create: `backend/src/modules/subscriptions/subscription-access.ts`

- [ ] **Step 1: Создать хелпер**

```typescript
// backend/src/modules/subscriptions/subscription-access.ts
import { EntityManager, FilterQuery } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';

/**
 * Фильтр для подписок, к которым пользователь имеет доступ:
 * - как владелец (ownerId)
 * - как получатель share (sharedWithLogin)
 */
export function subscriptionAccessFilter(
  userId: string,
  userLogin: string,
): FilterQuery<Subscription> {
  return {
    $or: [
      { ownerId: userId },
      { shares: { sharedWithLogin: userLogin.toLowerCase() } },
    ],
  };
}

/**
 * Находит доступные подписки. Используется в ReportsService.
 */
export async function findAccessibleSubscriptions(
  em: EntityManager,
  userId: string,
  userLogin: string,
  subscriptionId?: string,
): Promise<Subscription[]> {
  const baseFilter = subscriptionAccessFilter(userId, userLogin);

  if (subscriptionId) {
    const sub = await em.findOne(Subscription, {
      id: subscriptionId,
      ...baseFilter,
    });
    if (!sub) return [];
    return [sub];
  }

  return em.find(Subscription, baseFilter);
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/subscriptions/subscription-access.ts
git commit -m "feat(sharing): add subscriptionAccessFilter helper"
```

---

## Task 3: Обновить SubscriptionsService — list и getById

**Files:**
- Modify: `backend/src/modules/subscriptions/subscriptions.service.ts:44-50` (listSubscriptions)
- Modify: `backend/src/modules/subscriptions/subscriptions.service.ts:168-176` (getSubscription)
- Modify: `backend/src/modules/subscriptions/subscriptions.routes.ts:40-45` (list route)
- Modify: `backend/src/modules/subscriptions/subscriptions.routes.ts:56-58` (get route)

- [ ] **Step 1: Обновить `listSubscriptions` — добавить `userLogin` параметр и `isOwner` в ответ**

В `subscriptions.service.ts`:

1. Добавить import:
```typescript
import { subscriptionAccessFilter } from './subscription-access';
```

2. Изменить сигнатуру и фильтр `listSubscriptions`:

```typescript
export async function listSubscriptions(
  em: EntityManager,
  ownerId: string,
  userLogin: string,
  active?: boolean,
): Promise<object[]> {
  const accessFilter = subscriptionAccessFilter(ownerId, userLogin);
  const where: Record<string, unknown> = { ...accessFilter };
  if (active !== undefined) {
    where.isActive = active;
  }

  const subscriptions = await em.find(Subscription, where, {
    populate: ['employees', 'collectionLogs'],
    orderBy: { createdAt: 'DESC' },
  });
```

3. В `return` mapping (строка ~126) добавить поле `isOwner`:

```typescript
    return {
      id: sub.id,
      // ... существующие поля ...
      createdAt: sub.createdAt.toISOString(),
      isOwner: sub.ownerId === ownerId,
    };
```

- [ ] **Step 2: Обновить `getSubscription` — добавить опциональный `userLogin` и `isOwner`**

Параметр `userLogin` опционален — при вызове из `createSubscription`/`updateSubscription` (owner-only) передаётся `undefined`, и фильтр работает только по `ownerId`.

```typescript
export async function getSubscription(
  em: EntityManager,
  id: string,
  ownerId: string,
  userLogin?: string,
): Promise<object> {
  const where = userLogin
    ? { id, ...subscriptionAccessFilter(ownerId, userLogin) }
    : { id, ownerId };

  const sub = await em.findOne(
    Subscription,
    where,
    { populate: ['employees', 'fieldMapping'] },
  );

  if (!sub) {
    throw new NotFoundError('Subscription not found');
  }

  return {
    // ... существующие поля ...
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
    isOwner: sub.ownerId === ownerId,
  };
}
```

**Важно:** Внутренние вызовы `getSubscription` из `createSubscription` (строка 249) и `updateSubscription` (строка 266) продолжат работать без изменений — `userLogin` по умолчанию `undefined`.
```

- [ ] **Step 3: Обновить routes — передавать `request.user.username`**

В `subscriptions.routes.ts`:

```typescript
// GET /api/subscriptions
app.get<{ Querystring: { active?: string } }>('/subscriptions', async (request) => {
  const em = request.orm.em.fork();
  const active =
    request.query.active === 'true' ? true : request.query.active === 'false' ? false : undefined;
  return listSubscriptions(em, request.user.id, request.user.username, active);
});

// GET /api/subscriptions/:id
app.get<{ Params: { id: string } }>('/subscriptions/:id', async (request) => {
  const em = request.orm.em.fork();
  return getSubscription(em, request.params.id, request.user.id, request.user.username);
});
```

- [ ] **Step 4: Проверить компиляцию**

Run: `cd backend && npx tsc --noEmit`
Expected: без ошибок

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/subscriptions/subscriptions.service.ts \
       backend/src/modules/subscriptions/subscriptions.routes.ts
git commit -m "feat(sharing): update listSubscriptions and getSubscription with access filter"
```

---

## Task 4: Обновить field-mapping для viewer (read-only)

**Files:**
- Modify: `backend/src/modules/subscriptions/field-mapping.service.ts:65-81` (getFieldMapping)
- Modify: `backend/src/modules/subscriptions/subscriptions.routes.ts:117-127` (GET field-mapping route)

- [ ] **Step 1: Обновить `getFieldMapping` — принимать `userLogin`**

В `field-mapping.service.ts`:

```typescript
import { subscriptionAccessFilter } from './subscription-access';

export async function getFieldMapping(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
  userLogin: string,
): Promise<FieldMapping> {
  const mapping = await em.findOne(
    FieldMapping,
    { subscription: { id: subscriptionId, ...subscriptionAccessFilter(ownerId, userLogin) } },
    { populate: ['subscription'] },
  );

  if (!mapping) {
    throw new NotFoundError('Field mapping not found');
  }

  return mapping;
}
```

- [ ] **Step 2: Обновить route GET field-mapping**

В `subscriptions.routes.ts`:

```typescript
app.get<{ Params: { id: string } }>('/subscriptions/:id/field-mapping', async (request) => {
  const em = request.orm.em.fork();
  const mapping = await getFieldMapping(em, request.params.id, request.user.id, request.user.username);
  return {
    taskTypeMapping: mapping.taskTypeMapping,
    typeFieldName: mapping.typeFieldName,
    cycleTimeStartStatuses: mapping.cycleTimeStartStatuses,
    cycleTimeEndStatuses: mapping.cycleTimeEndStatuses,
    releaseStatuses: mapping.releaseStatuses,
  };
});
```

**Важно:** `updateFieldMapping` остаётся owner-only — его не трогаем.

- [ ] **Step 3: Проверить компиляцию**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/subscriptions/field-mapping.service.ts \
       backend/src/modules/subscriptions/subscriptions.routes.ts
git commit -m "feat(sharing): allow viewer access to field-mapping (read-only)"
```

---

## Task 5: Обновить ReportsService — getUserSubscriptions

**Files:**
- Modify: `backend/src/modules/reports/reports.service.ts:819-832` (getUserSubscriptions)
- Modify: `backend/src/modules/reports/reports.service.ts` (все вызовы getUserSubscriptions)
- Modify: `backend/src/modules/reports/reports.routes.ts` (передавать username)

- [ ] **Step 1: Обновить `getUserSubscriptions`**

В `reports.service.ts`:

1. Добавить import:
```typescript
import { findAccessibleSubscriptions } from '../subscriptions/subscription-access';
```

2. Заменить `getUserSubscriptions`:

```typescript
private async getUserSubscriptions(
  userId: string,
  userLogin: string,
  subscriptionId?: string,
): Promise<Subscription[]> {
  const subs = await findAccessibleSubscriptions(this.em, userId, userLogin, subscriptionId);
  if (subscriptionId && subs.length === 0) {
    throw new NotFoundError('Subscription not found');
  }
  return subs;
}
```

- [ ] **Step 2: Обновить все вызовы `getUserSubscriptions` в ReportsService**

Каждый метод, вызывающий `getUserSubscriptions(params.userId)` или `getUserSubscriptions(params.userId, params.subscriptionId)`, теперь должен передавать `userLogin`:

- `getEmployeeHistory` → `getUserSubscriptions(params.userId, params.userLogin, params.subscriptionId)`
- `getEmployeeSummary` → `getUserSubscriptions(params.userId, params.userLogin)`
- `getOverview` → `getUserSubscriptions(userId, userLogin)`
- `getEmployeeList` → `getUserSubscriptions(userId, userLogin)`
- `getEmployeeReportList` → `getUserSubscriptions(params.userId, params.userLogin, params.subscriptionId)`
- `getTeamEmailPreview` (строка 1283) → `getUserSubscriptions(userId, userLogin)` — Teams вне scope sharing, но вызов `getUserSubscriptions` нужно обновить для совместимости сигнатуры

Соответственно обновить params-типы каждого метода, добавив `userLogin: string`.

- [ ] **Step 3: Обновить методы с прямым `ownerId` фильтром**

Следующие методы фильтруют Subscription напрямую через `{ ownerId: params.userId }`. Каждый нужно обновить, заменив на `subscriptionAccessFilter`. Также добавить `userLogin: string` в params каждого метода.

```typescript
// getEmployeeReport — строка ~67
const sub = await this.em.findOne(Subscription, {
  id: params.subscriptionId,
  ...subscriptionAccessFilter(params.userId, params.userLogin),
});

// getProjectSummary — строка ~319
const sub = await this.em.findOne(Subscription, {
  id: params.subscriptionId,
  ...subscriptionAccessFilter(params.userId, params.userLogin),
});

// getProjectHistory — строка ~470
const sub = await this.em.findOne(Subscription, {
  id: params.subscriptionId,
  ...subscriptionAccessFilter(params.userId, params.userLogin),
});

// getEmployeeEmailPreview — строка ~1074
const sub = await this.em.findOne(Subscription, {
  id: subscriptionId,
  ...subscriptionAccessFilter(userId, userLogin),
});

// getProjectEmailPreview — строка ~1181
const sub = await this.em.findOne(Subscription, {
  id: subscriptionId,
  ...subscriptionAccessFilter(userId, userLogin),
});
```

Добавить import:
```typescript
import { subscriptionAccessFilter } from '../subscriptions/subscription-access';
```

**Примечание:** `getTeamEmailPreview` фильтрует Team по `{ id: teamId, ownerId: userId }` — Teams вне scope sharing. Однако этот метод также вызывает `this.getUserSubscriptions(userId)` на строке 1283 — этот вызов НУЖНО обновить до `this.getUserSubscriptions(userId, userLogin)`, иначе компиляция сломается.

- [ ] **Step 4: Обновить reports.routes.ts — передавать username**

Все route-handlers в `reports.routes.ts` передают `request.user.id` в params. Добавить `userLogin: request.user.username` во все вызовы:

```typescript
// Пример для GET /api/reports/overview:
return reportsService.getOverview(request.user.id, request.user.username);

// Для методов с params объектом:
userId: request.user.id,
userLogin: request.user.username,
```

Обновить ВСЕ route-handlers в файле (их ~10 штук).

- [ ] **Step 5: Проверить компиляцию**

Run: `cd backend && npx tsc --noEmit`
Expected: без ошибок

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/reports/reports.service.ts \
       backend/src/modules/reports/reports.routes.ts
git commit -m "feat(sharing): update ReportsService to respect subscription sharing"
```

---

## Task 6: Фикс безопасности AggregatedReports

**Files:**
- Modify: `backend/src/modules/aggregated-reports/aggregated-reports.service.ts:138-218`
- Modify: `backend/src/modules/aggregated-reports/aggregated-reports.routes.ts:65-105`

- [ ] **Step 1: Обновить `list` — фильтр по `createdBy`**

В `aggregated-reports.service.ts`:

```typescript
async list(params: { type?: string; page?: number; limit?: number; userId: string }): Promise<ListResponse> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = { createdBy: params.userId };
  if (params.type) where.type = params.type;

  // остальное без изменений
```

- [ ] **Step 2: Обновить `getById` — фильтр по `createdBy`**

```typescript
async getById(id: string, userId: string): Promise<AggregatedReportDTO | null> {
  const r = await this.em.findOne(AggregatedReport, { id, createdBy: userId });
  if (!r) return null;
  // остальное без изменений
```

- [ ] **Step 3: Обновить `delete` — фильтр по `createdBy`**

```typescript
async delete(id: string, userId: string): Promise<void> {
  const report = await this.em.findOne(AggregatedReport, { id, createdBy: userId });
  if (report) {
    await this.em.removeAndFlush(report);
  }
}
```

- [ ] **Step 4: Обновить routes — передавать userId**

В `aggregated-reports.routes.ts`:

```typescript
// GET /api/aggregated-reports
app.get<{ Querystring: ListQuery }>(
  '/aggregated-reports',
  async (request) => {
    const { type, page, limit } = request.query;
    const em = request.orm.em.fork();
    const service = new AggregatedReportsService(em, llmServiceRef, request.orm);
    return service.list({
      type,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      userId: request.user.id,
    });
  },
);

// GET /api/aggregated-reports/:id
app.get<{ Params: { id: string } }>(
  '/aggregated-reports/:id',
  async (request, reply) => {
    const em = request.orm.em.fork();
    const service = new AggregatedReportsService(em, llmServiceRef, request.orm);
    const result = await service.getById(request.params.id, request.user.id);
    if (!result) {
      reply.status(404).send({ message: 'Report not found' });
      return;
    }
    return result;
  },
);

// DELETE /api/aggregated-reports/:id
app.delete<{ Params: { id: string } }>(
  '/aggregated-reports/:id',
  async (request, reply) => {
    const em = request.orm.em.fork();
    const service = new AggregatedReportsService(em, llmServiceRef, request.orm);
    await service.delete(request.params.id, request.user.id);
    reply.status(204).send();
  },
);
```

- [ ] **Step 5: Проверить компиляцию**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/aggregated-reports/aggregated-reports.service.ts \
       backend/src/modules/aggregated-reports/aggregated-reports.routes.ts
git commit -m "fix(security): add createdBy filtering to AggregatedReports list/getById/delete"
```

---

## Task 7: Shares CRUD — backend API

**Files:**
- Create: `backend/src/modules/subscriptions/shares.service.ts`
- Create: `backend/src/modules/subscriptions/shares.routes.ts`
- Modify: `backend/src/modules/subscriptions/subscriptions.routes.ts` (подключить shares routes)

- [ ] **Step 1: Создать shares.service.ts**

```typescript
// backend/src/modules/subscriptions/shares.service.ts
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionShare } from '../../entities/subscription-share.entity';
import { NotFoundError, ValidationError, AppError } from '../../common/errors';

const MAX_SHARES_PER_SUBSCRIPTION = 50;

async function getOwnedSubscription(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
): Promise<Subscription> {
  const sub = await em.findOne(Subscription, { id: subscriptionId, ownerId });
  if (!sub) throw new NotFoundError('Subscription not found');
  return sub;
}

export async function addShare(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
  ownerLogin: string,
  login: string,
): Promise<object> {
  const sub = await getOwnedSubscription(em, subscriptionId, ownerId);
  const normalizedLogin = login.trim().toLowerCase();

  if (!normalizedLogin) {
    throw new ValidationError('Login is required');
  }

  if (normalizedLogin === ownerLogin.toLowerCase()) {
    throw new ValidationError('Cannot share with yourself');
  }

  // Check limit
  const existingCount = await em.count(SubscriptionShare, { subscription: sub });
  if (existingCount >= MAX_SHARES_PER_SUBSCRIPTION) {
    throw new ValidationError(`Maximum ${MAX_SHARES_PER_SUBSCRIPTION} shares per subscription`);
  }

  const share = new SubscriptionShare();
  share.subscription = sub;
  share.sharedWithLogin = normalizedLogin;
  share.sharedBy = ownerLogin;

  try {
    em.persist(share);
    await em.flush();
  } catch (err) {
    if (err instanceof UniqueConstraintViolationException) {
      throw new AppError(409, 'Already shared with this user');
    }
    throw err;
  }

  return {
    id: share.id,
    sharedWithLogin: share.sharedWithLogin,
    sharedBy: share.sharedBy,
    createdAt: share.createdAt.toISOString(),
  };
}

export async function listShares(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ items: object[]; total: number }> {
  await getOwnedSubscription(em, subscriptionId, ownerId);

  const offset = (page - 1) * limit;
  const [shares, total] = await em.findAndCount(
    SubscriptionShare,
    { subscription: { id: subscriptionId } },
    { orderBy: { createdAt: 'DESC' }, limit, offset },
  );

  return {
    items: shares.map((s) => ({
      id: s.id,
      sharedWithLogin: s.sharedWithLogin,
      sharedBy: s.sharedBy,
      createdAt: s.createdAt.toISOString(),
    })),
    total,
  };
}

export async function removeShare(
  em: EntityManager,
  subscriptionId: string,
  shareId: number,
  ownerId: string,
): Promise<void> {
  await getOwnedSubscription(em, subscriptionId, ownerId);

  const share = await em.findOne(SubscriptionShare, {
    id: shareId,
    subscription: { id: subscriptionId },
  });

  if (share) {
    await em.removeAndFlush(share);
  }
}
```

- [ ] **Step 2: Создать shares.routes.ts**

```typescript
// backend/src/modules/subscriptions/shares.routes.ts
import { FastifyInstance } from 'fastify';
import { addShare, listShares, removeShare } from './shares.service';

export async function sharesRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/subscriptions/:id/shares
  app.post<{ Params: { id: string }; Body: { login: string } }>(
    '/subscriptions/:id/shares',
    async (request, reply) => {
      const em = request.orm.em.fork();
      const result = await addShare(
        em,
        request.params.id,
        request.user.id,
        request.user.username,
        request.body.login,
      );
      reply.status(201).send(result);
    },
  );

  // GET /api/subscriptions/:id/shares
  app.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>(
    '/subscriptions/:id/shares',
    async (request) => {
      const em = request.orm.em.fork();
      return listShares(
        em,
        request.params.id,
        request.user.id,
        request.query.page ? Number(request.query.page) : undefined,
        request.query.limit ? Number(request.query.limit) : undefined,
      );
    },
  );

  // DELETE /api/subscriptions/:id/shares/:shareId
  app.delete<{ Params: { id: string; shareId: string } }>(
    '/subscriptions/:id/shares/:shareId',
    async (request, reply) => {
      const em = request.orm.em.fork();
      await removeShare(
        em,
        request.params.id,
        Number(request.params.shareId),
        request.user.id,
      );
      reply.status(204).send();
    },
  );
}
```

- [ ] **Step 3: Подключить shares routes в основном файле маршрутов**

В `subscriptions.routes.ts` добавить:

```typescript
import { sharesRoutes } from './shares.routes';

// Внутри функции subscriptionRoutes, в конце:
await sharesRoutes(app);
```

Альтернативно, если маршруты регистрируются в `backend/src/app.ts` или аналогичном файле — подключить sharesRoutes там же. Нужно проверить файл регистрации маршрутов.

- [ ] **Step 4: Проверить компиляцию**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/subscriptions/shares.service.ts \
       backend/src/modules/subscriptions/shares.routes.ts \
       backend/src/modules/subscriptions/subscriptions.routes.ts
git commit -m "feat(sharing): add shares CRUD API endpoints"
```

---

## Task 8: Frontend — типы и API-клиент

**Files:**
- Modify: `frontend/src/types/subscription.ts`
- Create: `frontend/src/api/endpoints/shares.ts`

- [ ] **Step 1: Обновить типы подписки**

В `frontend/src/types/subscription.ts` добавить:

```typescript
// В интерфейс Subscription добавить:
isOwner: boolean;

// Новые типы для shares:
export interface SubscriptionShare {
  id: number;
  sharedWithLogin: string;
  sharedBy: string;
  createdAt: string;
}

export interface SharesListResponse {
  items: SubscriptionShare[];
  total: number;
}
```

- [ ] **Step 2: Создать API-клиент для shares**

```typescript
// frontend/src/api/endpoints/shares.ts
import { apiClient } from '@/api/client';
import type { SubscriptionShare, SharesListResponse } from '@/types/subscription';

export const sharesApi = {
  async list(subscriptionId: string, params?: { page?: number; limit?: number }): Promise<SharesListResponse> {
    const response = await apiClient.get<SharesListResponse>(
      `/subscriptions/${subscriptionId}/shares`,
      { params },
    );
    return response.data;
  },

  async add(subscriptionId: string, login: string): Promise<SubscriptionShare> {
    const response = await apiClient.post<SubscriptionShare>(
      `/subscriptions/${subscriptionId}/shares`,
      { login },
    );
    return response.data;
  },

  async remove(subscriptionId: string, shareId: number): Promise<void> {
    await apiClient.delete(`/subscriptions/${subscriptionId}/shares/${shareId}`);
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/subscription.ts \
       frontend/src/api/endpoints/shares.ts
git commit -m "feat(sharing): add frontend types and API client for shares"
```

---

## Task 9: Frontend — бейдж «Общий доступ» и скрытие мутаций

**Files:**
- Create: `frontend/src/components/collection/SharedBadge.tsx`
- Modify: `frontend/src/components/collection/SubscriptionCard.tsx`
- Modify: `frontend/src/pages/CollectionPage.tsx`

- [ ] **Step 1: Создать SharedBadge**

```tsx
// frontend/src/components/collection/SharedBadge.tsx
export default function SharedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
      Общий доступ
    </span>
  );
}
```

- [ ] **Step 2: Обновить SubscriptionCard — добавить бейдж и скрыть мутации**

В `SubscriptionCard.tsx`:

1. Добавить prop `isOwner: boolean` в интерфейс props.
2. Рядом с названием проекта показать `<SharedBadge />` если `!isOwner`.
3. Скрыть кнопки мутаций (запуск, остановка, редактирование, удаление, dropdown меню) если `!isOwner`.
4. Import `SharedBadge`.

Паттерн:
```tsx
{!isOwner && <SharedBadge />}

{isOwner && (
  <button onClick={onTrigger}>Запустить сбор</button>
)}

{isOwner && (
  <DropdownMenu>
    {/* ... */}
  </DropdownMenu>
)}
```

- [ ] **Step 3: Обновить CollectionPage — передавать isOwner и скрывать глобальные кнопки**

В `CollectionPage.tsx`:

1. Передавать `isOwner={sub.isOwner}` в `<SubscriptionCard>`.
2. Кнопки «Запустить все» / «Остановить все» / «Добавить проект» — только если есть хотя бы одна owned подписка.
3. Модальные окна сбора и редактирования — только для owned подписок.

- [ ] **Step 4: Проверить компиляцию фронтенда**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/collection/SharedBadge.tsx \
       frontend/src/components/collection/SubscriptionCard.tsx \
       frontend/src/pages/CollectionPage.tsx
git commit -m "feat(sharing): show shared badge and hide mutations for viewers"
```

---

## Task 10: Frontend — UI управления shares

**Files:**
- Create: `frontend/src/components/collection/SharesManager.tsx`
- Modify: `frontend/src/components/collection/EditSubscriptionModal.tsx`

- [ ] **Step 1: Создать SharesManager**

```tsx
// frontend/src/components/collection/SharesManager.tsx
import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { sharesApi } from '@/api/endpoints/shares';
import Button from '@/components/ui/Button';
import type { SubscriptionShare } from '@/types/subscription';

interface SharesManagerProps {
  subscriptionId: string;
}

export default function SharesManager({ subscriptionId }: SharesManagerProps) {
  const [shares, setShares] = useState<SubscriptionShare[]>([]);
  const [total, setTotal] = useState(0);
  const [login, setLogin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    const result = await sharesApi.list(subscriptionId, { limit: 50 });
    setShares(result.items);
    setTotal(result.total);
  }, [subscriptionId]);

  useEffect(() => { loadShares(); }, [loadShares]);

  const handleAdd = async () => {
    if (!login.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await sharesApi.add(subscriptionId, login.trim());
      setLogin('');
      await loadShares();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Ошибка при добавлении';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (shareId: number) => {
    await sharesApi.remove(subscriptionId, shareId);
    await loadShares();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Логин пользователя"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
                     dark:border-surface-border dark:bg-gray-800 dark:text-gray-100
                     focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <Button size="sm" onClick={handleAdd} disabled={loading || !login.trim()}>
          Добавить
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {shares.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Подписка пока ни с кем не разделена
        </p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-surface-border">
          {shares.map((share) => (
            <div key={share.id} className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {share.sharedWithLogin}
                </span>
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(share.createdAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
              <button
                onClick={() => handleRemove(share.id)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500
                           dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {total > shares.length && (
        <p className="text-xs text-gray-400">Показано {shares.length} из {total}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Добавить вкладку «Доступ» в EditSubscriptionModal**

В `EditSubscriptionModal.tsx`:

1. Добавить новый `mode` — `'access'`.
2. Если `mode === 'access'`, рендерить `<SharesManager subscriptionId={subscriptionId} />`.
3. Import `SharesManager`.

- [ ] **Step 3: Добавить пункт «Доступ» в dropdown SubscriptionCard**

В `SubscriptionCard.tsx` (только для owner):

Добавить пункт меню «Доступ» в dropdown, который открывает EditSubscriptionModal с `mode='access'`.

- [ ] **Step 4: Проверить компиляцию**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/collection/SharesManager.tsx \
       frontend/src/components/collection/EditSubscriptionModal.tsx \
       frontend/src/components/collection/SubscriptionCard.tsx
git commit -m "feat(sharing): add shares management UI"
```

---

## Task 11: Ручное E2E тестирование

- [ ] **Step 1: Запустить backend и frontend**

Run: `cd backend && npm run dev` (в одном терминале)
Run: `cd frontend && npm run dev` (в другом терминале)

- [ ] **Step 2: Проверить миграцию**

Убедиться, что таблица `devpulse_subscription_shares` создана.

- [ ] **Step 3: Тест owner flow**

1. Залогиниться как owner
2. Открыть страницу Collection
3. Убедиться, что подписки отображаются как раньше, с `isOwner: true`
4. Открыть dropdown → «Доступ» → добавить share по логину
5. Проверить, что share появился в списке
6. Удалить share

- [ ] **Step 4: Тест viewer flow**

1. Добавить share для другого пользователя
2. Залогиниться как этот пользователь
3. Убедиться, что shared подписка видна с бейджом «Общий доступ»
4. Убедиться, что кнопки мутаций скрыты
5. Перейти на страницы отчётов — метрики, графики должны быть видны

- [ ] **Step 5: Тест AggregatedReports security**

1. Создать агрегированный отчёт под user A
2. Залогиниться под user B
3. Убедиться, что отчёт user A **не виден** в списке

- [ ] **Step 6: Финальный commit**

```bash
git commit --allow-empty -m "feat(sharing): subscription sharing feature complete"
```
