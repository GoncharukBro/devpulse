import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Server, Brain, Shield, Database, Mail, type LucideIcon } from 'lucide-react';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { systemApi, type SystemStatusResponse, type ServiceInfo } from '@/api/endpoints/system';

type ServiceStatus = ServiceInfo['status'];

const STATUS_CONFIG: Record<ServiceStatus, { dot: string; label: string }> = {
  connected: { dot: 'bg-emerald-400', label: 'Подключено' },
  error: { dot: 'bg-red-400', label: 'Ошибка' },
  not_configured: { dot: 'bg-gray-400', label: 'Не настроен' },
};

interface IntegrationCard {
  key: string;
  label: string;
  icon: LucideIcon;
  info: ServiceInfo;
}

function buildCards(status: SystemStatusResponse): IntegrationCard[] {
  const cards: IntegrationCard[] = [];

  for (const inst of status.services.youtrack) {
    cards.push({
      key: `youtrack-${inst.name ?? cards.length}`,
      label: inst.name ?? 'YouTrack',
      icon: Server,
      info: inst,
    });
  }

  cards.push(
    { key: 'llm', label: 'LLM', icon: Brain, info: status.services.llm },
    { key: 'keycloak', label: 'Keycloak', icon: Shield, info: status.services.keycloak },
    { key: 'database', label: 'PostgreSQL', icon: Database, info: status.services.database },
    { key: 'smtp', label: 'SMTP', icon: Mail, info: status.services.smtp },
  );

  return cards;
}

function ServiceCard({ card }: { card: IntegrationCard }) {
  const { label, icon: Icon, info } = card;
  const statusCfg = STATUS_CONFIG[info.status];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 dark:border-surface-lighter dark:bg-surface-light">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-surface-lighter dark:text-gray-400">
          <Icon size={18} />
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusCfg.dot}`} />
        <span className="text-xs text-gray-500 dark:text-gray-400">{statusCfg.label}</span>
      </div>

      {(info.url || info.details) && (
        <p className="text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          {info.url && <span>{info.url.replace(/^https?:\/\//, '')}</span>}
          {info.url && info.details && ' · '}
          {info.details && <span>{info.details}</span>}
        </p>
      )}
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

  const cards = buildCards(status);

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <ServiceCard key={card.key} card={card} />
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
