// utils/supabaseBrowser.ts
//
// Le client Supabase du NAVIGATEUR, et lui seul.
//
// POURQUOI CE FICHIER EXISTE. `utils/supabase.ts` exportait au même endroit le
// client navigateur et trois clients serveur (`supabaseAdmin`,
// `getServerClient`, `supabaseAnonServer`). Or ces derniers sont créés AU
// CHARGEMENT DU MODULE : ce sont des effets de bord, que le tree-shaking ne
// peut pas retirer. Toute page qui importait `supabaseClient` embarquait donc
// aussi `createServerClient`, le paquet `cookie`, un second client Supabase et
// le polyfill `buffer` — dans le bundle servi à chaque visiteuse, sur chaque
// page, y compris anonyme.
//
// Ce module n'importe QUE `createBrowserClient`. Les 24 fichiers qui tournent
// côté client pointent ici ; `utils/supabase.ts` continue de le réexporter pour
// le code serveur, qui n'a aucune raison de changer d'import.
//
// RÈGLE : ne jamais ajouter ici quoi que ce soit qui touche au service role,
// aux cookies serveur ou à `next` — ce fichier part dans le navigateur.

import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Supabase: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant (à définir dans .env.local et l'env CI/Netlify)"
  );
}

/**
 * Client PUBLIC (navigateur) — session gérée par auth-helpers SSR : cookies
 * `sb-*` + localStorage.
 */
export const supabaseClient = createBrowserClient(
  SUPABASE_URL!,
  SUPABASE_ANON_KEY!
);

/**
 * Purge brute-force de toute session Supabase persistée côté navigateur
 * (cookies `sb-*` + entrées localStorage).
 *
 * Filet de sécurité pour le cas « impossible de se connecter, mais ça remarche
 * en changeant de navigateur » : une session locale corrompue ou périmée (refresh
 * token invalide, cookie chunké à moitié écrit) bloque la reconnexion. Ce purge
 * ne fait AUCUN appel réseau et ne dépend pas de l'état interne de supabase-js
 * (qui peut justement être cassé et faire échouer `signOut()` global).
 */
export function purgeSupabaseAuthStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const ls = window.localStorage;
    for (let i = ls.length - 1; i >= 0; i--) {
      const key = ls.key(i);
      if (key && key.startsWith('sb-')) ls.removeItem(key);
    }
  } catch {
    /* localStorage indisponible (mode privé strict) : on ignore */
  }
  try {
    const cookies = document.cookie ? document.cookie.split(';') : [];
    for (const raw of cookies) {
      const name = raw.split('=')[0]?.trim();
      if (name && name.startsWith('sb-')) {
        document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
      }
    }
  } catch {
    /* document.cookie indisponible : on ignore */
  }
}
