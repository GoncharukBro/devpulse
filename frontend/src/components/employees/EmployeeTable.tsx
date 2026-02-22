import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import Card from '@/components/ui/Card';
import EmployeeRow from './EmployeeRow';
import type { ProjectEmployeeRow } from '@/types/reports';

interface EmployeeTableProps {
  employees: ProjectEmployeeRow[];
  loading?: boolean;
}

type SortKey = 'displayName' | 'score' | 'utilization';
type SortDir = 'asc' | 'desc';

const COLUMNS = [
  { key: 'displayName' as SortKey, label: 'Имя' },
  { key: 'score' as SortKey, label: 'Score' },
  { key: 'utilization' as SortKey, label: 'Загрузка' },
  { key: null, label: 'Точность' },
  { key: null, label: 'Закрыто' },
  { key: null, label: 'Тренд' },
  { key: null, label: '' },
];

export default function EmployeeTable({ employees, loading }: EmployeeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(key: SortKey | null) {
    if (!key) return;
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...employees].sort((a, b) => {
    let aVal: string | number | null;
    let bVal: string | number | null;

    switch (sortKey) {
      case 'displayName':
        aVal = a.displayName;
        bVal = b.displayName;
        break;
      case 'score':
        aVal = a.score;
        bVal = b.score;
        break;
      case 'utilization':
        aVal = a.utilization;
        bVal = b.utilization;
        break;
    }

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    return sortDir === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

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

  if (!employees.length) {
    return (
      <Card>
        <p className="text-center text-sm text-gray-400 dark:text-gray-500">Нет данных по сотрудникам</p>
      </Card>
    );
  }

  return (
    <Card noPadding>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-surface-border">
              {COLUMNS.map((col, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-3 text-left text-xs font-medium uppercase text-gray-400 dark:text-gray-500 ${col.key ? 'cursor-pointer select-none hover:text-gray-600 dark:hover:text-gray-300' : ''}`}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.key && sortKey === col.key && (
                      sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((emp) => (
              <EmployeeRow key={emp.youtrackLogin} employee={emp} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
