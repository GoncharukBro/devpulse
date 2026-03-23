import type { SubscriptionRole } from '@/types/subscription';

const ROLE_STYLES: Record<Exclude<SubscriptionRole, 'owner'>, { className: string; label: string }> = {
  viewer: {
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    label: 'Просмотр',
  },
  editor: {
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    label: 'Редактор',
  },
};

interface SharedBadgeProps {
  role?: Exclude<SubscriptionRole, 'owner'>;
}

export default function SharedBadge({ role = 'viewer' }: SharedBadgeProps) {
  const style = ROLE_STYLES[role];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}
