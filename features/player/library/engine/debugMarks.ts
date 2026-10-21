// Repères lisibles par un test e2e, posés sur le canvas (`data-*`) : la
// caméra, la case de la joueuse, le nombre d'autres joueuses, (lot 15) sa
// posture (`seat:<meuble>:<place>`, `use:<meuble>`, vide debout) et (lot 16)
// le PNJ (`x,y,z`). Écrits seulement quand ils changent (sorti du contrôleur
// au lot 15).

import type { Camera } from './projection';
import type { LibraryWorld } from './world';

export class DebugMarks {
  private last = { camera: '', tile: '', posture: '' };

  constructor(private canvas: HTMLCanvasElement) {}

  private set(
    key: 'camera' | 'playerTile' | 'remoteAvatars' | 'playerPosture' | 'npc',
    value: string
  ): void {
    if (this.canvas.dataset[key] !== value) this.canvas.dataset[key] = value;
  }

  sync(cam: Camera, world: LibraryWorld, playerId: string): void {
    const { x, y, zoom } = cam;
    const camera = `${x.toFixed(2)},${y.toFixed(2)},${zoom.toFixed(4)}`;
    if (camera !== this.last.camera) {
      this.set('camera', camera);
      this.last.camera = camera;
    }
    const t = world.tileOf(playerId);
    const tile = t ? `${t.i},${t.j}` : '';
    if (tile !== this.last.tile) {
      this.set('playerTile', tile);
      this.last.tile = tile;
    }
    this.set(
      'remoteAvatars',
      String(world.avatars.filter((a) => a.kind === 'remote').length)
    );
    const p = world.avatar(playerId)?.posture ?? null;
    const posture = !p
      ? ''
      : p.kind === 'seat'
        ? `seat:${p.itemId}:${p.spot}`
        : `use:${p.itemId}`;
    if (posture !== this.last.posture) {
      this.set('playerPosture', posture);
      this.last.posture = posture;
    }
    // Lot 16 : le PNJ (x, y en cases, hauteur de vol en m), vide sans lui.
    const n = world.npc?.pose;
    this.set(
      'npc',
      n ? `${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)}` : ''
    );
  }
}
