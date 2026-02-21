import { Users } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

export default function TeamsListPage() {
  return (
    <>
      <PageHeader title="Команды" description="Ваши команды и их показатели" />
      <EmptyState
        icon={Users}
        title="У вас пока нет команд"
        description="Создайте первую команду, чтобы объединить сотрудников и отслеживать показатели"
        action={{ label: 'Создать команду', to: '/teams' }}
      />
    </>
  );
}
