// GET /api/bot/v1/players/by-discord/[discordUserId]/actions-todo
//
// Liste les "actions a faire" pour une joueuse (capitaine ou pas). Sert a la
// commande Discord /mes-actions et au DM hub T-30. C'est une vue agregee
// derivee de l'etat DB courant, pas un audit log :
//
//   - match_checkin   capitaine, match pending dans <48h, pas encore checke
//   - veto            capitaine, match avec veto ouvert (a son tour)
//   - score_report    capitaine, match finished cote bot mais report pas
//                     encore soumis par sa team
//   - invitation      cible d'une invitation team pending
//
// Chaque action est munie d'une `actionKey` STABLE et DETERMINISTE, derivee
// purement d'IDs DB (forme `<type>:<entity>:<id>[:<variant>]`). C'est cette
// cle qui sert au snooze (table player_action_snoozes, PK
// (discord_user_id, action_key)). Re-poser un snooze sur la meme action
// updatera la row au lieu d'en creer une nouvelle.
//
// L'API filtre les actions encore snoozees (LEFT JOIN sur
// player_action_snoozes WHERE snoozed_until IS NULL OR snoozed_until <= now()),
// et expose `snoozedUntil: string | null` sur celles qui ont eu un snooze
// expire (utile pour l'UX "tu avais snooze ca").
//
// Grouping :
//   - urgent : match associe demarre dans <15min
//   - today  : meme jour calendaire serveur
//   - later  : reste
//
// Auth : x-api-key (lecture publique cote bot, le path embarque l'identite).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { resolveActorPlayer } from '@/utils/botActor';
import { listPendingInvitationsForUser } from '@/utils/teams/invitations';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const URGENT_WINDOW_MS = 15 * 60 * 1000;
const MATCH_LOOKAHEAD_MS = 48 * 60 * 60 * 1000;

type ActionGroup = 'urgent' | 'today' | 'later';

type Action = {
  actionKey: string;
  type: 'checkin' | 'veto' | 'score' | 'invitation';
  entity: 'match' | 'demande';
  entityId: string;
  variant?: string | null;
  /** ISO date drivant le groupage. Peut etre null (pas de deadline calendaire). */
  refAt: string | null;
  /** ISO timestamp si l'action est snoozee (sinon null). */
  snoozedUntil: string | null;
  group: ActionGroup;
  meta: Record<string, unknown>;
};

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function classifyGroup(now: Date, refAt: string | null): ActionGroup {
  if (!refAt) return 'later';
  const ts = Date.parse(refAt);
  if (!Number.isFinite(ts)) return 'later';
  const diff = ts - now.getTime();
  if (diff < URGENT_WINDOW_MS) return 'urgent';
  if (sameLocalDay(now, new Date(ts))) return 'today';
  return 'later';
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const discordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!discordUserId || !DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const player = await resolveActorPlayer(discordUserId);
  if (!player) {
    return res.status(404).json({ error: 'Compte Discord non lié au site.' });
  }

  const now = new Date();

  // --- Snoozes en vigueur (LEFT JOIN logique cote app) -------------------
  const { data: snoozeRows } = await supabaseAdmin
    .from('player_action_snoozes')
    .select('action_key, snoozed_until')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('discord_user_id', discordUserId);
  const snoozedUntilByKey = new Map<string, string>();
  for (const row of snoozeRows ?? []) {
    const r = row as { action_key: string; snoozed_until: string };
    if (Date.parse(r.snoozed_until) > now.getTime()) {
      snoozedUntilByKey.set(r.action_key, r.snoozed_until);
    }
  }

  // --- Teams ou la joueuse est capitaine ---------------------------------
  const { data: captainedTeams, error: teamsErr } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('captain_id', player.authUserId);
  if (teamsErr) {
    logger.error('[bot/player/actions-todo] teams error', teamsErr);
    return res.status(500).json({ error: 'Erreur de chargement des équipes' });
  }

  const captainedTeamIds = (captainedTeams ?? []).map(
    (t) => (t as { id: string }).id
  );

  const actions: Action[] = [];

  // --- Match check-ins pending (capitaine, 48h) --------------------------
  if (captainedTeamIds.length > 0) {
    const windowEnd = new Date(now.getTime() + MATCH_LOOKAHEAD_MS);
    const { data: matches, error: mErr } = await supabaseAdmin
      .from('matches')
      .select(
        `id, scheduled_at, status, is_bye, team1_id, team2_id,
         team1_checked_in_at, team2_checked_in_at, veto_locked_at,
         team1:team1_id (id, name),
         team2:team2_id (id, name)`
      )
      .eq('tenant_id', req.botContext!.tenantId)
      .or(
        `team1_id.in.(${captainedTeamIds.join(',')}),team2_id.in.(${captainedTeamIds.join(',')})`
      )
      .eq('status', 'pending')
      .neq('is_bye', true)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', windowEnd.toISOString());
    if (mErr) {
      logger.error('[bot/player/actions-todo] matches error', mErr);
      return res.status(500).json({ error: 'Erreur de chargement des matchs' });
    }

    for (const m of matches ?? []) {
      const row = m as Record<string, unknown>;
      const matchId = row.id as string;
      const t1Id = row.team1_id as string;
      const t2Id = row.team2_id as string;
      const isT1 = captainedTeamIds.includes(t1Id);
      const side: 1 | 2 = isT1 ? 1 : 2;
      const sideKey = side === 1 ? 'teamA' : 'teamB';
      const checkedIn = side === 1 ? !!row.team1_checked_in_at : !!row.team2_checked_in_at;
      const refAt = row.scheduled_at as string | null;

      if (!checkedIn) {
        const key = `checkin:match:${matchId}`;
        actions.push({
          actionKey: key,
          type: 'checkin',
          entity: 'match',
          entityId: matchId,
          variant: sideKey,
          refAt,
          snoozedUntil: snoozedUntilByKey.get(key) ?? null,
          group: classifyGroup(now, refAt),
          meta: { side, matchId },
        });
      }

      // Veto a faire si le match n'a pas encore lock le veto (le bot peut
      // proposer le bouton DM). On reste defensif : on ne sait pas a 100%
      // si c'est *au tour* de cette equipe sans relire le step_number, donc
      // on expose simplement "veto:match:<id>:<side>" comme actionable
      // tant que veto_locked_at est null. Le bot affichera "Veto en cours".
      if (!row.veto_locked_at) {
        const key = `veto:match:${matchId}:${sideKey}`;
        actions.push({
          actionKey: key,
          type: 'veto',
          entity: 'match',
          entityId: matchId,
          variant: sideKey,
          refAt,
          snoozedUntil: snoozedUntilByKey.get(key) ?? null,
          group: classifyGroup(now, refAt),
          meta: { side, matchId },
        });
      }
    }

    // --- Score reports a poster (capitaine, match in_progress sans report)
    // Heuristique : match status 'in_progress' (ou similaire) ou
    // scheduled_at deja passe ET pas de report submis par sa team.
    const { data: latedMatches } = await supabaseAdmin
      .from('matches')
      .select('id, scheduled_at, status, team1_id, team2_id')
      .eq('tenant_id', req.botContext!.tenantId)
      .or(
        `team1_id.in.(${captainedTeamIds.join(',')}),team2_id.in.(${captainedTeamIds.join(',')})`
      )
      .in('status', ['pending', 'in_progress'])
      .lt('scheduled_at', now.toISOString())
      .gte(
        'scheduled_at',
        new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      );

    const lateMatchIds = (latedMatches ?? []).map(
      (m) => (m as { id: string }).id
    );
    if (lateMatchIds.length > 0) {
      const { data: reports } = await supabaseAdmin
        .from('match_score_reports')
        .select('match_id, team_side')
        .eq('tenant_id', req.botContext!.tenantId)
        .in('match_id', lateMatchIds);
      const reportedBy = new Set<string>();
      for (const r of reports ?? []) {
        const rr = r as { match_id: string; team_side: number };
        reportedBy.add(`${rr.match_id}:${rr.team_side}`);
      }

      for (const m of latedMatches ?? []) {
        const row = m as Record<string, unknown>;
        const matchId = row.id as string;
        const t1Id = row.team1_id as string;
        const side: 1 | 2 = captainedTeamIds.includes(t1Id) ? 1 : 2;
        if (reportedBy.has(`${matchId}:${side}`)) continue;
        const key = `score:match:${matchId}`;
        const refAt = row.scheduled_at as string | null;
        actions.push({
          actionKey: key,
          type: 'score',
          entity: 'match',
          entityId: matchId,
          variant: null,
          refAt,
          snoozedUntil: snoozedUntilByKey.get(key) ?? null,
          group: classifyGroup(now, refAt),
          meta: { side, matchId },
        });
      }
    }
  }

  // --- Invitations team pending (joueur cible) ---------------------------
  const invs = await listPendingInvitationsForUser(
    req.botContext!.tenantId,
    player.authUserId
  );
  if (invs.ok) {
    for (const d of invs.data) {
      const key = `invitation:demande:${d.id}`;
      actions.push({
        actionKey: key,
        type: 'invitation',
        entity: 'demande',
        entityId: d.id,
        variant: null,
        refAt: d.payload?.expires_at ?? d.created_at,
        snoozedUntil: snoozedUntilByKey.get(key) ?? null,
        group: classifyGroup(
          now,
          d.payload?.expires_at ?? d.created_at
        ),
        meta: { teamId: d.team_id ?? null },
      });
    }
  }

  // L'API filtre les actions encore snoozees (snoozed_until > now()). On
  // exclut donc tout entry pour lequel snoozedUntil est encore actif.
  const visible = actions.filter((a) => {
    if (!a.snoozedUntil) return true;
    return Date.parse(a.snoozedUntil) <= now.getTime();
  });

  // Tri stable : urgent -> today -> later, puis refAt ascendant.
  const order: Record<ActionGroup, number> = { urgent: 0, today: 1, later: 2 };
  visible.sort((x, y) => {
    if (order[x.group] !== order[y.group]) return order[x.group] - order[y.group];
    const xs = x.refAt ?? '';
    const ys = y.refAt ?? '';
    return xs.localeCompare(ys);
  });

  return res.status(200).json({
    player: {
      authUserId: player.authUserId,
      discordUserId,
    },
    actions: visible,
    count: visible.length,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-player-actions-todo' },
});
