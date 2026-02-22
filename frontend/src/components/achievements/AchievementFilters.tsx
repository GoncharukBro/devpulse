interface AchievementFiltersProps {
  employees: string[];
  types: string[];
  projects: string[];
  selectedEmployee: string;
  selectedType: string;
  selectedProject: string;
  onEmployeeChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onProjectChange: (value: string) => void;
}

export default function AchievementFilters({
  employees,
  types,
  projects,
  selectedEmployee,
  selectedType,
  selectedProject,
  onEmployeeChange,
  onTypeChange,
  onProjectChange,
}: AchievementFiltersProps) {
  const selectClass =
    'rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500';

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <select
        value={selectedEmployee}
        onChange={(e) => onEmployeeChange(e.target.value)}
        className={selectClass}
      >
        <option value="">Все сотрудники</option>
        {employees.map((e) => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>

      <select
        value={selectedType}
        onChange={(e) => onTypeChange(e.target.value)}
        className={selectClass}
      >
        <option value="">Все типы</option>
        {types.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <select
        value={selectedProject}
        onChange={(e) => onProjectChange(e.target.value)}
        className={selectClass}
      >
        <option value="">Все проекты</option>
        {projects.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}
