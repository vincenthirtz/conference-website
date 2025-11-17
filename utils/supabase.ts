// utils/supabase.ts (ou lib/supabase.ts)
import { createClient } from "@supabase/supabase-js";
import {
  createPagesBrowserClient,
  createPagesServerClient,
} from "@supabase/auth-helpers-nextjs";
import type { NextApiRequest, NextApiResponse } from "next";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* -----------------------------------------------------------
 * Sanity checks env
 * ---------------------------------------------------------*/

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Supabase: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant dans .env.local"
  );
}

// ⚠️ On NE log PAS la service role, jamais.
if (!SUPABASE_SERVICE_ROLE) {
  console.warn(
    "Supabase: SUPABASE_SERVICE_ROLE_KEY manquant. supabaseAdmin ne fonctionnera pas (API / SSR)."
  );
}

/* -----------------------------------------------------------
 * 1) Client PUBLIC (client-side)
 *    - Géré par auth-helpers → cookies + localStorage
 * ---------------------------------------------------------*/

export const supabaseClient = createPagesBrowserClient({
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_ANON_KEY,
});

/* -----------------------------------------------------------
 * 2) Client SERVER (SSR / API) basé sur les cookies
 *    - Utilisé dans getServerSideProps & API routes
 *    - C'est celui que tu utilises via getServerClient(req, res)
 * ---------------------------------------------------------*/

export function getServerClient(req: NextApiRequest, res: NextApiResponse) {
  return createPagesServerClient(
    { req, res },
    {
      supabaseUrl: SUPABASE_URL!,
      supabaseKey: SUPABASE_ANON_KEY!,
    }
  );
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
