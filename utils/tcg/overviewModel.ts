// utils/tcg/overviewModel.ts
//
// Le MODÈLE que le panneau staff lit dans `GET /api/admin/tcg/overview`, et la
// normalisation défensive qui l'en tire.
//
// POURQUOI CE CODE N'EST PLUS DANS LE COMPOSANT. Il vivait dans
// `components/admin/tcg/TcgOverviewPanel.tsx`, déjà séparé par son propre
// bandeau et déjà exporté « pour les tests » — deux aveux qu'il n'était pas à sa
// place. Aucune ligne n'y est du JSX : ce sont des types et quatre fonctions
// pures. Le garde `tests/unit/adminFileSizeGuard.test.ts` a rendu la chose
// concrète en refusant le panneau à 809 lignes, et sa règle est explicite :
// « tout lot qui touche un de ces fichiers en extrait au moins un panneau ».
// Extraire la moitié testable plutôt que geler le fichier, c'est répondre à la
// règle au lieu de la contourner. Même geste que `utils/taskBoard.ts`, le cœur
// que l'admin et le bot partagent sans se charger l'un l'autre.
//
// `null` N'EST PAS `0`, ET C'EST LE CONTRAT DE L'ENDPOINT. Il dégrade en `null`
// la SEULE clé dont la lecture a échoué et rend quand même un 200 : `0` veut
// dire « mesuré, et vide », `null` veut dire « pas mesurable maintenant ».
// Confondre les deux ferait lire une panne de lecture comme un effondrement de
// l'économie — exactement le faux signal qu'un tableau de bord doit détecter et
// non produire. Toute la normalisation ci-dessous tient cette distinction.
//
// ÉCRITE POUR NE JAMAIS LEVER. Une réponse vide, tronquée ou d'une forme
// inattendue donne un modèle vide, pas une exception : c'est une vue de lecture,
// elle ne doit pas pouvoir casser la page qui l'héberge.
//
// AUCUNE URL FABRIQUÉE. Une joueuse s'adresse par son identifiant, une équipe
// par son SLUG — jamais par son uuid, qui ne route nulle part — et une map par
// l'ancre de la page du pool, faute de page par map. Une ligne dont la réponse
// ne porte pas la clé nécessaire reste NON cliquable, plutôt que de mener au 404
// que `TcgCard` a déjà payé sur chaque carte d'équipe.

import { RARITY_ORDER } from '@/utils/tcg/rarity';
import type { TcgRarity } from '@/utils/tcg/rarity';

/* ---------------------------------------------------------------------------
 * Modèle normalisé
 * ------------------------------------------------------------------------- */

/** `null` = non mesurable pour l'instant (cf. l'en-tête). */
export type Count = number | null;

export type TcgOverviewPacks = {
  granted: Count;
  opened: Count;
  pending: Count;
  fromVictory: Count;
  fromPurchase: Count;
  /** Cadeau d'accueil d'une édition. */
  fromWelcome: Count;
  /** Drop Twitch en direct. */
  fromDrop: Count;
  /** Palmarès de fin de tournoi. */
  fromPlacement: Count;
  /** Série de check-ins. */
  fromStreak: Count;
};

export type TcgOverviewCoins = {
  inCirculation: Count;
  earned: Count;
  /**
   * `earned` ventilé par `source_kind` brut, crédits seulement.
   *
   * `null` = non mesurable, même convention que `earned` ; `{}` = mesuré et
   * sans aucun crédit. Les clés ne sont PAS closes : l'API rend les origines
   * réellement présentes, donc le panneau doit savoir afficher une clé qu'il
   * ne connaît pas encore plutôt que de la faire disparaître.
   */
  earnedBySource: Record<string, number> | null;
  spent: Count;
  wallets: Count;
  /** Constante de barème rappelée par l'endpoint, pas une mesure. */
  boosterPrice: Count;
  truncated: boolean;
};

export type TcgOverviewCards = {
  /** Cartes ENCORE possédées. */
  total: Count;
  foil: Count;
  byRarity: Record<TcgRarity, Count>;
  recycled: Count;
  /** Toutes les cartes jamais tirées, recyclées comprises. */
  drawn: Count;
  truncated: boolean;
};

export type TcgOverviewPhotos = {
  pending: Count;
  approved: Count;
  rejected: Count;
  optedIn: Count;
  revoked: Count;
};

export type TcgOverviewSubject = {
  kind: 'player' | 'team' | 'map' | 'fanart' | 'mascot';
  /** Identifiant du sujet, `null` si la réponse n'en portait pas. */
  id: string | null;
  name: string | null;
  imageUrl: string | null;
  count: Count;
  foilCount: Count;
  /** Fiche publique, `null` quand on ne peut pas la construire honnêtement. */
  href: string | null;
};

export type TcgOverview = {
  packs: TcgOverviewPacks;
  coins: TcgOverviewCoins;
  cards: TcgOverviewCards;
  photos: TcgOverviewPhotos;
  topSubjects: TcgOverviewSubject[];
  generatedAt: string | null;
};

/* ---------------------------------------------------------------------------
 * Normalisation défensive (pure)
 * ------------------------------------------------------------------------- */

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RawRecord)
    : {};
}

/**
 * Un compteur, ou `null`.
 *
 * Refuse tout ce qui n'est pas un nombre positif exploitable : absent, `null`,
 * chaîne, NaN, négatif. Un compteur négatif n'existe pas dans ce domaine — on
 * compte des paquets, des cartes, des pièces détenues. En afficher un
 * reviendrait à présenter une donnée corrompue avec l'aplomb d'une mesure.
 */
function asCount(value: unknown): Count {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

/**
 * Une ventilation `origine → montant`, ou `null`.
 *
 * DÉFENSIF COMME LE RESTE DU FICHIER : ce qui n'est pas un objet rend `null`
 * (« non mesurable »), et chaque valeur aberrante est ÉCARTÉE plutôt que
 * forcée à zéro — une origine à `0` affirmerait « mesuré, et vide », ce qu'on
 * ne sait pas. Les clés restent celles de l'API : le panneau doit pouvoir
 * afficher une origine qu'il ne connaît pas encore.
 */
function asAmountMap(value: unknown): Record<string, number> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const amount = asCount(raw);
    if (amount !== null) out[key] = amount;
  }
  return out;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSubject(raw: unknown): TcgOverviewSubject | null {
  const rec = asRecord(raw);
  // LES CINQ TYPES. Une nature absente d'ici rend `null`, donc la ligne est
  // ÉCARTÉE : c'est volontaire pour une valeur inconnue, mais ça a rendu les
  // mascottes et les fan arts invisibles dans le panneau staff — un total de
  // cartes distribuées faux, sans rien qui le signale.
  const kind =
    rec.kind === 'player'
      ? 'player'
      : rec.kind === 'team'
        ? 'team'
        : rec.kind === 'map'
          ? 'map'
          : rec.kind === 'fanart'
            ? 'fanart'
            : rec.kind === 'mascot'
              ? 'mascot'
              : null;
  // Sans nature, on ne sait ni comment étiqueter la ligne ni où elle pointe :
  // on l'écarte plutôt que d'inventer l'une ou l'autre.
  if (!kind) return null;

  // L'endpoint nomme la clé selon la nature du sujet ; `id` est accepté en
  // repli pour qu'un sujet reste identifiable même si la forme évolue.
  const userId =
    asText(rec.userId) ?? (kind === 'player' ? asText(rec.id) : null);
  const teamId =
    asText(rec.teamId) ?? (kind === 'team' ? asText(rec.id) : null);
  // Pour une map, le slug EST l'identifiant : elle n'a pas d'uuid, son registre
  // n'étant pas une table. Pour une équipe, le slug n'est qu'une adresse.
  // Une mascotte s'identifie comme une map : par son slug.
  const slug =
    asText(rec.slug) ??
    (kind === 'map' || kind === 'mascot' ? asText(rec.id) : null);
  const fanartId =
    asText(rec.fanartId) ?? (kind === 'fanart' ? asText(rec.id) : null);

  return {
    kind,
    id:
      kind === 'player'
        ? userId
        : kind === 'map' || kind === 'mascot'
          ? slug
          : kind === 'fanart'
            ? fanartId
            : teamId,
    name: asText(rec.name),
    imageUrl: asText(rec.imageUrl),
    count: asCount(rec.count),
    foilCount: asCount(rec.foilCount),
    href:
      kind === 'player'
        ? userId
          ? `/player/${userId}`
          : null
        : kind === 'map'
          ? // Aucune page par map n'existe : on vise l'ancre de la maquette sur
            // la page du pool, comme le fait la carte du TCG.
            slug
            ? `/maps-voxel#${slug}`
            : null
          : kind === 'mascot' || kind === 'fanart'
            ? // Ni mascotte ni œuvre n'a de page. Sans ce test, une mascotte
              // tombait dans la branche « équipe » et sortait avec un lien
              // `/team/<slug-de-mascotte>` — un 404 offert au clic.
              null
            : // Une équipe s'adresse par son slug ; son uuid ne mène nulle part.
              slug
              ? `/team/${slug}`
              : null,
  };
}

/**
 * Traduit la réponse brute en modèle affichable.
 *
 * Écrite pour ne JAMAIS lever : une réponse vide, tronquée ou d'une forme
 * inattendue donne un panneau vide, pas un écran blanc. C'est une vue de
 * lecture — elle ne doit pas pouvoir casser la page qui l'héberge.
 */
export function normalizeTcgOverview(raw: unknown): TcgOverview {
  const root = asRecord(raw);
  const packsRaw = asRecord(root.packs);
  const bySource = asRecord(packsRaw.bySource);
  const coinsRaw = asRecord(root.coins);
  const cardsRaw = asRecord(root.cards);
  const byRarityRaw = asRecord(cardsRaw.byRarity);
  const photosRaw = asRecord(root.photos);

  const byRarity = RARITY_ORDER.reduce(
    (acc, rarity) => {
      acc[rarity] = asCount(byRarityRaw[rarity]);
      return acc;
    },
    {} as Record<TcgRarity, Count>
  );

  const topSubjects = (Array.isArray(root.topSubjects) ? root.topSubjects : [])
    .map(normalizeSubject)
    .filter((s): s is TcgOverviewSubject => s !== null)
    // L'endpoint trie déjà ; on le refait pour que l'affichage tienne la
    // promesse de son titre quoi qu'il renvoie. Les comptes absents ferment la
    // marche plutôt que de passer pour les plus faibles.
    .sort((a, b) => (b.count ?? -1) - (a.count ?? -1));

  return {
    packs: {
      granted: asCount(packsRaw.granted),
      opened: asCount(packsRaw.opened),
      pending: asCount(packsRaw.pending),
      fromVictory: asCount(bySource.victory),
      fromPurchase: asCount(bySource.purchase),
      fromWelcome: asCount(bySource.welcome),
      fromDrop: asCount(bySource.drop),
      fromPlacement: asCount(bySource.placement),
      fromStreak: asCount(bySource.streak),
    },
    coins: {
      inCirculation: asCount(coinsRaw.inCirculation),
      earned: asCount(coinsRaw.earned),
      earnedBySource: asAmountMap(coinsRaw.earnedBySource),
      spent: asCount(coinsRaw.spent),
      wallets: asCount(coinsRaw.wallets),
      boosterPrice: asCount(coinsRaw.boosterPrice),
      truncated: coinsRaw.truncated === true,
    },
    cards: {
      total: asCount(cardsRaw.total),
      foil: asCount(cardsRaw.foil),
      byRarity,
      recycled: asCount(cardsRaw.recycled),
      drawn: asCount(cardsRaw.drawn),
      truncated: cardsRaw.truncated === true,
    },
    photos: {
      pending: asCount(photosRaw.pending),
      approved: asCount(photosRaw.approved),
      rejected: asCount(photosRaw.rejected),
      optedIn: asCount(photosRaw.optedIn),
      revoked: asCount(photosRaw.revoked),
    },
    topSubjects,
    generatedAt: asText(root.generatedAt),
  };
}

/**
 * Le tableau de bord n'a-t-il rien à montrer ?
 *
 * « Rien » = aucun compteur renseigné à une valeur non nulle ET aucun sujet.
 * `boosterPrice` est EXCLU du test : c'est une constante de barème, présente
 * même sur une économie qui n'a jamais tourné — la compter empêcherait à jamais
 * l'état vide de s'afficher. On distingue enfin ce cas d'une erreur : une
 * économie qui n'a pas démarré est un état normal, qui mérite un `EmptyState`
 * et non une alerte.
 */
export function isTcgOverviewEmpty(data: TcgOverview): boolean {
  const counters: Count[] = [
    data.packs.granted,
    data.packs.opened,
    data.packs.pending,
    data.packs.fromVictory,
    data.packs.fromPurchase,
    data.coins.inCirculation,
    data.coins.earned,
    data.coins.spent,
    data.coins.wallets,
    data.cards.total,
    data.cards.foil,
    data.cards.recycled,
    data.cards.drawn,
    ...RARITY_ORDER.map((r) => data.cards.byRarity[r]),
    data.photos.pending,
    data.photos.approved,
    data.photos.rejected,
    data.photos.optedIn,
    data.photos.revoked,
  ];
  return (
    data.topSubjects.length === 0 &&
    counters.every((c) => c === null || c === 0)
  );
}
