// features/player/library/ui/chat/LibraryChat.tsx — le chat d'une salle de la
// Women's Library, sous la scène (lot 6 de docs/PLAN-womens-library.md) : le
// hall, les appartements ouverts, les QG. JAMAIS la Grande salle de lecture,
// silencieuse (le composant n'y rend rien, et l'API refuse).
//
//   - fermé (interrupteur de l'espace éteint par défaut) : une notice, les
//     emotes restent ;
//   - le fil (`ChatFeed`), polie et en texte brut ; « Signaler ce message »,
//     et pour qui en a le droit ici : masquer (staff, capitaine / manager au
//     QG), mettre en sourdine (staff, propriétaire chez elle) ;
//   - la saisie (`ChatComposer`), ou pourquoi on ne peut pas écrire (en
//     sourdine jusqu'à…, QG réservé aux membres).
// La connexion temps réel est celle de la scène (relais `realtime/chatBus`) :
// ce composant ne rejoint aucun canal.

import {
  type ReactNode,
  type RefObject,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react';
import { format, useT } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import nsChat from '@/lib/i18n/locales/fr/playerLibraryChat';
import { Button } from '@/features/ruban';
import type { LibraryChatClient } from '../../realtime/chatClient';
import type { ChatFeedMessage } from '../../realtime/chatState';
import type { LibraryRoomKind } from '../../socialResponses';
import { formatUntil, SURFACE, TEXT_ERROR, TEXT_MUTED } from '../social/shared';
import ChatActionPanel from './ChatActionPanel';
import ChatComposer from './ChatComposer';
import ChatFeed, { type ChatActionKind } from './ChatFeed';
import { useLibraryChat } from './useLibraryChat';

export type LibraryChatProps = {
  roomId: string;
  kind: LibraryRoomKind;
  /** Client HTTP en mémoire (page de développement, tests). */
  client?: LibraryChatClient;
};

export default function LibraryChat(props: LibraryChatProps) {
  if (props.kind === 'reading_room') return null;
  return <LibraryChatPanel {...props} />;
}

type OpenAction = {
  kind: ChatActionKind;
  message: ChatFeedMessage;
  trigger: RefObject<HTMLElement | null>;
};

function LibraryChatPanel({ roomId, client }: LibraryChatProps) {
  const t = useT(nsChat);
  const { lang } = useLang();
  const ids = useId();
  const chat = useLibraryChat({ roomId, client });
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [action, setAction] = useState<OpenAction | null>(null);
  const [announce, setAnnounce] = useState('');
  const triggerRef = useRef<HTMLElement | null>(null);

  const until = useCallback((iso: string) => formatUntil(iso, lang), [lang]);
  const toggle = useCallback((id: string | null) => {
    setOpenFor(id);
    setAction(null);
  }, []);

  const state = chat.chat;
  const canHide = state?.canHide === true;
  const canMute = state?.canMute === true;

  const renderPanel = (messageId: string) => {
    if (!action || action.message.id !== messageId) return null;
    const { message } = action;
    return (
      <ChatActionPanel
        kind={action.kind}
        message={message}
        formatUntil={until}
        returnFocusRef={action.trigger}
        onReport={(input) => chat.report(message.id, input)}
        onHide={() => chat.hide(message.id)}
        onMute={(minutes) => chat.mute(message.userId, minutes)}
        onDone={setAnnounce}
        onClose={() => {
          setAction(null);
          setOpenFor(null);
        }}
      />
    );
  };

  let body: ReactNode;
  if (chat.phase === 'loading') {
    body = (
      <p role="status" className={TEXT_MUTED}>
        {t.loading}
      </p>
    );
  } else if (chat.phase === 'error') {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className={TEXT_ERROR}>{t.loadError}</p>
        <Button size="sm" onClick={chat.retry}>
          {t.retry}
        </Button>
      </div>
    );
  } else if (!chat.enabled) {
    body = (
      <div data-chat-closed="" className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{t.closedTitle}</p>
        <p className={TEXT_MUTED}>{t.closedBody}</p>
      </div>
    );
  } else {
    body = (
      <>
        <ChatFeed
          messages={chat.feed.messages}
          selfId={chat.selfId}
          canHide={canHide}
          canMute={canMute}
          openFor={openFor}
          onToggle={toggle}
          onAction={(kind, message, trigger) => {
            // Le focus reviendra au « ⋯ » du message (la liste des gestes
            // laisse place au panneau).
            triggerRef.current =
              trigger
                .closest('li')
                ?.querySelector<HTMLElement>('[data-chat-toggle]') ?? null;
            setAction({ kind, message, trigger: triggerRef });
          }}
          renderPanel={renderPanel}
        />
        {chat.muted && chat.mutedUntil ? (
          <p role="status" className={TEXT_MUTED} data-chat-muted="">
            {format(t.mutedUntil, { time: until(chat.mutedUntil) })}
          </p>
        ) : chat.readOnly ? (
          <p className={TEXT_MUTED} data-chat-read-only="">
            {t.readOnly}
          </p>
        ) : (
          <ChatComposer
            sending={chat.sending}
            onSend={chat.send}
            formatUntil={until}
          />
        )}
        <p className="text-xs text-[var(--t3,#a39ba6)]">{t.plainText}</p>
      </>
    );
  }

  return (
    <section
      aria-labelledby={`${ids}-title`}
      data-library-chat=""
      data-chat-phase={chat.phase}
      className={`flex flex-col gap-3 p-4 ${SURFACE}`}
    >
      <h2 id={`${ids}-title`} className="text-base font-bold">
        {t.title}
      </h2>
      {body}
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  );
}
