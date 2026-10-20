// features/player/library/ui/social/ReportDialog.tsx — signaler un avatar de
// la Women's Library (lot 5 de docs/PLAN-womens-library.md). Le signalement
// devient un ticket `behavior` pour la modération (route de l'API) ;
// présentationnel ici : l'envoi arrive par `onSubmit`.
//
//   - quatre motifs, chacun avec une ligne d'aide ; « mineure présumée » dit
//     que l'équipe vérifie et peut bannir ;
//   - des précisions facultatives, bornées par le schéma synchronisé
//     (`LIBRARY_REPORT_DETAILS_MAX`), avec leur compteur ;
//   - la confidentialité : la personne signalée ne sait jamais qui l'a
//     signalée ; un lien vers /securite (nouvel onglet : la salle reste) ;
//   - succès : la référence courte du ticket, à citer à l'équipe ;
//   - refus : le message de son `code` (`report_failed`, 429…).
//
// DIALOGUE MODAL : `role="dialog"`, `aria-modal`, titré ; Tab tourne dedans,
// Échap ferme (sauf pendant l'envoi), le focus revient au déclencheur. Rendu
// dans `document.body` (un parent transformé ne le décale pas). Un clic sur
// le voile ne ferme PAS : des précisions tapées ne se perdent pas d'un geste
// maladroit.

import Link from 'next/link';
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { format, useT } from '@/lib/i18n/useT';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';
import { Button } from '@/features/ruban';
import type { LibraryReportResponse } from '../../socialResponses';
import {
  LIBRARY_REPORT_DETAILS_MAX,
  LIBRARY_REPORT_REASONS,
  type LibraryReportInput,
  type LibraryReportReason,
} from '../../socialSchemas';
import type { SocialActionResult, SocialErrorKey } from '../../socialModel';
import type { SocialTarget } from './AvatarContextMenu';
import {
  focusInitial,
  LINK,
  SURFACE,
  TEXT_ERROR,
  TEXT_MUTED,
  trapTab,
  useReturnFocus,
} from './shared';

export type ReportDialogProps = {
  target: SocialTarget;
  /** La salle où cela s'est passé (contexte du ticket). */
  roomId: string;
  /** `null` : un signalement est déjà en cours. */
  onSubmit: (
    input: LibraryReportInput
  ) => Promise<SocialActionResult<LibraryReportResponse> | null>;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export default function ReportDialog({
  target,
  roomId,
  onSubmit,
  onClose,
  returnFocusRef,
}: ReportDialogProps) {
  const t = useT(nsSocial);
  const r = t.report;
  const ids = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState<LibraryReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SocialErrorKey | null>(null);
  const [done, setDone] = useState<LibraryReportResponse | null>(null);
  const nickname = target.nickname;

  useReturnFocus(returnFocusRef);

  // À l'ouverture : le premier motif ; au succès : « Fermer ».
  useEffect(() => {
    focusInitial(panelRef.current);
  }, [done]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason || pending) return;
    setPending(true);
    setError(null);
    const trimmed = details.trim();
    const result = await onSubmit({
      userId: target.userId,
      roomId,
      // Lot 14a : le jeton de présence vérifié de la cible, que l'API revérifie.
      targetTicket: target.ticket,
      reason,
      ...(trimmed ? { details: trimmed } : {}),
    });
    setPending(false);
    if (!result) return;
    if (result.ok) setDone(result.data);
    else setError(result.code);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!pending) onClose();
      return;
    }
    trapTab(e, panelRef.current);
  };

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 sm:items-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={done ? undefined : `${ids}-intro`}
        data-library-report=""
        onKeyDown={onKey}
        className={`max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto p-5 ${SURFACE}`}
      >
        {done ? (
          <div className="flex flex-col gap-3">
            <div role="status" className="flex flex-col gap-2">
              <h2 id={`${ids}-title`} className="text-lg font-bold">
                {r.successTitle}
              </h2>
              <p className={TEXT_MUTED}>{r.successBody}</p>
              <p className="text-base">
                {format(r.reference, { reference: done.referenceShort })}
              </p>
              <p className={TEXT_MUTED}>{r.referenceHint}</p>
            </div>
            <p className={TEXT_MUTED}>{r.blockHint}</p>
            <div className="flex justify-end">
              <Button size="sm" data-autofocus onClick={onClose}>
                {r.close}
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => void submit(e)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <h2 id={`${ids}-title`} className="text-lg font-bold">
                {format(r.title, { nickname })}
              </h2>
              <p id={`${ids}-intro`} className={TEXT_MUTED}>
                {r.intro}
              </p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-[var(--t2,#c7bfca)]">
                {r.reasonLegend}
              </legend>
              {LIBRARY_REPORT_REASONS.map((key, i) => (
                <label
                  key={key}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] p-3 has-[:checked]:border-[var(--or,#b467d1)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--or,#b467d1)]"
                >
                  <input
                    type="radio"
                    name={`${ids}-reason`}
                    value={key}
                    checked={reason === key}
                    data-autofocus={i === 0 || undefined}
                    aria-describedby={`${ids}-help-${key}`}
                    onChange={() => setReason(key)}
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">
                      {r.reasons[key].label}
                    </span>
                    <span
                      id={`${ids}-help-${key}`}
                      className="text-xs text-[var(--t3,#a39ba6)]"
                    >
                      {r.reasons[key].help}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${ids}-details`}
                className="text-sm font-semibold text-[var(--t2,#c7bfca)]"
              >
                {r.detailsLabel}
              </label>
              <textarea
                id={`${ids}-details`}
                value={details}
                maxLength={LIBRARY_REPORT_DETAILS_MAX}
                rows={4}
                aria-describedby={`${ids}-details-hint ${ids}-counter`}
                onChange={(e) =>
                  setDetails(
                    e.target.value.slice(0, LIBRARY_REPORT_DETAILS_MAX)
                  )
                }
                className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-3 text-sm text-[var(--t1,#f4edf7)]"
              />
              <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--t3,#a39ba6)]">
                <p id={`${ids}-details-hint`}>{r.detailsHint}</p>
                <p id={`${ids}-counter`}>
                  {format(r.counter, {
                    count: details.length,
                    max: LIBRARY_REPORT_DETAILS_MAX,
                  })}
                </p>
              </div>
            </div>

            <p className={TEXT_MUTED}>
              {r.confidential}{' '}
              <Link
                prefetch={false}
                href="/securite"
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                {r.safetyLink}
                <span className="sr-only"> {r.newTab}</span>
              </Link>
            </p>

            {error && (
              <p role="alert" className={TEXT_ERROR}>
                {t.codes[error]}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                aria-disabled={pending || undefined}
                onClick={() => !pending && onClose()}
              >
                {r.cancel}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!reason}
                aria-disabled={pending || undefined}
                aria-busy={pending}
              >
                {pending ? r.submitting : r.submit}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return typeof document === 'undefined'
    ? dialog
    : createPortal(dialog, document.body);
}
