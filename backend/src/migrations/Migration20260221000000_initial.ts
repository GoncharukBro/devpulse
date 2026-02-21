import { Migration } from '@mikro-orm/migrations';

export class Migration20260221000000_initial extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "subscriptions" (
        "id" uuid not null default gen_random_uuid(),
        "youtrack_instance_id" varchar(255) not null,
        "project_id" varchar(255) not null,
        "project_short_name" varchar(255) not null,
        "project_name" varchar(255) not null,
        "owner_id" varchar(255) not null,
        "is_active" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "subscriptions_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "subscriptions"
        add constraint "subscriptions_youtrack_instance_id_project_id_owner_id_unique"
        unique ("youtrack_instance_id", "project_id", "owner_id");
    `);

    this.addSql(`
      create table if not exists "subscription_employees" (
        "id" uuid not null default gen_random_uuid(),
        "subscription_id" uuid not null,
        "youtrack_login" varchar(255) not null,
        "display_name" varchar(255) not null,
        "email" varchar(255) null,
        "avatar_url" varchar(255) null,
        "is_active" boolean not null default true,
        "created_at" timestamptz not null default now(),
        constraint "subscription_employees_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "subscription_employees"
        add constraint "subscription_employees_subscription_id_youtrack_login_unique"
        unique ("subscription_id", "youtrack_login");
    `);

    this.addSql(`
      create table if not exists "field_mappings" (
        "id" uuid not null default gen_random_uuid(),
        "subscription_id" uuid not null,
        "task_type_mapping" jsonb not null default '{}',
        "ai_saving_work_type" varchar(255) null,
        "cycle_time_start_statuses" jsonb not null default '[]',
        "cycle_time_end_statuses" jsonb not null default '[]',
        "release_statuses" jsonb not null default '[]',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "field_mappings_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "field_mappings"
        add constraint "field_mappings_subscription_id_unique"
        unique ("subscription_id");
    `);

    this.addSql(`
      create table if not exists "metric_reports" (
        "id" uuid not null default gen_random_uuid(),
        "subscription_id" uuid not null,
        "youtrack_login" varchar(255) not null,
        "period_start" date not null,
        "period_end" date not null,
        "total_issues" int not null default 0,
        "completed_issues" int not null default 0,
        "in_progress_issues" int not null default 0,
        "overdue_issues" int not null default 0,
        "issues_by_type" jsonb not null default '{}',
        "total_spent_minutes" int not null default 0,
        "spent_by_type" jsonb not null default '{}',
        "total_estimation_minutes" int not null default 0,
        "estimation_by_type" jsonb not null default '{}',
        "avg_cycle_time_hours" real null,
        "bugs_after_release" int not null default 0,
        "bugs_on_test" int not null default 0,
        "ai_saving_minutes" int not null default 0,
        "issues_without_estimation" int not null default 0,
        "issues_over_estimation" int not null default 0,
        "utilization" real null,
        "estimation_accuracy" real null,
        "focus" real null,
        "avg_complexity_hours" real null,
        "completion_rate" real null,
        "llm_score" int null,
        "llm_summary" text null,
        "llm_achievements" jsonb null,
        "llm_concerns" jsonb null,
        "llm_recommendations" jsonb null,
        "llm_task_classification" jsonb null,
        "llm_processed_at" timestamptz null,
        "formula_score" int null,
        "status" varchar(255) not null default 'pending',
        "error_message" text null,
        "collected_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "metric_reports_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "metric_reports"
        add constraint "metric_reports_subscription_id_youtrack_login_period_start_unique"
        unique ("subscription_id", "youtrack_login", "period_start");
    `);

    this.addSql(`
      create table if not exists "teams" (
        "id" uuid not null default gen_random_uuid(),
        "name" varchar(255) not null,
        "owner_id" varchar(255) not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "teams_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create table if not exists "team_members" (
        "id" uuid not null default gen_random_uuid(),
        "team_id" uuid not null,
        "youtrack_login" varchar(255) not null,
        "created_at" timestamptz not null default now(),
        constraint "team_members_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "team_members"
        add constraint "team_members_team_id_youtrack_login_unique"
        unique ("team_id", "youtrack_login");
    `);

    this.addSql(`
      create table if not exists "achievements" (
        "id" uuid not null default gen_random_uuid(),
        "youtrack_login" varchar(255) not null,
        "subscription_id" uuid null,
        "type" varchar(255) not null,
        "title" varchar(255) not null,
        "description" text null,
        "period_start" date not null,
        "rarity" varchar(255) not null default 'common',
        "metadata" jsonb not null default '{}',
        "created_at" timestamptz not null default now(),
        constraint "achievements_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "achievements"
        add constraint "achievements_youtrack_login_type_period_start_subscription_id_unique"
        unique ("youtrack_login", "type", "period_start", "subscription_id");
    `);

    this.addSql(`
      create table if not exists "collection_logs" (
        "id" uuid not null default gen_random_uuid(),
        "subscription_id" uuid null,
        "type" varchar(255) not null,
        "status" varchar(255) not null,
        "period_start" date null,
        "period_end" date null,
        "total_employees" int not null default 0,
        "processed_employees" int not null default 0,
        "errors" jsonb not null default '[]',
        "started_at" timestamptz not null default now(),
        "completed_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        constraint "collection_logs_pkey" primary key ("id")
      );
    `);

    // Foreign keys
    this.addSql(`
      alter table "subscription_employees"
        add constraint "subscription_employees_subscription_id_foreign"
        foreign key ("subscription_id") references "subscriptions" ("id")
        on delete cascade;
    `);

    this.addSql(`
      alter table "field_mappings"
        add constraint "field_mappings_subscription_id_foreign"
        foreign key ("subscription_id") references "subscriptions" ("id")
        on delete cascade;
    `);

    this.addSql(`
      alter table "metric_reports"
        add constraint "metric_reports_subscription_id_foreign"
        foreign key ("subscription_id") references "subscriptions" ("id")
        on delete cascade;
    `);

    this.addSql(`
      alter table "team_members"
        add constraint "team_members_team_id_foreign"
        foreign key ("team_id") references "teams" ("id")
        on delete cascade;
    `);

    this.addSql(`
      alter table "achievements"
        add constraint "achievements_subscription_id_foreign"
        foreign key ("subscription_id") references "subscriptions" ("id")
        on delete cascade;
    `);

    this.addSql(`
      alter table "collection_logs"
        add constraint "collection_logs_subscription_id_foreign"
        foreign key ("subscription_id") references "subscriptions" ("id")
        on delete cascade;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "collection_logs" cascade;');
    this.addSql('drop table if exists "achievements" cascade;');
    this.addSql('drop table if exists "team_members" cascade;');
    this.addSql('drop table if exists "teams" cascade;');
    this.addSql('drop table if exists "metric_reports" cascade;');
    this.addSql('drop table if exists "field_mappings" cascade;');
    this.addSql('drop table if exists "subscription_employees" cascade;');
    this.addSql('drop table if exists "subscriptions" cascade;');
  }
}
