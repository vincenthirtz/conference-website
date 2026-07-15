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
import { getManagedTeam } from '@/utils/teams/managementAccess';

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
  battle_tag: string | null;
  battle_tag_verified_at: string | null;
  specialty: string | null;
  is_substitute: boolean;
  /** `captain` et `is_captain` sont deux alias du même flag (= team.captain_id === user_id). */
  captain: boolean;
  is_captain: boolean;
};

export type ManagedTeamSlice = {
  team: ManagedTeamRow | null;
  members: ManagedTeamMemberRow[];
  teamId: string | null;
  isCaptain: boolean;
  isManager: boolean;
};

const EMPTY_SLICE: ManagedTeamSlice = {
  team: null,
  members: [],
  teamId: null,
  isCaptain: false,
  isManager: false,
};

/**
 * Charge la tranche équipe canonique de `userId` pour `tenantId`.
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
  tenantId: string
): Promise<ManagedTeamSlice> {
  if (!userId) return EMPTY_SLICE;
  if (!supabaseAdmin) {
    logger.error('[managedTeamSlice] supabaseAdmin unavailable');
    return EMPTY_SLICE;
  }

  try {
    // `getManagedTeam` tourne en parallèle du reste de la chaîne (membership →
    // team+members), pour préserver le même profil de concurrence que le
    // dashboard historique (aucune régression de latence).
    const accessPromise = getManagedTeam(userId, tenantId);

    const { data: membership, error: membershipErr } = await supabaseAdmin
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    if (membershipErr || !membership) {
      if (membershipErr)
        logger.error('[managedTeamSlice] membership error:', membershipErr);
      // On attend quand même l'accès pour ne pas laisser de promise pendante,
      // mais sans équipe la tranche est vide.
      await accessPromise.catch(() => null);
      return EMPTY_SLICE;
    }

    const teamId = (membership as Record<string, unknown>).team_id as string;

    // `team` (détail) et `members` (roster) ne dépendent que de teamId : on les
    // récupère concurremment plutôt qu'en cascade.
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
          'id, user_id, role, battle_tag, battle_tag_verified_at, specialty, is_substitute'
        )
        .eq('team_id', teamId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
    ]);

    const access = await accessPromise.catch((err) => {
      logger.error('[managedTeamSlice] getManagedTeam error:', err);
      return null;
    });

    const isCaptain = !!(access?.isCaptain && access.teamId === teamId);
    const isManager = !!(access?.isManager && access.teamId === teamId);

    const { data: teamRowRaw, error: teamErr } = teamRes;
    if (teamErr || !teamRowRaw) {
      if (teamErr) logger.error('[managedTeamSlice] team error:', teamErr);
      return { team: null, members: [], teamId, isCaptain, isManager };
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
      return { team, members: [], teamId, isCaptain, isManager };
    }

    const members: ManagedTeamMemberRow[] = (
      (membersRaw || []) as Record<string, unknown>[]
    ).map((m) => {
      const memberUserId = (m.user_id as string | null) ?? null;
      const isMemberCaptain = captainId != null && captainId === memberUserId;
      return {
        id: m.id as string,
        user_id: memberUserId,
        role: (m.role as string | null) ?? null,
        battle_tag: (m.battle_tag as string | null) ?? null,
        battle_tag_verified_at:
          (m.battle_tag_verified_at as string | null) ?? null,
        specialty: (m.specialty as string | null) ?? null,
        is_substitute: Boolean(m.is_substitute),
        captain: isMemberCaptain,
        is_captain: isMemberCaptain,
      };
    });

    return { team, members, teamId, isCaptain, isManager };
  } catch (err) {
    logger.error('[managedTeamSlice] unexpected error:', err);
    return EMPTY_SLICE;
  }
}
