// utils/tcg/trades.ts
//
// Le cœur SERVEUR des échanges de cartes : lectures, expiration, annonces bot,
// mise en forme des propositions. Les ÉCRITURES qui déplacent des cartes ne
// vivent pas ici : elles sont dans les fonctions SQL `tcg_propose_trade` et
// `tcg_accept_trade` (migration `tcg_card_trades.sql`), seules capables d'une
// vraie transaction. Ce module ne fait que des transitions d'une seule ligne
// (refus, annulation, expiration), atomiques par leur `WHERE status = 'pending'`.
//
// AUCUNE IMAGE N'EST STOCKÉE NI TRANSPORTÉE. Chaque carte affichée — offerte,
// demandée, montrée en double — relit sa face par `readCardFaces`, seul porteur
// du filtre de consentement : une photo retirée disparaît aussi des
// propositions, et des cartes reçues par échange.
//
// LES ANNONCES NE LÈVENT JAMAIS. La transition est déjà écrite quand on
// annonce ; un DM raté ne doit pas transformer un échange réussi en erreur.
// Et elles ne partent QUE sur une transition réelle : une écriture
// conditionnelle (`status = 'pending'`) qui ne rend aucune ligne est un rejeu.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { emitBotEvent } from '@/utils/botEvents';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import { maskBattleTag } from '@/utils/battleTag';
import {
  readPlayerFaces,
  readTeamFaces,
  readFanartFaces,
} from './readCardFaces';
import { gameMascotDisplayName } from './gameMascots';
import type { LogoCredit } from '@/utils/teams/logoCredit';
import { readMapFaces } from './readMapFaces';
import {
  MAX_SCAN_PACKS,
  READ_PAGE,
  readCardsOfPacks,
  type OwnedCardRow,
  type ReadResult,
} from './readOwnedCards';
import { cardSubjectKey } from './subjectKey';
import { RARITY_ORDER, type TcgRarity } from './rarity';
import {
  TRADE_MIN_ACCOUNT_AGE_DAYS,
  TRADE_MIN_COLLECTION_AGE_DAYS,
  isTradeablePackSource,
  type TradeOutcome,
  type TradeResolutionReason,
  type TradeStatus,
} from './tradeRules';

/** La page des échanges : cible de tous les liens d'annonce. */
export const TRADES_PAGE_PATH = '/player/tcg/echanges';

/* -------------------------------------------------------------------------- */
/* Préférence et éligibilité                                                   */
/* -------------------------------------------------------------------------- */

/**
 * « Accepte-t-elle des propositions ? » — pas de ligne = NON (opt-in).
 *
 * Une lecture en échec rend `ok: false`, JAMAIS `false` : prendre une erreur
 * pour « désactivé » ferait annuler à tort des propositions à l'appelant qui
 * s'en servirait pour décider (cf. `docs` : erreur de lecture ≠ valeur absente).
 */
export async function readTradeSettings(
  tenantId: string,
  userId: string
): Promise<{ ok: true; acceptsProposals: boolean } | { ok: false }> {
  if (!supabaseAdmin) return { ok: false };
  const { data, error } = await supabaseAdmin
    .from('tcg_trade_settings')
    .select('accepts_proposals')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.error('[tcg/trades] préférence illisible: %s', error.message);
    return { ok: false };
  }
  return {
    ok: true,
    acceptsProposals:
      (data as { accepts_proposals?: unknown } | null)?.accepts_proposals ===
      true,
  };
}

export type TradeEligibility = {
  eligible: boolean;
  /** Date à partir de laquelle les échanges s'ouvrent ; `null` sans collection. */
  eligibleAt: string | null;
  reason: 'no_account' | 'no_collection' | 'too_recent' | null;
};

/**
 * Ancienneté du compte ET de la collection, calculée par la base
 * (`tcg_trade_eligibility`) : elle seule lit `auth.users.created_at`, et la
 * fonction d'échange revérifie avec les mêmes paramètres.
 */
export async function readTradeEligibility(
  tenantId: string,
  userId: string
): Promise<({ ok: true } & TradeEligibility) | { ok: false }> {
  if (!supabaseAdmin) return { ok: false };
  const { data, error } = await supabaseAdmin.rpc('tcg_trade_eligibility', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_min_account_age_days: TRADE_MIN_ACCOUNT_AGE_DAYS,
    p_min_collection_age_days: TRADE_MIN_COLLECTION_AGE_DAYS,
  });
  if (error || !data || typeof data !== 'object') {
    logger.error(
      '[tcg/trades] éligibilité illisible: %s',
      (error as { message?: string } | null)?.message ?? 'réponse vide'
    );
    return { ok: false };
  }
  const row = data as Record<string, unknown>;
  const reason = row.reason;
  return {
    ok: true,
    eligible: row.eligible === true,
    eligibleAt: typeof row.eligibleAt === 'string' ? row.eligibleAt : null,
    reason:
      reason === 'no_account' ||
      reason === 'no_collection' ||
      reason === 'too_recent'
        ? reason
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Noms des collectionneuses                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Le pseudo à afficher pour ces comptes — JAMAIS un email ni un nom complet.
 *
 * Les identifiants reçus sont DÉJÀ bornés au tenant par l'appelant (lignes de
 * `tcg_trade_settings` ou de `tcg_trades` de cet espace) : on ne cherche
 * personne ici, on nomme des comptes connus. La RPC de profils rend aussi
 * l'email ; il est lu et jeté, jamais recopié.
 *
 * Repli : pseudo du compte, puis BattleTag MASQUÉ (sans discriminant, comme
 * `readCardFaces`), puis le nom de classement de l'espace. `null` = personne
 * ne sait la nommer — l'appelant décide (la liste des partenaires l'écarte,
 * une annonce part sans nom).
 */
export async function readCollectorNames(
  tenantId: string,
  userIds: readonly string[]
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  const ids = [...new Set(userIds)];
  if (!supabaseAdmin || ids.length === 0) return names;

  const profiles = await fetchAdminUserProfiles(ids);
  const missing: string[] = [];
  for (const id of ids) {
    const p = profiles.get(id);
    const name =
      (p?.display_name && p.display_name.trim()) ||
      maskBattleTag(p?.battle_tag ?? null) ||
      null;
    names.set(id, name);
    if (!name) missing.push(id);
  }

  if (missing.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('player_ratings')
      .select('user_id, display_name, battle_tag')
      .eq('tenant_id', tenantId)
      .in('user_id', missing);
    if (error) {
      logger.warn(
        '[tcg/trades] noms de classement illisibles: %s',
        error.message
      );
    }
    for (const row of (data ?? []) as Array<{
      user_id: string;
      display_name: string | null;
      battle_tag: string | null;
    }>) {
      const name = row.display_name ?? maskBattleTag(row.battle_tag) ?? null;
      if (name) names.set(row.user_id, name);
    }
  }
  return names;
}

/* -------------------------------------------------------------------------- */
/* Exemplaires possédés, avec leur échangeabilité                              */
/* -------------------------------------------------------------------------- */

export type OwnedCopy = OwnedCardRow & { tradeable: boolean };

/**
 * Les cartes possédées d'une joueuse, chacune marquée échangeable ou non selon
 * l'origine de son paquet (`TRADEABLE_PACK_SOURCES`).
 *
 * Même lecture que `readOwnedCards` (paquets ouverts par pages, cartes non
 * recyclées par lots), à une colonne près : `readOpenedPackIds` ne rend que les
 * identifiants, et l'échangeabilité dépend de `source_kind`. On ne touche pas à
 * ce module partagé — trois autres lecteurs s'y fient.
 */
export async function readOwnedCopies(
  tenantId: string,
  userId: string
): Promise<ReadResult<OwnedCopy[]>> {
  if (!supabaseAdmin) return { ok: false, error: 'supabaseAdmin absent' };

  const sourceByPack = new Map<string, string>();
  let truncated = true;
  for (let from = 0; from < MAX_SCAN_PACKS; from += READ_PAGE) {
    const to = Math.min(from + READ_PAGE, MAX_SCAN_PACKS) - 1;
    const { data, error } = await supabaseAdmin
      .from('tcg_packs')
      .select('id, source_kind')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .not('opened_at', 'is', null)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) return { ok: false, error: error.message };
    const page = (data ?? []) as Array<{ id: string; source_kind: string }>;
    for (const p of page) sourceByPack.set(p.id, p.source_kind);
    if (page.length < to - from + 1) {
      truncated = false;
      break;
    }
  }
  if (sourceByPack.size === 0) return { ok: true, value: [], truncated: false };

  const cards = await readCardsOfPacks([...sourceByPack.keys()]);
  if (!cards.ok) return cards;
  return {
    ok: true,
    value: cards.value.map((c) => ({
      ...c,
      tradeable: isTradeablePackSource(sourceByPack.get(c.pack_id)),
    })),
    truncated,
  };
}

export type CopySummary = {
  kind: 'player' | 'team' | 'map' | 'fanart' | 'mascot';
  key: string;
  subjectId: string;
  copies: number;
  tradeableCopies: number;
  /** Meilleure rareté possédée, tous exemplaires confondus. */
  bestRarity: TcgRarity;
  /**
   * L'exemplaire ÉCHANGEABLE le moins précieux — celui qui partirait — ou
   * `null` s'il n'y en a aucun. Même règle que la fonction SQL.
   */
  worstTradeable: { rarity: TcgRarity; foil: boolean } | null;
};

const rank = (r: TcgRarity) => RARITY_ORDER.indexOf(r);

/** Agrège des exemplaires par sujet. Pur. */
export function summarizeCopies(
  rows: readonly OwnedCopy[]
): Map<string, CopySummary> {
  const out = new Map<string, CopySummary>();
  for (const row of rows) {
    const key = cardSubjectKey(row);
    if (!key) continue; // ligne sans sujet : corruption, on la saute
    let s = out.get(key);
    if (!s) {
      s = {
        kind: row.subject_kind,
        key,
        subjectId: key.slice(key.indexOf(':') + 1),
        copies: 0,
        tradeableCopies: 0,
        bestRarity: row.rarity,
        worstTradeable: null,
      };
      out.set(key, s);
    }
    s.copies += 1;
    if (rank(row.rarity) > rank(s.bestRarity)) s.bestRarity = row.rarity;
    if (row.tradeable) {
      s.tradeableCopies += 1;
      const copy = { rarity: row.rarity, foil: Boolean(row.is_foil) };
      const w = s.worstTradeable;
      if (
        !w ||
        rank(copy.rarity) < rank(w.rarity) ||
        (rank(copy.rarity) === rank(w.rarity) && !copy.foil && w.foil)
      ) {
        s.worstTradeable = copy;
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Faces                                                                       */
/* -------------------------------------------------------------------------- */

type CardBase = { rarity: TcgRarity | null; isFoil: boolean | null };

/** Une carte telle qu'une proposition l'affiche — mêmes champs que la collection. */
export type TradeCardView =
  | (CardBase & {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
    })
  | (CardBase & {
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      cardImageUrl: string | null;
      /** Crédit du logo (`TeamFace.logoCredit`) ; `null` sans artiste nommée. */
      logoCredit: LogoCredit | null;
    })
  | (CardBase & {
      kind: 'map';
      slug: string;
      name: string | null;
      imageUrl: string | null;
    })
  | (CardBase & {
      kind: 'fanart';
      fanartId: string;
      title: string | null;
      /** Le crédit voyage AVEC la carte : une fan art sans son autrice n'est
       *  pas une carte, c'est une œuvre prise sans le dire. */
      artistName: string | null;
      artistUrl: string | null;
      imageUrl: string | null;
    })
  | (CardBase & {
      kind: 'mascot';
      slug: string;
      name: string | null;
    });

/**
 * LES CINQ TYPES, pas trois. Les cartes de fan art et de mascotte étaient
 * inéchangeables jusqu'au 2026-09-20 : `tcg_trade_items` n'avait pas de colonne
 * pour elles, et ce type le reflétait. On pouvait les ouvrir, les posséder, les
 * voir — jamais les proposer. Le trou ne produisait aucune erreur : la carte
 * n'apparaissait simplement pas dans ce qu'on peut offrir.
 */
export type SubjectRef = {
  kind: 'player' | 'team' | 'map' | 'fanart' | 'mascot';
  id: string;
};

/**
 * Relit les faces d'un lot de sujets, en un aller-retour par type, et rend de
 * quoi composer chaque carte. Toujours par `readCardFaces` : filtre de
 * consentement compris.
 */
export async function readSubjectFaces(
  tenantId: string,
  subjects: readonly SubjectRef[]
): Promise<(s: SubjectRef, base: CardBase) => TradeCardView> {
  const [players, teams, maps, fanarts] = await Promise.all([
    readPlayerFaces(
      tenantId,
      subjects.filter((s) => s.kind === 'player').map((s) => s.id)
    ),
    readTeamFaces(
      tenantId,
      subjects.filter((s) => s.kind === 'team').map((s) => s.id)
    ),
    readMapFaces(subjects.filter((s) => s.kind === 'map').map((s) => s.id)),
    readFanartFaces(
      tenantId,
      subjects.filter((s) => s.kind === 'fanart').map((s) => s.id)
    ),
  ]);
  return (s, base) => {
    if (s.kind === 'player') {
      const f = players.get(s.id);
      return {
        kind: 'player',
        userId: s.id,
        displayName: f?.displayName ?? null,
        imageUrl: f?.imageUrl ?? null,
        ...base,
      };
    }
    if (s.kind === 'team') {
      const f = teams.get(s.id);
      return {
        kind: 'team',
        teamId: s.id,
        name: f?.name ?? null,
        slug: f?.slug ?? null,
        logoUrl: f?.logoUrl ?? null,
        cardImageUrl: f?.cardImageUrl ?? null,
        // Une carte proposée à l'échange est la même carte que dans la
        // collection : elle garde son crédit, sinon il disparaîtrait
        // précisément quand deux joueuses la regardent de près.
        logoCredit: f?.logoCredit ?? null,
        ...base,
      };
    }
    if (s.kind === 'fanart') {
      const f = fanarts.get(s.id);
      return {
        kind: 'fanart',
        fanartId: s.id,
        title: f?.title ?? null,
        artistName: f?.artistName ?? null,
        artistUrl: f?.artistUrl ?? null,
        imageUrl: f?.imageUrl ?? null,
        ...base,
      };
    }
    if (s.kind === 'mascot') {
      // Une mascotte n'a ni photo ni page : son nom vient du registre, sa
      // figurine est calculée par la carte depuis son slug. Rien à lire.
      return {
        kind: 'mascot',
        slug: s.id,
        name: gameMascotDisplayName(s.id),
        ...base,
      };
    }
    // `map` en dernier, et SEULEMENT pour `map`. Cette branche était le
    // fourre-tout final : un sujet qu'elle ne connaissait pas ressortait en
    // carte de map au nom et à l'image nuls — une carte vide, sans erreur.
    const f = maps.get(s.id);
    return {
      kind: 'map',
      slug: s.id,
      name: f?.name ?? null,
      imageUrl: f?.imageUrl ?? null,
      ...base,
    };
  };
}

/* -------------------------------------------------------------------------- */
/* Annonces bot                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `tcg.trade_proposed` — à la DESTINATAIRE, une fois, à la création.
 *
 * Contrat FIXE (consommé par le bot) : `{ tradeId, recipientUserId,
 * recipientDiscordUserId, proposerDisplayName, offeredCount, requestedCount,
 * expiresAt, ctaUrl }`. Aucun sujet de carte ni aucune image : le DM invite à
 * venir voir, la page relit les faces.
 */
export async function announceTradeProposed(
  tenantId: string,
  trade: {
    tradeId: string;
    proposerId: string;
    recipientId: string;
    offeredCount: number;
    requestedCount: number;
    expiresAt: string;
  }
): Promise<void> {
  try {
    const [links, names] = await Promise.all([
      getDiscordLinksForUsers([trade.recipientId]),
      readCollectorNames(tenantId, [trade.proposerId]),
    ]);
    await emitBotEvent(
      'tcg.trade_proposed',
      {
        tradeId: trade.tradeId,
        recipientUserId: trade.recipientId,
        recipientDiscordUserId:
          links.get(trade.recipientId)?.discordUserId ?? null,
        proposerDisplayName: names.get(trade.proposerId) ?? null,
        offeredCount: trade.offeredCount,
        requestedCount: trade.requestedCount,
        expiresAt: new Date(trade.expiresAt).toISOString(),
        ctaUrl: absoluteSiteUrl(TRADES_PAGE_PATH),
      },
      tenantId
    );
  } catch (err) {
    logger.error(
      '[tcg/trades] annonce de proposition %s impossible: %s',
      trade.tradeId,
      err instanceof Error ? err.message : String(err)
    );
  }
}

export type TradeResolution = {
  tradeId: string;
  proposerId: string;
  recipientId: string;
  outcome: TradeOutcome;
};

/**
 * `tcg.trade_resolved` — à la PROPOSANTE, un événement par proposition close.
 *
 * Contrat FIXE : `{ tradeId, proposerUserId, proposerDiscordUserId, outcome,
 * counterpartDisplayName, ctaUrl }`. `cancelled` n'arrive ici que d'une
 * annulation par le SYSTÈME : l'appelant n'appelle jamais cette fonction pour
 * une proposante qui annule elle-même.
 */
export async function announceTradeResolved(
  tenantId: string,
  resolutions: readonly TradeResolution[]
): Promise<void> {
  if (resolutions.length === 0) return;
  try {
    const [links, names] = await Promise.all([
      getDiscordLinksForUsers([
        ...new Set(resolutions.map((r) => r.proposerId)),
      ]),
      readCollectorNames(
        tenantId,
        resolutions.map((r) => r.recipientId)
      ),
    ]);
    const ctaUrl = absoluteSiteUrl(TRADES_PAGE_PATH);
    // Un événement par destinataire, comme les autres annonces TCG : un DM
    // refusé ne fait pas rejouer les autres.
    await Promise.all(
      resolutions.map((r) =>
        emitBotEvent(
          'tcg.trade_resolved',
          {
            tradeId: r.tradeId,
            proposerUserId: r.proposerId,
            proposerDiscordUserId:
              links.get(r.proposerId)?.discordUserId ?? null,
            outcome: r.outcome,
            counterpartDisplayName: names.get(r.recipientId) ?? null,
            ctaUrl,
          },
          tenantId
        )
      )
    );
  } catch (err) {
    logger.error(
      '[tcg/trades] annonce de résolution impossible: %s',
      err instanceof Error ? err.message : String(err)
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Expiration                                                                  */
/* -------------------------------------------------------------------------- */

type ExpiredRow = {
  id: string;
  tenant_id: string;
  proposer_id: string;
  recipient_id: string;
};

/**
 * Passe en `expired` les propositions échues et l'annonce aux proposantes.
 *
 * DEUX DÉCLENCHEURS pour la même fonction : paresseux (chaque route d'échange
 * l'appelle pour l'appelante, `userId` renseigné) et planifié (le cron horaire,
 * sans filtre). Le premier garantit qu'aucun écran ne montre une proposition
 * échue comme acceptable ; le second, que la proposante apprend l'expiration
 * même si personne ne revient sur la page.
 *
 * UNE SEULE ANNONCE : l'écriture est conditionnelle (`status = 'pending'`), et
 * seules les lignes qu'ELLE a fait basculer sont rendues. Deux déclencheurs
 * simultanés ne peuvent pas faire basculer la même ligne — le second ne voit
 * plus `pending`. Même garantie face à `tcg_accept_trade`, qui expire sous
 * verrou de ligne.
 *
 * Ne lève jamais ; rend le nombre de propositions expirées ici.
 */
export async function expireOverdueTrades(scope: {
  tenantId?: string;
  userId?: string;
}): Promise<number> {
  if (!supabaseAdmin) return 0;
  const nowIso = new Date().toISOString();
  const expired: ExpiredRow[] = [];

  // Pour une joueuse : deux passes (proposante, destinataire) plutôt qu'un
  // `.or(...)` où son identifiant serait interpolé dans une expression.
  const passes: Array<'proposer_id' | 'recipient_id' | null> = scope.userId
    ? ['proposer_id', 'recipient_id']
    : [null];

  try {
    for (const column of passes) {
      let q = supabaseAdmin
        .from('tcg_trades')
        .update({ status: 'expired', resolved_at: nowIso })
        .eq('status', 'pending')
        .lte('expires_at', nowIso);
      if (scope.tenantId) q = q.eq('tenant_id', scope.tenantId);
      if (column && scope.userId) q = q.eq(column, scope.userId);
      const { data, error } = await q.select(
        'id, tenant_id, proposer_id, recipient_id'
      );
      if (error) {
        logger.error('[tcg/trades] expiration impossible: %s', error.message);
        continue;
      }
      expired.push(...((data ?? []) as ExpiredRow[]));
    }

    // Annonce par tenant : l'outbox du bot est cloisonnée par espace.
    const byTenant = new Map<string, ExpiredRow[]>();
    for (const row of expired) {
      const list = byTenant.get(row.tenant_id) ?? [];
      list.push(row);
      byTenant.set(row.tenant_id, list);
    }
    for (const [tenantId, rows] of byTenant) {
      logger.info(
        '[tcg/trades] %d proposition(s) expirée(s) (tenant %s)',
        rows.length,
        tenantId
      );
      await announceTradeResolved(
        tenantId,
        rows.map((r) => ({
          tradeId: r.id,
          proposerId: r.proposer_id,
          recipientId: r.recipient_id,
          outcome: 'expired' as const,
        }))
      );
    }
  } catch (err) {
    logger.error(
      '[tcg/trades] expiration: %s',
      err instanceof Error ? err.message : String(err)
    );
  }
  return expired.length;
}

/* -------------------------------------------------------------------------- */
/* Mise en forme d'une proposition                                             */
/* -------------------------------------------------------------------------- */

export type TradeRow = {
  id: string;
  tenant_id: string;
  proposer_id: string;
  recipient_id: string;
  status: TradeStatus;
  resolution_reason: TradeResolutionReason | null;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
};

export type TradeItemRow = {
  trade_id: string;
  side: 'offered' | 'requested';
  ordinal: number;
  subject_kind: 'player' | 'team' | 'map' | 'fanart' | 'mascot';
  card_user_id: string | null;
  card_team_id: string | null;
  card_map_slug: string | null;
  card_fanart_id: string | null;
  card_mascot_slug: string | null;
  rarity: TcgRarity | null;
  is_foil: boolean | null;
};

export const TRADE_COLUMNS =
  'id, tenant_id, proposer_id, recipient_id, status, resolution_reason, created_at, expires_at, resolved_at';

export type TradeView = {
  id: string;
  direction: 'received' | 'sent';
  status: TradeStatus;
  reason: TradeResolutionReason | null;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  counterpart: { userId: string; displayName: string | null };
  offered: TradeCardView[];
  /**
   * Pour une proposition REÇUE en attente, chaque carte demandée porte
   * `ownedCopies` et `tradeableCopies` : ce que l'appelante possède ELLE-MÊME de
   * ce sujet, pour qu'elle voie avant d'accepter si elle céderait son dernier
   * exemplaire. Jamais renseigné côté proposante : on ne lui montre pas la
   * collection de l'autre.
   */
  requested: Array<
    TradeCardView & { ownedCopies?: number; tradeableCopies?: number }
  >;
};

/**
 * Compose les propositions d'une page pour l'appelante. Relit items, faces et
 * noms en un aller-retour par nature, jamais une requête par proposition.
 */
export async function hydrateTrades(
  tenantId: string,
  viewerId: string,
  rows: readonly TradeRow[]
): Promise<{ ok: true; trades: TradeView[] } | { ok: false }> {
  if (!supabaseAdmin) return { ok: false };
  if (rows.length === 0) return { ok: true, trades: [] };

  const { data, error } = await supabaseAdmin
    .from('tcg_trade_items')
    .select(
      'trade_id, side, ordinal, subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id, card_mascot_slug, rarity, is_foil'
    )
    .in(
      'trade_id',
      rows.map((r) => r.id)
    )
    .order('trade_id', { ascending: true })
    .order('side', { ascending: true })
    .order('ordinal', { ascending: true });
  if (error) {
    logger.error(
      '[tcg/trades] cartes des propositions illisibles: %s',
      error.message
    );
    return { ok: false };
  }
  const items = (data ?? []) as TradeItemRow[];

  const subjectOf = (i: TradeItemRow): SubjectRef | null => {
    const key = cardSubjectKey(i);
    if (!key) return null;
    return { kind: i.subject_kind, id: key.slice(key.indexOf(':') + 1) };
  };

  const subjects = items
    .map(subjectOf)
    .filter((s): s is SubjectRef => s !== null);
  const counterpartIds = rows.map((r) =>
    r.proposer_id === viewerId ? r.recipient_id : r.proposer_id
  );

  // Ce que l'appelante possède, seulement s'il existe une proposition REÇUE en
  // attente dans la page : c'est la seule qui en a besoin.
  const needsOwn = rows.some(
    (r) => r.recipient_id === viewerId && r.status === 'pending'
  );

  const [faceOf, names, own] = await Promise.all([
    readSubjectFaces(tenantId, subjects),
    readCollectorNames(tenantId, counterpartIds),
    needsOwn
      ? readOwnedCopies(tenantId, viewerId)
      : Promise.resolve(null as ReadResult<OwnedCopy[]> | null),
  ]);
  const ownSummary = own && own.ok ? summarizeCopies(own.value) : null;

  const itemsByTrade = new Map<string, TradeItemRow[]>();
  for (const i of items) {
    const list = itemsByTrade.get(i.trade_id) ?? [];
    list.push(i);
    itemsByTrade.set(i.trade_id, list);
  }

  const trades = rows.map((r): TradeView => {
    const direction = r.recipient_id === viewerId ? 'received' : 'sent';
    const counterpartId =
      direction === 'received' ? r.proposer_id : r.recipient_id;
    const mine = itemsByTrade.get(r.id) ?? [];
    const view = (i: TradeItemRow) => {
      const s = subjectOf(i);
      return s
        ? faceOf(s, { rarity: i.rarity ?? null, isFoil: i.is_foil ?? null })
        : null;
    };
    const offered = mine
      .filter((i) => i.side === 'offered')
      .sort((a, b) => a.ordinal - b.ordinal)
      .map(view)
      .filter((c): c is TradeCardView => c !== null);
    const requested = mine
      .filter((i) => i.side === 'requested')
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((i) => {
        const card = view(i);
        if (!card) return null;
        if (direction === 'received' && r.status === 'pending' && ownSummary) {
          const key = cardSubjectKey(i);
          const s = key ? ownSummary.get(key) : undefined;
          return {
            ...card,
            ownedCopies: s?.copies ?? 0,
            tradeableCopies: s?.tradeableCopies ?? 0,
          };
        }
        return card;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return {
      id: r.id,
      direction,
      status: r.status,
      reason: r.resolution_reason,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      resolvedAt: r.resolved_at,
      counterpart: {
        userId: counterpartId,
        displayName: names.get(counterpartId) ?? null,
      },
      offered,
      requested,
    };
  });

  return { ok: true, trades };
}
