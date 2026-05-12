// /api/bot/scrims/[scrimId]
//
// GET   — lit un scrim (par id ou slug) + ses matchs. Pas de filtre is_public.
// PATCH — met a jour un scrim. Admin/owner uniquement via actorDiscordUserId.
//
// Auth: x-api-key valide contre BOT_API_KEY.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';

const VALID_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;

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

function verifyBotApiKey(req: NextApiRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;
  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function resolveActorStaff(
  discordUserId: string
): Promise<{ staffId: string | null; role: string | null }> {
  if (!supabaseAdmin) return { staffId: null, role: null };
  const { data: link } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  if (!link) return { staffId: null, role: null };
  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id, role')
    .eq('auth_user_id', link.auth_user_id)
    .maybeSingle();
  return { staffId: staff?.id ?? null, role: staff?.role ?? null };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'bot-scrim-id'))
    return;

  if (!process.env.BOT_API_KEY) {
    logger.error('[bot/scrim] BOT_API_KEY is unset');
    return res.status(500).json({ error: 'Endpoint not configured.' });
  }
  if (!verifyBotApiKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable.' });
  }

  const rawId = req.query.scrimId;
  const idOrSlug = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!idOrSlug) {
    return res.status(400).json({ error: 'scrimId requis' });
  }

  if (req.method === 'GET') return handleGet(res, idOrSlug);
  if (req.method === 'PATCH') return handlePatch(req, res, idOrSlug);

  res.setHeader('Allow', 'GET,PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(res: NextApiResponse, idOrSlug: string) {
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
    );
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
    .eq('scrim_id', scrim.id)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  return res.status(200).json({ scrim, matches: matches ?? [] });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  idOrSlug: string
) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actorDiscordUserId =
    typeof body.actorDiscordUserId === 'string'
      ? body.actorDiscordUserId.trim()
      : '';
  if (!/^[0-9]{15,25}$/.test(actorDiscordUserId)) {
    return res.status(400).json({ error: 'actorDiscordUserId requis' });
  }
  const actor = await resolveActorStaff(actorDiscordUserId);
  if (!actor.role || (actor.role !== 'admin' && actor.role !== 'owner')) {
    return res.status(403).json({
      error:
        "Action reservee aux admins/owners. Ton compte Discord n'est pas lie a un staff de ce niveau.",
    });
  }

  // Resoudre le scrim (id ou slug) avant de patcher.
  let lookup = supabaseAdmin!.from('scrims').select('*');
  lookup = isValidUUID(idOrSlug)
    ? lookup.eq('id', idOrSlug)
    : lookup.eq('slug', idOrSlug);
  const { data: before } = await lookup.maybeSingle();
  if (!before) return res.status(404).json({ error: 'Scrim introuvable' });

  const updatePayload: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (body[field as string] !== undefined) {
      updatePayload[field] = body[field as string];
    }
  }
  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: 'Aucun champ a mettre a jour' });
  }

  if (
    updatePayload.status !== undefined &&
    !(VALID_STATUSES as readonly string[]).includes(
      updatePayload.status as string
    )
  ) {
    return res.status(400).json({
      error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(', ')}.`,
    });
  }

  for (const teamField of ['team1_id', 'team2_id'] as const) {
    const v = updatePayload[teamField];
    if (v !== undefined && v !== null && !isValidUUID(v as string)) {
      return res.status(400).json({ error: `${teamField} invalide` });
    }
  }

  if (
    updatePayload.scheduled_date !== undefined &&
    updatePayload.scheduled_date !== null &&
    Number.isNaN(Date.parse(updatePayload.scheduled_date as string))
  ) {
    return res.status(400).json({ error: 'scheduled_date invalide' });
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

  const { data: after, error: updErr } = await supabaseAdmin!
    .from('scrims')
    .update(updatePayload)
    .eq('id', before.id)
    .select('*')
    .single();

  if (updErr || !after) {
    logger.error('[bot/scrim] PATCH error:', updErr);
    return res.status(500).json({ error: 'Failed to update scrim' });
  }

  if (actor.staffId) {
    try {
      await logStaffAction({
        staff_id: actor.staffId,
        action: 'other',
        entity_type: 'scrim',
        entity_id: before.id as string,
        tournament_id: null,
        payload: {
          subject: 'update_scrim',
          changes: updatePayload,
          via: 'discord_bot',
        },
      });
    } catch (e) {
      logger.error('[bot/scrim] log error:', e);
    }
  }

  return res.status(200).json({ success: true, scrim: after });
}
