import { useState } from 'react';
import { AlertTriangle, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import type { WeeklyLlmItem } from '@/types/aggregated-report';

interface PeriodLlmSummaryProps {
  llmPeriodScore: number | null;
  llmPeriodSummary: string | null;
  llmPeriodConcerns: string[] | null;
  llmPeriodRecommendations: string[] | null;
  weeklyLlmSummaries: WeeklyLlmItem[];
  status: string;
}

export default function PeriodLlmSummary({
  llmPeriodScore,
  llmPeriodSummary,
  llmPeriodConcerns,
  llmPeriodRecommendations,
  weeklyLlmSummaries,
  status,
}: PeriodLlmSummaryProps) {
  const [expandedWeeks, setExpandedWeeks] = useState(false);

  if (status === 'generating') {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 animate-pulse rounded-full bg-brand-500" />
          <span className="text-sm text-gray-500 dark:text-gray-400">LLM-анализ в процессе...</span>
        </div>
      </Card>
    );
  }

  if (status === 'failed') {
    return (
      <Card>
        <p className="text-sm text-red-500 dark:text-red-400">LLM-анализ завершился с ошибкой</p>
      </Card>
    );
  }

  const hasPeriodSummary = llmPeriodSummary || llmPeriodConcerns?.length || llmPeriodRecommendations?.length;
  const hasWeeklySummaries = weeklyLlmSummaries.some(w => w.summary);

  if (!hasPeriodSummary && !hasWeeklySummaries) {
    return (
      <Card>
        <p className="text-sm text-gray-400 dark:text-gray-500">LLM-сводка недоступна</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period summary */}
      {hasPeriodSummary && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300">Сводка за период</h4>
            {llmPeriodScore !== null && (
              <span className="text-sm font-bold text-brand-400">Score: {llmPeriodScore}</span>
            )}
          </div>

          {llmPeriodSummary && (
            <p className="mb-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{llmPeriodSummary}</p>
          )}

          {llmPeriodConcerns && llmPeriodConcerns.length > 0 && (
            <div className="mb-3">
              {llmPeriodConcerns.map((item, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{item}</span>
                </div>
              ))}
            </div>
          )}

          {llmPeriodRecommendations && llmPeriodRecommendations.length > 0 && (
            <div>
              {llmPeriodRecommendations.map((item, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <Lightbulb size={14} className="mt-0.5 shrink-0 text-blue-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{item}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Weekly summaries accordion */}
      {hasWeeklySummaries && (
        <Card>
          <button
            type="button"
            onClick={() => setExpandedWeeks(!expandedWeeks)}
            className="flex w-full items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300"
          >
            <span>Понедельные сводки ({weeklyLlmSummaries.filter(w => w.summary).length})</span>
            {expandedWeeks ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandedWeeks && (
            <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-surface-border pt-3">
              {weeklyLlmSummaries
                .filter(w => w.summary)
                .map((week) => (
                  <div key={week.periodStart} className="rounded-lg bg-gray-50 dark:bg-surface-lighter p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{week.periodStart}</span>
                      {week.score !== null && (
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Score: {week.score}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{week.summary}</p>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
