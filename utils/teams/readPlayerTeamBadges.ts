// utils/teams/readPlayerTeamBadges.ts
//
// Équipe « d'affichage » d'une joueuse : celle dont on montre le logo là où
// elle n'a pas de photo de profil (classement, palmarès).
//
// WHY : la plupart des joueuses n'ont pas d'avatar — les listes se retrouvent
// alors remplies d'initiales grises interchangeables. Le logo de leur équipe
// est une identité visuelle qu'elles ont déjà, et il situe la joueuse d'un
// coup d'œil.
//
// Choix de l'équipe, dans l'ordre :
//   1. `team_members` la plus récente — l'équipe où elle joue aujourd'hui ;
//   2. à défaut, la dernière équipe pour laquelle elle a effectivement joué
//      (`match_participants`).
//
// Le repli (2) existe pour les joueuses sans rattachement courant : les fiches
// historiques des éditions passées n'ont aucune ligne `team_members`, et sans
// lui elles resteraient les seules à n'afficher que des initiales.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Équipe affichée à côté d'une joueuse. */
export type PlayerTeamBadge = {
  teamId: string;
  teamName: string | null;
  teamSlug: string | null;
  logoUrl: string | null;
};

/**
 * Résout l'équipe d'affichage d'un lot de joueuses.
 *
 * Best-effort : une erreur DB renvoie une Map vide (les vues retombent alors
 * sur les initiales). Ne contient que les joueuses effectivement rattachées à
 * une équipe.
 */
export async function readPlayerTeamBadges(
  tenantId: string,
  userIds: readonly string[]
): Promise<Map<string, PlayerTeamBadge>> {
  const out = new Map<string, PlayerTeamBadge>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!supabaseAdmin || ids.length === 0) return out;

  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('user_id, created_at, team:team_id ( id, name, slug, logo_url )')
    .eq('tenant_id', tenantId)
    .in('user_id', ids)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[readPlayerTeamBadges] read error', error);
    return out;
  }

  // Tri DESC + premier gagnant : la ligne la plus récente par joueuse.
  for (const row of (data ?? []) as any[]) {
    const userId = row.user_id as string | null;
    if (!userId || out.has(userId)) continue;
    const team = Array.isArray(row.team) ? (row.team[0] ?? null) : row.team;
    if (!team?.id) continue;
    out.set(userId, {
      teamId: team.id,
      teamName: team.name ?? null,
      teamSlug: team.slug ?? null,
      logoUrl: team.logo_url ?? null,
    });
  }

  const missing = ids.filter((id) => !out.has(id));
  if (missing.length > 0) {
    await fillFromPastLineups(tenantId, missing, out);
  }

  return out;
}

/**
 * Repli : dernière équipe pour laquelle la joueuse a réellement joué.
 *
 * `match_participants` est le snapshot immuable des line-ups — il survit à la
 * suppression de la ligne `team_members`, donc c'est la seule source qui
 * rattache encore une joueuse d'une édition passée à son équipe d'alors.
 */
async function fillFromPastLineups(
  tenantId: string,
  userIds: readonly string[],
  out: Map<string, PlayerTeamBadge>
): Promise<void> {
  if (!supabaseAdmin) return;

  const { data, error } = await supabaseAdmin
    .from('match_participants')
    .select('user_id, created_at, team:team_id ( id, name, slug, logo_url )')
    .eq('tenant_id', tenantId)
    .in('user_id', userIds)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[readPlayerTeamBadges] lineup fallback error', error);
    return;
  }

  for (const row of (data ?? []) as any[]) {
    const userId = row.user_id as string | null;
    if (!userId || out.has(userId)) continue;
    const team = Array.isArray(row.team) ? (row.team[0] ?? null) : row.team;
    if (!team?.id) continue;
    out.set(userId, {
      teamId: team.id,
      teamName: team.name ?? null,
      teamSlug: team.slug ?? null,
      logoUrl: team.logo_url ?? null,
    });
  }
}
