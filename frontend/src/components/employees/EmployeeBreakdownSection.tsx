import Card from '@/components/ui/Card';
import IssuesByTypeChart from '@/components/metrics/IssuesByTypeChart';
import SpentByTypeChart from '@/components/metrics/SpentByTypeChart';
import InfoTooltip from '@/components/metrics/InfoTooltip';
import type { EmployeeReportDTO } from '@/types/reports';

interface EmployeeBreakdownSectionProps {
  report: EmployeeReportDTO;
}

export default function EmployeeBreakdownSection({ report }: EmployeeBreakdownSectionProps) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Разбивка по типам задач</h3>
          <InfoTooltip
            title="Разбивка по типам задач"
            lines={[
              'Распределение задач сотрудника по категориям за выбранный период.',
              'Фичи, баги, техдолг, поддержка, документация, code review и прочее.',
              'Помогает оценить, на что уходит основное рабочее время.',
            ]}
          />
        </div>
        <IssuesByTypeChart data={report.issuesByType} />
      </Card>
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Списание по типам</h3>
          <InfoTooltip
            title="Списание по типам"
            lines={[
              'Сколько часов списано на каждый тип задач за выбранный период.',
              'Данные из YouTrack (work items), сгруппированные по категориям.',
              'Позволяет увидеть реальное распределение времени сотрудника.',
            ]}
          />
        </div>
        <SpentByTypeChart data={report.spentByType} />
      </Card>
    </div>
  );
}
