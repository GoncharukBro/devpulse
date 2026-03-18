# DevPulse Frontend

Фронтенд DevPulse — аналитика метрик разработчиков, отчёты, достижения и управление подписками YouTrack.

## Стек

- **Framework:** React 18 + TypeScript
- **Сборка:** Vite
- **Стилизация:** Tailwind CSS
- **State:** Zustand
- **Роутинг:** React Router 6
- **HTTP:** Axios
- **Графики:** Recharts
- **Иконки:** Lucide React
- **Auth:** Keycloak (опционально)

## Быстрый старт

```bash
# 1. Установка зависимостей
npm install

# 2. Настройка окружения
cp .env.example .env
# Отредактировать .env при необходимости

# 3. Запуск dev-сервера
npm run dev
```

Приложение откроется на `http://localhost:3100`.

> Бэкенд должен быть запущен на `http://localhost:3101` (см. `backend/README.md`).

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3100/api` | URL API бэкенда |
| `VITE_AUTH_ENABLED` | `true` | `true` = Keycloak, `false` = без авторизации |
| `VITE_KEYCLOAK_URL` | — | URL Keycloak (только при `VITE_AUTH_ENABLED=true`) |
| `VITE_KEYCLOAK_REALM` | — | Realm Keycloak |
| `VITE_KEYCLOAK_CLIENT_ID` | — | Client ID (public client) |

> `VITE_AUTH_ENABLED` должно совпадать с `AUTH_ENABLED` на бэкенде.

## Скрипты

| Скрипт | Описание |
|---|---|
| `npm run dev` | Dev-сервер с HMR (порт 3100) |
| `npm run build` | Type check + production build |
| `npm run preview` | Превью production build |
| `npm run lint` | Проверка ESLint |
| `npm run lint:fix` | Автоисправление ESLint |
| `npm run format` | Форматирование Prettier |

## Структура проекта

```
src/
├── main.tsx                  # Точка входа
├── App.tsx                   # Роутинг, layout
├── index.css                 # Глобальные стили (Tailwind)
├── config/                   # Конфигурация (env, константы)
├── auth/                     # Keycloak-интеграция
├── api/                      # HTTP-клиент и эндпоинты
├── stores/                   # Zustand stores
├── hooks/                    # React hooks
├── types/                    # TypeScript типы
├── utils/                    # Утилиты
├── layouts/                  # Layout-компоненты
├── pages/                    # Страницы
│   ├── OverviewPage          # Главная — дашборд
│   ├── ProjectsListPage      # Список проектов
│   ├── ProjectPage            # Страница проекта
│   ├── EmployeesListPage     # Список сотрудников
│   ├── EmployeePage           # Карточка сотрудника
│   ├── TeamsListPage          # Список команд
│   ├── TeamPage               # Страница команды
│   ├── CollectionPage         # Сбор метрик (подписки, логи)
│   ├── AchievementsPage       # Достижения
│   ├── MethodologyPage        # Методология расчёта
│   ├── SettingsPage           # Настройки
│   └── LoginPage              # Авторизация
└── components/
    ├── ui/                   # Базовые UI-компоненты
    ├── shared/               # Общие компоненты
    ├── sidebar/              # Навигация
    ├── collection/           # Подписки, визард, логи
    ├── metrics/              # Метрики и KPI
    ├── charts/               # Графики (Recharts)
    ├── employees/            # Компоненты сотрудников
    ├── teams/                # Компоненты команд
    ├── achievements/         # Достижения
    └── settings/             # Настройки
```
