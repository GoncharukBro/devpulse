import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { TASK_CATEGORIES, TASK_CATEGORY_LABELS, type TaskCategory } from '@/types/subscription';
import type { FieldMapping } from '@/types/subscription';

interface FieldMappingEditorProps {
  value: FieldMapping;
  onChange: (mapping: FieldMapping) => void;
}

export default function FieldMappingEditor({ value, onChange }: FieldMappingEditorProps) {
  const [newTaskType, setNewTaskType] = useState('');

  const updateMapping = (partial: Partial<FieldMapping>) => {
    onChange({ ...value, ...partial });
  };

  const addTaskType = () => {
    const trimmed = newTaskType.trim();
    if (!trimmed || trimmed in value.taskTypeMapping) return;
    updateMapping({
      taskTypeMapping: { ...value.taskTypeMapping, [trimmed]: 'feature' },
    });
    setNewTaskType('');
  };

  const removeTaskType = (key: string) => {
    const copy = { ...value.taskTypeMapping };
    delete copy[key];
    updateMapping({ taskTypeMapping: copy });
  };

  const changeCategory = (key: string, category: string) => {
    updateMapping({
      taskTypeMapping: { ...value.taskTypeMapping, [key]: category },
    });
  };

  const addStatus = (field: 'cycleTimeStartStatuses' | 'cycleTimeEndStatuses' | 'releaseStatuses', status: string) => {
    const trimmed = status.trim();
    if (!trimmed || value[field].includes(trimmed)) return;
    updateMapping({ [field]: [...value[field], trimmed] });
  };

  const removeStatus = (field: 'cycleTimeStartStatuses' | 'cycleTimeEndStatuses' | 'releaseStatuses', index: number) => {
    updateMapping({ [field]: value[field].filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      {/* Task type mapping */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">Типы задач</label>
        <div className="space-y-2">
          {Object.entries(value.taskTypeMapping).map(([ytType, category]) => (
            <div key={ytType} className="flex items-center gap-2">
              <span className="w-40 truncate text-sm text-gray-400">{ytType}</span>
              <select
                value={category}
                onChange={(e) => changeCategory(ytType, e.target.value)}
                className="rounded-lg border border-surface-border bg-surface-lighter px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand-500"
              >
                {TASK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {TASK_CATEGORY_LABELS[cat as TaskCategory]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeTaskType(ytType)}
                className="rounded p-1 text-gray-500 hover:bg-surface-lighter hover:text-red-400"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTaskType}
              onChange={(e) => setNewTaskType(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTaskType()}
              placeholder="Значение YouTrack..."
              className="w-40 rounded-lg border border-surface-border bg-surface-lighter px-3 py-1.5 text-sm text-gray-200 placeholder:text-gray-600 outline-none focus:border-brand-500"
            />
            <Button variant="ghost" size="sm" onClick={addTaskType} leftIcon={<Plus size={14} />}>
              Добавить
            </Button>
          </div>
        </div>
      </div>

      {/* AI saving */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">ИИ-Экономия</label>
        <input
          type="text"
          value={value.aiSavingWorkType ?? ''}
          onChange={(e) => updateMapping({ aiSavingWorkType: e.target.value || null })}
          placeholder="Тип списания (например, AI Saving)"
          className="w-full rounded-lg border border-surface-border bg-surface-lighter px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 outline-none focus:border-brand-500"
        />
        <p className="mt-1 text-xs text-gray-600">Оставьте пустым, если метрика не используется</p>
      </div>

      {/* Cycle Time statuses */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">Cycle Time</label>
        <StatusTagList
          label="Начальные статусы"
          values={value.cycleTimeStartStatuses}
          onAdd={(s) => addStatus('cycleTimeStartStatuses', s)}
          onRemove={(i) => removeStatus('cycleTimeStartStatuses', i)}
        />
        <StatusTagList
          label="Конечные статусы"
          values={value.cycleTimeEndStatuses}
          onAdd={(s) => addStatus('cycleTimeEndStatuses', s)}
          onRemove={(i) => removeStatus('cycleTimeEndStatuses', i)}
        />
      </div>

      {/* Release statuses */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">Релизный статус</label>
        <StatusTagList
          label="Статусы"
          values={value.releaseStatuses}
          onAdd={(s) => addStatus('releaseStatuses', s)}
          onRemove={(i) => removeStatus('releaseStatuses', i)}
        />
        <p className="mt-1 text-xs text-gray-600">Если пусто — метрика не считается</p>
      </div>
    </div>
  );
}

function StatusTagList({
  label,
  values,
  onAdd,
  onRemove,
}: {
  label: string;
  values: string[];
  onAdd: (s: string) => void;
  onRemove: (i: number) => void;
}) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (input.trim()) {
      onAdd(input.trim());
      setInput('');
    }
  };

  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((v, i) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-md bg-surface-lighter px-2 py-1 text-xs text-gray-300"
          >
            {v}
            <button onClick={() => onRemove(i)} className="text-gray-500 hover:text-red-400">
              <X size={12} />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Добавить..."
            className="w-28 rounded-md border border-surface-border bg-surface-lighter px-2 py-1 text-xs text-gray-200 placeholder:text-gray-600 outline-none focus:border-brand-500"
          />
          <button
            onClick={handleAdd}
            className="rounded p-0.5 text-gray-500 hover:text-brand-400"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
