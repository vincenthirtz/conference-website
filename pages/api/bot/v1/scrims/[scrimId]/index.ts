// /api/bot/v1/scrims/[scrimId]
//
// GET   — lit un scrim (par id ou slug) + ses matchs. Pas de filtre is_public.
// PATCH — met a jour un scrim. Admin/owner uniquement via actorDiscordUserId.
//
// Auth: x-api-key valide contre BOT_API_KEY.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { syncScrimRatedMatch } from '@/utils/scrims/ratedMatch';
import { scrimPatchBodySchema } from '@/lib/apiContracts/bot/scrims/[scrimId]/index';
import { scrimQuerySchema } from '@/lib/apiContracts/bot/scrims/[scrimId]/index.query';

const PATCHABLE_FIELDS = [
  'name',
  'status',
  'team1_id',
  'team2_id',
  'scheduled_date',
  'is_public',
  'description',
  'stream_url',
  'game',
] as const;

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { scrimId: idOrSlug } = req.botQuery as z.infer<
    typeof scrimQuerySchema
  >;

  if (req.method === 'GET')
    return handleGet(res, idOrSlug, req.botContext.tenantId);
  return handlePatch(req, res, idOrSlug);
}

async function handleGet(
  res: NextApiResponse,
  idOrSlug: string,
  tenantId: string
) {
  let q = supabaseAdmin!
    .from('scrims')
    .select(
      `
      id, name, slug, game, status,
      team1_id, team2_id,
      scheduled_date, timezone,
      is_public, logo_url, banner_url, description, stream_url,
      source_demande_id, created_at, updated_at,
      team1:teams!scrims_team1_id_fkey(id, name, short_name, slug, logo_url),
      team2:teams!scrims_team2_id_fkey(id, name, short_name, slug, logo_url)
    `
    )
    .eq('tenant_id', tenantId);
  q = isValidUUID(idOrSlug) ? q.eq('id', idOrSlug) : q.eq('slug', idOrSlug);

  const { data: scrim, error } = await q.maybeSingle();
  if (error) {
    logger.error('[bot/scrim] GET error:', error);
    return res.status(500).json({ error: 'Failed to load scrim' });
  }
  if (!scrim) return res.status(404).json({ error: 'Scrim introuvable' });

  const { data: matches } = await supabaseAdmin!
    .from('matches')
    .select(
      `
      id, status, is_bye, best_of, match_format,
      team1_id, team2_id, team1_score, team2_score, winner_team_id, forfeit_team_id,
      scheduled_at, started_at, completed_at,
      stream_url, replay_url, lobby_code, notes,
      created_at, updated_at
    `
    )
    .eq('tenant_id', tenantId)
    .eq('scrim_id', scrim.id)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  return res.status(200).json({ scrim, matches: matches ?? [] });
}

async function handlePatch(
  req: BotTenantRequest,
  res: NextApiResponse,
  idOrSlug: string
) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input = req.botInput as z.infer<typeof scrimPatchBodySchema>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  // Resoudre le scrim (id ou slug) avant de patcher.
  let lookup = supabaseAdmin!
    .from('scrims')
    .select('*')
    .eq('tenant_id', req.botContext.tenantId);
  lookup = isValidUUID(idOrSlug)
    ? lookup.eq('id', idOrSlug)
    : lookup.eq('slug', idOrSlug);
  const { data: before } = await lookup.maybeSingle();
  if (!before) return res.status(404).json({ error: 'Scrim introuvable' });

  // Allowlist : on n'écrit que les champs présents dans le body brut (le
  // schéma a déjà validé/normalisé status/UUID/date/game). Présence détectée
  // sur le body brut pour préserver la sémantique "champ omis = pas touché".
  const updatePayload: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (body[field as string] !== undefined) {
      updatePayload[field] = (input as Record<string, unknown>)[field];
    }
  }
  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: 'Aucun champ a mettre a jour' });
  }

  const effectiveT1 =
    updatePayload.team1_id !== undefined
      ? (updatePayload.team1_id as string | null)
      : (before.team1_id as string | null);
  const effectiveT2 =
    updatePayload.team2_id !== undefined
      ? (updatePayload.team2_id as string | null)
      : (before.team2_id as string | null);
  if (effectiveT1 && effectiveT2 && effectiveT1 === effectiveT2) {
    return res
      .status(400)
      .json({ error: 'team1_id et team2_id doivent etre distincts' });
  }

  // Même garde que la route admin : un changement de statut ne s'applique que
  // sur l'état lu (une annulation ne croise pas l'accord des capitaines).
  let updateQuery = supabaseAdmin!
    .from('scrims')
    .update(updatePayload)
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', before.id);
  if (updatePayload.status !== undefined && before.status) {
    updateQuery = updateQuery.eq('status', before.status as string);
  }
  const { data: after, error: updErr } = await updateQuery
    .select('*')
    .maybeSingle();

  if (updErr) {
    logger.error('[bot/scrim] PATCH error:', updErr);
    return res.status(500).json({ error: 'Failed to update scrim' });
  }
  if (!after) {
    return res.status(409).json({
      error:
        'Le scrim a changé entre-temps (résultat déclaré ou statut modifié) : recharge-le avant de le modifier.',
      code: 'SCRIM_CHANGED',
    });
  }

  // Le miroir noté suit le statut et les équipes, comme côté admin : sans ce
  // réalignement, un scrim annulé depuis Discord gardait ses points au rating
  // et au classement de saison.
  if (
    updatePayload.status !== undefined ||
    updatePayload.team1_id !== undefined ||
    updatePayload.team2_id !== undefined
  ) {
    await syncScrimRatedMatch(req.botContext.tenantId, before.id as string);
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'other',
    entity_type: 'scrim',
    entity_id: before.id as string,
    payload: {
      subject: 'update_scrim',
      changes: updatePayload,
    },
  });

  return res.status(200).json({ success: true, scrim: after });
}

export default withBotRoute(handler, {
  methods: ['GET', 'PATCH'],
  rateLimit: { max: 60, key: 'bot-scrim-id' },
  idempotent: true,
  // querySchema s'applique aux deux méthodes (GET + PATCH) : scrimId requis.
  // bodySchema ne s'applique qu'au PATCH (méthode non-safe).
  querySchema: scrimQuerySchema,
  bodySchema: scrimPatchBodySchema,
});
