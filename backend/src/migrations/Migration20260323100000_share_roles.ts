import { Migration } from '@mikro-orm/migrations';

export class Migration20260323100000_share_roles extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "devpulse_subscription_shares"
        ADD COLUMN "role" varchar(20) NOT NULL DEFAULT 'viewer';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "devpulse_subscription_shares"
        DROP COLUMN "role";
    `);
  }
}
