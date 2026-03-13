import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backLink?: { to: string; label: string };
  /** Content rendered on the same line as the back link (right-aligned) */
  topRight?: ReactNode;
}

export default function PageHeader({ title, description, actions, backLink, topRight }: PageHeaderProps) {
  return (
    <div className="mb-8">
      {backLink && (
        <div className="mb-3 flex items-center justify-between">
          <Link
            to={backLink.to}
            className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
          >
            <ArrowLeft size={14} />
            {backLink.label}
          </Link>
          {topRight}
        </div>
      )}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
          {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
        {actions && <div className="mt-3 flex gap-3 sm:mt-0">{actions}</div>}
      </div>
    </div>
  );
}
