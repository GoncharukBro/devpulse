# DevPulse Backend

Бэкенд-сервис DevPulse — сбор и анализ метрик разработчиков из YouTrack с LLM-анализом (Ollama).

## Стек

- **Runtime:** Node.js + TypeScript
- **Framework:** Fastify
- **ORM:** MikroORM + PostgreSQL
- **Логирование:** Pino (встроен в Fastify)
- **Планировщик:** node-cron

## Требования

- Node.js >= 18
- PostgreSQL >= 14
- npm

## Быстрый старт

```bash
# 1. Установка зависимостей
npm install

# 2. Создать базу данных
createdb devpulse

# 3. Настройка окружения
cp .env.example .env
# Отредактировать .env — указать пароль БД и токены

# 4. Запуск в dev-режиме
npm run dev
```

Сервер запустится на `http://localhost:3101`. Миграции выполняются автоматически при старте.

## Проверка работоспособности

```bash
curl http://localhost:3101/api/health
# → { "status": "ok", "timestamp": "...", "uptime": ... }
```

## Скрипты

| Скрипт | Описание |
|---|---|
| `npm run dev` | Запуск в dev-режиме с hot reload |
| `npm run build` | Сборка TypeScript → JavaScript |
| `npm start` | Запуск собранного сервера |
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
│   └── mikro-orm.config.ts   # Конфигурация MikroORM
├── plugins/                  # Fastify-плагины (CORS и пр.)
├── modules/                  # Доменные модули
│   └── health/               # Health check
├── common/
│   ├── errors/               # Кастомные ошибки
│   ├── middleware/            # Middleware
│   └── utils/                # Утилиты
├── entities/                 # MikroORM-сущности
└── migrations/               # Миграции БД
```
