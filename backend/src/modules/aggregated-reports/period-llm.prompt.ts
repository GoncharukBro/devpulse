/**
 * Промпты для двухуровневого LLM-анализа агрегированных отчётов за произвольный период.
 *
 * Уровень 1 — анализ одного сотрудника (buildEmployeeAnalysisPrompt)
 * Уровень 2 — сводный анализ проекта/команды (buildSummaryAnalysisPrompt)
 */

import { ChatMessage } from '../llm/llm.types';
import { PeriodBreakdownItem, CollectedTaskItem } from './aggregated-reports.types';
import { getCategoryLabelRu } from '../subscriptions/subscriptions.types';
import { minutesToHours } from '../../common/utils/metrics-utils';

// ─── Data interfaces ──────────────────────────────────────────────────────────

export interface EmployeePromptData {
  displayName: string;
  periodStart: string;
  periodEnd: string;
  /** Суммарные метрики за весь период */
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentMinutes: number;
  totalEstimationMinutes: number;
  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  completionRate: number | null;
  avgCycleTimeHours: number | null;
  issuesByType: Record<string, number>;
  /** Разбивка по периодам/проектам */
  periodBreakdown: PeriodBreakdownItem[] | null;
  /** Топ задач */
  topTasks: CollectedTaskItem[];
  /** Опциональная сводка по проектам (для сотрудника в нескольких проектах) */
  projectsSummary?: string;
}

export interface EmployeeMiniSummary {
  displayName: string;
  llmScore: number | null;
  llmSummary: string | null;
}

export interface SummaryPromptData {
  targetName: string;
  targetType: 'project' | 'team';
  periodStart: string;
  periodEnd: string;
  /** Общие метрики по всем сотрудникам */
  totalIssues: number;
  completedIssues: number;
  overdueIssues: number;
  totalSpentMinutes: number;
  avgUtilization: number | null;
  avgCompletionRate: number | null;
  avgScore: number | null;
  /** Краткие сводки по сотрудникам */
  employees: EmployeeMiniSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined, suffix = ''): string {
  if (value == null) return 'н/д';
  return `${Math.round(value * 100) / 100}${suffix}`;
}

function fmtHours(minutes: number | null | undefined): string {
  if (minutes == null) return 'н/д';
  return `${minutesToHours(minutes)}ч`;
}

function truncate(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}

// ─── Level 1: Per-employee system prompt ────────────────────────────────────

const EMPLOYEE_SYSTEM_PROMPT = `Ты — аналитик продуктивности разработчиков. Анализируй метрики одного сотрудника за период и давай объективную оценку.

Отвечай СТРОГО в формате JSON (без markdown, без \`\`\`):
{
  "score": <число 0-100>,
  "summary": "<развёрнутая сводка, 3-5 предложений>",
  "concerns": ["<проблема1>", "<проблема2>"],
  "recommendations": ["<рекомендация1>", "<рекомендация2>"],
  "taskClassification": {
    "businessCritical": ["<задача1>"],
    "technicallySignificant": ["<задача1>"],
    "bugfixes": ["<задача1>"],
    "other": ["<задача1>"]
  }
}

Правила оценки score:
- 80-100: отличная продуктивность, задачи выполняются в срок, высокая загрузка
- 60-79: хорошая продуктивность, есть области для улучшения
- 40-59: средняя продуктивность, заметные проблемы с выполнением задач или сроками
- 0-39: низкая продуктивность, серьёзные системные проблемы

Правила:
- Обращай внимание на просроченные задачи и их долю от общего числа
- Оценивай загрузку (utilization): норма 70-90%, выше 100% — перегрузка
- Точность оценок (estimationAccuracy): норма > 80%
- Completion Rate: доля задач, завершённых в срок
- В taskClassification перечисляй ТОЛЬКО id задач из предоставленного списка`;

// ─── Level 2: Summary system prompt ──────────────────────────────────────────

const SUMMARY_SYSTEM_PROMPT = `Ты — аналитик продуктивности команд. Анализируй агрегированные метрики проекта/команды и индивидуальные сводки сотрудников.

Отвечай СТРОГО в формате JSON (без markdown, без \`\`\`):
{
  "score": <число 0-100>,
  "summary": "<развёрнутая сводка по команде/проекту, 3-5 предложений>",
  "concerns": ["<проблема1>", "<проблема2>"],
  "recommendations": ["<рекомендация1>", "<рекомендация2>"]
}

Правила оценки score:
- 80-100: команда работает слаженно, задачи выполняются, KPI в норме
- 60-79: хорошие результаты, есть области для улучшения
- 40-59: заметные проблемы в команде, нестабильность показателей
- 0-39: серьёзные системные проблемы, требуется вмешательство

Правила:
- Выявляй аутсайдеров и лидеров в команде
- Обращай внимание на неравномерное распределение нагрузки
- Анализируй долю просроченных задач по команде в целом
- Давай рекомендации на уровне команды/процессов`;

// ─── Level 1: Per-employee user prompt builder ───────────────────────────────

function buildEmployeeUserPrompt(data: EmployeePromptData): string {
  const spentHours = minutesToHours(data.totalSpentMinutes);
  const estHours = minutesToHours(data.totalEstimationMinutes);

  let prompt = `Сотрудник: ${data.displayName}
Период: ${data.periodStart} — ${data.periodEnd}

=== Метрики за период ===
Задачи: ${data.totalIssues} всего, ${data.completedIssues} закрыто, ${data.overdueIssues} просрочено
Время: списано ${fmt(spentHours)}ч, оценка ${fmt(estHours)}ч
Загрузка: ${fmt(data.utilization, '%')}
Точность оценок: ${fmt(data.estimationAccuracy, '%')}
Фокус: ${fmt(data.focus, '%')}
Completion Rate: ${fmt(data.completionRate, '%')}
Cycle Time (avg): ${fmt(data.avgCycleTimeHours)}ч`;

  // Issues by type
  const typeEntries = Object.entries(data.issuesByType).filter(([, count]) => count > 0);
  if (typeEntries.length > 0) {
    const typeLine = typeEntries
      .map(([key, count]) => `${getCategoryLabelRu(key)}: ${count}`)
      .join(', ');
    prompt += `\nТипы задач: ${typeLine}`;
  }

  // Period breakdown table
  if (data.periodBreakdown && data.periodBreakdown.length > 0) {
    prompt += '\n\n=== Динамика по периодам ===';
    prompt += '\nПериод/проект | задачи | закрыто | просроч | время | загр% | точн% | compl% | типы задач';
    prompt += '\n' + '-'.repeat(100);
    for (const row of data.periodBreakdown) {
      const rowTypes = Object.entries(row.issuesByType ?? {})
        .filter(([, c]) => c > 0)
        .map(([k, c]) => `${getCategoryLabelRu(k)}:${c}`)
        .join(' ');
      prompt += `\n${row.label} | ${row.totalIssues} | ${row.completedIssues} | ${row.overdueIssues} | ${fmt(row.totalSpentHours)}ч | ${fmt(row.utilization, '%')} | ${fmt(row.estimationAccuracy, '%')} | ${fmt(row.completionRate, '%')} | ${rowTypes || '—'}`;
    }
  }

  // Top tasks
  if (data.topTasks.length > 0) {
    prompt += '\n\n=== Топ задач (по времени) ===';
    for (const task of data.topTasks) {
      const typeLabel = getCategoryLabelRu(task.type);
      const spent = task.spentMinutes > 0 ? ` [${minutesToHours(task.spentMinutes)}ч]` : '';
      const overdue = task.overdueDays ? ` (просрочено на ${task.overdueDays} дн.)` : '';
      prompt += `\n- ${task.id}: ${task.summary} [${typeLabel}]${spent}${overdue}`;
    }
  }

  // Projects summary (optional)
  if (data.projectsSummary) {
    prompt += `\n\n=== По проектам ===\n${data.projectsSummary}`;
  }

  return prompt;
}

// ─── Level 2: Summary user prompt builder ────────────────────────────────────

function buildSummaryUserPrompt(data: SummaryPromptData): string {
  const targetTypeLabel = data.targetType === 'project' ? 'Проект' : 'Команда';
  const spentHours = minutesToHours(data.totalSpentMinutes);

  let prompt = `${targetTypeLabel}: ${data.targetName}
Период: ${data.periodStart} — ${data.periodEnd}

=== Общие метрики ===
Задачи: ${data.totalIssues} всего, ${data.completedIssues} закрыто, ${data.overdueIssues} просрочено
Время: списано ${fmt(spentHours)}ч
Средняя загрузка: ${fmt(data.avgUtilization, '%')}
Средний Completion Rate: ${fmt(data.avgCompletionRate, '%')}
Средний Score (по сотрудникам): ${fmt(data.avgScore)}`;

  // Employee mini-summaries
  if (data.employees.length > 0) {
    prompt += '\n\n=== Сводки по сотрудникам ===';
    for (const emp of data.employees) {
      prompt += `\n\n--- ${emp.displayName} (score: ${emp.llmScore ?? 'н/д'}) ---`;
      if (emp.llmSummary) {
        prompt += `\n${truncate(emp.llmSummary, 80)}`;
      } else {
        prompt += '\n(анализ недоступен)';
      }
    }
  }

  return prompt;
}

// ─── Public exports ───────────────────────────────────────────────────────────

export function buildEmployeeAnalysisPrompt(data: EmployeePromptData): ChatMessage[] {
  return [
    { role: 'system', content: EMPLOYEE_SYSTEM_PROMPT },
    { role: 'user', content: buildEmployeeUserPrompt(data) },
  ];
}

export function buildSummaryAnalysisPrompt(data: SummaryPromptData): ChatMessage[] {
  return [
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    { role: 'user', content: buildSummaryUserPrompt(data) },
  ];
}

// ─── Legacy export (used by aggregated-reports.service.ts) ───────────────────

import { AggregatedMetricsDTO, WeeklyDataItem, WeeklyLlmItem } from './aggregated-reports.types';

export interface PeriodPromptData {
  targetType: 'employee' | 'project' | 'team';
  targetName: string;
  periodStart: string;
  periodEnd: string;
  weeksCount: number;
  aggregatedMetrics: AggregatedMetricsDTO;
  weeklyData: WeeklyDataItem[];
  weeklyLlmSummaries: WeeklyLlmItem[];
}

const LEGACY_SYSTEM_PROMPT = `Ты — аналитик продуктивности разработчиков. Анализируй агрегированные метрики за период из нескольких недель и давай оценку.

Отвечай СТРОГО в формате JSON (без markdown, без \`\`\`):
{
  "score": <число 0-100>,
  "summary": "<развёрнутая сводка за период, 3-5 предложений>",
  "concerns": ["<проблема1>", "<проблема2>"],
  "recommendations": ["<рекомендация1>", "<рекомендация2>"]
}

Правила:
- Обращай внимание на ДИНАМИКУ: рост, спад, стабильность метрик по неделям
- Выделяй аномалии: резкие падения или скачки показателей
- Обращай внимание на повторяющиеся проблемы из понедельных сводок
- Оценивай прогресс: стали ли рекомендации из предыдущих недель выполняться
- Score отражает среднюю продуктивность за весь период с учётом динамики

Правила оценки score:
- 80-100: отличная продуктивность, стабильный рост или высокий уровень
- 60-79: хорошая продуктивность, есть области для улучшения
- 40-59: средняя продуктивность, негативная динамика или нестабильность
- 0-39: низкая продуктивность, серьёзные системные проблемы`;

function getTargetTypeLabel(type: 'employee' | 'project' | 'team'): string {
  if (type === 'employee') return 'Сотрудник';
  if (type === 'project') return 'Проект';
  return 'Команда';
}

function buildLegacyUserPrompt(data: PeriodPromptData): string {
  const m = data.aggregatedMetrics;

  let prompt = `${getTargetTypeLabel(data.targetType)}: ${data.targetName}
Период: ${data.periodStart} — ${data.periodEnd} (${data.weeksCount} нед.)

=== Агрегированные метрики за период ===
Задачи: ${m.totalIssues} всего, ${m.completedIssues} закрыто, ${m.overdueIssues} просрочено
Время: списано ${fmt(m.totalSpentHours)}ч, оценка ${fmt(m.totalEstimationHours)}ч
KPI: загрузка ${fmt(m.avgUtilization, '%')}, точность оценок ${fmt(m.avgEstimationAccuracy, '%')}, фокус ${fmt(m.avgFocus, '%')}
Completion Rate: ${fmt(m.avgCompletionRate, '%')}, Cycle Time: ${fmt(m.avgCycleTimeHours)}ч
Средний Score: ${fmt(m.avgScore)}`;

  if (data.weeklyData.length > 0) {
    prompt += '\n\n=== Динамика по неделям ===';
    for (const w of data.weeklyData) {
      prompt += `\n${w.periodStart}: score=${fmt(w.score)}, загрузка=${fmt(w.utilization, '%')}, ` +
        `completion=${fmt(w.completionRate, '%')}, задач=${w.completedIssues}/${w.totalIssues}, ` +
        `время=${fmt(w.totalSpentHours)}ч`;
    }
  }

  const withSummaries = data.weeklyLlmSummaries.filter(w => w.summary);
  if (withSummaries.length > 0) {
    prompt += '\n\n=== Понедельные сводки (из предыдущих анализов) ===';
    for (const w of withSummaries) {
      prompt += `\n--- ${w.periodStart} (score: ${fmt(w.score)}) ---`;
      prompt += `\n${w.summary}`;
      if (w.concerns && w.concerns.length > 0) {
        prompt += `\nПроблемы: ${w.concerns.join('; ')}`;
      }
      if (w.recommendations && w.recommendations.length > 0) {
        prompt += `\nРекомендации: ${w.recommendations.join('; ')}`;
      }
    }
  }

  return prompt;
}

export function buildPeriodAnalysisPrompt(data: PeriodPromptData): ChatMessage[] {
  return [
    { role: 'system', content: LEGACY_SYSTEM_PROMPT },
    { role: 'user', content: buildLegacyUserPrompt(data) },
  ];
}
