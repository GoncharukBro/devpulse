import { Migration } from '@mikro-orm/migrations';

export class Migration20260224000000_achievement_streaks extends Migration {
  override async up(): Promise<void> {
    // Add new columns for streaks
    this.addSql(`
      alter table "achievements"
        add column "current_streak" int not null default 0,
        add column "best_streak" int not null default 0,
        add column "last_confirmed_at" timestamptz null,
        add column "is_new" boolean not null default true;
    `);

    // Drop old unique constraint (youtrack_login, type, period_start, subscription_id)
    this.addSql(`
      alter table "achievements"
        drop constraint if exists "achievements_youtrack_login_type_period_start_subscription_id_unique";
    `);

    // Deduplicate existing achievements:
    // For each (youtrack_login, type, rarity, subscription_id) group, keep the most recent one
    // and delete the rest
    this.addSql(`
      delete from "achievements" a
      using (
        select id, row_number() over (
          partition by youtrack_login, type, rarity, subscription_id
          order by created_at desc
        ) as rn
        from "achievements"
      ) ranked
      where a.id = ranked.id and ranked.rn > 1;
    `);

    // Mark all existing achievements as not new (already seen)
    this.addSql(`update "achievements" set "is_new" = false;`);

    // Add new unique constraint (youtrack_login, type, rarity, subscription_id)
    this.addSql(`
      alter table "achievements"
        add constraint "achievements_youtrack_login_type_rarity_subscription_id_unique"
        unique ("youtrack_login", "type", "rarity", "subscription_id");
    `);
  }

  override async down(): Promise<void> {
    // Drop new unique constraint
    this.addSql(`
      alter table "achievements"
        drop constraint if exists "achievements_youtrack_login_type_rarity_subscription_id_unique";
    `);

    // Remove new columns
    this.addSql(`
      alter table "achievements"
        drop column "current_streak",
        drop column "best_streak",
        drop column "last_confirmed_at",
        drop column "is_new";
    `);

    // Restore old unique constraint
    this.addSql(`
      alter table "achievements"
        add constraint "achievements_youtrack_login_type_period_start_subscription_id_unique"
        unique ("youtrack_login", "type", "period_start", "subscription_id");
    `);
  }
}
