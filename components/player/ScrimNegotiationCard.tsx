// components/player/ScrimNegotiationCard.tsx
// Une carte « scrim en négociation » dans le dashboard capitaine.
//
// PERF : ce composant POSSÈDE son propre état de saisie (créneau sélectionné,
// contre-proposition ouverte + créneaux). Auparavant cet état vivait au sommet
// du dashboard, si bien que chaque frappe dans ScrimSlotCalendarPicker
// re-rendait TOUTE la page. Isolé + `React.memo`, seule la carte concernée se
// re-rend pendant la saisie.
//
// Le composant ne remonte au parent QUE les soumissions (accept / counter /
// reject) via un unique callback `onAction` STABLE (useCallback côté parent).
// La validation métier (créneau requis, ≥1 créneau) et la confirmation de rejet
// restent côté parent pour garder un comportement identique à l'existant.

import { memo, useState } from 'react';
import ScrimSlotCalendarPicker from '@/components/player/ScrimSlotCalendarPicker';
import { format, type useT } from '@/lib/i18n/useT';

type Tr = ReturnType<typeof useT<'playerIndex'>>;

export type ScrimNego = {
  slots: string[];
  proposedBy: string;
  rounds: number;
  agreedSlot: string | null;
};

export type PendingScrim = {
  id: string;
  comment: string | null;
  created_at: string;
  source?: string | null;
  payload: {
    from_team_name?: string;
    preferred_date?: string;
    format?: string | null;
    requester_email?: string | null;
    requester_discord?: string | null;
  };
  user: {
    display_name: string | null;
    email?: string | null;
    discord?: string | null;
  } | null;
  // Multi-slot negotiation context (scrims awaiting MY action; I am always the
  // non-proposer of the current slots).
  scrimNego?: ScrimNego;
  iAmRequester?: boolean;
  myTeamId?: string;
};

export type ScrimAction = 'accept' | 'counter' | 'reject';

export type ScrimActionPayload = {
  /** Créneau retenu (ISO) pour un `accept`. */
  slot?: string;
  /** Créneaux datetime-local d'une contre-proposition. */
  slots?: string[];
};

type Props = {
  scrim: PendingScrim;
  /** True pendant qu'une action de CETTE carte est en vol. */
  busy: boolean;
  /** Locale active pour le formatage des dates. */
  locale: string;
  /** Traductions du namespace `playerIndex`. */
  t: Tr;
  /** Callback STABLE : la carte ne remonte que la soumission. */
  /** Absent ⇒ lecture seule : la négociation est lisible, pas actionnable. */
  onAction?: (
    scrimId: string,
    action: ScrimAction,
    payload?: ScrimActionPayload
  ) => void;
};

function ScrimNegotiationCardImpl({ scrim, busy, locale, t, onAction }: Props) {
  // État de saisie LOCAL (isolé du dashboard).
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterSlots, setCounterSlots] = useState<string[]>(['']);

  const formatSlot = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const isExternal = scrim.source === 'public';
  const contactEmail =
    scrim.user?.email || scrim.payload?.requester_email || null;
  const contactDiscord =
    scrim.user?.discord || scrim.payload?.requester_discord || null;
  const nego = scrim.scrimNego;
  const negoSlots = nego?.slots ?? [];
  const round = nego?.rounds ?? 1;
  const agreedSlot = nego?.agreedSlot ?? null;
  // The proposer of the *current* slots is the opponent when I am the requester
  // (they countered), and "me" otherwise.
  const proposedByOpponent = !!scrim.iAmRequester;

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-black/30 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">
              {scrim.payload?.from_team_name || t.unknownTeam}
            </span>
            {isExternal && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[10px] uppercase tracking-wide">
                {t.external}
              </span>
            )}
          </div>
          {scrim.user?.display_name && !isExternal && (
            <p className="text-xs text-gray-400 mt-0.5">
              {format(t.captainLabel, { name: scrim.user.display_name })}
            </p>
          )}
          {isExternal && scrim.user?.display_name && (
            <p className="text-xs text-gray-400 mt-0.5">
              {format(t.contactLabel, { name: scrim.user.display_name })}
            </p>
          )}
          {scrim.comment && (
            <p className="text-xs text-gray-300 mt-2 whitespace-pre-line">
              {scrim.comment}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 mt-2">
            {scrim.payload?.preferred_date && (
              <span>
                {t.dateLabel}{' '}
                {new Date(scrim.payload.preferred_date).toLocaleDateString(
                  locale,
                  {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }
                )}
              </span>
            )}
            {scrim.payload?.format && (
              <span>
                {format(t.formatLabel, { format: scrim.payload.format })}
              </span>
            )}
            <span>
              {format(t.receivedOn, {
                date: new Date(scrim.created_at).toLocaleDateString(locale),
              })}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-wide text-gray-300">
              {format(t.round, { n: round })}
            </span>
            <span className="text-gray-400">
              {proposedByOpponent ? t.proposedByOpponent : t.proposedByYou}
            </span>
          </div>
        </div>
      </div>

      {/* Agreed slot (negotiation already concluded) */}
      {agreedSlot && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          {format(t.agreedOn, { date: formatSlot(agreedSlot) })}
        </div>
      )}

      {/* Proposed slots — selectable (accept one) */}
      {!agreedSlot && negoSlots.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
            {t.proposedSlotsLabel}
          </legend>
          {negoSlots.map((slot) => {
            const checked = selectedSlot === slot;
            return (
              <label
                key={slot}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition ${
                  checked
                    ? 'bg-blue-600/30 border-blue-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10'
                }`}
              >
                <input
                  type="radio"
                  name={`scrim-slot-${scrim.id}`}
                  value={slot}
                  checked={checked}
                  onChange={() => setSelectedSlot(slot)}
                  disabled={!onAction}
                  className="accent-blue-500"
                />
                <span>{formatSlot(slot)}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {isExternal && (contactEmail || contactDiscord) && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100 space-y-0.5">
          <p className="uppercase tracking-wide text-[10px] text-amber-300/80">
            {t.contactToReply}
          </p>
          {contactEmail && (
            <p>
              <span className="text-gray-400">{t.emailLabel}</span>{' '}
              <a
                href={`mailto:${contactEmail}`}
                className="underline hover:text-white"
              >
                {contactEmail}
              </a>
            </p>
          )}
          {contactDiscord && (
            <p>
              <span className="text-gray-400">{t.discordLabel}</span>{' '}
              {contactDiscord}
            </p>
          )}
        </div>
      )}

      {/* Inline counter-proposal picker */}
      {counterOpen && (
        <div className="rounded-lg border border-white/10 bg-black/40 p-3">
          <ScrimSlotCalendarPicker
            slots={counterSlots}
            onChange={setCounterSlots}
            accent="blue"
            labels={{
              slotsLabel: t.slotsLabel,
              removeSlot: t.removeSlot,
              maxSlotsHint: t.maxSlotsHint,
              timezoneNote: t.scrimTzNote,
              prevWeek: t.slotPrevWeek,
              nextWeek: t.slotNextWeek,
              weekOf: t.slotWeekOf,
              maxReached: t.slotMaxReached,
              empty: t.slotEmpty,
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onAction?.(scrim.id, 'counter', { slots: counterSlots })
            }
            className="mt-3 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium text-white"
          >
            {t.counterSubmit}
          </button>
        </div>
      )}

      {onAction && (
        <div className="flex flex-wrap gap-2">
          {!agreedSlot && (
            <button
              type="button"
              disabled={busy || !selectedSlot}
              onClick={() =>
                onAction?.(scrim.id, 'accept', {
                  slot: selectedSlot ?? undefined,
                })
              }
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-white"
            >
              {t.acceptSlot}
            </button>
          )}
          {!agreedSlot && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setCounterOpen((open) => !open)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-xs"
            >
              {t.counterCta}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction?.(scrim.id, 'reject')}
            className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-200 hover:bg-red-500/10 disabled:opacity-50 text-xs ml-auto"
          >
            {t.rejectScrim}
          </button>
        </div>
      )}
    </div>
  );
}

const ScrimNegotiationCard = memo(ScrimNegotiationCardImpl);
ScrimNegotiationCard.displayName = 'ScrimNegotiationCard';

export default ScrimNegotiationCard;
