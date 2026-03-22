/**
 * Промпт для LLM-анализа агрегированного отчёта за период.
 */

import { ChatMessage } from '../llm/llm.types';
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

const SYSTEM_PROMPT = `Ты — аналитик продуктивности разработчиков. Анализируй агрегированные метрики за период из нескольких недель и давай оценку.

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

function fmt(value: number | null | undefined, suffix = ''): string {
  if (value == null) return 'н/д';
  return `${Math.round(value * 100) / 100}${suffix}`;
}

function getTargetTypeLabel(type: 'employee' | 'project' | 'team'): string {
  if (type === 'employee') return 'Сотрудник';
  if (type === 'project') return 'Проект';
  return 'Команда';
}

function buildUserPrompt(data: PeriodPromptData): string {
  const m = data.aggregatedMetrics;

  let prompt = `${getTargetTypeLabel(data.targetType)}: ${data.targetName}
Период: ${data.periodStart} — ${data.periodEnd} (${data.weeksCount} нед.)

=== Агрегированные метрики за период ===
Задачи: ${m.totalIssues} всего, ${m.completedIssues} закрыто, ${m.overdueIssues} просрочено
Время: списано ${fmt(m.totalSpentHours)}ч, оценка ${fmt(m.totalEstimationHours)}ч
KPI: загрузка ${fmt(m.avgUtilization, '%')}, точность оценок ${fmt(m.avgEstimationAccuracy, '%')}, фокус ${fmt(m.avgFocus, '%')}
Completion Rate: ${fmt(m.avgCompletionRate, '%')}, Cycle Time: ${fmt(m.avgCycleTimeHours)}ч
Средний Score: ${fmt(m.avgScore)}`;

  // Weekly dynamics
  if (data.weeklyData.length > 0) {
    prompt += '\n\n=== Динамика по неделям ===';
    for (const w of data.weeklyData) {
      prompt += `\n${w.periodStart}: score=${fmt(w.score)}, загрузка=${fmt(w.utilization, '%')}, ` +
        `completion=${fmt(w.completionRate, '%')}, задач=${w.completedIssues}/${w.totalIssues}, ` +
        `время=${fmt(w.totalSpentHours)}ч`;
    }
  }

  // Weekly LLM summaries (existing analysis per week)
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
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(data) },
  ];
}
