// features/admin/communications/service.ts

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
import {
  computeSubscriptionStats,
  type SubscriptionStats,
} from '@/utils/broadcasts';

export async function getSubscriptionStats(
  ctx: ServiceContext
): Promise<SubscriptionStats> {
  try {
    return await computeSubscriptionStats();
  } catch (err: unknown) {
    ctx.logger.error('[broadcast/subscriptions] error:', err);
    throw new AdminError(
      500,
      'internal',
      'Echec du chargement des abonnements'
    );
  }
}
