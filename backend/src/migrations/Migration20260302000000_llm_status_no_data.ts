import { Migration } from '@mikro-orm/migrations';

export class Migration20260302000000_llm_status_no_data extends Migration {
  override async up(): Promise<void> {
    // Перевести skipped → no_data для отчётов где причина = нет данных
    this.addSql(`
      UPDATE metric_reports
      SET llm_status = 'no_data'
      WHERE llm_status = 'skipped' AND total_issues = 0;
    `);
  }

  override async down(): Promise<void> {
    // Откатить: no_data → skipped
    this.addSql(`
      UPDATE metric_reports
      SET llm_status = 'skipped'
      WHERE llm_status = 'no_data';
    `);
  }
}
