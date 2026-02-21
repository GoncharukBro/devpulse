import { Bot } from 'lucide-react';
import type { LlmQueueItem } from '@/types/collection';

interface LlmQueueIndicatorProps {
  items: LlmQueueItem[];
}

export default function LlmQueueIndicator({ items }: LlmQueueIndicatorProps) {
  const processing = items.filter((i) => i.status === 'processing');
  const pending = items.filter((i) => i.status !== 'processing');

  return (
    <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-light px-4 py-2.5 text-sm">
      <Bot size={16} className="text-purple-400" />
      {items.length === 0 ? (
        <span className="text-gray-500">LLM-анализ: очередь пуста</span>
      ) : (
        <span className="text-gray-300">
          LLM-анализ: {pending.length > 0 && <>{pending.length} в очереди</>}
          {processing.length > 0 && (
            <>
              {pending.length > 0 && ', '}
              обрабатывается {processing.length}
            </>
          )}
        </span>
      )}
    </div>
  );
}
