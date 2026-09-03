// components/admin/demandes/demandeChips.tsx
//
// Libellés et couleurs des pastilles de la liste des demandes : type, statut,
// et le format de date qui les accompagne.
//
// Extrait de `pages/admin/demandes/index.tsx` quand celle-ci a franchi le
// plafond de taille des écrans admin (cf. tests/unit/adminFileSizeGuard.test.ts).
// La coupe est naturelle : quatre fonctions PURES, sans état ni requête, dont
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

export function typeColor(type: DemandeType | string) {
  switch (type) {
    case 'join':
    case 'join_team':
      return 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30';
    case 'leave':
    case 'leave_team':
      return 'bg-amber-600/20 text-amber-300 border border-amber-500/30';
    case 'captain_request':
      return 'bg-purple-600/20 text-purple-300 border border-purple-500/30';
    case 'team_registration':
      return 'bg-blue-600/20 text-blue-300 border border-blue-500/30';
    case 'scrim':
      return 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30';
    case 'other':
      return 'bg-neutral-500/20 text-neutral-300 border border-neutral-500/30';
    default:
      return 'bg-neutral-700 text-neutral-100';
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

export function statusColor(status: DemandeStatus) {
  switch (status) {
    case 'pending':
      return 'bg-blue-600 text-white';
    case 'approved':
      return 'bg-emerald-600 text-white';
    case 'rejected':
      return 'bg-red-600 text-white';
    case 'cancelled':
      return 'bg-neutral-600 text-neutral-200';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}
