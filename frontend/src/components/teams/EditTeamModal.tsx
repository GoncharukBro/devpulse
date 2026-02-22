import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { teamsApi } from '@/api/endpoints/teams';
import { reportsApi } from '@/api/endpoints/reports';
import type { TeamDetail, TeamMember } from '@/types/team';
import type { EmployeeListItem } from '@/types/reports';

interface EditTeamModalProps {
  open: boolean;
  team: TeamDetail | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditTeamModal({ open, team, onClose, onUpdated }: EditTeamModalProps) {
  const [name, setName] = useState('');
  const [currentMembers, setCurrentMembers] = useState<TeamMember[]>([]);
  const [removedLogins, setRemovedLogins] = useState<Set<string>>(new Set());
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [search, setSearch] = useState('');
  const [newMembers, setNewMembers] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && team) {
      setName(team.name);
      setCurrentMembers(team.members);
      setRemovedLogins(new Set());
      setShowAddMembers(false);
      setSearch('');
      setNewMembers(new Set());
    }
  }, [open, team]);

  const loadEmployees = useCallback(async () => {
    try {
      setLoadingEmployees(true);
      const result = await reportsApi.getEmployees();
      setEmployees(result);
    } catch {
      toast.error('Не удалось загрузить список сотрудников');
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  const handleShowAdd = () => {
    setShowAddMembers(true);
    loadEmployees();
  };

  const existingLogins = useMemo(() => {
    const set = new Set(currentMembers.map((m) => m.youtrackLogin));
    removedLogins.forEach((l) => set.delete(l));
    return set;
  }, [currentMembers, removedLogins]);

  const availableEmployees = useMemo(() => {
    let list = employees.filter(
      (e) => !existingLogins.has(e.youtrackLogin),
    );
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.displayName.toLowerCase().includes(q) ||
          e.youtrackLogin.toLowerCase().includes(q),
      );
    }
    return list;
  }, [employees, existingLogins, search]);

  const handleRemoveMember = (login: string) => {
    setRemovedLogins((prev) => new Set(prev).add(login));
  };

  const toggleNewMember = (login: string) => {
    setNewMembers((prev) => {
      const next = new Set(prev);
      if (next.has(login)) {
        next.delete(login);
      } else {
        next.add(login);
      }
      return next;
    });
  };

  const activeMembers = currentMembers.filter(
    (m) => !removedLogins.has(m.youtrackLogin),
  );
  const isValid = name.trim().length > 0 && (activeMembers.length + newMembers.size) > 0;

  const handleSubmit = async () => {
    if (!isValid || !team) return;
    setSubmitting(true);
    try {
      const tasks: Promise<unknown>[] = [];

      if (name.trim() !== team.name) {
        tasks.push(teamsApi.update(team.id, { name: name.trim() }));
      }

      if (newMembers.size > 0) {
        tasks.push(teamsApi.addMembers(team.id, [...newMembers]));
      }

      for (const login of removedLogins) {
        tasks.push(teamsApi.removeMember(team.id, login));
      }

      await Promise.all(tasks);
      toast.success('Команда обновлена');
      onUpdated();
      onClose();
    } catch {
      // Error toast shown by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Редактировать команду"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={submitting}
            disabled={!isValid}
            onClick={handleSubmit}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">Название</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-300">
            Участники ({activeMembers.length + newMembers.size})
          </label>
          <div className="space-y-1">
            {activeMembers.map((m) => (
              <div
                key={m.youtrackLogin}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-surface-lighter"
              >
                <div>
                  <span className="text-gray-700 dark:text-gray-200">{m.displayName}</span>
                  <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">({m.youtrackLogin})</span>
                </div>
                <button
                  onClick={() => handleRemoveMember(m.youtrackLogin)}
                  className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {!showAddMembers ? (
            <button
              onClick={handleShowAdd}
              className="mt-2 text-xs font-medium text-brand-400 hover:text-brand-300"
            >
              + Добавить участников
            </button>
          ) : (
            <div className="mt-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по имени или логину..."
                className="mb-2 w-full rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500"
              />
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-surface-border">
                {loadingEmployees ? (
                  <div className="animate-pulse space-y-2 p-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-6 w-full rounded bg-gray-200 dark:bg-gray-700/50" />
                    ))}
                  </div>
                ) : availableEmployees.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                    {search ? 'Ничего не найдено' : 'Нет доступных сотрудников'}
                  </div>
                ) : (
                  availableEmployees.map((emp) => (
                    <label
                      key={emp.youtrackLogin}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-gray-100 dark:hover:bg-surface-lighter"
                    >
                      <input
                        type="checkbox"
                        checked={newMembers.has(emp.youtrackLogin)}
                        onChange={() => toggleNewMember(emp.youtrackLogin)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-surface-lighter text-brand-500 focus:ring-brand-500"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-gray-700 dark:text-gray-200">{emp.displayName}</span>
                        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">({emp.youtrackLogin})</span>
                        {emp.projects.length > 0 && (
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                            — {emp.projects.join(', ')}
                          </span>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
              {newMembers.size > 0 && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Новых: {newMembers.size}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
