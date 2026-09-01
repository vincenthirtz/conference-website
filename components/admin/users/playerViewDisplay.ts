// components/admin/users/playerViewDisplay.ts
//
// Helpers d'affichage de la vue player (date longue, initiales d'avatar,
// libellés de demande, ton du badge de rôle), extraits de
// `pages/admin/users/[userId]/player-view.tsx` — lot A7 : tout lot qui touche
// un god-component en sort un morceau. Le lot A6 y ajoutait le bouton
// d'historique, et le garde-fou de taille l'a refusé.
//
// Fonctions PURES : aucune ne connaît React ni la page.

import type { BadgeTone } from '@/components/ui/Badge';

/** Sous-ensemble du dictionnaire dont dépendent ces libellés. */
type Dict = Record<string, string>;

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function initials(name: string | null, email: string | null): string {
  const source = (name || email || '?').trim();
  return source.slice(0, 2).toUpperCase();
}

export function getDemandeTypeLabels(t: Dict): Record<string, string> {
  return {
    captain_request: t.demandeTypeCaptainRequest,
    join: t.demandeTypeJoin,
    leave: t.demandeTypeLeave,
    transfer: t.demandeTypeTransfer,
    scrim: t.demandeTypeScrim,
  };
}

export function roleTone(role: string | null): BadgeTone {
  switch ((role || '').toLowerCase()) {
    case 'owner':
      return 'purple';
    case 'admin':
      return 'red';
    case 'caster':
      return 'blue';
    case 'player':
      return 'emerald';
    default:
      return 'neutral';
  }
}
