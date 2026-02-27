import { Migration } from '@mikro-orm/migrations';

export class Migration20260226100000_collection_log_llm_counters extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "collection_logs"
        add column if not exists "llm_total" int not null default 0,
        add column if not exists "llm_completed" int not null default 0,
        add column if not exists "llm_failed" int not null default 0,
        add column if not exists "llm_skipped" int not null default 0;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "collection_logs"
        drop column if exists "llm_total",
        drop column if exists "llm_completed",
        drop column if exists "llm_failed",
        drop column if exists "llm_skipped";
    `);
  }
}
