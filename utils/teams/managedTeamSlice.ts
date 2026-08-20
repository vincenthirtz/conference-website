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

/**
 * Quels `user_id` du roster ont un compte Discord lié.
 *
 * `user_discord_links` est GLOBALE (pas de `tenant_id`) : un compte Discord se
 * lie une fois, pour tous les tenants. Une seule lecture pour tout le roster.
 *
 * En cas d'erreur on renvoie un ensemble VIDE plutôt que de faire échouer la
 * tranche : l'écran affichera « non lié » à tort, ce qui pousse à une action
 * inutile mais inoffensive — alors qu'un roster qui ne charge plus casse la
 * page entière.
 */
async function loadDiscordLinkedUserIds(
  userIds: string[]
): Promise<Set<string>> {
  const linked = new Set<string>();
  if (!supabaseAdmin || userIds.length === 0) return linked;
  const { data, error } = await supabaseAdmin
    .from('user_discord_links')
    .select('user_id')
    .in('user_id', userIds);
  if (error) {
    logger.error('[managedTeamSlice] discord links error:', error);
    return linked;
  }
  for (const row of (data || []) as { user_id?: string | null }[]) {
    if (row?.user_id) linked.add(row.user_id);
  }
  return linked;
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
          'id, slug, name, short_name, logo_url, country, description, captain_id, is_joinable, open_for_scrim'
        )
        .eq('id', teamId)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from('team_members')
        .select(
          'id, user_id, role, display_name, battle_tag, battle_tag_verified_at, specialty, is_substitute'
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
    const discordLinkedIds = managesThisTeam
      ? await loadDiscordLinkedUserIds(
          memberRows
            .map((m) => (m.user_id as string | null) ?? null)
            .filter((id): id is string => !!id)
        )
      : new Set<string>();

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
        is_substitute: Boolean(m.is_substitute),
        captain: isMemberCaptain,
        is_captain: isMemberCaptain,
        discord_linked: managesThisTeam
          ? !!memberUserId && discordLinkedIds.has(memberUserId)
          : null,
      };
    });

    return { team, members, teamId, isCaptain, isManager, managedTeams };
  } catch (err) {
    logger.error('[managedTeamSlice] unexpected error:', err);
    return EMPTY_SLICE;
  }
}
