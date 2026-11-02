// utils/authBackend.ts — quel système de comptes le navigateur utilise.
//
// Lot 7 de docs/AUTH-BETTER-AUTH.md : les écrans passent à Better Auth derrière un interrupteur.
// `NEXT_PUBLIC_AUTH_BACKEND` décide pour tout le monde (Supabase par défaut). `?auth=better-auth`
// ou `?auth=supabase` dans l'adresse décide pour ce navigateur, et S'EN SOUVIENT : une connexion
// traverse plusieurs pages (connexion, retour Discord, espace), qui doivent toutes parler au même
// système. C'est la différence avec `?realtime=` (utils/realtime/rooms.ts).

export type AuthBackend = 'supabase' | 'better-auth';

export const AUTH_BACKEND_STORAGE_KEY = 'owwc-auth-backend';

function normalize(value: string | null | undefined): AuthBackend | null {
  if (value === 'better-auth' || value === 'better') return 'better-auth';
  if (value === 'supabase') return 'supabase';
  return null;
}

/** L'adresse d'abord, puis la mémoire du navigateur, puis la configuration du site. */
export function pickAuthBackend(
  envValue: string | undefined,
  override: string | null,
  stored: string | null
): AuthBackend {
  return (
    normalize(override) ??
    normalize(stored) ??
    (normalize(envValue) === 'better-auth' ? 'better-auth' : 'supabase')
  );
}

/** Dans le navigateur ; côté serveur, la configuration seule. */
export function currentAuthBackend(): AuthBackend {
  const envValue = process.env.NEXT_PUBLIC_AUTH_BACKEND;
  if (typeof window === 'undefined')
    return pickAuthBackend(envValue, null, null);
  const override = new URLSearchParams(window.location.search).get('auth');
  let stored: string | null = null;
  try {
    const chosen = normalize(override);
    if (chosen) window.localStorage.setItem(AUTH_BACKEND_STORAGE_KEY, chosen);
    stored = window.localStorage.getItem(AUTH_BACKEND_STORAGE_KEY);
  } catch {
    // Stockage refusé (navigation privée stricte) : l'adresse et la configuration suffisent.
  }
  return pickAuthBackend(envValue, override, stored);
}
