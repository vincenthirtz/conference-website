// utils/supabase.ts (ou lib/supabase.ts)
import { createClient } from '@supabase/supabase-js';
import {
  createBrowserClient,
  createServerClient,
  type CookieOptions,
} from '@supabase/ssr';
import { serialize } from 'cookie';
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from 'next';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE = process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

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
  console.warn(
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
        appendSetCookie(res, serialize(name, value, options));
      },
      remove(name: string, options: CookieOptions) {
        appendSetCookie(
          res,
          serialize(name, '', {
            ...options,
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

export const supabaseAdmin =
  SUPABASE_SERVICE_ROLE &&
  createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
