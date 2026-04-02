import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { prefixedTable } from './table-prefix';

@Entity({ tableName: prefixedTable('aggregated_reports') })
export class AggregatedReport {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ length: 20 })
  type!: 'employee' | 'project' | 'team';

  @Property({ length: 255, nullable: true })
  targetLogin?: string;

  @Property({ length: 255, nullable: true })
  targetSubscriptionId?: string;

  @Property({ length: 255, nullable: true })
  targetTeamId?: string;

  @Property({ length: 255 })
  targetName!: string;

  @Property({ type: 'date' })
  periodStart!: Date;

  @Property({ type: 'date' })
  periodEnd!: Date;

  @Property()
  weeksCount!: number;

  // Aggregated metrics (sums)
  @Property({ default: 0 })
  totalIssues: number = 0;

  @Property({ default: 0 })
  completedIssues: number = 0;

  @Property({ default: 0 })
  overdueIssues: number = 0;

  @Property({ default: 0 })
  totalSpentMinutes: number = 0;

  @Property({ default: 0 })
  totalEstimationMinutes: number = 0;

  // Aggregated KPIs (averages)
  @Property({ type: 'real', nullable: true })
  avgUtilization?: number;

  @Property({ type: 'real', nullable: true })
  avgEstimationAccuracy?: number;

  @Property({ type: 'real', nullable: true })
  avgFocus?: number;

  @Property({ type: 'real', nullable: true })
  avgCompletionRate?: number;

  @Property({ type: 'real', nullable: true })
  avgCycleTimeHours?: number;

  @Property({ type: 'real', nullable: true })
  avgScore?: number;

  // Weekly data for charts
  @Property({ type: 'jsonb', default: '[]' })
  weeklyData: object[] = [];

  @Property({ type: 'jsonb', default: '[]' })
  weeklyTrends: object[] = [];

  @Property({ type: 'jsonb', default: '{}' })
  overallTrend: object = {};

  @Property({ type: 'jsonb', default: '[]' })
  weeklyLlmSummaries: object[] = [];

  // LLM period summary
  @Property({ nullable: true })
  llmPeriodScore?: number;

  @Property({ type: 'text', nullable: true })
  llmPeriodSummary?: string;

  @Property({ type: 'jsonb', nullable: true })
  llmPeriodConcerns?: string[];

  @Property({ type: 'jsonb', nullable: true })
  llmPeriodRecommendations?: string[];

  // Employee data for project/team reports
  @Property({ type: 'jsonb', nullable: true })
  employeesData?: object[];

  @Property({ type: 'jsonb', nullable: true })
  progress?: object | null;

  @Property({ type: 'jsonb', nullable: true })
  collectedData?: object | null;

  @Property({ length: 20, default: 'generating' })
  status: string = 'generating';

  @Property({ type: 'text', nullable: true })
  errorMessage?: string;

  @Property({ length: 255, nullable: true })
  createdBy?: string;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
