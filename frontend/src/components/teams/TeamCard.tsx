import { useNavigate } from 'react-router-dom';
import { Users, ArrowRight } from 'lucide-react';
import Card from '@/components/ui/Card';
import ScoreBadge from '@/components/metrics/ScoreBadge';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import type { Team } from '@/types/team';

interface TeamCardProps {
  team: Team;
}

export default function TeamCard({ team }: TeamCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="cursor-pointer transition-all hover:border-gray-400 dark:hover:border-gray-600">
      <div onClick={() => navigate(`/teams/${team.id}`)}>
        <div className="mb-4 flex items-start justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{team.name}</h3>
          {team.avgScore !== null && (
            <div className="flex items-center gap-2">
              <ScoreBadge score={team.avgScore} size="sm" />
              <TrendIndicator trend={team.scoreTrend} />
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          <Users size={14} />
          <span>
            {team.membersCount}{' '}
            {team.membersCount === 1
              ? 'участник'
              : team.membersCount < 5
                ? 'участника'
                : 'участников'}
          </span>
        </div>

        {team.avgScore !== null ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400 dark:text-gray-500">Score</span>
            <span className="font-medium text-gray-600 dark:text-gray-300">{team.avgScore.toFixed(1)}</span>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">Данные ещё не собраны</p>
        )}

        <div className="mt-4 flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300">
          Подробнее <ArrowRight size={12} />
        </div>
      </div>
    </Card>
  );
}
