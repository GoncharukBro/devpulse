# YouTrack Multi-Instance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Подключить второй инстанс YouTrack (2024.3) с автоопределением версии для совместимого API.

**Architecture:** Ленивое определение версии в YouTrackClient при первом вызове getProjectMembers(). Версия кешируется. Для YT < 2025 используется альтернативный endpoint с нормализацией ответа. Legacy-секция youtrack из AppConfig удаляется.

**Tech Stack:** Node.js, TypeScript, fetch API

---

### Task 1: Удалить legacy-секцию youtrack из AppConfig

**Files:**
- Modify: `backend/src/config/index.ts:28-32` (удалить youtrack из интерфейса)
- Modify: `backend/src/config/index.ts:94-98` (удалить youtrack из объекта config)

**Step 1: Убедиться что legacy youtrack config нигде не импортируется**

Run: `cd backend && grep -r "config\.youtrack" src/ --include="*.ts"`
Expected: 0 результатов (всё использует `getYouTrackInstances()`)

**Step 2: Удалить секцию из AppConfig**

В `backend/src/config/index.ts`:
- Удалить из интерфейса `AppConfig`:
```typescript
  youtrack: {
    mainUrl: string;
    mainToken: string;
    mainName: string;
  };
```
- Удалить из объекта `config`:
```typescript
  youtrack: {
    mainUrl: required('YOUTRACK_MAIN_URL'),
    mainToken: required('YOUTRACK_MAIN_TOKEN'),
    mainName: optional('YOUTRACK_MAIN_NAME', 'YouTrack'),
  },
```

**Step 3: Проверить компиляцию**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 4: Commit**

```bash
git add backend/src/config/index.ts
git commit -m "refactor: remove legacy youtrack config from AppConfig"
```

---

### Task 2: Определение версии YouTrack в YouTrackClient

**Files:**
- Modify: `backend/src/modules/youtrack/youtrack.client.ts`

**Step 1: Добавить поле majorVersion и метод detectVersion()**

В `YouTrackClient` добавить после `private log: Logger`:
```typescript
private majorVersion: number | null = null;
```

Добавить метод после конструктора:
```typescript
private async detectVersion(): Promise<number> {
  if (this.majorVersion !== null) return this.majorVersion;

  try {
    const data = await this.request<{ version: string }>('GET', '/api/config', {
      fields: 'version',
    });
    this.majorVersion = parseInt(data.version.split('.')[0], 10);
    this.log.info(`[${this.instanceName}] Detected YouTrack version: ${data.version} (major: ${this.majorVersion})`);
  } catch {
    this.log.warn(`[${this.instanceName}] Failed to detect version, assuming 2025+`);
    this.majorVersion = 2025;
  }

  return this.majorVersion;
}
```

**Step 2: Переписать getProjectMembers() с version-aware логикой**

Заменить текущий `getProjectMembers()`:
```typescript
async getProjectMembers(projectId: string): Promise<YouTrackUser[]> {
  const version = await this.detectVersion();
  const encodedId = encodeURIComponent(projectId);

  if (version >= 2025) {
    return this.requestAll<YouTrackUser>(
      'GET',
      `/api/admin/projects/${encodedId}/team/users`,
      { fields: 'id,login,name,email,avatarUrl,banned' },
    );
  }

  // YouTrack < 2025: team members via project endpoint
  const project = await this.request<{
    team?: { users?: YouTrackUser[] };
  }>('GET', `/api/admin/projects/${encodedId}`, {
    fields: 'id,team(users(id,login,name,email,avatarUrl,banned))',
  });

  return project.team?.users ?? [];
}
```

**Step 3: Проверить компиляцию**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 4: Commit**

```bash
git add backend/src/modules/youtrack/youtrack.client.ts
git commit -m "feat: version-aware getProjectMembers for YouTrack 2024/2025"
```

---

### Task 3: Проверка всех инстансов в system.service.ts

**Files:**
- Modify: `backend/src/modules/system/system.service.ts`

**Step 1: Переписать checkYouTrack() для всех инстансов**

Заменить текущую функцию `checkYouTrack()`:
```typescript
async function checkYouTrack(): Promise<ServiceInfo> {
  const instances = getYouTrackInstances();
  if (instances.length === 0) {
    return { status: 'not_configured', details: 'Не настроен' };
  }

  const results = await Promise.all(
    instances.map(async (inst) => {
      try {
        const response = await fetchWithTimeout(`${inst.url}/api/admin/serverInfo`, CHECK_TIMEOUT);
        const ok = response.ok || response.status === 401 || response.status === 403;
        return { name: inst.name, url: inst.url, ok };
      } catch {
        return { name: inst.name, url: inst.url, ok: false };
      }
    }),
  );

  const allOk = results.every((r) => r.ok);
  const anyOk = results.some((r) => r.ok);
  const details = results.map((r) => `${r.name}: ${r.ok ? 'OK' : 'ошибка'}`).join(', ');

  return {
    status: allOk ? 'connected' : anyOk ? 'connected' : 'error',
    url: instances[0].url,
    name: instances.map((i) => i.name).join(', '),
    details,
  };
}
```

**Step 2: Проверить компиляцию**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 3: Commit**

```bash
git add backend/src/modules/system/system.service.ts
git commit -m "feat: check all YouTrack instances in system status"
```

---

### Task 4: Обновить .env и .env.example

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/.env` (если существует)

**Step 1: Добавить пример второго инстанса в .env.example**

После секции YouTrack добавить:
```env
# YouTrack (дополнительные инстансы — по паттерну YOUTRACK_<ID>_URL/TOKEN/NAME)
# YOUTRACK_SECONDARY_URL=http://localhost:8084
# YOUTRACK_SECONDARY_TOKEN=
# YOUTRACK_SECONDARY_NAME=YouTrack 2024
```

**Step 2: Добавить в .env реальные значения**

```env
YOUTRACK_SECONDARY_URL=http://localhost:8084
YOUTRACK_SECONDARY_TOKEN=perm:YWRtaW4=.NDQtMQ==.hH7NmPqByCdYLAGAK2wy3JuhX8PZpH
YOUTRACK_SECONDARY_NAME=YouTrack 2024
```

**Step 3: Commit (только .env.example)**

```bash
git add backend/.env.example
git commit -m "docs: add secondary YouTrack instance example to .env.example"
```

---

### Task 5: Lint и type-check

**Step 1: Lint**

Run: `cd backend && npm run lint`
Expected: 0 ошибок

**Step 2: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 ошибок

**Step 3: Финальный commit (если были lint-фиксы)**

```bash
git add -A
git commit -m "chore: lint fixes for multi-instance YouTrack"
```
