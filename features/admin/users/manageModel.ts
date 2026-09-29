// features/admin/users/manageModel.ts — les types, constantes et règles pures
// de la gestion des inscrits (pages/admin/users/manage.tsx), sortis TELS QUELS
// de la page (règle A7 : elle est gelée en taille) pour être partagés avec ses
// blocs d'affichage (features/admin/users/ui/UsersManage*.tsx) et son hook
// d'actions en lot (features/admin/users/hooks/useUsersManageBulk.ts).
//
// Aucune requête ici : des types, et des fonctions qui lisent un compte.

import {
  STAFF_ROLES,
  STAFF_ROLE_RANK,
  type StaffRole,
} from '@/utils/staffRoles';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import type nsAdminUsersManage from '@/lib/i18n/locales/admin-fr/adminUsersManage';

export type Dict = typeof nsAdminUsersManage.fr;
export type StaffShape = {
  id: string;
  /** Compte auth de l'appelant — sert à repérer « ma » ligne (cf. isSelf). */
  auth_user_id: string;
  role: string;
  display_name: string | null;
};

export type TeamMembership = {
  team_id: string;
  team_name: string;
  role: string;
  battle_tag: string | null;
  battle_tag_verified_at?: string | null;
  battle_tag_mismatch?: boolean;
};

export type UserLite = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  /** auth.users.banned_until — date future = connexion refusée. */
  banned_until?: string | null;
  discord_username?: string | null;
  discord_user_id?: string | null;
  team_memberships?: TeamMembership[];
};

/** Durées proposées à la suspension — miroir de la table du handler. */
export const SUSPEND_DURATIONS = ['24h', '7d', '30d', 'permanent'] as const;
export type SuspendDuration = (typeof SUSPEND_DURATIONS)[number];

export type ApiResponse = {
  items: UserLite[];
  total?: number;
};

/** Entrée de staff_logs telle que formatée par /api/admin/logs. */
export type AccountLog = {
  id: string;
  created_at: string;
  action: string;
  readableAction: string;
  staff_display_name?: string | null;
  payload?: Record<string, unknown> | null;
};

export type SortField =
  | 'created_at'
  | 'display_name'
  | 'email'
  | 'role'
  | 'last_sign_in_at';
export type SortDir = 'asc' | 'desc';

/** Axes de tri exposés — miroir de la whitelist du handler GET. */
const SORT_FIELDS = [
  'created_at',
  'display_name',
  'email',
  'role',
  'last_sign_in_at',
] as const;

/**
 * État de la vue lu depuis la query string. La page est rendue côté serveur,
 * donc `router.query` est déjà peuplé au premier rendu client : on peut
 * initialiser les états directement, sans flash ni second fetch.
 *
 * Objectif : un écran filtré/trié/paginé est une URL — partageable dans un fil
 * de discussion, remise en place par le bouton « précédent » du navigateur.
 */
export function readViewState(
  query: Record<string, string | string[] | undefined>
) {
  const one = (v: string | string[] | undefined): string =>
    Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  const sort = one(query.sort);
  const filters = one(query.filters)
    .split(',')
    .map((f) => f.trim())
    .filter((f): f is QuickFilter =>
      (QUICK_FILTERS as readonly string[]).includes(f)
    );
  const offset = Number.parseInt(one(query.offset), 10);
  return {
    search: one(query.search),
    role: ROLES.includes(one(query.role)) ? one(query.role) : null,
    filters: Array.from(new Set(filters)),
    sortField: (SORT_FIELDS as readonly string[]).includes(sort)
      ? (sort as SortField)
      : 'created_at',
    sortDir:
      one(query.dir) === 'asc' ? ('asc' as SortDir) : ('desc' as SortDir),
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
  };
}

/* --------------------------------------------------------------------------
 * Deux dimensions de rôles, à ne surtout pas confondre (cf. l'API
 * pages/api/admin/users/manage.ts qui synchronise la table `staff`) :
 *
 *  1. Le rôle de COMPTE (`user_metadata.role`), édité par le <select> de la
 *     ligne. Il se scinde lui-même en deux familles :
 *       - rôles COMMUNAUTÉ (member / player) : aucun accès back-office ;
 *       - rôles STAFF (caster / admin / owner) : l'API crée/réactive la row
 *         `staff` correspondante (et la soft-delete en cas de rétrogradation).
 *  2. Le rôle d'ÉQUIPE (`team_members.role` : captain / player / coach /
 *     substitute / manager), propre à chaque appartenance. Il n'est PAS
 *     modifiable ici (cf. /admin/teams/[id]/edit), on l'affiche en lecture.
 * ------------------------------------------------------------------------ */

/**
 * Rôles de compte n'ouvrant aucun accès au back-office.
 *
 * DOIT rester en phase avec `SELF_SERVICE_ROLES` (pages/api/auth/register.ts) :
 * cette liste est le seul endroit d'où l'on attribue ou filtre le rôle d'un
 * compte EXISTANT. `manager` y manquait depuis son ouverture à l'inscription —
 * créable à l'inscription, ni attribuable ni filtrable ensuite, exactement le
 * défaut que décrit le commentaire de `STAFF_ROLE_OPTIONS` ci-dessous pour
 * `referee`/`helper`. Il est ajouté ici en même temps que `supporter`.
 */
export const COMMUNITY_ROLES = ['member', 'player', 'manager', 'supporter'];
/**
 * Rôles de compte qui provisionnent une entrée `staff`, du plus étroit au plus
 * large.
 *
 * DÉRIVÉ de `STAFF_ROLES` (utils/staff.ts) et non plus recopié à la main : la
 * liste figée `['caster', 'admin', 'owner']` a survécu à l'arrivée de `referee`
 * et `helper` (lot A2), et cet écran — le seul qui change le rôle d'un compte
 * EXISTANT, c'est-à-dire le cas courant quand on enrôle un renfort — ne les
 * proposait pas. Le rôle était créable à l'inscription, pas attribuable ensuite.
 */
export const STAFF_ROLE_OPTIONS: string[] = [...STAFF_ROLES].sort(
  (a, b) => STAFF_ROLE_RANK[a] - STAFF_ROLE_RANK[b]
);
/** Union à plat — utilisée pour le filtre et les gardes existantes. */
export const ROLES = [...COMMUNITY_ROLES, ...STAFF_ROLE_OPTIONS];

/**
 * Filtres rapides cumulables (AND), appliqués côté SQL par la RPC
 * `admin_list_users` (cf. database/migrations/add_admin_list_users_filters.sql).
 * L'ordre ci-dessous est celui d'affichage des puces.
 */
export const QUICK_FILTERS = [
  'battletag_mismatch',
  'suspended',
  'no_team',
  'no_discord',
  'never_signed_in',
  'inactive_6m',
  'staff',
  'community',
] as const;
export type QuickFilter = (typeof QUICK_FILTERS)[number];

export function quickFilterLabel(t: Dict, f: QuickFilter): string {
  switch (f) {
    case 'battletag_mismatch':
      return t.filterMismatch;
    case 'suspended':
      return t.filterSuspended;
    case 'no_team':
      return t.filterNoTeam;
    case 'no_discord':
      return t.filterNoDiscord;
    case 'never_signed_in':
      return t.filterNeverSignedIn;
    case 'inactive_6m':
      return t.filterInactive6m;
    case 'staff':
      return t.filterStaff;
    case 'community':
      return t.filterCommunity;
  }
}

/** Miroir EXACT de la validation serveur (pages/api/admin/users/manage.ts). */
export const BATTLE_TAG_RE = BATTLE_TAG_REGEX;

export function isStaffRoleValue(role: string | null): boolean {
  return STAFF_ROLE_OPTIONS.includes((role || '').toLowerCase());
}

/** Libellé d'un rôle d'ÉQUIPE (team_members.role) — dimension distincte du
 *  rôle de compte : un `manager` d'équipe n'est PAS un staff. */
export function teamRoleLabel(t: Dict, role: string | null) {
  switch (role?.toLowerCase()) {
    case 'captain':
      return t.teamRoleCaptain;
    case 'player':
      return t.teamRolePlayer;
    case 'coach':
      return t.teamRoleCoach;
    case 'substitute':
      return t.teamRoleSubstitute;
    case 'manager':
      return t.teamRoleManager;
    default:
      return role || t.teamRoleUnknown;
  }
}

/**
 * Miroir EXACT des gardes de pages/api/admin/users/manage.ts.
 * 1. targetIsProtected : un owner/admin ne peut être modifié que par un owner.
 * 2. anti-escalade : un non-owner ne peut octroyer un rôle staff de rang >= au
 *    sien. Les rôles non-staff (member, player, ...) passent toujours.
 */
export function isTargetProtected(targetRole: string | null): boolean {
  const r = targetRole?.toLowerCase();
  return r === 'owner' || r === 'admin';
}

export function canGrantRole(
  requesterRole: string | null,
  role: string
): boolean {
  if (requesterRole === 'owner') return true;
  const isStaffRole = (STAFF_ROLES as readonly string[]).includes(role);
  if (!isStaffRole) return true; // member/player : révocation toujours permise
  const newRank = STAFF_ROLE_RANK[role as StaffRole];
  const requesterRank = requesterRole
    ? (STAFF_ROLE_RANK[requesterRole as StaffRole] ?? -1)
    : -1;
  return newRank < requesterRank;
}

/** Vrai si l'appelant (non-owner) ne peut pas toucher cette cible protégée. */
export function isRowLocked(
  targetRole: string | null,
  staffRole: string
): boolean {
  return isTargetProtected(targetRole) && staffRole !== 'owner';
}

/** Sens par défaut au premier clic : récent d'abord pour les dates, A→Z pour
 *  le texte. Recliquer sur l'axe actif inverse le sens. */
export const DEFAULT_DIR: Record<SortField, SortDir> = {
  created_at: 'desc',
  last_sign_in_at: 'desc',
  display_name: 'asc',
  email: 'asc',
  role: 'asc',
};
