// pages/api/player/dashboard.ts
// Aggregated player dashboard endpoint — collapses the previous 2-wave
// waterfall (/api/admin/teams/my + /api/demandes/captain + /api/demandes/join,
// then /api/teams/scrim-requests + /api/player/messages) plus next-match into a
// SINGLE GET. The managed team is resolved once via getManagedTeam, then every
// section query runs in parallel server-side.
//
// Response shape (matches what pages/player/index.tsx consumes so the client
// mapping is minimal):
//   {
//     team, members, isCaptain, isManager,
//     demandesCaptain, demandesJoin,
//     pendingScrims, unreadMessages,
//     nextMatch  // { ...NextMatchPayload, readiness: { minPlayers, rosterSize, shortfall } }
//   }
//
// Captain-only sections (pendingScrims, unreadMessages) are gated exactly like
// the legacy client gating: a non-captain/non-manager gets empty/zero values.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import {
  loadManagedTeamSlice,
  type ManagedTeamSummary,
} from '@/utils/teams/managedTeamSlice';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import type { TeamPermission } from '@/utils/teamRoles';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import { readScrimNego } from '@/utils/teams/scrimNegotiation';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';

import { logger } from '../../../utils/logger';

type TeamRow = {
  id: string;
  slug: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  description: string | null;
  is_joinable?: boolean;
  open_for_scrim?: boolean;
};

type MemberRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  battle_tag: string | null;
  battle_tag_verified_at?: string | null;
  specialty: string | null;
  /** SR Overwatch déclaré (cf. utils/overwatchRank.ts), `null` si non renseigné. */
  skill_rating: number | null;
  is_substitute: boolean;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

type Demande = Record<string, unknown>;

export type PendingScrim = {
  id: string;
  user_id: string | null;
  source: string | null;
  status: string;
  comment: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  user: {
    id: string | null;
    email: string | null;
    display_name: string | null;
    discord: string | null;
  } | null;
  /** Negotiation contract (cf. utils/teams/scrimNegotiation.ts). */
  scrimNego: {
    slots: string[];
    proposedBy: string | null;
    rounds: number;
    agreedSlot: string | null;
  };
  /** true when my team is the requester (payload.from_team_id). */
  iAmRequester: boolean;
  myTeamId: string;
};

export type NextMatchSection = {
  match: {
    id: string;
    scheduledAt: string | null;
    status: string;
    format: string | null;
    roundName: string | null;
    streamUrl: string | null;
    bestOf: number | null;
  } | null;
  team: { id: string; name: string; slot: 1 | 2 } | null;
  opponent: { id: string; name: string } | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    token: string | null;
    alreadyCheckedIn: boolean;
    checkedInAt: string | null;
    opensAt: string | null;
    closesAt: string | null;
    isOpen: boolean;
    isPassed: boolean;
  } | null;
  /**
   * Match-readiness metadata derived from the tournament min_players and the
   * current roster size. `shortfall` > 0 means the team is under the minimum.
   */
  readiness: {
    minPlayers: number | null;
    rosterSize: number;
    shortfall: number;
  } | null;
};

/**
 * Une chose À FAIRE, calculée serveur (lot J6 de docs/PLAN-espace-joueur.md).
 *
 * Le dashboard empile une quinzaine de cartes ; quand elles parlent toutes, la
 * hiérarchie est celle du code, pas celle de l'urgence — une capitaine à J-1
 * doit descendre pour trouver son check-in. Ce bandeau remonte les gestes en
 * attente, plafonné à trois : au-delà, ce n'est plus une liste d'actions mais
 * une deuxième page.
 *
 * Règle : AUCUNE nouvelle règle métier ici. Chaque item est dérivé d'une
 * donnée que le payload contient déjà (ou d'une lecture que la carte
 * correspondante faisait de son côté).
 */
export type TodoItem = {
  /** Identifiant stable — l'ordre et le rendu ne doivent pas sautiller. */
  id:
    | 'checkin'
    | 'lineup'
    | 'scrims'
    | 'messages'
    | 'invitation'
    | 'battletag'
    | 'roster';
  /** Chemin interne à ouvrir. */
  href: string;
  /** Compteur associé (messages non lus, scrims en attente…), sinon `null`. */
  count: number | null;
};

export type PlayerDashboardPayload = {
  team: TeamRow | null;
  members: MemberRow[];
  isCaptain: boolean;
  isManager: boolean;
  /**
   * Permissions EFFECTIVES sur `team` — la MÊME liste que celle appliquée par
   * les routes d'écriture. Le client s'en sert pour ne proposer que les gestes
   * qui aboutiront : `isCaptain` / `isManager` seuls faisaient afficher au
   * coach des actions que le serveur lui refusait ensuite.
   */
  permissions: TeamPermission[];
  /**
   * Toutes les équipes gérées, `team` comprise (un manager peut en encadrer
   * plusieurs). Vide pour une joueuse sans droits de gestion.
   */
  managedTeams: ManagedTeamSummary[];
  /**
   * Les trois gestes les plus urgents, dans un ordre STABLE (défini par le
   * serveur). Vide = rien à faire, et l'écran ne rend alors aucun bandeau.
   */
  todo: TodoItem[];
  demandesCaptain: Demande[];
  demandesJoin: Demande[];
  pendingScrims: PendingScrim[];
  unreadMessages: number;
  nextMatch: NextMatchSection;
};

export const EMPTY_NEXT_MATCH: NextMatchSection = {
  match: null,
  team: null,
  opponent: null,
  tournament: null,
  checkin: null,
  readiness: null,
};

/** Deterministic conversation ID from two team UUIDs (mirrors player/messages). */
function conversationId(teamA: string, teamB: string): string {
  return teamA < teamB ? `${teamA}_${teamB}` : `${teamB}_${teamA}`;
}

/* -----------------------------------------------------------
 * Section loaders — each returns its slice and never throws so a single
 * failing section degrades gracefully instead of taking the whole dashboard
 * down (matches the per-section .catch() behavior the client used to have).
 * ---------------------------------------------------------*/

async function loadDemandes(
  userId: string,
  tenantId: string,
  type: 'captain_request' | 'join'
): Promise<Demande[]> {
  try {
    const sel =
      type === 'join'
        ? '*, team:teams!team_id(id, name, short_name, logo_url)'
        : '*';
    const { data, error } = await supabaseAdmin
      .from('demandes')
      .select(sel)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(`[player/dashboard] demandes ${type} error:`, error);
      return [];
    }
    return (data || []) as unknown as Demande[];
  } catch (err) {
    logger.error(`[player/dashboard] demandes ${type} error:`, err);
    return [];
  }
}

export async function loadPendingScrims(
  teamId: string,
  tenantId: string
): Promise<PendingScrim[]> {
  try {
    // Scrims AWAITING MY ACTION in both directions :
    //  - my team is a participant (target via team_id OR requester via
    //    payload.from_team_id), AND
    //  - the current proposal was NOT made by my team (it's my turn).
    // Two queries (one per direction) merged + deduped in code — the unit-test
    // supabase mock treats .or() as a no-op so we never rely on it.
    const [asTargetRes, asRequesterRes] = await Promise.all([
      supabaseAdmin
        .from('demandes')
        .select('*')
        .eq('team_id', teamId)
        .eq('tenant_id', tenantId)
        .eq('type', 'scrim')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('demandes')
        .select('*')
        .filter('payload->>from_team_id', 'eq', teamId)
        .eq('tenant_id', tenantId)
        .eq('type', 'scrim')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (asTargetRes.error || asRequesterRes.error) {
      logger.error(
        '[player/dashboard] pendingScrims error:',
        asTargetRes.error || asRequesterRes.error
      );
      return [];
    }

    const byId = new Map<string, Record<string, unknown>>();
    for (const d of [
      ...(asTargetRes.data || []),
      ...(asRequesterRes.data || []),
    ] as Record<string, unknown>[]) {
      byId.set(d.id as string, d);
    }

    // Keep only the demandes where it's MY turn (non-proposer).
    const demandes = Array.from(byId.values()).filter((d) => {
      const nego = readScrimNego((d.payload as Record<string, unknown>) || {});
      return nego.proposed_by !== teamId;
    });

    // Enrich with sender info (mirrors /api/teams/scrim-requests GET).
    // Batch-resolve every auth user_id in ONE RPC instead of N getUserById
    // round-trips; unknown ids simply stay absent from the Map (userInfo null).
    const profiles = await fetchAdminUserProfiles(
      (demandes || []).map((d) => d.user_id as string | null | undefined)
    );

    const enriched = (demandes || []).map((d: Record<string, unknown>) => {
      let userInfo: PendingScrim['user'] = null;
      if (d.user_id) {
        const p = profiles.get(d.user_id as string);
        if (p) {
          userInfo = {
            id: d.user_id as string,
            email: p.email || null,
            display_name: p.display_name || p.full_name || null,
            discord: p.discord || null,
          };
        }
      } else if (d.source === 'public' && d.payload) {
        const p = d.payload as Record<string, unknown>;
        userInfo = {
          id: null,
          email: (p.requester_email as string) || null,
          display_name: (p.requester_name as string) || null,
          discord: (p.requester_discord as string) || null,
        };
      }
      const payload = (d.payload as Record<string, unknown> | null) ?? null;
      const nego = readScrimNego(payload || {});
      const fromTeamId = (payload?.from_team_id as string | null) ?? null;
      return {
        id: d.id as string,
        user_id: (d.user_id as string | null) ?? null,
        source: (d.source as string | null) ?? null,
        status: d.status as string,
        comment: (d.comment as string | null) ?? null,
        payload,
        created_at: d.created_at as string,
        user: userInfo,
        scrimNego: {
          slots: nego.slots,
          proposedBy: nego.proposed_by,
          rounds: nego.rounds,
          agreedSlot: nego.agreed_slot,
        },
        iAmRequester: teamId === fromTeamId,
        myTeamId: teamId,
      };
    });
    return enriched;
  } catch (err) {
    logger.error('[player/dashboard] pendingScrims error:', err);
    return [];
  }
}

async function loadUnreadMessages(
  teamId: string,
  tenantId: string
): Promise<number> {
  try {
    const { data: messages, error } = await supabaseAdmin
      .from('demandes')
      .select('id, user_id, team_id, comment, payload, status, created_at')
      .eq('type', 'captain_message')
      .eq('tenant_id', tenantId)
      .or(`payload->>from_team_id.eq.${teamId},team_id.eq.${teamId}`)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[player/dashboard] unreadMessages error:', error);
      return 0;
    }

    // Group by conversation and count unread (incoming + pending) — mirrors
    // the reduce the client did over /api/player/messages conversations.
    const unreadByConv = new Map<string, number>();
    for (const msg of (messages || []) as Record<string, unknown>[]) {
      const payload = (msg.payload as Record<string, unknown>) || {};
      const convId =
        (payload.conversation_id as string) ||
        conversationId(
          (payload.from_team_id as string) || '',
          msg.team_id as string
        );
      const isIncoming = msg.team_id === teamId;
      const isUnread = isIncoming && msg.status === 'pending';
      if (isUnread) {
        unreadByConv.set(convId, (unreadByConv.get(convId) || 0) + 1);
      } else if (!unreadByConv.has(convId)) {
        unreadByConv.set(convId, 0);
      }
    }
    let total = 0;
    for (const n of unreadByConv.values()) total += n;
    return total;
  } catch (err) {
    logger.error('[player/dashboard] unreadMessages error:', err);
    return 0;
  }
}

export async function loadNextMatch(
  teamId: string,
  tenantId: string,
  rosterSize: number
): Promise<NextMatchSection> {
  try {
    const cutoffISO = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: matches, error } = await supabaseAdmin
      .from('matches')
      .select(
        `
        id, status, scheduled_at, match_format, round_name, stream_url,
        team1_id, team2_id,
        team1_checkin_token, team2_checkin_token,
        team1_checked_in_at, team2_checked_in_at,
        team1:team1_id(id, name),
        team2:team2_id(id, name),
        tournament:tournament_id(id, name, slug, min_players)
        `
      )
      .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'ongoing'])
      .gte('scheduled_at', cutoffISO)
      .order('scheduled_at', { ascending: true })
      .limit(1);

    if (error) {
      logger.error('[player/dashboard] nextMatch error:', error);
      return EMPTY_NEXT_MATCH;
    }

    const match = matches?.[0] as Record<string, unknown> | undefined;
    if (!match) return EMPTY_NEXT_MATCH;

    const isTeam1 = match.team1_id === teamId;
    const slot: 1 | 2 = isTeam1 ? 1 : 2;
    const team1 = (
      Array.isArray(match.team1) ? match.team1[0] : match.team1
    ) as { id: string; name: string } | null;
    const team2 = (
      Array.isArray(match.team2) ? match.team2[0] : match.team2
    ) as { id: string; name: string } | null;
    const myTeam = isTeam1 ? team1 : team2;
    const opponent = isTeam1 ? team2 : team1;
    const tn = (
      Array.isArray(match.tournament) ? match.tournament[0] : match.tournament
    ) as {
      id: string;
      name: string;
      slug: string | null;
      min_players: number | null;
    } | null;

    const token = isTeam1
      ? (match.team1_checkin_token as string | null)
      : (match.team2_checkin_token as string | null);
    const checkedInAt = isTeam1
      ? (match.team1_checked_in_at as string | null)
      : (match.team2_checked_in_at as string | null);

    const scheduledAt = (match.scheduled_at as string | null) ?? null;
    const opensAt = scheduledAt
      ? new Date(
          new Date(scheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
        ).toISOString()
      : null;
    const closesAt = scheduledAt;

    const now = Date.now();
    const isOpen =
      !!opensAt &&
      !!closesAt &&
      now >= new Date(opensAt).getTime() &&
      now <= new Date(closesAt).getTime();
    const isPassed = !!closesAt && now > new Date(closesAt).getTime();

    const formatStr = (match.match_format as string | null) ?? null;
    const bestOf = formatStr
      ? Number.parseInt(formatStr.replace(/[^\d]/g, ''), 10) || null
      : null;

    const minPlayers = tn?.min_players ?? null;
    const shortfall =
      typeof minPlayers === 'number' && minPlayers > rosterSize
        ? minPlayers - rosterSize
        : 0;

    return {
      match: {
        id: match.id as string,
        scheduledAt,
        status: match.status as string,
        format: formatStr,
        roundName: (match.round_name as string | null) ?? null,
        streamUrl: (match.stream_url as string | null) ?? null,
        bestOf,
      },
      team: myTeam ? { id: myTeam.id, name: myTeam.name, slot } : null,
      opponent: opponent ? { id: opponent.id, name: opponent.name } : null,
      tournament: tn
        ? { id: tn.id, name: tn.name, slug: tn.slug ?? null }
        : null,
      checkin: {
        token: token ?? null,
        alreadyCheckedIn: !!checkedInAt,
        checkedInAt: checkedInAt ?? null,
        opensAt,
        closesAt,
        isOpen,
        isPassed,
      },
      readiness: {
        minPlayers,
        rosterSize,
        shortfall,
      },
    };
  } catch (err) {
    logger.error('[player/dashboard] nextMatch error:', err);
    return EMPTY_NEXT_MATCH;
  }
}

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlayerDashboardPayload | { error: string }>,
  { subject }
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-dashboard')
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Subject = the caller, or the inspected user when staff passes `?as=`.
  const { userId, tenantId } = subject;

  // Resolve the managed team slice once via the shared server helper. It
  // returns team + members + the canonical isCaptain/isManager flags (derived
  // through getManagedTeam, tenant-scoped) — the SAME source of truth as
  // /api/admin/teams/my, so the two endpoints can no longer diverge.
  const teamSlice = await loadManagedTeamSlice(userId, tenantId, {
    teamId: readRequestedTeamId(req),
  });

  const { isCaptain, isManager } = teamSlice;
  const canManage = isCaptain || isManager;
  const rosterSize = teamSlice.members.length;

  // Everything below runs in parallel. Captain-only sections short-circuit to
  // empty values for plain players (same gating the client used to apply).
  const [
    demandesCaptain,
    demandesJoin,
    pendingScrims,
    unreadMessages,
    nextMatch,
    pendingInvitations,
  ] = await Promise.all([
    loadDemandes(userId, tenantId, 'captain_request'),
    loadDemandes(userId, tenantId, 'join'),
    canManage && teamSlice.teamId
      ? loadPendingScrims(teamSlice.teamId, tenantId)
      : Promise.resolve([] as PendingScrim[]),
    canManage && teamSlice.teamId
      ? loadUnreadMessages(teamSlice.teamId, tenantId)
      : Promise.resolve(0),
    teamSlice.teamId
      ? loadNextMatch(teamSlice.teamId, tenantId, rosterSize)
      : Promise.resolve(EMPTY_NEXT_MATCH),
    // Invitations reçues : la carte les chargeait déjà de son côté ; le
    // bandeau « à faire » a besoin du seul compte, on le prend ici plutôt que
    // d'ajouter une seconde requête côté client.
    loadPendingInvitationCount(userId, tenantId),
  ]);

  const todo = buildTodo({
    userId,
    nextMatch,
    pendingScrims,
    unreadMessages,
    pendingInvitations,
    members: teamSlice.members,
    canManage,
    permissions: teamSlice.permissions,
  });

  return res.status(200).json({
    team: teamSlice.team,
    members: teamSlice.members,
    isCaptain,
    isManager,
    permissions: teamSlice.permissions,
    managedTeams: teamSlice.managedTeams,
    todo,
    demandesCaptain,
    demandesJoin,
    pendingScrims,
    unreadMessages,
    nextMatch,
  });
});

/* -------------------------------------------------------------------------
 * Bandeau « à faire » (lot J6)
 * ---------------------------------------------------------------------- */

/** Combien d'invitations d'équipe attendent une réponse. */
async function loadPendingInvitationCount(
  userId: string,
  tenantId: string
): Promise<number> {
  if (!supabaseAdmin) return 0;
  const { count, error } = await supabaseAdmin
    .from('demandes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('type', 'invite')
    .eq('status', 'pending');
  if (error) {
    logger.error('[player/dashboard] invitations count error:', error);
    return 0;
  }
  return count ?? 0;
}

/**
 * Les trois gestes en attente, dans un ordre FIXE : le plus périssable
 * d'abord. Le check-in se referme tout seul, les invitations expirent, les
 * messages attendent. Cet ordre est celui du code — donc stable d'un
 * chargement à l'autre, ce qui est la moitié de l'intérêt d'un tel bandeau.
 */
export function buildTodo(input: {
  userId: string;
  nextMatch: NextMatchSection;
  pendingScrims: PendingScrim[];
  unreadMessages: number;
  pendingInvitations: number;
  members: {
    user_id?: string | null;
    battle_tag_verified_at?: string | null;
  }[];
  canManage: boolean;
  permissions: TeamPermission[];
}): TodoItem[] {
  const items: TodoItem[] = [];
  const match = input.nextMatch?.match ?? null;
  const checkin = input.nextMatch?.checkin ?? null;
  const readiness = input.nextMatch?.readiness ?? null;

  // 1. Check-in ouvert et non fait : la seule échéance qui se referme seule.
  if (match && checkin && checkin.isOpen && !checkin.alreadyCheckedIn) {
    items.push({
      id: 'checkin',
      href: `/player/match/${match.id}`,
      count: null,
    });
  }

  // 2. Effectif sous le minimum du tournoi — ça ne se règle pas le jour même.
  if (readiness && readiness.shortfall > 0) {
    items.push({
      id: 'roster',
      href: '/player/manage-team',
      count: readiness.shortfall,
    });
  }

  // 3. Feuille de match : possible seulement une fois le check-in fait, et
  //    réservée à qui peut la valider.
  if (
    match &&
    checkin?.alreadyCheckedIn &&
    input.permissions.includes('validate_lineup')
  ) {
    items.push({
      id: 'lineup',
      href: `/player/match/${match.id}`,
      count: null,
    });
  }

  // 4. Invitation reçue : elle expire, et c'est un geste d'une seconde.
  if (input.pendingInvitations > 0) {
    items.push({
      id: 'invitation',
      href: '/player',
      count: input.pendingInvitations,
    });
  }

  // 5. Scrims en attente de MA réponse.
  if (input.pendingScrims.length > 0) {
    items.push({
      id: 'scrims',
      href: '/player#scrim-plannings',
      count: input.pendingScrims.length,
    });
  }

  // 6. Messages d'équipe non lus.
  if (input.unreadMessages > 0) {
    items.push({
      id: 'messages',
      href: '/player/messages',
      count: input.unreadMessages,
    });
  }

  // 7. Mon BattleTag n'est pas vérifié — le plus patient des rappels.
  const me = input.members.find((m) => m.user_id === input.userId);
  if (me && !me.battle_tag_verified_at) {
    items.push({ id: 'battletag', href: '/player/profile', count: null });
  }

  return items.slice(0, 3);
}
