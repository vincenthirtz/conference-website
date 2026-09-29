// components/admin/moderation/supportLabels.ts
//
// Correspondances d'affichage d'un ticket (catégories, statuts, sévérités,
// date FR), extraites de `SupportPanel.tsx` — lot A7 : tout lot qui touche un
// god-component en sort un morceau. Le lot A6 y ajoutait le bouton
// d'historique, et le garde-fou de taille l'a refusé.
//
// Fonctions PURES : elles ne dépendent que du dictionnaire admin.

import type { ChipTone } from '@/features/admin/_shared/ui/Chip';

export type Category = 'dispute' | 'behavior' | 'technical' | 'other';
export type Status = 'open' | 'in_progress' | 'resolved' | 'closed';
export type Severity = 'low' | 'medium' | 'high';

/** Sous-ensemble du dictionnaire dont dépendent ces libellés. */
type Dict = Record<string, string>;

export function getCategoryLabels(tx: Dict): Record<Category, string> {
  return {
    dispute: tx.catDispute,
    behavior: tx.catBehavior,
    technical: tx.catTechnical,
    other: tx.catOther,
  };
}

export function getStatusLabels(tx: Dict): Record<Status, string> {
  return {
    open: tx.statusOpen,
    in_progress: tx.statusInProgress,
    resolved: tx.statusResolved,
    closed: tx.statusClosed,
  };
}

export function formatDateFr(value: string): string {
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

/** Ton de puce (Chip) d'une sévérité : seule `high` alerte vraiment. */
export function severityTone(severity: Severity): ChipTone {
  if (severity === 'high') return 'err';
  if (severity === 'medium') return 'warn';
  return 'neutral';
}

/** Ton de puce (Chip) d'un statut de ticket. */
export function statusTone(status: Status): ChipTone {
  switch (status) {
    case 'open':
      return 'err';
    case 'in_progress':
      return 'warn';
    case 'resolved':
      return 'ok';
    default:
      return 'neutral';
  }
}
