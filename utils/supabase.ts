// utils/supabase.ts (ou lib/supabase.ts)
import { createClient } from '@supabase/supabase-js';
import {
  createBrowserClient,
  createServerClient,
  type CookieOptions,
} from '@supabase/ssr';
import { serialize } from 'cookie';
import { logger } from './logger';
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from 'next';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE =
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

/* -----------------------------------------------------------
 * Sanity checks env
 * ---------------------------------------------------------*/

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Supabase: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant (à définir dans .env.local et l'env CI/Netlify)"
  );
}

// ⚠️ On NE log PAS la service role, jamais.
if (!SUPABASE_SERVICE_ROLE) {
  logger.warn(
    'Supabase: SUPABASE_SERVICE_ROLE_KEY manquant. supabaseAdmin ne fonctionnera pas (API / SSR).'
  );
}

/* -----------------------------------------------------------
 * 1) Client PUBLIC (client-side)
 *    - Géré par auth-helpers SSR → cookies + localStorage
 * ---------------------------------------------------------*/

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

/* -----------------------------------------------------------
 * 2) Client SERVER (SSR / API) basé sur les cookies
 *    - Utilisé dans getServerSideProps & API routes
 *    - C'est celui que tu utilises via getServerClient(req, res)
 * ---------------------------------------------------------*/

type SupabaseServerReq = NextApiRequest | GetServerSidePropsContext['req'];

type SupabaseServerRes = NextApiResponse | GetServerSidePropsContext['res'];

function appendSetCookie(res: SupabaseServerRes, cookie: string) {
  const existing = res.getHeader('Set-Cookie');

  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
    return;
  }

  res.setHeader('Set-Cookie', [existing.toString(), cookie]);
}

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Enforce security flags on cookies set server-side.
 *
 * Supabase auth cookies (`sb-*`) must remain readable by `document.cookie` so
 * `createBrowserClient` can keep the client session in sync after SSR refreshes;
 * forcing them httpOnly breaks `supabaseClient.auth.getSession()` on the client
 * and turns every admin fetch into a "Session staff introuvable" failure.
 */
function hardenCookieOptions(
  name: string,
  options: CookieOptions
): CookieOptions {
  const isSupabaseAuthCookie = name.startsWith('sb-');
  return {
    ...options,
    httpOnly: isSupabaseAuthCookie ? false : true,
    secure: isProduction,
    sameSite: options.sameSite ?? 'lax',
  };
}

export function getServerClient(
  req: SupabaseServerReq,
  res: SupabaseServerRes
) {
  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return req.cookies?.[name];
      },
      set(name: string, value: string, options: CookieOptions) {
        appendSetCookie(
          res,
          serialize(name, value, hardenCookieOptions(name, options))
        );
      },
      remove(name: string, options: CookieOptions) {
        appendSetCookie(
          res,
          serialize(name, '', {
            ...hardenCookieOptions(name, options),
            maxAge: 0,
          })
        );
      },
    },
  });
}

/* -----------------------------------------------------------
 * 3) Client ADMIN (service role)
 *    - Bypass complet des RLS
 *    - À utiliser UNIQUEMENT côté serveur (API / scripts)
 * ---------------------------------------------------------*/

export const supabaseAdmin = SUPABASE_SERVICE_ROLE
  ? createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null!;

/* -----------------------------------------------------------
 * 4) Client ANON côté serveur (sans persistance de session)
 *    - Clé anon, mais pas de cookies/localStorage (≠ supabaseClient browser
 *      et ≠ getServerClient qui lit la session via cookies).
 *    - Pour des appels auth publics depuis une API route — ex. signUp côté
 *      serveur, qui doit passer par la clé anon et déclencher les emails
 *      Supabase, sans toucher à la session de l'appelant.
 * ---------------------------------------------------------*/

export const supabaseAnonServer = createClient(
  SUPABASE_URL!,
  SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
