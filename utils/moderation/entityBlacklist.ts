// utils/moderation/entityBlacklist.ts
//
// Feature Blacklist entités (équipes / structures-assos) — pendant de la
// blacklist joueurs. Ref: docs/BLACKLIST_DESIGN.md (section « Extension :
// blacklist entités »).
//
// WHY:
//   La table `entity_blacklist` (service-role only, RLS default-deny)
//   enregistre les NOMS d'équipes ou de structures bannies. À la création
//   d'équipe on veut ALERTER les admins quand le nom soumis matche une entrée
//   — SANS bloquer la création (même décision produit que la blacklist
//   joueurs). Ce module fournit :
//     - `checkEntityBlacklist(...)` : matche un nom contre les entrées actives
//       du tenant (exact = FORT, inclusion = soft).
//     - `alertIfEntityBlacklisted(...)` : fire-and-forget, émet un seul event
//       outbox `registration.entity_blacklisted` agrégé si match.
//
// MATCHING:
//   Les entrées du tenant sont récupérées en bloc (liste petite, limit 500) et
//   le matching se fait EN JS — pas de `.or()/.ilike()` PostgREST, ce qui
//   évite tout escaping de wildcards/virgules sur des noms libres.
//   Normalisation : trim + lowercase + espaces multiples réduits à un.
//     - égalité exacte → strength 'strong' ;
//     - inclusion dans un sens OU l'autre (nom stocké normalisé d'au moins
//       4 caractères) → 'soft' : une structure bannie « XYZ Org » matche
//       l'équipe « XYZ Org Blue », et inversement.
//
// ROBUSTESSE:
//   Un check ne doit JAMAIS faire échouer une création d'équipe. Toute erreur
//   DB est loggée en warn et dégradée en `{ matched: false, entries: [] }`.

import type { SupabaseClient } from '@supabase/supabase-js';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

export type EntityBlacklistEntityType = 'team' | 'org';

export type EntityBlacklistMatch = {
  id: string;
  entityType: EntityBlacklistEntityType;
  /** Nom tel que stocké dans l'entrée blacklist (non normalisé). */
  matchedName: string;
  strength: 'strong' | 'soft';
  reason: string | null;
};

/** Contexte d'interception. Extensible (org_create, team_rename, ...). */
export type EntityBlacklistContext = 'team_create';

/** Longueur minimale (normalisée) du nom stocké pour un match par inclusion. */
const SOFT_MATCH_MIN_STORED_LENGTH = 4;

/**
 * Normalise un nom d'entité pour comparaison : trim + lowercase + espaces
 * multiples réduits à un seul.
 */
function normalizeEntityName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

type EntityBlacklistRow = {
  id: string;
  entity_type: EntityBlacklistEntityType;
  name: string;
  reason: string | null;
};

/**
 * Matche `name` contre les entrées `active` du tenant.
 *
 * - égalité exacte (après normalisation) → match FORT ;
 * - inclusion dans un sens ou l'autre, avec nom stocké normalisé d'au moins
 *   4 caractères → match SOFT.
 *
 * Ne query QUE si le nom et le tenant sont non-vides. Dédupe par id : si une
 * même entrée matchait plusieurs fois, on garde le match le plus fort.
 * En cas d'erreur DB : warn + `{ matched: false, entries: [] }`.
 */
export async function checkEntityBlacklist(
  supabaseAdmin: SupabaseClient,
  tenantId: string,
  name: string | null | undefined
): Promise<{ matched: boolean; entries: EntityBlacklistMatch[] }> {
  const submitted = normalizeEntityName(name);

  // Aucun nom exploitable → rien à matcher.
  if (!submitted) {
    return { matched: false, entries: [] };
  }

  if (!tenantId) {
    return { matched: false, entries: [] };
  }

  try {
    // Fetch en bloc puis matching en JS : la liste est petite (limit 500) et
    // on évite l'escaping PostgREST (%/_/virgules) sur des noms libres.
    const { data, error } = await supabaseAdmin
      .from('entity_blacklist')
      .select('id, entity_type, name, reason')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .limit(500);

    if (error) {
      logger.warn('[entityBlacklist] checkEntityBlacklist query error', error);
      return { matched: false, entries: [] };
    }

    const rows = (data ?? []) as EntityBlacklistRow[];
    const byId = new Map<string, EntityBlacklistMatch>();

    for (const row of rows) {
      const stored = normalizeEntityName(row.name);
      if (!stored) continue;

      // Détermine la force du match pour cette entrée.
      let strength: 'strong' | 'soft' | null = null;
      if (stored === submitted) {
        strength = 'strong';
      } else if (
        stored.length >= SOFT_MATCH_MIN_STORED_LENGTH &&
        (submitted.includes(stored) || stored.includes(submitted))
      ) {
        // Inclusion dans un sens OU l'autre : une structure bannie « XYZ Org »
        // matche l'équipe « XYZ Org Blue », et inversement.
        strength = 'soft';
      }

      if (!strength) continue;

      const match: EntityBlacklistMatch = {
        id: row.id,
        entityType: row.entity_type,
        matchedName: row.name,
        strength,
        reason: row.reason ?? null,
      };

      // Dédupe par id : on garde le match le plus fort (strong > soft).
      const existing = byId.get(row.id);
      if (
        !existing ||
        (existing.strength === 'soft' && match.strength === 'strong')
      ) {
        byId.set(row.id, match);
      }
    }

    const entries = Array.from(byId.values());
    return { matched: entries.length > 0, entries };
  } catch (err) {
    logger.warn('[entityBlacklist] checkEntityBlacklist unexpected error', err);
    return { matched: false, entries: [] };
  }
}

/**
 * Fire-and-forget : vérifie la blacklist entités et, sur match, émet UN seul
 * event outbox `registration.entity_blacklisted` agrégé (évite le spam si
 * plusieurs entrées matchent). Le payload reflète le match le plus fort.
 *
 * NOTE : contrairement à `alertIfBlacklisted` (joueurs), il n'y a PAS d'insert
 * dans `blacklist_alerts` — cette table est spécifique aux joueurs (colonne
 * `discord_user_id` NOT NULL, une entité n'en a pas). L'event outbox EST
 * l'alerte : il fan-out vers le bot Discord + les notifications staff.
 *
 * NE bloque jamais et n'attend pas le push : l'appelant peut `void`-er ce
 * Promise. Toute erreur est avalée en warn.
 */
export async function alertIfEntityBlacklisted(
  supabaseAdmin: SupabaseClient,
  tenantId: string,
  context: EntityBlacklistContext,
  input: { name: string | null | undefined }
): Promise<void> {
  try {
    const { matched, entries } = await checkEntityBlacklist(
      supabaseAdmin,
      tenantId,
      input.name
    );
    if (!matched || entries.length === 0) return;

    // Agrégation : on choisit le match le plus fort comme représentant
    // (strong > soft ; à force égale, le premier rencontré).
    const strongest =
      entries.find((e) => e.strength === 'strong') ?? entries[0];

    const payload: Record<string, unknown> = {
      context,
      // Nom soumis tel quel (trimé) — le matching normalisé est reflété par
      // matchedName / strength.
      entityName: typeof input.name === 'string' ? input.name.trim() : '',
      matchedOn: 'name',
      entityType: strongest.entityType,
      matchedName: strongest.matchedName,
      strength: strongest.strength,
      reason: strongest.reason,
      matchCount: entries.length,
      matches: entries.map((e) => ({
        id: e.id,
        entityType: e.entityType,
        matchedName: e.matchedName,
        strength: e.strength,
        reason: e.reason,
      })),
    };

    void emitBotEvent(
      'registration.entity_blacklisted',
      payload,
      tenantId
    ).catch((e) =>
      logger.warn(
        '[entityBlacklist] registration.entity_blacklisted emit error',
        e
      )
    );
  } catch (err) {
    logger.warn(
      '[entityBlacklist] alertIfEntityBlacklisted unexpected error',
      err
    );
  }
}
