// /api/bot/v1/matches/[matchId]/cast
//
// Gestion des assignments de casters pour un match.
//
//  GET    : liste les assignments du match (publique, x-api-key suffit —
//           le nom des casters est public sur les fiches match du site)
//  POST   : assigne un caster (staff admin/owner)
//           body: { actorDiscordUserId, castMemberId, briefingAt }
//  DELETE : retire un assignment (staff admin/owner)
//           body: { actorDiscordUserId, assignmentId } OU { castMemberId }

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { uuidSchema } from '@/utils/botValidation';
import { logger } from '@/utils/logger';

// Multi-méthode aux bodies divergents : POST = { actorDiscordUserId, castMemberId,
// briefingAt? } et DELETE = { actorDiscordUserId, assignmentId? | castMemberId? }
// (au moins un des deux, sémantique « ou exclusif » modélisée par des checks
// inline). Pas de discriminant propre pour un z.union, donc on valide seulement
// la query et on conserve la validation body inline dans handleAssign/handleUnassign.
const castQuerySchema = z.object({ matchId: uuidSchema });

const SELECT = `id, match_id, cast_member_id, briefing_at, briefing_reminder_sent_at,
   created_at,
   cast_member:cast_member_id (id, name, auth_user_id, image_url)`;

function pickCastMember(rel: unknown): {
  id: string;
  name: string | null;
  auth_user_id: string | null;
} | null {
  if (!rel) return null;
  const cm = Array.isArray(rel) ? rel[0] : rel;
  if (!cm || typeof cm !== 'object') return null;
  const o = cm as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : null,
    auth_user_id: typeof o.auth_user_id === 'string' ? o.auth_user_id : null,
  };
}

async function handleList(
  res: NextApiResponse,
  matchId: string,
  tenantId: string
) {
  const { data, error } = await supabaseAdmin
    .from('cast_assignments')
    .select(SELECT)
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .order('briefing_at', { ascending: true });
  if (error) {
    logger.error('[bot/cast] list error', error);
    return res.status(500).json({ error: 'Erreur de chargement' });
  }

  const authIds = (data ?? [])
    .map(
      (a) =>
        pickCastMember((a as Record<string, unknown>).cast_member)?.auth_user_id
    )
    .filter((x): x is string => !!x);

  let discordByAuthId = new Map<string, string>();
  if (authIds.length > 0) {
    const { data: links } = await supabaseAdmin
      .from('user_discord_links')
      .select('auth_user_id, discord_user_id')
      .in('auth_user_id', authIds);
    discordByAuthId = new Map(
      (links ?? []).map((l) => [
        (l as { auth_user_id: string }).auth_user_id,
        (l as { discord_user_id: string }).discord_user_id,
      ])
    );
  }

  const assignments = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const cm = pickCastMember(r.cast_member);
    return {
      id: r.id as string,
      matchId: r.match_id as string,
      castMember: cm
        ? {
            id: cm.id,
            name: cm.name,
            authUserId: cm.auth_user_id,
            discordUserId: cm.auth_user_id
              ? (discordByAuthId.get(cm.auth_user_id) ?? null)
              : null,
          }
        : null,
      briefingAt: (r.briefing_at as string | null) ?? null,
      briefingReminderSentAt:
        (r.briefing_reminder_sent_at as string | null) ?? null,
      createdAt: r.created_at as string,
    };
  });

  return res.status(200).json({ assignments });
}

async function handleAssign(
  req: NextApiRequest,
  res: NextApiResponse,
  matchId: string
) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const castMemberId =
    typeof body.castMemberId === 'string' ? body.castMemberId.trim() : '';
  if (!isValidUUID(castMemberId)) {
    return res.status(400).json({ error: 'castMemberId invalide' });
  }

  // briefingAt optional — par defaut, match.scheduled_at - 30 min
  let briefingAtIso: string | null = null;
  if ('briefingAt' in body) {
    const v = body.briefingAt;
    if (typeof v === 'string') {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        return res
          .status(400)
          .json({ error: 'briefingAt invalide (ISO 8601 attendu)' });
      }
      briefingAtIso = d.toISOString();
    } else if (v !== null) {
      return res
        .status(400)
        .json({ error: 'briefingAt doit être string ou null' });
    }
  }

  if (!briefingAtIso) {
    const { data: match } = await supabaseAdmin
      .from('matches')
      .select('scheduled_at')
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('id', matchId)
      .maybeSingle();
    if (match?.scheduled_at) {
      const t = new Date(match.scheduled_at).getTime() - 30 * 60_000;
      briefingAtIso = new Date(t).toISOString();
    }
  }

  if (!briefingAtIso) {
    return res.status(400).json({
      error:
        'briefingAt requis (match.scheduled_at est aussi null — fournis-le explicitement).',
    });
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('cast_assignments')
    .insert({
      tenant_id: req.botContext!.tenantId,
      match_id: matchId,
      cast_member_id: castMemberId,
      briefing_at: briefingAtIso,
    })
    .select(SELECT)
    .single();
  if (error) {
    if (error.code === '23505') {
      return res
        .status(409)
        .json({ error: 'Ce caster est déjà assigné à ce match.' });
    }
    logger.error('[bot/cast] insert error', error);
    return res.status(500).json({ error: 'Échec de la création' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'create_cast_assignment',
    entity_type: 'cast_assignment',
    entity_id: (inserted as { id: string } | null)?.id ?? null,
    payload: { match_id: matchId, cast_member_id: castMemberId },
  });

  return res.status(201).json({ assignment: inserted });
}

async function handleUnassign(
  req: NextApiRequest,
  res: NextApiResponse,
  matchId: string
) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const assignmentId =
    typeof body.assignmentId === 'string' ? body.assignmentId.trim() : '';
  const castMemberId =
    typeof body.castMemberId === 'string' ? body.castMemberId.trim() : '';

  if (!assignmentId && !castMemberId) {
    return res
      .status(400)
      .json({ error: 'assignmentId ou castMemberId requis' });
  }
  if (assignmentId && !isValidUUID(assignmentId)) {
    return res.status(400).json({ error: 'assignmentId invalide' });
  }
  if (castMemberId && !isValidUUID(castMemberId)) {
    return res.status(400).json({ error: 'castMemberId invalide' });
  }

  let query = supabaseAdmin
    .from('cast_assignments')
    .delete()
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('match_id', matchId);
  if (assignmentId) query = query.eq('id', assignmentId);
  if (castMemberId) query = query.eq('cast_member_id', castMemberId);
  const { data: removed, error } = await query.select('id');
  if (error) {
    logger.error('[bot/cast] delete error', error);
    return res.status(500).json({ error: 'Échec du retrait' });
  }
  const count = removed?.length ?? 0;
  if (count === 0) {
    return res.status(404).json({ error: 'Aucun assignment trouvé' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'delete_cast_assignment',
    entity_type: 'cast_assignment',
    entity_id: assignmentId || null,
    payload: { match_id: matchId, cast_member_id: castMemberId || null },
  });

  return res.status(200).json({ success: true, removed: count });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof castQuerySchema>;

  if (req.method === 'GET')
    return handleList(res, matchId, req.botContext!.tenantId);
  if (req.method === 'POST') return handleAssign(req, res, matchId);
  if (req.method === 'DELETE') return handleUnassign(req, res, matchId);

  res.setHeader('Allow', 'GET,POST,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST', 'DELETE'],
  rateLimit: { max: 30, key: 'bot-match-cast' },
  idempotent: true,
  querySchema: castQuerySchema,
});
