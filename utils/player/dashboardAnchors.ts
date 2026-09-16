// utils/player/dashboardAnchors.ts
//
// Ancres du tableau de bord joueuse (`/player#…`), et la logique qui les fait
// ATTEINDRE.
//
// Module à part, sans dépendance serveur : il est importé à la fois par
// `pages/api/player/dashboard.ts` (qui fabrique les liens du bandeau « à
// faire ») et par `PlayerDashboardScreen` (qui pose les cibles). Déclarer les
// ids à un seul endroit empêche un lien et sa cible de diverger en silence —
// c'est exactement ce qui était arrivé : `invitation` pointait `/player` (clic
// mort depuis /player) et `scrims` pointait `#scrim-plannings`, la carte des
// grilles de dispo, pas le bloc des scrims qui attendent une réponse.

export const DASHBOARD_ANCHORS = {
  /** Enveloppe d'InvitationsSection. */
  invitations: 'invitations',
  /** Bloc « scrims qui attendent ta réponse », dans la section Scrims. */
  pendingScrims: 'pending-scrims',
} as const;

/** Id du panneau d'une `CategorySection` — `section-scrims` pour `scrims`. */
export function sectionPanelId(sectionId: string): string {
  return `section-${sectionId}`;
}

/**
 * Id visé par un hash d'URL, ou `null`. Tolère l'absence de `#`, un hash vide
 * et l'encodage (`#section%2Dscrims`) ; un encodage invalide ne lève pas.
 */
export function hashTargetId(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Une section repliée doit-elle se déplier pour ce hash ?
 *
 * Une ancre dans un élément `hidden` ne fait PAS défiler : le navigateur n'a
 * aucune boîte vers laquelle aller. Or le pli est mémorisé en localStorage —
 * quelqu'un qui a replié « Scrims » un jour ne pouvait plus jamais être amené
 * jusqu'à ses scrims par un lien. Oui si le hash vise le panneau lui-même, ou
 * un élément qu'il contient (`contains` fourni par l'appelant : le DOM au
 * navigateur, un bouchon en test).
 */
export function shouldExpandForHash(
  hash: string | null | undefined,
  panelId: string,
  contains: (targetId: string) => boolean
): boolean {
  const target = hashTargetId(hash);
  if (!target) return false;
  return target === panelId || contains(target);
}
