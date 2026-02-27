import { Migration } from '@mikro-orm/migrations';

export class Migration20260225000000_collection_pipeline extends Migration {
  override async up(): Promise<void> {
    // Add new columns to collection_logs
    this.addSql(`
      alter table "collection_logs"
        add column if not exists "user_id" varchar(255) null,
        add column if not exists "skipped_employees" int not null default 0,
        add column if not exists "failed_employees" int not null default 0,
        add column if not exists "overwrite" boolean not null default false,
        add column if not exists "duration" int not null default 0,
        add column if not exists "error" text null,
        add column if not exists "updated_at" timestamptz not null default now();
    `);

    // Migrate status values: queued → pending, error → failed, collecting → running
    this.addSql(`
      update "collection_logs" set "status" = 'pending' where "status" = 'queued';
    `);
    this.addSql(`
      update "collection_logs" set "status" = 'failed' where "status" = 'error';
    `);
    this.addSql(`
      update "collection_logs" set "status" = 'failed' where "status" = 'collecting';
    `);

    // Migrate type values: scheduled → cron, backfill → manual
    this.addSql(`
      update "collection_logs" set "type" = 'cron' where "type" = 'scheduled';
    `);
    this.addSql(`
      update "collection_logs" set "type" = 'manual' where "type" = 'backfill';
    `);

    // Add llm_status column to metric_reports
    this.addSql(`
      alter table "metric_reports"
        add column if not exists "llm_status" varchar(255) not null default 'pending';
    `);

    // Migrate metric_reports status: pending → collected (only those not yet processed)
    this.addSql(`
      update "metric_reports" set "status" = 'collected' where "status" = 'pending';
    `);
    // completed → analyzed (if has LLM data)
    this.addSql(`
      update "metric_reports" set "status" = 'analyzed', "llm_status" = 'completed'
      where "status" = 'completed' and "llm_processed_at" is not null;
    `);
    // completed without LLM → analyzed with llm_status = failed (formula fallback)
    this.addSql(`
      update "metric_reports" set "status" = 'analyzed', "llm_status" = 'failed'
      where "status" = 'completed' and "llm_processed_at" is null;
    `);
    // Set llm_status for collected reports to pending
    this.addSql(`
      update "metric_reports" set "llm_status" = 'pending'
      where "status" = 'collected';
    `);
  }

  override async down(): Promise<void> {
    // Revert metric_reports status
    this.addSql(`
      update "metric_reports" set "status" = 'completed' where "status" = 'analyzed';
    `);
    this.addSql(`
      update "metric_reports" set "status" = 'pending' where "status" = 'collected';
    `);

    // Drop llm_status column
    this.addSql(`
      alter table "metric_reports" drop column if exists "llm_status";
    `);

    // Revert collection_logs type values
    this.addSql(`
      update "collection_logs" set "type" = 'scheduled' where "type" = 'cron';
    `);

    // Revert collection_logs status values
    this.addSql(`
      update "collection_logs" set "status" = 'queued' where "status" = 'pending';
    `);

    // Drop new columns from collection_logs
    this.addSql(`
      alter table "collection_logs"
        drop column if exists "user_id",
        drop column if exists "skipped_employees",
        drop column if exists "failed_employees",
        drop column if exists "overwrite",
        drop column if exists "duration",
        drop column if exists "error",
        drop column if exists "updated_at";
    `);
  }
}
