// features/admin/users/playerViewModel.ts — règles de rôle, onglets et types
// de la « Vue player » (pages/admin/users/[userId]/player-view.tsx), sortis
// TELS QUELS de la page (lot 9C, gel `adminFileSizeGuard`) pour être partagés
// avec ses blocs d'affichage (features/admin/users/ui/PlayerView*.tsx).
//
// Les règles de rôle reflètent manage.tsx pour que l'UI ne propose jamais un
// changement interdit (l'API applique les mêmes garde-fous).
//
// Aucune requête ici : des types et des fonctions pures.

import { STAFF_ROLE_RANK, type StaffRole } from '@/utils/staffRoles';
import type nsAdminUserPlayerView from '@/lib/i18n/locales/admin-fr/adminUserPlayerView';

export type Dict = typeof nsAdminUserPlayerView.fr;

export const ROLE_OPTIONS = ['member', 'player', 'caster', 'admin', 'owner'];

export function roleLabel(t: Dict, role: string | null): string {
  switch ((role || '').toLowerCase()) {
    case 'owner':
      return t.roleOwner;
    case 'admin':
      return t.roleAdmin;
    case 'manager':
      return t.roleManager;
    case 'caster':
      return t.roleCaster;
    case 'player':
      return t.rolePlayer;
    default:
      return t.roleMember;
  }
}

/** Un compte owner/admin ne se touche qu'en owner. */
export function isTargetProtected(targetRole: string | null): boolean {
  const r = (targetRole || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

/** Pas d'octroi d'un rôle supérieur ou égal au sien. */
export function canGrantRole(
  requesterRole: string | null,
  role: string
): boolean {
  const requesterRank = STAFF_ROLE_RANK[requesterRole as StaffRole] ?? 0;
  const targetRank = STAFF_ROLE_RANK[role as StaffRole] ?? 0;
  if (targetRank === 0) return true; // member / player : pas un rôle staff
  return requesterRank > targetRank || requesterRole === 'owner';
}

export type TabKey = 'profil' | 'espace' | 'matchs' | 'notifications';

export function getTabs(t: Dict): Array<{ key: TabKey; label: string }> {
  return [
    { key: 'profil', label: t.tabProfil },
    { key: 'espace', label: t.tabEspace },
    { key: 'matchs', label: t.tabMatchs },
    { key: 'notifications', label: t.tabNotifications },
  ];
}

/** Demande telle que renvoyée par GET /api/admin/demandes. */
export type PendingDemande = {
  id: string;
  type: string;
  status: string;
  created_at: string;
  comment?: string | null;
  team?: { id: string; name: string } | null;
};
