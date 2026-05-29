// PATCH /api/bot/v1/scrims/[scrimId]/matches/[matchId]
//
// Met a jour un match d'un scrim depuis le bot Discord (typiquement le score
// apres une partie). Admin/owner via actorDiscordUserId.
//
// Champs acceptes : team1_score, team2_score, winner_team_id, status,
// stream_url, replay_url, lobby_code, notes, scheduled_at, started_at,
// completed_at, forfeit_team_id, best_of, match_format.
//
// Si team1_score / team2_score sont fournis sans winner_team_id, le gagnant
// est derive automatiquement (en cas d'egalite : null).
//
// Auth: x-api-key valide contre BOT_API_KEY.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import {
  discordIdSchema,
  uuidSchema,
  isoDateSchema,
} from '@/utils/botValidation';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { logger } from '@/utils/logger';

const VALID_STATUSES = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'walkover',
  'disputed',
  'postponed',
] as const;

const PATCHABLE_FIELDS = [
  'team1_score',
  'team2_score',
  'winner_team_id',
  'forfeit_team_id',
  'status',
  'best_of',
  'match_format',
  'stream_url',
  'replay_url',
  'lobby_code',
  'notes',
  'scheduled_at',
  'started_at',
  'completed_at',
] as const;

// scoreSchema (0-99) ne convient pas ici : le handler historique borne juste
// "entier >= 0" sans plafond. On reproduit cette borne pour ne pas changer la
// sémantique (un score de scrim peut théoriquement dépasser 99).
const matchScoreSchema = z
  .number()
  .int()
  .min(0, 'team_score doit etre un entier >= 0');

// PATCH : allowlist PATCHABLE_FIELDS, tous optionnels. Le contrôle
// winner/forfeit "doit référencer team1/team2 du match" dépend de la row DB →
// reste inline dans le handler. La dérivation du gagnant idem.
const scrimMatchPatchBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  team1_score: matchScoreSchema.nullish(),
  team2_score: matchScoreSchema.nullish(),
  winner_team_id: uuidSchema.nullish(),
  forfeit_team_id: uuidSchema.nullish(),
  status: z.enum(VALID_STATUSES).optional(),
  best_of: z
    .number()
    .int()
    .min(1, 'best_of doit etre un entier >= 1')
    .nullish(),
  match_format: z.string().nullish(),
  stream_url: z.string().nullish(),
  replay_url: z.string().nullish(),
  lobby_code: z.string().nullish(),
  notes: z.string().nullish(),
  scheduled_at: isoDateSchema.nullish(),
  started_at: isoDateSchema.nullish(),
  completed_at: isoDateSchema.nullish(),
});
const scrimMatchQuerySchema = z.object({
  scrimId: uuidSchema,
  matchId: uuidSchema,
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { scrimId, matchId } = req.botQuery as z.infer<
    typeof scrimMatchQuerySchema
  >;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const input = req.botInput as z.infer<typeof scrimMatchPatchBodySchema>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  // Verifier que le match existe et appartient bien a ce scrim.
  const { data: match } = await supabaseAdmin
    .from('matches')
    .select(
      'id, scrim_id, tournament_id, team1_id, team2_id, status, team1_score, team2_score'
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (!match) return res.status(404).json({ error: 'Match introuvable' });
  if (match.scrim_id !== scrimId) {
    return res
      .status(400)
      .json({ error: "Ce match n'appartient pas a ce scrim." });
  }

  // Allowlist : on n'écrit que les champs présents dans le body brut (valeurs
  // déjà validées/typées par le schéma). Présence détectée sur le body brut
  // pour préserver "champ omis = pas touché".
  const updatePayload: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (body[field as string] !== undefined) {
      updatePayload[field] = (input as Record<string, unknown>)[field];
    }
  }
  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: 'Aucun champ a mettre a jour' });
  }

  // Contrôle DB-dépendant : winner/forfeit doivent référencer une des équipes
  // du match (les UUID eux-mêmes sont déjà validés par le schéma).
  for (const teamField of ['winner_team_id', 'forfeit_team_id'] as const) {
    const v = updatePayload[teamField];
    if (
      v !== undefined &&
      v !== null &&
      v !== match.team1_id &&
      v !== match.team2_id
    ) {
      return res.status(400).json({
        error: `${teamField} doit referencer team1_id ou team2_id du match`,
      });
    }
  }

  // Derive le gagnant si scores fournis sans winner_team_id explicite.
  const finalT1 =
    updatePayload.team1_score !== undefined
      ? (updatePayload.team1_score as number | null)
      : (match.team1_score as number | null);
  const finalT2 =
    updatePayload.team2_score !== undefined
      ? (updatePayload.team2_score as number | null)
      : (match.team2_score as number | null);

  if (
    (updatePayload.team1_score !== undefined ||
      updatePayload.team2_score !== undefined) &&
    updatePayload.winner_team_id === undefined &&
    finalT1 !== null &&
    finalT2 !== null
  ) {
    if (finalT1 > finalT2) {
      updatePayload.winner_team_id = match.team1_id;
    } else if (finalT2 > finalT1) {
      updatePayload.winner_team_id = match.team2_id;
    } else {
      updatePayload.winner_team_id = null;
    }
  }

  // Marqueurs de cycle de vie : completed_at auto quand status passe a finished.
  if (
    updatePayload.status === 'finished' &&
    updatePayload.completed_at === undefined
  ) {
    updatePayload.completed_at = new Date().toISOString();
  }
  if (
    updatePayload.status === 'ongoing' &&
    updatePayload.started_at === undefined
  ) {
    updatePayload.started_at = new Date().toISOString();
  }

  updatePayload.updated_at = new Date().toISOString();

  const { data: after, error: updErr } = await supabaseAdmin
    .from('matches')
    .update(updatePayload)
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', matchId)
    .select('*')
    .single();

  if (updErr || !after) {
    logger.error('[bot/scrim-match] update error:', updErr);
    return res.status(500).json({ error: 'Failed to update match' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'update_match',
    entity_type: 'match',
    entity_id: matchId,
    payload: {
      subject: 'scrim_match_update',
      scrim_id: scrimId,
      changes: updatePayload,
    },
  });

  if (after.status === 'ongoing' && match.status !== 'ongoing') {
    void (async () => {
      const enriched = await enrichMatchEvent(matchId);
      await emitBotEvent(
        'match.starting',
        {
          matchId,
          tournamentId: null,
          scrimId,
          team1Id: after.team1_id ?? null,
          team2Id: after.team2_id ?? null,
          scheduledAt: after.scheduled_at ?? null,
          startedAt: after.started_at ?? null,
          matchFormat: after.match_format ?? null,
          lobbyCode: after.lobby_code ?? null,
          streamUrl: after.stream_url ?? null,
          enriched,
        },
        req.botContext!.tenantId
      );
    })().catch((e) =>
      logger.error('[botEvents] match.starting emit error:', e)
    );
  }

  return res.status(200).json({ success: true, match: after });
}

export default withBotRoute(handler, {
  methods: ['PATCH'],
  rateLimit: { max: 60, key: 'bot-scrim-match-patch' },
  idempotent: true,
  bodySchema: scrimMatchPatchBodySchema,
  querySchema: scrimMatchQuerySchema,
});
