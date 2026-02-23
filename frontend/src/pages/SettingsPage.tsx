import { Palette, Link2, Info } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import ThemeSelector from '@/components/settings/ThemeSelector';
import IntegrationStatus from '@/components/settings/IntegrationStatus';
import AboutSection from '@/components/settings/AboutSection';
import { usePageTitle } from '@/hooks/usePageTitle';

function SectionTitle({ icon: Icon, title }: { icon: typeof Palette; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={16} className="text-gray-500 dark:text-gray-400" />
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
    </div>
  );
}

export default function SettingsPage() {
  usePageTitle('Настройки');

  return (
    <>
      <PageHeader title="Настройки" description="Конфигурация и информация" />
      <div className="space-y-6">
        <Card header={<SectionTitle icon={Palette} title="Персонализация" />}>
          <ThemeSelector />
        </Card>

        <Card header={<SectionTitle icon={Link2} title="Интеграции" />}>
          <IntegrationStatus />
        </Card>

        <Card header={<SectionTitle icon={Info} title="О приложении" />}>
          <AboutSection />
        </Card>
      </div>
    </>
  );
}
