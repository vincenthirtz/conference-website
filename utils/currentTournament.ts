// utils/currentTournament.ts
// Résolveur du tournoi "en cours" pour le mega-dashboard /admin/tournoi-en-cours.
//
// Ordre de résolution :
//   1. Default UUID (la coupe 2026) si encore actif (status != archived/completed)
//   2. Le plus récent en status='running'
//   3. Le plus récent en status='published' avec start_date dans les 30 derniers jours
//   4. null si aucun candidat

import { supabaseAdmin } from './supabase';

export const DEFAULT_CURRENT_TOURNAMENT_ID =
  'e8fa740c-d92b-49d8-a654-05a37d0eea3b';

export async function resolveCurrentTournamentId(): Promise<string | null> {
  if (!supabaseAdmin) return null;

  // 1. Default UUID si encore actif
  const { data: defaultTournament } = await supabaseAdmin
    .from('tournaments')
    .select('id, status')
    .eq('id', DEFAULT_CURRENT_TOURNAMENT_ID)
    .maybeSingle();

  if (
    defaultTournament &&
    defaultTournament.status !== 'archived' &&
    defaultTournament.status !== 'completed'
  ) {
    return defaultTournament.id;
  }

  // 2. Le plus récent en 'running'
  const { data: running } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('status', 'running')
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (running) return running.id;

  // 3. Le plus récent en 'published' (start_date > now - 30j)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: published } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('status', 'published')
    .gte('start_date', cutoff)
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return published?.id ?? null;
}
