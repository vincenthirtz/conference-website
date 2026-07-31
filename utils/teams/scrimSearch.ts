// utils/teams/scrimSearch.ts
//
// Cœur métier des « recherches de scrim » (R5) : une équipe annonce des
// créneaux concrets, l'annonce expire toute seule.
//
// Pourquoi cette table plutôt que le booléen `teams.open_for_scrim` : un
// booléen ne porte ni date ni péremption. Il ne dit pas « jeudi 21 h », et il
// reste vrai pour toujours quand on l'oublie. Le booléen est conservé comme
// DÉRIVÉ (« a au moins une recherche active ») pour ne casser aucune des
// surfaces qui le lisent déjà — c'est `syncOpenForScrimFlag` qui le maintient.
//
// Conventions partagées avec le reste du domaine scrim :
//   - un créneau est une chaîne ISO exacte (cf. utils/teams/scrimNegotiation.ts) ;
//   - la validation des créneaux réutilise `normalizeSlots` (dédup + bornes),
//     avec une limite propre aux recherches (10 vs 5 en négociation : une
//     annonce ratisse plus large qu'une proposition ciblée).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Une annonce peut porter plus de créneaux qu'une proposition ciblée. */
export const MAX_SEARCH_SLOTS = 10;

/** Marge après le dernier créneau avant péremption automatique. */
const EXPIRY_MARGIN_MS = 2 * 60 * 60 * 1000;

export type ScrimSearchStatus = 'active' | 'fulfilled' | 'cancelled';

export type ScrimSearchRow = {
  id: string;
  tenant_id: string;
  team_id: string;
  created_by: string | null;
  slots: string[];
  format: string | null;
  note: string | null;
  status: ScrimSearchStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type NormalizeResult =
  | { ok: true; slots: string[] }
  | { ok: false; error: string };

/**
 * Valide/normalise les créneaux d'une recherche :
 *   - 1..MAX_SEARCH_SLOTS chaînes ISO parsables ;
 *   - dédupliquées sur la forme canonique, ordre chronologique ;
 *   - les créneaux DÉJÀ PASSÉS sont refusés — annoncer une dispo révolue est
 *     la façon la plus simple de polluer l'annuaire.
 */
export function normalizeSearchSlots(
  input: unknown,
  now: Date = new Date()
): NormalizeResult {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'Propose au moins un créneau.' };
  }
  const seen = new Set<string>();
  const slots: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'Créneau invalide.' };
    }
    const d = new Date(raw.trim());
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: `Date invalide : ${raw}` };
    }
    if (d.getTime() <= now.getTime()) {
      return { ok: false, error: 'Un créneau doit être dans le futur.' };
    }
    const iso = d.toISOString();
    if (seen.has(iso)) continue;
    seen.add(iso);
    slots.push(iso);
  }
  if (slots.length === 0) {
    return { ok: false, error: 'Propose au moins un créneau.' };
  }
  if (slots.length > MAX_SEARCH_SLOTS) {
    return {
      ok: false,
      error: `Maximum ${MAX_SEARCH_SLOTS} créneaux par recherche.`,
    };
  }
  slots.sort();
  return { ok: true, slots };
}

/** Péremption par défaut : dernier créneau + 2 h. */
export function defaultExpiryFor(slots: string[]): string {
  const last = slots[slots.length - 1];
  return new Date(new Date(last).getTime() + EXPIRY_MARGIN_MS).toISOString();
}

/** Une recherche est-elle encore vivante ? (statut + péremption) */
export function isSearchLive(
  search: Pick<ScrimSearchRow, 'status' | 'expires_at'>,
  now: Date = new Date()
): boolean {
  if (search.status !== 'active') return false;
  const t = Date.parse(search.expires_at);
  return !Number.isFinite(t) || t > now.getTime();
}

/**
 * Créneaux communs entre deux listes ISO. Comparaison sur la chaîne canonique :
 * deux équipes annoncent des créneaux au même pas de temps (le sélecteur
 * produit des demi-heures rondes), donc l'égalité exacte suffit et évite
 * d'inventer une tolérance arbitraire.
 */
export function overlappingSlots(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((slot) => set.has(slot));
}

/**
 * Recale `teams.open_for_scrim` sur la réalité : true ssi l'équipe a au moins
 * une recherche vivante. Best-effort — un échec ne doit jamais faire échouer
 * l'opération métier appelante (l'annuaire lit les recherches, pas le flag).
 */
export async function syncOpenForScrimFlag(
  tenantId: string,
  teamId: string
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { data, error } = await supabaseAdmin
      .from('scrim_searches')
      .select('id, status, expires_at')
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (error) {
      logger.error('[scrimSearch] sync flag read error', error);
      return;
    }

    const live = ((data || []) as ScrimSearchRow[]).some((s) =>
      isSearchLive(s)
    );

    const { error: updErr } = await supabaseAdmin
      .from('teams')
      .update({ open_for_scrim: live })
      .eq('id', teamId)
      .eq('tenant_id', tenantId);
    if (updErr) logger.error('[scrimSearch] sync flag write error', updErr);
  } catch (err) {
    logger.error('[scrimSearch] sync flag crash', err);
  }
}

/**
 * Passe en `fulfilled` les recherches expirées d'un tenant et recale le
 * booléen des équipes concernées. Appelé paresseusement à la lecture de
 * l'annuaire : pas de cron dédié pour une règle aussi simple, et l'annuaire est
 * précisément l'endroit où une annonce périmée ferait du dégât.
 *
 * Renvoie le nombre de recherches expirées.
 */
export async function expireStaleSearches(tenantId: string): Promise<number> {
  if (!supabaseAdmin) return 0;
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('scrim_searches')
      .update({ status: 'cancelled' })
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .lt('expires_at', nowIso)
      .select('team_id');

    if (error) {
      logger.error('[scrimSearch] expire error', error);
      return 0;
    }

    const teamIds = Array.from(
      new Set(
        ((data || []) as Array<{ team_id: string }>).map((r) => r.team_id)
      )
    );
    for (const teamId of teamIds) {
      await syncOpenForScrimFlag(tenantId, teamId);
    }
    return teamIds.length;
  } catch (err) {
    logger.error('[scrimSearch] expire crash', err);
    return 0;
  }
}
