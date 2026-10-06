// utils/admin/loginRedirect.ts — page de connexion « qui ramène ici ».
//
// Sur un 401 en cours de navigation (session expirée), `useAdminFetch` et
// `adminRequest` renvoyaient vers `/admin/login` SANS `?next=` : après
// reconnexion, le staff atterrissait sur le tableau de bord au lieu de la page
// qu'il éditait. Le SSR (`withStaffPage`, utils/staff.ts) et le côté joueuse
// (`loginHrefFor`) le faisaient déjà ; ceci aligne les appels côté navigateur.
//
// Module PUR. La page de connexion re-valide `next` (`safeNext`, anti
// open-redirect) : on ne produit de toute façon qu'un chemin interne.

/** Chemins de connexion : y renvoyer créerait une boucle. */
const LOGIN_PATHS = ['/login', '/admin/login'];

function isLoginPath(path: string): boolean {
  const bare = path.split(/[?#]/, 1)[0];
  return LOGIN_PATHS.includes(bare);
}

/**
 * `loginPath` complété de `?next=<chemin courant>` quand c'est sûr. Inchangé
 * si `loginPath` porte déjà une query, si le chemin courant est absent, n'est
 * pas un chemin interne (`//`, `\`) ou est lui-même une page de connexion.
 */
export function loginPathWithNext(
  loginPath: string,
  currentPath: string | null | undefined
): string {
  if (loginPath.includes('?')) return loginPath;
  if (
    typeof currentPath !== 'string' ||
    !currentPath.startsWith('/') ||
    currentPath.startsWith('//') ||
    currentPath.includes('\\') ||
    isLoginPath(currentPath)
  ) {
    return loginPath;
  }
  return `${loginPath}?next=${encodeURIComponent(currentPath)}`;
}
