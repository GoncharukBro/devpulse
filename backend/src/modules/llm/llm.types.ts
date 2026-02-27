export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  rateLimit: number;
  requestTimeoutMs: number;
  maxRetries: number;
}

export interface LlmAnalysis {
  score: number;
  summary: string;
  achievements: string[];
  concerns: string[];
  recommendations: string[];
  taskClassification: {
    businessCritical: string[];
    technicallySignificant: string[];
    bugfixes: string[];
    other: string[];
  };
}

export interface PromptData {
  employeeName: string;
  projectName: string;
  periodStart: string;
  periodEnd: string;
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  issuesByType: Record<string, number>;
  totalSpentHours: number;
  estimationHours: number;
  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  completionRate: number | null;
  avgCycleTimeHours: number | null;
  bugsAfterRelease: number;
  bugsOnTest: number;
  aiSavingHours: number;
  taskSummaries: Array<{ id: string; summary: string; type: string }>;
}

export interface LlmTask {
  reportId: string;
  subscriptionId: string;
  collectionLogId?: string;
  youtrackLogin: string;
  employeeName: string;
  projectName: string;
  taskSummaries: Array<{ id: string; summary: string; type: string }>;
}

export interface LlmWorkerState {
  queueSize: number;
  processing: string | null;
  isRunning: boolean;
}
