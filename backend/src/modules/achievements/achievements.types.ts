/**
 * Типы и определения ачивок с пороговыми значениями.
 */

import { MetricReport } from '../../entities/metric-report.entity';

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface AchievementCheck {
  rarity: AchievementRarity;
  metricValue: number;
  description: string;
}

export interface AchievementDefinition {
  type: string;
  title: string;
  description: string;
  icon: string;
  check: (metrics: MetricReport, history?: MetricReport[]) => AchievementCheck | null;
}

export interface AchievementDTO {
  id: string;
  youtrackLogin: string;
  displayName: string;
  subscriptionId: string;
  projectName: string;
  type: string;
  title: string;
  description: string;
  periodStart: string;
  rarity: string;
  icon: string;
  metadata: Record<string, unknown>;
  currentStreak: number;
  bestStreak: number;
  isNew: boolean;
  createdAt: string;
}

export interface AchievementTypeInfo {
  type: string;
  title: string;
  icon: string;
}

const RARITY_ORDER: Record<AchievementRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export function isHigherRarity(a: AchievementRarity, b: AchievementRarity): boolean {
  return RARITY_ORDER[a] > RARITY_ORDER[b];
}

function getEffectiveScore(report: MetricReport): number | null {
  return report.llmScore ?? null;
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export const ACHIEVEMENT_THRESHOLDS: Record<string, {
  description: string;
  levels: Record<string, { label: string; value: number }>;
}> = {
  speed_demon: {
    description: 'Количество закрытых задач за неделю',
    levels: {
      common: { label: '≥10 задач', value: 10 },
      rare: { label: '≥15 задач', value: 15 },
      epic: { label: '≥20 задач', value: 20 },
      legendary: { label: '≥25 задач', value: 25 },
    },
  },
  task_crusher: {
    description: 'Процент закрытых задач от общего количества',
    levels: {
      common: { label: '≥80%', value: 80 },
      rare: { label: '≥90%', value: 90 },
      epic: { label: '≥95%', value: 95 },
      legendary: { label: '100%', value: 100 },
    },
  },
  marathon_runner: {
    description: 'Списанные часы за неделю',
    levels: {
      common: { label: '≥35 часов', value: 35 },
      rare: { label: '≥40 часов', value: 40 },
      epic: { label: '≥45 часов', value: 45 },
      legendary: { label: '≥50 часов', value: 50 },
    },
  },
  estimation_guru: {
    description: 'Точность оценки задач',
    levels: {
      common: { label: '≥80%', value: 80 },
      rare: { label: '≥85%', value: 85 },
      epic: { label: '≥90%', value: 90 },
      legendary: { label: '≥95%', value: 95 },
    },
  },
  zero_bugs: {
    description: 'Ноль багов при значительном количестве закрытых задач',
    levels: {
      common: { label: '0 багов, ≥5 задач', value: 5 },
      rare: { label: '0 багов, ≥5 задач', value: 5 },
      epic: { label: '0 багов, ≥10 задач', value: 10 },
      legendary: { label: '0 багов, ≥15 задач', value: 15 },
    },
  },
  quick_closer: {
    description: 'Средний Cycle Time (часы) — чем меньше тем лучше',
    levels: {
      common: { label: '≤72 часа', value: 72 },
      rare: { label: '≤48 часов', value: 48 },
      epic: { label: '≤36 часов', value: 36 },
      legendary: { label: '≤24 часа', value: 24 },
    },
  },
  focus_master: {
    description: 'Процент времени на продуктовую работу',
    levels: {
      common: { label: '≥80%', value: 80 },
      rare: { label: '≥85%', value: 85 },
      epic: { label: '≥90%', value: 90 },
      legendary: { label: '≥95%', value: 95 },
    },
  },
  balanced_warrior: {
    description: 'Загрузка в идеальном диапазоне',
    levels: {
      common: { label: '75-95%', value: 0 },
      rare: { label: '80-90%', value: 0 },
      epic: { label: '82-88%', value: 0 },
      legendary: { label: '84-86%', value: 0 },
    },
  },
  ai_pioneer: {
    description: 'Часы сэкономленные с помощью ИИ',
    levels: {
      common: { label: '≥2 часа', value: 2 },
      rare: { label: '≥5 часов', value: 5 },
      epic: { label: '≥10 часов', value: 10 },
      legendary: { label: '≥20 часов', value: 20 },
    },
  },
  rising_star: {
    description: 'Рост оценки продуктивности за неделю',
    levels: {
      common: { label: '+5 пунктов', value: 5 },
      rare: { label: '+10 пунктов', value: 10 },
      epic: { label: '+15 пунктов', value: 15 },
      legendary: { label: '+20 пунктов', value: 20 },
    },
  },
  consistency_king: {
    description: 'Стабильно высокая оценка на протяжении недель подряд',
    levels: {
      common: { label: '≥70 за 3 недели', value: 3 },
      rare: { label: '≥70 за 5 недель', value: 5 },
      epic: { label: '≥75 за 5 недель', value: 5 },
      legendary: { label: '≥80 за 5 недель', value: 5 },
    },
  },
  top_performer: {
    description: 'Оценка продуктивности за неделю',
    levels: {
      common: { label: '≥75 баллов', value: 75 },
      rare: { label: '≥80 баллов', value: 80 },
      epic: { label: '≥85 баллов', value: 85 },
      legendary: { label: '≥90 баллов', value: 90 },
    },
  },
  overachiever: {
    description: 'Закрытых задач больше чем обычно (vs среднее за 4 недели)',
    levels: {
      common: { label: '×1.5 от среднего', value: 150 },
      rare: { label: '×1.75 от среднего', value: 175 },
      epic: { label: '×2 от среднего', value: 200 },
      legendary: { label: '×2.5 от среднего', value: 250 },
    },
  },
  debt_slayer: {
    description: 'Процент времени посвящённый техдолгу',
    levels: {
      common: { label: '≥20% времени', value: 20 },
      rare: { label: '≥30% времени', value: 30 },
      epic: { label: '≥40% времени', value: 40 },
      legendary: { label: '≥50% времени', value: 50 },
    },
  },
};

export const ACHIEVEMENT_CATEGORIES = [
  { id: 'productivity', name: 'Продуктивность', icon: '⚡', types: ['speed_demon', 'task_crusher', 'marathon_runner'] },
  { id: 'quality', name: 'Качество', icon: '🎯', types: ['estimation_guru', 'zero_bugs', 'quick_closer'] },
  { id: 'focus', name: 'Фокус и баланс', icon: '⚖️', types: ['focus_master', 'balanced_warrior'] },
  { id: 'ai', name: 'Искусственный интеллект', icon: '🤖', types: ['ai_pioneer'] },
  { id: 'growth', name: 'Рост и стабильность', icon: '📈', types: ['rising_star', 'consistency_king', 'top_performer'] },
  { id: 'special', name: 'Особые', icon: '🌟', types: ['overachiever', 'debt_slayer'] },
];

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // === PRODUCTIVITY ===
  {
    type: 'speed_demon',
    title: 'Скоростной демон',
    icon: 'Zap',
    description: 'Закрыл {value} задач за неделю',
    check: (report) => {
      const v = report.completedIssues;
      if (v >= 25) return { rarity: 'legendary', metricValue: v, description: `Закрыл ${v} задач за неделю` };
      if (v >= 20) return { rarity: 'epic', metricValue: v, description: `Закрыл ${v} задач за неделю` };
      if (v >= 15) return { rarity: 'rare', metricValue: v, description: `Закрыл ${v} задач за неделю` };
      if (v >= 10) return { rarity: 'common', metricValue: v, description: `Закрыл ${v} задач за неделю` };
      return null;
    },
  },
  {
    type: 'task_crusher',
    title: 'Сокрушитель задач',
    icon: 'Flame',
    description: 'Скорость закрытия {value}%',
    check: (report) => {
      const v = report.completionRate;
      if (v == null) return null;
      const rounded = Math.round(v);
      if (v >= 100) return { rarity: 'legendary', metricValue: rounded, description: `Скорость закрытия ${rounded}%` };
      if (v >= 95) return { rarity: 'epic', metricValue: rounded, description: `Скорость закрытия ${rounded}%` };
      if (v >= 90) return { rarity: 'rare', metricValue: rounded, description: `Скорость закрытия ${rounded}%` };
      if (v >= 80) return { rarity: 'common', metricValue: rounded, description: `Скорость закрытия ${rounded}%` };
      return null;
    },
  },
  {
    type: 'marathon_runner',
    title: 'Марафонец',
    icon: 'Timer',
    description: 'Списал {value} часов за неделю',
    check: (report) => {
      const hours = minutesToHours(report.totalSpentMinutes);
      if (hours >= 50) return { rarity: 'legendary', metricValue: hours, description: `Списал ${hours} часов за неделю` };
      if (hours >= 45) return { rarity: 'epic', metricValue: hours, description: `Списал ${hours} часов за неделю` };
      if (hours >= 40) return { rarity: 'rare', metricValue: hours, description: `Списал ${hours} часов за неделю` };
      if (hours >= 35) return { rarity: 'common', metricValue: hours, description: `Списал ${hours} часов за неделю` };
      return null;
    },
  },

  // === QUALITY ===
  {
    type: 'estimation_guru',
    title: 'Гуру оценок',
    icon: 'Target',
    description: 'Точность оценок {value}%',
    check: (report) => {
      const v = report.estimationAccuracy;
      if (v == null) return null;
      const rounded = Math.round(v);
      if (v >= 95) return { rarity: 'legendary', metricValue: rounded, description: `Точность оценок ${rounded}%` };
      if (v >= 90) return { rarity: 'epic', metricValue: rounded, description: `Точность оценок ${rounded}%` };
      if (v >= 85) return { rarity: 'rare', metricValue: rounded, description: `Точность оценок ${rounded}%` };
      if (v >= 80) return { rarity: 'common', metricValue: rounded, description: `Точность оценок ${rounded}%` };
      return null;
    },
  },
  {
    type: 'zero_bugs',
    title: 'Без багов',
    icon: 'Shield',
    description: 'Ноль багов после релиза и на тесте',
    check: (report) => {
      if (report.bugsAfterRelease !== 0 || report.bugsOnTest !== 0) return null;
      const completed = report.completedIssues;
      if (completed < 5) return null;
      if (completed >= 15) return { rarity: 'legendary', metricValue: completed, description: `Закрыл ${completed} задач без единого бага` };
      if (completed >= 10) return { rarity: 'epic', metricValue: completed, description: `Закрыл ${completed} задач без единого бага` };
      return { rarity: 'rare', metricValue: completed, description: `Закрыл ${completed} задач без единого бага` };
    },
  },
  {
    type: 'quick_closer',
    title: 'Быстрый закрытчик',
    icon: 'Rocket',
    description: 'Средний Cycle Time {value} часов',
    check: (report) => {
      const v = report.avgCycleTimeHours;
      if (v == null) return null;
      const rounded = Math.round(v * 10) / 10;
      if (v <= 24) return { rarity: 'legendary', metricValue: rounded, description: `Средний Cycle Time ${rounded} часов` };
      if (v <= 36) return { rarity: 'epic', metricValue: rounded, description: `Средний Cycle Time ${rounded} часов` };
      if (v <= 48) return { rarity: 'rare', metricValue: rounded, description: `Средний Cycle Time ${rounded} часов` };
      if (v <= 72) return { rarity: 'common', metricValue: rounded, description: `Средний Cycle Time ${rounded} часов` };
      return null;
    },
  },

  // === FOCUS & BALANCE ===
  {
    type: 'focus_master',
    title: 'Мастер фокуса',
    icon: 'Search',
    description: 'Фокус на продуктовой работе {value}%',
    check: (report) => {
      const v = report.focus;
      if (v == null) return null;
      const rounded = Math.round(v);
      if (v >= 95) return { rarity: 'legendary', metricValue: rounded, description: `Фокус на продуктовой работе ${rounded}%` };
      if (v >= 90) return { rarity: 'epic', metricValue: rounded, description: `Фокус на продуктовой работе ${rounded}%` };
      if (v >= 85) return { rarity: 'rare', metricValue: rounded, description: `Фокус на продуктовой работе ${rounded}%` };
      if (v >= 80) return { rarity: 'common', metricValue: rounded, description: `Фокус на продуктовой работе ${rounded}%` };
      return null;
    },
  },
  {
    type: 'balanced_warrior',
    title: 'Сбалансированный воин',
    icon: 'Scale',
    description: 'Идеальный баланс: загрузка {value}%',
    check: (report) => {
      const v = report.utilization;
      if (v == null) return null;
      const rounded = Math.round(v);
      if (v >= 84 && v <= 86) return { rarity: 'legendary', metricValue: rounded, description: `Идеальный баланс: загрузка ${rounded}%` };
      if (v >= 82 && v <= 88) return { rarity: 'epic', metricValue: rounded, description: `Идеальный баланс: загрузка ${rounded}%` };
      if (v >= 80 && v <= 90) return { rarity: 'rare', metricValue: rounded, description: `Идеальный баланс: загрузка ${rounded}%` };
      if (v >= 75 && v <= 95) return { rarity: 'common', metricValue: rounded, description: `Идеальный баланс: загрузка ${rounded}%` };
      return null;
    },
  },

  // === GROWTH & STABILITY ===
  {
    type: 'rising_star',
    title: 'Восходящая звезда',
    icon: 'Star',
    description: 'Score вырос на {value} пунктов',
    check: (report, history) => {
      if (!history || history.length === 0) return null;
      const currentScore = getEffectiveScore(report);
      const prevScore = getEffectiveScore(history[0]);
      if (currentScore == null || prevScore == null) return null;
      const diff = currentScore - prevScore;
      if (diff >= 20) return { rarity: 'legendary', metricValue: diff, description: `Score вырос на ${diff} пунктов` };
      if (diff >= 15) return { rarity: 'epic', metricValue: diff, description: `Score вырос на ${diff} пунктов` };
      if (diff >= 10) return { rarity: 'rare', metricValue: diff, description: `Score вырос на ${diff} пунктов` };
      if (diff >= 5) return { rarity: 'common', metricValue: diff, description: `Score вырос на ${diff} пунктов` };
      return null;
    },
  },
  {
    type: 'consistency_king',
    title: 'Король стабильности',
    icon: 'Crown',
    description: 'Score >{value} на протяжении {weeks} недель подряд',
    check: (report, history) => {
      if (!history || history.length === 0) return null;

      const currentScore = getEffectiveScore(report);
      if (currentScore == null) return null;

      // Build array of consecutive scores (most recent first: current + history)
      const scores: number[] = [currentScore];
      for (const h of history) {
        const s = getEffectiveScore(h);
        if (s == null) break;
        scores.push(s);
      }

      // Count consecutive weeks from start with score >= threshold
      let consecutive80 = 0;
      for (const s of scores) { if (s >= 80) consecutive80++; else break; }
      let consecutive75 = 0;
      for (const s of scores) { if (s >= 75) consecutive75++; else break; }
      let consecutive70 = 0;
      for (const s of scores) { if (s >= 70) consecutive70++; else break; }

      if (consecutive80 >= 5) return { rarity: 'legendary', metricValue: 80, description: `Score >80 на протяжении ${consecutive80} недель подряд` };
      if (consecutive75 >= 5) return { rarity: 'epic', metricValue: 75, description: `Score >75 на протяжении ${consecutive75} недель подряд` };
      if (consecutive70 >= 5) return { rarity: 'rare', metricValue: 70, description: `Score >70 на протяжении ${consecutive70} недель подряд` };
      if (consecutive70 >= 3) return { rarity: 'common', metricValue: 70, description: `Score >70 на протяжении ${consecutive70} недель подряд` };
      return null;
    },
  },
  {
    type: 'top_performer',
    title: 'Топ-перформер',
    icon: 'Trophy',
    description: 'Score {value} — отличный результат',
    check: (report) => {
      const score = getEffectiveScore(report);
      if (score == null) return null;
      if (score >= 90) return { rarity: 'legendary', metricValue: score, description: `Score ${score} — отличный результат` };
      if (score >= 85) return { rarity: 'epic', metricValue: score, description: `Score ${score} — отличный результат` };
      if (score >= 80) return { rarity: 'rare', metricValue: score, description: `Score ${score} — отличный результат` };
      if (score >= 75) return { rarity: 'common', metricValue: score, description: `Score ${score} — отличный результат` };
      return null;
    },
  },

  // === SPECIAL ===
  {
    type: 'overachiever',
    title: 'Перевыполнил план',
    icon: 'TrendingUp',
    description: 'Закрыл на {value}% больше задач чем обычно',
    check: (report, history) => {
      if (!history || history.length < 2) return null;
      const avg = history.reduce((s, h) => s + h.completedIssues, 0) / history.length;
      if (avg === 0) return null;
      const ratio = report.completedIssues / avg;
      const percent = Math.round((ratio - 1) * 100);
      if (ratio >= 2.5) return { rarity: 'legendary', metricValue: percent, description: `Закрыл на ${percent}% больше задач чем обычно` };
      if (ratio >= 2) return { rarity: 'epic', metricValue: percent, description: `Закрыл на ${percent}% больше задач чем обычно` };
      if (ratio >= 1.75) return { rarity: 'rare', metricValue: percent, description: `Закрыл на ${percent}% больше задач чем обычно` };
      if (ratio >= 1.5) return { rarity: 'common', metricValue: percent, description: `Закрыл на ${percent}% больше задач чем обычно` };
      return null;
    },
  },
  {
    type: 'debt_slayer',
    title: 'Истребитель техдолга',
    icon: 'Sword',
    description: 'Посвятил {value}% времени техдолгу',
    check: (report) => {
      const spentByType = report.spentByType;
      const totalMinutes = report.totalSpentMinutes;
      if (totalMinutes === 0) return null;

      // Sum tech-debt related categories
      const techDebtKeys = Object.keys(spentByType).filter((k) =>
        k.toLowerCase().includes('tech') ||
        k.toLowerCase().includes('debt') ||
        k.toLowerCase().includes('refactor') ||
        k.toLowerCase().includes('техдолг'),
      );
      const techDebtMinutes = techDebtKeys.reduce((s, k) => s + (spentByType[k] || 0), 0);
      const percent = Math.round((techDebtMinutes / totalMinutes) * 100);

      if (percent >= 50) return { rarity: 'legendary', metricValue: percent, description: `Посвятил ${percent}% времени техдолгу` };
      if (percent >= 40) return { rarity: 'epic', metricValue: percent, description: `Посвятил ${percent}% времени техдолгу` };
      if (percent >= 30) return { rarity: 'rare', metricValue: percent, description: `Посвятил ${percent}% времени техдолгу` };
      if (percent >= 20) return { rarity: 'common', metricValue: percent, description: `Посвятил ${percent}% времени техдолгу` };
      return null;
    },
  },
];
