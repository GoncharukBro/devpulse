/**
 * Формирование компактного промпта для LLM-анализа метрик.
 */

import { ChatMessage, PromptData } from './llm.types';

const SYSTEM_PROMPT = `Ты — аналитик продуктивности разработчиков. Анализируй метрики и давай оценку.

Отвечай СТРОГО в формате JSON (без markdown, без \`\`\`):
{
  "score": <число 0-100>,
  "summary": "<краткая сводка 2-3 предложения>",
  "achievements": ["<достижение1>", "<достижение2>"],
  "concerns": ["<проблема1>", "<проблема2>"],
  "recommendations": ["<рекомендация1>", "<рекомендация2>"],
  "taskClassification": {
    "businessCritical": ["<задача>"],
    "technicallySignificant": ["<задача>"],
    "bugfixes": ["<задача>"],
    "other": ["<задача>"]
  }
}

Правила оценки score:
- 80-100: отличная продуктивность, высокая загрузка, точные оценки
- 60-79: хорошая продуктивность, есть области для улучшения
- 40-59: средняя продуктивность, требуется внимание
- 0-39: низкая продуктивность, серьёзные проблемы`;

const MAX_TASKS = 20;

function fmt(value: number | null | undefined, suffix = ''): string {
  if (value == null) return 'н/д';
  return `${Math.round(value * 100) / 100}${suffix}`;
}

function buildUserPrompt(data: PromptData): string {
  const typeEntries = Object.entries(data.issuesByType);
  const typesStr = typeEntries.length > 0
    ? typeEntries.map(([k, v]) => `${k}:${v}`).join(', ')
    : 'н/д';

  let prompt = `Сотрудник: ${data.employeeName}, проект: ${data.projectName}, период: ${data.periodStart}—${data.periodEnd}

Задачи: ${data.totalIssues} всего, ${data.completedIssues} закрыто, ${data.overdueIssues} просрочено
Типы: ${typesStr}
Время: списано ${fmt(data.totalSpentHours)}ч из 40ч (загрузка ${fmt(data.utilization, '%')}), оценка ${fmt(data.estimationHours)}ч (точность ${fmt(data.estimationAccuracy, '%')})
Фокус: ${fmt(data.focus, '%')}, Completion Rate: ${fmt(data.completionRate, '%')}, Cycle Time: ${fmt(data.avgCycleTimeHours)}ч
Баги после релиза: ${data.bugsAfterRelease}, Возвраты: ${data.bugsOnTest}`;

  if (data.taskSummaries.length > 0) {
    const tasks = data.taskSummaries.slice(0, MAX_TASKS);
    const taskLines = tasks.map((t) => `- ${t.id}: ${t.summary} (${t.type})`);
    prompt += `\n\nЗадачи (для классификации):\n${taskLines.join('\n')}`;

    if (data.taskSummaries.length > MAX_TASKS) {
      prompt += `\n... и ещё ${data.taskSummaries.length - MAX_TASKS}`;
    }
  }

  return prompt;
}

export function buildAnalysisPrompt(data: PromptData): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(data) },
  ];
}
