// utils/auth/oauthError.ts
//
// Lire l'échec d'un retour OAuth.
//
// Quand `linkIdentity()` échoue, Supabase ne renvoie pas d'exception : il
// REDIRIGE vers l'URL de retour en y accrochant `error`, `error_code` et
// `error_description`. Une page de retour qui ne regarde que `code` ne voit
// donc rien — la session précédente est toujours valide, tout paraît normal,
// et l'utilisateur atterrit sur un écran qui affiche encore « non lié » sans
// la moindre explication. C'est ce qui est arrivé à un coach dont le compte
// Discord était déjà rattaché à un autre compte du site.
//
// Deux emplacements à couvrir, selon le flow retenu par le client Supabase :
//   - flow PKCE → paramètres de REQUÊTE (`?error=…`) ;
//   - flow implicite → FRAGMENT (`#error=…`), qui n'atteint jamais le serveur.
//
// Module PUR, testé unitairement (tests/unit/oauthError.test.ts).

export type OAuthErrorInfo = {
  /** `error_code` s'il est fourni, sinon `error`. Ex. `identity_already_exists`. */
  code: string;
  /** Message lisible renvoyé par le fournisseur, déjà décodé. */
  description: string | null;
};

/** Query Next.js : une valeur peut arriver en tableau si le paramètre est répété. */
type QueryLike = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' && value ? value : null;
}

/**
 * Extrait l'erreur portée par la query d'un retour OAuth, ou `null` s'il n'y
 * en a pas.
 */
export function readOAuthErrorFromQuery(
  query: QueryLike | null | undefined
): OAuthErrorInfo | null {
  if (!query) return null;
  const error = firstValue(query.error);
  const errorCode = firstValue(query.error_code);
  if (!error && !errorCode) return null;
  return {
    code: errorCode || error || 'unknown',
    description: firstValue(query.error_description),
  };
}

/**
 * Même lecture, à partir du fragment (`window.location.hash`). Le `#` de tête
 * est optionnel ; une chaîne vide ou sans erreur renvoie `null`.
 */
export function readOAuthErrorFromHash(
  hash: string | null | undefined
): OAuthErrorInfo | null {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return null;
  }

  const error = params.get('error');
  const errorCode = params.get('error_code');
  if (!error && !errorCode) return null;
  return {
    code: errorCode || error || 'unknown',
    description: params.get('error_description'),
  };
}

/** La query d'abord (flow PKCE, le nôtre), le fragment en repli. */
export function readOAuthError(
  query: QueryLike | null | undefined,
  hash: string | null | undefined
): OAuthErrorInfo | null {
  return readOAuthErrorFromQuery(query) ?? readOAuthErrorFromHash(hash);
}

/**
 * Le seul échec qu'on sache expliquer précisément à l'utilisateur : ce compte
 * Discord est déjà rattaché à un AUTRE compte du site. Supabase le renvoie sous
 * plusieurs libellés selon la version — d'où la reconnaissance sur le code ET
 * sur le texte.
 */
export function isIdentityAlreadyLinked(
  info: OAuthErrorInfo | null | undefined
): boolean {
  if (!info) return false;
  const haystack = `${info.code} ${info.description ?? ''}`.toLowerCase();
  return (
    haystack.includes('identity_already_exists') ||
    haystack.includes('identity is already linked') ||
    haystack.includes('already linked to another user')
  );
}
