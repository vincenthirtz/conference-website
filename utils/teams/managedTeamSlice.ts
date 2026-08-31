// utils/teams/managedTeamSlice.ts
//
// SOURCE DE VÉRITÉ UNIQUE pour la « tranche équipe » d'un utilisateur
// (capitaine ou manager) côté serveur.
//
// Historiquement, deux routes calculaient CHACUNE — de façon divergente — la
// réponse « quelle est mon équipe / suis-je capitaine » :
//
//   - `pages/api/player/dashboard.ts` (source A) : `loadTeamAndMembers` +
//     `getManagedTeam(userId, tenantId)` pour dériver isCaptain/isManager.
//     N'exposait PAS `open_for_scrim`, ni `battle_tag_verified_at` /
//     `captain` / `is_captain` sur les membres. Scopé tenant.
//   - `pages/api/admin/teams/my.ts` (source B) : `isCaptain` calculé en
//     comparant directement `teams.captain_id === userId`, `getManagedTeam`
//     appelé SANS tenantId (→ DEFAULT_TENANT_ID), et requêtes membership /
//     members NON scopées tenant (bug S5c). Membres plus riches
//     (`battle_tag_verified_at`, `captain`, `is_captain`).
//
// Ce helper fusionne les deux comportements dans un surensemble canonique,
// scopé tenant, réutilisable par les deux routes sans changer leur payload
// public.
//
// -------------------------------------------------------------------------
// Règle canonique isCaptain / isManager
// -------------------------------------------------------------------------
// On dérive isCaptain ET isManager via `getManagedTeam(userId, tenantId)` +
// match `teamId`, PAS via une comparaison inline `team.captain_id === userId`.
// Raisons :
//   1. C'est déjà la logique multi-tenant du dashboard (source A), la plus
//      correcte : `getManagedTeam` scope ses deux queries au tenant.
//   2. `getManagedTeam` centralise aussi la notion de « manager » (rôle
//      team_members privilégié), qu'une simple comparaison captain_id ne
//      couvre pas.
//   3. En interne, `getManagedTeam` détermine isCaptain via
//      `teams.captain_id === userId` (query `.eq('captain_id', userId)`), donc
//      le résultat reste cohérent avec la comparaison directe de la source B,
//      tout en étant borné au tenant et à l'équipe effectivement gérée.
// `team.captain_id` reste exposé dans la tranche (utile aux consommateurs /
// à la dérivation `captain`/`is_captain` par membre) mais ne pilote PAS le
// flag isCaptain de premier niveau.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  getManagedTeams,
  type TeamManagementAccess,
} from '@/utils/teams/managementAccess';
import {
  resolveMissingDisplayNames,
  withFallbackDisplayName,
} from '@/utils/teams/memberDisplayName';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';

/** Team détaillée, surensemble des deux sources (inclut captain_id + open_for_scrim). */
export type ManagedTeamRow = {
  id: string;
  slug: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  description: string | null;
  captain_id: string | null;
  is_joinable: boolean;
  open_for_scrim: boolean;
  /**
   * SR d'ensemble DÉCLARÉ par la capitaine ou une manager. Court-circuite la
   * moyenne des fiches à l'affichage — cf. `resolveTeamSkillRating`.
   */
  skill_rating: number | null;
};

/** Membre enrichi : identité roster + statut vérif battle_tag + dérivation capitaine. */
export type ManagedTeamMemberRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  /**
   * Pseudo affichable : colonne roster, à défaut nom du compte. Sans lui, les
   * écrans retombaient sur l'UUID (cockpit staff) ou sur « Inconnu » (espace
   * capitaine) — visible surtout pour l'encadrement, qui n'a pas de BattleTag.
   */
  display_name: string | null;
  battle_tag: string | null;
  battle_tag_verified_at: string | null;
  specialty: string | null;
  /**
   * Niveau Overwatch DÉCLARÉ par l'équipe (SR 0-5000), `null` quand personne
   * ne l'a renseigné. Sans rapport avec `player_ratings`, qui est calculé par
   * le site — cf. utils/overwatchRank.ts.
   */
  skill_rating: number | null;
  is_substitute: boolean;
  /** `captain` et `is_captain` sont deux alias du même flag (= team.captain_id === user_id). */
  captain: boolean;
  is_captain: boolean;
  /**
   * Compte Discord lié (table globale `user_discord_links`).
   *
   * `null` = « non communiqué », PAS « non lié » : l'état de liaison d'un
   * tiers n'est renseigné que pour un appelant qui GÈRE l'équipe. Une
   * coéquipière ordinaire lit `null` sur toutes les lignes et ne peut donc
   * rien déduire des comptes des autres.
   *
   * Pourquoi l'exposer du tout : sans compte Discord lié, le bot ne peut ni
   * donner ses rôles à la personne, ni l'ajouter aux salons de l'équipe, ni
   * la convoquer — elle n'est pas validable. Le capitaine découvrait ce trou
   * en comptage agrégé (« santé d'équipe ») sans jamais savoir QUI.
   */
  discord_linked: boolean | null;
  /**
   * Présence CONSTATÉE sur le serveur Discord du tenant, rapportée par le bot
   * (POST /api/bot/v1/role-sync/presence). Distinct de `discord_linked` : lier
   * son compte puis quitter le serveur est un état atteignable, et le site
   * déclarait alors la personne en règle.
   *
   * `null` = on ne sait pas — compte non lié, bot qui n'a pas encore rapporté,
   * ou appelant qui ne gère pas l'équipe. Jamais « absent » : on n'accuse
   * personne sur la foi d'un silence.
   */
  discord_in_guild: boolean | null;
  /**
   * Date du constat de présence ci-dessus (ISO), telle que rapportée par le
   * bot. `null` quand il n'y a pas de constat.
   *
   * Exposée parce que ce constat est PÉRIMABLE : le bot ne repasse que toutes
   * les 30 min, donc quelqu'un qui vient de rejoindre le Discord reste affiché
   * « a quitté le serveur » jusqu'au cycle suivant. Sans date, le badge se lit
   * comme une vérité du moment et la capitaine va réinviter quelqu'un qui est
   * déjà là.
   */
  discord_checked_at: string | null;
};

/**
 * Entrée du sélecteur d'équipe : le strict nécessaire pour afficher un onglet
 * ou une ligne de menu. Depuis 2026-08-20 un `manager` peut encadrer plusieurs
 * équipes — l'écran doit donc pouvoir les lister et en choisir une, puis la
 * repasser au serveur via `?teamId=` (cf. utils/teamScopeParam.ts).
 */
export type ManagedTeamSummary = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  slug: string | null;
  isCaptain: boolean;
  isManager: boolean;
};

export type ManagedTeamSlice = {
  team: ManagedTeamRow | null;
  members: ManagedTeamMemberRow[];
  teamId: string | null;
  isCaptain: boolean;
  isManager: boolean;
  /**
   * Toutes les équipes que l'utilisateur GÈRE, `team` comprise. Vide pour une
   * joueuse sans droits de gestion — l'écran n'affiche alors aucun sélecteur.
   */
  managedTeams: ManagedTeamSummary[];
};

const EMPTY_SLICE: ManagedTeamSlice = {
  team: null,
  members: [],
  teamId: null,
  isCaptain: false,
  isManager: false,
  managedTeams: [],
};

/**
 * Résumés des équipes gérées, dans l'ordre de `getManagedTeams` (capitainerie
 * d'abord). Une seule lecture `teams` pour tout le lot.
 */
async function loadManagedTeamSummaries(
  accesses: { teamId: string; isCaptain: boolean; isManager: boolean }[]
): Promise<ManagedTeamSummary[]> {
  if (!supabaseAdmin || accesses.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name, short_name, logo_url, slug')
    .in(
      'id',
      accesses.map((a) => a.teamId)
    );
  if (error) {
    logger.error('[managedTeamSlice] managed teams error:', error);
    return [];
  }
  const rows = new Map<string, Record<string, unknown>>();
  for (const row of (data || []) as Record<string, unknown>[]) {
    rows.set(row.id as string, row);
  }
  // On repart de `accesses` et pas de `data` : l'ordre de la liste est celui
  // des accès (stable, capitainerie d'abord), pas celui que PostgREST renvoie.
  return accesses.flatMap((a) => {
    const row = rows.get(a.teamId);
    if (!row) return [];
    return [
      {
        id: a.teamId,
        name: (row.name as string) ?? '',
        short_name: (row.short_name as string | null) ?? null,
        logo_url: (row.logo_url as string | null) ?? null,
        slug: (row.slug as string | null) ?? null,
        isCaptain: a.isCaptain,
        isManager: a.isManager,
      },
    ];
  });
}

/** Ce que le site sait de la « joignabilité Discord » d'un compte. */
type DiscordStatus = {
  linked: boolean;
  inGuild: boolean | null;
  /** Date du constat `inGuild` (ISO), `null` si jamais rapporté. */
  checkedAt: string | null;
};

/**
 * État Discord du roster : compte lié, et présence constatée sur le serveur.
 *
 * DEUX questions distinctes, et c'est le cœur du sujet :
 *
 *   - LIÉ (`user_discord_links`, table GLOBALE — un compte Discord se lie une
 *     fois, tous tenants confondus) : le site sait à quel compte Discord
 *     écrire.
 *   - PRÉSENT (`discord_guild_presence`, par tenant) : la personne est encore
 *     sur le serveur. Lier puis quitter le Discord est un état parfaitement
 *     atteignable, et le site la déclarait alors en règle alors que le bot ne
 *     pouvait plus rien pour elle.
 *
 * `inGuild` vaut `null` quand on ne sait pas — compte non lié, ou bot qui n'a
 * pas encore rapporté (POST /api/bot/v1/role-sync/presence). Ne JAMAIS lire ce
 * `null` comme « absent » : on accuserait quelqu'un sur la foi d'un silence.
 *
 * En cas d'erreur DB, on dégrade en « on ne sait pas » plutôt que de faire
 * échouer la tranche : un roster qui ne charge plus casse la page entière.
 */
async function loadDiscordStatus(
  userIds: string[],
  tenantId: string
): Promise<Map<string, DiscordStatus>> {
  const status = new Map<string, DiscordStatus>();
  if (!supabaseAdmin || userIds.length === 0) return status;

  // Helper canonique et PAS une query en ligne : la colonne s'appelle
  // `auth_user_id`, et sept call sites l'avaient écrite `user_id` — une
  // colonne qui n'existe pas, donc une erreur PostgREST avalée, donc
  // « personne n'a lié son Discord » partout (corrigé le 2026-08-20, cf.
  // tests/unit/discordLinksColumnGuard.test.ts).
  const links = await getDiscordLinksForUsers(userIds);
  if (links.size === 0) return status;

  const discordIds = [...links.values()].map((l) => l.discordUserId);
  const presenceByDiscordId = new Map<
    string,
    { inGuild: boolean; checkedAt: string | null }
  >();
  const { data, error } = await supabaseAdmin
    .from('discord_guild_presence')
    .select('discord_user_id, in_guild, checked_at')
    .eq('tenant_id', tenantId)
    .in('discord_user_id', discordIds);
  if (error) {
    logger.error('[managedTeamSlice] guild presence error:', error);
  } else {
    for (const row of (data || []) as {
      discord_user_id?: string | null;
      in_guild?: boolean | null;
      checked_at?: string | null;
    }[]) {
      if (row?.discord_user_id && typeof row.in_guild === 'boolean') {
        presenceByDiscordId.set(row.discord_user_id, {
          inGuild: row.in_guild,
          checkedAt: row.checked_at ?? null,
        });
      }
    }
  }

  for (const [authUserId, link] of links) {
    const presence = presenceByDiscordId.get(link.discordUserId);
    status.set(authUserId, {
      linked: true,
      inGuild: presence?.inGuild ?? null,
      checkedAt: presence?.checkedAt ?? null,
    });
  }
  return status;
}

/**
 * Charge la tranche équipe canonique de `userId` pour `tenantId`.
 *
 * `options.teamId` désigne l'équipe voulue quand l'utilisateur en gère
 * plusieurs (un `manager` le peut depuis 2026-08-20). Elle n'est retenue que
 * s'il y a effectivement droit — sinon on retombe sur la première équipe
 * gérée, jamais sur celle demandée : cette fonction est lue par des routes qui
 * en déduisent `isCaptain` / `isManager`.
 *
 * Dégradation gracieuse : ne throw JAMAIS. Renvoie une tranche vide
 * (`EMPTY_SLICE`) si l'utilisateur n'a pas d'équipe, si `supabaseAdmin` est
 * indisponible, ou en cas d'erreur DB — exactement comme le faisaient les
 * loaders per-section du dashboard.
 *
 * Toutes les queries sont scopées `tenant_id`.
 */
export async function loadManagedTeamSlice(
  userId: string,
  tenantId: string,
  options: { teamId?: string | null } = {}
): Promise<ManagedTeamSlice> {
  if (!userId) return EMPTY_SLICE;
  if (!supabaseAdmin) {
    logger.error('[managedTeamSlice] supabaseAdmin unavailable');
    return EMPTY_SLICE;
  }

  try {
    const accesses: TeamManagementAccess[] = await getManagedTeams(
      userId,
      tenantId
    ).catch((err) => {
      logger.error('[managedTeamSlice] getManagedTeams error:', err);
      return [];
    });

    const requested = options.teamId || null;
    const requestedAccess = requested
      ? accesses.find((a) => a.teamId === requested)
      : undefined;

    // Équipe retenue : celle demandée si elle est gérée, sinon la première
    // gérée, sinon — pour une joueuse sans droits — sa seule appartenance.
    let teamId: string | null =
      requestedAccess?.teamId ?? accesses[0]?.teamId ?? null;

    if (!teamId) {
      const { data: membership, error: membershipErr } = await supabaseAdmin
        .from('team_members')
        .select('team_id')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();

      if (membershipErr)
        logger.error('[managedTeamSlice] membership error:', membershipErr);

      teamId =
        ((membership as Record<string, unknown> | null)?.team_id as
          | string
          | undefined) ?? null;
    }

    if (!teamId) return EMPTY_SLICE;

    // `team` (détail), `members` (roster) et les résumés du sélecteur ne
    // dépendent que d'états déjà résolus : on les récupère concurremment
    // plutôt qu'en cascade.
    const summariesPromise = loadManagedTeamSummaries(accesses);
    const [teamRes, membersRes] = await Promise.all([
      supabaseAdmin
        .from('teams')
        .select(
          'id, slug, name, short_name, logo_url, country, description, captain_id, is_joinable, open_for_scrim, skill_rating'
        )
        .eq('id', teamId)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from('team_members')
        .select(
          'id, user_id, role, display_name, battle_tag, battle_tag_verified_at, specialty, skill_rating, is_substitute'
        )
        .eq('team_id', teamId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
    ]);

    const access = accesses.find((a) => a.teamId === teamId) ?? null;
    const isCaptain = !!access?.isCaptain;
    const isManager = !!access?.isManager;
    const managedTeams = await summariesPromise;

    const { data: teamRowRaw, error: teamErr } = teamRes;
    if (teamErr || !teamRowRaw) {
      if (teamErr) logger.error('[managedTeamSlice] team error:', teamErr);
      return {
        team: null,
        members: [],
        teamId,
        isCaptain,
        isManager,
        managedTeams,
      };
    }

    const teamRaw = teamRowRaw as Record<string, unknown>;
    const captainId = (teamRaw.captain_id as string | null) ?? null;

    const team: ManagedTeamRow = {
      id: teamRaw.id as string,
      slug: (teamRaw.slug as string | null) ?? null,
      name: teamRaw.name as string,
      short_name: (teamRaw.short_name as string | null) ?? null,
      logo_url: (teamRaw.logo_url as string | null) ?? null,
      country: (teamRaw.country as string | null) ?? null,
      description: (teamRaw.description as string | null) ?? null,
      captain_id: captainId,
      is_joinable: (teamRaw.is_joinable as boolean | undefined) ?? false,
      open_for_scrim: (teamRaw.open_for_scrim as boolean | undefined) ?? false,
      skill_rating:
        typeof teamRaw.skill_rating === 'number' ? teamRaw.skill_rating : null,
    };

    const { data: membersRaw, error: membersErr } = membersRes;
    if (membersErr) {
      logger.error('[managedTeamSlice] members error:', membersErr);
      return { team, members: [], teamId, isCaptain, isManager, managedTeams };
    }

    const memberRows = (membersRaw || []) as Record<string, unknown>[];

    // Repli de pseudo pour les lignes sans `display_name` en roster (typique de
    // l'encadrement, ajouté sans BattleTag).
    const memberNames = await resolveMissingDisplayNames(
      memberRows as { user_id?: string | null; display_name?: string | null }[]
    );

    // Liaisons Discord du roster — lues SEULEMENT pour un appelant qui gère
    // l'équipe (cf. `discord_linked`). Pour les autres, on n'interroge même
    // pas la table : la donnée ne sortirait pas de toute façon.
    const managesThisTeam = isCaptain || isManager;
    const discordStatus = managesThisTeam
      ? await loadDiscordStatus(
          memberRows
            .map((m) => (m.user_id as string | null) ?? null)
            .filter((id): id is string => !!id),
          tenantId
        )
      : new Map<string, DiscordStatus>();

    const members: ManagedTeamMemberRow[] = memberRows.map((m) => {
      const memberUserId = (m.user_id as string | null) ?? null;
      const isMemberCaptain = captainId != null && captainId === memberUserId;
      return {
        id: m.id as string,
        user_id: memberUserId,
        role: (m.role as string | null) ?? null,
        display_name: withFallbackDisplayName(
          m as { user_id?: string | null; display_name?: string | null },
          memberNames
        ),
        battle_tag: (m.battle_tag as string | null) ?? null,
        battle_tag_verified_at:
          (m.battle_tag_verified_at as string | null) ?? null,
        specialty: (m.specialty as string | null) ?? null,
        skill_rating:
          typeof m.skill_rating === 'number' ? m.skill_rating : null,
        is_substitute: Boolean(m.is_substitute),
        captain: isMemberCaptain,
        is_captain: isMemberCaptain,
        discord_linked: managesThisTeam
          ? !!memberUserId && discordStatus.has(memberUserId)
          : null,
        discord_in_guild:
          managesThisTeam && memberUserId
            ? (discordStatus.get(memberUserId)?.inGuild ?? null)
            : null,
        discord_checked_at:
          managesThisTeam && memberUserId
            ? (discordStatus.get(memberUserId)?.checkedAt ?? null)
            : null,
      };
    });

    return { team, members, teamId, isCaptain, isManager, managedTeams };
  } catch (err) {
    logger.error('[managedTeamSlice] unexpected error:', err);
    return EMPTY_SLICE;
  }
}
