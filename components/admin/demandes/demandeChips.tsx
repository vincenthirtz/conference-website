// components/admin/demandes/demandeChips.tsx
//
// Libellés des pastilles de la liste des demandes : type, statut, et le format
// de date qui les accompagne. Les couleurs sont passées aux jetons « Le Ruban »
// (lot 7A) : tons de `Chip`, choisis par features/admin/demandes/ui.
//
// Extrait de `pages/admin/demandes/index.tsx` quand celle-ci a franchi le
// plafond de taille des écrans admin (cf. tests/unit/adminFileSizeGuard.test.ts).
// La coupe est naturelle : des fonctions PURES, sans état ni requête, dont
// le seul lien avec la page est le dictionnaire i18n qu'on leur passe.
//
// Elles tolèrent une valeur inconnue plutôt que de lever : `demandes.type` et
// `status` sont des colonnes texte, et une valeur posée par une migration
// future doit s'afficher telle quelle, pas casser la liste.

import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';

type Dict = typeof nsAdminDemandesList.fr;

export type DemandeType =
  | 'join'
  | 'leave'
  | 'captain_request'
  | 'team_registration'
  | 'scrim'
  | 'other';

export type DemandeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function typeLabel(type: DemandeType | string, t: Dict) {
  switch (type) {
    case 'join':
    case 'join_team':
      return t.chipJoin;
    case 'leave':
    case 'leave_team':
      return t.chipLeave;
    case 'captain_request':
      return t.chipCaptain;
    case 'team_registration':
      return t.chipTeamRegistration;
    case 'scrim':
      return t.chipScrim;
    case 'other':
      return t.chipOther;
    default:
      return String(type);
  }
}

export function statusLabel(status: DemandeStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'approved':
      return t.statusApproved;
    case 'rejected':
      return t.statusRejected;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}
