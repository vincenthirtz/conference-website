// utils/apiScopes.ts
//
// Source de vérité APPLICATIVE des scopes portés par les tokens API publics
// (`tenant_api_tokens.scopes`). Volontairement hors DB (pas de CHECK enum) :
// ajouter un scope ne doit pas coûter une migration.
//
// Format : `resource:action`.
//   - resource ∈ API_RESOURCES (les entités exposées par l'API publique)
//   - action  ∈ API_ACTIONS  ('read' | 'write')
//
// Un token `matches:write` autorise le report de score ; un token `matches:read`
// n'autorise que la lecture (mutations GraphQL rejetées 403 INSUFFICIENT_SCOPE).
// Le middleware d'écriture (Lot 2, `utils/publicWriteApi.ts`) appellera
// `requireScope(token, 'matches:write')`.

/** Entités exposées par l'API publique. Étendre ici (pas de migration). */
export const API_RESOURCES = [
  'tournaments',
  'matches',
  'teams',
  'players',
] as const;

export type ApiResource = (typeof API_RESOURCES)[number];

/** Actions possibles sur une ressource. */
export const API_ACTIONS = ['read', 'write'] as const;

export type ApiAction = (typeof API_ACTIONS)[number];

/** Un scope canonique `resource:action`. */
export type ApiScope = `${ApiResource}:${ApiAction}`;

/** Tous les scopes valides (produit cartésien resource × action). */
export const ALL_SCOPES: readonly ApiScope[] = API_RESOURCES.flatMap(
  (resource) => API_ACTIONS.map((action) => `${resource}:${action}` as ApiScope)
);

const ALL_SCOPES_SET: ReadonlySet<string> = new Set(ALL_SCOPES);

/** Type-guard : la string est-elle un scope connu et bien formé ? */
export function isValidScope(value: unknown): value is ApiScope {
  return typeof value === 'string' && ALL_SCOPES_SET.has(value);
}

/**
 * Normalise + valide une liste de scopes fournie par l'admin à la création
 * d'un token. Trim, dédoublonne, rejette tout scope inconnu.
 *
 * @returns `{ ok: true, scopes }` (dédoublonnés, triés) ou
 *          `{ ok: false, invalid }` listant les scopes non reconnus.
 */
export function parseScopes(
  input: unknown
): { ok: true; scopes: ApiScope[] } | { ok: false; invalid: string[] } {
  if (!Array.isArray(input)) {
    return { ok: false, invalid: ['<not-an-array>'] };
  }
  const seen = new Set<ApiScope>();
  const invalid: string[] = [];
  for (const raw of input) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (isValidScope(s)) {
      seen.add(s);
    } else {
      invalid.push(String(raw));
    }
  }
  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true, scopes: [...seen].sort() };
}

/**
 * Un token possède-t-il le scope requis ? Comparaison exacte : `matches:write`
 * n'implique PAS `matches:read` (on garde le modèle simple et explicite — un
 * client automatisant l'écriture demandera les deux scopes s'il lit aussi).
 */
export function hasScope(
  tokenScopes: readonly string[] | null | undefined,
  required: ApiScope
): boolean {
  if (!tokenScopes || tokenScopes.length === 0) return false;
  return tokenScopes.includes(required);
}
