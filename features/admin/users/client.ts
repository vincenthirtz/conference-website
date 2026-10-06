// features/admin/users/client.ts — appels typés des écrans comptes (lot L10) :
// gestion des inscrits, création, vues joueuse / staff / capitaine,
// permissions staff. Les URLs de l'API vivent ICI, plus dans les pages.
//
// La création de compte reste sur `useIdempotentMutation` (file hors ligne) :
// ce module n'en fournit que le chemin (`usersPaths.create`). La liste des
// inscrits reste sur `useAdminResource` (UI optimiste par `mutate`) : son URL
// vient d'ici (`usersPaths.manage`).

import { adminRequest } from '@/utils/admin/adminHttp';
import type { AccountLog } from './manageModel';
import type { getStaffPermissions } from './service/permissions';
import type { AdminUserProfilePayload } from '@/pages/api/admin/users/[userId]/profile';

const USERS = '/api/admin/users';
const MANAGE = `${USERS}/manage`;
const enc = encodeURIComponent;

export type StaffPermissionsPayload = Awaited<
  ReturnType<typeof getStaffPermissions>
>;

/** Fiche staff (GET /api/admin/users/[userId]/staff). */
export type StaffRecordPayload<TStaff, TSpace> = {
  staff: TStaff;
  spaces: TSpace[];
};

/** Entrée de journal staff, forme courte (vue staff). */
export type StaffLogRow = {
  id: string;
  action: string;
  entity_type: string | null;
  created_at: string;
};

export type ResendCredentialsResponse = {
  success?: boolean;
  warning?: string;
};

export type BattleTagPatchResponse = {
  membership?: {
    battle_tag: string | null;
    battle_tag_verified_at: string | null;
    battle_tag_mismatch: boolean;
  };
};

export const usersPaths = {
  create: USERS,
  manage: MANAGE,
  byId: (id: string) => `${USERS}/${enc(id)}`,
  profile: (id: string) => `${USERS}/${enc(id)}/profile`,
  staff: (id: string) => `${USERS}/${enc(id)}/staff`,
  permissions: (id: string) => `${USERS}/${enc(id)}/permissions`,
  actions: (id: string) => `${USERS}/${enc(id)}/actions`,
  export: `${USERS}/export`,
} as const;

/** Filtres de la liste, tels que l'export CSV serveur les attend. */
export type UsersExportParams = {
  search?: string | null;
  role?: string | null;
  filters?: readonly string[];
  sort?: string | null;
  dir?: string | null;
};

/**
 * URL de l'export CSV (GET /api/admin/users/export) : les MÊMES paramètres que
 * la liste, sans pagination. Un filtre vide est omis.
 */
export function buildUsersExportUrl(p: UsersExportParams): string {
  const qs = new URLSearchParams();
  if (p.search) qs.set('search', p.search);
  if (p.role) qs.set('role', p.role);
  if (p.filters?.length) qs.set('filters', p.filters.join(','));
  if (p.sort) qs.set('sort', p.sort);
  if (p.dir) qs.set('dir', p.dir);
  const s = qs.toString();
  return s ? `${usersPaths.export}?${s}` : usersPaths.export;
}

export const usersClient = {
  /** PATCH /manage : rôle, nom, BattleTag, suspension, renvoi d'identifiants… */
  patch: <T = unknown>(body: Record<string, unknown>) =>
    adminRequest<T>(MANAGE, { method: 'PATCH', json: body }),
  remove: (userId: string) =>
    adminRequest(MANAGE, { method: 'DELETE', json: { userId } }),
  resendCredentials: (userId: string) =>
    adminRequest<ResendCredentialsResponse>(MANAGE, {
      method: 'PATCH',
      json: { userId, action: 'resend_credentials' },
    }),

  profile: (userId: string) =>
    adminRequest<AdminUserProfilePayload>(usersPaths.profile(userId)),
  staff: <TStaff, TSpace>(userId: string) =>
    adminRequest<StaffRecordPayload<TStaff, TSpace>>(usersPaths.staff(userId)),
  permissions: (userId: string) =>
    adminRequest<StaffPermissionsPayload>(usersPaths.permissions(userId)),
  savePermissions: (userId: string, extraPermissions: string[]) =>
    adminRequest(usersPaths.permissions(userId), {
      method: 'PUT',
      json: { extraPermissions },
    }),
  /** Actions joueuse : assign_captain, transfer_team… */
  action: (userId: string, body: Record<string, unknown>) =>
    adminRequest(usersPaths.actions(userId), { method: 'POST', json: body }),

  /** Journal d'un compte (cible des actions). */
  accountLogs: (userId: string, limit: number) =>
    adminRequest<{ logs?: AccountLog[] }>(
      `/api/admin/logs?userId=${enc(userId)}&limit=${limit}`
    ),
  /** Journal d'un membre du staff (auteur des actions). */
  staffLogs: (staffId: string, limit: number) =>
    adminRequest<{ logs?: StaffLogRow[] }>(
      `/api/admin/logs?staffId=${enc(staffId)}&limit=${limit}`
    ),
};
