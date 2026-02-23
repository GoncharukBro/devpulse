import { Info } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface InfoTooltipProps {
  title: string;
  lines: string[];
}

export default function InfoTooltip({ title, lines }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !tooltipRef.current || !triggerRef.current) return;
    const tooltip = tooltipRef.current;
    const triggerRect = triggerRef.current.getBoundingClientRect();

    if (triggerRect.bottom + tooltip.offsetHeight + 8 > window.innerHeight) {
      setPosition('top');
    } else {
      setPosition('bottom');
    }

    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = 'auto';
      tooltip.style.right = '0';
    }
  }, [visible]);

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
      <Info size={14} className="cursor-help text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" />
      {visible && (
        <div
          ref={tooltipRef}
          className={`absolute z-50 w-72 rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-gray-800 p-3 shadow-xl ${posClass}`}
        >
          <div className="mb-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
          <div className="space-y-1">
            {lines.map((line, i) => (
              <p key={i} className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line">{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
