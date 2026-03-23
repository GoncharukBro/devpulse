import { EntityManager, FilterQuery } from '@mikro-orm/postgresql';
import { Subscription } from '../../entities/subscription.entity';

export function subscriptionAccessFilter(
  userId: string,
  userLogin: string,
): FilterQuery<Subscription> {
  return {
    $or: [
      { ownerId: userId },
      { shares: { sharedWithLogin: userLogin.toLowerCase() } },
    ],
  };
}

export function subscriptionEditorFilter(
  userId: string,
  userLogin: string,
): FilterQuery<Subscription> {
  return {
    $or: [
      { ownerId: userId },
      { shares: { sharedWithLogin: userLogin.toLowerCase(), role: 'editor' } },
    ],
  };
}

export async function findAccessibleSubscriptions(
  em: EntityManager,
  userId: string,
  userLogin: string,
  subscriptionId?: string,
): Promise<Subscription[]> {
  const baseFilter = subscriptionAccessFilter(userId, userLogin);

  if (subscriptionId) {
    const sub = await em.findOne(Subscription, {
      id: subscriptionId,
      ...(baseFilter as object),
    });
    if (!sub) return [];
    return [sub];
  }

  return em.find(Subscription, baseFilter);
}
