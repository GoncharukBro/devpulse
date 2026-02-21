import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  backLink?: { to: string; label: string };
}

export default function PageHeader({ title, description, actions, backLink }: PageHeaderProps) {
  return (
    <div className="mb-8">
      {backLink && (
        <Link
          to={backLink.to}
          className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-300"
        >
          <ArrowLeft size={14} />
          {backLink.label}
        </Link>
      )}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{title}</h1>
          {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
        </div>
        {actions && <div className="mt-3 flex gap-3 sm:mt-0">{actions}</div>}
      </div>
    </div>
  );
}
