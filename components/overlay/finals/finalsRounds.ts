// components/overlay/finals/finalsRounds.ts
//
// Quelles rencontres de la journée sont des FINALES, et laquelle est la
// grande. Pur : la source `/overlay/finales` lit la même journée que « Matchs
// du jour » (`GET /api/overlay/day`) et n'en garde que ses finales.
//
// LE NOM DE LA MANCHE FAIT FOI. Les finales sont des matchs hors phase, saisis
// à la main avec leur nom (« Petite finale », « Grande finale ») : c'est la
// seule information que l'API d'overlay en rend. Une demi-finale ou un quart,
// qui contiennent eux aussi « finale », n'en sont pas.

import type { OverlayDayMatchView } from '@/utils/overlay/dayOverlay';

/** `grand` : le titre ; `small` : la 3e place. */
export type FinalKind = 'grand' | 'small';

export type FinalMatch = { match: OverlayDayMatchView; kind: FinalKind };

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Nature d'une manche d'après son nom, ou `null` si ce n'est pas une finale. */
export function finalKind(
  roundName: string | null | undefined
): FinalKind | null {
  const name = normalize(roundName ?? '').trim();
  if (!name) return null;
  if (/(demi|semi|quart|quarter|huitieme|eighth)/.test(name)) return null;
  if (/(petite|3e|3eme|troisieme|third|3rd|bronze)/.test(name)) return 'small';
  if (/\bfinale?s?\b/.test(name)) return 'grand';
  return null;
}

/** Les finales de la journée, dans l'ordre du programme. */
export function selectFinals(matches: OverlayDayMatchView[]): FinalMatch[] {
  const out: FinalMatch[] = [];
  for (const match of matches) {
    const kind = finalKind(match.roundName);
    if (kind) out.push({ match, kind });
  }
  return out;
}
