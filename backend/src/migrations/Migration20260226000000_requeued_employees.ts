import { Migration } from '@mikro-orm/migrations';

export class Migration20260226000000_requeued_employees extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "collection_logs"
        add column if not exists "re_queued_employees" int not null default 0;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "collection_logs"
        drop column if exists "re_queued_employees";
    `);
  }
}
