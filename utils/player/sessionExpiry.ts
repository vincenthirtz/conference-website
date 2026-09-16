// utils/player/sessionExpiry.ts
//
// « Ta session a expiré » — la sortie du cul-de-sac.
//
// Les écrans de match chargent avec `skipAuthRedirect` (une carte du dashboard
// ne doit pas arracher toute la page vers /login). Revers : un 401 tombait dans
// le même `catch` qu'une panne réseau, et la personne lisait « erreur de
// chargement » + « Réessayer » — un bouton qui échouera toujours. Le soir d'un
// match, c'est une capitaine bloquée devant son check-in.
//
// Deux helpers purs, pour que tous les écrans reconnaissent le même cas et
// renvoient au même endroit.

/**
 * `true` si l'erreur est un refus d'authentification. Duck typing volontaire
 * plutôt qu'un `instanceof AdminFetchError` : importer le hook tirerait le
 * client Supabase navigateur et le routeur dans un module censé rester pur.
 * `useAdminFetch` lève aussi un 401 SANS requête quand la session locale a
 * disparu — même traitement.
 */
export function isSessionExpiredError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { status?: unknown }).status === 401
  );
}

/**
 * Lien de reconnexion qui RAMÈNE sur la page courante.
 *
 * Encodé : un chemin avec `?teamId=` ou `?as=` perdrait sinon ses paramètres
 * (le `&` serait lu comme un paramètre de /login). La page de connexion
 * n'accepte qu'un chemin interne (`safeNext`) : on ne produit que ça.
 */
export function loginHrefFor(path: string | null | undefined): string {
  const safe =
    typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
      ? path
      : '/player';
  return `/login?next=${encodeURIComponent(safe)}`;
}
