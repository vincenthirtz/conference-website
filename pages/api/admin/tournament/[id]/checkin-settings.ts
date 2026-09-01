// pages/api/admin/tournament/[id]/checkin-settings.ts
// Per-tournament check-in configuration (T2).
// - GET   : read the current check-in grace window + a map of no-show reasons
//           per match. Both are fetched DEFENSIVELY: the underlying columns
//           (tournaments.checkin_grace_minutes / matches.no_show_reason) may
//           not exist yet if the migration hasn't been applied — in that case
//           we fall back to defaults instead of breaking the page.
// - PATCH  : update tournaments.checkin_grace_minutes (0..120). If the column
//           is missing we return a clear, actionable 503 instead of an opaque
//           500 so the operator knows the migration is pending.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { supabaseAdmin } from '@/utils/supabase';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '../../../../../utils/logger';

const DEFAULT_GRACE_MINUTES = 60;
const MIN_GRACE_MINUTES = 0;
const MAX_GRACE_MINUTES = 120;

// Postgres "undefined column" error code (covers missing column in select/update).
const PG_UNDEFINED_COLUMN = '42703';

export default withStaffRoute(handler, { permission: 'run_checkin' });

function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === PG_UNDEFINED_COLUMN) return true;
  // Defensive: PostgREST sometimes surfaces this as a message rather than code.
  const msg = (e.message || '').toLowerCase();
  return (
    msg.includes('checkin_grace_minutes') ||
    msg.includes('no_show_reason') ||
    (msg.includes('column') && msg.includes('does not exist'))
  );
}

/**
 * Defensive read of tournaments.checkin_grace_minutes.
 * Isolated query so a missing column never breaks the rest of the page.
 */
async function readGraceMinutes(
  tenantId: string,
  tournamentId: string
): Promise<{ value: number; migrated: boolean }> {
  if (!supabaseAdmin) return { value: DEFAULT_GRACE_MINUTES, migrated: false };
  try {
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select('checkin_grace_minutes')
      .eq('tenant_id', tenantId)
      .eq('id', tournamentId)
      .maybeSingle();

    if (error) {
      if (isMissingColumnError(error)) {
        return { value: DEFAULT_GRACE_MINUTES, migrated: false };
      }
      logger.error('[checkin-settings] readGraceMinutes error:', error);
      return { value: DEFAULT_GRACE_MINUTES, migrated: true };
    }

    const raw = (data as { checkin_grace_minutes?: number | null } | null)
      ?.checkin_grace_minutes;
    const value =
      typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : DEFAULT_GRACE_MINUTES;
    return { value, migrated: true };
  } catch (err) {
    if (isMissingColumnError(err)) {
      return { value: DEFAULT_GRACE_MINUTES, migrated: false };
    }
    logger.error('[checkin-settings] readGraceMinutes exception:', err);
    return { value: DEFAULT_GRACE_MINUTES, migrated: false };
  }
}

/**
 * Defensive read of matches.no_show_reason for this tournament.
 * Returns a map matchId -> reason. Empty map if the column doesn't exist yet.
 */
async function readNoShowReasons(
  tenantId: string,
  tournamentId: string
): Promise<Record<string, string>> {
  if (!supabaseAdmin) return {};
  try {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select('id, no_show_reason')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .not('no_show_reason', 'is', null);

    if (error) {
      if (!isMissingColumnError(error)) {
        logger.error('[checkin-settings] readNoShowReasons error:', error);
      }
      return {};
    }

    const map: Record<string, string> = {};
    for (const row of (data || []) as Array<{
      id: string;
      no_show_reason: string | null;
    }>) {
      if (row.no_show_reason) map[row.id] = row.no_show_reason;
    }
    return map;
  } catch (err) {
    if (!isMissingColumnError(err)) {
      logger.error('[checkin-settings] readNoShowReasons exception:', err);
    }
    return {};
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }
  const tournamentId = String(id);

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable' });
  }

  try {
    if (req.method === 'GET') {
      const [grace, noShowReasons] = await Promise.all([
        readGraceMinutes(ctx.tenantId, tournamentId),
        readNoShowReasons(ctx.tenantId, tournamentId),
      ]);
      return res.status(200).json({
        checkinGraceMinutes: grace.value,
        migrated: grace.migrated,
        noShowReasons,
      });
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as { checkinGraceMinutes?: unknown };
      const raw = body.checkinGraceMinutes;
      const minutes =
        typeof raw === 'string' ? Number(raw) : (raw as number | undefined);

      if (
        typeof minutes !== 'number' ||
        !Number.isInteger(minutes) ||
        minutes < MIN_GRACE_MINUTES ||
        minutes > MAX_GRACE_MINUTES
      ) {
        return res.status(400).json({
          error: `checkinGraceMinutes doit être un entier entre ${MIN_GRACE_MINUTES} et ${MAX_GRACE_MINUTES}`,
        });
      }

      const { error } = await supabaseAdmin
        .from('tournaments')
        .update({ checkin_grace_minutes: minutes })
        .eq('tenant_id', ctx.tenantId)
        .eq('id', tournamentId);

      if (error) {
        if (isMissingColumnError(error)) {
          return res.status(503).json({
            error:
              'Réglage indisponible : la migration check-in (checkin_grace_minutes) n’a pas encore été appliquée.',
          });
        }
        logger.error('[checkin-settings] PATCH update error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (ctx?.staff?.id) {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'update_tournament',
          entity_type: 'tournament',
          entity_id: tournamentId,
          tournament_id: tournamentId,
          tenant_id: ctx.tenantId,
          payload: {
            kind: 'checkin_settings_update',
            checkin_grace_minutes: minutes,
          },
        });
      }

      return res
        .status(200)
        .json({ success: true, checkinGraceMinutes: minutes });
    }

    res.setHeader('Allow', 'GET,PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    logger.error('[admin/tournament/checkin-settings] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
