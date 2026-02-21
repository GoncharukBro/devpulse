import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

export default function TeamPage() {
  const { id } = useParams();

  return (
    <>
      <PageHeader title={`Команда #${id}`} description="Сводка по команде" />
      <EmptyState
        icon={Users}
        title="Данные по команде не найдены"
        description="Информация о команде ещё не загружена или команда не существует"
      />
    </>
  );
}
