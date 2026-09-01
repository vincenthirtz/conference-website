// components/admin/moderation/supportLabels.ts
//
// Correspondances d'affichage d'un ticket (catégories, statuts, sévérités,
// date FR), extraites de `SupportPanel.tsx` — lot A7 : tout lot qui touche un
// god-component en sort un morceau. Le lot A6 y ajoutait le bouton
// d'historique, et le garde-fou de taille l'a refusé.
//
// Fonctions PURES : elles ne dépendent que du dictionnaire admin.

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

export function severityBadge(severity: Severity): string {
  switch (severity) {
    case 'high':
      return 'bg-red-700/30 text-red-200 border-red-500/40';
    case 'medium':
      return 'bg-amber-700/30 text-amber-200 border-amber-500/40';
    default:
      return 'bg-blue-700/30 text-blue-200 border-blue-500/40';
  }
}

export function statusBadge(status: Status): string {
  switch (status) {
    case 'open':
      return 'bg-red-600/20 text-red-200 border-red-500/40';
    case 'in_progress':
      return 'bg-amber-600/20 text-amber-200 border-amber-500/40';
    case 'resolved':
      return 'bg-emerald-600/20 text-emerald-200 border-emerald-500/40';
    case 'closed':
      return 'bg-neutral-600/20 text-neutral-300 border-neutral-500/40';
  }
}
