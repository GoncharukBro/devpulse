import { Migration } from '@mikro-orm/migrations';

/**
 * Renames all tables to use the 'devpulse_' prefix.
 * Also renames all constraints (PK, FK, unique) for consistency.
 *
 * The prefix is hardcoded in the migration because migrations must be
 * deterministic — they always produce the same result regardless of env vars.
 */

const PREFIX = 'devpulse_';

const TABLES = [
  'subscriptions',
  'subscription_employees',
  'field_mappings',
  'metric_reports',
  'teams',
  'team_members',
  'achievements',
  'collection_logs',
];

/** [table, constraint_name] */
const PRIMARY_KEYS: [string, string][] = [
  ['subscriptions', 'subscriptions_pkey'],
  ['subscription_employees', 'subscription_employees_pkey'],
  ['field_mappings', 'field_mappings_pkey'],
  ['metric_reports', 'metric_reports_pkey'],
  ['teams', 'teams_pkey'],
  ['team_members', 'team_members_pkey'],
  ['achievements', 'achievements_pkey'],
  ['collection_logs', 'collection_logs_pkey'],
];

/** [table, constraint_name] */
const UNIQUE_CONSTRAINTS: [string, string][] = [
  ['subscriptions', 'subscriptions_youtrack_instance_id_project_id_owner_id_unique'],
  ['subscription_employees', 'subscription_employees_subscription_id_youtrack_login_unique'],
  ['field_mappings', 'field_mappings_subscription_id_unique'],
  ['metric_reports', 'metric_reports_subscription_id_youtrack_login_period_start_unique'],
  ['team_members', 'team_members_team_id_youtrack_login_unique'],
  ['achievements', 'achievements_youtrack_login_type_rarity_subscription_id_unique'],
];

/** [child_table, constraint_name] */
const FOREIGN_KEYS: [string, string][] = [
  ['subscription_employees', 'subscription_employees_subscription_id_foreign'],
  ['field_mappings', 'field_mappings_subscription_id_foreign'],
  ['metric_reports', 'metric_reports_subscription_id_foreign'],
  ['team_members', 'team_members_team_id_foreign'],
  ['achievements', 'achievements_subscription_id_foreign'],
  ['collection_logs', 'collection_logs_subscription_id_foreign'],
];

export class Migration20260318000000_add_table_prefix extends Migration {
  override async up(): Promise<void> {
    // 1. Drop foreign keys first (they reference parent tables by name)
    for (const [table, fk] of FOREIGN_KEYS) {
      this.addSql(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${fk}";`);
    }

    // 2. Rename tables
    for (const table of TABLES) {
      this.addSql(`ALTER TABLE "${table}" RENAME TO "${PREFIX}${table}";`);
    }

    // 3. Rename primary keys
    for (const [table, pk] of PRIMARY_KEYS) {
      this.addSql(
        `ALTER TABLE "${PREFIX}${table}" RENAME CONSTRAINT "${pk}" TO "${PREFIX}${pk}";`,
      );
    }

    // 4. Rename unique constraints
    for (const [table, uc] of UNIQUE_CONSTRAINTS) {
      this.addSql(
        `ALTER TABLE "${PREFIX}${table}" RENAME CONSTRAINT "${uc}" TO "${PREFIX}${uc}";`,
      );
    }

    // 5. Re-create foreign keys with prefixed names pointing to prefixed tables
    this.addSql(`
      ALTER TABLE "${PREFIX}subscription_employees"
        ADD CONSTRAINT "${PREFIX}subscription_employees_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "${PREFIX}subscriptions" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "${PREFIX}field_mappings"
        ADD CONSTRAINT "${PREFIX}field_mappings_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "${PREFIX}subscriptions" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "${PREFIX}metric_reports"
        ADD CONSTRAINT "${PREFIX}metric_reports_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "${PREFIX}subscriptions" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "${PREFIX}team_members"
        ADD CONSTRAINT "${PREFIX}team_members_team_id_foreign"
        FOREIGN KEY ("team_id") REFERENCES "${PREFIX}teams" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "${PREFIX}achievements"
        ADD CONSTRAINT "${PREFIX}achievements_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "${PREFIX}subscriptions" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "${PREFIX}collection_logs"
        ADD CONSTRAINT "${PREFIX}collection_logs_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "${PREFIX}subscriptions" ("id")
        ON DELETE CASCADE;
    `);
  }

  override async down(): Promise<void> {
    // Reverse: drop prefixed FKs
    for (const [table, fk] of FOREIGN_KEYS) {
      this.addSql(`ALTER TABLE "${PREFIX}${table}" DROP CONSTRAINT IF EXISTS "${PREFIX}${fk}";`);
    }

    // Rename tables back
    for (const table of TABLES) {
      this.addSql(`ALTER TABLE "${PREFIX}${table}" RENAME TO "${table}";`);
    }

    // Rename primary keys back
    for (const [table, pk] of PRIMARY_KEYS) {
      this.addSql(`ALTER TABLE "${table}" RENAME CONSTRAINT "${PREFIX}${pk}" TO "${pk}";`);
    }

    // Rename unique constraints back
    for (const [table, uc] of UNIQUE_CONSTRAINTS) {
      this.addSql(`ALTER TABLE "${table}" RENAME CONSTRAINT "${PREFIX}${uc}" TO "${uc}";`);
    }

    // Re-create original foreign keys
    this.addSql(`
      ALTER TABLE "subscription_employees"
        ADD CONSTRAINT "subscription_employees_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "field_mappings"
        ADD CONSTRAINT "field_mappings_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "metric_reports"
        ADD CONSTRAINT "metric_reports_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "team_members"
        ADD CONSTRAINT "team_members_team_id_foreign"
        FOREIGN KEY ("team_id") REFERENCES "teams" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "achievements"
        ADD CONSTRAINT "achievements_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id")
        ON DELETE CASCADE;
    `);
    this.addSql(`
      ALTER TABLE "collection_logs"
        ADD CONSTRAINT "collection_logs_subscription_id_foreign"
        FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id")
        ON DELETE CASCADE;
    `);
  }
}
