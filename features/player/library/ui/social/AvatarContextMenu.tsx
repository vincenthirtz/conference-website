// features/player/library/ui/social/AvatarContextMenu.tsx — le menu d'un
// avatar de la Women's Library (lot 5 de docs/PLAN-womens-library.md) :
// « Bloquer », « Signaler » et, chez soi seulement, « Expulser ».
// Présentationnel : les gestes arrivent par les props (le parent les branche
// sur `useLibrarySocialActions`), aucune requête ici.
//
// LES ÉTAPES :
//   - `menu`  : `role="menu"`, flèches haut / bas, Début / Fin, Échap ferme,
//               Tab ferme aussi (le focus revient au déclencheur) ;
//   - `block` : confirmation (`alertdialog`) qui DIT ce que fait un blocage —
//               vous ne vous verrez plus, aucune n'entre chez l'autre — et que
//               l'autre n'en est PAS avertie. Le focus va à « Annuler » ;
//   - `kick`  : la durée (30 min par défaut, 1 h, 24 h au plus) ;
//   - `done`  : le geste a abouti (message, « Fermer »).
// Dans une étape, Échap revient au menu ; Tab tourne dans l'étape.
//
// La cible est un avatar VÉRIFIÉ (lot 14a) : son `userId`, le pseudo de son
// jeton de présence, et ce jeton, que chaque geste soumet à l'API — qui le
// revérifie (`presence_invalid`). Sans jeton, aucun geste n'est proposé.
//
// POSITION : sur mobile, une feuille en bas de l'écran ; à partir de `sm`,
// posée à `anchor` (coin haut-gauche, px CSS dans le parent positionné) ou,
// sans ancre, sous son déclencheur. Un appui hors du menu le ferme.

import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { format, useT } from '@/lib/i18n/useT';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';
import type {
  LibraryBlockResponse,
  LibraryKickResponse,
  LibraryRoomKind,
} from '../../socialResponses';
import {
  canKickIn,
  LIBRARY_KICK_CHOICES,
  type SocialActionResult,
  type SocialErrorKey,
} from '../../socialModel';
import {
  FOCUS_RING,
  focusInitial,
  formatUntil,
  SURFACE,
  TEXT_ERROR,
  TEXT_MUTED,
  trapTab,
  useReturnFocus,
} from './shared';

/** Un avatar vérifié : pseudo et jeton viennent de sa présence (lot 14a). */
export type SocialTarget = { userId: string; nickname: string; ticket: string };

type MenuItemId = 'block' | 'report' | 'kick';

type Step =
  | { name: 'menu'; focus: MenuItemId | null }
  | { name: 'block' | 'kick' }
  | { name: 'done'; text: string };

export type AvatarContextMenuProps = {
  target: SocialTarget;
  room: { kind: LibraryRoomKind; isOwner: boolean };
  /** Coin haut-gauche du menu (px CSS, parent positionné) à partir de `sm`. */
  anchor?: { x: number; y: number } | null;
  /** `null` : un blocage est déjà en cours (rien à afficher). */
  onBlock: (
    target: SocialTarget
  ) => Promise<SocialActionResult<LibraryBlockResponse> | null>;
  onKick: (
    target: SocialTarget,
    minutes: number
  ) => Promise<SocialActionResult<LibraryKickResponse> | null>;
  /** Ouvrir le signalement : le parent ferme le menu et monte `ReportDialog`. */
  onReport: (target: SocialTarget) => void;
  onClose: () => void;
  /** Où rendre le focus à la fermeture (canevas, ligne de l'avatar). */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

const ITEM = `flex min-h-11 w-full items-center rounded-[var(--r-ctrl,4px)] px-3 text-left text-sm font-semibold hover:bg-white/5 focus:bg-white/10 ${FOCUS_RING}`;
const ACTION = `inline-flex min-h-11 items-center justify-center rounded-[var(--r-ctrl,4px)] border px-4 text-sm font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${FOCUS_RING}`;
const ACTION_GHOST = `${ACTION} border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)] hover:text-[var(--t1,#f4edf7)]`;
const ACTION_DANGER = `${ACTION} border-[rgba(255,107,107,.45)] text-[var(--err,#ff6b6b)] hover:bg-[rgba(255,107,107,.08)]`;

export default function AvatarContextMenu({
  target,
  room,
  anchor = null,
  onBlock,
  onKick,
  onReport,
  onClose,
  returnFocusRef,
}: AvatarContextMenuProps) {
  const t = useT(nsSocial);
  const { lang } = useLang();
  const ids = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>({ name: 'menu', focus: null });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SocialErrorKey | null>(null);
  const [minutes, setMinutes] = useState(LIBRARY_KICK_CHOICES[0].minutes);
  const nickname = target.nickname;

  useReturnFocus(returnFocusRef);

  // Chaque étape place le focus : l'entrée du menu d'où l'on vient, « Annuler »,
  // la durée cochée, « Fermer ».
  useEffect(() => {
    focusInitial(rootRef.current);
  }, [step]);

  // Un appui hors du menu le ferme (sauf pendant un envoi).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    const onDown = (e: Event) => {
      const root = rootRef.current;
      if (pendingRef.current || !root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        closeRef.current();
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  // Une identité non vérifiée (sans jeton) : aucun geste à proposer.
  const verified = target.ticket.length > 0;
  const items: Array<{ id: MenuItemId; label: string; danger: boolean }> =
    verified
      ? [
          { id: 'block', label: t.menu.block, danger: true },
          { id: 'report', label: t.menu.report, danger: false },
          ...(canKickIn(room)
            ? [{ id: 'kick' as const, label: t.menu.kick, danger: true }]
            : []),
        ]
      : [];

  const backToMenu = (from: MenuItemId) => {
    setError(null);
    setStep({ name: 'menu', focus: from });
  };

  const choose = (id: MenuItemId) => {
    setError(null);
    if (id === 'report') onReport(target);
    else setStep({ name: id });
  };

  const confirmBlock = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await onBlock(target);
    setPending(false);
    if (!result) return;
    if (result.ok) {
      setStep({ name: 'done', text: format(t.menu.blockDone, { nickname }) });
    } else {
      setError(result.code);
    }
  };

  const confirmKick = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await onKick(target, minutes);
    setPending(false);
    if (!result) return;
    if (result.ok) {
      setStep({
        name: 'done',
        text: format(t.menu.kickDone, {
          nickname,
          until: formatUntil(result.data.until, lang),
        }),
      });
    } else {
      setError(result.code);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    const last = buttons.length - 1;
    const next =
      e.key === 'ArrowDown'
        ? index >= last
          ? 0
          : index + 1
        : e.key === 'ArrowUp'
          ? index <= 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    buttons[next]?.focus();
  };

  const onRootKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (pending) return;
      if (step.name === 'block' || step.name === 'kick') backToMenu(step.name);
      else onClose();
      return;
    }
    if (e.key === 'Tab') {
      if (step.name === 'menu') {
        e.preventDefault();
        onClose();
      } else {
        trapTab(e, rootRef.current);
      }
    }
  };

  const position = anchor
    ? 'sm:absolute sm:left-[var(--menu-x)] sm:top-[var(--menu-y)]'
    : 'sm:relative';
  const style = anchor
    ? ({
        '--menu-x': `${Math.round(anchor.x)}px`,
        '--menu-y': `${Math.round(anchor.y)}px`,
      } as CSSProperties)
    : undefined;
  const errorText = error ? t.codes[error] : null;

  // Le conteneur écoute Échap et Tab ; les rôles (menu, dialogue) sont portés
  // par ses enfants, selon l'étape.
  return (
    <div
      ref={rootRef}
      data-library-avatar-menu=""
      data-step={step.name}
      onKeyDown={onRootKey}
      style={style}
      className={`fixed inset-x-2 bottom-2 z-40 p-2 sm:inset-x-auto sm:bottom-auto sm:w-72 ${position} ${SURFACE}`}
    >
      {step.name === 'menu' && (
        <>
          <p
            id={`${ids}-name`}
            className="truncate px-3 pb-1 pt-2 text-sm font-bold"
          >
            {nickname}
          </p>
          <ul
            role="menu"
            aria-label={format(t.menu.label, { nickname })}
            onKeyDown={onMenuKey}
            className="flex flex-col gap-0.5"
          >
            {items.map((item, i) => (
              <li role="none" key={item.id}>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  data-autofocus={
                    (step.focus ? step.focus === item.id : i === 0) || undefined
                  }
                  onClick={() => choose(item.id)}
                  className={`${ITEM} ${item.danger ? 'text-[var(--err,#ff6b6b)]' : ''}`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {step.name === 'block' && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${ids}-block-title`}
          aria-describedby={`${ids}-block-body ${ids}-block-silent`}
          className="flex flex-col gap-3 p-2"
        >
          <h2 id={`${ids}-block-title`} className="text-base font-bold">
            {format(t.menu.blockTitle, { nickname })}
          </h2>
          <p id={`${ids}-block-body`} className={TEXT_MUTED}>
            {t.menu.blockBody}
          </p>
          <p id={`${ids}-block-silent`} className={TEXT_MUTED}>
            {format(t.menu.blockSilent, { nickname })}
          </p>
          {errorText && (
            <p role="alert" className={TEXT_ERROR}>
              {errorText}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              data-autofocus
              aria-disabled={pending || undefined}
              onClick={() => !pending && backToMenu('block')}
              className={ACTION_GHOST}
            >
              {t.menu.cancel}
            </button>
            <button
              type="button"
              aria-disabled={pending || undefined}
              aria-busy={pending}
              onClick={() => void confirmBlock()}
              className={ACTION_DANGER}
            >
              {pending ? t.menu.blockPending : t.menu.blockConfirm}
            </button>
          </div>
        </div>
      )}

      {step.name === 'kick' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${ids}-kick-title`}
          aria-describedby={`${ids}-kick-body`}
          className="flex flex-col gap-3 p-2"
        >
          <h2 id={`${ids}-kick-title`} className="text-base font-bold">
            {format(t.menu.kickTitle, { nickname })}
          </h2>
          <p id={`${ids}-kick-body`} className={TEXT_MUTED}>
            {t.menu.kickBody}
          </p>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold text-[var(--t2,#c7bfca)]">
              {t.menu.kickDuration}
            </legend>
            {LIBRARY_KICK_CHOICES.map((choice) => (
              <label
                key={choice.key}
                className="flex min-h-11 items-center gap-3 rounded-[var(--r-ctrl,4px)] px-2 text-sm hover:bg-white/5"
              >
                <input
                  type="radio"
                  name={`${ids}-kick-minutes`}
                  value={choice.minutes}
                  checked={minutes === choice.minutes}
                  data-autofocus={minutes === choice.minutes || undefined}
                  disabled={pending}
                  onChange={() => setMinutes(choice.minutes)}
                  className="h-4 w-4"
                />
                {t.menu.kickDurations[choice.key]}
              </label>
            ))}
          </fieldset>
          {errorText && (
            <p role="alert" className={TEXT_ERROR}>
              {errorText}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              aria-disabled={pending || undefined}
              onClick={() => !pending && backToMenu('kick')}
              className={ACTION_GHOST}
            >
              {t.menu.cancel}
            </button>
            <button
              type="button"
              aria-disabled={pending || undefined}
              aria-busy={pending}
              onClick={() => void confirmKick()}
              className={ACTION_DANGER}
            >
              {pending ? t.menu.kickPending : t.menu.kickConfirm}
            </button>
          </div>
        </div>
      )}

      {step.name === 'done' && (
        <div className="flex flex-col gap-3 p-2">
          <p role="status" className="text-sm">
            {step.text}
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              className={ACTION_GHOST}
            >
              {t.menu.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
