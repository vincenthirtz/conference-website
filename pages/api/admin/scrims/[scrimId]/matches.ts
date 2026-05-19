// pages/api/admin/scrims/[scrimId]/matches.ts
// Admin: matchs d'un scrim
// - GET  : liste des matchs du scrim
// - POST : creer un ou plusieurs matchs (single ou batch)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';

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

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'scrim-matches-batch' }),
  'manager'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });

  const rawId = req.query.scrimId;
  const scrimId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!scrimId || !isValidUUID(scrimId)) {
    return res.status(400).json({ error: 'scrimId invalide' });
  }

  if (req.method === 'GET') return handleGet(res, scrimId);
  if (req.method === 'POST') return handlePost(req, res, scrimId, ctx);

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(res: NextApiResponse, scrimId: string) {
  const { data, error } = await supabaseAdmin!
    .from('matches')
    .select(
      `
      id, scrim_id, status, is_bye, best_of, match_format,
      team1_id, team2_id, team1_score, team2_score, winner_team_id, forfeit_team_id,
      scheduled_at, started_at, completed_at,
      stream_url, replay_url, lobby_code, notes,
      created_at, updated_at,
      team1:teams!matches_team1_id_fkey(id, name, short_name, logo_url),
      team2:teams!matches_team2_id_fkey(id, name, short_name, logo_url)
    `
    )
    .eq('scrim_id', scrimId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('[admin/scrims/:id/matches] GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch matches' });
  }

  return res.status(200).json({ matches: data ?? [] });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  scrimId: string,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Verifier que le scrim existe + recuperer team1/team2 pour pre-remplir
  const { data: scrim } = await supabaseAdmin!
    .from('scrims')
    .select('id, name, team1_id, team2_id')
    .eq('id', scrimId)
    .maybeSingle();
  if (!scrim) return res.status(404).json({ error: 'Scrim introuvable' });

  let inputs: MatchInput[];
  if (Array.isArray(body.matches)) {
    inputs = body.matches as MatchInput[];
  } else if (body.match && typeof body.match === 'object') {
    inputs = [body.match as MatchInput];
  } else {
    inputs = [{}]; // creation d'un match vide pre-rempli avec les equipes du scrim
  }

  if (inputs.length === 0)
    return res.status(400).json({ error: 'Aucun match a creer' });
  if (inputs.length > 50)
    return res.status(400).json({ error: 'Maximum 50 matchs par requete' });

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const { row, error } = normalizeMatch(scrimId, inputs[i], {
      team1Id: scrim.team1_id ?? null,
      team2Id: scrim.team2_id ?? null,
    });
    if (error) return res.status(400).json({ error: `match[${i}]: ${error}` });
    if (row) rows.push(row);
  }

  const { data: inserted, error: insErr } = await supabaseAdmin!
    .from('matches')
    .insert(rows)
    .select('*');

  if (insErr || !inserted) {
    logger.error('[admin/scrims/:id/matches] insert error:', insErr);
    return res.status(500).json({ error: 'Echec de creation des matchs' });
  }

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'create_match',
        entity_type: 'match',
        entity_id: inserted.length === 1 ? inserted[0].id : null,
        tournament_id: null,
        payload: {
          subject: 'create_scrim_match',
          scrim_id: scrimId,
          count: inserted.length,
          match_ids: inserted.map((m) => m.id),
        },
      });
    } catch (e) {
      logger.error('[admin/scrims/:id/matches] log error:', e);
    }
  }

  return res.status(201).json({ matches: inserted, count: inserted.length });
}
