// components/safety/quickExit.ts
//
// Sortie rapide de la page /securite : logique PURE, testée seule
// (tests/unit/safetyQuickExit.test.tsx).
//
// `location.replace` et pas `location.href = …` : la page courante est
// REMPLACÉE dans l'historique de l'onglet, si bien que le bouton Retour ne
// ramène pas ici. Ce que ça ne fait pas, et que la page dit : effacer
// l'historique de navigation du navigateur.
//
// Destination neutre : une page d'accueil de moteur de recherche, qui
// n'attire pas l'œil sur un écran regardé par-dessus l'épaule.

export const QUICK_EXIT_URL = 'https://www.google.com/';

/** Deux appuis sur Échap à moins de cet écart déclenchent la sortie. */
export const DOUBLE_ESCAPE_WINDOW_MS = 1000;

/** Quitte la page sans laisser d'entrée « retour » vers elle. */
export function quickExit(
  location: Pick<Location, 'replace'> = window.location
): void {
  location.replace(QUICK_EXIT_URL);
}

/**
 * Détecteur de double appui. Rend `true` au second appui arrivé dans la
 * fenêtre, puis repart de zéro (un triple appui ne déclenche pas deux fois).
 */
export function createDoubleEscapeDetector(
  windowMs: number = DOUBLE_ESCAPE_WINDOW_MS
): (now: number) => boolean {
  let last = Number.NEGATIVE_INFINITY;
  return (now: number) => {
    if (now - last <= windowMs) {
      last = Number.NEGATIVE_INFINITY;
      return true;
    }
    last = now;
    return false;
  };
}

/**
 * Échap dans un champ de saisie sert d'abord à ce champ (vider une recherche,
 * fermer une liste) : on ne le compte pas.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') {
    return false;
  }
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}
