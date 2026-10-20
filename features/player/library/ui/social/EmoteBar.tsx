// features/player/library/ui/social/EmoteBar.tsx — la barre des signes d'une
// salle de la Women's Library (lot 5) : les emotes et les phrases
// prédéfinies que la salle PERMET (`socialAllowance`) — la Grande salle de
// lecture est silencieuse : pas de phrases, seulement quelques emotes douces.
//
// Présentationnel : `onEmote` / `onPhrase` rendent `true` si le signe part
// (le hook `useLibraryRoomChannel`). Un `false` alors que la barre est active
// est une cadence dépassée (un signe par seconde) : un mot DISCRET dans une
// zone `status`, jamais un toast, et un seul à la fois.
//
// Barre ÉTEINTE (`disabledReason`) tant qu'on ne peut pas faire signe —
// discrète, invisible, ou pas encore connectée — avec la raison, liée aux
// boutons (`aria-describedby`). Les boutons restent atteignables
// (`aria-disabled`) : on entend pourquoi ils ne font rien.
//
// CLAVIER : `role="toolbar"`, un seul arrêt de tabulation, flèches gauche /
// droite (et haut / bas), Début / Fin pour aller d'un signe à l'autre.

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';
import {
  type LibraryEmoteId,
  type LibraryPhraseId,
  socialAllowance,
} from '../../realtime/social';
import { SOCIAL_MIN_INTERVAL_MS } from '../../realtime/throttle';
import type { LibraryRoomKind } from '../../socialResponses';
import type { EmoteBarDisabledReason } from '../../socialModel';
import { LIBRARY_EMOTE_GLYPHS } from './emoteGlyphs';
import { FOCUS_RING } from './shared';

export type EmoteBarProps = {
  roomKind: LibraryRoomKind;
  /** `null` : on peut faire signe (cf. `emoteBarDisabledReason`). */
  disabledReason: EmoteBarDisabledReason | null;
  onEmote: (emote: LibraryEmoteId) => boolean;
  onPhrase: (phrase: LibraryPhraseId) => boolean;
};

type Sign =
  | { type: 'emote'; id: LibraryEmoteId }
  | { type: 'phrase'; id: LibraryPhraseId };

/** Le mot discret « doucement » s'efface après ce délai. */
const NOTE_MS = 2 * SOCIAL_MIN_INTERVAL_MS;

const SIGN = `inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 text-sm font-semibold text-[var(--t1,#f4edf7)] hover:border-[var(--or,#b467d1)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-[var(--line2,rgba(194,196,201,.2))] ${FOCUS_RING}`;

export default function EmoteBar({
  roomKind,
  disabledReason,
  onEmote,
  onPhrase,
}: EmoteBarProps) {
  const t = useT(nsSocial);
  const ids = useId();
  const allowance = socialAllowance(roomKind);
  const signs: Sign[] = [
    ...allowance.emotes.map((id) => ({ type: 'emote' as const, id })),
    ...allowance.phrases.map((id) => ({ type: 'phrase' as const, id })),
  ];
  const [active, setActive] = useState(0);
  const [note, setNote] = useState('');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const disabled = disabledReason !== null;
  const current = Math.min(active, signs.length - 1);

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    []
  );

  const send = (sign: Sign) => {
    if (disabled) return;
    const ok = sign.type === 'emote' ? onEmote(sign.id) : onPhrase(sign.id);
    if (ok) return;
    setNote(t.emoteBar.tooFast);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(''), NOTE_MS);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = signs.length - 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? current >= last
          ? 0
          : current + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? current <= 0
            ? last
            : current - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  const describedBy = [
    disabled ? `${ids}-reason` : null,
    allowance.phrases.length === 0 ? `${ids}-silent` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const signButton = (sign: Sign, index: number) => (
    <button
      key={`${sign.type}-${sign.id}`}
      ref={(el) => {
        refs.current[index] = el;
      }}
      type="button"
      tabIndex={index === current ? 0 : -1}
      aria-disabled={disabled || undefined}
      data-sign={`${sign.type}:${sign.id}`}
      onFocus={() => setActive(index)}
      onClick={() => send(sign)}
      className={SIGN}
    >
      {sign.type === 'emote' ? (
        <>
          <span aria-hidden="true">{LIBRARY_EMOTE_GLYPHS[sign.id]}</span>
          <span>{t.emotes[sign.id]}</span>
        </>
      ) : (
        t.phrases[sign.id]
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        role="toolbar"
        aria-label={t.emoteBar.label}
        aria-describedby={describedBy || undefined}
        onKeyDown={onKey}
        className="flex flex-col gap-2"
      >
        <div
          role="group"
          aria-label={t.emoteBar.emotesGroup}
          className="flex flex-wrap gap-1.5"
        >
          {signs.map((sign, i) =>
            sign.type === 'emote' ? signButton(sign, i) : null
          )}
        </div>
        {allowance.phrases.length > 0 && (
          <div
            role="group"
            aria-label={t.emoteBar.phrasesGroup}
            className="flex flex-wrap gap-1.5"
          >
            {signs.map((sign, i) =>
              sign.type === 'phrase' ? signButton(sign, i) : null
            )}
          </div>
        )}
      </div>
      {allowance.phrases.length === 0 && (
        <p id={`${ids}-silent`} className="text-xs text-[var(--t3,#a39ba6)]">
          {t.emoteBar.silentRoom}
        </p>
      )}
      {disabledReason && (
        <p id={`${ids}-reason`} className="text-sm text-[var(--t2,#c7bfca)]">
          {t.emoteBar.disabled[disabledReason]}
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        className="min-h-5 text-xs text-[var(--t3,#a39ba6)]"
      >
        {note}
      </p>
    </div>
  );
}
