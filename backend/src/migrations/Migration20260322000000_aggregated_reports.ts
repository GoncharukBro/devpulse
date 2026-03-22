import { Migration } from '@mikro-orm/migrations';

export class Migration20260322000000_aggregated_reports extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE "devpulse_aggregated_reports" (
        "id"                          uuid        NOT NULL DEFAULT gen_random_uuid(),
        "type"                        varchar(20) NOT NULL,
        "target_login"                varchar(255),
        "target_subscription_id"      varchar(255),
        "target_team_id"              varchar(255),
        "target_name"                 varchar(255) NOT NULL,
        "period_start"                date        NOT NULL,
        "period_end"                  date        NOT NULL,
        "weeks_count"                 int         NOT NULL,
        "total_issues"                int         NOT NULL DEFAULT 0,
        "completed_issues"            int         NOT NULL DEFAULT 0,
        "overdue_issues"              int         NOT NULL DEFAULT 0,
        "total_spent_minutes"         int         NOT NULL DEFAULT 0,
        "total_estimation_minutes"    int         NOT NULL DEFAULT 0,
        "avg_utilization"             real,
        "avg_estimation_accuracy"     real,
        "avg_focus"                   real,
        "avg_completion_rate"         real,
        "avg_cycle_time_hours"        real,
        "avg_score"                   real,
        "weekly_data"                 jsonb       NOT NULL DEFAULT '[]',
        "weekly_trends"               jsonb       NOT NULL DEFAULT '[]',
        "overall_trend"               jsonb       NOT NULL DEFAULT '{}',
        "weekly_llm_summaries"        jsonb       NOT NULL DEFAULT '[]',
        "llm_period_score"            int,
        "llm_period_summary"          text,
        "llm_period_concerns"         jsonb,
        "llm_period_recommendations"  jsonb,
        "employees_data"              jsonb,
        "status"                      varchar(20) NOT NULL DEFAULT 'generating',
        "error_message"               text,
        "created_by"                  varchar(255),
        "created_at"                  timestamptz NOT NULL DEFAULT now(),
        "updated_at"                  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "devpulse_aggregated_reports_pkey" PRIMARY KEY ("id")
      );
    `);

    this.addSql(
      `CREATE INDEX idx_aggregated_reports_type ON devpulse_aggregated_reports (type);`,
    );
    this.addSql(
      `CREATE INDEX idx_aggregated_reports_status ON devpulse_aggregated_reports (status);`,
    );
    this.addSql(
      `CREATE INDEX idx_aggregated_reports_period ON devpulse_aggregated_reports (period_start, period_end);`,
    );
    this.addSql(
      `CREATE INDEX idx_aggregated_reports_created_at ON devpulse_aggregated_reports (created_at DESC);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "devpulse_aggregated_reports";`);
  }
}
