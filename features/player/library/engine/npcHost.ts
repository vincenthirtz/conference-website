// Le PNJ d'une salle, chargé À LA DEMANDE (lot 16 de
// docs/PLAN-womens-library.md). Le fantôme d'Halloween (`npcLayer.ts`, sa
// ronde, ses « bouh », l'index de ses images) n'existe que dans le hall et
// pendant l'événement : son code part dans un morceau à part, demandé
// seulement quand une salle en a un. Les autres salles et l'appartement ne le
// chargent jamais (garde : scripts/bundle-budget.mjs).
//
// Le monde reçoit le PNJ quand il arrive (`world.npc`) ; d'ici là, le rendu,
// les appuis et la boucle font comme s'il n'y en avait pas.

import type { ImageCache } from './assets';
import type { NpcLayer, NpcOptions } from './npcLayer';

export type { NpcOptions } from './npcLayer';

/** Charge le PNJ demandé et le pose dans le monde ; rien sans option. */
export function attachNpc(
  world: { npc: NpcLayer | null },
  opts: NpcOptions | null | undefined,
  images: ImageCache,
  loop: { request(): void }
): void {
  if (!opts) return;
  void import('./npcLayer').then(({ NpcLayer }) => {
    world.npc = new NpcLayer(opts, images, loop);
    loop.request();
  });
}
