import { useNavigate } from 'react-router-dom';
import Card from '@/components/ui/Card';
import ScoreBadge from '@/components/metrics/ScoreBadge';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import { getMetricLevel, LEVEL_COLORS } from '@/hooks/useMetricColor';
import type { TeamMember } from '@/types/team';

interface TeamMembersListProps {
  members: TeamMember[];
  loading?: boolean;
  navState?: Record<string, string>;
}

export default function TeamMembersList({ members, loading, navState }: TeamMembersListProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card noPadding>
        <div className="animate-pulse p-4">
          <div className="mb-3 h-4 w-40 rounded bg-gray-200 dark:bg-gray-700/50" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="mb-2 h-10 w-full rounded bg-gray-200 dark:bg-gray-700/50" />
          ))}
        </div>
      </Card>
    );
  }

  if (!members.length) {
    return (
      <Card>
        <p className="text-center text-sm text-gray-400 dark:text-gray-500">Нет участников</p>
      </Card>
    );
  }

  return (
    <Card noPadding>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-surface-border">
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Имя</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Score</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Загрузка</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Проекты</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500">Тренд</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const utilLevel = getMetricLevel('utilization', m.lastUtilization);
              const utilColors = LEVEL_COLORS[utilLevel];
              return (
                <tr
                  key={m.youtrackLogin}
                  onClick={() => navigate(`/employees/${m.youtrackLogin}`, { state: navState })}
                  className="cursor-pointer border-b border-gray-200 dark:border-surface-border transition-colors hover:bg-gray-100/50 dark:hover:bg-surface-lighter/50 last:border-b-0"
                >
                  <td className="px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                    {m.displayName}
                  </td>
                  <td className="px-3 py-3">
                    <ScoreBadge score={m.lastScore} />
                  </td>
                  <td className={`px-3 py-3 text-sm ${utilColors.text}`}>
                    {m.lastUtilization !== null ? `${m.lastUtilization.toFixed(1)}%` : 'Н/Д'}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {m.projects.length > 0 ? m.projects.join(', ') : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <TrendIndicator trend={m.scoreTrend} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
