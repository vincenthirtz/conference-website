// pages/api/player/scrims/[scrimId]/report.ts
//
// POST — une équipe rapporte le score d'un de ses scrims (prérequis du ladder).
//
// Décalque du report de match (pages/api/player/matches/[matchId]/report-score.ts) :
//   * un seul report      -> on attend l'adversaire (`awaiting_opponent`) ;
//   * deux concordants    -> scrim clos, résultat enregistré (`completed`) ;
//   * deux divergents     -> scrim en litige (`disputed`), arbitrage humain.
//
// Re-soumission supportée (upsert sur (scrim_id, team_side)) : une équipe peut
// corriger son report. Si sa correction rejoint le report adverse alors que le
// scrim était en litige, le litige se referme tout seul.
//
// UNE DIFFÉRENCE assumée avec le report de match : là-bas le droit est réservé
// au `captain_id` ; ici on exige la permission d'équipe `manage_scrims` (R2).
// Un scrim se pilote au quotidien — un manager doit pouvoir le clore sans
// dépendre de la disponibilité de la capitaine.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import {
  getManagedTeam,
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import {
  applyScrimResult,
  markScrimDisputed,
  reportsAgree,
  type ScrimReport,
} from '@/utils/scrims/scrimResult';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

/** Un scrim clos ou annulé ne se re-rapporte pas sans le staff. */
const TERMINAL_STATUSES = new Set(['cancelled']);

const bodySchema = z.object({
  team1Score: z.number().int().min(0).max(99),
  team2Score: z.number().int().min(0).max(99),
});

const querySchema = z.object({ scrimId: z.string().uuid() });

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'scrim-report')) {
    return;
  }

  const parsedQuery = querySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: 'Identifiant de scrim invalide.' });
  }
  const { scrimId } = parsedQuery.data;

  const parsedBody = bodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return res.status(400).json({
      error: 'Scores invalides : deux entiers entre 0 et 99 attendus.',
      code: 'INVALID_BODY',
    });
  }
  const { team1Score, team2Score } = parsedBody.data;

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  const access = await getManagedTeam(user.id, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }
  const denied = assertTeamPermission(access, 'manage_scrims');
  if (denied) return res.status(denied.status).json({ error: denied.error });

  const { data: scrim, error: scrimErr } = await supabaseAdmin
    .from('scrims')
    .select('id, status, team1_id, team2_id, name, ranked')
    .eq('tenant_id', tenantId)
    .eq('id', scrimId)
    .is('deleted_at', null)
    .maybeSingle();

  if (scrimErr) {
    logger.error('[scrim-report] lookup error', scrimErr);
    return res.status(500).json({ error: 'Erreur de lecture du scrim.' });
  }
  if (!scrim) return res.status(404).json({ error: 'Scrim introuvable.' });
  if (TERMINAL_STATUSES.has(scrim.status as string)) {
    return res.status(409).json({
      error: `Scrim ${scrim.status} : contacte le staff pour le modifier.`,
      code: 'SCRIM_CLOSED',
    });
  }
  if (!scrim.team1_id || !scrim.team2_id) {
    return res
      .status(400)
      .json({ error: 'Scrim incomplet (équipes non assignées).' });
  }

  // Le camp de l'appelante se déduit de l'équipe qu'elle gère.
  const mySide: 1 | 2 | null =
    access.teamId === scrim.team1_id
      ? 1
      : access.teamId === scrim.team2_id
        ? 2
        : null;
  if (!mySide) {
    return res.status(403).json({
      error: 'Ton équipe ne participe pas à ce scrim.',
      code: 'NOT_PARTICIPANT',
    });
  }

  const { error: upsertErr } = await supabaseAdmin
    .from('scrim_score_reports')
    .upsert(
      {
        tenant_id: tenantId,
        scrim_id: scrimId,
        team_side: mySide,
        reported_by_auth_user_id: user.id,
        team1_score: team1Score,
        team2_score: team2Score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'scrim_id,team_side' }
    );

  if (upsertErr) {
    logger.error('[scrim-report] upsert error', upsertErr);
    return res
      .status(500)
      .json({ error: "Échec de l'enregistrement du report." });
  }

  const { data: reportRows, error: reportsErr } = await supabaseAdmin
    .from('scrim_score_reports')
    .select('team_side, team1_score, team2_score')
    .eq('tenant_id', tenantId)
    .eq('scrim_id', scrimId);

  if (reportsErr) {
    logger.error('[scrim-report] reports read error', reportsErr);
    return res.status(500).json({ error: 'Erreur de lecture des reports.' });
  }

  const reports = (reportRows || []) as ScrimReport[];
  const mine = reports.find((r) => r.team_side === mySide);
  const theirs = reports.find((r) => r.team_side !== mySide);

  // Un seul camp s'est prononcé : rien ne bouge, on attend l'autre.
  if (!theirs || !mine) {
    return res.status(200).json({
      outcome: 'awaiting_opponent',
      scrimStatus: scrim.status,
    });
  }

  if (!reportsAgree(mine, theirs)) {
    const reason = `Reports divergents : ${mine.team1_score}-${mine.team2_score} vs ${theirs.team1_score}-${theirs.team2_score}.`;
    await markScrimDisputed(tenantId, scrimId, reason);
    return res.status(200).json({
      outcome: 'disputed',
      scrimStatus: 'disputed',
      reason,
    });
  }

  const applied = await applyScrimResult(
    tenantId,
    {
      id: scrimId,
      team1_id: scrim.team1_id as string,
      team2_id: scrim.team2_id as string,
    },
    team1Score,
    team2Score
  );

  if (!applied.ok) {
    return res.status(applied.status).json({ error: applied.error });
  }

  // Le bot annonce la fin du scrim dans le salon d'équipe. Fire-and-forget :
  // un échec d'émission ne remet pas en cause un résultat déjà persisté.
  void emitBotEvent(
    'scrim.finished',
    {
      scrimId,
      name: scrim.name ?? null,
      team1Id: scrim.team1_id,
      team2Id: scrim.team2_id,
      team1Score,
      team2Score,
      winnerTeamId: applied.winnerTeamId,
      ranked: scrim.ranked !== false,
    },
    tenantId
  ).catch((e) => logger.error('[scrim-report] scrim.finished emit error', e));

  return res.status(200).json({
    outcome: 'completed',
    scrimStatus: 'completed',
    winnerTeamId: applied.winnerTeamId,
  });
});
