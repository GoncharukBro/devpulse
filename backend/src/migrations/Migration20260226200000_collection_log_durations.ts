import { Migration } from '@mikro-orm/migrations';

export class Migration20260226200000_collection_log_durations extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "collection_logs"
        add column if not exists "youtrack_duration" int not null default 0,
        add column if not exists "llm_duration" int not null default 0;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "collection_logs"
        drop column if exists "youtrack_duration",
        drop column if exists "llm_duration";
    `);
  }
}
