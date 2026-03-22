# Subscription Sharing — Design Spec

> Функционал «Поделиться подпиской» — предоставление viewer-only доступа другим пользователям Keycloak к подпискам и связанным данным (команды, сотрудники, метрики, отчёты).

**Цель:** Позволить владельцу подписки поделиться ею с другими пользователями по логину. Получатель видит все данные подписки (проекты, команды, сотрудники, метрики, отчёты), но не может изменять настройки, запускать сбор или удалять подписку.

---

## 1. Модель данных

### Новая сущность: `SubscriptionShare`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `int, PK, autoincrement` | Идентификатор |
| `subscription` | `ManyToOne → Subscription` | Ссылка на подписку |
| `sharedWithLogin` | `varchar(255)` | Логин пользователя-получателя (из Keycloak) |
| `sharedBy` | `varchar(255)` | Логин владельца, который поделился |
| `createdAt` | `timestamp` | Дата создания |

**Уникальный составной индекс:** `(subscription, sharedWithLogin)` — один пользователь получает доступ к подписке только один раз.

**Связь с Subscription:** `OneToMany` — у подписки может быть много shares. Каскадное удаление: при удалении подписки все shares удаляются автоматически.

---

## 2. Идентификация пользователей

**Механизм:** прямое сравнение `request.user.username === share.sharedWithLogin`.

- Логин доступен из JWT-токена Keycloak через `request.user.username` (уже реализовано в auth middleware).
- Email не нужен — он составляется по формуле `login + "@company.com"`, но для матчинга достаточно логина.
- Логин нормализуется в `toLowerCase()` при сохранении и сравнении (case-insensitive).
- Валидация существования пользователя в Keycloak **не производится** — это осознанное решение для упрощения (нет зависимости от Keycloak Admin API). «Мёртвые» записи не несут рисков.
- Никаких дополнительных таблиц или кешей не требуется.

---

## 3. Фильтрация запросов

### Хелпер `subscriptionAccessFilter(userId, userLogin)`

Возвращает MikroORM `FilterQuery<Subscription>` с `$or`:

```typescript
function subscriptionAccessFilter(userId: string, userLogin: string): FilterQuery<Subscription> {
  return {
    $or: [
      { ownerId: userId },
      { shares: { sharedWithLogin: userLogin } },
    ],
  };
}
```

**Важно:** при использовании JOIN по shares может возникнуть дублирование строк. Реализация должна гарантировать `DISTINCT` или использовать `EXISTS`-подзапрос.

### Хелпер `getUserSubscriptions` (ReportsService)

`ReportsService` имеет приватный метод `getUserSubscriptions(userId, subscriptionId?)`, который фильтрует по `ownerId`. Этот метод — **единственная точка входа** для получения подписок во всём модуле Reports. Обновление его сигнатуры на `getUserSubscriptions(userId, userLogin, subscriptionId?)` с использованием `subscriptionAccessFilter` автоматически покроет все эндпоинты Reports.

### `listSubscriptions` (SubscriptionsService) — raw SQL

`listSubscriptions` содержит raw SQL запрос для получения метрик текущего периода. Массив `subIds` формируется из результата `em.find(Subscription, ...)`. После замены фильтра на `subscriptionAccessFilter`, raw SQL получит корректный расширенный набор ID.

### Где применяется

| Модуль | Операция | Текущий фильтр | Новый фильтр |
|--------|----------|----------------|--------------|
| **Subscription** | list | `ownerId` | `subscriptionAccessFilter` |
| **Subscription** | getById | `ownerId` | `subscriptionAccessFilter` |
| **Subscription** | field-mapping GET | `ownerId` | `subscriptionAccessFilter` (read-only) |
| **Subscription** | field-mapping PUT | `ownerId` | **только owner** (без изменений) |
| **Reports** | `getUserSubscriptions` (private) | `ownerId` | `subscriptionAccessFilter` — покрывает все endpoints: overview, employee history/summary/list, project summary, team email preview |
| **Reports** | team email preview | `{ id: teamId, ownerId: userId }` на Team | Отдельная проверка: team.ownerId === userId (Teams — отдельная модель) |
| **Collection** | запуск / остановка | `ownerId` | **только owner** (без изменений) |
| **Subscription** | update / delete | `ownerId` | **только owner** (без изменений) |

### Teams — отдельная модель

**Важно:** сущность `Team` имеет собственное поле `ownerId` и **не связана** с `Subscription`. Команды принадлежат пользователю напрямую. Шаринг подписки **не расширяет** доступ к командам владельца.

Viewer увидит данные сотрудников через подписку (метрики, отчёты), но не увидит команды владельца. Если в будущем потребуется Team sharing — это отдельная фича.

**Принцип:** мутации (создание, изменение, удаление, запуск сбора) — только для владельца. Чтение подписки и её данных (сотрудники, метрики, отчёты) — для владельца и для пользователей с share. Команды — вне scope sharing.

---

## 4. API-эндпоинты

Под маршрутом `/api/subscriptions/:id/shares`:

### `POST /api/subscriptions/:id/shares`

- **Доступ:** только owner
- **Body:** `{ login: string }`
- **Валидация:**
  - Подписка существует и принадлежит `request.user.id`
  - `login !== request.user.username` (нельзя поделиться с собой)
  - Нет дубликата (уникальный индекс)
  - Логин нормализуется в `toLowerCase()` перед сохранением (case-insensitive matching)
- **Ответ:** `201` с созданным `SubscriptionShare`
- **Лимит:** максимум 50 shares на одну подписку

### `GET /api/subscriptions/:id/shares`

- **Доступ:** только owner
- **Query params:** `page`, `limit` (пагинация — список может расти)
- **Ответ:** `{ items: SubscriptionShare[], total: number }`

### `DELETE /api/subscriptions/:id/shares/:shareId`

- **Доступ:** только owner
- **Ответ:** `204`

---

## 5. Frontend

### Индикация «Общий доступ»

- В списке подписок: бейдж «Общий доступ» рядом с названием, если подписка получена по share (не owned).
- Для shared-подписок скрываются: кнопки редактирования, удаления, запуска/остановки сбора, управления командами.

### Настройки подписки — раздел «Доступ»

В настройках подписки (доступен только owner) появляется новый блок:

- Поле ввода логина + кнопка «Добавить»
- Таблица текущих shares: логин, дата добавления, кнопка «Удалить»
- Пагинация при необходимости

### Определение роли

На фронте определяется по ответу API: если подписка возвращается, но `ownerId !== currentUserId`, пользователь — viewer. API возвращает поле `isOwner: boolean` в ответе `listSubscriptions` для удобства.

### Viewer видит

- Список сотрудников подписки (read-only)
- Метрики и графики сотрудников
- Отчёты (overview, employee summary/history, project summary)
- Field-mapping (read-only)

### Viewer НЕ видит / НЕ может

- Редактировать/удалять подписку
- Запускать/останавливать сбор
- Добавлять/удалять/редактировать сотрудников
- Управлять field-mapping
- Видеть команды владельца
- Управлять shares (это право только владельца)

---

## 6. Безопасность AggregatedReports

**Текущая проблема:** эндпоинты `list`, `getById`, `delete` в модуле AggregatedReports не фильтруют по `createdBy` — любой авторизованный пользователь может увидеть/удалить чужие отчёты.

**Исправление:**
- `list`: добавить фильтр `{ createdBy: request.user.id }`
- `getById`: добавить фильтр `{ createdBy: request.user.id }`, возвращать 404 если не найден
- `delete`: добавить фильтр `{ createdBy: request.user.id }`, возвращать 404 если не найден

Это исправление не зависит от sharing-фичи и может быть выполнено как отдельная задача.

---

## 7. Предварительные условия

- `request.user.username` уже доступен из auth middleware — дополнительной работы не требуется.
- Миграция БД для создания таблицы `subscription_share`.

---

## Scope

**В scope:**
- CRUD для SubscriptionShare
- Фильтрация всех read-запросов через `subscriptionAccessFilter`
- Frontend: бейдж, скрытие мутаций для viewer, UI управления shares
- Фикс безопасности AggregatedReports

**Вне scope:**
- Шаринг на уровне команд (Team-level sharing) — Teams не связаны с Subscription
- Роли кроме viewer (editor, admin)
- Уведомления о новом share (email, in-app)
- Шаринг по email (только по логину)
- Валидация существования пользователя в Keycloak
- AggregatedReports для viewer (viewer не создаёт и не видит агрегированные отчёты — они фильтруются по `createdBy`)
