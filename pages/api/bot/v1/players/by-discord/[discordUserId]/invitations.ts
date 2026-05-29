// GET /api/bot/v1/players/by-discord/[discordUserId]/invitations
//
// Liste les invitations pending d'une joueuse (cible). Utilise par :
//   - /me (afficher les invitations courantes)
//   - le bot apres un restart pour re-poster les DM (defensive)
//
// Auth : x-api-key. Pas d'acteur Discord requis ici (la cible est dans l'URL,
// et le bot ne distribue pas ces liens en clair cote utilisateur).

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { resolveActorPlayer } from '@/utils/botActor';
import { listPendingInvitationsForUser } from '@/utils/teams/invitations';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const discordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!discordUserId || !DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const player = await resolveActorPlayer(discordUserId);
  if (!player) {
    return res.status(404).json({ error: 'Compte Discord non lié au site.' });
  }

  const result = await listPendingInvitationsForUser(
    req.botContext.tenantId,
    player.authUserId
  );
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  // Enrichir avec le nom de l'equipe pour le DM/embed (1 query batch).
  const teamIds = Array.from(
    new Set(result.data.map((d) => d.team_id).filter((x): x is string => !!x))
  );
  let teamsById = new Map<string, { id: string; name: string; slug: string }>();
  if (teamIds.length > 0) {
    const { data: teams, error: teamsErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, slug')
      .eq('tenant_id', req.botContext.tenantId)
      .in('id', teamIds);
    if (teamsErr) {
      logger.error('[bot/player/invitations] teams enrich error', teamsErr);
    } else {
      teamsById = new Map((teams ?? []).map((t) => [t.id, t]));
    }
  }

  const invitations = result.data.map((d) => ({
    id: d.id,
    teamId: d.team_id,
    team: d.team_id ? (teamsById.get(d.team_id) ?? null) : null,
    role: d.payload?.desired_role ?? 'player',
    battleTag: d.payload?.battle_tag ?? null,
    captainDiscordUserId: d.payload?.captain_discord_user_id ?? null,
    expiresAt: d.payload?.expires_at ?? null,
    comment: d.comment,
    createdAt: d.created_at,
  }));

  return res.status(200).json({ invitations });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-player-invitations' },
});
