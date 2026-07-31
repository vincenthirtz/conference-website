// utils/teams/teamRhythmStore.ts
//
// Accès base pour le rythme d'équipe (N1). Séparé de `teamRhythm.ts` pour que
// le cœur (grille, heatmap, noyau, projection) reste PUR et testable sans base —
// même découpage que `reliability.ts` (calcul pur + chargeur groupé).
//
// Une seule requête pour tout le tenant : les rythmes sont quelques dizaines de
// lignes, et l'annuaire a besoin du noyau de CHAQUE équipe pour scorer. Charger
// équipe par équipe ferait N requêtes pour un gain nul.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  buildRhythmHeatmap,
  coreRhythmSlots,
  normalizeRhythmSlots,
  rhythmCoreThreshold,
  type RhythmMemberInput,
} from '@/utils/teams/teamRhythm';

type AvailabilityRow = {
  team_id: string;
  user_id: string;
  timezone: string | null;
  slots: unknown;
};

/**
 * Noyau de créneaux récurrents de chaque équipe du tenant, exprimé dans
 * `referenceTimezone` (celui de la personne qui regarde — sinon comparer des
 * créneaux entre fuseaux différents produirait des recoupements fantômes).
 *
 * `memberCountByTeam` sert à fixer le seuil de noyau par équipe : une équipe de
 * 3 exige 3 disponibles, une équipe de 6 en exige 5 (l'effectif titulaire).
 *
 * Ne throw jamais : une erreur de lecture renvoie une map vide, et le score
 * retombe simplement sur ses autres facteurs.
 */
export async function loadTeamRhythmCores(
  tenantId: string,
  referenceTimezone: string,
  memberCountByTeam: Map<string, number>
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!supabaseAdmin) return out;

  try {
    const { data, error } = await supabaseAdmin
      .from('team_availability')
      .select('team_id, user_id, timezone, slots')
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error('[teamRhythmStore] read error', error);
      return out;
    }

    const byTeam = new Map<string, RhythmMemberInput[]>();
    for (const row of (data || []) as AvailabilityRow[]) {
      const normalized = normalizeRhythmSlots(row.slots);
      if (!normalized.ok || normalized.slots.length === 0) continue;
      const list = byTeam.get(row.team_id) ?? [];
      list.push({
        userId: row.user_id,
        timezone: row.timezone || 'Europe/Paris',
        slots: normalized.slots,
      });
      byTeam.set(row.team_id, list);
    }

    for (const [teamId, inputs] of byTeam) {
      const heatmap = buildRhythmHeatmap(inputs, referenceTimezone);
      const threshold = rhythmCoreThreshold(
        memberCountByTeam.get(teamId) ?? inputs.length
      );
      out.set(teamId, coreRhythmSlots(heatmap, threshold));
    }
    return out;
  } catch (err) {
    logger.error('[teamRhythmStore] crash', err);
    return out;
  }
}

/**
 * Fuseau déclaré par un utilisateur (celui de sa propre ligne de rythme).
 * `null` s'il n'a rien déclaré — l'appelant décide du repli.
 */
export async function loadMyRhythmTimezone(
  tenantId: string,
  userId: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('team_availability')
      .select('timezone')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      logger.error('[teamRhythmStore] timezone read error', error);
      return null;
    }
    return (data as { timezone?: string | null } | null)?.timezone ?? null;
  } catch {
    return null;
  }
}
