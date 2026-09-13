// utils/tcg/earnSources.ts
//
// Registre des façons d'obtenir un paquet ou des pièces. Module PUR (aucune
// I/O), comme `utils/tcg/economy.ts` dont il prolonge le barème et
// `utils/tcg/drawPack.ts` dont il partage la discipline : décrire, ne rien
// écrire.
//
// POURQUOI UN REGISTRE plutôt que des montants posés chez chaque appelant.
// Aujourd'hui deux endroits distribuent : `grantVictoryRewards` (la victoire)
// et `pages/api/player/tcg/booster.ts` (l'achat). Chaque nouvelle voie — drop
// en direct, assiduité, palmarès — ajouterait un troisième puis un quatrième
// endroit où un montant est écrit à la main. Le dépôt a déjà payé ce prix
// ailleurs (quatre fois la même erreur sur un barème recopié au lieu d'être
// dérivé) : deux listes jumelles finissent toujours par diverger. Une seule
// table dit donc qui donne quoi, et TOUS les montants dérivent d'`economy.ts`.
//
// LA LIMITE ANTI-ABUS N'EST PAS UN COMPTEUR, C'EST UNE CLÉ. `tcg_packs` porte
// UNIQUE (tenant_id, user_id, source_match_id) et `tcg_wallet_entries` UNIQUE
// (tenant_id, user_id, source_kind, source_ref) : ce qui plafonne une source,
// c'est le CHOIX de ce qu'on met dans `source_ref`. « Un drop Twitch par live
// et par personne » n'est pas une vérification applicative, c'est
// `source_ref = identifiant du live` plus la contrainte d'unicité. Chaque
// entrée déclare donc `refKind` — ce que `source_ref` doit contenir — parce que
// c'est LÀ que se joue la limite. Compter avant d'écrire laisserait une fenêtre
// entre la lecture et l'écriture : exactement ce qui a produit quatre doublons
// Discord le 2026-09-12.
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS. Aucune entrée ici ne décrit un
// moyen de paiement, et ce n'est pas un oubli : monnaie achetable en argent
// réel + contenu aléatoire = loot box payante, interdite en Belgique et aux
// Pays-Bas, surveillée par l'ANJ en France, avec un public qui compte des
// mineures. Ajouter une source `topup` serait une décision produit prise en
// connaissance de cause, pas une extension de ce fichier.
//
// DEUX SOURCES NE SONT PAS ENCORE ACCEPTÉES PAR LE SCHÉMA. Le CHECK
// `tcg_wallet_entries_source_kind_check` liste aujourd'hui match_win,
// scrim_win, booster_purchase, admin_grant, card_recycled et twitch_drop
// (`tcg_twitch_drop.sql`, 2026-09-13) ; celui de `tcg_packs` liste victory et
// purchase. Restent donc interdits d'écriture `tournament_placement` et
// `checkin_streak`. Le registre le dit lui-même (`schemaReady`) au lieu de le
// laisser découvrir en production par une écriture rejetée : décrire une voie
// et pouvoir l'écrire sont deux choses distinctes, et ce module ne décrit que
// la première.
//
// CE DRAPEAU N'EST PAS DESCRIPTIF, IL COMMANDE. Le webhook du drop lit
// `getEarnSource('twitch_drop').schemaReady` et refuse de servir tant qu'il est
// faux : le basculer MET LA ROUTE EN SERVICE. Migrer sans basculer laisse la
// voie éteinte en silence ; basculer sans migrer fait rejeter l'écriture en
// production. Les deux gestes vont ensemble, et le test unitaire le rappelle.

import {
  BOOSTER_PRICE_COINS,
  MATCH_WIN_COINS,
  SCRIM_WIN_COINS,
} from './economy';

/* ---------------------------------------------------------------------------
 * Montants dérivés
 * ------------------------------------------------------------------------- */

/**
 * Drop offert pendant un direct Twitch.
 *
 * DEMI-SCRIM, ET C'EST VOULU. Regarder n'est pas jouer : le drop doit rester
 * la plus petite récompense du barème, sans quoi suivre un live paierait mieux
 * que disputer un match. On le dérive du plus petit gain existant plutôt que
 * d'écrire « 25 », pour que régler `MATCH_WIN_COINS` entraîne celui-ci avec lui.
 *
 * `Math.round` parce que les pièces sont entières, et un plancher à 1 pour
 * qu'un réglage agressif ne rende jamais le drop nul — une récompense qui ne
 * rapporte rien est pire qu'une récompense absente (même raisonnement que
 * `RECYCLE_REFUND_COINS`).
 */
export const TWITCH_DROP_COINS = Math.max(1, Math.round(SCRIM_WIN_COINS / 2));

/**
 * Longueur d'une série de check-ins récompensée.
 *
 * CINQ, comme le badge `win_streak` de `utils/profile/achievements.ts` (« plus
 * longue série de victoires consécutives >= 5 »). Le dépôt a déjà arbitré à
 * partir de quand une suite devient une « série » ; en choisir une autre ici
 * ferait dire deux choses différentes au même mot sur le même site.
 *
 * ⚠️ Ce seuil est RECOPIÉ, faute d'être exporté par `achievements.ts` (il y est
 * écrit en clair dans `computeAchievements`). S'il bouge là-bas, il doit bouger
 * ici : le test unitaire le rappelle, et l'exporter à la source serait le vrai
 * correctif.
 */
export const CHECKIN_STREAK_LENGTH = 5;

/**
 * Ce que rapporte une série de `CHECKIN_STREAK_LENGTH` check-ins.
 *
 * Le prix d'une victoire de scrim : être présente à l'heure est un service
 * rendu au tournoi — c'est ce qui évite les forfaits — mais ce n'est pas
 * gagner. Le mettre au niveau d'un match officiel paierait l'assiduité comme
 * la performance ; ne rien donner laisserait la ponctualité sans contrepartie
 * alors qu'elle porte l'organisation.
 */
export const CHECKIN_STREAK_COINS = SCRIM_WIN_COINS;

/**
 * Palmarès de fin de tournoi : multiplicateurs appliqués à `MATCH_WIN_COINS`.
 *
 * LES SEUILS SONT CEUX DES BADGES, pas une nouvelle échelle. `achievements.ts`
 * classe déjà : rang 1 champion, rang 2 finalist, rang <= 3 podium, rang <= 8
 * top_cut — et `utils/tcg/rarity.ts` s'y aligne déjà pour la rareté des cartes.
 * Une troisième calibration ferait dire au TCG autre chose que la fiche de la
 * joueuse sur le même tournoi.
 *
 * Comme dans `rarity.ts` (`RATING_TIERS`), les recopier sans le dire créerait
 * des barèmes jumeaux libres de diverger : si les paliers de badges bougent,
 * celui-ci doit bouger.
 *
 * Les multiplicateurs, eux, sont des RAPPORTS et non des montants — même forme
 * que `BOOSTER_PRICE_COINS = 3 * MATCH_WIN_COINS`. Une victoire de tournoi vaut
 * cinq matchs gagnés : plus qu'aucune autre source unitaire, parce que c'est le
 * seul fait qu'on ne peut obtenir qu'une fois par tournoi et par personne.
 *
 * Ordonné du meilleur rang au moins bon : la première borne atteinte gagne.
 */
export const PLACEMENT_TIERS: ReadonlyArray<{
  /** Rang maximal (inclus) ouvrant ce palier. */
  maxRank: number;
  /** Badge correspondant dans `achievements.ts`, pour tracer l'alignement. */
  badgeKey: 'champion' | 'finalist' | 'podium' | 'top_cut';
  coins: number;
  packs: number;
}> = [
  { maxRank: 1, badgeKey: 'champion', coins: 5 * MATCH_WIN_COINS, packs: 3 },
  { maxRank: 2, badgeKey: 'finalist', coins: 3 * MATCH_WIN_COINS, packs: 2 },
  { maxRank: 3, badgeKey: 'podium', coins: 2 * MATCH_WIN_COINS, packs: 1 },
  { maxRank: 8, badgeKey: 'top_cut', coins: 1 * MATCH_WIN_COINS, packs: 1 },
] as const;

/* ---------------------------------------------------------------------------
 * Le registre
 * ------------------------------------------------------------------------- */

export type TcgEarnSourceKey =
  | 'match_win'
  | 'scrim_win'
  | 'booster_purchase'
  | 'twitch_drop'
  | 'checkin_streak'
  | 'tournament_placement';

/**
 * Ce que `source_ref` doit contenir — donc ce qu'« une occurrence » veut dire.
 *
 * C'est le cœur de l'anti-abus : `stream` plafonne à un drop par live,
 * `tournament` à une récompense de palmarès par tournoi. Cf. l'en-tête.
 */
export type TcgSourceRefKind =
  | 'match'
  /** L'identifiant du paquet acheté : chaque achat est sa propre occurrence. */
  | 'pack'
  /** L'identifiant du direct (event run / session de stream). */
  | 'stream'
  /** Une fenêtre de série close, p. ex. `<tournoi>:<n° de série>`. */
  | 'streak_window'
  | 'tournament';

export type TcgEarnSource = {
  key: TcgEarnSourceKey;
  /** Paquets offerts. 0 = la source ne donne que des pièces. */
  packs: number;
  /**
   * Pièces, SIGNÉ : > 0 gain, < 0 dépense (cf. `tcg_wallet_entries.amount`).
   * `null` = montant variable, à résoudre par `earnReward` — aujourd'hui le
   * seul cas est le palmarès, qui dépend du rang.
   */
  coins: number | null;
  refKind: TcgSourceRefKind;
  /**
   * Occurrences autorisées par `source_ref` et par joueuse. Vaut 1 partout :
   * c'est la contrainte UNIQUE qui l'applique, pas un compteur applicatif. Le
   * champ existe pour que la règle soit LISIBLE ici plutôt que déduite du
   * schéma — et pour qu'une future source multi-occurrences ait à s'expliquer.
   */
  maxPerRef: number;
  /**
   * Le CHECK `source_kind` en base accepte-t-il déjà cette clé ? `false` = une
   * migration est requise AVANT d'écrire cette source. Cf. l'en-tête.
   */
  schemaReady: boolean;
};

/**
 * Toutes les voies, la principale d'abord.
 *
 * L'ordre est celui du discours produit — « gagne, ou achète » : la victoire
 * reste la voie normale, l'achat la seconde, plus lente et choisie
 * (cf. `BOOSTER_PRICE_COINS`).
 */
export const TCG_EARN_SOURCES: readonly TcgEarnSource[] = [
  {
    key: 'match_win',
    packs: 1,
    coins: MATCH_WIN_COINS,
    refKind: 'match',
    maxPerRef: 1,
    schemaReady: true,
  },
  {
    key: 'scrim_win',
    packs: 1,
    coins: SCRIM_WIN_COINS,
    refKind: 'match',
    maxPerRef: 1,
    schemaReady: true,
  },
  {
    key: 'tournament_placement',
    // Variables : `PLACEMENT_TIERS` en décide au vu du rang.
    packs: 0,
    coins: null,
    refKind: 'tournament',
    maxPerRef: 1,
    schemaReady: false,
  },
  {
    key: 'checkin_streak',
    packs: 1,
    coins: CHECKIN_STREAK_COINS,
    refKind: 'streak_window',
    maxPerRef: 1,
    schemaReady: false,
  },
  {
    // ALLUMÉE le 2026-09-13 : `tcg_twitch_drop.sql` a élargi le CHECK de
    // `source_kind`. Ce drapeau n'est pas décoratif — le webhook lit
    // `getEarnSource('twitch_drop').schemaReady` et refuse de servir tant
    // qu'il est faux, donc le basculer MET LA ROUTE EN SERVICE.
    //
    // Elle reste néanmoins sans effet utile tant que `user_twitch_links` est
    // vide : le refus passe simplement de « schéma non prêt » à
    // « identité non liée ». Il manque un flux OAuth Twitch côté joueuse.
    key: 'twitch_drop',
    packs: 1,
    coins: TWITCH_DROP_COINS,
    // Un seul drop par live ET par personne : c'est `source_ref = live` qui le
    // garantit, la contrainte UNIQUE faisant le reste.
    refKind: 'stream',
    maxPerRef: 1,
    schemaReady: true,
  },
  {
    key: 'booster_purchase',
    packs: 1,
    // Négatif : l'achat est une DÉPENSE. Le registre décrit tout ce qui fait
    // apparaître un paquet, pas seulement les gains — sinon l'achat serait la
    // seule voie invisible depuis ce fichier.
    coins: -BOOSTER_PRICE_COINS,
    refKind: 'pack',
    maxPerRef: 1,
    schemaReady: true,
  },
] as const;

/* ---------------------------------------------------------------------------
 * Lecture
 * ------------------------------------------------------------------------- */

const BY_KEY: ReadonlyMap<string, TcgEarnSource> = new Map(
  TCG_EARN_SOURCES.map((source) => [source.key, source])
);

/**
 * Accepte une chaîne quelconque parce que l'appelant lit souvent un
 * `source_kind` venu de la base : c'est ICI qu'on retype, pas par un cast chez
 * l'appelant. Une clé inconnue rend `null` — un `source_kind` ajouté en base
 * sans entrée ici ne doit pas faire lever un lecteur d'historique.
 */
export function getEarnSource(key: string): TcgEarnSource | null {
  return BY_KEY.get(key) ?? null;
}

export function isEarnSourceKey(value: unknown): value is TcgEarnSourceKey {
  return typeof value === 'string' && BY_KEY.has(value);
}

/** Palier de palmarès correspondant à un rang, ou `null` hors barème. */
export function placementTier(
  rank: number
): (typeof PLACEMENT_TIERS)[number] | null {
  // Un rang non entier, nul ou négatif est une donnée aberrante : on ne
  // récompense pas dessus. Même stance que `canAfford` — dans le doute, on ne
  // livre pas, un paquet ouvert ne se reprenant pas.
  if (!Number.isInteger(rank) || rank < 1) return null;
  return PLACEMENT_TIERS.find((tier) => rank <= tier.maxRank) ?? null;
}

export type TcgReward = { packs: number; coins: number };

/** Rien du tout — un objet neuf à chaque fois, pour rester non mutable. */
const NOTHING = (): TcgReward => ({ packs: 0, coins: 0 });

/**
 * Ce que rapporte une occurrence de cette source.
 *
 * `rank` n'est lu que par `tournament_placement`. Le fournir ailleurs est sans
 * effet plutôt qu'une erreur : l'appelant est souvent générique (une boucle sur
 * des événements hétérogènes), et le faire échouer sur un paramètre en trop
 * l'obligerait à connaître le détail de chaque source — exactement ce que ce
 * registre lui évite.
 *
 * Une source inconnue, ou un palmarès hors barème (rang 9+, rang aberrant),
 * rend `{ packs: 0, coins: 0 }` : « aucune récompense » est un résultat
 * légitime, pas une panne.
 */
export function earnReward(
  key: string,
  context: { rank?: number } = {}
): TcgReward {
  const source = getEarnSource(key);
  if (!source) return NOTHING();

  if (source.coins === null) {
    // Seul cas variable à ce jour : le palmarès.
    if (source.key !== 'tournament_placement') return NOTHING();
    const tier =
      typeof context.rank === 'number' ? placementTier(context.rank) : null;
    if (!tier) return NOTHING();
    return { packs: tier.packs, coins: tier.coins };
  }

  return { packs: source.packs, coins: source.coins };
}

/**
 * Les sources écrivables en l'état du schéma.
 *
 * Utile à un appelant qui distribue en boucle : mieux vaut ignorer une source
 * dont la migration n'est pas passée que de faire rejeter l'INSERT par le
 * CHECK — un rejet ferait perdre les récompenses des autres sources du même
 * lot.
 */
export function writableEarnSources(): readonly TcgEarnSource[] {
  return TCG_EARN_SOURCES.filter((source) => source.schemaReady);
}
