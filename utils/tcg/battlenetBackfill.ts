// utils/tcg/battlenetBackfill.ts
//
// Rattrapage de la récompense « compte Battle.net vérifié » pour les comptes
// liés AVANT que la récompense existe.
//
// POURQUOI UN GESTE STAFF. La récompense est créditée au retour de l'OAuth ;
// une joueuse déjà vérifiée ne repasse jamais par là — l'interface ne lui
// propose plus le bouton. Sans rattrapage, les premières à avoir joué le jeu de
// l'anti-smurf seraient les seules à ne rien recevoir. Mais un gain n'est
// jamais l'effet de bord d'un déploiement : on simule, on confirme, on
// distribue, et c'est journalisé.
//
// UN SEUL ÉCRIVAIN. Chaque lien passe par `grantBattlenetVerifiedReward`, celui
// du callback : mêmes index anti-abus (une fois par personne, une fois par
// compte Blizzard, tous tenants confondus), même annonce. Relancer est donc
// sûr — un rejeu crédite zéro.
//
// L'AUDIENCE EST CANTONNÉE À L'ESPACE, et c'est la décision qui compte ici.
// `user_battlenet_links` est GLOBAL, le crédit va dans le tenant du staff, et
// l'index « une fois par personne » est GLOBAL lui aussi. Rattraper tous les
// liens depuis un espace A reviendrait à CONSOMMER, dans A, la récompense
// unique d'une joueuse qui ne joue que dans B — B ne pourrait plus jamais la
// lui verser. On ne rattrape donc que les comptes RATTACHÉS à l'espace, par
// l'un de deux faits propres au tenant :
//   - une ligne de roster (`team_members.tenant_id`), la définition de
//     « participante » de `grantWelcomeGift` et `grantSupporterWelcome` ;
//   - un porte-monnaie TCG (`tcg_wallets.tenant_id`) : elle collectionne déjà
//     dans cet espace (supportrice, drop Twitch), sans être sur un roster.
// Un compte lié sans aucun des deux n'est pas rattrapé d'ici ; il reste compté
// (`outsideSpace`) pour que l'écran ne taise pas qu'il existe.
//
// UNE ERREUR DE LECTURE N'EST PAS UNE ABSENCE. Si un seul lot de l'audience est
// illisible, on n'écrit RIEN et on le dit : distribuer sur une audience
// partielle ne ferait qu'oublier des joueuses — rattrapables à la relance,
// certes, mais l'écran aurait affiché un succès. Le décompte « déjà
// récompensées » de la simulation, lui, n'est qu'un affichage : il ne décide de
// rien, l'écrivain et ses index tranchent.
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS. Aucun paiement, aucun don n'entre
// ici (cf. docs/TCG.md).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  battlenetRewardSourceRef,
  grantBattlenetVerifiedReward,
} from './grantBattlenetVerified';
import { earnReward, getEarnSource } from './earnSources';

/** PostgREST coupe à 1000 lignes (`max_rows`) : on lit par pages explicites. */
const PAGE_SIZE = 1000;
/** Taille des listes `in (...)` : des UUID dans l'URL, gardée courte. */
const CHUNK_SIZE = 100;
/** Écritures en parallèle : assez pour tenir le délai d'une fonction, sans marteler la base. */
const WRITE_CONCURRENCY = 5;

type Link = { userId: string; battleNetId: string };

export type BattlenetBackfillSimulation = {
  /** Comptes liés ET rattachés à l'espace. */
  eligible: number;
  /** Parmi eux, déjà récompensés (quel que soit le tenant ou le compte Blizzard). */
  alreadyRewarded: number;
  /** `eligible - alreadyRewarded` : ce qu'une distribution créditerait. */
  wouldGrant: number;
  /**
   * Parmi `wouldGrant`, comptes reliés à Discord : autant de DM partiront.
   * `null` = non mesurable (lecture en échec), jamais « zéro ».
   */
  discordDms: number | null;
  /** Comptes liés à Battle.net mais rattachés à aucun roster ni porte-monnaie de l'espace. */
  outsideSpace: number;
  /** La source est-elle écrivable (migration déclarée passée) ? */
  ready: boolean;
  reward: { coins: number };
};

export type BattlenetBackfillReport = {
  eligible: number;
  granted: number;
  already: number;
  errors: number;
  reward: { coins: number };
};

type Read<T> = { ok: true; value: T } | { ok: false };

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Tous les liens Battle.net, page par page, dans un ordre stable. */
async function readAllLinks(): Promise<Read<Link[]>> {
  if (!supabaseAdmin) return { ok: false };
  const links: Link[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('user_battlenet_links')
      .select('auth_user_id, battle_net_id')
      .order('auth_user_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      logger.error(
        '[tcg/battlenet-backfill] liens illisibles: %s',
        error.message
      );
      return { ok: false };
    }
    const rows = (data ?? []) as Array<{
      auth_user_id?: string | null;
      battle_net_id?: string | null;
    }>;
    for (const row of rows) {
      if (row.auth_user_id && row.battle_net_id) {
        links.push({
          userId: row.auth_user_id,
          battleNetId: row.battle_net_id,
        });
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return { ok: true, value: links };
}

/** Parmi `userIds`, ceux qui ont une ligne dans `table` pour ce tenant. */
async function readAttached(
  table: 'team_members' | 'tcg_wallets',
  tenantId: string,
  userIds: string[]
): Promise<Read<Set<string>>> {
  if (!supabaseAdmin) return { ok: false };
  const found = new Set<string>();
  for (const batch of chunks(userIds, CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('user_id')
      .eq('tenant_id', tenantId)
      .in('user_id', batch);
    if (error) {
      logger.error(
        '[tcg/battlenet-backfill] %s illisible: %s',
        table,
        error.message
      );
      return { ok: false };
    }
    for (const row of (data ?? []) as Array<{ user_id?: string | null }>) {
      if (row.user_id) found.add(row.user_id);
    }
  }
  return { ok: true, value: found };
}

/**
 * Les liens rattachés à l'espace, et combien ne le sont pas.
 *
 * Exportée pour la route : c'est la SEULE définition de l'audience, partagée
 * par la simulation et la distribution — deux définitions finiraient par
 * annoncer N et en créditer M.
 */
export async function readBattlenetBackfillAudience(
  tenantId: string
): Promise<Read<{ inSpace: Link[]; outsideSpace: number }>> {
  const links = await readAllLinks();
  if (!links.ok) return { ok: false };

  const userIds = [...new Set(links.value.map((l) => l.userId))];
  const [rosters, wallets] = await Promise.all([
    readAttached('team_members', tenantId, userIds),
    readAttached('tcg_wallets', tenantId, userIds),
  ]);
  if (!rosters.ok || !wallets.ok) return { ok: false };

  const inSpace = links.value.filter(
    (l) => rosters.value.has(l.userId) || wallets.value.has(l.userId)
  );
  return {
    ok: true,
    value: { inSpace, outsideSpace: links.value.length - inSpace.length },
  };
}

/**
 * Combien de ces liens sont déjà récompensés — par la personne OU par le compte
 * Blizzard, tous tenants confondus, exactement comme les deux index.
 */
async function countAlreadyRewarded(links: Link[]): Promise<Read<Set<string>>> {
  if (!supabaseAdmin) return { ok: false };
  const rewardedUsers = new Set<string>();
  const rewardedRefs = new Set<string>();
  for (const batch of chunks(links, CHUNK_SIZE)) {
    const [byUser, byRef] = await Promise.all([
      supabaseAdmin
        .from('tcg_wallet_entries')
        .select('user_id')
        .eq('source_kind', 'battlenet_verified')
        .in(
          'user_id',
          batch.map((l) => l.userId)
        ),
      supabaseAdmin
        .from('tcg_wallet_entries')
        .select('source_ref')
        .eq('source_kind', 'battlenet_verified')
        .in(
          'source_ref',
          batch.map((l) => battlenetRewardSourceRef(l.battleNetId))
        ),
    ]);
    const error = byUser.error ?? byRef.error;
    if (error) {
      logger.error(
        '[tcg/battlenet-backfill] registre illisible: %s',
        error.message
      );
      return { ok: false };
    }
    for (const row of (byUser.data ?? []) as Array<{ user_id?: string }>) {
      if (row.user_id) rewardedUsers.add(row.user_id);
    }
    for (const row of (byRef.data ?? []) as Array<{ source_ref?: string }>) {
      if (row.source_ref) rewardedRefs.add(row.source_ref);
    }
  }
  const rewarded = new Set(
    links
      .filter(
        (l) =>
          rewardedUsers.has(l.userId) ||
          rewardedRefs.has(battlenetRewardSourceRef(l.battleNetId))
      )
      .map((l) => l.userId)
  );
  return { ok: true, value: rewarded };
}

/** Comptes reliés à Discord parmi `userIds`, ou `null` si la lecture échoue. */
async function countDiscordLinked(userIds: string[]): Promise<number | null> {
  if (!supabaseAdmin) return null;
  let total = 0;
  for (const batch of chunks(userIds, CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from('user_discord_links')
      .select('auth_user_id')
      .in('auth_user_id', batch);
    if (error) {
      logger.warn(
        '[tcg/battlenet-backfill] liens Discord illisibles: %s',
        error.message
      );
      return null;
    }
    total += new Set(
      ((data ?? []) as Array<{ auth_user_id?: string }>).map(
        (r) => r.auth_user_id
      )
    ).size;
  }
  return total;
}

/** Simulation : rien n'est écrit. `null` = audience illisible. */
export async function simulateBattlenetBackfill(
  tenantId: string
): Promise<BattlenetBackfillSimulation | null> {
  const reward = { coins: earnReward('battlenet_verified').coins };
  const ready = Boolean(getEarnSource('battlenet_verified')?.schemaReady);

  const audience = await readBattlenetBackfillAudience(tenantId);
  if (!audience.ok) return null;
  const { inSpace, outsideSpace } = audience.value;

  const rewarded = await countAlreadyRewarded(inSpace);
  if (!rewarded.ok) return null;

  const pending = inSpace
    .map((l) => l.userId)
    .filter((id) => !rewarded.value.has(id));

  return {
    eligible: inSpace.length,
    alreadyRewarded: inSpace.length - pending.length,
    wouldGrant: pending.length,
    discordDms: pending.length > 0 ? await countDiscordLinked(pending) : 0,
    outsideSpace,
    ready,
    reward,
  };
}

/**
 * Distribution : chaque lien de l'audience passe par l'écrivain. `null` =
 * audience illisible, et alors RIEN n'a été écrit.
 */
export async function runBattlenetBackfill(
  tenantId: string
): Promise<BattlenetBackfillReport | null> {
  const reward = { coins: earnReward('battlenet_verified').coins };
  const audience = await readBattlenetBackfillAudience(tenantId);
  if (!audience.ok) return null;
  const { inSpace } = audience.value;

  const report: BattlenetBackfillReport = {
    eligible: inSpace.length,
    granted: 0,
    already: 0,
    errors: 0,
    reward,
  };

  // Par vagues de `WRITE_CONCURRENCY` : l'écrivain ne lève jamais, chaque issue
  // est comptée. Pas de pré-filtre sur « déjà récompensées » : c'est l'écrivain
  // (et ses index) qui fait foi, une relecture préalable pourrait être périmée.
  for (const wave of chunks(inSpace, WRITE_CONCURRENCY)) {
    const outcomes = await Promise.all(
      wave.map((link) =>
        grantBattlenetVerifiedReward({
          tenantId,
          userId: link.userId,
          battleNetId: link.battleNetId,
        })
      )
    );
    for (const outcome of outcomes) {
      if (outcome.status === 'granted') report.granted += 1;
      else if (outcome.status === 'already') report.already += 1;
      else report.errors += 1;
    }
  }
  return report;
}
