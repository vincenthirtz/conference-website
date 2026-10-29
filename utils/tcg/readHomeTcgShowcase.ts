// utils/tcg/readHomeTcgShowcase.ts
//
// Ce que le bloc TCG de l'ACCUEIL affiche : trois vraies cartes, le nombre de
// cartes à collectionner et le barème des pièces.
//
// POURQUOI UN LECTEUR À PART, ET PAS CELUI DU CATALOGUE. Le catalogue `/tcg`
// lit TOUTES les cartes publiques pour les afficher toutes ; l'accueil en
// montre trois. Charger le catalogue entier dans le HTML de la page la plus
// vue du site pour en garder trois aurait alourdi chaque visite. On compose
// donc les MÊMES briques (`readTeamFaces`, `readTeamRarities`, `mapFace`,
// le vivier du tirage) : une carte montrée ici est une carte réellement
// tirable, au même habillage que sur le catalogue.
//
// AUCUNE JOUEUSE. Même contrainte que le catalogue (`pages/tcg.tsx`, en-tête) :
// pas d'annuaire public de personnes. Les trois cartes sont des ENTITÉS — une
// équipe, une carte de l'association, une map — et les joueuses n'entrent que
// dans un COMPTE (le total), jamais par un nom ni un identifiant.
//
// NE LÈVE JAMAIS. L'accueil doit s'afficher même base injoignable : une lecture
// ratée retire la carte concernée (ou le total), pas la page. Le bloc sait se
// rendre avec moins.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import type { TcgRarity } from '@/utils/tcg/rarity';
import { MAP_CARD_RARITY, RARITY_ORDER } from '@/utils/tcg/rarity';
import {
  displayableLogoCreditUrl,
  type LogoCredit,
} from '@/utils/teams/logoCredit';
import { MATCH_LOSS_COINS, MATCH_WIN_COINS } from '@/utils/tcg/economy';
import {
  PLACEMENT_TIERS,
  TOURNAMENT_PARTICIPATION_COINS,
} from '@/utils/tcg/earnSources';
import { POOL_LIMIT } from '@/utils/tcg/drawPack';
import { MAP_POOL_SLUGS, mapFace } from '@/utils/tcg/readMapFaces';
import {
  countCollectableCards,
  readDrawPoolSizes,
} from '@/utils/tcg/readDrawPool';

/** Une carte mise en avant — mêmes trois formes que le catalogue public. */
export type HomeTcgCard =
  | {
      kind: 'team';
      id: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      cardImageUrl: string | null;
      logoCredit: LogoCredit | null;
      rarity: TcgRarity;
    }
  | {
      kind: 'association';
      id: string;
      name: string | null;
      imageUrl: string | null;
      credit: string | null;
      /** Lien du crédit (le site d'un partenaire), `https://` seulement. */
      creditUrl?: string | null;
      description: string | null;
      rarity: TcgRarity;
    }
  | {
      kind: 'map';
      id: string;
      name: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
    };

/** Le barème affiché, lu des constantes du jeu — jamais recopié en dur. */
export type HomeTcgCoins = {
  win: number;
  loss: number;
  participation: number;
  /** Le palier le plus haut du classement final (championnes). */
  topPlacement: number;
};

export type HomeTcgShowcase = {
  /** De zéro à trois cartes, dans l'ordre d'affichage. */
  cards: HomeTcgCard[];
  /** Cartes différentes à collectionner ; `null` si le vivier est illisible. */
  totalCards: number | null;
  coins: HomeTcgCoins;
};

/**
 * La carte de l'association mise en avant par défaut : « Arukdo ». Choisie par
 * son TITRE et non par un identifiant, pour survivre à une réimportation ; à
 * défaut, la plus rare des cartes publiées.
 */
const FEATURED_ASSOCIATION_TITLE = /arukdo/i;

export const HOME_TCG_COINS: HomeTcgCoins = {
  win: MATCH_WIN_COINS,
  loss: MATCH_LOSS_COINS,
  participation: TOURNAMENT_PARTICIPATION_COINS,
  topPlacement: Math.max(...PLACEMENT_TIERS.map((t) => t.coins)),
};

const rarityRank = (r: TcgRarity) => RARITY_ORDER.indexOf(r);

type AssociationRow = {
  id: string;
  title: string;
  artist_name: string | null;
  artist_url?: string | null;
  image_path: string;
  rarity: TcgRarity | null;
  description?: string | null;
};

/**
 * La carte de l'association à montrer. Pure, donc testée sans base.
 *
 * Arukdo d'abord ; sinon la plus rare ; à rareté égale, l'ordre reçu (la plus
 * récente, la requête triant par date décroissante).
 */
export function pickAssociationRow<
  T extends { title: string; rarity: TcgRarity | null },
>(rows: readonly T[]): T | null {
  const named = rows.find((r) => FEATURED_ASSOCIATION_TITLE.test(r.title));
  if (named) return named;
  let best: T | null = null;
  for (const row of rows) {
    const rank = rarityRank(row.rarity ?? 'rare');
    if (!best || rank > rarityRank(best.rarity ?? 'rare')) best = row;
  }
  return best;
}

/**
 * L'équipe à montrer : la plus rare parmi celles qui ont un visuel. À rareté
 * égale, une illustration dédiée passe avant un simple logo, puis l'ordre
 * alphabétique — pour que deux régénérations montrent la même équipe.
 */
export function pickTeamCard(
  cards: ReadonlyArray<Extract<HomeTcgCard, { kind: 'team' }>>
): Extract<HomeTcgCard, { kind: 'team' }> | null {
  const withVisual = cards.filter((c) => c.cardImageUrl || c.logoUrl);
  const sorted = [...withVisual].sort(
    (a, b) =>
      rarityRank(b.rarity) - rarityRank(a.rarity) ||
      Number(!!b.cardImageUrl) - Number(!!a.cardImageUrl) ||
      (a.name ?? '').localeCompare(b.name ?? '', 'fr')
  );
  return sorted[0] ?? null;
}

/**
 * La map du jour : elle tourne d'un jour sur l'autre parmi le vivier, pour que
 * l'accueil ne montre pas indéfiniment la même. Le jour est celui de la
 * régénération (ISR), pas de la visite : SSR et client voient la même.
 */
export function pickMapCard(
  now: Date,
  slugs: readonly string[] = MAP_POOL_SLUGS
): Extract<HomeTcgCard, { kind: 'map' }> | null {
  if (slugs.length === 0) return null;
  const day = Math.floor(now.getTime() / 86_400_000);
  const face = mapFace(slugs[day % slugs.length]);
  return {
    kind: 'map',
    id: face.slug,
    name: face.name,
    // La miniature WebP, comme le catalogue : la maquette SVG pèse bien plus.
    imageUrl: face.thumbUrl ?? face.imageUrl,
    rarity: MAP_CARD_RARITY,
  };
}

async function readTeamCard(
  tenantId: string
): Promise<Extract<HomeTcgCard, { kind: 'team' }> | null> {
  if (!supabaseAdmin) return null;
  const { readTeamFaces } = await import('@/utils/tcg/readCardFaces');
  const { readTeamRarities } = await import('@/utils/tcg/readTeamRarity');

  // Les filtres du vivier de tirage : une carte montrée doit être tirable.
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .or('is_active.is.null,is_active.eq.true')
    .limit(POOL_LIMIT);
  if (error) {
    logger.warn('[home/tcg] équipes illisibles : %s', error.message);
    return null;
  }
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return null;

  const [faces, rarities] = await Promise.all([
    readTeamFaces(tenantId, ids),
    readTeamRarities(tenantId, ids),
  ]);
  return pickTeamCard(
    ids.map((id) => {
      const face = faces.get(id);
      return {
        kind: 'team' as const,
        id,
        name: face?.name ?? null,
        slug: face?.slug ?? null,
        logoUrl: face?.logoUrl ?? null,
        cardImageUrl: face?.cardImageUrl ?? null,
        logoCredit: face?.logoCredit ?? null,
        rarity: rarities.get(id) ?? 'common',
      };
    })
  );
}

async function readAssociationCard(
  tenantId: string
): Promise<Extract<HomeTcgCard, { kind: 'association' }> | null> {
  if (!supabaseAdmin) return null;
  const db = supabaseAdmin;
  const { mediaPublicUrl } = await import('@/utils/storage/mediaUrl');
  const { isMissingColumnError } = await import(
    '@/utils/moderation/missingColumn'
  );
  const query = (columns: string) =>
    db
      .from('tcg_fanart_cards')
      .select(columns)
      .eq('tenant_id', tenantId)
      .eq('category', 'association')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(100);
  const base = 'id, title, artist_name, artist_url, image_path, rarity';
  let { data, error } = await query(`${base}, description`);
  // Même tolérance que le catalogue : une migration pas encore appliquée ne
  // retire pas la carte.
  if (error && isMissingColumnError(error, 'description')) {
    ({ data, error } = await query(base));
  }
  if (error) {
    logger.warn(
      '[home/tcg] cartes de l’association illisibles : %s',
      error.message
    );
    return null;
  }
  const row = pickAssociationRow((data ?? []) as unknown as AssociationRow[]);
  if (!row) return null;
  return {
    kind: 'association',
    id: row.id,
    name: row.title,
    imageUrl: mediaPublicUrl(row.image_path),
    credit: row.artist_name,
    // Le site d'un partenaire : https seulement, comme sur la carte.
    creditUrl: displayableLogoCreditUrl(row.artist_url),
    description: row.description ?? null,
    rarity: row.rarity ?? 'rare',
  };
}

async function readTotalCards(tenantId: string): Promise<number | null> {
  const sizes = await readDrawPoolSizes(tenantId);
  if (!sizes.ok) {
    logger.warn('[home/tcg] vivier illisible : %s', sizes.error);
    return null;
  }
  return countCollectableCards(sizes.value);
}

/**
 * Le contenu du bloc TCG de l'accueil. Ne lève jamais.
 *
 * Ordre d'affichage : l'équipe, la carte de l'association AU CENTRE (la rare
 * qu'on veut faire désirer), la map.
 */
export async function readHomeTcgShowcase(
  tenantId: string,
  now: Date = new Date()
): Promise<HomeTcgShowcase> {
  const map = pickMapCard(now);
  if (!supabaseAdmin) {
    return {
      cards: map ? [map] : [],
      totalCards: null,
      coins: HOME_TCG_COINS,
    };
  }
  try {
    const [team, association, totalCards] = await Promise.all([
      readTeamCard(tenantId),
      readAssociationCard(tenantId),
      readTotalCards(tenantId),
    ]);
    const cards = [team, association, map].filter(
      (c): c is HomeTcgCard => c !== null
    );
    return { cards, totalCards, coins: HOME_TCG_COINS };
  } catch (err) {
    logger.error('[home/tcg] lecture impossible', err);
    return {
      cards: map ? [map] : [],
      totalCards: null,
      coins: HOME_TCG_COINS,
    };
  }
}
