// features/admin/users/hooks/useUsersQueries.ts — lectures des écrans comptes
// sur le cache partagé de l'admin (lot L10).
//
// La fiche staff et la modale de permissions lisent la même clé : enregistrer
// des permissions dans la modale met la fiche à jour sans rechargement.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { usersClient } from '../client';

export const usersKeys = {
  all: adminKey('users'),
  profile: (id: string) => [...usersKeys.all, 'profile', id] as const,
  staff: (id: string) => [...usersKeys.all, 'staff', id] as const,
  permissions: (id: string) => [...usersKeys.all, 'permissions', id] as const,
  accountLogs: (id: string, limit: number) =>
    [...usersKeys.all, 'account-logs', id, limit] as const,
  staffLogs: (staffId: string, limit: number) =>
    [...usersKeys.all, 'staff-logs', staffId, limit] as const,
};

/** Identité d'une cible (vues joueuse / capitaine). */
export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: usersKeys.profile(userId ?? ''),
    queryFn: () => usersClient.profile(userId as string),
    enabled: !!userId,
  });
}

/** Fiche staff : compte + espaces. */
export function useStaffRecord<TStaff, TSpace>(userId: string | undefined) {
  return useQuery({
    queryKey: usersKeys.staff(userId ?? ''),
    queryFn: () => usersClient.staff<TStaff, TSpace>(userId as string),
    enabled: !!userId,
  });
}

/**
 * Permissions d'un membre du staff. `editor` : la modale coche une copie
 * locale, pas de relecture automatique qui l'écraserait.
 */
export function useStaffPermissions(
  userId: string | undefined,
  opts: { editor?: boolean; enabled?: boolean } = {}
) {
  const { editor = false, enabled = true } = opts;
  return useQuery({
    queryKey: usersKeys.permissions(userId ?? ''),
    queryFn: () => usersClient.permissions(userId as string),
    enabled: enabled && !!userId,
    ...(editor ? EDITOR_QUERY_OPTIONS : {}),
  });
}

/** Journal d'un compte (modale « historique » de la gestion des inscrits). */
export function useAccountLogs(userId: string | null, limit: number) {
  return useQuery({
    queryKey: usersKeys.accountLogs(userId ?? '', limit),
    queryFn: () => usersClient.accountLogs(userId as string, limit),
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

/** Journal des actions d'un membre du staff. */
export function useStaffLogs(staffId: string | undefined, limit: number) {
  return useQuery({
    queryKey: usersKeys.staffLogs(staffId ?? '', limit),
    queryFn: () => usersClient.staffLogs(staffId as string, limit),
    enabled: !!staffId,
  });
}

/** Relit tout ce qui décrit un compte (profil, fiche staff, permissions). */
export function useInvalidateUser() {
  const qc = useQueryClient();
  return useCallback(
    (userId: string) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: usersKeys.profile(userId) }),
        qc.invalidateQueries({ queryKey: usersKeys.staff(userId) }),
        qc.invalidateQueries({ queryKey: usersKeys.permissions(userId) }),
      ]).then(() => undefined),
    [qc]
  );
}
