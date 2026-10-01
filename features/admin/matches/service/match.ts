// features/admin/matches/service/match.ts — fiche d'un match côté staff :
// lecture, score (avec propagation bracket) ou méta-données, annulation et
// suppression.
//
// Le métier reste dans ses utils : score + propagation (applyMatchScore),
// purge des reports capitaines (scoreReports), événements bot (botEvents),
// planification Discord (scheduleEvents), garde TCG (paidMatches). Ce
// service n'en recopie rien : il ordonne, valide et garde les messages /
// codes des routes d'origine.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { notifyMatchStarting } from '@/utils/discord';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { emitScheduleEventsInBackground } from '@/utils/matches/scheduleEvents';
import {
  matchTransitionPurgesReports,
  purgeScoreReports,
  type PurgedScoreReport,
} from '@/utils/matches/scoreReports';
import { readPaidMatchIds } from '@/utils/tcg/paidMatches';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/matches';
import { MATCH_META_FIELDS } from '../schemas';
import { withInternalError } from './internal';

type Raw = Record<string, unknown>;

const LABEL = '[/api/admin/matches/[matchId]] error:';

const VALID_MATCH_STATUSES = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'postponed',
  'walkover',
];

const VALID_BRACKET_SIDES = ['wb', 'lb', 'final', 'none'];

/* -----------------------------------------------------------------------
 * GET : détail du match (+ `includeGames`)
 * --------------------------------------------------------------------- */

export async function getMatch(
  ctx: ServiceContext,
  matchId: string,
  includeGames: boolean
) {
  return withInternalError(ctx, LABEL, async () => {
    const { row, error } = await repo.getMatchDetail(
      ctx.db,
      ctx.tenantId,
      matchId,
      includeGames
    );
    if (error || !row) {
      ctx.logger.error('admin GET match error:', error);
      throw new LegacyAdminError(404, 'Match not found');
    }
    return { match: row };
  });
}

/* -----------------------------------------------------------------------
 * PUT / PATCH : mode « score » (applyMatchScore) ou mode « meta »
 * --------------------------------------------------------------------- */

export type UpdateMatchHooks = {
  /** Le score est écrit : revalidation ISR des pages publiques du match. */
  afterScore: () => Promise<void>;
};

function hasScorePayload(body: Raw): boolean {
  return (
    typeof body?.team1Score === 'number' && typeof body?.team2Score === 'number'
  );
}

export async function updateMatch(
  ctx: ServiceContext,
  matchId: string,
  body: Raw,
  hooks: UpdateMatchHooks
): Promise<Audited<unknown>> {
  return withInternalError(ctx, LABEL, async () => {
    const mode = body.mode as 'score' | 'meta' | undefined;

    // --- Verrou optimiste : `expected_updated_at` fourni → même version. ---
    const expected = body.expected_updated_at;
    if (expected) {
      const current = await repo.getMatchUpdatedAt(
        ctx.db,
        ctx.tenantId,
        matchId
      );
      if (current && current.updated_at !== expected) {
        throw new LegacyAdminError(
          409,
          'Ce match a été modifié par un autre utilisateur. Rechargez la page et réessayez.',
          {
            code: 'CONFLICT',
            extra: { server_updated_at: current.updated_at },
          }
        );
      }
    }

    // --- Tournoi terminé : ni score ni méta. Le statut courant sert aussi à
    // décider de la purge des reports capitaines (mode score). ---
    const matchForGuard = await repo.getMatchTournamentAndStatus(
      ctx.db,
      ctx.tenantId,
      matchId
    );
    if (matchForGuard?.tournament_id) {
      const tournament = await repo.getTournamentStatus(
        ctx.db,
        ctx.tenantId,
        matchForGuard.tournament_id
      );
      if (tournament?.status === 'completed') {
        throw new LegacyAdminError(
          403,
          'Impossible de modifier ce match : le tournoi est terminé (status=completed). Réouvrez le tournoi pour effectuer des modifications.',
          { code: 'TOURNAMENT_COMPLETED' }
        );
      }
    }

    if (mode === 'score' || hasScorePayload(body) || body.forfeit_team_id) {
      return updateScore(ctx, matchId, body, matchForGuard, hooks);
    }
    return updateMeta(ctx, matchId, body);
  });
}

async function updateScore(
  ctx: ServiceContext,
  matchId: string,
  body: Raw,
  matchForGuard: { tournament_id: string | null; status: string } | null,
  hooks: UpdateMatchHooks
): Promise<Audited<unknown>> {
  const {
    team1Score,
    team2Score,
    winnerTeamId,
    status,
    propagate = true,
    forfeit_team_id,
  } = body;

  // Scores obligatoires sauf en forfait (calculés par applyMatchScore).
  if (!forfeit_team_id) {
    if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
      throw new LegacyAdminError(
        400,
        'Missing numeric team1Score / team2Score'
      );
    }
    if (
      !Number.isInteger(team1Score) ||
      !Number.isInteger(team2Score) ||
      team1Score < 0 ||
      team2Score < 0
    ) {
      throw new LegacyAdminError(400, 'Scores must be integers >= 0');
    }
  }

  if (
    status !== undefined &&
    !VALID_MATCH_STATUSES.includes(status as string)
  ) {
    // Passer en 'disputed' DOIT passer par …/dispute (raison + auteur).
    if (status === 'disputed') {
      throw new LegacyAdminError(
        400,
        'Use POST /api/admin/matches/[matchId]/dispute to open a dispute.',
        { code: 'USE_DISPUTE_ENDPOINT' }
      );
    }
    throw new LegacyAdminError(
      400,
      `Invalid status. Allowed values: ${VALID_MATCH_STATUSES.join(', ')}`
    );
  }

  // Réouverture en mode score (statut reportable) : purge des reports
  // capitaines AVANT l'écriture, sinon deux anciens reports concordants
  // écraseraient ce score. Un statut clos (défaut : finished) fait foi et ne
  // purge pas. Match `disputed` exclu : applyMatchScore le refusera, et une
  // purge suivie d'un refus effacerait les reports d'un litige en cours.
  const purge =
    matchForGuard?.status !== 'disputed' &&
    matchTransitionPurgesReports(
      matchForGuard?.status as string | undefined,
      status as string | undefined
    )
      ? await purgeScoreReports('match', ctx.tenantId, matchId)
      : null;
  if (purge && !purge.ok) {
    throw new LegacyAdminError(500, `${purge.error} Match non modifié.`);
  }

  const result = await applyMatchScore({
    tenantId: ctx.tenantId,
    matchId,
    team1Score: team1Score as number | undefined,
    team2Score: team2Score as number | undefined,
    winnerTeamId: typeof winnerTeamId === 'string' ? winnerTeamId : undefined,
    forfeitTeamId:
      typeof forfeit_team_id === 'string' ? forfeit_team_id : undefined,
    status: status as Parameters<typeof applyMatchScore>[0]['status'],
    markFinished: status === 'finished' || (!status && !forfeit_team_id),
    staffId: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
    propagateBracket: propagate !== false,
  });

  // Le score est écrit : l'accueil et les pages du tournoi doivent le dire
  // sans attendre le prochain passage de l'ISR.
  await hooks.afterScore();

  // Journal : seulement quand la purge a effacé des reports (le score
  // lui-même est tracé par applyMatchScore).
  const purged = purge?.ok ? purge.purged : [];
  return {
    result,
    audit:
      purged.length > 0
        ? {
            entity_type: 'match',
            entity_id: matchId,
            tournament_id: matchForGuard?.tournament_id ?? null,
            payload: {
              mode: 'score',
              purged_reports: purged,
              from_status: matchForGuard?.status ?? null,
              to_status: status,
            },
          }
        : { skip: true },
  };
}

async function updateMeta(
  ctx: ServiceContext,
  matchId: string,
  body: Raw
): Promise<Audited<unknown>> {
  const updatePayload: Record<string, unknown> = {};
  for (const key of MATCH_META_FIELDS) {
    if (key in body) updatePayload[key] = body[key];
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new LegacyAdminError(
      400,
      "No valid meta fields in body. Use mode='score' for score updates."
    );
  }

  // Toujours mettre à jour updated_at pour le verrou optimiste.
  updatePayload.updated_at = new Date().toISOString();

  if ('status' in updatePayload) {
    if (updatePayload.status === 'disputed') {
      throw new LegacyAdminError(
        400,
        'Use POST /api/admin/matches/[matchId]/dispute to open a dispute.',
        { code: 'USE_DISPUTE_ENDPOINT' }
      );
    }
    if (
      typeof updatePayload.status !== 'string' ||
      !VALID_MATCH_STATUSES.includes(updatePayload.status)
    ) {
      throw new LegacyAdminError(
        400,
        `Invalid status. Allowed values: ${VALID_MATCH_STATUSES.join(', ')}`
      );
    }
  }

  // Planning / notes / lobby restent modifiables pendant un litige : la
  // liste blanche n'expose ni score ni vainqueur.

  if (
    'bracket_side' in updatePayload &&
    updatePayload.bracket_side !== null &&
    (typeof updatePayload.bracket_side !== 'string' ||
      !VALID_BRACKET_SIDES.includes(updatePayload.bracket_side))
  ) {
    throw new LegacyAdminError(
      400,
      `Invalid bracket_side. Allowed values: ${VALID_BRACKET_SIDES.join(', ')}`
    );
  }

  for (const slot of ['next_match_win_slot', 'next_match_lose_slot']) {
    if (
      slot in updatePayload &&
      updatePayload[slot] !== null &&
      updatePayload[slot] !== 1 &&
      updatePayload[slot] !== 2
    ) {
      throw new LegacyAdminError(400, `${slot} must be 1 or 2`);
    }
  }

  const { row: before, error: fetchErr } = await repo.getMatchRow(
    ctx.db,
    ctx.tenantId,
    matchId
  );
  if (fetchErr || !before) {
    throw new LegacyAdminError(404, 'Match not found');
  }

  // Références fournies : elles doivent appartenir au tenant (le client
  // service bypasse la RLS).
  const refChecks = [
    { field: 'tournament_id', table: 'tournaments' },
    { field: 'team1_id', table: 'teams' },
    { field: 'team2_id', table: 'teams' },
    { field: 'stage_id', table: 'tournament_stages' },
    { field: 'next_match_win_id', table: 'matches' },
    { field: 'next_match_lose_id', table: 'matches' },
  ] as const;
  const REF_LABEL = {
    tournaments: 'tournament',
    teams: 'team',
    tournament_stages: 'stage',
    matches: 'match',
  } as const;
  for (const { field, table } of refChecks) {
    if (!(field in updatePayload)) continue;
    const value = updatePayload[field];
    if (value === null) continue; // désassignation explicite : OK
    if (typeof value !== 'string' || !isValidUUID(value)) {
      throw new LegacyAdminError(400, `Invalid ${field}`);
    }
    if (!(await repo.refExistsInTenant(ctx.db, ctx.tenantId, table, value))) {
      throw new LegacyAdminError(
        400,
        `${field} does not reference a ${REF_LABEL[table]} of this tenant`,
        { code: 'CROSS_TENANT_REF' }
      );
    }
  }

  // Avertissement : planification hors des dates du tournoi.
  const warnings: string[] = [];
  const scheduledAtValue =
    'scheduled_at' in updatePayload
      ? updatePayload.scheduled_at
      : before.scheduled_at;
  if (scheduledAtValue && before.tournament_id) {
    const tournament = await repo.getTournamentDates(
      ctx.db,
      ctx.tenantId,
      before.tournament_id
    );
    if (tournament) {
      const scheduledTime = new Date(scheduledAtValue as string).getTime();
      if (
        tournament.start_date &&
        scheduledTime < new Date(tournament.start_date).getTime()
      ) {
        warnings.push(
          `Le match est planifié avant le début du tournoi (${tournament.start_date})`
        );
      }
      if (
        tournament.end_date &&
        scheduledTime > new Date(tournament.end_date).getTime()
      ) {
        warnings.push(
          `Le match est planifié après la fin du tournoi (${tournament.end_date})`
        );
      }
    }
  }

  // Format verrouillé dès que le match a quitté pending (historique).
  if (
    'match_format' in updatePayload &&
    updatePayload.match_format !== before.match_format &&
    before.status !== 'pending' &&
    before.status !== 'cancelled'
  ) {
    throw new LegacyAdminError(
      409,
      `Impossible de modifier le format d'un match dont le statut est "${before.status}". Repassez le match en pending (ou annulez-le) d'abord.`,
      {
        code: 'MATCH_FORMAT_LOCKED',
        extra: { currentStatus: before.status },
      }
    );
  }

  // Passage en 'ongoing' : verrou du veto (déverrouillage admin via …/veto).
  if (
    'status' in updatePayload &&
    updatePayload.status === 'ongoing' &&
    before.status !== 'ongoing' &&
    !before.veto_locked_at
  ) {
    updatePayload.veto_locked_at = new Date().toISOString();
  }

  // Réouverture d'un match clos ou en litige : purge des reports capitaines
  // AVANT l'écriture du statut (cf. utils/matches/scoreReports.ts). Échec de
  // purge → rien n'est modifié.
  let purgedReports: PurgedScoreReport[] | null = null;
  if (
    'status' in updatePayload &&
    matchTransitionPurgesReports(
      before.status as string | null,
      updatePayload.status as string
    )
  ) {
    const purge = await purgeScoreReports('match', ctx.tenantId, matchId);
    if (!purge.ok) {
      throw new LegacyAdminError(500, `${purge.error} Match non modifié.`);
    }
    purgedReports = purge.purged;
  }

  const { row: updated, error: updErr } = await repo.updateMatchRow(
    ctx.db,
    ctx.tenantId,
    matchId,
    updatePayload as TablesUpdate<'matches'>
  );
  if (updErr || !updated) {
    ctx.logger.error('admin PUT match meta error:', updErr);
    throw new LegacyAdminError(500, 'Failed to update match metadata');
  }

  if (
    'status' in updatePayload &&
    updatePayload.status === 'ongoing' &&
    before.status !== 'ongoing'
  ) {
    announceMatchStarting(ctx, matchId, updated);
  }

  // Scheduled event Discord + équipes prévenues (utils/matches/scheduleEvents).
  if ('scheduled_at' in updatePayload) {
    emitScheduleEventsInBackground(
      [
        {
          matchId,
          tournamentId: updated.tournament_id ?? null,
          scrimId: updated.scrim_id ?? null,
          previous: before.scheduled_at ?? null,
          next: updated.scheduled_at ?? null,
        },
      ],
      ctx.tenantId
    );
  }

  return {
    result: {
      match: updated,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    audit: {
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: updated.tournament_id ?? null,
      payload: {
        mode: 'meta',
        before,
        after: updated,
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(purgedReports ? { purged_reports: purgedReports } : {}),
      },
    },
  };
}

/** Match passé « ongoing » : Discord, bot (match.starting), régie auto. */
function announceMatchStarting(
  ctx: ServiceContext,
  matchId: string,
  updated: {
    tournament_id: string | null;
    scrim_id: string | null;
    team1_id: string | null;
    team2_id: string | null;
    scheduled_at: string | null;
    started_at: string | null;
    match_format: string | null;
    lobby_code: string | null;
    stream_url: string | null;
  }
) {
  void notifyMatchStartingForMatch(ctx, matchId).catch((e) =>
    ctx.logger.error('[discord] notifyMatchStarting error:', e)
  );
  // Payload enrichi : le bot crée le thread #matchs-live sans aller-retour.
  void (async () => {
    const enriched = await enrichMatchEvent(matchId);
    await emitBotEvent(
      'match.starting',
      {
        matchId,
        tournamentId: updated.tournament_id ?? null,
        scrimId: updated.scrim_id ?? null,
        team1Id: updated.team1_id ?? null,
        team2Id: updated.team2_id ?? null,
        scheduledAt: updated.scheduled_at ?? null,
        startedAt: updated.started_at ?? null,
        matchFormat: updated.match_format ?? null,
        lobbyCode: updated.lobby_code ?? null,
        streamUrl: updated.stream_url ?? null,
        enriched,
      },
      ctx.tenantId
    );
  })().catch((e) =>
    ctx.logger.error('[botEvents] match.starting emit error:', e)
  );
}

async function notifyMatchStartingForMatch(
  ctx: ServiceContext,
  matchId: string
): Promise<void> {
  const m = await repo.getMatchForStartingNotice(ctx.db, ctx.tenantId, matchId);
  if (!m || !m.team1 || !m.team2) return;

  const t1 = Array.isArray(m.team1) ? m.team1[0] : m.team1;
  const t2 = Array.isArray(m.team2) ? m.team2[0] : m.team2;
  const tn = Array.isArray(m.tournament) ? m.tournament[0] : m.tournament;
  if (!t1 || !t2) return;

  await notifyMatchStarting({
    tournamentId: m.tournament_id ?? null,
    tournamentName: tn?.name ?? null,
    matchId: m.id,
    roundName: m.round_name ?? null,
    matchFormat: m.match_format ?? null,
    lobbyCode: m.lobby_code ?? null,
    streamUrl: m.stream_url ?? null,
    scheduledAt: m.scheduled_at ?? null,
    team1: {
      name: t1.name,
      logoUrl: t1.logo_url ?? null,
      discordRoleId: t1.discord_role_id ?? null,
    },
    team2: {
      name: t2.name,
      logoUrl: t2.logo_url ?? null,
      discordRoleId: t2.discord_role_id ?? null,
    },
  });
}

/* -----------------------------------------------------------------------
 * DELETE : annulation (défaut) ou suppression physique (`?hard=1`)
 * --------------------------------------------------------------------- */

export async function deleteMatch(
  ctx: ServiceContext,
  matchId: string,
  hard: boolean
): Promise<Audited<{ success: true; hardDeleted: boolean }>> {
  return withInternalError(ctx, LABEL, async () => {
    const { row: match, error: fetchErr } = await repo.getMatchRow(
      ctx.db,
      ctx.tenantId,
      matchId
    );
    if (fetchErr || !match) {
      throw new LegacyAdminError(404, 'Match not found');
    }

    if (hard) {
      // Un match qui a payé des récompenses TCG ne se supprime pas : on
      // l'annule. Lecture en échec = refus (jamais conclure « rien payé »).
      const paidRead = await readPaidMatchIds(ctx.tenantId, [matchId]);
      if (!paidRead.ok) {
        throw new LegacyAdminError(
          500,
          'Impossible de vérifier les récompenses TCG de ce match : suppression annulée.',
          { code: 'TCG_REWARDS_UNREADABLE' }
        );
      }
      if (paidRead.paid.has(matchId)) {
        throw new LegacyAdminError(
          409,
          'Ce match a déjà distribué des récompenses TCG : annule-le plutôt que de le supprimer.',
          { code: 'MATCH_HAS_TCG_REWARDS' }
        );
      }

      const { error } = await repo.hardDeleteMatch(
        ctx.db,
        ctx.tenantId,
        matchId
      );
      if (error) {
        ctx.logger.error('admin hard delete match error:', error);
        throw new LegacyAdminError(500, 'Failed to hard-delete match');
      }
      return {
        result: { success: true, hardDeleted: true },
        audit: {
          action: 'delete_match',
          entity_type: 'match',
          entity_id: matchId,
          tournament_id: match.tournament_id ?? null,
          payload: { hard_delete: true },
        },
      };
    }

    const { error } = await repo.cancelMatch(ctx.db, ctx.tenantId, matchId);
    if (error) {
      ctx.logger.error('admin cancel match error:', error);
      throw new LegacyAdminError(500, 'Failed to cancel match');
    }
    return {
      result: { success: true, hardDeleted: false },
      audit: {
        action: 'update_match',
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id ?? null,
        payload: { cancelled: true, hard_delete: false },
      },
    };
  });
}
