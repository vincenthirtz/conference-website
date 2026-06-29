// utils/moderation/blacklist.ts
//
// Feature Blacklist joueurs — Lot 1 (helper de vérification + interception).
// Ref: docs/BLACKLIST_DESIGN.md.
//
// WHY:
//   La table `player_blacklist` (service-role only, cf. migration
//   create_player_blacklist_table.sql) enregistre les joueurs bannis. Aux
//   points d'inscription (compte, équipe, ajout par capitaine) on veut ALERTER
//   les admins quand un joueur banni s'inscrit — SANS bloquer l'inscription
//   (décision produit verrouillée). Ce module fournit :
//     - `checkBlacklist(...)` : matche un input contre les entrées actives du
//       tenant (battle_tag / discord_user_id = FORT, display_name = soft).
//     - `alertIfBlacklisted(...)` : fire-and-forget, émet un seul event outbox
//       `registration.blacklisted` agrégé si match (l'event EST l'alerte + la
//       trace ; pas de logStaffAction côté public, il n'y a pas d'acteur staff).
//
// ROBUSTESSE:
//   Un check ne doit JAMAIS faire échouer une inscription. Toute erreur DB est
//   loggée en warn et dégradée en `{ matched: false, entries: [] }`.

import type { SupabaseClient } from '@supabase/supabase-js';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

export type BlacklistMatchedOn =
  | 'battle_tag'
  | 'display_name'
  | 'discord_user_id';

export type BlacklistMatch = {
  id: string;
  matchedOn: BlacklistMatchedOn;
  strength: 'strong' | 'soft';
  reason: string | null;
};

export type BlacklistInput = {
  battleTag?: string | null;
  displayName?: string | null;
  discordUserId?: string | null;
};

export type BlacklistContext = 'register' | 'team_create' | 'add_member';

/** Normalise un battletag pour comparaison (entrées stockées lowercase). */
function normalizeBattleTag(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalise un display_name (comparaison insensible à la casse). */
function normalizeDisplayName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalise un discord_user_id (égalité exacte sur snowflake). */
function normalizeDiscordUserId(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type BlacklistRow = {
  id: string;
  battle_tag: string | null;
  display_name: string | null;
  discord_user_id: string | null;
  reason: string | null;
};

/**
 * Matche `input` contre les entrées `active` du tenant.
 *
 * - battle_tag : égalité sur valeur lowercase/trim (match FORT).
 * - discord_user_id : égalité exacte (match FORT).
 * - display_name : égalité insensible à la casse (match SOFT).
 *
 * Ne query QUE si au moins un critère est non-vide. Dédupe par id : si une
 * même entrée matche plusieurs critères, on garde le match le plus fort.
 * En cas d'erreur DB : warn + `{ matched: false, entries: [] }`.
 */
export async function checkBlacklist(
  supabaseAdmin: SupabaseClient,
  tenantId: string,
  input: BlacklistInput
): Promise<{ matched: boolean; entries: BlacklistMatch[] }> {
  const battleTag = normalizeBattleTag(input.battleTag);
  const displayName = normalizeDisplayName(input.displayName);
  const discordUserId = normalizeDiscordUserId(input.discordUserId);

  // Aucun critère exploitable → rien à matcher.
  if (!battleTag && !displayName && !discordUserId) {
    return { matched: false, entries: [] };
  }

  if (!tenantId) {
    return { matched: false, entries: [] };
  }

  try {
    // Construit un OR PostgREST sur les seuls critères fournis. Les valeurs
    // sont normalisées (pas d'injection : ce sont des littéraux passés à
    // l'opérateur `.or()`, mais on échappe quand même les caractères PostgREST
    // sensibles via encodage des virgules/parenthèses inexistantes ici car
    // battletag/snowflake/pseudo trimés). On filtre tenant_id + active côté
    // requête, et on raffine le matching en JS pour le display_name (insensible
    // casse exact) afin d'éviter les surprises ilike (wildcards %/_).
    const orClauses: string[] = [];
    if (battleTag) orClauses.push(`battle_tag.eq.${escapeOrValue(battleTag)}`);
    if (discordUserId) {
      orClauses.push(`discord_user_id.eq.${escapeOrValue(discordUserId)}`);
    }
    if (displayName) {
      orClauses.push(`display_name.ilike.${escapeOrValue(displayName)}`);
    }

    const { data, error } = await supabaseAdmin
      .from('player_blacklist')
      .select('id, battle_tag, display_name, discord_user_id, reason')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .or(orClauses.join(','));

    if (error) {
      logger.warn('[blacklist] checkBlacklist query error', error);
      return { matched: false, entries: [] };
    }

    const rows = (data ?? []) as BlacklistRow[];
    const byId = new Map<string, BlacklistMatch>();

    for (const row of rows) {
      // Détermine le match le plus fort pour cette entrée.
      let match: BlacklistMatch | null = null;

      if (battleTag && normalizeBattleTag(row.battle_tag) === battleTag) {
        match = {
          id: row.id,
          matchedOn: 'battle_tag',
          strength: 'strong',
          reason: row.reason ?? null,
        };
      } else if (
        discordUserId &&
        normalizeDiscordUserId(row.discord_user_id) === discordUserId
      ) {
        match = {
          id: row.id,
          matchedOn: 'discord_user_id',
          strength: 'strong',
          reason: row.reason ?? null,
        };
      } else if (
        displayName &&
        row.display_name != null &&
        row.display_name.trim().toLowerCase() === displayName.toLowerCase()
      ) {
        match = {
          id: row.id,
          matchedOn: 'display_name',
          strength: 'soft',
          reason: row.reason ?? null,
        };
      }

      if (!match) continue;

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
    logger.warn('[blacklist] checkBlacklist unexpected error', err);
    return { matched: false, entries: [] };
  }
}

/**
 * Échappe les caractères ayant une signification dans un filtre PostgREST
 * `.or()` (virgule = séparateur de clauses, parenthèses = groupes). On
 * enveloppe la valeur entre doubles quotes si elle contient un de ces
 * caractères, comme attendu par PostgREST.
 */
function escapeOrValue(value: string): string {
  if (/[,()"]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Fire-and-forget : vérifie la blacklist et, sur match, émet UN seul event
 * outbox `registration.blacklisted` agrégé (évite le spam si plusieurs entrées
 * matchent). Le payload reflète le match le plus fort.
 *
 * NE bloque jamais et n'attend pas le push : l'appelant peut `void`-er ce
 * Promise. Toute erreur est avalée en warn.
 */
export async function alertIfBlacklisted(
  supabaseAdmin: SupabaseClient,
  tenantId: string,
  context: BlacklistContext,
  input: BlacklistInput
): Promise<void> {
  try {
    const { matched, entries } = await checkBlacklist(
      supabaseAdmin,
      tenantId,
      input
    );
    if (!matched || entries.length === 0) return;

    // Agrégation : on choisit le match le plus fort comme représentant
    // (strong > soft ; à force égale, le premier rencontré).
    const strongest =
      entries.find((e) => e.strength === 'strong') ?? entries[0];

    const payload: Record<string, unknown> = {
      context,
      matchedOn: strongest.matchedOn,
      strength: strongest.strength,
      reason: strongest.reason,
      matchCount: entries.length,
      matches: entries.map((e) => ({
        id: e.id,
        matchedOn: e.matchedOn,
        strength: e.strength,
        reason: e.reason,
      })),
    };
    if (input.battleTag) payload.battleTag = input.battleTag;
    if (input.displayName) payload.displayName = input.displayName;
    if (input.discordUserId) payload.discordUserId = input.discordUserId;

    void emitBotEvent('registration.blacklisted', payload, tenantId).catch(
      (e) => logger.warn('[blacklist] registration.blacklisted emit error', e)
    );

    // Persistance best-effort dans `blacklist_alerts` (source='registration').
    // NE DOIT JAMAIS faire échouer l'inscription : try/catch englobant, erreur
    // avalée en warn. `matched_on`/`strength` = le match le plus fort
    // (`strongest`), `criteria` = la liste complète des critères matchés. Le
    // `discord_user_id` est obligatoire en table : si l'input n'en fournit pas
    // (cas register/team_create sans Discord lié), on skip l'insert (l'event
    // outbox reste l'alerte) plutôt que d'écrire une row invalide.
    try {
      const discordUserId = normalizeDiscordUserId(input.discordUserId);
      if (discordUserId) {
        const { error: insertError } = await supabaseAdmin
          .from('blacklist_alerts')
          .insert({
            tenant_id: tenantId,
            blacklist_entry_id: strongest.id,
            discord_user_id: discordUserId,
            battle_tag: normalizeBattleTag(input.battleTag),
            display_name: normalizeDisplayName(input.displayName),
            matched_on: strongest.matchedOn,
            strength: strongest.strength,
            criteria: entries.map((e) => ({
              matchedOn: e.matchedOn,
              strength: e.strength,
            })),
            reason: strongest.reason,
            source: 'registration',
            context,
          });
        if (insertError) {
          logger.warn(
            '[blacklist] blacklist_alerts insert error (registration)',
            insertError
          );
        }
      }
    } catch (insertErr) {
      logger.warn(
        '[blacklist] blacklist_alerts insert unexpected error',
        insertErr
      );
    }
  } catch (err) {
    logger.warn('[blacklist] alertIfBlacklisted unexpected error', err);
  }
}
