// components/admin/tournament/mapPool/types.ts
//
// Formes partagées par les panneaux du pool de cartes. Isolées ici pour que
// l'écran et ses panneaux ne se les repassent pas par imports croisés.

export type TournamentMapRow = {
  id: string;
  tournament_id: string;
  map_name: string;
  map_slug: string | null;
  map_type: string | null;
  image_url: string | null;
  enabled: boolean;
  order_index: number | null;
  round_number: number | null;
  created_at?: string;
};

export type RoundOption = {
  round: number;
  label: string;
  /** Jours programmés en `YYYY-MM-DD` (Europe/Paris). */
  days: string[];
  mapsCount: number;
};

/** Libellé d'un type de carte, ou « — » quand il n'y en a pas. */
export function typeLabel(
  labels: Record<string, string>,
  type: string | null | undefined
): string {
  if (!type) return '—';
  return labels[type] || type;
}
