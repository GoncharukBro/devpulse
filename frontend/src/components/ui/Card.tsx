import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}

export default function Card({ children, className = '', noPadding, header, footer }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-surface-border bg-surface transition-colors ${className}`}
    >
      {header && (
        <div className="border-b border-surface-border px-6 py-4">{header}</div>
      )}
      <div className={noPadding ? '' : 'p-6'}>{children}</div>
      {footer && (
        <div className="border-t border-surface-border px-6 py-4">{footer}</div>
      )}
    </div>
  );
}
