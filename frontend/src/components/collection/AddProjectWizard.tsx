import { useState, useEffect, useCallback } from 'react';
import { Search, Check, ChevronRight, ChevronLeft, Users, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import FieldMappingEditor from './FieldMappingEditor';
import { youtrackApi } from '@/api/endpoints/youtrack';
import { subscriptionsApi } from '@/api/endpoints/subscriptions';
import type { YouTrackInstance, YouTrackProject, YouTrackUser } from '@/types/youtrack';
import type { FieldMapping, CreateSubscriptionDto, Subscription } from '@/types/subscription';

interface AddProjectWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  existingSubscriptions?: Subscription[];
}

const STEPS = [
  'Инстанс YouTrack',
  'Проект',
  'Сотрудники',
  'Маппинг полей',
  'Подтверждение',
] as const;

const DEFAULT_FIELD_MAPPING: FieldMapping = {
  taskTypeMapping: {
    Feature: 'feature',
    Bug: 'bugfix',
    Task: 'feature',
    Epic: 'feature',
    'User Story': 'feature',
    'Tech Debt': 'techDebt',
    Documentation: 'documentation',
    'Code Review': 'codeReview',
  },
  typeFieldName: 'Type',
  cycleTimeStartStatuses: ['In Progress'],
  cycleTimeEndStatuses: ['Done'],
  releaseStatuses: [],
};

export default function AddProjectWizard({ open, onClose, onCreated, existingSubscriptions = [] }: AddProjectWizardProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Step 1: Instances
  const [instances, setInstances] = useState<YouTrackInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<YouTrackInstance | null>(null);

  // Step 2: Projects
  const [projects, setProjects] = useState<YouTrackProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<YouTrackProject | null>(null);
  const [projectSearch, setProjectSearch] = useState('');

  // Step 3: Members
  const [members, setMembers] = useState<YouTrackUser[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  // Step 4: Field mapping
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({ ...DEFAULT_FIELD_MAPPING });
  const [useCustomMapping, setUseCustomMapping] = useState(false);

  // Load instances on open
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSelectedInstance(null);
    setSelectedProject(null);
    setSelectedMembers(new Set());
    setFieldMapping({ ...DEFAULT_FIELD_MAPPING });
    setUseCustomMapping(false);
    setProjectSearch('');

    setLoading(true);
    youtrackApi
      .getInstances()
      .then((data) => {
        setInstances(data);
        if (data.length === 1) {
          setSelectedInstance(data[0]);
          setStep(1);
        }
      })
      .catch(() => toast.error('Не удалось загрузить инстансы YouTrack'))
      .finally(() => setLoading(false));
  }, [open]);

  // Load projects when instance is selected
  const loadProjects = useCallback(
    async (instance: YouTrackInstance) => {
      setLoading(true);
      try {
        const data = await youtrackApi.getProjects(instance.id);
        setProjects(data.filter((p) => !p.archived));
      } catch {
        toast.error('Не удалось загрузить проекты');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedInstance && step === 1) {
      loadProjects(selectedInstance);
    }
  }, [selectedInstance, step, loadProjects]);

  // Load members when project is selected
  const loadMembers = useCallback(
    async (instanceId: string, projectId: string) => {
      setLoading(true);
      try {
        const data = await youtrackApi.getMembers(instanceId, projectId);
        setMembers(data.filter((m) => !m.banned));
      } catch {
        toast.error('Не удалось загрузить участников');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedInstance && selectedProject && step === 2) {
      loadMembers(selectedInstance.id, selectedProject.id);
    }
  }, [selectedInstance, selectedProject, step, loadMembers]);

  const toggleMember = (login: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(login)) next.delete(login);
      else next.add(login);
      return next;
    });
  };

  const selectAllMembers = () => {
    setSelectedMembers(new Set(members.map((m) => m.login)));
  };

  const deselectAllMembers = () => {
    setSelectedMembers(new Set());
  };

  const existingProjectIds = new Set(
    existingSubscriptions
      .filter((s) => s.youtrackInstanceId === selectedInstance?.id)
      .map((s) => s.projectId),
  );

  const filteredProjects = projects.filter(
    (p) =>
      !existingProjectIds.has(p.id) &&
      (p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
        p.shortName.toLowerCase().includes(projectSearch.toLowerCase())),
  );

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return !!selectedInstance;
      case 1:
        return !!selectedProject;
      case 2:
        return selectedMembers.size > 0;
      case 3:
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleCreate = async () => {
    if (!selectedInstance || !selectedProject) return;

    const employees = members
      .filter((m) => selectedMembers.has(m.login))
      .map((m) => ({
        youtrackLogin: m.login,
        displayName: m.name,
        email: m.email,
        avatarUrl: m.avatarUrl,
      }));

    const dto: CreateSubscriptionDto = {
      youtrackInstanceId: selectedInstance.id,
      projectId: selectedProject.id,
      projectShortName: selectedProject.shortName,
      projectName: selectedProject.name,
      employees,
      fieldMapping: useCustomMapping ? {
        taskTypeMapping: fieldMapping.taskTypeMapping,
        typeFieldName: fieldMapping.typeFieldName,
        cycleTimeStartStatuses: fieldMapping.cycleTimeStartStatuses,
        cycleTimeEndStatuses: fieldMapping.cycleTimeEndStatuses,
        releaseStatuses: fieldMapping.releaseStatuses,
      } : undefined,
    };

    setCreating(true);
    try {
      await subscriptionsApi.create(dto);
      toast.success('Проект добавлен');
      onCreated();
      onClose();
    } catch {
      toast.error('Не удалось создать подписку');
    } finally {
      setCreating(false);
    }
  };

  const renderStepContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      );
    }

    switch (step) {
      case 0:
        return (
          <div className="space-y-3">
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Выберите инстанс YouTrack</p>
            {instances.map((inst) => (
              <button
                key={inst.id}
                onClick={() => setSelectedInstance(inst)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  selectedInstance?.id === inst.id
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-light hover:border-gray-400 dark:hover:border-gray-600'
                }`}
              >
                <div className="font-medium text-gray-700 dark:text-gray-200">{inst.name}</div>
                <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{inst.url}</div>
              </button>
            ))}
          </div>
        );

      case 1:
        return (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2">
              <Search size={16} className="text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Поиск проекта..."
                className="flex-1 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none"
              />
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {filteredProjects.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => setSelectedProject(proj)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedProject?.id === proj.id
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-light hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen size={14} className="text-gray-400 dark:text-gray-500" />
                    <span className="font-medium text-gray-700 dark:text-gray-200">{proj.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{proj.shortName}</span>
                  </div>
                  {proj.description && (
                    <div className="mt-1 line-clamp-1 text-xs text-gray-400 dark:text-gray-500">{proj.description}</div>
                  )}
                  {proj.leader && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-600">Руководитель: {proj.leader.name}</div>
                  )}
                </button>
              ))}
              {filteredProjects.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Проекты не найдены</p>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Выбрано: {selectedMembers.size} из {members.length}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllMembers}>
                  Выбрать всех
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAllMembers}>
                  Снять все
                </Button>
              </div>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {members.map((member) => (
                <label
                  key={member.login}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-100 dark:hover:bg-surface-lighter"
                >
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                      selectedMembers.has(member.login)
                        ? 'border-brand-500 bg-brand-500'
                        : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-surface-lighter'
                    }`}
                  >
                    {selectedMembers.has(member.login) && <Check size={12} className="text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedMembers.has(member.login)}
                    onChange={() => toggleMember(member.login)}
                    className="hidden"
                  />
                  <div className="flex-1">
                    <div className="text-sm text-gray-700 dark:text-gray-200">{member.name}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {member.login}
                      {member.email && ` • ${member.email}`}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div>
            <div className="mb-4">
              <label className="flex cursor-pointer items-center gap-3">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                    useCustomMapping
                      ? 'border-brand-500 bg-brand-500'
                      : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-surface-lighter'
                  }`}
                  onClick={() => setUseCustomMapping(!useCustomMapping)}
                >
                  {useCustomMapping && <Check size={12} className="text-white" />}
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-300">Настроить маппинг полей</span>
              </label>
              <p className="ml-8 mt-1 text-xs text-gray-400 dark:text-gray-500">
                По умолчанию используется стандартный маппинг
              </p>
            </div>
            {useCustomMapping && (
              <FieldMappingEditor value={fieldMapping} onChange={setFieldMapping} />
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Подтверждение</h3>
            <div className="space-y-3 rounded-lg border border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-light p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 dark:text-gray-500">Инстанс</span>
                <span className="text-gray-700 dark:text-gray-200">{selectedInstance?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 dark:text-gray-500">Проект</span>
                <span className="text-gray-700 dark:text-gray-200">
                  {selectedProject?.name} ({selectedProject?.shortName})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 dark:text-gray-500">Сотрудники</span>
                <span className="text-gray-700 dark:text-gray-200">{selectedMembers.size}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 dark:text-gray-500">Маппинг полей</span>
                <span className="text-gray-700 dark:text-gray-200">{useCustomMapping ? 'Кастомный' : 'По умолчанию'}</span>
              </div>
            </div>
            {selectedMembers.size > 0 && (
              <div>
                <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">Выбранные сотрудники:</p>
                <div className="flex flex-wrap gap-1.5">
                  {members
                    .filter((m) => selectedMembers.has(m.login))
                    .map((m) => (
                      <span
                        key={m.login}
                        className="rounded-md bg-gray-100 dark:bg-surface-lighter px-2 py-1 text-xs text-gray-600 dark:text-gray-300"
                      >
                        {m.name}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const skipInstanceStep = instances.length <= 1;
  const firstStep = skipInstanceStep ? 1 : 0;
  const totalSteps = skipInstanceStep ? STEPS.length - 1 : STEPS.length;
  const displayStep = step - firstStep + 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Добавить проект"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  i < displayStep ? 'bg-brand-500' : 'bg-gray-100 dark:bg-surface-lighter'
                }`}
              />
            ))}
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
              {displayStep} / {totalSteps}
            </span>
          </div>
          <div className="flex gap-2">
            {step > firstStep && (
              <Button variant="secondary" size="sm" onClick={() => setStep(step - 1)} leftIcon={<ChevronLeft size={14} />}>
                Назад
              </Button>
            )}
            {step < 4 ? (
              <Button
                variant="primary"
                size="sm"
                disabled={!canNext()}
                onClick={() => setStep(step + 1)}
                rightIcon={<ChevronRight size={14} />}
              >
                Далее
              </Button>
            ) : (
              <Button variant="primary" size="sm" loading={creating} onClick={handleCreate}>
                Создать
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <Users size={14} />
          <span>{STEPS[step]}</span>
        </div>
      </div>
      {renderStepContent()}
    </Modal>
  );
}
