// utils/teams/canCheckIn.ts
//
// « Cette personne peut-elle faire le check-in de CETTE équipe ? » — LA règle,
// écrite une seule fois. Décision de la responsable du 2026-09-17 : pointer
// engage l'équipe entière (sans check-in au coup d'envoi, c'est un forfait
// automatique), ce n'est donc plus un geste ouvert à tout le roster. Peuvent
// pointer :
//   - la capitaine (`teams.captain_id`) ;
//   - une membre dont le rôle d'équipe est `coach` ou `manager`.
//
// Pourquoi coach/manager et pas « qui gère l'équipe » (`getManagedTeams`) :
// cette dernière suit une configuration DYNAMIQUE (`site_settings.team_roles`)
// et des délégations par membre. Une délégation de « gérer les scrims » ne doit
// pas, par effet de bord, ouvrir le check-in. Et elle filtre le rôle en SQL
// (`.in('role', …)`), donc sensible à la casse : un rôle saisi `Manager` ou
// ` manager ` n'y apparaît pas. Ici on normalise en JS, comme `roleKind.ts`.
//
// Une équipe SANS capitaine (`captain_id` NULL, créée par une manager) doit
// rester pointable : c'est justement le cas que la règle « capitaine seule »
// aurait cassé, et la raison d'être du rôle `manager` ici.
//
// Le staff n'est PAS concerné : il pointe par les routes admin, qui ne passent
// pas par ce module.
//
// Consommateurs (tous doivent passer par ici, aucune règle recopiée) :
//   - pages/api/player/matches/[matchId].ts, next-match.ts, matches.ts,
//     dashboard.ts : n'exposent le jeton qu'aux autorisées + `canCheckIn` ;
//   - pages/api/bot/v1/matches/[matchId]/checkin.ts : refuse (403) ;
//   - pages/api/bot/v1/players/by-discord/[discordUserId]/next-match.ts.
//
// Ce que ce module NE couvre PAS : le lien porteur `/checkin/<jeton>`
// (`redeemCheckinToken`). Qui détient le jeton pointe — voulu, c'est le lien du
// mail à la capitaine. La règle ne vaut donc que tant que le jeton ne circule
// pas au-delà des autorisées (cf. `applyCheckinPermission`).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/**
 * Rôles d'équipe autorisés à pointer, en plus de la capitaine. Liste PROPRE au
 * check-in, volontairement distincte de `NON_PLAYING_TEAM_ROLES` : elles
 * coïncident aujourd'hui, mais ajouter un rôle d'encadrement (« analyste »)
 * ne doit pas lui donner, en silence, le droit d'engager l'équipe.
 */
export const CHECKIN_TEAM_ROLES = ['coach', 'manager'] as const;

/** Casse et espaces ignorés : les rôles ont été saisis à la main par endroits. */
export function isCheckinTeamRole(role: string | null | undefined): boolean {
  if (typeof role !== 'string') return false;
  const normalized = role.trim().toLowerCase();
  return (CHECKIN_TEAM_ROLES as readonly string[]).includes(normalized);
}

export type CheckinAuthority = 'captain' | 'team_role';

/**
 * La règle, pure. `roles` = les rôles de `userId` DANS l'équipe considérée
 * (plusieurs lignes possibles : on n'en suppose pas l'unicité).
 *
 * Un `userId` vide n'autorise jamais rien : sans cette garde, une équipe sans
 * capitaine (`captainId` null) et un appelant anonyme (`userId` null)
 * « correspondraient ».
 */
export function checkinAuthority(input: {
  userId: string | null | undefined;
  captainId: string | null | undefined;
  roles: readonly (string | null | undefined)[];
}): CheckinAuthority | null {
  if (!input.userId) return null;
  if (input.captainId && input.captainId === input.userId) return 'captain';
  if (input.roles.some(isCheckinTeamRole)) return 'team_role';
  return null;
}

export function canCheckIn(input: {
  userId: string | null | undefined;
  captainId: string | null | undefined;
  roles: readonly (string | null | undefined)[];
}): boolean {
  return checkinAuthority(input) !== null;
}

export type CheckinPermission = {
  /** Autorisée d'après ce qui a pu être lu. */
  allowed: boolean;
  authority: CheckinAuthority | null;
  /**
   * Une lecture a échoué ET rien de ce qui a été lu n'autorise. L'appelant
   * choisit : une route de LECTURE retombe sur l'ancien comportement (ouvert),
   * parce qu'une erreur transitoire ne doit pas cacher son bouton à une
   * capitaine un soir de match ; une route d'ÉCRITURE répond 500 (réessayable).
   */
  failed: boolean;
};

/**
 * Charge ce qu'il faut pour trancher, pour UNE équipe : `teams.captain_id` et
 * les rôles de l'utilisatrice dans `team_members`. Deux lectures parallèles,
 * scopées au tenant. Ne lève jamais.
 */
export async function loadCheckinPermission(
  userId: string | null | undefined,
  tenantId: string,
  teamId: string | null | undefined
): Promise<CheckinPermission> {
  if (!userId || !teamId) {
    return { allowed: false, authority: null, failed: false };
  }
  if (!supabaseAdmin) {
    return { allowed: false, authority: null, failed: true };
  }

  let failed = false;
  let captainId: string | null = null;
  let roles: (string | null)[] = [];

  try {
    const [teamRes, membersRes] = await Promise.all([
      supabaseAdmin
        .from('teams')
        .select('captain_id')
        .eq('tenant_id', tenantId)
        .eq('id', teamId)
        .maybeSingle(),
      supabaseAdmin
        .from('team_members')
        .select('role')
        .eq('tenant_id', tenantId)
        .eq('team_id', teamId)
        .eq('user_id', userId),
    ]);

    if (teamRes.error) {
      failed = true;
      logger.error('[canCheckIn] team lookup error', teamRes.error);
    } else {
      captainId =
        (teamRes.data as { captain_id?: string | null } | null)?.captain_id ??
        null;
    }

    if (membersRes.error) {
      failed = true;
      logger.error('[canCheckIn] members lookup error', membersRes.error);
    } else {
      roles = ((membersRes.data ?? []) as { role?: string | null }[]).map(
        (r) => r.role ?? null
      );
    }
  } catch (err) {
    failed = true;
    logger.error('[canCheckIn] lookup exception', err);
  }

  const authority = checkinAuthority({ userId, captainId, roles });
  // Une autorisation LUE l'emporte sur l'échec de l'autre lecture : la
  // capitaine reste capitaine même si la lecture des rôles a échoué.
  return {
    allowed: authority !== null,
    authority,
    failed: authority === null && failed,
  };
}

/**
 * Décision d'EXPOSITION pour une route de lecture joueuse : ouvert si autorisée,
 * ou si la vérification n'a pas pu se faire (repli sur le comportement d'avant
 * la règle, journalisé par `loadCheckinPermission`). Voir `failed`.
 */
export function exposesCheckin(permission: CheckinPermission): boolean {
  return permission.allowed || permission.failed;
}

/**
 * Applique la règle à un bloc check-in de réponse : le jeton ne sort que pour
 * une autorisée, et `canCheckIn` dit à l'écran quoi afficher. Tout le reste
 * (`isOpen`, `alreadyCheckedIn`, …) est conservé : chaque membre doit voir si
 * son équipe a pointé.
 */
export function applyCheckinPermission<T extends { token: string | null }>(
  checkin: T,
  allowed: boolean
): T & { canCheckIn: boolean } {
  return {
    ...checkin,
    token: allowed ? checkin.token : null,
    canCheckIn: allowed,
  };
}
