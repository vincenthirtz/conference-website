import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { rebuildRatings } from '@/utils/rating/applyMatchRating';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60_000 },
      'admin-ratings-rebuild'
    )
  )
    return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await rebuildRatings(ctx.tenantId);

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'player_ratings',
      entity_id: null,
      tenant_id: ctx.tenantId,
      payload: {
        operation: 'rating_rebuild',
        players: result.players,
        matches: result.matches,
      },
    });
  } catch (e) {
    logger.error('[admin/ratings/rebuild] logStaffAction error', e);
  }

  return res.status(200).json(result);
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'ratings-rebuild' }),
  'manager'
);
