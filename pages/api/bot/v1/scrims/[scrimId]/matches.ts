// POST /api/bot/v1/scrims/[scrimId]/matches
//
// Cree un ou plusieurs matchs lies a un scrim, via le bot Discord.
// Admin-only via actorDiscordUserId (doit pointer sur staff admin/owner).
//
// Body :
//   { actorDiscordUserId, match:  {...} }       // single
//   { actorDiscordUserId, matches: [{...}, ...] } // batch

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import {
  discordIdSchema,
  uuidSchema,
  isoDateSchema,
} from '@/utils/botValidation';
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

// Schéma d'un match d'entrée (single ou élément du batch). Reproduit la
// validation de normalizeMatch : team*_id UUID nullable, status enum (défaut
// 'pending' appliqué côté handler), scheduled_at date ISO, best_of entier >= 1.
const matchInputSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  is_bye: z.boolean().optional(),
  best_of: z
    .number()
    .int()
    .min(1, 'best_of doit etre un entier >= 1')
    .nullish(),
  match_format: z.string().nullish(),
  team1_id: uuidSchema.nullish(),
  team2_id: uuidSchema.nullish(),
  scheduled_at: isoDateSchema.nullish(),
  stream_url: z.string().nullish(),
  lobby_code: z.string().nullish(),
  notes: z.string().nullish(),
});
type MatchInput = z.infer<typeof matchInputSchema>;

// Body POST : { actorDiscordUserId, match } OU { actorDiscordUserId, matches:[] }.
// On valide les deux formes ; le handler choisit selon présence (préserve les
// messages d'erreur "Body doit contenir...", "Aucun match", "Maximum 50").
const matchesBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  match: matchInputSchema.optional(),
  matches: z.array(matchInputSchema).optional(),
});
const matchesQuerySchema = z.object({ scrimId: uuidSchema });

function normalizeMatch(
  scrimId: string,
  tenantId: string,
  input: MatchInput,
  defaults: { team1Id: string | null; team2Id: string | null }
): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    tournament_id: null,
    scrim_id: scrimId,
    stage_id: null,
    status: input.status ?? 'pending',
    is_bye: input.is_bye ?? false,
    best_of: input.best_of ?? null,
    match_format: input.match_format ?? null,
    team1_id: input.team1_id ?? defaults.team1Id,
    team2_id: input.team2_id ?? defaults.team2Id,
    scheduled_at: input.scheduled_at ?? null,
    stream_url: input.stream_url ?? null,
    lobby_code: input.lobby_code ?? null,
    notes: input.notes ?? null,
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

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { scrimId } = req.botQuery as z.infer<typeof matchesQuerySchema>;

  if (req.method === 'GET')
    return handleList(res, scrimId, req.botContext.tenantId);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const input = req.botInput as z.infer<typeof matchesBodySchema>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  let inputs: MatchInput[];
  if (input.matches !== undefined) {
    inputs = input.matches;
  } else if (input.match !== undefined) {
    inputs = [input.match];
  } else {
    return res.status(400).json({
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
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', scrimId)
    .maybeSingle();
  if (!scrim) return res.status(404).json({ error: 'Scrim introuvable' });

  const rows: Record<string, unknown>[] = inputs.map((mi) =>
    normalizeMatch(scrimId, req.botContext.tenantId, mi, {
      team1Id: scrim.team1_id ?? null,
      team2Id: scrim.team2_id ?? null,
    })
  );

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
  // querySchema (scrimId UUID) sur GET + POST. bodySchema sur POST seulement.
  querySchema: matchesQuerySchema,
  bodySchema: matchesBodySchema,
});
