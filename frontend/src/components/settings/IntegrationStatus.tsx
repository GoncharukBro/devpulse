import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Server, Brain, Shield, Database, Mail } from 'lucide-react';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { systemApi, type SystemStatusResponse, type ServiceInfo } from '@/api/endpoints/system';

type ServiceKey = keyof SystemStatusResponse['services'];

const SERVICE_META: Record<ServiceKey, { label: string; icon: typeof Server }> = {
  youtrack: { label: 'YouTrack', icon: Server },
  ollama: { label: 'Ollama (LLM)', icon: Brain },
  keycloak: { label: 'Keycloak', icon: Shield },
  database: { label: 'PostgreSQL', icon: Database },
  smtp: { label: 'SMTP', icon: Mail },
};

const STATUS_CONFIG = {
  connected: { dot: 'bg-emerald-400', label: 'Подключено' },
  error: { dot: 'bg-red-400', label: 'Ошибка' },
  not_configured: { dot: 'bg-gray-400', label: 'Не настроен' },
} as const;

function ServiceRow({ serviceKey, info }: { serviceKey: ServiceKey; info: ServiceInfo }) {
  const meta = SERVICE_META[serviceKey];
  const statusCfg = STATUS_CONFIG[info.status];
  const Icon = meta.icon;

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-surface-lighter/50">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-surface-lighter text-gray-500 dark:text-gray-400">
        <Icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {meta.label}
          </span>
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusCfg.dot}`} />
          <span className="text-xs text-gray-500 dark:text-gray-400">{statusCfg.label}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          {info.url && <span>{info.url.replace(/^https?:\/\//, '')}</span>}
          {info.url && info.details && <span>·</span>}
          {info.details && <span>{info.details}</span>}
        </div>
      </div>
    </div>
  );
}

export default function IntegrationStatus() {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await systemApi.getStatus();
      setStatus(result);
    } catch {
      // Error toast shown by interceptor
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!status) {
    return (
      <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
        Не удалось загрузить статус сервисов
      </p>
    );
  }

  const serviceKeys = Object.keys(SERVICE_META) as ServiceKey[];

  return (
    <div>
      <div className="space-y-1">
        {serviceKeys.map((key) => (
          <ServiceRow key={key} serviceKey={key} info={status.services[key]} />
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          loading={refreshing}
          onClick={handleRefresh}
          leftIcon={!refreshing ? <RefreshCw size={14} /> : undefined}
        >
          Проверить подключения
        </Button>
      </div>
    </div>
  );
}
