// lib/analytics/pagePath.ts
//
// Le chemin qu'une pageview envoie au collecteur, sans ce qu'il ne doit pas
// apprendre.
//
// LA WOMEN'S LIBRARY SE MESURE COMME UNE SEULE PAGE (docs/PLAN-womens-library.md,
// lot 8 et section 4 : « La fréquentation de la Grande salle de lecture n'est
// jamais mesurée par personne ») :
//   - `/player/library?room=<uuid>` part en `/player/library`, sans query ni
//     ancre. Sinon l'identifiant de la salle de lecture — le même pour toutes
//     — compterait ses visites, et celui d'un appartement désignerait sa
//     propriétaire ;
//   - une adresse de la Library CITÉE dans la query d'une autre page (le
//     retour après connexion : `/login?next=%2Fplayer%2Flibrary%3Froom%3D…`)
//     est ramenée à `/player/library`.
// Tout autre chemin passe tel quel (utm_*, pages publiques…).
//
// PUR : une chaîne en entrée, une chaîne en sortie (tests/unit/
// analyticsLibraryPath.test.ts).

/** Le préfixe des écrans de la Women's Library. */
export const LIBRARY_PAGE_PATH = '/player/library';

/** Vrai pour `/player/library`, sa query, son ancre ou ses sous-pages. */
export function isLibraryPagePath(value: string): boolean {
  if (!value.startsWith(LIBRARY_PAGE_PATH)) return false;
  const next = value.charAt(LIBRARY_PAGE_PATH.length);
  return next === '' || next === '?' || next === '#' || next === '/';
}

/** Le chemin (pathname + query + ancre) à envoyer pour une pageview. */
export function pageviewPath(path: string): string {
  let url: URL;
  try {
    // Base factice : seul le chemin relatif compte, jamais l'hôte.
    url = new URL(path, 'https://pageview.invalid');
  } catch {
    return path;
  }
  if (isLibraryPagePath(url.pathname)) return LIBRARY_PAGE_PATH;

  let redacted = false;
  for (const [key, value] of [...url.searchParams]) {
    if (isLibraryPagePath(value)) {
      url.searchParams.set(key, LIBRARY_PAGE_PATH);
      redacted = true;
    }
  }
  return redacted ? `${url.pathname}${url.search}${url.hash}` : path;
}
