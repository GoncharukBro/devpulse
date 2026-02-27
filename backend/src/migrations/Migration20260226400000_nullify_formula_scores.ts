import { Migration } from '@mikro-orm/migrations';

export class Migration20260226400000_nullify_formula_scores extends Migration {
  override async up(): Promise<void> {
    // 1. Обнулить formula_score у ВСЕХ записей (поле больше не используется)
    this.addSql(`UPDATE "metric_reports" SET "formula_score" = NULL;`);

    // 2. Обнулить LLM-данные у записей без реальных метрик
    //    (total_issues=0 AND total_spent_minutes=0, но есть ненулевой LLM-ответ)
    this.addSql(`
      UPDATE "metric_reports"
      SET
        "llm_score" = NULL,
        "llm_summary" = NULL,
        "llm_achievements" = NULL,
        "llm_concerns" = NULL,
        "llm_recommendations" = NULL,
        "llm_task_classification" = NULL,
        "llm_status" = 'skipped'
      WHERE "total_issues" = 0
        AND "total_spent_minutes" = 0
        AND ("llm_score" IS NOT NULL OR "llm_summary" IS NOT NULL);
    `);
  }

  override async down(): Promise<void> {
    // Невозможно восстановить удалённые LLM-данные и formula_score
    // Откат не предусмотрен — данные были некорректными
  }
}
