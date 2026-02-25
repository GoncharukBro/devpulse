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

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
