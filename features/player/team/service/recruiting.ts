// features/player/team/service/recruiting.ts — trouver et inviter des
// joueuses depuis l'équipe gérée (lot P10, même contrat) :
//   * GET  /api/teams/search-players  — recherche (BattleTag / pseudo / e-mail exact) ;
//   * GET  /api/teams/free-players    — joueuses libres du tenant ;
//   * POST /api/teams/invite-free-player — invitation d'une joueuse libre liée.
// `manage_roster` est exigé par la route.
//
// Recherche, SÉCURITÉ : `auth.users` est global à l'instance (tous tenants) ;
// deux sources seulement, non énumérables : les rosters DU TENANT (sous-chaîne)
// et l'adresse e-mail EXACTE (on confirme une adresse connue, on ne balaie
// pas l'annuaire). Un e-mail n'est résolu que pour un candidat déjà membre du
// tenant — garde-fou anti-fuite cross-tenant.

import { escapePostgrestValue } from '@/utils/apiHelpers';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import {
  isActive,
  normalizeRoles,
  type FreePlayerRole,
  type FreePlayerSource,
} from '@/utils/freePlayers';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { createInvitation } from '@/utils/teams/invitations';
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from '@/utils/teams/inviteLinks';
import { alertIfBlacklisted } from '@/utils/moderation/blacklist';
import { TEAM_MANAGEMENT_FORBIDDEN } from '@/utils/teams/managementAccess';
import {
  listRosterRowsForUsers,
  listTenantFreePlayers,
  listTenantRosterUserIds,
  readLinkedFreePlayer,
  searchRosterByText,
  searchUsersRpc,
  teamInTenant,
} from '../repository/recruiting';
import { InviteFreePlayerBody } from '../inviteSchemas';
import { fail, type ManagedTeamContext } from './context';

/* ------------------------------------------------------------------------
 * Recherche
 * ---------------------------------------------------------------------- */

type PlayerResult = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  has_team: boolean;
};

type Candidate = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag_hint: string | null;
};

async function findCandidates(ctx: ManagedTeamContext, query: string) {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  // 1) Rosters du tenant (sous-chaîne BattleTag / pseudo).
  const byTag = await searchRosterByText(
    ctx.db,
    ctx.tenantId,
    escapePostgrestValue(query)
  );
  for (const m of byTag) {
    if (!m.user_id || seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    candidates.push({
      id: m.user_id,
      email: null,
      display_name: m.display_name || null,
      battle_tag_hint: m.battle_tag || null,
    });
  }

  // 2) Adresse EXACTE : trouve une joueuse sans équipe sans rouvrir
  // l'énumération (tout ce qui n'est pas l'égalité stricte est jeté).
  const needle = query.includes('@') ? query.toLowerCase() : null;
  if (needle) {
    const { rows, error } = await searchUsersRpc(ctx.db, needle);
    if (error) {
      ctx.logger.error('[api/teams/search-players] admin_search_users:', error);
    }
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      if (String(row.email ?? '').toLowerCase() !== needle) continue;
      seen.add(row.id);
      candidates.push({
        id: row.id,
        email: row.email ?? null,
        display_name: row.display_name ?? null,
        battle_tag_hint: row.battle_tag ?? null,
      });
    }
  }
  return candidates.slice(0, 20);
}

export async function searchPlayers(
  ctx: ManagedTeamContext,
  rawQuery: unknown
): Promise<{ players: PlayerResult[] }> {
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  if (!query || query.length < 2) {
    throw fail(400, 'Query must be at least 2 characters');
  }
  if (query.length > 100) {
    throw fail(400, 'Query too long (max 100 characters)');
  }

  try {
    const candidates = await findCandidates(ctx, query);
    const ids = candidates.map((c) => c.id);

    // Appartenances en un seul appel (pas de N+1).
    const membership = new Map<string, { battle_tag: string | null }>();
    if (ids.length > 0) {
      for (const m of await listRosterRowsForUsers(ctx.db, ctx.tenantId, ids)) {
        if (m.user_id) {
          membership.set(m.user_id, { battle_tag: m.battle_tag || null });
        }
      }
    }

    // E-mails : UNIQUEMENT pour les candidats membres du tenant.
    const needsAuth = candidates.filter(
      (c) => !c.email && membership.has(c.id)
    );
    const profiles = await fetchAdminUserProfiles(needsAuth.map((c) => c.id));
    const auth = new Map<
      string,
      { email: string | null; display_name: string | null }
    >();
    for (const c of needsAuth) {
      const p = profiles.get(c.id);
      if (p) {
        auth.set(c.id, {
          email: p.email || null,
          display_name: p.display_name || null,
        });
      }
    }

    return {
      players: candidates.map((c) => ({
        id: c.id,
        email: c.email || auth.get(c.id)?.email || null,
        display_name: c.display_name || auth.get(c.id)?.display_name || null,
        battle_tag:
          membership.get(c.id)?.battle_tag || c.battle_tag_hint || null,
        has_team: membership.has(c.id),
      })),
    };
  } catch (err: unknown) {
    ctx.logger.error('[api/teams/search-players] error:', err);
    throw fail(500, 'Search failed');
  }
}

/* ------------------------------------------------------------------------
 * Joueuses libres
 * ---------------------------------------------------------------------- */

type FreePlayerOut = {
  /** Clé stable : une inscription web n'a pas de discordUserId. */
  id: string;
  source: FreePlayerSource;
  discordUserId: string | null;
  discordUsername: string | null;
  linked: boolean;
  authUserId: string | null;
  displayName: string | null;
  battleTag: string | null;
  specialty: string | null;
  roles: FreePlayerRole[];
  level: string | null;
  availability: string | null;
  note: string | null;
  /**
   * PRIVÉS : ne sortent que par cette route (jamais /api/public/free-players),
   * contrepartie du « sans compte ».
   */
  contact: { email: string | null; discord: string | null } | null;
};

/**
 * Deux provenances (`discord` : rôle « Recherche une équipe » synchronisé
 * par le bot ; `web` : inscription /rejoindre sans compte). Exclut l'appelante
 * et toute personne déjà en équipe dans le tenant.
 */
export async function listFreePlayers(
  ctx: ManagedTeamContext
): Promise<{ players: FreePlayerOut[] }> {
  const { rows, error } = await listTenantFreePlayers(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[teams/free-players] free_players query error', error);
    throw fail(500, 'Erreur de chargement des joueurs libres.');
  }
  // Périmées filtrées en JS : les rows Discord n'ont pas d'`expires_at`.
  const now = new Date();
  const active = rows.filter((r) => isActive(r, now));

  const { ids: teamed, error: memberErr } = await listTenantRosterUserIds(
    ctx.db,
    ctx.tenantId
  );
  if (memberErr) {
    ctx.logger.error(
      '[teams/free-players] team_members query error',
      memberErr
    );
    throw fail(500, 'Erreur de chargement des équipes.');
  }

  const self = ctx.subject.userId;
  const filtered = active.filter(
    (r) =>
      !(
        r.auth_user_id &&
        (r.auth_user_id === self || teamed.has(r.auth_user_id))
      )
  );

  // Profil via la RPC (pas de table `profiles` dans ce projet).
  const profiles = await fetchAdminUserProfiles(
    filtered.map((r) => r.auth_user_id)
  );
  return {
    players: filtered.map((r) => {
      const profile = r.auth_user_id ? profiles.get(r.auth_user_id) : undefined;
      const isWeb = r.source === 'web';
      return {
        id: r.id,
        source: isWeb ? 'web' : 'discord',
        discordUserId: r.discord_user_id ?? null,
        discordUsername: r.discord_username ?? null,
        linked: !!r.auth_user_id,
        authUserId: r.auth_user_id ?? null,
        // Le nom saisi fait foi pour une inscription web.
        displayName: r.display_name ?? profile?.display_name ?? null,
        battleTag: profile?.battle_tag ?? null,
        // Une joueuse libre n'est pas en équipe : champ stable, toujours null.
        specialty: null,
        roles: normalizeRoles(r.roles),
        level: r.level ?? null,
        availability: r.availability ?? null,
        note: r.note ?? null,
        contact: isWeb
          ? {
              email: r.contact_email ?? null,
              discord: r.contact_discord ?? null,
            }
          : null,
      };
    }),
  };
}

/**
 * Invitation PENDING d'une joueuse libre LIÉE (la cible doit en être une :
 * pas d'épinglage d'un compte arbitraire). Un LIEN est rendu, une fois : ce
 * chemin n'a ni e-mail, ni DM, ni événement sortant.
 */
export async function inviteFreePlayer(
  ctx: ManagedTeamContext,
  rawBody: unknown
) {
  const parsed = InviteFreePlayerBody.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw fail(
      400,
      'teamId (UUID) et authUserId (UUID) requis.',
      'INVALID_BODY',
      { fields: parsed.error.flatten().fieldErrors }
    );
  }
  const { teamId, authUserId } = parsed.data;
  const { db, tenantId } = ctx;

  // L'équipe du corps DOIT être l'équipe gérée (appartenance vérifiée).
  if (ctx.team.teamId !== teamId) throw fail(403, TEAM_MANAGEMENT_FORBIDDEN);

  const { exists, error: teamErr } = await teamInTenant(db, tenantId, teamId);
  if (teamErr) {
    ctx.logger.error('[teams/invite-free-player] team lookup error', teamErr);
    throw fail(500, 'Erreur de chargement de l’équipe.');
  }
  if (!exists) throw fail(404, 'Équipe introuvable.');

  const { freePlayer, error: fpErr } = await readLinkedFreePlayer(
    db,
    tenantId,
    authUserId
  );
  if (fpErr) {
    ctx.logger.error(
      '[teams/invite-free-player] free_player lookup error',
      fpErr
    );
    throw fail(500, 'Erreur de vérification du joueur libre.');
  }
  if (!freePlayer) {
    throw fail(
      404,
      "Ce joueur n'est pas (ou plus) un joueur libre disponible."
    );
  }

  const lock = await isTeamRosterLocked(tenantId, teamId);
  if (lock.locked) throw fail(409, rosterLockErrorMessage(lock));

  const discordUserId =
    typeof freePlayer.discord_user_id === 'string'
      ? freePlayer.discord_user_id
      : null;
  const inviteToken = generateInviteToken();
  const result = await createInvitation(tenantId, {
    teamId,
    captainAuthUserId: ctx.subject.userId,
    inviteeAuthUserId: authUserId,
    inviteeDiscordUserId: discordUserId,
    source: 'website',
    inviteTokenHash: hashInviteToken(inviteToken),
  });
  if (!result.ok) {
    // « Déjà membre » : conflit d'état (409), comme player/invitations.
    const status =
      result.status === 400 && /déjà membre/i.test(result.error)
        ? 409
        : result.status;
    throw fail(status, result.error);
  }

  void alertIfBlacklisted(db as never, tenantId, 'add_member', {
    discordUserId,
    displayName:
      typeof freePlayer.discord_username === 'string'
        ? freePlayer.discord_username
        : null,
  });

  return {
    ok: true,
    demandeId: result.data.id,
    invite_url: buildInviteUrl(inviteToken),
  };
}
