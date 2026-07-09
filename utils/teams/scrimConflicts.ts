// utils/teams/scrimConflicts.ts
// Détection de conflit de créneau (double-booking) partagée : un créneau choisi
// pour un scrim ne doit pas chevaucher (± fenêtre) un scrim déjà programmé ni un
// match programmé pour l'une des deux équipes. Extrait de la validation de
// grille (P0) pour être réutilisé à la création / replanification depuis l'agenda.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Fenêtre de détection de conflit autour du créneau (minutes). */
export const CONFLICT_WINDOW_MIN = 120;

export type SlotConflict = {
  type: 'scrim' | 'match';
  id: string;
  name: string | null;
  when: string;
  teamId: string;
};

export type FindScrimConflictsOpts = {
  tenantId: string;
  /** Les 1-2 équipes concernées. */
  teamIds: string[];
  /** Instant visé (ISO). */
  slotIso: string;
  /** Demi-fenêtre en minutes (défaut CONFLICT_WINDOW_MIN). */
  windowMin?: number;
  /** Scrim à exclure (ex. celui qu'on est en train de replanifier). */
  excludeScrimId?: string | null;
};

/**
 * Renvoie les scrims (status 'scheduled') et matches (pending/ongoing) qui
 * chevauchent `slotIso` (± fenêtre) pour l'une des `teamIds`. Liste vide = OK.
 */
export async function findScrimConflicts(
  supabaseAdmin: SupabaseClient,
  opts: FindScrimConflictsOpts
): Promise<SlotConflict[]> {
  const { tenantId, teamIds, slotIso, excludeScrimId } = opts;
  const windowMin = opts.windowMin ?? CONFLICT_WINDOW_MIN;
  const ids = teamIds.filter((t): t is string => !!t);
  if (ids.length === 0) return [];

  const slotMs = new Date(slotIso).getTime();
  if (Number.isNaN(slotMs)) return [];
  const lo = new Date(slotMs - windowMin * 60_000).toISOString();
  const hi = new Date(slotMs + windowMin * 60_000).toISOString();
  const teamOr = ids
    .flatMap((tid) => [`team1_id.eq.${tid}`, `team2_id.eq.${tid}`])
    .join(',');
  const involvedTeam = (t1: unknown, t2: unknown): string =>
    ids.find((t) => t === t1 || t === t2) ?? '';

  const conflicts: SlotConflict[] = [];

  const { data: scrimClashes } = await supabaseAdmin
    .from('scrims')
    .select('id, name, scheduled_date, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'scheduled')
    .is('deleted_at', null)
    .gte('scheduled_date', lo)
    .lte('scheduled_date', hi)
    .or(teamOr);
  for (const s of scrimClashes ?? []) {
    if (excludeScrimId && s.id === excludeScrimId) continue;
    conflicts.push({
      type: 'scrim',
      id: s.id as string,
      name: (s.name as string | null) ?? null,
      when: s.scheduled_date as string,
      teamId: involvedTeam(s.team1_id, s.team2_id),
    });
  }

  const { data: matchClashes } = await supabaseAdmin
    .from('matches')
    .select('id, scheduled_at, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'ongoing'])
    .gte('scheduled_at', lo)
    .lte('scheduled_at', hi)
    .or(teamOr);
  for (const m of matchClashes ?? []) {
    conflicts.push({
      type: 'match',
      id: m.id as string,
      name: null,
      when: m.scheduled_at as string,
      teamId: involvedTeam(m.team1_id, m.team2_id),
    });
  }

  return conflicts;
}
