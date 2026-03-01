import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import type { ConcernItem, OverviewConcernItem } from '@/types/reports';

const INITIAL_SHOW = 5;

interface ConcernsListProps {
  concerns: (ConcernItem | OverviewConcernItem)[];
  loading?: boolean;
}

interface GroupedConcern {
  youtrackLogin: string;
  displayName: string;
  projectName?: string;
  severity: 'warning' | 'danger';
  reasons: string[];
}

function groupConcerns(concerns: (ConcernItem | OverviewConcernItem)[]): GroupedConcern[] {
  const map = new Map<string, GroupedConcern>();

  for (const c of concerns) {
    const projectName = 'projectName' in c ? c.projectName : undefined;
    const key = `${c.youtrackLogin}:${projectName ?? ''}`;

    const existing = map.get(key);
    if (existing) {
      existing.reasons.push(c.reason);
      if (c.severity === 'danger') {
        existing.severity = 'danger';
      }
    } else {
      map.set(key, {
        youtrackLogin: c.youtrackLogin,
        displayName: c.displayName,
        projectName,
        severity: c.severity,
        reasons: [c.reason],
      });
    }
  }

  return Array.from(map.values());
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

export default function ConcernsList({ concerns, loading }: ConcernsListProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  // Reset expanded when concerns change (e.g. project/period switch)
  useEffect(() => { setExpanded(false); }, [concerns]);

  const grouped = useMemo(() => {
    const items = groupConcerns(concerns);
    // danger first, then warning
    return items.sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === 'danger' ? -1 : 1;
    });
  }, [concerns]);

  const hasMore = grouped.length > INITIAL_SHOW;
  const visible = expanded ? grouped : grouped.slice(0, INITIAL_SHOW);

  if (loading) {
    return (
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <div className="h-5 w-5 animate-pulse rounded bg-gray-200 dark:bg-gray-700/50" />
          <div className="h-5 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700/50" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border border-gray-200 p-3 dark:border-surface-border"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700/50" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700/50" />
                  <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700/50" />
                </div>
              </div>
              <div className="mt-2 space-y-1">
                <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700/50" />
                <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700/50" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!concerns.length) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <AlertTriangle size={16} />
          <span className="text-sm font-medium">Обратите внимание</span>
        </div>
        <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">Нет активных предупреждений</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2 text-gray-600 dark:text-gray-300">
        <AlertTriangle size={16} className="text-amber-400" />
        <span className="text-sm font-medium">
          Обратите внимание
          <span className="ml-1 text-gray-400 dark:text-gray-500">({grouped.length})</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((g) => (
          <button
            key={`${g.youtrackLogin}:${g.projectName ?? ''}`}
            onClick={() => navigate(`/employees/${g.youtrackLogin}`)}
            aria-label={`Перейти к профилю ${g.displayName}`}
            className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-surface-border dark:hover:bg-surface-lighter"
          >
            {/* Avatar */}
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-sm font-semibold text-brand-400">
              {getInitial(g.displayName)}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                  {g.displayName}
                </span>
                {/* Severity dot */}
                <span
                  className={`flex-shrink-0 text-xs ${
                    g.severity === 'danger' ? 'text-red-400' : 'text-amber-400'
                  }`}
                >
                  ●
                </span>
              </div>

              {g.projectName && (
                <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                  {g.projectName}
                </p>
              )}

              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                {g.reasons.join(' · ')}
              </p>
            </div>
          </button>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-surface-lighter dark:hover:text-gray-300"
        >
          {expanded ? (
            <>
              Свернуть <ChevronUp size={14} />
            </>
          ) : (
            <>
              Показать все ({grouped.length}) <ChevronDown size={14} />
            </>
          )}
        </button>
      )}
    </Card>
  );
}
