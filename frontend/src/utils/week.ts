/**
 * Returns the current week range (Sunday–Sunday) as ISO date strings (YYYY-MM-DD).
 *
 * Logic:
 * - If today is Sunday → returns previous week (last Sunday → today).
 * - Otherwise → returns current week start (last Sunday) → today.
 *
 * The end date is always clamped to today so the range is immediately valid.
 */
export function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay(); // 0 = Sunday

  // Start = most recent past Sunday
  const start = new Date(now);
  // If today is Sunday, go back 7 days so the range has > 0 span
  start.setDate(now.getDate() - (day === 0 ? 7 : day));

  // End = today (clamped to not exceed current date)
  const end = new Date(now);

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
