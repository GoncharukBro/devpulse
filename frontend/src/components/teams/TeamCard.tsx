import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ArrowRight, MoreVertical, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import ScoreBadge from '@/components/metrics/ScoreBadge';
import TrendIndicator from '@/components/metrics/TrendIndicator';
import Sparkline from '@/components/charts/Sparkline';
import type { Team } from '@/types/team';

interface TeamCardProps {
  team: Team;
  onDelete?: (id: string, name: string) => void;
}

export default function TeamCard({ team, onDelete }: TeamCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <Card className="cursor-pointer transition-all hover:border-gray-400 dark:hover:border-gray-600">
      <div onClick={() => navigate(`/teams/${team.id}`)}>
        <div className="mb-4 flex items-start justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{team.name}</h3>
          <div className="flex items-center gap-2">
            {team.avgScore !== null && (
              <>
                <Sparkline data={team.scoreHistory} />
                <ScoreBadge score={team.avgScore} size="sm" />
                <TrendIndicator trend={team.scoreTrend} />
              </>
            )}
            {onDelete && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((v) => !v);
                  }}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-surface-lighter dark:hover:text-gray-300"
                  aria-label="Действия"
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-surface-border dark:bg-surface">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          onDelete(team.id, team.name);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                        Удалить
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
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
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400 dark:text-gray-500">Score</span>
              <span className="font-medium text-gray-600 dark:text-gray-300">{team.avgScore.toFixed(1)}</span>
            </div>
            {team.avgUtilization !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 dark:text-gray-500">Загрузка</span>
                <span className="font-medium text-gray-600 dark:text-gray-300">{team.avgUtilization.toFixed(1)}%</span>
              </div>
            )}
            {team.avgEstimationAccuracy !== null && team.avgEstimationAccuracy !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 dark:text-gray-500">Точность</span>
                <span className="font-medium text-gray-600 dark:text-gray-300">{team.avgEstimationAccuracy.toFixed(1)}%</span>
              </div>
            )}
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
