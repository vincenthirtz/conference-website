// @vitest-environment happy-dom
//
// Women's Library, lot 15 — le crochet des meubles côté écran
// (features/player/library/ui/room/usePlayerPosture.ts) :
//   * les actions proposées au moteur sont traduites ; « Changer de tenue »
//     (armoire, miroir) seulement là où un éditeur de look s'ouvre ;
//   * la case visée part avec ce que j'y ferai, ma présence avec ma posture
//     (et ma dernière position est gardée pour la reconnexion) ;
//   * l'armoire ouvre l'éditeur ; « Se lever » passe par le moteur monté
//     (la vue `ApartmentView`, qui appelle ce crochet, lui passe `standUp`).

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LibraryPosition } from '../../features/player/library/realtime/connection';
import { usePlayerPosture } from '../../features/player/library/ui/room/usePlayerPosture';

function setup(onDress?: () => void) {
  const room = {
    sendMove: vi.fn(() => 'sent' as const),
    updatePosition: vi.fn(),
  };
  const posRef = { current: null as LibraryPosition | null };
  const standUp = vi.fn();
  const hook = renderHook(() =>
    usePlayerPosture({ room, posRef, standUp, onDress })
  );
  return { hook, room, posRef, standUp };
}

describe('usePlayerPosture', () => {
  it('sans éditeur de look : l’armoire n’est pas proposée', () => {
    const { hook } = setup();
    const { labels, glyphs } = hook.result.current.interactions;
    expect(labels.sit).toBe('S’asseoir');
    expect(labels.read).toBe('Lire');
    expect(labels.dress).toBeUndefined();
    expect(glyphs?.read).toBeTruthy();
  });

  it('avec un éditeur : proposée, et elle l’ouvre', () => {
    const onDress = vi.fn();
    const { hook } = setup(onDress);
    expect(hook.result.current.interactions.labels.dress).toBe(
      'Changer de tenue'
    );
    hook.result.current.onFurnitureUse({
      activity: 'read',
      itemId: 'shelf',
      anchor: { x: 0, y: 0 },
    });
    expect(onDress).not.toHaveBeenCalled();
    hook.result.current.onFurnitureUse({
      activity: 'dress',
      itemId: 'wardrobe',
      anchor: { x: 0, y: 0 },
    });
    expect(onDress).toHaveBeenCalledTimes(1);
  });

  it('le réseau : la case visée et ma présence portent ma posture', () => {
    const { hook, room, posRef } = setup();
    hook.result.current.onPlayerWalk(
      { i: 2, j: 4 },
      { kind: 'seat', itemId: 'sofa', spot: 1 }
    );
    expect(room.sendMove).toHaveBeenLastCalledWith(2, 4, {
      seat: { item: 'sofa', spot: 1 },
    });
    hook.result.current.onPlayerWalk({ i: 5, j: 5 });
    expect(room.sendMove).toHaveBeenLastCalledWith(5, 5, {});
    hook.result.current.onPlayerArrive({ i: 2, j: 4 }, 5, {
      kind: 'seat',
      itemId: 'sofa',
      spot: 1,
      pose: 'sit',
    });
    expect(room.updatePosition).toHaveBeenLastCalledWith({
      gx: 2,
      gy: 4,
      dir: 5,
      seat: { item: 'sofa', spot: 1 },
    });
    expect(posRef.current).toEqual({
      gx: 2,
      gy: 4,
      dir: 5,
      seat: { item: 'sofa', spot: 1 },
    });
    hook.result.current.onPlayerArrive({ i: 2, j: 4 }, 5);
    expect(room.updatePosition).toHaveBeenLastCalledWith({
      gx: 2,
      gy: 4,
      dir: 5,
    });
  });

  it('ma posture pour le bouton ; « Se lever » passe par le moteur', () => {
    const { hook, standUp } = setup();
    expect(hook.result.current.posture).toBeNull();
    act(() =>
      hook.result.current.onPlayerPosture({
        kind: 'use',
        itemId: 'shelf',
        activity: 'read',
      })
    );
    expect(hook.result.current.posture).toEqual({
      kind: 'use',
      itemId: 'shelf',
      activity: 'read',
    });
    hook.result.current.standUp();
    expect(standUp).toHaveBeenCalledTimes(1);
  });
});
