// components/safety/SafetyQuickExit.tsx
//
// Bouton « Quitter vite », fixé en haut à droite sous l'en-tête, et raccourci
// Échap ×2. Un LIEN vers la page neutre, pas un bouton : sans JavaScript il
// quitte quand même la page ; avec, le clic passe par `location.replace` pour
// que Retour ne ramène pas ici (cf. ./quickExit).
//
// Haut de l'écran plutôt que bas : le bas porte déjà le bouton « retour en
// haut », les toasts et, en production, l'invitation à installer l'appli.

import { useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import {
  QUICK_EXIT_URL,
  createDoubleEscapeDetector,
  isEditableTarget,
  quickExit,
} from './quickExit';

type Props = {
  /** Injecté par les tests ; par défaut, `location.replace`. */
  onExit?: () => void;
};

export default function SafetyQuickExit({ onExit }: Props) {
  const t = useT(nsSafetyPage);
  const exit = onExit ?? quickExit;
  // Dernière sortie connue, lue par l'écouteur clavier posé une seule fois.
  const exitRef = useRef(exit);
  useEffect(() => {
    exitRef.current = exit;
  });

  useEffect(() => {
    const isDouble = createDoubleEscapeDetector();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat || e.isComposing) return;
      if (isEditableTarget(e.target)) return;
      if (isDouble(Date.now())) exitRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="fixed right-3 top-[calc(var(--app-header-h)+0.75rem)] z-[110] flex flex-col items-end gap-1 sm:right-6 print:hidden">
      <a
        href={QUICK_EXIT_URL}
        rel="noreferrer"
        aria-label={t.quickExitAria}
        onClick={(e) => {
          e.preventDefault();
          exit();
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-neutral-950 bg-[var(--color-yellow)] px-4 py-2 text-sm font-bold text-neutral-950 shadow-lg shadow-black/40 transition hover:bg-[var(--color-yellow-light)] focus:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H2.25"
          />
        </svg>
        {t.quickExitButton}
      </a>
      <span
        aria-hidden="true"
        className="hidden rounded-md bg-neutral-950/90 px-2 py-0.5 text-xs font-medium text-gray-200 sm:inline"
      >
        {t.quickExitKeyHint}
      </span>
    </div>
  );
}
