import { Migration } from '@mikro-orm/migrations';

/**
 * Renames YouTrack instance IDs in the database:
 *   main      → drcs
 *   secondary → 2024
 *
 * Affects all tables that store youtrack_instance_id or reference it.
 */
export class Migration20260318100000_rename_youtrack_instances extends Migration {
  override async up(): Promise<void> {
    // subscriptions
    this.addSql(
      `UPDATE "devpulse_subscriptions" SET "youtrack_instance_id" = 'drcs' WHERE "youtrack_instance_id" = 'main';`,
    );
    this.addSql(
      `UPDATE "devpulse_subscriptions" SET "youtrack_instance_id" = '2024' WHERE "youtrack_instance_id" = 'secondary';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `UPDATE "devpulse_subscriptions" SET "youtrack_instance_id" = 'main' WHERE "youtrack_instance_id" = 'drcs';`,
    );
    this.addSql(
      `UPDATE "devpulse_subscriptions" SET "youtrack_instance_id" = 'secondary' WHERE "youtrack_instance_id" = '2024';`,
    );
  }
}
