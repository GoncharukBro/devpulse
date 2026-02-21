/**
 * Утилиты для работы с неделями (ISO 8601: неделя начинается с понедельника).
 */

/** Получить понедельник (00:00:00.000) для данной даты */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Получить диапазон недели (пн 00:00 — вс 23:59:59.999) для данной даты */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const start = getMonday(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Получить диапазон текущей недели */
export function getCurrentWeekRange(): { start: Date; end: Date } {
  return getWeekRange(new Date());
}

/** Получить список недель между двумя датами (включительно) */
export function getWeeksBetween(from: Date, to: Date): Array<{ start: Date; end: Date }> {
  const weeks: Array<{ start: Date; end: Date }> = [];
  let current = getMonday(from);

  while (current <= to) {
    const range = getWeekRange(current);
    weeks.push(range);
    current = new Date(current);
    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

/** Форматировать дату для YouTrack query (YYYY-MM-DD) */
export function formatYTDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
