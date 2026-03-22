import { Migration } from '@mikro-orm/migrations';

export class Migration20260323000000_subscription_shares extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE "devpulse_subscription_shares" (
        "id"                  serial      NOT NULL,
        "subscription_id"     uuid        NOT NULL,
        "shared_with_login"   varchar(255) NOT NULL,
        "shared_by"           varchar(255) NOT NULL,
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "devpulse_subscription_shares_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "devpulse_subscription_shares_subscription_fk"
          FOREIGN KEY ("subscription_id")
          REFERENCES "devpulse_subscriptions" ("id")
          ON DELETE CASCADE
      );
    `);

    this.addSql(`
      CREATE UNIQUE INDEX "devpulse_subscription_shares_sub_login_unique"
        ON "devpulse_subscription_shares" ("subscription_id", "shared_with_login");
    `);

    this.addSql(`
      CREATE INDEX "devpulse_subscription_shares_login_idx"
        ON "devpulse_subscription_shares" ("shared_with_login");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "devpulse_subscription_shares";`);
  }
}
