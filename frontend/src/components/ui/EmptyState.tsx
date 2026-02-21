import type { ElementType } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';

interface EmptyStateProps {
  icon: ElementType;
  title: string;
  description: string;
  action?: {
    label: string;
    to: string;
  };
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface/50 px-6 py-16 text-center">
      <div className="mb-4 rounded-full bg-surface-lighter p-4">
        <Icon size={32} className="text-gray-500" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-gray-300">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-gray-500">{description}</p>
      {action && (
        <Link to={action.to}>
          <Button variant="primary" size="sm">
            {action.label}
          </Button>
        </Link>
      )}
    </div>
  );
}
