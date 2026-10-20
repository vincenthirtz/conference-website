// features/player/library/ui/chat/ChatActionPanel.tsx — un geste sur un
// message du chat (lot 6 de docs/PLAN-womens-library.md), EN LIGNE sous le
// message : signaler, masquer, mettre en sourdine. Présentationnel : les
// gestes arrivent par `onReport` / `onHide` / `onMute` (l'API décide).
//
//   - signaler : un motif, des précisions facultatives ; le message et les
//     10 précédents sont figés dans le ticket ; au succès, la référence ;
//   - masquer : une confirmation (il disparaît pour toutes) ;
//   - mettre en sourdine : une durée (30 min, 1 h, 24 h).
// Le focus entre dans le panneau à l'ouverture et revient au déclencheur à
// la fermeture ; Échap ferme (sauf pendant l'envoi).

import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsChat from '@/lib/i18n/locales/fr/playerLibraryChat';
import { Button } from '@/features/ruban';
import type {
  LibraryChatHideResponse,
  LibraryChatMuteResponse,
  LibraryChatReportResponse,
} from '../../chat/responses';
import {
  LIBRARY_CHAT_REPORT_DETAILS_MAX,
  LIBRARY_CHAT_REPORT_REASONS,
  type LibraryChatReportInput,
  type LibraryChatReportReason,
} from '../../chat/schemas';
import type { ChatFeedMessage } from '../../realtime/chatState';
import {
  focusInitial,
  TEXT_ERROR,
  TEXT_MUTED,
  useReturnFocus,
} from '../social/shared';
import type { ChatActionKind } from './ChatFeed';
import { chatErrorText } from './ChatComposer';
import { CHAT_MUTE_CHOICES, type ChatError } from './chatModel';
import type { ChatResult } from './useLibraryChat';

type Pending<T> = Promise<ChatResult<T> | null>;

export type ChatActionPanelProps = {
  kind: ChatActionKind;
  message: ChatFeedMessage;
  onReport: (
    input: LibraryChatReportInput
  ) => Pending<LibraryChatReportResponse>;
  onHide: () => Pending<LibraryChatHideResponse>;
  onMute: (minutes: number) => Pending<LibraryChatMuteResponse>;
  /** Le geste a abouti : un mot pour la région de statut de l'écran. */
  onDone: (announce: string) => void;
  onClose: () => void;
  formatUntil: (iso: string) => string;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

const BOX =
  'ml-12 flex flex-col gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-3';
const OPTION =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] px-3 text-sm has-[:checked]:border-[var(--or,#b467d1)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--or,#b467d1)]';

export default function ChatActionPanel(props: ChatActionPanelProps) {
  const { kind, message, onClose, formatUntil, returnFocusRef } = props;
  const t = useT(nsChat);
  const ids = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [reason, setReason] = useState<LibraryChatReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [minutes, setMinutes] = useState(CHAT_MUTE_CHOICES[0].minutes);
  const [reference, setReference] = useState<string | null>(null);

  useReturnFocus(returnFocusRef);
  useEffect(() => {
    focusInitial(boxRef.current);
  }, [reference]);

  const run = async <T,>(action: () => Pending<T>, onOk: (data: T) => void) => {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!result) return;
    if (result.ok) onOk(result.data);
    else setError(result.error);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (kind === 'report') {
      if (!reason) return;
      const trimmed = details.trim();
      void run(
        () =>
          props.onReport({ reason, ...(trimmed ? { details: trimmed } : {}) }),
        (data) => setReference(data.referenceShort)
      );
    } else if (kind === 'hide') {
      void run(props.onHide, () => {
        props.onDone(t.hide.done);
        onClose();
      });
    } else {
      void run(
        () => props.onMute(minutes),
        (data) => {
          props.onDone(
            format(t.mute.done, {
              nickname: message.nickname,
              time: formatUntil(data.until),
            })
          );
          onClose();
        }
      );
    }
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (!pending) onClose();
  };

  const title =
    kind === 'report'
      ? format(t.report.title, { nickname: message.nickname })
      : kind === 'hide'
        ? t.hide.title
        : format(t.mute.title, { nickname: message.nickname });

  if (reference) {
    return (
      <div
        ref={boxRef}
        className={BOX}
        onKeyDown={onKey}
        data-chat-panel="report"
      >
        <div role="status" className="flex flex-col gap-1">
          <p className="font-semibold">{t.report.successTitle}</p>
          <p className={TEXT_MUTED}>
            {format(t.report.reference, { reference })}
          </p>
        </div>
        <div className="flex justify-end">
          <Button size="sm" data-autofocus onClick={onClose}>
            {t.close}
          </Button>
        </div>
      </div>
    );
  }

  const confirmLabel =
    kind === 'report'
      ? pending
        ? t.report.submitting
        : t.report.submit
      : kind === 'hide'
        ? pending
          ? t.hide.pending
          : t.hide.confirm
        : pending
          ? t.mute.pending
          : t.mute.confirm;

  return (
    <div
      ref={boxRef}
      className={BOX}
      onKeyDown={onKey}
      data-chat-panel={kind}
      role="group"
      aria-labelledby={`${ids}-title`}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p id={`${ids}-title`} className="text-sm font-bold">
          {title}
        </p>

        {kind === 'report' && (
          <>
            <p className={TEXT_MUTED}>{t.report.intro}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-[var(--t2,#c7bfca)]">
                {t.report.reasonLegend}
              </legend>
              {LIBRARY_CHAT_REPORT_REASONS.map((key, i) => (
                <label key={key} className={OPTION}>
                  <input
                    type="radio"
                    name={`${ids}-reason`}
                    value={key}
                    checked={reason === key}
                    data-autofocus={i === 0 || undefined}
                    onChange={() => setReason(key)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span>{t.report.reasons[key]}</span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${ids}-details`}
                className="text-sm font-semibold"
              >
                {t.report.detailsLabel}
              </label>
              <textarea
                id={`${ids}-details`}
                value={details}
                rows={3}
                maxLength={LIBRARY_CHAT_REPORT_DETAILS_MAX}
                aria-describedby={`${ids}-counter`}
                onChange={(e) =>
                  setDetails(
                    e.target.value.slice(0, LIBRARY_CHAT_REPORT_DETAILS_MAX)
                  )
                }
                className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s0,#0b060d)] p-2 text-sm text-[var(--t1,#f4edf7)]"
              />
              <p
                id={`${ids}-counter`}
                className="text-xs text-[var(--t3,#a39ba6)]"
              >
                {format(t.report.counter, {
                  count: details.length,
                  max: LIBRARY_CHAT_REPORT_DETAILS_MAX,
                })}
              </p>
            </div>
            <p className={TEXT_MUTED}>{t.report.confidential}</p>
          </>
        )}

        {kind === 'hide' && <p className={TEXT_MUTED}>{t.hide.body}</p>}

        {kind === 'mute' && (
          <fieldset className="flex flex-col gap-2">
            <legend className={`mb-1 ${TEXT_MUTED}`}>{t.mute.body}</legend>
            {CHAT_MUTE_CHOICES.map((choice, i) => (
              <label key={choice.key} className={OPTION}>
                <input
                  type="radio"
                  name={`${ids}-minutes`}
                  value={choice.minutes}
                  checked={minutes === choice.minutes}
                  data-autofocus={i === 0 || undefined}
                  onChange={() => setMinutes(choice.minutes)}
                  className="h-4 w-4 shrink-0"
                />
                <span>{t.mute.durations[choice.key]}</span>
              </label>
            ))}
          </fieldset>
        )}

        {error && (
          <p role="alert" className={TEXT_ERROR}>
            {chatErrorText(t, error, formatUntil)}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            data-autofocus={kind === 'hide' || undefined}
            aria-disabled={pending || undefined}
            onClick={() => !pending && onClose()}
          >
            {t.cancel}
          </Button>
          <Button
            type="submit"
            variant={kind === 'report' ? 'primary' : 'danger'}
            size="sm"
            disabled={kind === 'report' && !reason}
            aria-disabled={pending || undefined}
            aria-busy={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
