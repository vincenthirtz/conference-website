// pages/api/admin/tournament/[id]/schedule-move.ts
//
// Déplacer un ou plusieurs matchs, avec l'aperçu d'impact d'abord — lot 5 de
// docs/PLAN-plateforme-tournois.md.
//
// POST `{ moves: [{ matchId, scheduledAt }], apply?, force? }`
//   → `{ impact, applied }`
//
// POURQUOI UNE LISTE DE MOUVEMENTS. L'unité utile n'est pas le déplacement,
// c'est l'ÉCHANGE : deux matchs qui permutent leurs créneaux ne se jugent
// qu'ensemble — chacun pris seul écrase l'autre, et l'aperçu de l'un montrerait
// une collision que le second mouvement fait disparaître.
//
// POURQUOI L'APERÇU AVANT L'ÉCRITURE. Un déplacement de match n'est jamais
// local. C'est la leçon du 06/09 : sortir une équipe d'une soirée en saturait
// une autre, et il fallait rejouer tout le calendrier pour s'en apercevoir.
// `apply: false` (le DÉFAUT) rejoue le calendrier sans rien écrire.
//
// LE GARDE-FOU. Une écriture qui créerait une anomalie BLOQUANTE est refusée en
// 409 avec son impact ; `force: true` passe outre. Refuser par défaut plutôt
// que prévenir : le staff a déjà vu l'aperçu, un avertissement de plus serait
// du bruit, tandis qu'un refus fait relire.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { isValidUUID } from '@/utils/apiHelpers';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { loadScheduleContext } from '@/utils/matches/scheduleContext';
import { previewMoves } from '@/utils/matches/scheduleDiagnostics';

/** Huit mouvements : au-delà, ce n'est plus un geste, c'est un auto-scheduler. */
const MAX_MOVES = 8;

const bodySchema = z.object({
  moves: z
    .array(
      z.object({
        matchId: z.string().uuid(),
        scheduledAt: z.string().datetime({ offset: true }).nullable(),
      })
    )
    .min(1)
    .max(MAX_MOVES),
  apply: z.boolean().optional(),
  force: z.boolean().optional(),
  rest: z.number().int().min(0).max(240).optional(),
  concurrent: z.number().int().min(1).max(32).optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const raw = req.query.id;
  const tournamentId = Array.isArray(raw) ? raw[0] : raw;
  if (!tournamentId || !isValidUUID(tournamentId)) {
    return res
      .status(400)
      .json({ error: 'Invalid tournament id', code: 'INVALID_TOURNAMENT_ID' });
  }

  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'admin-schedule-move')) {
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { moves, apply = false, force = false } = parsed.data;

  // Un match ne peut pas recevoir deux destinations dans la même requête :
  // l'ordre déciderait silencieusement du gagnant.
  const ids = moves.map((m) => m.matchId);
  if (new Set(ids).size !== ids.length) {
    return res
      .status(400)
      .json({ error: 'Un match apparaît deux fois.', code: 'DUPLICATE_MATCH' });
  }

  try {
    const context = await loadScheduleContext(ctx.tenantId, tournamentId);
    if (!context) {
      return res
        .status(404)
        .json({ error: 'Tournament not found', code: 'TOURNAMENT_NOT_FOUND' });
    }

    const known = new Set(context.matches.map((m) => m.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return res.status(404).json({
        error: 'Match hors de ce tournoi.',
        code: 'MATCH_NOT_IN_TOURNAMENT',
        matchIds: unknown,
      });
    }

    const impact = previewMoves(context.matches, context.constraints, moves, {
      timezone: context.tournament.timezone,
      tournamentStart: context.tournament.startDate,
      tournamentEnd: context.tournament.endDate,
      teamRestMinutes: parsed.data.rest ?? 30,
      maxConcurrentMatches: parsed.data.concurrent ?? 1,
    });

    if (!apply) {
      return res.status(200).json({ impact, applied: false });
    }

    if (impact.createsBlocking && !force) {
      return res.status(409).json({
        error: 'Ce déplacement crée une anomalie bloquante.',
        code: 'WOULD_CREATE_BLOCKING',
        impact,
        applied: false,
      });
    }

    // Écriture match par match. Pas de transaction : PostgREST n'en expose pas,
    // et un échange à moitié appliqué reste lisible dans le diagnostic — c'est
    // exactement ce que l'écran suivant montrera. Un échec partiel est signalé,
    // jamais avalé.
    const before = new Map(
      context.matches.map((m) => [m.id, m.scheduledAt ?? null])
    );
    const written: string[] = [];
    const failed: string[] = [];

    for (const move of moves) {
      const { error } = await supabaseAdmin
        .from('matches')
        .update({
          scheduled_at: move.scheduledAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', move.matchId)
        .eq('tenant_id', ctx.tenantId)
        .eq('tournament_id', tournamentId);

      if (error) {
        logger.error('[admin/schedule-move] update failed', error, {
          matchId: move.matchId,
        });
        failed.push(move.matchId);
      } else {
        written.push(move.matchId);
      }
    }

    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'match_rescheduled',
      entity_type: 'tournament',
      entity_id: tournamentId,
      tenant_id: ctx.tenantId,
      tournament_id: tournamentId,
      payload: {
        // Liste plate des matchs touchés, en plus du détail : c'est ce qui rend
        // la ligne retrouvable depuis la fiche d'UN match, sans fouiller un
        // tableau imbriqué. Un échange se journalise en une décision, mais se
        // relit depuis chacun des deux matchs.
        match_ids: moves.map((m) => m.matchId),
        moves: moves.map((m) => ({
          match_id: m.matchId,
          from: before.get(m.matchId) ?? null,
          to: m.scheduledAt,
        })),
        // Ce que le staff SAVAIT en décidant : c'est la moitié utile du journal.
        fixed: impact.fixed.length,
        broken: impact.broken.length,
        forced: force && impact.createsBlocking,
        failed: failed.length > 0 ? failed : undefined,
      },
    });

    // Événements bot : même contrat que le PATCH match, pour que l'event Discord
    // natif suive un déplacement d'où qu'il vienne.
    for (const move of moves) {
      if (!written.includes(move.matchId)) continue;
      if (before.get(move.matchId) === move.scheduledAt) continue;
      if (move.scheduledAt) {
        const previous = before.get(move.matchId) ?? null;
        void (async () => {
          const enriched = await enrichMatchEvent(move.matchId);
          await emitBotEvent(
            'match.scheduled',
            {
              matchId: move.matchId,
              tournamentId,
              scrimId: null,
              scheduledAt: move.scheduledAt,
              enriched,
            },
            ctx.tenantId
          );
          // Le match avait DÉJÀ une date : ce n'est pas une planification, c'est
          // un déplacement, et les deux équipes doivent l'apprendre autrement
          // qu'en relisant le calendrier. `match.scheduled` reste émis pour le
          // bot (event Discord natif) ; `match.rescheduled` porte la
          // notification aux joueuses.
          if (previous) {
            await emitBotEvent(
              'match.rescheduled',
              {
                match_id: move.matchId,
                matchId: move.matchId,
                tournamentId,
                from: previous,
                to: move.scheduledAt,
                enriched,
              },
              ctx.tenantId
            );
          }
        })().catch((e) =>
          logger.error('[botEvents] match.scheduled emit error:', e)
        );
      } else {
        void emitBotEvent(
          'match.unscheduled',
          { matchId: move.matchId },
          ctx.tenantId
        ).catch((e) =>
          logger.error('[botEvents] match.unscheduled emit error:', e)
        );
      }
    }

    if (failed.length > 0) {
      return res.status(500).json({
        error: 'Certains déplacements ont échoué.',
        code: 'PARTIAL_WRITE',
        impact,
        applied: written,
        failed,
      });
    }

    return res.status(200).json({ impact, applied: true, moved: written });
  } catch (err) {
    logger.error('[admin/schedule-move] error', err, { tournamentId });
    return res.status(500).json({ error: 'Server error.' });
  }
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-schedule-move' }),
  { permission: 'manage_tournaments' }
);
