import { Migration } from '@mikro-orm/migrations';

export class Migration20260402062816_AddReportCollectionFields extends Migration {

  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE devpulse_aggregated_reports ADD COLUMN IF NOT EXISTS progress jsonb DEFAULT NULL;`);
    this.addSql(`ALTER TABLE devpulse_aggregated_reports ADD COLUMN IF NOT EXISTS collected_data jsonb DEFAULT NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE devpulse_aggregated_reports DROP COLUMN IF EXISTS progress;`);
    this.addSql(`ALTER TABLE devpulse_aggregated_reports DROP COLUMN IF EXISTS collected_data;`);
  }

}
