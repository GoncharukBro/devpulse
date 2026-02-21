import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { Subscription } from './subscription.entity';

export interface IssuesByType {
  [category: string]: number;
}

export interface LlmTaskClassification {
  businessCritical?: string[];
  technicallySignificant?: string[];
}

@Entity({ tableName: 'metric_reports' })
@Unique({ properties: ['subscription', 'youtrackLogin', 'periodStart'] })
export class MetricReport {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Subscription, { deleteRule: 'cascade' })
  subscription!: Subscription;

  @Property()
  youtrackLogin!: string;

  @Property({ type: 'date' })
  periodStart!: Date;

  @Property({ type: 'date' })
  periodEnd!: Date;

  // Raw metrics
  @Property({ default: 0 })
  totalIssues: number = 0;

  @Property({ default: 0 })
  completedIssues: number = 0;

  @Property({ default: 0 })
  inProgressIssues: number = 0;

  @Property({ default: 0 })
  overdueIssues: number = 0;

  @Property({ type: 'jsonb', default: '{}' })
  issuesByType: IssuesByType = {};

  // Time
  @Property({ default: 0 })
  totalSpentMinutes: number = 0;

  @Property({ type: 'jsonb', default: '{}' })
  spentByType: IssuesByType = {};

  @Property({ default: 0 })
  totalEstimationMinutes: number = 0;

  @Property({ type: 'jsonb', default: '{}' })
  estimationByType: IssuesByType = {};

  // Process
  @Property({ type: 'real', nullable: true })
  avgCycleTimeHours?: number;

  @Property({ default: 0 })
  bugsAfterRelease: number = 0;

  @Property({ default: 0 })
  bugsOnTest: number = 0;

  @Property({ default: 0 })
  aiSavingMinutes: number = 0;

  @Property({ default: 0 })
  issuesWithoutEstimation: number = 0;

  @Property({ default: 0 })
  issuesOverEstimation: number = 0;

  // Computed KPIs
  @Property({ type: 'real', nullable: true })
  utilization?: number;

  @Property({ type: 'real', nullable: true })
  estimationAccuracy?: number;

  @Property({ type: 'real', nullable: true })
  focus?: number;

  @Property({ type: 'real', nullable: true })
  avgComplexityHours?: number;

  @Property({ type: 'real', nullable: true })
  completionRate?: number;

  // LLM analysis
  @Property({ nullable: true })
  llmScore?: number;

  @Property({ type: 'text', nullable: true })
  llmSummary?: string;

  @Property({ type: 'jsonb', nullable: true })
  llmAchievements?: string[];

  @Property({ type: 'jsonb', nullable: true })
  llmConcerns?: string[];

  @Property({ type: 'jsonb', nullable: true })
  llmRecommendations?: string[];

  @Property({ type: 'jsonb', nullable: true })
  llmTaskClassification?: LlmTaskClassification;

  @Property({ type: 'timestamptz', nullable: true })
  llmProcessedAt?: Date;

  // Formula score
  @Property({ nullable: true })
  formulaScore?: number;

  // Status
  @Property({ default: 'pending' })
  status: string = 'pending';

  @Property({ type: 'text', nullable: true })
  errorMessage?: string;

  @Property({ type: 'timestamptz', nullable: true })
  collectedAt?: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
