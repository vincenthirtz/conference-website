// features/player/library/realtime/chatBus.ts — le relais, DANS LA PAGE, entre
// la connexion d'une salle et ce qui affiche son chat (lot 6 de
// docs/PLAN-womens-library.md).
//
// POURQUOI UN RELAIS. La connexion aux canaux de la salle vit dans la scène
// (`useLibraryRoomChannel`, monté par `RoomStage` ou `ApartmentStage`) ; le
// fil et la saisie vivent SOUS la scène (`RoomExtras`, l'appartement), et les
// bulles dans la scène. Rejoindre une seconde fois `library:chat:<salle>`
// pour le fil doublerait la jonction (et supabase-js refuse deux
// `subscribe()` sur un même sujet) ; faire descendre la connexion par les
// props toucherait les écrans des autres lots. La connexion PUBLIE ici, par
// salle ; le fil et les bulles s'ABONNENT.
//
// Le dernier CONTEXTE (moi, personnes masquées) est rejoué à un abonné qui
// arrive après l'entrée : le fil se monte après la scène.

import type { LibraryChatEvent } from './chatEvents';

export type LibraryChatContext = {
  selfId: string;
  /** Blocages dans les deux sens (tenus à jour par la connexion). */
  hiddenUserIds: readonly string[];
};

export type LibraryChatBusEvent =
  | LibraryChatEvent
  | { type: 'context'; context: LibraryChatContext };

type Listener = (event: LibraryChatBusEvent) => void;

const listeners = new Map<string, Set<Listener>>();
const contexts = new Map<string, LibraryChatContext>();

function notify(roomId: string, event: LibraryChatBusEvent) {
  for (const listener of [...(listeners.get(roomId) ?? [])]) {
    try {
      listener(event);
    } catch {
      /* un abonné en panne ne prive pas les autres */
    }
  }
}

/** Un événement serveur du chat de la salle (déjà validé). */
export function publishLibraryChatEvent(
  roomId: string,
  event: LibraryChatEvent
): void {
  notify(roomId, event);
}

/** Qui je suis, qui je ne vois pas : gardé, et rejoué aux abonnés tardifs. */
export function publishLibraryChatContext(
  roomId: string,
  context: LibraryChatContext
): void {
  const prev = contexts.get(roomId);
  if (
    prev &&
    prev.selfId === context.selfId &&
    prev.hiddenUserIds.length === context.hiddenUserIds.length &&
    prev.hiddenUserIds.every((u, i) => u === context.hiddenUserIds[i])
  ) {
    return;
  }
  const kept = {
    selfId: context.selfId,
    hiddenUserIds: [...context.hiddenUserIds],
  };
  contexts.set(roomId, kept);
  notify(roomId, { type: 'context', context: kept });
}

/** La salle est quittée : son contexte est oublié. */
export function clearLibraryChat(roomId: string): void {
  contexts.delete(roomId);
}

/** S'abonner au chat d'une salle ; rend la désinscription. */
export function subscribeLibraryChat(
  roomId: string,
  listener: Listener
): () => void {
  let set = listeners.get(roomId);
  if (!set) {
    set = new Set();
    listeners.set(roomId, set);
  }
  set.add(listener);
  const context = contexts.get(roomId);
  if (context) listener({ type: 'context', context });
  return () => {
    const current = listeners.get(roomId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(roomId);
  };
}
