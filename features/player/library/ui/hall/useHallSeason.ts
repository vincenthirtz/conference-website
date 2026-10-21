// features/player/library/ui/hall/useHallSeason.ts — la SAISON du hall à son
// entrée (lot 16 de docs/PLAN-womens-library.md) : pendant l'Event Halloween,
// le hall a ses citrouilles, leur zone (`halloween/hallDecor.hallSeasonAt`)
// et son fantôme (`engine/npcLayer.ts`).
//
// RIEN DE L'ÉVÉNEMENT DANS LE PREMIER CHARGEMENT : la saison est lue à la
// demande, en entrant dans le hall (les citrouilles et leur zone arrivent
// aussitôt après, du MÊME résultat : la zone n'existe jamais sans elles) ; le
// fantôme est demandé au moteur dans le hall, et lui seul regarde l'affiche, à
// chaque image (`halloweenGhostAt`) — après `visibleUntil`, il part tout seul,
// et une entrée suivante n'a plus de citrouilles.
//
// `forcedAt` (page de développement, `?npc=halloween`) : l'instant de la
// saison est fixé, et le fantôme reste même hors de l'affiche.
// Aucun import de VALEUR du moteur ni de l'événement.

import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import type { NpcOptions } from '../../engine/npcLayer';
import type { HallSeason } from '../../halloween/hallDecor';
import type { LibraryRoomKind } from '../../socialResponses';

export type HallSeasonState = {
  /** L'instant de la saison (ms), null tant qu'on n'est pas entrée. */
  at: number | null;
  /** Ce que la saison ajoute au hall (lu à la demande), ou null. */
  season: HallSeason | null;
  /** Le PNJ du hall (textes traduits), ou null ailleurs. */
  npc: NpcOptions | null;
};

/**
 * La saison de la salle où l'on vient d'entrer. `entered` : l'entrée (une
 * nouvelle entrée relit l'heure) ; null tant qu'elle n'est pas là.
 */
export function useHallSeason(
  kind: LibraryRoomKind | null,
  entered: object | null,
  forcedAt?: number
): HallSeasonState {
  const t = useT(nsHall);
  const at = useMemo(
    () => (entered ? (forcedAt ?? Date.now()) : null),
    [entered, forcedAt]
  );
  const [read, setRead] = useState<{
    at: number;
    season: HallSeason | null;
  } | null>(null);
  useEffect(() => {
    if (kind !== 'hall' || at === null) return undefined;
    let live = true;
    void import('../../halloween/hallDecor').then(({ hallSeasonAt }) => {
      if (live) setRead({ at, season: hallSeasonAt(at) });
    });
    return () => {
      live = false;
    };
  }, [kind, at]);
  const season = kind === 'hall' && read?.at === at ? read.season : null;
  const npc = useMemo<NpcOptions | null>(
    () =>
      kind === 'hall' && at !== null
        ? {
            kind: 'halloween',
            spotId: 'halloween',
            booText: t.halloween.boo,
            label: t.halloween.ghostLabel,
            ...(forcedAt === undefined ? {} : { ignoreWindow: true }),
          }
        : null,
    [kind, at, forcedAt, t.halloween]
  );
  return { at, season, npc };
}
