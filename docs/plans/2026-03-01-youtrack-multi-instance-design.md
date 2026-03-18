# Дизайн: Подключение второго инстанса YouTrack

Дата: 2026-03-01

## Контекст

DevPulse уже имеет архитектуру для нескольких инстансов YouTrack:
- `youtrack.config.ts` динамически сканирует `YOUTRACK_<ID>_*` из env
- `YouTrackService` держит Map клиентов по instanceId
- БД: `youtrack_instance_id` на Subscription + unique constraint
- Фронтенд wizard с шагом выбора инстанса (авто-пропуск при одном)
- SubscriptionCard показывает `youtrackInstanceName`

Задача: активировать поддержку второго инстанса (YouTrack 2024.3) и решить проблему различий API.

## Решение

### 1. Конфигурация

- `.env` — добавить `YOUTRACK_2024_URL/TOKEN/NAME`
- `.env.example` — добавить пример второго инстанса
- `config/index.ts` — удалить legacy-секцию `youtrack` из AppConfig (нигде не используется, всё работает через `getYouTrackInstances()`)

### 2. Определение версии YouTrack (ленивое)

В `YouTrackClient`:
- Добавить `private majorVersion: number | null = null`
- Добавить `private async detectVersion()` — `GET /api/config?fields=version`, парсит major version, кеширует
- Изменить `getProjectMembers()`:
  - `>= 2025`: `/api/admin/projects/:id/team/users?fields=...` (текущий)
  - `< 2025`: `/api/admin/projects/:id?fields=id,team(users(id,login,name,email,avatarUrl,banned))` → извлечь `response.team.users`
- Нормализация к единому `YouTrackUser[]`

### 3. Статус-проверка всех инстансов

В `system.service.ts`:
- `checkYouTrack()` — проверять все инстансы, вернуть worst-case статус с деталями по каждому

### 4. Фронтенд

Не требует изменений — всё уже работает.

## Проверка

1. `GET /api/youtrack/instances` — возвращает 2 инстанса
2. Wizard → выбор инстанса → проекты загружаются из каждого
3. Выбор проекта → участники загружаются (через version-aware endpoint)
4. Создание подписки → сбор метрик работает
5. `npm run lint` — 0 ошибок
6. `npx tsc --noEmit` — 0 ошибок
