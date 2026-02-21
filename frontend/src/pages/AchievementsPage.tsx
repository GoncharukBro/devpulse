import { Trophy } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

export default function AchievementsPage() {
  return (
    <>
      <PageHeader title="Ачивки" description="Галерея достижений сотрудников" />
      <EmptyState
        icon={Trophy}
        title="Пока нет ачивок"
        description="Они появятся автоматически после сбора метрик по проектам"
      />
    </>
  );
}
