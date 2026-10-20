// features/player/library/ui/chat/useChatBubbles.ts — les messages du chat en
// BULLES au-dessus des avatars (lot 6 de docs/PLAN-womens-library.md).
//
// La scène (`RoomStage`, l'appartement ouvert) passe ses avatars et ma bulle
// de signe ; ce crochet y pose la bulle du DERNIER message de chacune, quand
// il est plus récent que son dernier signe. Le texte est élidé sur une ligne
// par le moteur (`engine/avatarOverlays.ts`) ; le fil, sous la scène, garde
// le texte entier. Un message masqué par la modération retire sa bulle.
// Les messages arrivent par le relais de la salle (`realtime/chatBus.ts`) :
// rien n'est rejoint ici.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BubbleContent, RemoteAvatarInput } from '../../engine/remotes';
import { chatBubbleKey } from '../../realtime/chatBubble';
import { subscribeLibraryChat } from '../../realtime/chatBus';
import {
  type ChatBubble,
  chatBubbleOf,
  playerChatBubble,
  withChatBubbles,
} from './chatModel';

/** Au-delà, une bulle gardée en mémoire est oubliée (elle est éteinte depuis longtemps). */
const KEEP_MS = 30_000;

export function useChatBubbles<R extends RemoteAvatarInput[] | undefined>({
  roomId,
  remote,
  playerBubble,
}: {
  roomId: string | null;
  remote: R;
  playerBubble: BubbleContent | null;
}): {
  remote: R;
  playerBubble: BubbleContent | null;
} {
  const [bubbles, setBubbles] = useState<ReadonlyMap<string, ChatBubble>>(
    () => new Map()
  );
  const [mine, setMine] = useState<{
    content: BubbleContent;
    seq: number;
  } | null>(null);
  const [signSeq, setSignSeq] = useState(0);
  const seq = useRef(0);
  const selfRef = useRef<string | null>(null);

  useEffect(() => {
    setBubbles(new Map());
    setMine(null);
    if (!roomId) return undefined;
    return subscribeLibraryChat(roomId, (event) => {
      if (event.type === 'context') {
        selfRef.current = event.context.selfId;
      } else if (event.type === 'message') {
        const now = Date.now();
        const bubble = chatBubbleOf(event.message, now);
        if (event.message.userId === selfRef.current) {
          seq.current += 1;
          setMine({ content: playerChatBubble(bubble), seq: seq.current });
          return;
        }
        setBubbles((prev) => {
          const next = new Map<string, ChatBubble>();
          for (const [id, b] of prev)
            if (now - b.shownAt < KEEP_MS) next.set(id, b);
          next.set(event.message.userId, bubble);
          return next;
        });
      } else if (event.type === 'hidden') {
        const key = chatBubbleKey(event.id);
        setBubbles((prev) => {
          if (![...prev.values()].some((b) => b.key === key)) return prev;
          return new Map([...prev].filter(([, b]) => b.key !== key));
        });
        setMine((m) => (m && m.content.key === key ? null : m));
      }
    });
  }, [roomId]);

  // Un nouveau signe à moi : il passe devant ma dernière bulle de chat.
  useEffect(() => {
    if (!playerBubble) return;
    seq.current += 1;
    setSignSeq(seq.current);
  }, [playerBubble]);

  const merged = useMemo(
    () => (remote ? (withChatBubbles(remote, bubbles) as R) : remote),
    [remote, bubbles]
  );
  const player =
    mine && (!playerBubble || mine.seq > signSeq) ? mine.content : playerBubble;

  return { remote: merged, playerBubble: player };
}
