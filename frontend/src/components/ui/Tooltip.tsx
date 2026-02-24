import { type ReactNode, useState, useId } from 'react';

type Position = 'top' | 'bottom' | 'left' | 'right';

const positionStyles: Record<Position, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

interface TooltipProps {
  content: string;
  position?: Position;
  children: ReactNode;
}

export default function Tooltip({ content, position = 'top', children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      {visible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute z-50 max-w-xs rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-100 shadow-lg ${positionStyles[position]}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
