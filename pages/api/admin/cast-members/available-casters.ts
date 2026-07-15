import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../../utils/logger';

type AvailableCaster = {
  authUserId: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  linkedCastMemberId: string | null;
  /** True si le caster a deja un cast_assignment dans la fenetre demandee. */
  conflictsWithWindow?: boolean;
};

const WINDOW_HOURS_DEFAULT = 2;
const WINDOW_HOURS_MAX = 12;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-available-casters'
    )
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  const { data: casters, error: staffErr } = await admin
    .from('staff')
    .select('auth_user_id, display_name, email, avatar_url')
    .eq('role', 'caster');

  if (staffErr) {
    logger.error('[admin/available-casters] staff list error', staffErr);
    return res.status(500).json({ error: 'Failed to load staff.' });
  }

  const userIds = (casters ?? []).map((c) => c.auth_user_id);
  let linkedMap = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: links, error: linksErr } = await admin
      .from('cast_members')
      .select('id, auth_user_id')
      .eq('tenant_id', ctx.tenantId)
      // Les fiches internes (auto-provision admin/owner) ne sont pas
      // assignables à un match : on les exclut de la liste des casteurs liés.
      .eq('is_internal', false)
      .in('auth_user_id', userIds);

    if (linksErr) {
      logger.error('[admin/available-casters] links error', linksErr);
      return res.status(500).json({ error: 'Failed to load existing links.' });
    }

    linkedMap = new Map(
      (links ?? [])
        .filter((l) => l.auth_user_id)
        .map((l) => [l.auth_user_id as string, l.id])
    );
  }

  // Optionnel : si matchScheduledAt est fourni, on cherche les cast_assignments
  // existants des cast_members liés dont le match est planifié dans la
  // fenêtre [scheduledAt - windowHours, scheduledAt + windowHours]. Ces
  // casters sont marqués conflictsWithWindow=true pour que la UI les
  // grise ou les retire.
  const matchScheduledAtParam = req.query.matchScheduledAt;
  const matchScheduledAt =
    typeof matchScheduledAtParam === 'string' ? matchScheduledAtParam : null;
  const windowHoursParam = req.query.windowHours;
  const windowHoursRaw =
    typeof windowHoursParam === 'string' ? Number(windowHoursParam) : NaN;
  const windowHours = Number.isFinite(windowHoursRaw)
    ? Math.min(Math.max(windowHoursRaw, 0.5), WINDOW_HOURS_MAX)
    : WINDOW_HOURS_DEFAULT;

  let conflictingCastMemberIds = new Set<string>();
  if (matchScheduledAt && !Number.isNaN(Date.parse(matchScheduledAt))) {
    const t = new Date(matchScheduledAt).getTime();
    const lo = new Date(t - windowHours * 3_600_000).toISOString();
    const hi = new Date(t + windowHours * 3_600_000).toISOString();

    // On fetch les cast_assignments + match.scheduled_at via join, filtrés
    // sur la fenêtre. PostgREST permet le filtre sur la relation imbriquée.
    const { data: busy, error: busyErr } = await admin
      .from('cast_assignments')
      .select('cast_member_id, match:match_id!inner(id, scheduled_at)')
      .eq('tenant_id', ctx.tenantId)
      .gte('match.scheduled_at', lo)
      .lte('match.scheduled_at', hi);
    if (busyErr) {
      logger.error('[admin/available-casters] busy lookup error', busyErr);
      // On ne fait pas planter la route — on continue sans flag conflict.
    } else if (busy) {
      conflictingCastMemberIds = new Set(
        busy
          .map((b: { cast_member_id: string }) => b.cast_member_id)
          .filter(Boolean)
      );
    }
  }

  const items: AvailableCaster[] = (casters ?? []).map((c) => {
    const linkedId = linkedMap.get(c.auth_user_id) ?? null;
    return {
      authUserId: c.auth_user_id,
      displayName: c.display_name,
      email: c.email,
      avatarUrl: c.avatar_url,
      linkedCastMemberId: linkedId,
      conflictsWithWindow:
        linkedId !== null && conflictingCastMemberIds.has(linkedId),
    };
  });

  return res.status(200).json({ items, windowHours });
}

export default withStaffRoute(handler, 'admin');
