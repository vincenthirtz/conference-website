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
// TOUTES LES SOURCES SONT DÉSORMAIS ACCEPTÉES PAR LE SCHÉMA — à condition que
// `tcg_earn_sources_drop_streak_placement.sql` (2026-09-15) soit appliquée,
// et, pour `battlenet_verified`, `tcg_battlenet_verified.sql` (même jour), et
// pour `collection_set`, `tcg_collection_set.sql` (non appliquée au 2026-09-15).
// Le CHECK `tcg_wallet_entries_source_kind_check` y liste match_win,
// scrim_win, booster_purchase, admin_grant, card_recycled, twitch_drop,
// welcome_gift, supporter_welcome, checkin_streak et tournament_placement ;
// celui de `tcg_packs` victory, purchase, welcome, drop, placement et streak.
// Le drapeau `schemaReady` reste utile : décrire une voie et pouvoir l'écrire
// sont deux choses distinctes, et la prochaine source ajoutée ici devra
// repasser par la même porte au lieu de se découvrir refusée en production.
//
// ⚠️ UNE TABLE PEUT PORTER PLUSIEURS CHECK SUR LA MÊME COLONNE, et c'est le
// piège qui a coûté 58 paquets le 2026-09-14 : `tcg_packs_source_kind_check`
// avait été élargi, `tcg_packs_source_coherent` — qui ne nomme pas la colonne —
// non. Avant de basculer un `schemaReady`, ÉNUMÉRER les contraintes des deux
// tables (`pg_constraint` sur `tcg_packs` ET `tcg_wallet_entries`) plutôt que
// de corriger celle dont le nom ressemble au sujet.
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
 * Pièces jointes au cadeau d'accueil, offert une fois par édition à chaque
 * participante.
 *
 * LE CADEAU EST D'ABORD UN PAQUET (cf. son entrée au registre), et ces pièces
 * viennent en plus. C'est ce qui a décidé du montant : le prix d'un booster
 * aurait doublé le présent, puisque le paquet est déjà donné. Une victoire de
 * match, elle, dit « voilà de quoi continuer » sans remplacer le fait de jouer.
 *
 * DÉRIVÉ, JAMAIS ÉCRIT EN DUR, comme tout le barème : régler `MATCH_WIN_COINS`
 * emporte le cadeau avec lui, et les deux ne peuvent pas diverger.
 *
 * IL NE REMPLACE PAS LA VICTOIRE. Une seule fois, par édition : de quoi ouvrir
 * la porte, pas de quoi se constituer une collection sans jouer — la victoire
 * reste la voie principale (cf. `BOOSTER_PRICE_COINS`).
 */
export const WELCOME_GIFT_COINS = MATCH_WIN_COINS;

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
/**
 * Ce que rapporte la vérification d'un compte Battle.net, UNE FOIS À VIE.
 *
 * DES PIÈCES SEULES, PAS DE PAQUET — et c'est l'exception assumée au « un
 * paquet dans toute source ». Les deux cadeaux d'accueil donnent un paquet
 * parce qu'ils OUVRENT la porte du TCG ; la vérification n'ouvre rien, elle
 * récompense un geste d'identité utile au tournoi (anti-smurf). Un paquet
 * aurait aussi exigé d'élargir les DEUX contraintes de `tcg_packs` — celles
 * qui ont coûté 58 paquets le 2026-09-14 — pour une récompense ponctuelle.
 *
 * UNE VICTOIRE DE MATCH, soit un TIERS DE BOOSTER : la vérification rapproche
 * du prochain paquet sans en acheter un à elle seule. Reste sous chacun des
 * deux cadeaux d'accueil (le même montant, sans leur paquet).
 *
 * DÉRIVÉ, JAMAIS ÉCRIT EN DUR, comme tout le barème.
 */
export const BATTLENET_VERIFIED_COINS = MATCH_WIN_COINS;

/**
 * Ce que rapporte une SÉRIE complétée (`utils/tcg/collectionSets.ts`), UNE FOIS
 * par série et par joueuse.
 *
 * DES PIÈCES SEULES. Compléter une série se fait en OUVRANT des paquets : en
 * rendre un aurait nourri la boucle qu'on récompense (plus de paquets, donc
 * plus de séries complétées, donc plus de paquets). Et un paquet aurait exigé
 * d'élargir les deux contraintes de `tcg_packs` — celles des 58 paquets du
 * 2026-09-14.
 *
 * UNE VICTOIRE DE MATCH, soit UN TIERS DE BOOSTER. Prudent par construction :
 * une série de six cartes demande, au hasard du tirage, bien plus de six
 * paquets — la récompense rembourse une fraction de l'effort, elle ne le paie
 * pas. Un espace comptant ~15 séries (5 modes de maps, une série d'équipes et
 * une dizaine de rosters par édition) plafonne donc ce gain à ~5 boosters sur
 * TOUTE la vie d'un compte, là où les compléter toutes réclame des dizaines de
 * paquets ouverts.
 *
 * DÉRIVÉ, JAMAIS ÉCRIT EN DUR, comme tout le barème.
 */
export const COLLECTION_SET_COINS = MATCH_WIN_COINS;

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
  | 'tournament_placement'
  | 'welcome_gift'
  | 'supporter_welcome'
  | 'battlenet_verified'
  | 'collection_set';

/**
 * Ce que `source_ref` doit contenir — donc ce qu'« une occurrence » veut dire.
 *
 * C'est le cœur de l'anti-abus : `stream` plafonne à un drop par live,
 * `tournament` à une récompense de palmarès par tournoi. Cf. l'en-tête.
 */
export type TcgSourceRefKind =
  | 'match'
  /**
   * `scrim:<scrimId>` — le SCRIM, jamais son match miroir. Le miroir se retire
   * et se recrée sous un autre id (litige, dé-classement) : clée sur lui, la
   * victoire se repayait à chaque recréation (boucle corrigée le 2026-09-15,
   * cf. `grantVictoryRewards.ts`).
   */
  | 'scrim'
  /** L'identifiant du paquet acheté : chaque achat est sa propre occurrence. */
  | 'pack'
  /** L'identifiant du direct (event run / session de stream). */
  | 'stream'
  /**
   * Une fenêtre de série close : `<tournoi>:<match qui clôt la série>`.
   *
   * LE MATCH, PAS UN NUMÉRO DE SÉRIE. Un numéro (« 1re série de cinq ») se
   * recalcule à zéro après une rupture : la série suivante reprendrait la clé
   * `<tournoi>:1`, et la contrainte UNIQUE la jetterait comme un doublon. Le
   * match qui clôt la fenêtre, lui, n'existe qu'une fois.
   */
  | 'streak_window'
  | 'tournament'
  /**
   * L'espace lui-même : « une fois par compte », sans rattachement à un
   * évènement. Le seul cas est le cadeau d'accueil d'une supportrice, qui n'a
   * ni match ni édition à quoi s'accrocher — et `source_ref` ne peut pas être
   * NULL, deux NULL étant DISTINCTS dans une contrainte UNIQUE.
   */
  | 'tenant'
  /**
   * Le compte Blizzard prouvé : `bnet:<sha256 de son battle_net_id>`.
   *
   * ⚠️ LA SEULE CLÉ QUI NE SUFFIT PAS À ELLE SEULE. L'unicité du registre
   * contient `user_id` : avec cette clé, elle empêche un rejeu mais pas un
   * second compte Blizzard sur la même joueuse, ni le même compte Blizzard sur
   * une seconde joueuse, ni un second tenant. Deux index uniques PARTIELS
   * (`tcg_battlenet_verified.sql`) portent ces règles : une fois par
   * personne, une fois par compte Blizzard, tous tenants confondus.
   */
  | 'blizzard_account'
  /**
   * L'identifiant STABLE d'une série : `maps:<mode>`, `tournament:<tournoi>`
   * ou `roster:<tournoi>:<équipe>` (cf. `utils/tcg/collectionSets.ts`). Des
   * identifiants seulement, jamais un nom : renommer une équipe ne rouvre pas
   * une récompense déjà versée.
   */
  | 'collection_set';

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
    refKind: 'scrim',
    maxPerRef: 1,
    schemaReady: true,
  },
  {
    key: 'tournament_placement',
    // ALLUMÉE le 2026-09-15 (`tcg_earn_sources_drop_streak_placement.sql`),
    // écrite par `utils/tcg/grantPlacementRewards.ts` à la finalisation d'un
    // tournoi. Variables : `PLACEMENT_TIERS` en décide au vu du rang.
    packs: 0,
    coins: null,
    refKind: 'tournament',
    maxPerRef: 1,
    schemaReady: true,
  },
  {
    // ALLUMÉE le 2026-09-15 (`tcg_earn_sources_drop_streak_placement.sql`),
    // écrite par `utils/tcg/grantCheckinStreak.ts` au check-in d'une équipe.
    key: 'checkin_streak',
    packs: 1,
    coins: CHECKIN_STREAK_COINS,
    refKind: 'streak_window',
    maxPerRef: 1,
    schemaReady: true,
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
    // UN PAQUET, ÉCRIT depuis le 2026-09-15 : le webhook passe par
    // `grantCoinsThenPacks` (pièces d'abord, paquet `drop` aux seules lignes
    // insérées). Il ne créditait auparavant que les pièces.
    packs: 1,
    coins: TWITCH_DROP_COINS,
    // Un seul drop par live ET par personne : c'est `source_ref = live` qui le
    // garantit, la contrainte UNIQUE faisant le reste.
    refKind: 'stream',
    maxPerRef: 1,
    schemaReady: true,
  },
  {
    // ALLUMÉE le 2026-09-14 : `tcg_welcome_gift.sql` a élargi le CHECK de
    // `source_kind`. Migration et bascule vont ensemble — cf. l'en-tête.
    key: 'welcome_gift',
    // UN PAQUET, comme toute source de gain de ce registre. Ne créditer que des
    // pièces aurait exigé une seconde démarche — aller acheter — avant de
    // procurer la moindre joie, alors que l'ouverture d'un paquet EST le moment
    // qui compte dans un TCG. Les pièces viennent en plus, pour continuer.
    packs: 1,
    coins: WELCOME_GIFT_COINS,
    // Un cadeau par personne et par ÉDITION : c'est `source_ref = tournoi` qui
    // le garantit, la contrainte UNIQUE faisant le reste.
    refKind: 'tournament',
    maxPerRef: 1,
    schemaReady: true,
  },
  {
    // ALLUMÉE le 2026-09-14 : `tcg_supporter_welcome.sql` a élargi le CHECK de
    // `tcg_wallet_entries`. Côté paquets, RIEN à migrer — vérifié et non
    // supposé : `tcg_packs` admet déjà 'welcome' dans ses DEUX contraintes.
    //
    // DISTINCTE DE `welcome_gift`, et ce n'est pas un doublon : celui-là vaut
    // une fois par ÉDITION et vise les rosters engagés ; celui-ci vaut une fois
    // par COMPTE et vise qui ne joue pas. Les fondre aurait fait porter à une
    // même clé deux règles d'unicité incompatibles.
    key: 'supporter_welcome',
    // Un paquet, comme toute source de ce registre : c'est l'ouverture qui fait
    // le TCG, des pièces seules exigeraient une seconde démarche avant la
    // moindre joie.
    packs: 1,
    // Le même montant qu'un cadeau de participante : de quoi ouvrir la porte,
    // pas de quoi se constituer une collection — un booster en coûte trois
    // fois plus, et la suite passe par le drop en direct.
    coins: WELCOME_GIFT_COINS,
    // `source_ref` = le TENANT : « une fois, jamais deux », appliqué par la
    // contrainte UNIQUE et par rien d'autre.
    refKind: 'tenant',
    maxPerRef: 1,
    schemaReady: true,
  },
  {
    // ALLUMÉE le 2026-09-15 avec `tcg_battlenet_verified.sql` (CHECK élargi
    // + deux index uniques partiels), écrite par
    // `utils/tcg/grantBattlenetVerified.ts` au retour de l'OAuth Battle.net.
    // Le drapeau COMMANDE : l'écrivain ne tente rien tant qu'il est faux.
    key: 'battlenet_verified',
    // Pas de paquet : cf. `BATTLENET_VERIFIED_COINS`.
    packs: 0,
    coins: BATTLENET_VERIFIED_COINS,
    refKind: 'blizzard_account',
    maxPerRef: 1,
    schemaReady: true,
  },
  {
    // Écrite par `utils/tcg/grantCollectionSets.ts` : à l'ouverture d'un paquet
    // qui complète une série, et par vérification paresseuse à la lecture des
    // séries (rattrapage). Migration `tcg_collection_set.sql` (NON appliquée
    // au 2026-09-15). Même choix que `battlenet_verified` : le drapeau est levé
    // avec le code ; tant que la migration manque, l'écriture est refusée en
    // 23514, journalisée, et la lecture suivante RETENTE — rien n'est perdu.
    key: 'collection_set',
    // Pas de paquet : cf. `COLLECTION_SET_COINS`.
    packs: 0,
    coins: COLLECTION_SET_COINS,
    refKind: 'collection_set',
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
