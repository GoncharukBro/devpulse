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
      className={`rounded-xl border border-gray-200 dark:border-surface-border bg-white shadow-sm dark:shadow-none dark:bg-surface transition-colors ${className}`}
    >
      {header && (
        <div className="border-b border-gray-200 dark:border-surface-border px-6 py-4">{header}</div>
      )}
      <div className={noPadding ? '' : 'p-6'}>{children}</div>
      {footer && (
        <div className="border-t border-gray-200 dark:border-surface-border px-6 py-4">{footer}</div>
      )}
    </div>
  );
}
