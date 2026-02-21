import { Info } from 'lucide-react';
import { useState, useRef, useEffect, type ReactNode } from 'react';

interface MetricTooltipData {
  title: string;
  source: string;
  description: string;
  calculation: string;
  interpretation: string;
}

const METRIC_TOOLTIPS: Record<string, MetricTooltipData> = {
  score: {
    title: 'Оценка продуктивности',
    source: 'LLM-анализ / формульный расчёт',
    description: 'Общая оценка продуктивности сотрудника на основе всех метрик',
    calculation: 'Взвешенная оценка от LLM или формульный расчёт (fallback)',
    interpretation: '80-100 — отлично, 60-79 — хорошо, 40-59 — средне, <40 — требует внимания',
  },
  utilization: {
    title: 'Загрузка',
    source: 'YouTrack (work items)',
    description: 'Насколько загружен сотрудник относительно стандартной 40-часовой недели',
    calculation: '(Списанное время / 40 часов) x 100%',
    interpretation: '60-100% — норма, >100% — переработка, <60% — недозагрузка',
  },
  estimationAccuracy: {
    title: 'Точность оценок',
    source: 'YouTrack (estimation + work items)',
    description: 'Насколько точно сотрудник оценивает задачи',
    calculation: 'min(оценка, факт) / max(оценка, факт) x 100%',
    interpretation: '>75% — точные оценки, 55-75% — приемлемо, <55% — нужно улучшить',
  },
  focus: {
    title: 'Фокус',
    source: 'Вычисляемая (YouTrack)',
    description: 'Доля продуктовой работы (features, техдолг, документация) в общем времени',
    calculation: '(feature + techDebt + docs время) / общее время x 100%',
    interpretation: '>65% — хороший фокус, 45-65% — приемлемо, <45% — много отвлечений',
  },
  completionRate: {
    title: 'Скорость закрытия',
    source: 'YouTrack (issues)',
    description: 'Процент завершённых задач от общего количества',
    calculation: 'Завершённые / Всего x 100%',
    interpretation: '>70% — эффективно, 50-70% — нормально, <50% — много открытых задач',
  },
  avgCycleTimeHours: {
    title: 'Средний Cycle Time',
    source: 'YouTrack (история статусов)',
    description: 'Среднее время от начала работы до закрытия задачи',
    calculation: 'Среднее время от статуса "В работе" до статуса "Готово"',
    interpretation: '<48ч — быстро, 48-96ч — нормально, >96ч — медленно',
  },
};

interface MetricTooltipProps {
  metric: string;
  children?: ReactNode;
}

export default function MetricTooltip({ metric, children }: MetricTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const data = METRIC_TOOLTIPS[metric];

  useEffect(() => {
    if (!visible || !tooltipRef.current || !triggerRef.current) return;
    const tooltip = tooltipRef.current;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    // Vertical: prefer bottom, fall back to top if not enough space below
    if (triggerRect.bottom + tooltipRect.height + 8 > window.innerHeight) {
      setPosition('top');
    } else {
      setPosition('bottom');
    }

    // Horizontal: keep within viewport
    if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = 'auto';
      tooltip.style.right = '0';
    }
  }, [visible]);

  if (!data) return <>{children}</>;

  const posClass = position === 'top'
    ? 'bottom-full left-0 mb-2'
    : 'top-full left-0 mt-2';

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children ?? (
        <Info size={14} className="cursor-help text-gray-500 hover:text-gray-300 transition-colors" />
      )}
      {visible && (
        <div
          ref={tooltipRef}
          className={`absolute z-50 w-72 rounded-lg border border-surface-border bg-gray-800 p-3 shadow-xl ${posClass}`}
        >
          <div className="mb-1.5 text-sm font-semibold text-gray-100">{data.title}</div>
          <div className="mb-2 text-xs text-gray-400">Источник: {data.source}</div>
          <p className="mb-2 text-xs text-gray-300">{data.description}</p>
          <div className="mb-2 rounded bg-gray-900/50 px-2 py-1.5 text-xs text-gray-300">
            <span className="text-gray-500">Формула: </span>
            {data.calculation}
          </div>
          <div className="text-xs text-gray-400">{data.interpretation}</div>
        </div>
      )}
    </div>
  );
}
