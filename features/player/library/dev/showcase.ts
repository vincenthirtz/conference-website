// features/player/library/dev/showcase.ts — une VITRINE des meubles du lot 15
// pour la page de développement `/dev/library-room` (404 en production) :
// chaque famille posée dans ses 4 rotations (un carré 2 × 2, r0 r1 / r2 r3),
// et une joueuse simulée ASSISE (ou allongée, ou en train de s'en servir) sur
// chaque place, par sa présence (`seat` / `use`) — exactement ce qu'enverrait
// une vraie cliente. Sert à caler à l'œil les profils de
// `engine/interactions.ts` : personne ne doit flotter, s'enfoncer ou
// s'asseoir à côté. Aucun réseau. Tout est chargé à la demande par
// `./DevRoomHarness.tsx` (le moteur compris, `./showcaseSitters.ts`) : rien ne
// pèse sur la page.

import { getFurniture } from '@/config/library/furniture';
import type { LibraryApartmentItem } from '../responses';

/** Les vitrines proposées (familles). */
export const SHOWCASES: Readonly<Record<string, readonly string[]>> = {
  'seats-a': ['armchair', 'armchair_green', 'armchair_scandi', 'rocking_chair'],
  'seats-b': ['chair', 'chair_painted', 'school_chair', 'carved_chair'],
  stools: [
    'stool',
    'stool_folding',
    'stool_painted',
    'stool_lacquer',
    'bar_stool',
    'ottoman',
  ],
  low: ['bean_bag', 'floor_cushion', 'lounge_chair'],
  'sofas-a': ['sofa', 'bench'],
  'sofas-b': ['sofa_chesterfield', 'sofa_painted'],
  'sofa-large': ['sofa_large'],
  'beds-a': ['bed'],
  'beds-b': ['bed_iron', 'daybed'],
  use: ['bookshelf_filled', 'wardrobe', 'arcade_cabinet', 'fireplace'],
};

/** Deux familles par rangée, chacune en carré 2 × 2 de ses rotations. */
export function showcaseRoom(families: readonly string[]): {
  width: number;
  depth: number;
  items: LibraryApartmentItem[];
} {
  const items: LibraryApartmentItem[] = [];
  let x0 = 0;
  let y0 = 0;
  let rowH = 0;
  let width = 0;
  families.forEach((key, k) => {
    const f = getFurniture(key);
    if (!f) return;
    const c = Math.max(f.footprint.w, f.footprint.d) + 2;
    if (k > 0 && k % 2 === 0) {
      x0 = 0;
      y0 += rowH;
      rowH = 0;
    }
    for (let r = 0; r < 4; r++)
      items.push({
        inventoryId: `sc-${key}-r${r}`,
        key,
        gx: x0 + (r % 2) * c + 1,
        gy: y0 + Math.floor(r / 2) * c + 1,
        rotation: r,
      });
    x0 += 2 * c;
    rowH = Math.max(rowH, 2 * c);
    width = Math.max(width, x0);
  });
  return {
    width: Math.max(8, width + 1),
    depth: Math.max(8, y0 + rowH + 1),
    items,
  };
}

/** La salle d'une vitrine (`showcaseRoom`). */
export type ShowcaseLayout = ReturnType<typeof showcaseRoom>;
