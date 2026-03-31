/**
 * Утилиты для работы с неделями (ISO 8601: неделя начинается с понедельника).
 *
 * ВСЕ функции работают в UTC — нет зависимости от часового пояса сервера.
 * PostgreSQL `date` колонки хранят дату в UTC, поэтому важно что
 * JavaScript Date тоже оперирует UTC-компонентами (getUTCDay, setUTCHours, …).
 */

/** Получить понедельник (00:00:00.000 UTC) для данной даты */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Получить диапазон недели (пн 00:00 UTC — вс 23:59:59.999 UTC) для данной даты */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const start = getMonday(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/** Получить диапазон текущей недели */
export function getCurrentWeekRange(): { start: Date; end: Date } {
  return getWeekRange(new Date());
}

/** Получить список полных недель между двумя датами.
 *  Неделя включается только если её воскресенье ≤ to (т.е. неделя полностью
 *  укладывается в запрошенный период). Это предотвращает сбор неполной
 *  хвостовой недели, которая даёт заниженные метрики и ложную динамику. */
export function getWeeksBetween(from: Date, to: Date): Array<{ start: Date; end: Date }> {
  const weeks: Array<{ start: Date; end: Date }> = [];
  let current = getMonday(from);

  // Нормализуем to до конца дня UTC, чтобы дата "2025-03-30" (полночь)
  // корректно включала неделю, заканчивающуюся 30-го числа (23:59:59.999)
  const toEndOfDay = new Date(to);
  toEndOfDay.setUTCHours(23, 59, 59, 999);

  while (current <= toEndOfDay) {
    const range = getWeekRange(current);
    if (range.end <= toEndOfDay) {
      weeks.push(range);
    }
    current = new Date(current);
    current.setUTCDate(current.getUTCDate() + 7);
  }

  return weeks;
}

/** Форматировать дату для YouTrack query (YYYY-MM-DD) в UTC */
export function formatYTDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
