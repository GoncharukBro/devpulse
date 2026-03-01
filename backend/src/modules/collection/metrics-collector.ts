/**
 * Сборщик сырых метрик из YouTrack для одного сотрудника за один период.
 */

import { YouTrackClient } from '../youtrack/youtrack.client';
import {
  YouTrackIssue,
  YouTrackWorkItem,
  YouTrackCustomFieldValue,
} from '../youtrack/youtrack.types';
import { FieldMapping } from '../../entities/field-mapping.entity';
import { formatYTDate } from '../../common/utils/week-utils';
import { Logger } from '../../common/types/logger';

export interface TaskSummary {
  id: string;
  summary: string;
  type: string;
  spent: number;
}

export interface RawMetrics {
  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  overdueIssues: number;
  issuesByType: Record<string, number>;
  issuesWithoutEstimation: number;
  issuesOverEstimation: number;

  totalSpentMinutes: number;
  spentByType: Record<string, number>;
  totalEstimationMinutes: number;
  estimationByType: Record<string, number>;

  avgCycleTimeHours: number | null;
  bugsAfterRelease: number;
  bugsOnTest: number;
  aiSavingMinutes: number;

  taskSummaries: TaskSummary[];
}

const ISSUE_FIELDS = [
  'id',
  'idReadable',
  'summary',
  'created',
  'resolved',
  'updatedDate',
  'customFields(name,value(name,login,text,minutes,presentation))',
].join(',');

const WORK_ITEM_FIELDS = [
  'id',
  'date',
  'duration(minutes,presentation)',
  'type(name)',
  'issue(id,idReadable,summary)',
  'author(login,name)',
].join(',');

export class MetricsCollector {
  constructor(
    private ytClient: YouTrackClient,
    private fieldMapping: FieldMapping,
    private log: Logger,
  ) {}

  async collectForEmployee(
    projectShortName: string,
    employeeLogin: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<RawMetrics> {
    const startStr = formatYTDate(periodStart);
    const endStr = formatYTDate(periodEnd);

    // A. Work items (списания времени) за период — единственный надёжный источник
    const workItems = await this.fetchWorkItems(
      projectShortName,
      employeeLogin,
      startStr,
      endStr,
    );
    const totalWorkMinutes = workItems.reduce((sum, wi) => sum + wi.duration.minutes, 0);
    this.log.info(
      `YouTrack: found ${workItems.length} work items for ${employeeLogin} (total: ${totalWorkMinutes} min)`,
    );

    // B. Собрать задачи из трёх источников (вместо старого updated-фильтра)
    const issues = await this.fetchIssuesFromAllSources(
      projectShortName,
      employeeLogin,
      startStr,
      endStr,
      workItems,
    );
    this.log.info(`YouTrack: found ${issues.length} issues for ${employeeLogin} (work items + resolved + created)`);

    // Классификация задач
    const issuesByType: Record<string, number> = {};
    const estimationByType: Record<string, number> = {};
    let completedIssues = 0;
    let inProgressIssues = 0;
    let overdueIssues = 0;
    let issuesWithoutEstimation = 0;
    let issuesOverEstimation = 0;
    let totalEstimationMinutes = 0;

    const nowMs = Date.now();
    const completedIssueIds: string[] = [];

    const taskSummaries: TaskSummary[] = [];
    const issueSpentMap = new Map<string, number>();

    // Подсчитаем spent per issue из work items
    for (const wi of workItems) {
      const issueId = wi.issue.id;
      issueSpentMap.set(issueId, (issueSpentMap.get(issueId) || 0) + wi.duration.minutes);
    }

    for (const issue of issues) {
      const type = this.resolveIssueType(issue);
      issuesByType[type] = (issuesByType[type] || 0) + 1;

      const estimation = this.getEstimation(issue);
      if (estimation > 0) {
        totalEstimationMinutes += estimation;
        estimationByType[type] = (estimationByType[type] || 0) + estimation;
      } else {
        issuesWithoutEstimation++;
      }

      // Статус задачи: завершена, если текущий статус в списке "resolved" статусов.
      // Раньше проверялся только resolved timestamp, но он ненадёжен
      // (bulk-операции, миграции — resolved date может не совпадать с периодом).
      const issueState = this.getIssueState(issue);
      if (this.isResolvedState(issueState)) {
        completedIssues++;
        completedIssueIds.push(issue.id);
      } else {
        inProgressIssues++;
      }

      // Overdue: есть due date до конца периода и не resolved
      const dueDate = this.getDueDate(issue);
      if (dueDate && dueDate < nowMs && !issue.resolved) {
        overdueIssues++;
      }

      // Over-estimation check
      const spent = issueSpentMap.get(issue.id) || 0;
      if (estimation > 0 && spent > estimation) {
        issuesOverEstimation++;
      }

      taskSummaries.push({
        id: issue.idReadable,
        summary: issue.summary,
        type,
        spent,
      });
    }

    // Группировка work items по типам
    const spentByType: Record<string, number> = {};
    let aiSavingMinutes = 0;
    const issueMap = new Map(issues.map((i) => [i.id, i]));

    for (const wi of workItems) {
      // Определяем тип задачи для этого work item
      const parentIssue = issueMap.get(wi.issue.id);
      const type = parentIssue ? this.resolveIssueType(parentIssue) : 'other';
      spentByType[type] = (spentByType[type] || 0) + wi.duration.minutes;

      // AI savings
      if (
        this.fieldMapping.aiSavingWorkType &&
        wi.type?.name === this.fieldMapping.aiSavingWorkType
      ) {
        aiSavingMinutes += wi.duration.minutes;
      }
    }

    // C. Cycle Time (для закрытых задач)
    const avgCycleTimeHours = await this.calculateAvgCycleTime(completedIssueIds);

    // D. Баги после релиза
    const bugsAfterRelease = await this.countBugsAfterRelease(issues);

    // E. Баги на тесте (возвраты)
    const bugsOnTest = await this.countBugsOnTest(completedIssueIds);

    return {
      totalIssues: issues.length,
      completedIssues,
      inProgressIssues,
      overdueIssues,
      issuesByType,
      issuesWithoutEstimation,
      issuesOverEstimation,
      totalSpentMinutes: totalWorkMinutes,
      spentByType,
      totalEstimationMinutes,
      estimationByType,
      avgCycleTimeHours,
      bugsAfterRelease,
      bugsOnTest,
      aiSavingMinutes,
      taskSummaries,
    };
  }

  /**
   * Собрать задачи из трёх источников и дедуплицировать:
   * 1. Work items → задачи, на которые реально списано время
   * 2. Resolved → задачи, закрытые в периоде (могут быть без списания на этой неделе)
   * 3. Created → задачи, созданные в периоде (могут ещё не иметь списаний)
   */
  private async fetchIssuesFromAllSources(
    projectShortName: string,
    login: string,
    startStr: string,
    endStr: string,
    workItems: YouTrackWorkItem[],
  ): Promise<YouTrackIssue[]> {
    // 1. Уникальные idReadable из work items
    const workItemIssueIds = [
      ...new Set(workItems.map((wi) => wi.issue.idReadable).filter(Boolean)),
    ];

    // 2. Задачи закрытые за период (YouTrack: "resolved date:", не "resolved:")
    const resolvedQuery = `project: {${projectShortName}} assignee: ${login} resolved date: ${startStr} .. ${endStr}`;
    const resolvedIssues = await this.ytClient.getIssues(resolvedQuery, ISSUE_FIELDS);

    // 3. Задачи созданные за период
    const createdQuery = `project: {${projectShortName}} assignee: ${login} created: ${startStr} .. ${endStr}`;
    const createdIssues = await this.ytClient.getIssues(createdQuery, ISSUE_FIELDS);

    // 4. Задачи из work items (детали по ID)
    let workItemIssues: YouTrackIssue[] = [];
    if (workItemIssueIds.length > 0) {
      workItemIssues = await this.ytClient.getIssuesByIds(workItemIssueIds, ISSUE_FIELDS);
    }

    // 5. Дедупликация по id
    const issueMap = new Map<string, YouTrackIssue>();
    for (const issue of [...workItemIssues, ...resolvedIssues, ...createdIssues]) {
      issueMap.set(issue.id, issue);
    }

    this.log.info(
      `YouTrack: sources — workItems=${workItemIssueIds.length}, resolved=${resolvedIssues.length}, created=${createdIssues.length} → merged=${issueMap.size}`,
    );

    return Array.from(issueMap.values());
  }

  private async fetchWorkItems(
    projectShortName: string,
    login: string,
    startStr: string,
    endStr: string,
  ): Promise<YouTrackWorkItem[]> {
    // /api/workItems принимает startDate/endDate в формате YYYY-MM-DD, query не поддерживается
    const items = await this.ytClient.getWorkItems(startStr, endStr, WORK_ITEM_FIELDS);

    // Фильтрация по автору и проекту на стороне бэкенда
    return items.filter(
      (wi) =>
        wi.author.login === login &&
        wi.issue.idReadable.startsWith(`${projectShortName}-`),
    );
  }

  private resolveIssueType(issue: YouTrackIssue): string {
    const typeField = issue.customFields.find((f) => f.name === 'Type');
    if (!typeField || !typeField.value) return 'other';

    const value = typeField.value;
    let typeName: string | undefined;

    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      typeName = (value as YouTrackCustomFieldValue).name;
    } else if (typeof value === 'string') {
      typeName = value;
    }

    if (!typeName) return 'other';

    return this.fieldMapping.taskTypeMapping[typeName] || 'other';
  }

  private getEstimation(issue: YouTrackIssue): number {
    const field = issue.customFields.find((f) => f.name === 'Estimation');
    if (!field || !field.value) return 0;

    const value = field.value;
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      return (value as YouTrackCustomFieldValue).minutes || 0;
    }
    if (typeof value === 'number') return value;
    return 0;
  }

  private getIssueState(issue: YouTrackIssue): string | null {
    const stateField = issue.customFields.find((f) => f.name === 'State');
    if (!stateField || !stateField.value) return null;

    const value = stateField.value;
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      return (value as YouTrackCustomFieldValue).name || null;
    }
    if (typeof value === 'string') return value;
    return null;
  }

  /** Дефолтные статусы "завершено" — используются если cycleTimeEndStatuses пуст */
  private static readonly DEFAULT_RESOLVED_STATES = [
    'Done', 'Fixed', 'Verified', 'Closed', 'Resolved',
    'Готово', 'Завершена', 'Закрыта',
  ];

  private isResolvedState(state: string | null): boolean {
    if (!state) return false;
    const resolvedStatuses = this.fieldMapping.cycleTimeEndStatuses.length > 0
      ? this.fieldMapping.cycleTimeEndStatuses
      : MetricsCollector.DEFAULT_RESOLVED_STATES;
    return resolvedStatuses.includes(state);
  }

  private getDueDate(issue: YouTrackIssue): number | null {
    const field = issue.customFields.find((f) => f.name === 'Due Date');
    if (!field || !field.value) return null;

    const value = field.value;
    if (typeof value === 'number') return value;
    return null;
  }

  private async calculateAvgCycleTime(completedIssueIds: string[]): Promise<number | null> {
    const startStatuses = this.fieldMapping.cycleTimeStartStatuses;
    const endStatuses = this.fieldMapping.cycleTimeEndStatuses;

    if (startStatuses.length === 0 || endStatuses.length === 0) return null;
    if (completedIssueIds.length === 0) return null;

    const cycleTimes: number[] = [];

    for (const issueId of completedIssueIds) {
      try {
        const activities = await this.ytClient.getIssueActivities(issueId);
        const stateActivities = activities.filter((a) => a.field?.name === 'State');

        let startTs: number | null = null;
        let endTs: number | null = null;

        for (const activity of stateActivities) {
          const addedNames = activity.added?.map((a) => a.name) || [];

          // Ищем первый переход в startStatuses
          if (startTs === null && addedNames.some((n) => startStatuses.includes(n))) {
            startTs = activity.timestamp;
          }

          // Ищем последний переход в endStatuses
          if (addedNames.some((n) => endStatuses.includes(n))) {
            endTs = activity.timestamp;
          }
        }

        if (startTs !== null && endTs !== null && endTs > startTs) {
          const hours = (endTs - startTs) / (1000 * 60 * 60);
          cycleTimes.push(hours);
        }
      } catch {
        // Пропускаем задачу если не удалось получить активности
      }
    }

    if (cycleTimes.length === 0) return null;
    const avg = cycleTimes.reduce((s, v) => s + v, 0) / cycleTimes.length;
    return Math.round(avg * 100) / 100;
  }

  private async countBugsAfterRelease(
    issues: YouTrackIssue[],
  ): Promise<number> {
    const releaseStatuses = this.fieldMapping.releaseStatuses;
    if (releaseStatuses.length === 0) return 0;

    let count = 0;

    for (const issue of issues) {
      const type = this.resolveIssueType(issue);
      if (type !== 'bugfix') continue;

      // Проверяем, есть ли среди задач (не багов) переход в releaseStatuses до создания бага
      // Упрощённый подход: считаем баги, созданные в текущем периоде как потенциальные баги после релиза
      // (Для полного анализа нужно проверять активности связанных задач)
      try {
        const activities = await this.ytClient.getIssueActivities(issue.id);
        const stateActivities = activities.filter((a) => a.field?.name === 'State');

        // Проверяем был ли переход в release status
        const wasReleased = stateActivities.some((a) => {
          const removedNames = a.removed?.map((r) => r.name) || [];
          return removedNames.some((n) => releaseStatuses.includes(n));
        });

        // Баг создан после релизного статуса — считаем
        if (wasReleased) {
          count++;
        }
      } catch {
        // Пропускаем
      }
    }

    return count;
  }

  private async countBugsOnTest(completedIssueIds: string[]): Promise<number> {
    const startStatuses = this.fieldMapping.cycleTimeStartStatuses;
    if (startStatuses.length === 0) return 0;

    let count = 0;

    for (const issueId of completedIssueIds) {
      try {
        const activities = await this.ytClient.getIssueActivities(issueId);
        const stateActivities = activities
          .filter((a) => a.field?.name === 'State')
          .sort((a, b) => a.timestamp - b.timestamp);

        // Считаем количество переходов В startStatuses
        let transitionsToStart = 0;
        for (const activity of stateActivities) {
          const addedNames = activity.added?.map((a) => a.name) || [];
          if (addedNames.some((n) => startStatuses.includes(n))) {
            transitionsToStart++;
          }
        }

        // Если было больше 1 перехода в startStatuses — значит задача возвращалась
        if (transitionsToStart > 1) {
          count++;
        }
      } catch {
        // Пропускаем
      }
    }

    return count;
  }
}
