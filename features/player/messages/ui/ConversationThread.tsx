// features/player/messages/ui/ConversationThread.tsx — le fil d'une
// conversation : bulles (les miennes à droite), journal annoncé poliment
// (`role="log"`) (lot P15). Présentationnel ; la barre de réponse est passée
// en `footer`.

import type { ReactNode, Ref } from 'react';
import { rubanHelp, rubanSpinner } from '@/features/ruban';
import type { ConversationMessage } from '../schemas';
import { formatMessageTime } from './formatWhen';

export default function ConversationThread({
  messages,
  myTeamId,
  loading,
  locale,
  texts,
  endRef,
  footer,
}: {
  messages: ConversationMessage[];
  myTeamId: string | null;
  loading: boolean;
  locale: string;
  texts: { conversationLabel: string; noMessages: string; loading: string };
  endRef: Ref<HTMLDivElement>;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col sm:min-h-[400px]">
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-1 items-center justify-center"
        >
          <span className={rubanSpinner} aria-hidden />
          <span className="sr-only">{texts.loading}</span>
        </div>
      ) : (
        <>
          <div
            role="log"
            aria-live="polite"
            aria-label={texts.conversationLabel}
            className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto px-6 py-4 sm:max-h-[400px]"
          >
            {messages.length === 0 && (
              <div className={`py-8 text-center ${rubanHelp}`}>
                {texts.noMessages}
              </div>
            )}
            {messages.map((msg) => {
              const mine = msg.senderTeamId === myTeamId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-[var(--r-card,14px)] border px-4 py-3 ${
                      mine
                        ? 'border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)]'
                        : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]'
                    }`}
                  >
                    {!mine && (
                      <div className="mb-1 text-[10px] font-medium text-[var(--t3,#a39ba6)]">
                        {String(msg.senderName ?? '')}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm text-[var(--t1,#f4edf7)]">
                      {msg.content}
                    </p>
                    <div className="mt-1 text-[10px] text-[var(--t3,#a39ba6)]">
                      {formatMessageTime(msg.createdAt, locale)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          {footer}
        </>
      )}
    </div>
  );
}
