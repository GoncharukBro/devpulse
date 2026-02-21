import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { teamsApi } from '@/api/endpoints/teams';
import { reportsApi } from '@/api/endpoints/reports';
import type { EmployeeListItem } from '@/types/reports';

interface CreateTeamModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateTeamModal({ open, onClose, onCreated }: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (open) {
      setName('');
      setSearch('');
      setSelected(new Set());
      loadEmployees();
    }
  }, [open, loadEmployees]);

  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        e.displayName.toLowerCase().includes(q) ||
        e.youtrackLogin.toLowerCase().includes(q),
    );
  }, [employees, search]);

  const toggleEmployee = (login: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(login)) {
        next.delete(login);
      } else {
        next.add(login);
      }
      return next;
    });
  };

  const isValid = name.trim().length > 0 && selected.size > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      await teamsApi.create({ name: name.trim(), members: [...selected] });
      toast.success('Команда создана');
      onCreated();
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
      title="Создать команду"
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
            Создать
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Название</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введите название команды"
            className="w-full rounded-lg border border-surface-border bg-surface-lighter px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Сотрудники</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или логину..."
            className="mb-2 w-full rounded-lg border border-surface-border bg-surface-lighter px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-500"
          />

          <div className="max-h-60 overflow-y-auto rounded-lg border border-surface-border">
            {loadingEmployees ? (
              <div className="animate-pulse space-y-2 p-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-6 w-full rounded bg-gray-700/50" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                {search ? 'Ничего не найдено' : 'Нет сотрудников'}
              </div>
            ) : (
              filtered.map((emp) => (
                <label
                  key={emp.youtrackLogin}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-lighter"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(emp.youtrackLogin)}
                    onChange={() => toggleEmployee(emp.youtrackLogin)}
                    className="h-4 w-4 rounded border-gray-600 bg-surface-lighter text-brand-500 focus:ring-brand-500"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-gray-200">{emp.displayName}</span>
                    <span className="ml-1 text-xs text-gray-500">({emp.youtrackLogin})</span>
                    {emp.projects.length > 0 && (
                      <span className="ml-2 text-xs text-gray-500">
                        — {emp.projects.join(', ')}
                      </span>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>

          {selected.size > 0 && (
            <div className="mt-2 text-xs text-gray-400">
              Выбрано: {selected.size}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
