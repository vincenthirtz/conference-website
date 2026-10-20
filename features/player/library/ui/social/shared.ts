// features/player/library/ui/social/shared.ts — ce que partagent les
// composants du multijoueur de la Library (lot 5) : le focus (piège au
// clavier, retour à l'ouverture), la date d'une expulsion ou d'un
// bannissement, et quelques classes Tailwind.

import { type RefObject, useEffect } from 'react';
import { formatSiteDate } from '@/utils/timezone';

/* ------------------------------------------------------------ le focus --- */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusablesIn(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

/** Tab et Maj+Tab tournent dans `root` (dialogue, étape de confirmation). */
export function trapTab(
  e: { key: string; shiftKey: boolean; preventDefault(): void },
  root: HTMLElement | null
): void {
  if (e.key !== 'Tab' || !root) return;
  const list = focusablesIn(root);
  if (list.length === 0) {
    e.preventDefault();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && root.contains(active);
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

/** Donne le focus au premier `[data-autofocus]` de `root`, sinon au premier focusable. */
export function focusInitial(root: HTMLElement | null): void {
  if (!root) return;
  const marked = root.querySelector<HTMLElement>('[data-autofocus]');
  (marked ?? focusablesIn(root)[0])?.focus();
}

/**
 * Au démontage, rend le focus à `returnFocusRef` (le canevas, la ligne de
 * l'avatar) ou, à défaut, à ce qui l'avait à l'ouverture. Sans le VOLER : si
 * la joueuse a cliqué ailleurs (un élément encore dans la page a le focus),
 * on le lui laisse.
 */
export function useReturnFocus(
  returnFocusRef?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active !== document.body &&
        active.isConnected
      ) {
        return;
      }
      const target = returnFocusRef?.current ?? opener;
      if (target?.isConnected) target.focus();
    };
  }, [returnFocusRef]);
}

/* ------------------------------------------------------------- la date --- */

const UNTIL_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
};

/** « 20 octobre à 15:30 » / « 20 October at 15:30 », fuseau du site. */
export function formatUntil(iso: string, lang: string): string {
  return formatSiteDate(iso, lang, UNTIL_OPTIONS, iso);
}

/* ---------------------------------------------------------- les styles --- */

export const SURFACE =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] text-[var(--t1,#f4edf7)] shadow-[0_12px_32px_rgba(0,0,0,.45)]';

export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or,#b467d1)]';

export const LINK =
  'font-medium text-[var(--or-300,#dea3f6)] underline underline-offset-4 hover:text-[var(--or-200,#eec4ff)]';

export const TEXT_MUTED = 'text-sm text-[var(--t2,#c7bfca)]';
export const TEXT_ERROR = 'text-sm text-[var(--err,#ff6b6b)]';
