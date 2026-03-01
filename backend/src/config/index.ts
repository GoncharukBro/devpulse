import 'dotenv/config';

export interface AppConfig {
  server: {
    port: number;
    host: string;
    nodeEnv: string;
    logLevel: string;
  };
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
    clientSecret: string;
    internal: {
      realm: string;
      clientId: string;
      clientSecret: string;
    };
  };
  llm: {
    baseUrl: string;
    model: string;
    temperature: number;
    rateLimit: number;
    requestTimeoutMs: number;
    maxRetries: number;
  };
  cron: {
    enabled: boolean;
    schedule: string;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function warnIfEmpty(name: string, value: string): string {
  if (!value) {
    // eslint-disable-next-line no-console
    console.warn(`Warning: ${name} is empty — LLM integration may not work`);
  }
  return value;
}

export const config: AppConfig = {
  server: {
    port: parseInt(optional('PORT', '3101'), 10),
    host: optional('HOST', '0.0.0.0'),
    nodeEnv: optional('NODE_ENV', 'development'),
    logLevel: optional('LOG_LEVEL', 'info'),
  },
  db: {
    host: required('DB_HOST'),
    port: parseInt(optional('DB_PORT', '5432'), 10),
    name: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
  },
  keycloak: {
    url: required('KEYCLOAK_URL'),
    realm: required('KEYCLOAK_REALM'),
    clientId: required('KEYCLOAK_CLIENT_ID'),
    clientSecret: required('KEYCLOAK_CLIENT_SECRET'),
    internal: {
      realm: optional('KEYCLOAK_INTERNAL_REALM', 'internalApi'),
      clientId: optional('KEYCLOAK_INTERNAL_CLIENT_ID', 'api2api'),
      clientSecret: warnIfEmpty('KEYCLOAK_INTERNAL_CLIENT_SECRET', optional('KEYCLOAK_INTERNAL_CLIENT_SECRET', '')),
    },
  },
  llm: {
    baseUrl: optional('LLM_BASE_URL', 'http://localhost:11434/v1'),
    model: optional('LLM_MODEL', 'gemma3:4b'),
    temperature: parseFloat(optional('LLM_TEMPERATURE', '0.3')),
    rateLimit: parseInt(optional('LLM_RATE_LIMIT', '3'), 10),
    requestTimeoutMs: parseInt(optional('LLM_REQUEST_TIMEOUT_MS', '300000'), 10),
    maxRetries: parseInt(optional('LLM_MAX_RETRIES', '3'), 10),
  },
  cron: {
    enabled: optional('CRON_ENABLED', 'false') === 'true',
    schedule: optional('CRON_SCHEDULE', '0 0 * * 1'),
  },
};
