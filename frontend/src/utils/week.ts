/**
 * Returns the current week range (Monday–Sunday) as ISO date strings (YYYY-MM-DD).
 *
 * ISO 8601: week starts on Monday.
 * The end date is the Sunday of the current week (or clamped to today if the week hasn't ended).
 */
export function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...

  // Start = Monday of current week
  const start = new Date(now);
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(now.getDate() + diffToMonday);

  // End = Sunday of current week (but clamped to today)
  const sunday = new Date(start);
  sunday.setDate(start.getDate() + 6);

  const end = sunday <= now ? sunday : now;

  return {
    start: formatDateISO(start),
    end: formatDateISO(end),
  };
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Понедельник недели для данной даты (local time) */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Воскресенье недели для данной даты (local time) */
export function getWeekEnd(date: Date): Date {
  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

/** Количество недель между двумя датами */
export function getWeeksCount(from: Date, to: Date): number {
  const monday = getMonday(from);
  const sunday = getWeekEnd(to);
  const diff = sunday.getTime() - monday.getTime();
  return Math.max(1, Math.round(diff / (7 * 24 * 60 * 60 * 1000)));
}

/** Форматировать дату как ДД.ММ.ГГГГ */
export function formatDateDisplay(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}
