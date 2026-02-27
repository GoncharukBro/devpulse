# Раскрывающиеся логи с детальной информацией

## Резюме

Переработка таблицы логов сборов: свёрнутый вид — компактная строка, по клику — раскрытие с детальной информацией по YouTrack, LLM и каждому сотруднику.

## Бэкенд

### Новые поля в CollectionLog

- `youtrackDuration: number` — секунды, время YouTrack-фазы
- `llmDuration: number` — секунды, время LLM-фазы

Пишутся: `youtrackDuration` — в `collection.worker` при завершении YouTrack-фазы; `llmDuration` — в `llm.worker` при завершении последнего отчёта (когда `llmCompleted + llmFailed + llmSkipped === llmTotal`).

### Новый API endpoint

```
GET /api/collection/logs/:logId/details
```

Возвращает:

```json
{
  "logId": "uuid",
  "startedAt": "ISO",
  "completedAt": "ISO | null",
  "overwrite": false,
  "youtrackDuration": 18,
  "llmDuration": 45,
  "employees": [
    {
      "login": "ivanov",
      "displayName": "Иванов Артём",
      "dataStatus": "collected",
      "llmStatus": "completed",
      "error": null
    }
  ]
}
```

Логика:
1. CollectionLog → subscription, periodStart, periodEnd
2. Subscription → employees (активные)
3. Для каждого сотрудника → MetricReport за период
4. dataStatus: report существует → `collected`, ошибка в errors[] → `failed`, log stopped + нет report → `stopped`, нет report + skipped → `skipped`
5. llmStatus: из `report.llmStatus`

### Миграция

```sql
ALTER TABLE collection_logs
  ADD COLUMN youtrack_duration integer DEFAULT 0,
  ADD COLUMN llm_duration integer DEFAULT 0;
```

## Фронтенд

### Свёрнутый вид

Колонки: ▸/▾ | Проект | Период | Тип | Статус | Обработано

Убрано: колонка "Время" (перенесена в развёрнутый вид).

### Развёрнутый вид

Любой лог раскрывается (не только с ошибками). При первом раскрытии — lazy load через `GET /logs/:logId/details`, кэш в state.

Три блока: общая информация (время, перезапись), YouTrack (статус, длительность, описание), LLM (статус, длительность, описание). Плюс таблица сотрудников.

Описания формируются на фронте из данных API.

### Группировка

Убрать "По проекту". Оставить "По дате" (default) и "По периоду".

### Типы

```typescript
interface LogDetails {
  logId: string;
  startedAt: string;
  completedAt: string | null;
  overwrite: boolean;
  youtrackDuration: number;
  llmDuration: number;
  employees: EmployeeDetail[];
}

interface EmployeeDetail {
  login: string;
  displayName: string;
  dataStatus: 'collected' | 'failed' | 'stopped' | 'skipped';
  llmStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  error: string | null;
}
```

## LogGroupBy

```typescript
export type LogGroupBy = 'date' | 'period'; // убран 'project'
```
