// POST /api/bot/v1/tournaments/[tournamentId]/matches
//
// Create one or more matches in a tournament via the Discord bot.
// Admin-only via actorDiscordUserId (must map to staff admin/owner).
//
// Body accepts either:
//   { actorDiscordUserId, match:  {...} }       // single
//   { actorDiscordUserId, matches: [{...}, ...] } // batch
//
// All match fields except tournament_id are optional — teams may be null
// (placeholder match), stage may be null (free-floating match), etc.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
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

const VALID_BRACKET_SIDES = ['wb', 'lb', 'final', 'none'] as const;

type MatchInput = {
  stage_id?: string | null;
  status?: string;
  is_bye?: boolean;
  match_format?: string | null;
  round_name?: string | null;
  round_number?: number | null;
  bracket_side?: string | null;
  group_key?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
  scheduled_at?: string | null;
  stream_url?: string | null;
  lobby_code?: string | null;
  notes?: string | null;
};

function normalizeMatch(
  tournamentId: string,
  input: MatchInput
): { row?: Record<string, unknown>; error?: string } {
  if (input.stage_id && !isValidUUID(input.stage_id)) {
    return { error: 'stage_id invalide' };
  }
  if (input.team1_id && !isValidUUID(input.team1_id)) {
    return { error: 'team1_id invalide' };
  }
  if (input.team2_id && !isValidUUID(input.team2_id)) {
    return { error: 'team2_id invalide' };
  }
  const status = input.status ?? 'pending';
  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    return {
      error: `status invalide. Valeurs : ${VALID_STATUSES.join(', ')}.`,
    };
  }
  if (
    input.bracket_side &&
    !(VALID_BRACKET_SIDES as readonly string[]).includes(input.bracket_side)
  ) {
    return {
      error: `bracket_side invalide. Valeurs : ${VALID_BRACKET_SIDES.join(', ')}.`,
    };
  }
  if (input.scheduled_at && Number.isNaN(Date.parse(input.scheduled_at))) {
    return { error: 'scheduled_at invalide' };
  }
  if (
    input.round_number !== undefined &&
    input.round_number !== null &&
    (!Number.isInteger(input.round_number) || input.round_number < 0)
  ) {
    return { error: 'round_number doit être un entier >= 0' };
  }

  return {
    row: {
      tournament_id: tournamentId,
      stage_id: input.stage_id ?? null,
      status,
      is_bye: input.is_bye ?? false,
      match_format: input.match_format ?? null,
      round_name: input.round_name ?? null,
      round_number:
        typeof input.round_number === 'number' ? input.round_number : null,
      bracket_side: input.bracket_side ?? null,
      group_key: input.group_key ?? null,
      team1_id: input.team1_id ?? null,
      team2_id: input.team2_id ?? null,
      scheduled_at: input.scheduled_at ?? null,
      stream_url: input.stream_url ?? null,
      lobby_code: input.lobby_code ?? null,
      notes: input.notes ?? null,
    },
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tournamentId } = req.query;
  if (
    !tournamentId ||
    Array.isArray(tournamentId) ||
    !isValidUUID(tournamentId)
  ) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  // Accept either { match: {...} } or { matches: [...] }.
  let inputs: MatchInput[];
  if (Array.isArray(body.matches)) {
    inputs = body.matches as MatchInput[];
  } else if (body.match && typeof body.match === 'object') {
    inputs = [body.match as MatchInput];
  } else {
    return res.status(400).json({
      error: "Body doit contenir 'match' (objet) ou 'matches' (tableau).",
    });
  }
  if (inputs.length === 0) {
    return res.status(400).json({ error: 'Aucun match à créer' });
  }
  if (inputs.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 matchs par requête' });
  }

  // Verify tournament exists
  const { data: tournament } = await supabaseAdmin
    .from('tournaments')
    .select('id, name')
    .eq('id', tournamentId)
    .maybeSingle();
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }

  // Normalize + validate each match
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const { row, error } = normalizeMatch(tournamentId, inputs[i]);
    if (error) {
      return res.status(400).json({ error: `match[${i}]: ${error}` });
    }
    if (row) rows.push(row);
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('matches')
    .insert(rows)
    .select('*');

  if (insErr || !inserted) {
    logger.error('[bot/matches] insert error', insErr);
    return res.status(500).json({ error: 'Échec de création des matchs' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'create_match',
    entity_type: 'match',
    entity_id: inserted.length === 1 ? inserted[0].id : null,
    tournament_id: tournamentId,
    payload: {
      batch: inserted.length > 1,
      count: inserted.length,
      match_ids: inserted.map((m) => m.id),
    },
  });

  return res.status(201).json({ matches: inserted, count: inserted.length });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-matches' },
  idempotent: true,
});
