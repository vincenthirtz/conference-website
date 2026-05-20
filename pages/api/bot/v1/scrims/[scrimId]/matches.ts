// POST /api/bot/v1/scrims/[scrimId]/matches
//
// Cree un ou plusieurs matchs lies a un scrim, via le bot Discord.
// Admin-only via actorDiscordUserId (doit pointer sur staff admin/owner).
//
// Body :
//   { actorDiscordUserId, match:  {...} }       // single
//   { actorDiscordUserId, matches: [{...}, ...] } // batch

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

type MatchInput = {
  status?: string;
  is_bye?: boolean;
  best_of?: number | null;
  match_format?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
  scheduled_at?: string | null;
  stream_url?: string | null;
  lobby_code?: string | null;
  notes?: string | null;
};

function normalizeMatch(
  scrimId: string,
  tenantId: string,
  input: MatchInput,
  defaults: { team1Id: string | null; team2Id: string | null }
): { row?: Record<string, unknown>; error?: string } {
  if (input.team1_id && !isValidUUID(input.team1_id))
    return { error: 'team1_id invalide' };
  if (input.team2_id && !isValidUUID(input.team2_id))
    return { error: 'team2_id invalide' };

  const status = input.status ?? 'pending';
  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    return {
      error: `status invalide. Valeurs : ${VALID_STATUSES.join(', ')}.`,
    };
  }

  if (input.scheduled_at && Number.isNaN(Date.parse(input.scheduled_at))) {
    return { error: 'scheduled_at invalide' };
  }
  if (
    input.best_of !== undefined &&
    input.best_of !== null &&
    (!Number.isInteger(input.best_of) || (input.best_of as number) < 1)
  ) {
    return { error: 'best_of doit etre un entier >= 1' };
  }

  return {
    row: {
      tenant_id: tenantId,
      tournament_id: null,
      scrim_id: scrimId,
      stage_id: null,
      status,
      is_bye: input.is_bye ?? false,
      best_of: input.best_of ?? null,
      match_format: input.match_format ?? null,
      team1_id: input.team1_id ?? defaults.team1Id,
      team2_id: input.team2_id ?? defaults.team2Id,
      scheduled_at: input.scheduled_at ?? null,
      stream_url: input.stream_url ?? null,
      lobby_code: input.lobby_code ?? null,
      notes: input.notes ?? null,
    },
  };
}

async function handleList(
  res: NextApiResponse,
  scrimId: string,
  tenantId: string
) {
  const { data, error } = await supabaseAdmin!
    .from('matches')
    .select(
      `
      id, scrim_id, status, is_bye, best_of, match_format,
      team1_id, team2_id, team1_score, team2_score, winner_team_id, forfeit_team_id,
      scheduled_at, started_at, completed_at,
      stream_url, replay_url, lobby_code, notes,
      created_at, updated_at
    `
    )
    .eq('tenant_id', tenantId)
    .eq('scrim_id', scrimId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('[bot/scrim-matches] list error:', error);
    return res.status(500).json({ error: 'Failed to load matches' });
  }
  return res.status(200).json({ matches: data ?? [] });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { scrimId } = req.query;
  if (!scrimId || Array.isArray(scrimId) || !isValidUUID(scrimId)) {
    return res.status(400).json({ error: 'scrimId invalide' });
  }

  if (req.method === 'GET') return handleList(res, scrimId, req.botContext!.tenantId);

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  let inputs: MatchInput[];
  if (Array.isArray(body.matches)) {
    inputs = body.matches as MatchInput[];
  } else if (body.match && typeof body.match === 'object') {
    inputs = [body.match as MatchInput];
  } else {
    return res
      .status(400)
      .json({
        error: "Body doit contenir 'match' (objet) ou 'matches' (tableau).",
      });
  }
  if (inputs.length === 0)
    return res.status(400).json({ error: 'Aucun match a creer' });
  if (inputs.length > 50)
    return res.status(400).json({ error: 'Maximum 50 matchs par requete' });

  const { data: scrim } = await supabaseAdmin
    .from('scrims')
    .select('id, name, team1_id, team2_id')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', scrimId)
    .maybeSingle();
  if (!scrim) return res.status(404).json({ error: 'Scrim introuvable' });

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const { row, error } = normalizeMatch(scrimId, req.botContext!.tenantId, inputs[i], {
      team1Id: scrim.team1_id ?? null,
      team2Id: scrim.team2_id ?? null,
    });
    if (error) return res.status(400).json({ error: `match[${i}]: ${error}` });
    if (row) rows.push(row);
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('matches')
    .insert(rows)
    .select('*');

  if (insErr || !inserted) {
    logger.error('[bot/scrim-matches] insert error', insErr);
    return res.status(500).json({ error: 'Echec de creation des matchs' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'create_match',
    entity_type: 'match',
    entity_id: inserted.length === 1 ? inserted[0].id : null,
    payload: {
      subject: 'create_scrim_match',
      scrim_id: scrimId,
      count: inserted.length,
      match_ids: inserted.map((m) => m.id),
    },
  });

  return res.status(201).json({ matches: inserted, count: inserted.length });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: { max: 60, key: 'bot-scrim-matches' },
  idempotent: true,
});
