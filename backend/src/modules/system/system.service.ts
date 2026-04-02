/**
 * Сервис проверки доступности внешних сервисов.
 */

import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { config } from '../../config';
import { getYouTrackInstances } from '../../config/youtrack.config';

type ServiceStatus = 'connected' | 'error' | 'not_configured';

interface ServiceInfo {
  status: ServiceStatus;
  url?: string;
  name?: string;
  model?: string;
  details: string;
}

export interface SystemStatusResponse {
  version: string;
  authEnabled: boolean;
  services: {
    youtrack: ServiceInfo[];
    llm: ServiceInfo;
    keycloak: ServiceInfo;
    database: ServiceInfo;
    smtp: ServiceInfo;
  };
}

const APP_VERSION = '0.1.0';
const CHECK_TIMEOUT = 3000;

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkYouTrack(): Promise<ServiceInfo[]> {
  const instances = getYouTrackInstances();
  if (instances.length === 0) {
    return [{ status: 'not_configured', details: 'Не настроен', name: 'YouTrack' }];
  }

  return Promise.all(
    instances.map(async (inst) => {
      try {
        const response = await fetchWithTimeout(
          `${inst.url}/api/config?fields=version`,
          CHECK_TIMEOUT,
          {
            headers: {
              Authorization: `Bearer ${inst.token}`,
              Accept: 'application/json',
            },
          },
        );
        if (response.ok) {
          const data = (await response.json()) as { version?: string };
          const version = data.version ? `v${data.version}` : '';
          return {
            status: 'connected' as ServiceStatus,
            url: inst.url,
            name: inst.name,
            details: version,
          };
        }
        return {
          status: 'error' as ServiceStatus,
          url: inst.url,
          name: inst.name,
          details: 'Ошибка подключения',
        };
      } catch {
        return {
          status: 'error' as ServiceStatus,
          url: inst.url,
          name: inst.name,
          details: 'Недоступен',
        };
      }
    }),
  );
}

async function checkLlm(): Promise<ServiceInfo> {
  const baseUrl = config.llm.baseUrl.replace(/\/v1\/?$/, '');
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/tags`, CHECK_TIMEOUT);
    if (response.ok) {
      return {
        status: 'connected',
        url: baseUrl,
        model: config.llm.model,
        details: config.llm.model,
      };
    }
    return { status: 'error', url: baseUrl, model: config.llm.model, details: 'Ошибка подключения' };
  } catch {
    return { status: 'error', url: baseUrl, model: config.llm.model, details: 'Недоступен' };
  }
}

async function checkKeycloak(): Promise<ServiceInfo> {
  if (!config.authEnabled) {
    return { status: 'not_configured', details: 'Отключён (AUTH_ENABLED=false)' };
  }

  const url = config.keycloak.url;
  const realm = config.keycloak.realm;
  try {
    const response = await fetchWithTimeout(
      `${url}/realms/${realm}/.well-known/openid-configuration`,
      CHECK_TIMEOUT,
    );
    if (response.ok) {
      return {
        status: 'connected',
        url,
        details: `Realm: ${realm}`,
      };
    }
    return { status: 'error', url, details: 'Ошибка подключения' };
  } catch {
    return { status: 'error', url, details: 'Недоступен' };
  }
}

async function checkDatabase(orm: MikroORM<PostgreSqlDriver>): Promise<ServiceInfo> {
  try {
    const connection = orm.em.getConnection();
    await connection.execute('SELECT 1');
    return { status: 'connected', details: 'PostgreSQL' };
  } catch {
    return { status: 'error', details: 'PostgreSQL — ошибка подключения' };
  }
}

function checkSmtp(): ServiceInfo {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return { status: 'not_configured', details: 'Не настроен' };
  }
  return {
    status: 'connected',
    details: `${host}:${process.env.SMTP_PORT || '587'}`,
  };
}

export async function getSystemStatus(orm: MikroORM<PostgreSqlDriver>): Promise<SystemStatusResponse> {
  const [youtrack, llm, keycloak, database] = await Promise.all([
    checkYouTrack(),
    checkLlm(),
    checkKeycloak(),
    checkDatabase(orm),
  ]);

  const smtp = checkSmtp();

  return {
    version: APP_VERSION,
    authEnabled: config.authEnabled,
    services: {
      youtrack,
      llm: !config.authEnabled
        ? { status: 'not_configured' as ServiceStatus, details: 'Отключён (требуется авторизация)' }
        : llm,
      keycloak,
      database,
      smtp,
    },
  };
}
