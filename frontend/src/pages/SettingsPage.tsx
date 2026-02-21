import PageHeader from '@/components/ui/PageHeader';
import LlmSettings from '@/components/settings/LlmSettings';
import EmailSettings from '@/components/settings/EmailSettings';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function SettingsPage() {
  usePageTitle('Настройки');
  return (
    <>
      <PageHeader title="Настройки" description="Конфигурация системы" />
      <div className="space-y-6">
        <LlmSettings />
        <EmailSettings />
      </div>
    </>
  );
}
