import { Migration } from '@mikro-orm/migrations';

export class Migration20260226500000_nullify_kpi_no_issues extends Migration {
  override async up(): Promise<void> {
    // Обнулить KPI у записей без задач (totalIssues = 0).
    // Раньше utilization = 0 вместо NULL для таких записей.
    this.addSql(`
      UPDATE "metric_reports"
      SET
        "utilization" = NULL,
        "estimation_accuracy" = NULL,
        "focus" = NULL,
        "avg_complexity_hours" = NULL,
        "completion_rate" = NULL
      WHERE "total_issues" = 0
        AND ("utilization" IS NOT NULL OR "completion_rate" IS NOT NULL);
    `);
  }

  override async down(): Promise<void> {
    // Невозможно восстановить — старые значения были семантически некорректны
  }
}
