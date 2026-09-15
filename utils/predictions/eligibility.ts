// utils/predictions/eligibility.ts
//
// Qui, parmi des personnes données, n'a PAS le droit d'être payé pour un
// pronostic sur ce match. Lu à l'écriture (refus lisible) ET au règlement
// (le roster a pu changer entre-temps : une remplaçante ajoutée la veille).
//
// EXCLUES :
//   - les membres des deux rosters (`team_members`, accepté ou non : un ajout
//     en attente reste une personne liée à l'équipe) et leurs capitaines ;
//   - les personnes sur la feuille de match (`match_participants`) ;
//   - le staff actif, qui saisit et corrige les scores.
//
// UNE ERREUR DE LECTURE N'EST PAS UNE ABSENCE : `{ ok: false }`, jamais un
// ensemble vide qui ferait conclure « personne n'est exclu » et paierait une
// joueuse sur son propre match.

import { supabaseAdmin } from '@/utils/supabase';
import type { PredictionIneligibility, PredictionMatch } from './rules';

export type ExclusionRead =
  | { ok: true; value: Map<string, PredictionIneligibility> }
  | { ok: false; error: string };

/** Taille des listes `in (...)` : des UUID dans l'URL, gardée courte. */
const CHUNK = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    out.push(items.slice(i, i + CHUNK));
  }
  return out;
}

export async function readPredictionExclusions(
  match: Pick<PredictionMatch, 'id' | 'tenant_id' | 'team1_id' | 'team2_id'>,
  userIds: readonly string[]
): Promise<ExclusionRead> {
  const excluded = new Map<string, PredictionIneligibility>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true, value: excluded };
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };

  const teamIds = [match.team1_id, match.team2_id].filter(
    (id): id is string => typeof id === 'string'
  );

  // Capitaines : une seule lecture, indépendante des personnes demandées.
  if (teamIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('captain_id')
      .eq('tenant_id', match.tenant_id)
      .in('id', teamIds);
    if (error) return { ok: false, error: error.message };
    const wanted = new Set(ids);
    for (const row of (data ?? []) as Array<{ captain_id: string | null }>) {
      if (row.captain_id && wanted.has(row.captain_id)) {
        excluded.set(row.captain_id, 'participant');
      }
    }
  }

  for (const part of chunks(ids)) {
    if (teamIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('team_members')
        .select('user_id')
        .eq('tenant_id', match.tenant_id)
        .in('team_id', teamIds)
        .in('user_id', part);
      if (error) return { ok: false, error: error.message };
      for (const row of (data ?? []) as Array<{ user_id: string | null }>) {
        if (row.user_id) excluded.set(row.user_id, 'participant');
      }
    }

    const { data: sheet, error: sheetError } = await supabaseAdmin
      .from('match_participants')
      .select('user_id')
      .eq('tenant_id', match.tenant_id)
      .eq('match_id', match.id)
      .in('user_id', part);
    if (sheetError) return { ok: false, error: sheetError.message };
    for (const row of (sheet ?? []) as Array<{ user_id: string | null }>) {
      if (row.user_id) excluded.set(row.user_id, 'participant');
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from('staff')
      .select('auth_user_id, is_active, deleted_at')
      .in('auth_user_id', part);
    if (staffError) return { ok: false, error: staffError.message };
    for (const row of (staff ?? []) as Array<{
      auth_user_id: string | null;
      is_active: boolean | null;
      deleted_at: string | null;
    }>) {
      // Même lecture que `getStaffByUserId` : un staff désactivé ou supprimé
      // n'a plus aucun droit, donc plus de raison d'être exclu.
      if (!row.auth_user_id || row.is_active === false || row.deleted_at) {
        continue;
      }
      // Participante l'emporte : c'est le motif le plus précis à afficher.
      if (!excluded.has(row.auth_user_id)) {
        excluded.set(row.auth_user_id, 'staff');
      }
    }
  }

  return { ok: true, value: excluded };
}
