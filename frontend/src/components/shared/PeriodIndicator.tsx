import { Calendar } from 'lucide-react';

interface PeriodIndicatorProps {
  periodStart?: string;
  periodEnd?: string;
}

function formatShort(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDate();
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export default function PeriodIndicator({ periodStart, periodEnd }: PeriodIndicatorProps) {
  if (!periodStart || !periodEnd) return null;
  return (
    <div className="mb-6 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
      <Calendar size={12} />
      <span>Данные за неделю: {formatShort(periodStart)} — {formatShort(periodEnd)}</span>
    </div>
  );
}
