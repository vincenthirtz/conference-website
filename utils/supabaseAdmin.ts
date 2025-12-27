// lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';

/**
 * Chargement des variables d'environnement
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Client Supabase admin (service_role)
 * - Bypass total RLS
 * - Accès complet aux tables protégées (staff_logs, stages, matches…)
 * - Doit uniquement être utilisé côté serveur (API routes + SSR)
 */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
