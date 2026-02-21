/**
 * Единообразное форматирование чисел и дат.
 */

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

/** Число с одним знаком после запятой (целое если .0). null → "Н/Д" */
export function formatMetric(value: number | null | undefined, suffix = ''): string {
  if (value == null) return 'Н/Д';
  const formatted = value % 1 === 0 ? value.toString() : value.toFixed(1);
  return `${formatted}${suffix}`;
}

/** Часы: 36.5ч, 1.2ч. null → "Н/Д" */
export function formatHours(hours: number | null | undefined): string {
  return formatMetric(hours, 'ч');
}

/** Дата "dd.mm" (короткая, для таблиц) */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}`;
}

/** Дата периода: "13–19 янв 2025" */
export function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);

  const sDay = s.getDate();
  const eDay = e.getDate();
  const sMonth = MONTHS_SHORT[s.getMonth()];
  const eMonth = MONTHS_SHORT[e.getMonth()];
  const year = e.getFullYear();

  if (s.getMonth() === e.getMonth()) {
    return `${sDay}–${eDay} ${sMonth} ${year}`;
  }
  return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${year}`;
}

/** Относительная дата: "2 часа назад", "вчера", "3 дня назад" */
export function formatRelativeDate(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'только что';
  if (diffMin < 60) return `${diffMin} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`;

  const d = new Date(date);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
