import { CheckCircle, AlertTriangle, Lightbulb } from 'lucide-react';
import Card from '@/components/ui/Card';

interface LlmSummaryBlockProps {
  summary: string | null;
  achievements: string[] | null;
  concerns: string[] | null;
  recommendations: string[] | null;
  isProcessing?: boolean;
  loading?: boolean;
}

export default function LlmSummaryBlock({
  summary,
  achievements,
  concerns,
  recommendations,
  isProcessing,
  loading,
}: LlmSummaryBlockProps) {
  if (loading) {
    return (
      <Card>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-gray-700/50" />
          <div className="h-3 w-full rounded bg-gray-700/50" />
          <div className="h-3 w-3/4 rounded bg-gray-700/50" />
          <div className="h-3 w-5/6 rounded bg-gray-700/50" />
        </div>
      </Card>
    );
  }

  if (isProcessing) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 animate-pulse rounded-full bg-brand-500" />
          <span className="text-sm text-gray-400">Анализ в процессе...</span>
        </div>
      </Card>
    );
  }

  if (!summary && !achievements?.length && !concerns?.length && !recommendations?.length) {
    return (
      <Card>
        <p className="text-sm text-gray-500">LLM-анализ ещё не выполнен</p>
      </Card>
    );
  }

  return (
    <Card>
      <h4 className="mb-3 text-sm font-medium text-gray-300">LLM-сводка</h4>

      {summary && (
        <p className="mb-4 text-sm leading-relaxed text-gray-300">{summary}</p>
      )}

      {achievements && achievements.length > 0 && (
        <div className="mb-3">
          {achievements.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <CheckCircle size={14} className="mt-0.5 shrink-0 text-emerald-400" />
              <span className="text-sm text-gray-300">{item}</span>
            </div>
          ))}
        </div>
      )}

      {concerns && concerns.length > 0 && (
        <div className="mb-3">
          {concerns.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
              <span className="text-sm text-gray-300">{item}</span>
            </div>
          ))}
        </div>
      )}

      {recommendations && recommendations.length > 0 && (
        <div>
          {recommendations.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-blue-400" />
              <span className="text-sm text-gray-300">{item}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
