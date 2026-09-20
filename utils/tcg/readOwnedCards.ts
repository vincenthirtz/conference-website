// utils/tcg/readOwnedCards.ts
//
// « Qu'est-ce que je possède ? » — les cartes NON recyclées des paquets OUVERTS
// d'une joueuse, lues sans plafond silencieux.
//
// POURQUOI CE MODULE. La collection lisait ses paquets en `.limit(500)` et ses
// cartes en `.limit(5000)`. La seconde borne était illusoire : PostgREST
// plafonne toute réponse à 1000 lignes (`max_rows` Supabase, cf.
// `pages/api/admin/teams/export.ts`), donc au-delà de 200 paquets ouverts la
// collection perdait des cartes SANS LE DIRE — le compteur, la progression et
// les doublons recyclables devenaient faux ensemble. On lit donc par tranches :
//
//   - les paquets par pages de `READ_PAGE` lignes, triés par `id` (un ordre
//     total : sans lui, deux pages successives peuvent se chevaucher) ;
//   - leurs cartes par lots de `PACK_CHUNK` identifiants — cinq cartes par
//     paquet tiennent sous le plafond, et un `in.(…)` de cent UUID reste loin
//     de la longueur d'URL qu'un proxy refuserait.
//
// UN PLAFOND DEMEURE, MAIS IL EST DIT. `MAX_SCAN_PACKS` protège la mémoire de la
// fonction serverless ; l'atteindre rend `truncated: true` et journalise, au
// lieu de rendre une collection amputée qui se prétend complète.
//
// AUCUNE FACE ICI. Ce module ne lit que des lignes de `tcg_pack_cards` —
// sujets, rareté, brillance — jamais `tcg_player_cards`. Les faces restent
// l'affaire de `readCardFaces.ts`, seul porteur du filtre de consentement.

import { supabaseAdmin } from '@/utils/supabase';
import type { TcgCardKind } from './subjectKey';
import type { TcgRarity } from './rarity';

/** Taille d'une page de lecture : le plafond PostgREST. */
export const READ_PAGE = 1000;
/** Identifiants de paquets par requête de cartes. */
export const PACK_CHUNK = 100;
/** Plafond de sécurité : 10 000 paquets ouverts, soit 50 000 cartes. */
export const MAX_SCAN_PACKS = 10_000;

export type OwnedCardRow = {
  pack_id: string;
  position: number;
  subject_kind: TcgCardKind;
  card_user_id: string | null;
  card_team_id: string | null;
  card_map_slug: string | null;
  /**
   * Fan arts et mascottes. ABSENTES DE CETTE LECTURE JUSQU'AU 2026-09-20 :
   * seules trois colonnes sur cinq étaient sélectionnées, donc une carte de
   * fan art ou de mascotte était lue SANS SUJET et sautée par tous les
   * appelants — invisible dans la collection de celle qui venait de l'ouvrir.
   * Rien n'échouait ; la carte n'existait simplement pour personne.
   */
  card_fanart_id?: string | null;
  card_mascot_slug?: string | null;
  rarity: TcgRarity;
  is_foil: boolean;
};

export type ReadResult<T> =
  | { ok: true; value: T; truncated: boolean }
  | { ok: false; error: string };

/**
 * Les identifiants de mes paquets OUVERTS, tous, par pages.
 *
 * Un paquet fermé ne contient encore rien : ses cartes n'existent en base qu'à
 * l'ouverture, et les montrer éventerait le tirage.
 */
export type OwnedReadOptions = {
  /**
   * Écarte les cartes REÇUES PAR ÉCHANGE (paquets `trade`,
   * `tcg_card_trades.sql`). Par défaut elles font partie de la collection —
   * elles sont à la joueuse. Seules les SÉRIES les écartent : une série se
   * récompense une fois par joueuse, et des comptes qui se passeraient une
   * série complète toucheraient chacun la récompense.
   */
  excludeTradedIn?: boolean;
};

export async function readOpenedPackIds(
  tenantId: string,
  userId: string,
  options: OwnedReadOptions = {}
): Promise<ReadResult<string[]>> {
  if (!supabaseAdmin) return { ok: false, error: 'supabaseAdmin absent' };

  const ids: string[] = [];
  for (let from = 0; from < MAX_SCAN_PACKS; from += READ_PAGE) {
    const to = Math.min(from + READ_PAGE, MAX_SCAN_PACKS) - 1;
    let query = supabaseAdmin
      .from('tcg_packs')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .not('opened_at', 'is', null);
    if (options.excludeTradedIn) query = query.neq('source_kind', 'trade');
    const { data, error } = await query
      .order('id', { ascending: true })
      .range(from, to);
    if (error) return { ok: false, error: error.message };

    const page = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    ids.push(...page);
    // Une page incomplète est la dernière : inutile d'en demander une vide.
    if (page.length < to - from + 1)
      return { ok: true, value: ids, truncated: false };
  }

  // Sortie de boucle = plafond atteint avec des pages pleines. On ne sait pas
  // s'il en reste : on le dit plutôt que de le taire.
  return { ok: true, value: ids, truncated: true };
}

/**
 * Les cartes encore possédées de ces paquets, recyclées exclues.
 *
 * La ligne d'une carte recyclée est conservée (elle rend le crédit explicable
 * dans le registre) mais ne fait plus partie de la collection : sans ce filtre,
 * on pourrait vendre une carte ET la garder.
 */
export async function readCardsOfPacks(
  packIds: string[]
): Promise<ReadResult<OwnedCardRow[]>> {
  if (!supabaseAdmin) return { ok: false, error: 'supabaseAdmin absent' };

  const rows: OwnedCardRow[] = [];
  for (let i = 0; i < packIds.length; i += PACK_CHUNK) {
    const chunk = packIds.slice(i, i + PACK_CHUNK);
    // Un lot tient normalement en une page (cinq cartes par paquet) ; la boucle
    // interne n'est qu'un filet pour le jour où un paquet en contiendrait plus.
    for (let from = 0; ; from += READ_PAGE) {
      const { data, error } = await supabaseAdmin
        .from('tcg_pack_cards')
        .select(
          'pack_id, position, subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id, card_mascot_slug, rarity, is_foil'
        )
        .in('pack_id', chunk)
        .is('recycled_at', null)
        // Ordre total `(pack_id, position)` = la clé primaire : indispensable
        // pour que `range` ne chevauche pas deux pages.
        .order('pack_id', { ascending: true })
        .order('position', { ascending: true })
        .range(from, from + READ_PAGE - 1);
      if (error) return { ok: false, error: error.message };

      const page = (data ?? []) as OwnedCardRow[];
      rows.push(...page);
      if (page.length < READ_PAGE) break;
    }
  }
  return { ok: true, value: rows, truncated: false };
}

/** Paquets ouverts puis leurs cartes, en un appel. */
export async function readOwnedCardRows(
  tenantId: string,
  userId: string,
  options: OwnedReadOptions = {}
): Promise<ReadResult<OwnedCardRow[]>> {
  const packs = await readOpenedPackIds(tenantId, userId, options);
  if (!packs.ok) return packs;
  if (packs.value.length === 0)
    return { ok: true, value: [], truncated: false };

  const cards = await readCardsOfPacks(packs.value);
  if (!cards.ok) return cards;
  return { ok: true, value: cards.value, truncated: packs.truncated };
}

/**
 * Parmi ces sujets, lesquels je possède DÉJÀ, hors d'un paquet donné.
 *
 * Sert à la révélation d'un paquet : « nouvelle carte ou doublon ? ». La page
 * le déduisait de la collection qu'elle avait chargée — ce qui cesse d'être
 * vrai dès que la collection est paginée : une carte possédée mais pas encore
 * affichée passerait pour « nouvelle ». La réponse vient donc du serveur, et
 * elle est ciblée : trois requêtes au plus par lot de paquets, filtrées sur les
 * cinq sujets tirés, jamais une relecture de toute la collection.
 *
 * Clés rendues au format de `cardSubjectKey` (`player:<uuid>`, …).
 */
export async function readOwnedSubjectKeys(
  tenantId: string,
  userId: string,
  subjects: {
    players: string[];
    teams: string[];
    maps: string[];
    /** Optionnels : un appelant qui ne s'y intéresse pas ne les passe pas. */
    fanarts?: string[];
    mascots?: string[];
  },
  excludePackId: string
): Promise<ReadResult<Set<string>>> {
  if (!supabaseAdmin) return { ok: false, error: 'supabaseAdmin absent' };

  const packs = await readOpenedPackIds(tenantId, userId);
  if (!packs.ok) return packs;
  const packIds = packs.value.filter((id) => id !== excludePackId);

  const owned = new Set<string>();
  // Une requête PAR type de sujet plutôt qu'un `.or(in.(…))` : trois filtres
  // simples et indexables, et aucune valeur interpolée dans une expression.
  const lookups: Array<{
    kind: TcgCardKind;
    column:
      | 'card_user_id'
      | 'card_team_id'
      | 'card_map_slug'
      | 'card_fanart_id'
      | 'card_mascot_slug';
    ids: string[];
  }> = [
    { kind: 'player', column: 'card_user_id', ids: subjects.players },
    { kind: 'team', column: 'card_team_id', ids: subjects.teams },
    { kind: 'map', column: 'card_map_slug', ids: subjects.maps },
    { kind: 'fanart', column: 'card_fanart_id', ids: subjects.fanarts ?? [] },
    { kind: 'mascot', column: 'card_mascot_slug', ids: subjects.mascots ?? [] },
  ];

  for (let i = 0; i < packIds.length; i += PACK_CHUNK) {
    const chunk = packIds.slice(i, i + PACK_CHUNK);
    const results = await Promise.all(
      lookups
        .filter((l) => l.ids.length > 0)
        .map(async (l) => {
          const { data, error } = await supabaseAdmin!
            .from('tcg_pack_cards')
            .select(l.column)
            .in('pack_id', chunk)
            .in(l.column, l.ids)
            .is('recycled_at', null)
            // Au plus un exemplaire par sujet suffit à répondre « possédée » ;
            // la borne garde la réponse sous le plafond quoi qu'il arrive.
            .limit(READ_PAGE);
          if (error) return { error: error.message };
          for (const row of (data ?? []) as Array<Record<string, unknown>>) {
            const id = row[l.column];
            if (typeof id === 'string') owned.add(`${l.kind}:${id}`);
          }
          return { error: null };
        })
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return { ok: false, error: failed.error };
  }

  return { ok: true, value: owned, truncated: packs.truncated };
}
