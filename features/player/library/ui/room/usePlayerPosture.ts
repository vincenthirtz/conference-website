// features/player/library/ui/room/usePlayerPosture.ts — les meubles d'une
// salle, côté écran (lot 15 de docs/PLAN-womens-library.md). Appelé par la vue
// (`ui/apartment/ApartmentView`, chargée à la demande avec le moteur : rien de
// tout ceci ne pèse sur la page), pour l'appartement comme pour une visite :
//   - les actions PROPOSÉES au moteur, traduites (`interactions`) — « Changer
//     de tenue » seulement là où un éditeur de look s'ouvre (`onDress`) ;
//   - le RÉSEAU : la case visée part avec ce que j'y ferai (`seat` / `use`),
//     ma présence avec ma posture (ma case d'accès, à côté du meuble). En mode
//     discret, la connexion n'envoie rien, comme avant ;
//   - ma POSTURE pour le bouton « Se lever » / « Arrêter » sous la scène.

import {
  type MutableRefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useT } from '@/lib/i18n/useT';
import nsFurniture from '@/lib/i18n/locales/fr/playerLibraryFurniture';
import type { Direction } from '../../engine/motion';
import type {
  FurnitureUse,
  InteractionOptions,
} from '../../engine/playerActions';
import type { AvatarIntent, PlayerPosture } from '../../engine/postures';
import type { Tile } from '../../engine/projection';
import type { LibraryPosition } from '../../realtime/connection';
import type { LibraryRoomChannel } from '../../realtime/useLibraryRoomChannel';
import { restWireOf } from '../../roomStageModel';
import { LIBRARY_ACTIVITY_GLYPHS } from '../social/activityGlyphs';

export function usePlayerPosture({
  room,
  posRef,
  standUp,
  onDress,
}: {
  room: Pick<LibraryRoomChannel, 'sendMove' | 'updatePosition'>;
  /** Ma dernière position annoncée (reprise à la reconnexion). */
  posRef: MutableRefObject<LibraryPosition | null>;
  /** Relève la joueuse dans le moteur monté. */
  standUp: () => void;
  /** L'armoire et le miroir ouvrent l'éditeur de look ; absent : pas proposé. */
  onDress?: () => void;
}) {
  const t = useT(nsFurniture);
  const [posture, setPosture] = useState<PlayerPosture | null>(null);
  const dressRef = useRef(onDress);
  dressRef.current = onDress;
  const canDress = onDress !== undefined;

  const interactions = useMemo<InteractionOptions>(() => {
    const { dress, ...labels } = t.actions;
    return {
      labels: canDress ? { ...labels, dress } : labels,
      glyphs: LIBRARY_ACTIVITY_GLYPHS,
    };
  }, [t, canDress]);

  const { sendMove, updatePosition } = room;
  const onPlayerWalk = useCallback(
    (goal: Tile, intent?: AvatarIntent) => {
      sendMove(goal.i, goal.j, restWireOf(intent));
    },
    [sendMove]
  );
  const onPlayerArrive = useCallback(
    (tile: Tile, dir: Direction, p?: PlayerPosture) => {
      posRef.current = { gx: tile.i, gy: tile.j, dir, ...restWireOf(p) };
      updatePosition(posRef.current);
    },
    [posRef, updatePosition]
  );
  const onFurnitureUse = useCallback((use: FurnitureUse) => {
    if (use.activity === 'dress') dressRef.current?.();
  }, []);

  return {
    posture,
    interactions,
    onPlayerWalk,
    onPlayerArrive,
    onPlayerPosture: setPosture,
    onFurnitureUse,
    standUp,
  };
}

export type PlayerPostureState = ReturnType<typeof usePlayerPosture>;
