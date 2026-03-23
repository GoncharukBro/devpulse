import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionShare } from '../../entities/subscription-share.entity';
import type { ShareRole } from '../../entities/subscription-share.entity';
import { NotFoundError, ValidationError, AppError } from '../../common/errors';

const MAX_SHARES_PER_SUBSCRIPTION = 50;
const VALID_ROLES: ShareRole[] = ['viewer', 'editor'];

async function getOwnedSubscription(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
): Promise<Subscription> {
  const sub = await em.findOne(Subscription, { id: subscriptionId, ownerId });
  if (!sub) throw new NotFoundError('Subscription not found');
  return sub;
}

export function isValidRole(role: unknown): role is ShareRole {
  return typeof role === 'string' && VALID_ROLES.includes(role as ShareRole);
}

export async function addShare(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
  ownerLogin: string,
  login: string,
  role: ShareRole = 'viewer',
): Promise<object> {
  const sub = await getOwnedSubscription(em, subscriptionId, ownerId);
  const normalizedLogin = login.trim().toLowerCase();

  if (!normalizedLogin) {
    throw new ValidationError('Login is required');
  }

  if (normalizedLogin === ownerLogin.toLowerCase()) {
    throw new ValidationError('Cannot share with yourself');
  }

  if (!isValidRole(role)) {
    throw new ValidationError(`Invalid role. Valid: ${VALID_ROLES.join(', ')}`);
  }

  const existingCount = await em.count(SubscriptionShare, { subscription: sub });
  if (existingCount >= MAX_SHARES_PER_SUBSCRIPTION) {
    throw new ValidationError(`Maximum ${MAX_SHARES_PER_SUBSCRIPTION} shares per subscription`);
  }

  const share = new SubscriptionShare();
  share.subscription = sub;
  share.sharedWithLogin = normalizedLogin;
  share.sharedBy = ownerLogin;
  share.role = role;

  try {
    em.persist(share);
    await em.flush();
  } catch (err) {
    if (err instanceof UniqueConstraintViolationException) {
      throw new AppError(409, 'Already shared with this user');
    }
    throw err;
  }

  return {
    id: share.id,
    sharedWithLogin: share.sharedWithLogin,
    sharedBy: share.sharedBy,
    role: share.role,
    createdAt: share.createdAt.toISOString(),
  };
}

export async function listShares(
  em: EntityManager,
  subscriptionId: string,
  ownerId: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ items: object[]; total: number }> {
  await getOwnedSubscription(em, subscriptionId, ownerId);

  const offset = (page - 1) * limit;
  const [shares, total] = await em.findAndCount(
    SubscriptionShare,
    { subscription: { id: subscriptionId } },
    { orderBy: { createdAt: 'DESC' }, limit, offset },
  );

  return {
    items: shares.map((s) => ({
      id: s.id,
      sharedWithLogin: s.sharedWithLogin,
      sharedBy: s.sharedBy,
      role: s.role,
      createdAt: s.createdAt.toISOString(),
    })),
    total,
  };
}

export async function updateShareRole(
  em: EntityManager,
  subscriptionId: string,
  shareId: number,
  ownerId: string,
  role: ShareRole,
): Promise<object> {
  await getOwnedSubscription(em, subscriptionId, ownerId);

  if (!isValidRole(role)) {
    throw new ValidationError(`Invalid role. Valid: ${VALID_ROLES.join(', ')}`);
  }

  const share = await em.findOne(SubscriptionShare, {
    id: shareId,
    subscription: { id: subscriptionId },
  });

  if (!share) throw new NotFoundError('Share not found');

  share.role = role;
  await em.flush();

  return {
    id: share.id,
    sharedWithLogin: share.sharedWithLogin,
    sharedBy: share.sharedBy,
    role: share.role,
    createdAt: share.createdAt.toISOString(),
  };
}

export async function removeShare(
  em: EntityManager,
  subscriptionId: string,
  shareId: number,
  ownerId: string,
): Promise<void> {
  await getOwnedSubscription(em, subscriptionId, ownerId);

  const share = await em.findOne(SubscriptionShare, {
    id: shareId,
    subscription: { id: subscriptionId },
  });

  if (share) {
    await em.removeAndFlush(share);
  }
}
