import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import CopyButton from '@/components/shared/CopyButton';
import MethodologyLink from '@/components/shared/MethodologyLink';
import Button from '@/components/ui/Button';
import { formatPeriod } from '@/utils/format';
import type { EmployeeSummaryDTO } from '@/types/reports';

interface EmployeeHeaderProps {
  summary: EmployeeSummaryDTO | null;
  login: string | undefined;
  backTo: string;
  backLabel: string;
  reportPeriod: { start: string; end: string } | null;
  getCopyText: () => string;
  onEmailClick: () => void;
}

export default function EmployeeHeader({
  summary,
  login,
  backTo,
  backLabel,
  reportPeriod,
  getCopyText,
  onEmailClick,
}: EmployeeHeaderProps) {
  const initial = summary?.displayName?.charAt(0).toUpperCase() ?? '?';

  return (
    <>
      {/* Back link + methodology */}
      <div className="mb-3 flex items-center justify-between">
        <Link to={backTo} className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 transition-colors hover:text-gray-600 dark:hover:text-gray-300">
          <ArrowLeft size={14} />
          {backLabel}
        </Link>
        <MethodologyLink />
      </div>

      {/* Header with avatar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xl font-bold text-brand-400">
            {initial}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary?.displayName ?? 'Загрузка...'}</h1>
            <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {login}
              {summary?.email && <span> &bull; {summary.email}</span>}
            </div>
            <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Цифровой профиль — загрузка, качество, динамика и AI-анализ
            </div>
            {summary && summary.projects.length > 0 && (
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Проекты: {summary.projects.map((p) => p.projectName).join(', ')}
              </div>
            )}
            {reportPeriod && (
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Показатели за неделю: {formatPeriod(reportPeriod.start, reportPeriod.end)}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton getText={getCopyText} />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Mail size={14} />}
            onClick={onEmailClick}
          >
            На почту
          </Button>
        </div>
      </div>
    </>
  );
}
