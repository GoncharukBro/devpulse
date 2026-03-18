# DevPulse Backend

Бэкенд-сервис DevPulse — сбор и анализ метрик разработчиков из YouTrack с LLM-анализом (Ollama).

## Стек

- **Runtime:** Node.js >= 18 + TypeScript
- **Framework:** Fastify
- **ORM:** MikroORM + PostgreSQL >= 14
- **Auth:** Keycloak (опционально)
- **LLM:** Ollama (локальная LLM)
- **Планировщик:** node-cron
- **Логирование:** Pino

## Быстрый старт

```bash
# 1. Установка зависимостей
npm install

# 2. Запуск PostgreSQL через Docker
docker compose up -d

# 3. Настройка окружения
cp .env.example .env
# Отредактировать .env — указать токены YouTrack и пароли

# 4. Запуск в dev-режиме (миграции применятся автоматически)
npm run dev
```

Сервер запустится на `http://localhost:3101`.

## Проверка работоспособности

```bash
curl http://localhost:3101/api/health
# → { "status": "ok", "timestamp": "...", "uptime": ... }

curl http://localhost:3101/api/system/status
# → Статус всех сервисов (БД, YouTrack, LLM, Keycloak)
```

## Переменные окружения

### Сервер

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3101` | Порт сервера |
| `HOST` | `0.0.0.0` | Хост для привязки |
| `NODE_ENV` | `development` | Режим работы |
| `LOG_LEVEL` | `debug` | Уровень логирования (debug, info, warn, error) |

### База данных

| Переменная | По умолчанию | Описание |
|---|---|---|
| `DB_HOST` | `localhost` | Хост PostgreSQL |
| `DB_PORT` | `5432` | Порт PostgreSQL |
| `DB_NAME` | `devpulse` | Имя базы данных |
| `DB_USER` | `postgres` | Пользователь БД |
| `DB_PASSWORD` | — | Пароль БД |
| `DB_TABLE_PREFIX` | `devpulse_` | Префикс таблиц |

### Аутентификация (Keycloak)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `AUTH_ENABLED` | `true` | `true` = Keycloak, `false` = без авторизации (single-tenant, LLM отключён) |
| `KEYCLOAK_URL` | — | URL Keycloak |
| `KEYCLOAK_REALM` | — | Realm для пользователей |
| `KEYCLOAK_CLIENT_ID` | — | Client ID приложения |
| `KEYCLOAK_CLIENT_SECRET` | — | Client Secret |
| `KEYCLOAK_INTERNAL_REALM` | — | Realm для inter-service (LLM) |
| `KEYCLOAK_INTERNAL_CLIENT_ID` | — | Client ID для inter-service |
| `KEYCLOAK_INTERNAL_CLIENT_SECRET` | — | Client Secret для inter-service |

Для настройки internal realm используйте скрипт:

```bash
bash scripts/setup-keycloak-realm.sh
```

### YouTrack

Инстансы YouTrack настраиваются **динамически** по паттерну `YOUTRACK_<ID>_URL/TOKEN/NAME`.
Можно подключить любое количество инстансов — каждый определяется тремя переменными:

| Переменная | Описание |
|---|---|
| `YOUTRACK_<ID>_URL` | URL инстанса YouTrack |
| `YOUTRACK_<ID>_TOKEN` | Permanent token (scope: YouTrack) |
| `YOUTRACK_<ID>_NAME` | Отображаемое имя (опционально, по умолчанию `YouTrack (<id>)`) |

`<ID>` — произвольный идентификатор латиницей (например, `DRCS`, `2024`, `TEST`).
В БД и API он сохраняется в нижнем регистре (`drcs`, `2024`, `test`).

Пример — два инстанса:

```env
# Основной YouTrack
YOUTRACK_DRCS_URL=http://localhost:8082
YOUTRACK_DRCS_TOKEN=perm:...
YOUTRACK_DRCS_NAME=YouTrack ДРКС

# YouTrack 2024
YOUTRACK_2024_URL=http://localhost:8084
YOUTRACK_2024_TOKEN=perm:...
YOUTRACK_2024_NAME=YouTrack 2024
```

Чтобы добавить новый инстанс, достаточно добавить три переменные и перезапустить сервер.
Поддерживаются YouTrack 2024.x и 2025.x (версия определяется автоматически).

### LLM (Ollama)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `LLM_BASE_URL` | — | URL Ollama API (OpenAI-совместимый) |
| `LLM_MODEL` | — | Модель (например, `gemma3:4b`) |
| `LLM_TEMPERATURE` | `0.3` | Температура генерации |
| `LLM_RATE_LIMIT` | `3` | Макс. параллельных запросов |
| `LLM_REQUEST_TIMEOUT_MS` | `300000` | Таймаут запроса (мс) |
| `LLM_MAX_RETRIES` | `3` | Количество повторных попыток |

### Cron (автосбор метрик)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `CRON_ENABLED` | `true` | Включить автоматический сбор |
| `CRON_SCHEDULE` | `0 0 * * 1` | Расписание (cron-формат, по умолчанию: понедельник 00:00) |

## Скрипты

| Скрипт | Описание |
|---|---|
| `npm run dev` | Запуск в dev-режиме с hot reload (nodemon) |
| `npm run build` | Сборка TypeScript → JavaScript |
| `npm start` | Запуск собранного сервера (`dist/server.js`) |
| `npm run lint` | Проверка ESLint |
| `npm run lint:fix` | Автоисправление ESLint |
| `npm run format` | Форматирование Prettier |
| `npm run migration:create` | Создание новой миграции |
| `npm run migration:up` | Применение миграций |

## Структура проекта

```
src/
├── app.ts                    # Fastify-инстанс, плагины, error handler
├── server.ts                 # Точка входа, graceful shutdown
├── config/
│   ├── index.ts              # Загрузка и валидация конфигурации
│   ├── mikro-orm.config.ts   # Конфигурация MikroORM
│   └── youtrack.config.ts    # Динамический парсинг YouTrack-инстансов
├── plugins/                  # Fastify-плагины (CORS и пр.)
├── entities/                 # MikroORM-сущности
├── migrations/               # Миграции БД
├── common/
│   ├── errors/               # Кастомные ошибки
│   ├── middleware/            # Middleware (auth и пр.)
│   └── utils/                # Утилиты (даты, недели)
└── modules/
    ├── health/               # Health check
    ├── system/               # Статус сервисов
    ├── auth/                 # Аутентификация (Keycloak)
    ├── youtrack/             # Клиент YouTrack (version-aware API)
    ├── subscriptions/        # Подписки на проекты
    ├── collection/           # Сбор метрик (worker + state)
    ├── llm/                  # LLM-анализ (worker)
    ├── reports/              # Отчёты по метрикам
    ├── teams/                # Команды
    ├── achievements/         # Достижения
    └── settings/             # Настройки
```

## Docker

PostgreSQL поднимается через Docker Compose:

```bash
docker compose up -d        # Запустить
docker compose down          # Остановить
docker compose down -v       # Остановить и удалить данные
```
