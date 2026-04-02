interface ReportStatusBadgeProps {
  status: string;
}

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const statusConfig: Record<string, { label: string; className: string; spinner?: boolean }> = {
  generating: {
    label: 'Генерация',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    spinner: true,
  },
  ready: {
    label: 'Готов',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  failed: {
    label: 'Ошибка',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  collecting: {
    label: 'Сбор данных',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    spinner: true,
  },
  analyzing: {
    label: 'Анализ',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    spinner: true,
  },
  partial: {
    label: 'Частично готов',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
};

export default function ReportStatusBadge({ status }: ReportStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.generating;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {config.spinner && <Spinner />}
      {config.label}
    </span>
  );
}
