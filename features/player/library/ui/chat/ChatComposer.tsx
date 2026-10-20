// features/player/library/ui/chat/ChatComposer.tsx — écrire dans le chat d'une
// salle (lot 6 de docs/PLAN-womens-library.md). Présentationnel : l'envoi
// arrive par `onSend`, l'API décide (droits, sourdine, rythme, doublon,
// longueur, filtre).
//
//   - un champ étiqueté, Entrée envoie ;
//   - le compteur « n / 200 », lié au champ (`aria-describedby`) — il n'est
//     PAS annoncé à chaque frappe ; au-delà, le champ est marqué invalide et
//     l'envoi refusé avant même de partir ;
//   - le refus de l'API, clair, dans une alerte (`role="alert"`) : trop
//     rapide (combien de secondes), filtré (sans dire le mot), doublon, en
//     sourdine, chat fermé… Il s'efface dès qu'on retape ;
//   - une coordonnée masquée à l'envoi est signalée (statut poli).

import { type FormEvent, useId, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsChat from '@/lib/i18n/locales/fr/playerLibraryChat';
import { Button } from '@/features/ruban';
import type { LibraryChatSendResponse } from '../../chat/responses';
import { LIBRARY_CHAT_MAX_CHARS } from '../../chat/schemas';
import { FOCUS_RING, TEXT_ERROR } from '../social/shared';
import { type ChatError, chatLength, retrySeconds } from './chatModel';
import type { ChatResult } from './useLibraryChat';

export function chatErrorText(
  t: (typeof nsChat)['fr'],
  error: ChatError,
  until: (iso: string) => string
): string {
  switch (error.key) {
    case 'chat_too_fast':
      return format(t.errors.chat_too_fast, {
        seconds: retrySeconds(error.retryAfterMs),
      });
    case 'chat_too_long':
      return format(t.errors.chat_too_long, {
        max: error.max ?? LIBRARY_CHAT_MAX_CHARS,
      });
    case 'chat_muted':
      return error.until
        ? format(t.mutedUntil, { time: until(error.until) })
        : t.errors.chat_muted;
    default:
      return t.errors[error.key];
  }
}

export default function ChatComposer({
  sending,
  onSend,
  formatUntil,
}: {
  sending: boolean;
  /** `null` : un envoi est déjà en cours. */
  onSend: (text: string) => Promise<ChatResult<LibraryChatSendResponse> | null>;
  formatUntil: (iso: string) => string;
}) {
  const t = useT(nsChat);
  const c = t.composer;
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<ChatError | null>(null);
  const [maskedNotice, setMaskedNotice] = useState(false);

  const length = chatLength(text);
  const over = length > LIBRARY_CHAT_MAX_CHARS;
  const empty = text.trim().length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (empty || over || sending) return;
    setError(null);
    setMaskedNotice(false);
    const result = await onSend(text);
    if (!result) return;
    if (result.ok) {
      setText('');
      setMaskedNotice(result.data.masked);
    } else {
      setError(result.error);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-1"
      data-library-chat-composer=""
    >
      <label htmlFor={id} className="sr-only">
        {c.label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={text}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={c.placeholder}
          aria-invalid={over || undefined}
          aria-describedby={`${id}-count${over ? ` ${id}-over` : ''}`}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
            if (maskedNotice) setMaskedNotice(false);
          }}
          className={`min-h-11 min-w-0 flex-1 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 text-sm text-[var(--t1,#f4edf7)] ${FOCUS_RING}`}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={empty || over}
          aria-disabled={sending || undefined}
          aria-busy={sending}
        >
          {sending ? c.sending : c.send}
        </Button>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
        <div className="min-w-0 flex-1">
          {over && (
            <p id={`${id}-over`} className={TEXT_ERROR}>
              {format(c.tooLong, { max: LIBRARY_CHAT_MAX_CHARS })}
            </p>
          )}
          {error && (
            <p role="alert" className={TEXT_ERROR} data-chat-error={error.key}>
              {chatErrorText(t, error, formatUntil)}
            </p>
          )}
          {maskedNotice && (
            <p role="status" className="text-[var(--t2,#c7bfca)]">
              {c.masked}
            </p>
          )}
        </div>
        <p
          id={`${id}-count`}
          className={over ? TEXT_ERROR : 'text-[var(--t3,#a39ba6)]'}
        >
          <span aria-hidden="true">
            {format(c.counter, { count: length, max: LIBRARY_CHAT_MAX_CHARS })}
          </span>
          <span className="sr-only">
            {format(c.counterLabel, {
              count: length,
              max: LIBRARY_CHAT_MAX_CHARS,
            })}
          </span>
        </p>
      </div>
    </form>
  );
}
