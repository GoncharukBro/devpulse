import { TASK_CATEGORIES } from '@/types/subscription';

export function getCategoryLabel(key: string): string {
  return TASK_CATEGORIES.find(c => c.key === key)?.labelRu ?? key;
}

export function getCategoryColor(key: string): string {
  return TASK_CATEGORIES.find(c => c.key === key)?.color ?? '#6b7280';
}
