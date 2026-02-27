import { Migration } from '@mikro-orm/migrations';

/**
 * Миграция: исправление timezone-бага в period_start / period_end.
 *
 * Проблема: getMonday() использовал setHours(0,0,0,0) в ЛОКАЛЬНОМ времени.
 * На сервере UTC+3 (Москва) это сдвигало дату на -1 день при сохранении
 * в PostgreSQL `date` колонку (хранит UTC-дату):
 *   JS: Mon Feb 23 00:00 MSK = Feb 22 21:00 UTC → PG date: 2026-02-22 (воскресенье!)
 *
 * Фикс: сдвигаем воскресные period_start на +1 день (→ понедельник),
 * субботние period_end на +1 день (→ воскресенье).
 * Баг всегда сдвигает ровно на -1 день, поэтому +1 — точное исправление.
 *
 * ISODOW: 1=понедельник, 7=воскресенье.
 *
 * collection_logs.period_end НЕ трогаем — пользователь мог указать произвольную дату.
 */
export class Migration20260226300000_fix_timezone_dates extends Migration {
  override async up(): Promise<void> {
    // 1. metric_reports.period_start: воскресенье → понедельник (+1 день)
    this.addSql(`
      UPDATE metric_reports
      SET period_start = period_start + INTERVAL '1 day'
      WHERE EXTRACT(ISODOW FROM period_start) = 7;
    `);

    // 2. metric_reports.period_end: суббота → воскресенье (+1 день)
    this.addSql(`
      UPDATE metric_reports
      SET period_end = period_end + INTERVAL '1 day'
      WHERE EXTRACT(ISODOW FROM period_end) = 6;
    `);

    // 3. collection_logs.period_start: воскресенье → понедельник (+1 день)
    this.addSql(`
      UPDATE collection_logs
      SET period_start = period_start + INTERVAL '1 day'
      WHERE period_start IS NOT NULL
        AND EXTRACT(ISODOW FROM period_start) = 7;
    `);

    // 4. achievements.period_start: воскресенье → понедельник (+1 день)
    this.addSql(`
      UPDATE achievements
      SET period_start = period_start + INTERVAL '1 day'
      WHERE EXTRACT(ISODOW FROM period_start) = 7;
    `);
  }

  override async down(): Promise<void> {
    // Обратная миграция невозможна без знания исходных значений.
    // Фикс idempotent: повторный запуск ничего не изменит.
  }
}
