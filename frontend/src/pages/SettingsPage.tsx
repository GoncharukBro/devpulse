import { Settings } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Настройки" description="Конфигурация системы" />
      <Card>
        <div className="flex flex-col items-center py-8 text-center">
          <div className="mb-4 rounded-full bg-surface-lighter p-4">
            <Settings size={32} className="text-gray-500" />
          </div>
          <p className="text-sm text-gray-500">
            Раздел настроек находится в разработке
          </p>
        </div>
      </Card>
    </>
  );
}
