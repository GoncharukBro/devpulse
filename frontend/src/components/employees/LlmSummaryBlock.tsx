import { useState, useRef, useEffect } from 'react';
import { CheckCircle, AlertTriangle, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import MetricTooltip from '@/components/metrics/MetricTooltip';
import { useMetricColor } from '@/hooks/useMetricColor';
import type { ScoreTrend } from '@/types/reports';

interface LlmSummaryBlockProps {
  summary: string | null;
  achievements: string[] | null;
  concerns: string[] | null;
  recommendations: string[] | null;
  isProcessing?: boolean;
  loading?: boolean;
  llmStatus?: string;
  hasNoData?: boolean;
  score?: number | null;
  scoreTrend?: ScoreTrend;
  scoreDelta?: number | null;
}

export default function LlmSummaryBlock({
  summary,
  achievements,
  concerns,
  recommendations,
  isProcessing,
  loading,
  llmStatus,
  hasNoData,
  score,
  scoreTrend,
  scoreDelta,
}: LlmSummaryBlockProps) {
  const { colors: scoreColors } = useMetricColor('score', score ?? null);
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      setIsOverflowing(contentRef.current.scrollHeight > 400);
    }
  }, [summary, achievements, concerns, recommendations]);

  if (loading) {
    return (
      <Card>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700/50" />
          <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700/50" />
          <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700/50" />
          <div className="h-3 w-5/6 rounded bg-gray-200 dark:bg-gray-700/50" />
        </div>
      </Card>
    );
  }

  if (isProcessing) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 animate-pulse rounded-full bg-brand-500" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Анализ в процессе...</span>
        </div>
      </Card>
    );
  }

  if (!summary && !achievements?.length && !concerns?.length && !recommendations?.length) {
    let message = 'LLM-анализ ещё не выполнен';
    if (hasNoData) {
      message = 'Нет данных для анализа за этот период. Проверьте настройки маппинга полей проекта.';
    } else if (llmStatus === 'failed') {
      message = 'LLM-анализ не выполнен. Метрики доступны в карточках выше.';
    } else if (llmStatus === 'no_data' || llmStatus === 'skipped') {
      message = 'Нет данных для анализа за этот период.';
    }
    return (
      <Card>
        <p className="text-sm text-gray-400 dark:text-gray-500">{message}</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300">LLM-сводка</h4>
          <MetricTooltip metric="score" />
        </div>
        {score != null && (
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${scoreColors.text}`}>{Math.round(score)}</span>
            <TrendIndicator
              trend={scoreTrend ?? null}
              value={scoreDelta != null ? `${scoreDelta > 0 ? '+' : ''}${Number.isInteger(scoreDelta) ? scoreDelta : scoreDelta.toFixed(1)}` : null}
            />
          </div>
        )}
      </div>

      <div className="relative">
        <div
          ref={contentRef}
          className={
            !expanded && isOverflowing ? 'max-h-[350px] overflow-hidden' : undefined
          }
        >
          {summary && (
            <p className="mb-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{summary}</p>
          )}

          {achievements && achievements.length > 0 && (
            <div className="mb-3">
              {achievements.map((item, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <CheckCircle size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{item}</span>
                </div>
              ))}
            </div>
          )}

          {concerns && concerns.length > 0 && (
            <div className="mb-3">
              {concerns.map((item, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{item}</span>
                </div>
              ))}
            </div>
          )}

          {recommendations && recommendations.length > 0 && (
            <div>
              {recommendations.map((item, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <Lightbulb size={14} className="mt-0.5 shrink-0 text-blue-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {!expanded && isOverflowing && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-surface" />
        )}
      </div>

      {isOverflowing && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-sm font-medium text-brand-400 transition-colors hover:text-brand-300"
        >
          {expanded ? (
            <>
              Свернуть
              <ChevronUp size={14} />
            </>
          ) : (
            <>
              Читать полностью
              <ChevronDown size={14} />
            </>
          )}
        </button>
      )}
    </Card>
  );
}
