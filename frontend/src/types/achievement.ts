export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Achievement {
  id: string;
  youtrackLogin: string;
  displayName?: string;
  subscriptionId: string;
  projectName?: string;
  type: string;
  title: string;
  description: string;
  periodStart: string;
  rarity: AchievementRarity;
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

export interface CatalogThreshold {
  label: string;
  value: number;
}

export interface CatalogNextLevel {
  rarity: AchievementRarity | null;
  label: string;
  value: number;
  progress: number;
}

export interface CatalogEarnedBy {
  youtrackLogin: string;
  displayName: string;
  projectName: string;
  rarity: AchievementRarity;
  description: string;
  periodStart: string;
  currentStreak: number;
  bestStreak: number;
}

export interface CatalogAchievement {
  type: string;
  title: string;
  icon: string;
  description: string;
  thresholds: Record<string, CatalogThreshold>;
  unlocked: boolean;
  bestRarity: AchievementRarity | null;
  bestValue: number | null;
  nextLevel: CatalogNextLevel | null;
  earnedCount: number;
  earnedBy: CatalogEarnedBy[];
  maxStreak: number;
}

export interface CatalogCategory {
  id: string;
  name: string;
  icon: string;
  unlockedCount: number;
  totalCount: number;
  achievements: CatalogAchievement[];
}

export interface CatalogStats {
  totalTypes: number;
  unlockedTypes: number;
  totalEarned: number;
  legendaryCount: number;
  thisWeekCount: number;
}

export interface CatalogResponse {
  stats: CatalogStats;
  categories: CatalogCategory[];
}

/* ── Portfolio types ── */

export interface PortfolioLevel {
  rarity: AchievementRarity;
  earnedAt: string;
  description: string;
}

export interface PortfolioNextLevel {
  rarity: AchievementRarity;
  label: string;
  progress: number;
}

export interface PortfolioAchievement {
  type: string;
  title: string;
  icon: string;
  bestRarity: AchievementRarity;
  bestValue: number | null;
  currentStreak: number;
  bestStreak: number;
  levels: PortfolioLevel[];
  nextLevel: PortfolioNextLevel | null;
}

export interface PortfolioStats {
  totalTypes: number;
  unlockedTypes: number;
  totalLevels: number;
  maxPossibleLevels: number;
  activeSeries: number;
  longestStreak: number;
}

export interface PortfolioResponse {
  achievements: PortfolioAchievement[];
  stats: PortfolioStats;
}

/* ── Achievement thresholds (mirrored from backend) ── */

export const RARITY_ORDER: AchievementRarity[] = ['common', 'rare', 'epic', 'legendary'];

export const ACHIEVEMENT_THRESHOLDS: Record<string, {
  description: string;
  levels: Record<string, string>;
}> = {
  speed_demon: {
    description: 'Количество закрытых задач за неделю',
    levels: { common: '>=10 задач', rare: '>=15 задач', epic: '>=20 задач', legendary: '>=25 задач' },
  },
  task_crusher: {
    description: 'Процент закрытых задач от общего количества',
    levels: { common: '>=80%', rare: '>=90%', epic: '>=95%', legendary: '100%' },
  },
  marathon_runner: {
    description: 'Списанные часы за неделю',
    levels: { common: '>=35 часов', rare: '>=40 часов', epic: '>=45 часов', legendary: '>=50 часов' },
  },
  estimation_guru: {
    description: 'Точность оценки задач',
    levels: { common: '>=80%', rare: '>=85%', epic: '>=90%', legendary: '>=95%' },
  },
  zero_bugs: {
    description: 'Ноль багов при значительном количестве закрытых задач',
    levels: { common: '0 багов, >=5 задач', rare: '0 багов, >=5 задач', epic: '0 багов, >=10 задач', legendary: '0 багов, >=15 задач' },
  },
  quick_closer: {
    description: 'Средний Cycle Time (часы)',
    levels: { common: '<=72 часа', rare: '<=48 часов', epic: '<=36 часов', legendary: '<=24 часа' },
  },
  focus_master: {
    description: 'Процент времени на продуктовую работу',
    levels: { common: '>=80%', rare: '>=85%', epic: '>=90%', legendary: '>=95%' },
  },
  balanced_warrior: {
    description: 'Загрузка в идеальном диапазоне',
    levels: { common: '75-95%', rare: '80-90%', epic: '82-88%', legendary: '84-86%' },
  },
  ai_pioneer: {
    description: 'Часы сэкономленные с помощью ИИ',
    levels: { common: '>=2 часа', rare: '>=5 часов', epic: '>=10 часов', legendary: '>=20 часов' },
  },
  rising_star: {
    description: 'Рост оценки продуктивности за неделю',
    levels: { common: '+5 пунктов', rare: '+10 пунктов', epic: '+15 пунктов', legendary: '+20 пунктов' },
  },
  consistency_king: {
    description: 'Стабильно высокая оценка на протяжении недель подряд',
    levels: { common: '>=70 за 3 недели', rare: '>=70 за 5 недель', epic: '>=75 за 5 недель', legendary: '>=80 за 5 недель' },
  },
  top_performer: {
    description: 'Оценка продуктивности за неделю',
    levels: { common: '>=75 баллов', rare: '>=80 баллов', epic: '>=85 баллов', legendary: '>=90 баллов' },
  },
  overachiever: {
    description: 'Закрытых задач больше чем обычно (vs среднее за 4 недели)',
    levels: { common: 'x1.5 от среднего', rare: 'x1.75 от среднего', epic: 'x2 от среднего', legendary: 'x2.5 от среднего' },
  },
  debt_slayer: {
    description: 'Процент времени посвящённый техдолгу',
    levels: { common: '>=20% времени', rare: '>=30% времени', epic: '>=40% времени', legendary: '>=50% времени' },
  },
};
