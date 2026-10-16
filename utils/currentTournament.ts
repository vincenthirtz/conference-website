// utils/currentTournament.ts
// Résolveur du tournoi "en cours" pour le mega-dashboard /admin/tournoi-en-cours.
//
// Ordre de résolution :
//   1. Default UUID (la coupe 2026) si encore actif (status != archived/completed)
//   2. Le plus récent en status='running'
//   3. Le plus récent en status='published' avec start_date dans les 30 derniers jours
//   4. null si aucun candidat
//
// S5d : `tenantId` optionnel — limite la résolution à un tenant donné.
// Defaut = `DEFAULT_TENANT_ID` pour ne pas casser les call sites admin
// existants. Sera obligatoire en V2.

import { supabaseAdmin } from './supabase';
import { DEFAULT_TENANT_ID } from './tenant';

export const DEFAULT_CURRENT_TOURNAMENT_ID =
  'e8fa740c-d92b-49d8-a654-05a37d0eea3b';

export async function resolveCurrentTournamentId(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<string | null> {
  return (await resolveCurrentTournament(tenantId)).id;
}

/**
 * La même résolution, plus `reliable: false` quand une des lectures a échoué
 * (elle passe alors à l'étape suivante, comme toujours) : un appelant qui
 * mémorise le résultat ne doit pas garder celui-là.
 */
export async function resolveCurrentTournament(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ id: string | null; reliable: boolean }> {
  if (!supabaseAdmin) return { id: null, reliable: false };

  // 1. Default UUID si encore actif
  const { data: defaultTournament, error: defaultErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, status')
    .eq('id', DEFAULT_CURRENT_TOURNAMENT_ID)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  let reliable = !defaultErr;

  if (
    defaultTournament &&
    defaultTournament.status !== 'archived' &&
    defaultTournament.status !== 'completed'
  ) {
    return { id: defaultTournament.id, reliable };
  }

  // 2. Le plus récent en 'running'
  const { data: running, error: runningErr } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'running')
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (runningErr) reliable = false;

  if (running) return { id: running.id, reliable };

  // 3. Le plus récent en 'published' (start_date > now - 30j)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: published, error: publishedErr } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .gte('start_date', cutoff)
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (publishedErr) reliable = false;

  return { id: published?.id ?? null, reliable };
}
