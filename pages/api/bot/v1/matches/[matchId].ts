// PATCH /api/bot/v1/matches/[matchId]
//
// Commandes /planifier, /lobby, /stream (admin) : mise a jour des metadonnees
// non-score d'un match. Mirror du mode 'meta' de
// /api/admin/matches/[matchId] (PUT/PATCH), avec un whitelist plus strict —
// on n'expose ici que les champs editables depuis Discord sans risque
// (planning + ressources de stream/lobby + notes). Les changements de
// status / scores / disputes restent reserves a leurs endpoints dedies
// (/forfeit, /reset, /report, /resolve-dispute).
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner.
//
// Body : { actorDiscordUserId, scheduledAt?, lobbyCode?, streamUrl?, notes? }
// Tout champ omis n'est pas touche. Passer une valeur explicite a null
// efface le champ.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { logger } from '@/utils/logger';

const NOTES_MAX = 2000;
const LOBBY_MAX = 200;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.matchId;
  const matchId = Array.isArray(raw) ? raw[0] : raw;
  if (!matchId || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide' });
  }

  // GET : lecture des metadonnees minimales (team names + statut) sans
  // auth d'acteur Discord — utilise par le bot pour afficher des labels
  // exacts (modal report-score) au lieu de parser le DM via regex.
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select(
        `id, status, is_bye, scheduled_at, match_format,
         tournament_id, scrim_id, stage_id,
         team1:teams!matches_team1_id_fkey(id, name, short_name),
         team2:teams!matches_team2_id_fkey(id, name, short_name)`
      )
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('id', matchId)
      .maybeSingle();
    if (error) {
      logger.error('[bot/matches GET] error', error);
      return res.status(500).json({ error: 'Erreur de chargement' });
    }
    if (!data) return res.status(404).json({ error: 'Match introuvable' });
    return res.status(200).json({ match: data });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const updates: Record<string, unknown> = {};

  if ('scheduledAt' in body) {
    const v = body.scheduledAt;
    if (v === null) {
      updates.scheduled_at = null;
    } else if (typeof v === 'string') {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'scheduledAt invalide (ISO 8601 attendu)' });
      }
      updates.scheduled_at = d.toISOString();
    } else {
      return res.status(400).json({ error: 'scheduledAt doit être string ou null' });
    }
  }

  if ('lobbyCode' in body) {
    const v = body.lobbyCode;
    if (v === null) {
      updates.lobby_code = null;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > LOBBY_MAX) {
        return res.status(400).json({ error: `lobbyCode trop long (max ${LOBBY_MAX})` });
      }
      updates.lobby_code = trimmed || null;
    } else {
      return res.status(400).json({ error: 'lobbyCode doit être string ou null' });
    }
  }

  if ('streamUrl' in body) {
    const v = body.streamUrl;
    if (v === null) {
      updates.stream_url = null;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!trimmed) {
        updates.stream_url = null;
      } else {
        const safe = sanitizeUrl(trimmed);
        if (!safe) {
          return res
            .status(400)
            .json({ error: 'streamUrl invalide (http/https attendu)' });
        }
        updates.stream_url = safe;
      }
    } else {
      return res.status(400).json({ error: 'streamUrl doit être string ou null' });
    }
  }

  if ('notes' in body) {
    const v = body.notes;
    if (v === null) {
      updates.notes = null;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > NOTES_MAX) {
        return res.status(400).json({ error: `notes trop longues (max ${NOTES_MAX})` });
      }
      updates.notes = trimmed || null;
    } else {
      return res.status(400).json({ error: 'notes doit être string ou null' });
    }
  }

  if (Object.keys(updates).length === 0) {
    return res
      .status(400)
      .json({ error: 'Aucun champ à mettre à jour (scheduledAt, lobbyCode, streamUrl, notes).' });
  }

  // Verify match exists + tournament not completed (mirror admin behaviour).
  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, tournament_id, scrim_id, status, is_bye, scheduled_at')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) {
    logger.error('[bot/match/patch] lookup error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement du match' });
  }
  if (!match) return res.status(404).json({ error: 'Match introuvable' });
  if (match.is_bye) {
    return res.status(400).json({ error: 'Un match bye ne peut pas être édité.' });
  }
  if (match.tournament_id) {
    const { data: t } = await supabaseAdmin
      .from('tournaments')
      .select('status')
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('id', match.tournament_id)
      .maybeSingle();
    if (t?.status === 'completed') {
      return res.status(403).json({
        error:
          "Tournoi terminé (status=completed). Réouvre-le d'abord pour modifier ce match.",
        code: 'TOURNAMENT_COMPLETED',
      });
    }
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('matches')
    .update(updates)
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', matchId)
    .select(
      'id, status, scheduled_at, lobby_code, stream_url, notes, updated_at'
    )
    .maybeSingle();
  if (updErr || !updated) {
    logger.error('[bot/match/patch] update error', updErr);
    return res.status(500).json({ error: 'Échec de la mise à jour' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'update_match',
    entity_type: 'match',
    entity_id: matchId,
    tournament_id: match.tournament_id ?? null,
    payload: { mode: 'meta', fields: Object.keys(updates).filter((k) => k !== 'updated_at') },
  });

  // Scheduled event natif Discord : si /planifier vient de poser ou clearer
  // scheduled_at, le bot doit creer/mettre a jour/supprimer son scheduled
  // event. Mirror du comportement de pages/api/admin/matches/[matchId].ts.
  if ('scheduled_at' in updates) {
    const prev = match.scheduled_at ?? null;
    const next = (updates.scheduled_at ?? null) as string | null;
    if (prev !== next) {
      if (next) {
        void (async () => {
          const enriched = await enrichMatchEvent(matchId);
          await emitBotEvent('match.scheduled', {
            matchId,
            tournamentId: match.tournament_id ?? null,
            scrimId: match.scrim_id ?? null,
            scheduledAt: next,
            enriched,
          });
        })().catch((e) =>
          logger.error('[botEvents] match.scheduled emit error:', e)
        );
      } else {
        void emitBotEvent('match.unscheduled', { matchId }).catch((e) =>
          logger.error('[botEvents] match.unscheduled emit error:', e)
        );
      }
    }
  }

  return res.status(200).json({ success: true, match: updated });
}

export default withBotRoute(handler, {
  methods: ['GET', 'PATCH'],
  rateLimit: { max: 30, key: 'bot-match-meta' },
  idempotent: true,
});
