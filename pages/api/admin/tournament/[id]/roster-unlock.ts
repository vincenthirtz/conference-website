// pages/api/admin/tournament/[id]/roster-unlock.ts
//
// POST   : ouvre une fenêtre de déverrouillage temporaire du roster.
// DELETE : la referme immédiatement.
//
// Pourquoi. Passé `roster_locked_at`, plus aucune équipe inscrite au tournoi ne
// peut toucher sa composition. C'est voulu — on ne change pas un roster la
// veille d'un match. Mais les cas légitimes existent : une joueuse se blesse,
// une remplaçante arrive, un oubli d'inscription se découvre la veille.
//
// La seule issue était `force=true`, réservé à l'admin. Autrement dit : c'était
// à l'admin de faire la manipulation À LA PLACE du capitaine, en devinant qui
// ajouter et avec quel BattleTag. Le capitaine, qui sait, ne pouvait rien.
//
// Cet endpoint inverse la charge : l'admin ouvre une fenêtre, le capitaine
// travaille. La fenêtre se referme SEULE — c'est tout l'intérêt d'une date
// plutôt que d'un booléen : un déverrouillage oublié redevient un verrou, pas
// une porte laissée ouverte.
//
// Portée : `manage_tournaments`, la même permission que la modification du
// tournoi (qui permet déjà de déplacer `roster_locked_at`). Ouvrir une fenêtre
// de trente minutes est un geste moins lourd que repousser la date de verrou.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

/**
 * Bornes de la fenêtre.
 *
 * Le minimum évite une fenêtre si courte qu'elle se referme avant que le
 * capitaine ait lu le message. Le maximum (24 h) est le vrai garde-fou : une
 * dérogation « une semaine » n'est plus une dérogation, c'est un verrou déplacé
 * — et pour ça il y a le champ `roster_locked_at`, qui a le mérite d'être
 * visible dans les réglages du tournoi.
 */
const MIN_MINUTES = 5;
const MAX_MINUTES = 24 * 60;
const DEFAULT_MINUTES = 60;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'admin-roster-unlock'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  // Deux verbes, deux gestes : un `switch` le dit mieux qu'une cascade de
  // négations, et c'est aussi ce que lit le garde-fou de dérive OpenAPI.
  switch (req.method) {
    case 'POST':
    case 'DELETE':
      break;
    default:
      res.setHeader('Allow', 'POST, DELETE');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tournament id.', code: 'INVALID_TOURNAMENT_ID' });
  }

  // Le tournoi doit appartenir au tenant actif : sans ce filtre, un id deviné
  // permettrait de déverrouiller le roster d'un autre espace.
  const { data: tournament, error: loadErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, roster_locked_at, roster_unlocked_until')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (loadErr) {
    logger.error('[admin/roster-unlock] tournament load error', loadErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tournament) {
    return res
      .status(404)
      .json({ error: 'Tournament not found.', code: 'UNKNOWN_TOURNAMENT' });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('tournaments')
      .update({ roster_unlocked_until: null })
      .eq('tenant_id', ctx.tenantId)
      .eq('id', id);
    if (error) {
      logger.error('[admin/roster-unlock] relock error', error);
      return res.status(500).json({ error: 'Failed to re-lock the roster.' });
    }

    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_tournament',
        entity_type: 'tournament',
        entity_id: id,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'roster_relock',
          tournamentName: tournament.name,
          // Ce qui était ouvert : la trace doit dire de quoi on a coupé court.
          previousUnlockedUntil: tournament.roster_unlocked_until ?? null,
        },
      });
    } catch (logErr) {
      logger.error('logStaffAction(roster_relock) error:', logErr);
    }

    return res.status(200).json({ rosterUnlockedUntil: null });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawMinutes =
    body.minutes === undefined ? DEFAULT_MINUTES : Number(body.minutes);
  if (
    !Number.isFinite(rawMinutes) ||
    !Number.isInteger(rawMinutes) ||
    rawMinutes < MIN_MINUTES ||
    rawMinutes > MAX_MINUTES
  ) {
    return res.status(400).json({
      error: `minutes doit être un entier entre ${MIN_MINUTES} et ${MAX_MINUTES}.`,
      code: 'INVALID_MINUTES',
    });
  }

  // La fenêtre part de MAINTENANT, pas de la fin d'une fenêtre déjà ouverte :
  // « encore 30 minutes » doit vouloir dire 30 minutes, pas 30 de plus qu'un
  // reste qu'on aurait oublié.
  const until = new Date(Date.now() + rawMinutes * 60_000).toISOString();

  const { error } = await supabaseAdmin
    .from('tournaments')
    .update({ roster_unlocked_until: until })
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id);
  if (error) {
    logger.error('[admin/roster-unlock] unlock error', error);
    return res.status(500).json({ error: 'Failed to unlock the roster.' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_tournament',
      entity_type: 'tournament',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: {
        action: 'roster_unlock',
        tournamentName: tournament.name,
        minutes: rawMinutes,
        until,
      },
    });
  } catch (logErr) {
    logger.error('logStaffAction(roster_unlock) error:', logErr);
  }

  return res.status(200).json({
    rosterUnlockedUntil: until,
    minutes: rawMinutes,
    // Informatif : une fenêtre sur un tournoi jamais verrouillé ne change rien,
    // autant que l'appelant puisse le dire à l'écran.
    rosterLockedAt: tournament.roster_locked_at ?? null,
  });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-roster-unlock' }),
  { permission: 'manage_tournaments' }
);
