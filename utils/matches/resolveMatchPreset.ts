// utils/matches/resolveMatchPreset.ts
//
// Résolution SERVEUR du preset de partie personnalisée applicable à un match.
// Le choix pur (phase > tournoi > tenant) vit dans utils/customGamePresets.ts ;
// ce module ne fait que l'I/O Supabase autour.
//
// Deux entrées :
//   - `fetchPresetForScope` — quand on connaît déjà tournamentId/stageId/jeu
//     (enrichissement d'events : le match est déjà chargé, on ne le refetche pas).
//   - `resolveMatchPreset` — depuis un matchId seul (endpoint bot).
//
// Best-effort partout : une erreur de lecture renvoie `null`, jamais une
// exception. Un preset absent ne doit jamais casser un event match.* ni un
// thread Discord.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import {
  resolvePreset,
  type CustomGamePresetRow,
  type ResolvedPreset,
} from '../customGamePresets';

export const DEFAULT_GAME = 'overwatch';

const PRESET_SELECT =
  'id, tenant_id, game, tournament_id, stage_id, name, import_code, description, map_pool, enabled, updated_at';

export type PresetScopeTarget = {
  tenantId: string;
  game?: string | null;
  tournamentId?: string | null;
  stageId?: string | null;
};

/**
 * Charge les presets candidats du tenant pour ce jeu et renvoie le plus
 * spécifique applicable. On ne filtre PAS le périmètre en SQL : les trois
 * niveaux (tenant / tournoi / phase) tiennent en une poignée de lignes par
 * tenant, et un `or(...)` PostgREST sur des colonnes nullables est nettement
 * plus fragile que le filtrage en mémoire déjà testé unitairement.
 */
export async function fetchPresetForScope(
  target: PresetScopeTarget
): Promise<ResolvedPreset | null> {
  if (!supabaseAdmin || !target.tenantId) return null;
  const game = target.game || DEFAULT_GAME;

  try {
    const { data, error } = await supabaseAdmin
      .from('custom_game_presets')
      .select(PRESET_SELECT)
      .eq('tenant_id', target.tenantId)
      .eq('game', game)
      .eq('enabled', true);

    if (error) {
      // Table absente (migration pas encore appliquée) ou lecture en échec :
      // on dégrade silencieusement, le reste du payload reste valide.
      return null;
    }

    return resolvePreset((data ?? []) as CustomGamePresetRow[], {
      game,
      tournamentId: target.tournamentId ?? null,
      stageId: target.stageId ?? null,
    });
  } catch {
    return null;
  }
}

export type MatchPresetResult = {
  matchId: string;
  tournamentId: string | null;
  stageId: string | null;
  game: string;
  preset: ResolvedPreset | null;
};

/**
 * Depuis un matchId : lit le match (tournoi/phase), déduit le jeu depuis le
 * tournoi (défaut `overwatch` — les scrims n'ont pas de tournoi), puis résout.
 * Renvoie `null` si le match n'existe pas dans ce tenant.
 */
export async function resolveMatchPreset(
  matchId: string,
  tenantId: string
): Promise<MatchPresetResult | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data: match, error } = await supabaseAdmin
      .from('matches')
      .select('id, tournament_id, stage_id')
      .eq('tenant_id', tenantId)
      .eq('id', matchId)
      .maybeSingle();

    if (error || !match) return null;

    const tournamentId = (match.tournament_id as string | null) ?? null;
    let game = DEFAULT_GAME;

    if (tournamentId) {
      const { data: t } = await supabaseAdmin
        .from('tournaments')
        .select('game')
        .eq('tenant_id', tenantId)
        .eq('id', tournamentId)
        .maybeSingle();
      game =
        ((t?.game as string | null) || DEFAULT_GAME).trim() || DEFAULT_GAME;
    }

    const stageId = (match.stage_id as string | null) ?? null;

    const preset = await fetchPresetForScope({
      tenantId,
      game,
      tournamentId,
      stageId,
    });

    return { matchId, tournamentId, stageId, game, preset };
  } catch (err) {
    logger.error('[resolveMatchPreset] error', err);
    return null;
  }
}
