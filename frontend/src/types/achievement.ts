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
  createdAt: string;
}

export interface AchievementTypeInfo {
  type: string;
  title: string;
  icon: string;
}
