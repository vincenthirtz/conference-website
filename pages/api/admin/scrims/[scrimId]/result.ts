// pages/api/admin/scrims/[scrimId]/result.ts
//
// POST — le staff saisit (ou corrige) le score FINAL d'un scrim.
//
// Pourquoi une route à part plutôt qu'un champ de plus au PATCH : jusqu'ici un
// résultat de scrim ne naissait QUE de l'accord des deux capitaines
// (`/api/player/scrims/[scrimId]/report`). Deux cas restaient sans issue :
//   * un scrim contre une équipe EXTÉRIEURE (créée à la volée, sans capitaine,
//     cf. utils/teams/externalScrimTeam.ts) : personne pour rapporter ;
//   * un scrim `disputed` : le staff pouvait le rouvrir, pas le trancher.
// Fixer un score n'est pas « modifier un champ » : ça clôt le scrim, aligne le
// miroir noté, purge les reports et annonce la fin. Le PATCH reste celui des
// champs ; cette route porte la décision, avec sa propre trace d'audit.
//
// EFFETS DE BORD, alignés sur une clôture par accord des capitaines :
//   1. écriture `completed` + scores + vainqueur (nul permis) — conditionnelle
//      au statut lu (409 `SCRIM_CHANGED`), cf. `applyStaffScrimResult` ;
//   2. miroir noté (`syncScrimRatedMatch`) → rating + récompenses TCG, clées
//      sur le scrim : une correction ne paie jamais deux fois ;
//   3. purge des reports capitaines ;
//   4. `scrim.finished` au bot — UNE fois : pas sur une correction ;
//   5. `logStaffAction` avec l'avant / l'après.
//
// Statuts acceptés : draft / scheduled / running / disputed / completed.
// `cancelled` → 409 : un scrim annulé se réinstaure d'abord par le PATCH.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction } from '@/utils/staffLogs';
import { emitScrimEvent } from '@/utils/scrimEvents';
import {
  applyStaffScrimResult,
  STAFF_SCRIM_RESULT_STATUSES,
} from '@/utils/scrims/scrimResult';
import {
  purgeScoreReports,
  type PurgedScoreReport,
} from '@/utils/matches/scoreReports';
import { logger } from '@/utils/logger';

const querySchema = z.object({ scrimId: z.string().uuid() });

const bodySchema = z.object({
  team1_score: z.number().int().min(0).max(99),
  team2_score: z.number().int().min(0).max(99),
});

type ScrimBefore = {
  id: string;
  name: string;
  slug: string;
  status: string;
  ranked: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  dispute_reason: string | null;
};

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'scrim-result' }),
  { permission: 'manage_teams' }
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const parsedQuery = querySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: 'scrimId invalide' });
  }
  const { scrimId } = parsedQuery.data;

  const parsedBody = bodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return res.status(400).json({
      error: 'Scores invalides : deux entiers entre 0 et 99 attendus.',
      code: 'INVALID_BODY',
    });
  }
  const { team1_score: team1Score, team2_score: team2Score } = parsedBody.data;

  const { data: beforeRow, error: readErr } = await supabaseAdmin
    .from('scrims')
    .select(
      'id, name, slug, status, ranked, team1_id, team2_id, team1_score, team2_score, winner_team_id, dispute_reason'
    )
    .eq('id', scrimId)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (readErr) {
    logger.error('[admin/scrims/:id/result] read error', readErr);
    return res.status(500).json({ error: 'Erreur de lecture du scrim.' });
  }
  if (!beforeRow) {
    return res.status(404).json({ error: 'Scrim introuvable.' });
  }
  const before = beforeRow as unknown as ScrimBefore;

  if (!STAFF_SCRIM_RESULT_STATUSES.has(before.status)) {
    return res.status(409).json({
      error:
        'Scrim annulé : réinstaure-le (statut) avant de saisir un résultat.',
      code: 'SCRIM_CANCELLED',
    });
  }
  if (!before.team1_id || !before.team2_id) {
    return res.status(400).json({
      error: 'Scrim incomplet (équipes non assignées).',
      code: 'SCRIM_TEAMS_MISSING',
    });
  }

  const applied = await applyStaffScrimResult(
    ctx.tenantId,
    { id: scrimId, team1_id: before.team1_id, team2_id: before.team2_id },
    before.status,
    team1Score,
    team2Score
  );
  if (!applied.ok) {
    return res
      .status(applied.status)
      .json(
        applied.code
          ? { error: applied.error, code: applied.code }
          : { error: applied.error }
      );
  }

  // Purge des reports capitaines APRÈS l'écriture, et non avant comme le PATCH
  // de réouverture. Là-bas le statut d'arrivée est reportable : purger après
  // laisserait un intervalle où un ancien report compte encore. Ici le statut
  // d'arrivée est `completed`, que la route de report refuse (SCRIM_CLOSED) et
  // que ses écritures conditionnelles épargnent : aucun report ne peut plus
  // clore ni mettre en litige ce scrim. Purger avant ferait perdre les reports
  // d'un scrim que le 409 SCRIM_CHANGED n'aurait finalement pas touché.
  // La purge est donc de l'hygiène : un report périmé ne doit ni s'afficher
  // face au score staff, ni redevenir un vote si le scrim est rouvert un jour.
  // Un échec est loggé mais ne défait pas un résultat déjà persisté.
  let purgedReports: PurgedScoreReport[] = [];
  let reportsPurged = true;
  const purge = await purgeScoreReports('scrim', ctx.tenantId, scrimId);
  if (purge.ok) {
    purgedReports = purge.purged;
  } else {
    reportsPurged = false;
    logger.error('[admin/scrims/:id/result] purge failed', purge.error);
  }

  const wasCompleted = before.status === 'completed';
  // Une correction qui retire ou change un vainqueur DÉJÀ noté n'est pas
  // re-notée incrémentalement (cf. `applyStaffScrimResult`) : on le signale
  // pour que l'interface propose le rebuild du classement. Un nul corrigé en
  // victoire n'est pas concerné — il n'avait jamais été noté, la synchro le
  // note (et le paie) pour la première fois.
  const ratingRebuildAdvised =
    wasCompleted &&
    before.winner_team_id !== null &&
    before.winner_team_id !== applied.winnerTeamId;

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'scrim',
        entity_id: scrimId,
        tournament_id: null,
        payload: {
          subject: 'scrim_result',
          before: {
            status: before.status,
            team1_score: before.team1_score,
            team2_score: before.team2_score,
            winner_team_id: before.winner_team_id,
            dispute_reason: before.dispute_reason,
          },
          after: {
            status: 'completed',
            team1_score: team1Score,
            team2_score: team2Score,
            winner_team_id: applied.winnerTeamId,
          },
          correction: wasCompleted,
          purged_reports: purgedReports,
          ...(reportsPurged ? {} : { purge_failed: true }),
        },
      });
    } catch (e) {
      logger.error('[admin/scrims/:id/result] log error', e);
    }
  }

  // `scrim.finished` est une ANNONCE (« scrim terminé » dans #scrims) : elle
  // part à la clôture, pas à chaque correction — même règle que le PATCH, où
  // `statusTransitionEvent('completed', 'completed')` ne rend rien. On passe
  // par `emitScrimEvent` (noms d'équipes résolus, ce que lit l'embed du bot) et
  // on y joint les champs du report capitaine (scores, vainqueur, `ranked`).
  if (!wasCompleted) {
    void emitScrimEvent(
      'scrim.finished',
      applied.scrim as unknown as Parameters<typeof emitScrimEvent>[1],
      ctx.tenantId,
      {
        previousStatus: before.status,
        team1Score,
        team2Score,
        winnerTeamId: applied.winnerTeamId,
        ranked: before.ranked !== false,
        decidedBy: 'staff',
      }
    );
  }

  return res.status(200).json({
    success: true,
    scrim: applied.scrim,
    winner_team_id: applied.winnerTeamId,
    correction: wasCompleted,
    purged_reports: purgedReports.length,
    rating_rebuild_advised: ratingRebuildAdvised,
  });
}
