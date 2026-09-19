// pages/api/player/tcg/collection.ts
//
// Ma collection : ce que mes paquets OUVERTS contiennent, regroupé par sujet.
//
// ELLE SE DÉDUIT, ELLE N'EST PAS STOCKÉE. Le socle du TCG a délibérément
// écarté une table `collection` : un agrégat finit par diverger du détail qui
// le nourrit, et au volume attendu le comptage à la lecture est gratuit. Cette
// route est l'application de cette décision.
//
// DEUX REQUÊTES, PAS UNE JOINTURE. Le dépôt n'utilise nulle part les
// ressources imbriquées de PostgREST ; plutôt que d'inventer ici une syntaxe
// de jointure que rien d'autre n'exerce, on lit les paquets ouverts puis leurs
// cartes, et on agrège côté serveur. Les volumes sont petits (quelques
// dizaines de paquets par joueuse) et le patron est celui du reste du code.
//
// LA FACE EST RELUE À CHAQUE FOIS, jamais figée au tirage : c'est ce qui rend
// le retrait de consentement RÉTROACTIF sur les cartes déjà distribuées
// (cf. `utils/tcg/readCardFaces.ts`).
//
// PAGINATION PAR CURSEUR, RÉTROCOMPATIBLE.
//   - Sans `limit` ni `cursor` : toute la collection, comme avant, plus
//     `nextCursor: null`. Un client qui ignore le champ ne perd rien.
//   - Avec `limit` (1..200) et/ou `cursor` : une page, et `nextCursor` tant
//     qu'il en reste. L'ordre est TOTAL — rareté décroissante puis clé de
//     sujet — sans quoi deux pages pourraient se chevaucher.
// On pagine l'AFFICHAGE, pas la lecture : compter les exemplaires, retenir la
// meilleure rareté et désigner le pire doublon exigent de voir toutes les
// cartes d'un sujet. `distinct` et `total` restent donc ceux de la collection
// entière, et seules les faces de la page sont relues — c'est là qu'était le
// coût (une lecture de consentement et de profil par sujet).

import type { NextApiRequest, NextApiResponse } from 'next';
import { cardFigureOf } from '@/utils/tcg/roleFigures';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';
import { POOL_LIMIT } from '@/utils/tcg/drawPack';
import { readPlayerFaces, readTeamFaces } from '@/utils/tcg/readCardFaces';
import { readMapFaces, MAP_POOL_SLUGS } from '@/utils/tcg/readMapFaces';
import { cardSubjectKey } from '@/utils/tcg/subjectKey';
import { readOwnedCardRows } from '@/utils/tcg/readOwnedCards';
import { copyRef, readEngagedCopies } from '@/utils/tcg/engagedCards';
import {
  compareCollectionOrder,
  decodeCollectionCursor,
  encodeCollectionCursor,
  parsePageLimit,
  type CollectionCursor,
} from '@/utils/tcg/pageCursor';
import { logger } from '@/utils/logger';

/**
 * Taille de page quand seul `cursor` est fourni. Quarante cartes = huit rangées
 * sur la grille à cinq colonnes : un écran et demi, sans faire relire quarante
 * faces à qui ne fera pas défiler.
 */
const DEFAULT_PAGE_SIZE = 40;

type Aggregated = {
  kind: 'player' | 'team' | 'map';
  /** `<kind>:<id>` — second critère de l'ordre total, et contenu du curseur. */
  key: string;
  subjectId: string;
  count: number;
  /** Meilleure rareté possédée : la rareté est figée par tirage et peut différer d'un exemplaire à l'autre. */
  rarity: TcgRarity;
  /** Vrai dès qu'un exemplaire est brillant. */
  hasFoil: boolean;
  /**
   * L'exemplaire le MOINS précieux du sujet — celui qu'on proposera au
   * recyclage. Cf. `worseThan` : plus basse rareté, et non brillant à rareté
   * égale.
   */
  worst: {
    packId: string;
    position: number;
    rarity: TcgRarity;
    foil: boolean;
    /** Exemplaire promis dans une de mes propositions d'échange en attente. */
    engaged: boolean;
  };
  /** Exemplaires de ce sujet promis dans mes propositions en attente. */
  engagedCopies: number;
};

/**
 * `a` est-il un moins bon exemplaire que `b` ?
 *
 * POURQUOI CE CHOIX EXISTE, ET POURQUOI IL EST ICI. La route de recyclage
 * accepte n'importe quel exemplaire pourvu qu'il en reste un autre : elle ne
 * regarde PAS lequel part. C'est donc à l'appelant de décider, et une
 * interface qui enverrait le premier venu détruirait un jour l'épique d'une
 * joueuse en lui laissant la commune — un clic censé « ranger ses doublons »
 * lui coûterait sa meilleure carte.
 *
 * La brillance départage à rareté égale : elle ne vaut aucun palier de plus,
 * mais entre deux communes on garde celle qui brille.
 */
function worseThan(
  a: { rarity: TcgRarity; foil: boolean },
  b: { rarity: TcgRarity; foil: boolean }
): boolean {
  const ra = RARITY_ORDER.indexOf(a.rarity);
  const rb = RARITY_ORDER.indexOf(b.rarity);
  if (ra !== rb) return ra < rb;
  return !a.foil && b.foil;
}

/**
 * À valeur ÉGALE (même rareté, même brillance), `a` est-il un meilleur candidat
 * au recyclage que `b` ?
 *
 * Deux copies de même rareté et de même brillance sont indiscernables pour la
 * joueuse, mais pas pour un échange : l'une peut être PROMISE dans une
 * proposition en attente (`utils/tcg/engagedCards.ts`). Recycler celle-là
 * annulerait l'échange à l'acceptation ; recycler sa jumelle libre ne coûte
 * rien de plus. On désigne donc la libre quand il y en a une.
 *
 * JAMAIS AU PRIX DE LA VALEUR : une commune promise reste désignée face à une
 * épique libre — la page avertit alors (`recyclableEngaged`), elle ne fait pas
 * brûler l'épique pour sauver un échange.
 */
function freerAtEqualValue(
  a: { rarity: TcgRarity; foil: boolean; engaged: boolean },
  b: { rarity: TcgRarity; foil: boolean; engaged: boolean }
): boolean {
  return a.rarity === b.rarity && a.foil === b.foil && !a.engaged && b.engaged;
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-tcg-coll')
  ) {
    return;
  }

  // Paramètres de page, validés AVANT toute lecture : un curseur illisible est
  // une erreur du client, pas un « on repart du début » qui ferait boucler une
  // pagination à l'infini.
  const limitParam = parsePageLimit(req.query.limit);
  if (limitParam === 'invalid') {
    return res
      .status(400)
      .json({ error: 'Paramètre limit invalide.', code: 'invalid_limit' });
  }
  const rawCursor = req.query.cursor;
  let cursor: CollectionCursor | null = null;
  if (rawCursor !== undefined) {
    cursor = decodeCollectionCursor(rawCursor);
    if (!cursor) {
      return res
        .status(400)
        .json({ error: 'Curseur invalide.', code: 'invalid_cursor' });
    }
  }
  const paginated = limitParam !== null || cursor !== null;
  const pageSize = limitParam ?? DEFAULT_PAGE_SIZE;

  // Une collection est personnelle et ses faces se relisent à chaque appel
  // (retrait de consentement) : aucune couche intermédiaire ne doit en garder
  // une copie, page comprise.
  res.setHeader('Cache-Control', 'private, no-store');

  const tenantId = resolveTenantIdForUserRequest(req);
  const userId = user.id;

  // 1-2) Mes cartes encore possédées : paquets OUVERTS, recyclées exclues, lues
  //      par tranches (cf. `readOwnedCards.ts` — l'ancien `.limit(5000)` était
  //      en réalité plafonné à 1000 lignes par PostgREST).
  //      En parallèle : les exemplaires promis dans mes propositions d'échange
  //      en attente. BEST-EFFORT — ils ne servent qu'à AVERTIR avant un
  //      recyclage (la route de recyclage ne les refuse pas, à dessein) ; une
  //      lecture en échec ne doit pas faire tomber la collection le jour où
  //      tout le monde ouvre ses paquets.
  const [owned, engaged] = await Promise.all([
    readOwnedCardRows(tenantId, userId),
    readEngagedCopies(tenantId, userId),
  ]);
  if (!engaged.ok) {
    logger.warn(
      '[tcg/collection] cartes engagées illisibles: %s',
      engaged.error
    );
  }
  if (!owned.ok) {
    logger.error('[tcg/collection] cartes illisibles: %s', owned.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (owned.truncated) {
    logger.warn(
      '[tcg/collection] plafond de lecture atteint pour %s — collection tronquée',
      userId
    );
  }
  const cardRows = owned.value;
  if (cardRows.length === 0) {
    return res
      .status(200)
      .json({ cards: [], distinct: 0, total: 0, nextCursor: null });
  }

  // 3) Agrégation par sujet.
  const byKey = new Map<string, Aggregated>();
  for (const row of cardRows) {
    // Le CHECK du schéma garantit exactement un sujet ; une ligne sans sujet
    // serait une corruption, on la saute plutôt que d'afficher une carte vide.
    const key = cardSubjectKey(row);
    if (!key) continue;
    const subjectId = key.slice(key.indexOf(':') + 1);

    const copy = {
      packId: row.pack_id,
      position: row.position,
      rarity: row.rarity,
      foil: Boolean(row.is_foil),
      engaged: engaged.copies.has(copyRef(row.pack_id, row.position)),
    };

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        kind: row.subject_kind,
        key,
        subjectId,
        count: 1,
        rarity: row.rarity,
        hasFoil: Boolean(row.is_foil),
        worst: copy,
        engagedCopies: engaged.bySubject.get(key) ?? 0,
      });
      continue;
    }
    existing.count += 1;
    existing.hasFoil = existing.hasFoil || Boolean(row.is_foil);
    if (
      RARITY_ORDER.indexOf(row.rarity) > RARITY_ORDER.indexOf(existing.rarity)
    ) {
      existing.rarity = row.rarity;
    }
    // On suit le pire exemplaire au fil de la lecture : c'est lui qu'on
    // proposera au recyclage, jamais le meilleur.
    if (
      worseThan(copy, existing.worst) ||
      freerAtEqualValue(copy, existing.worst)
    ) {
      existing.worst = copy;
    }
  }

  // Les plus rares d'abord — une collection se regarde par ses pièces fortes —
  // puis la clé de sujet, pour un ordre sans ex æquo (cf. `pageCursor.ts`).
  const aggregated = [...byKey.values()].sort(compareCollectionOrder);

  // 3 bis) La page. Le curseur désigne la DERNIÈRE carte déjà servie : on
  //        reprend strictement après elle. Si ce sujet a disparu entre-temps
  //        (recyclé jusqu'au dernier exemplaire), la comparaison le situe quand
  //        même — aucun doublon, aucun trou.
  let page = aggregated;
  let nextCursor: string | null = null;
  if (paginated) {
    const start = cursor
      ? aggregated.findIndex((a) => compareCollectionOrder(a, cursor) > 0)
      : 0;
    page = start === -1 ? [] : aggregated.slice(start, start + pageSize);
    const last = page[page.length - 1];
    const hasMore = start !== -1 && start + pageSize < aggregated.length;
    nextCursor =
      hasMore && last
        ? encodeCollectionCursor({ rarity: last.rarity, key: last.key })
        : null;
  }

  // 4) Les faces — relues, jamais figées (retrait de consentement rétroactif),
  //    et SEULEMENT pour la page servie.
  const [playerFaces, teamFaces, mapFaces] = await Promise.all([
    readPlayerFaces(
      tenantId,
      page.filter((a) => a.kind === 'player').map((a) => a.subjectId)
    ),
    readTeamFaces(
      tenantId,
      page.filter((a) => a.kind === 'team').map((a) => a.subjectId)
    ),
    // Pas de `tenantId` : les maps ne sont pas des données de tenant mais un
    // registre commun, lu en mémoire (cf. `utils/tcg/readMapFaces.ts`).
    readMapFaces(page.filter((a) => a.kind === 'map').map((a) => a.subjectId)),
  ]);

  /**
   * L'exemplaire proposé au recyclage, ou `null`.
   *
   * `null` DÈS QU'IL N'Y A QU'UN EXEMPLAIRE, et ce n'est pas une précaution
   * d'affichage : la route refuse le dernier exemplaire (`not_a_duplicate`).
   * Exposer un bouton qu'elle rejetterait ferait promettre un geste impossible.
   *
   * C'est le MOINS précieux qui est désigné (cf. `worseThan`) : la carte
   * affichée porte la meilleure rareté possédée, et recycler « ce doublon » ne
   * doit jamais coûter la meilleure des copies.
   */
  const recyclableOf = (a: Aggregated) =>
    a.count >= 2
      ? { packId: a.worst.packId, position: a.worst.position }
      : null;

  /**
   * Ce que la confirmation de recyclage doit dire des échanges en attente.
   *
   * `engagedCopies` : combien d'exemplaires de ce sujet sont promis dans MES
   * propositions en attente. `recyclableEngaged` : l'exemplaire désigné par
   * `recyclable` est-il l'un d'eux — le seul cas où recycler annulera un
   * échange. Toujours `false` sans `recyclable`.
   *
   * On AVERTIT, on n'interdit pas : la décision reste à la joueuse, et la
   * fonction SQL d'acceptation traite déjà proprement la carte disparue.
   *
   * Les deux champs sont écrits EN CLAIR dans chaque branche ci-dessous plutôt
   * qu'étalés (`...`) : `scripts/openapi/infer-responses.cjs` lit la forme
   * littérale, et un étalement brouillait la réponse déduite de la route.
   */
  const recyclableEngagedOf = (a: Aggregated): boolean =>
    a.count >= 2 && a.worst.engaged;

  // L'ordre est déjà celui de `aggregated` : on ne retrie pas la page.
  const cards = page.map((a) => {
    if (a.kind === 'player') {
      const face = playerFaces.get(a.subjectId);
      return {
        kind: 'player' as const,
        userId: a.subjectId,
        displayName: face?.displayName ?? null,
        imageUrl: face?.imageUrl ?? null,
        figure: cardFigureOf(face),
        rarity: a.rarity,
        isFoil: a.hasFoil,
        count: a.count,
        recyclable: recyclableOf(a),
        engagedCopies: a.engagedCopies,
        recyclableEngaged: recyclableEngagedOf(a),
      };
    }
    if (a.kind === 'map') {
      const face = mapFaces.get(a.subjectId);
      return {
        kind: 'map' as const,
        slug: a.subjectId,
        name: face?.name ?? null,
        imageUrl: face?.imageUrl ?? null,
        rarity: a.rarity,
        isFoil: a.hasFoil,
        count: a.count,
        recyclable: recyclableOf(a),
        engagedCopies: a.engagedCopies,
        recyclableEngaged: recyclableEngagedOf(a),
      };
    }
    const face = teamFaces.get(a.subjectId);
    return {
      kind: 'team' as const,
      teamId: a.subjectId,
      name: face?.name ?? null,
      slug: face?.slug ?? null,
      logoUrl: face?.logoUrl ?? null,
      cardImageUrl: face?.cardImageUrl ?? null,
      // Le crédit du logo suit la face : cette route recopie les champs un à
      // un, et un champ oublié ici disparaît de la collection — l'écran où
      // les joueuses regardent le plus leurs cartes. Seule la branche équipe
      // le porte : un logo n'existe que sur une carte d'équipe.
      logoCredit: face?.logoCredit ?? null,
      rarity: a.rarity,
      isFoil: a.hasFoil,
      count: a.count,
      recyclable: recyclableOf(a),
      engagedCopies: a.engagedCopies,
      recyclableEngaged: recyclableEngagedOf(a),
    };
  });

  // 5) LE VIVIER — combien de sujets EXISTENT, pour que « 12 cartes » devienne
  //    « 12 sur 48 ». Sans dénominateur, une collection n'a pas d'horizon.
  //
  //    LES FILTRES SONT CEUX DU TIRAGE, AU MOT PRÈS (cf. l'étape 2 de
  //    `packs.ts`) : joueuses sans filtre, équipes non supprimées et actives —
  //    `is_active` étant NULLABLE, le `or(...)` accepte NULL comme `true`, là
  //    où un `neq` exclurait les lignes non renseignées. Un dénominateur plus
  //    large que le tirage promettrait des cartes qu'aucun paquet ne peut
  //    donner.
  //
  //    Plafonné à `POOL_LIMIT`, la constante que le tirage lit lui aussi : au
  //    delà, le tirage ne regarde pas les sujets suivants, donc les compter
  //    rendrait la complétion inatteignable.
  //
  //    BEST-EFFORT : un vivier illisible rend `null`, pas `0`. Le composant de
  //    progression masque alors sa barre au lieu d'annoncer « 12 sur 0 ».
  let pool: { distinct: number } | null = null;
  const [poolPlayersRes, poolTeamsRes] = await Promise.all([
    supabaseAdmin
      .from('player_ratings')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .or('is_active.is.null,is_active.eq.true'),
  ]);

  if (poolPlayersRes.error || poolTeamsRes.error) {
    logger.warn(
      '[tcg/collection] vivier illisible: %s',
      poolPlayersRes.error?.message ?? poolTeamsRes.error?.message
    );
  } else {
    const players = Math.min(poolPlayersRes.count ?? 0, POOL_LIMIT);
    const teams = Math.min(poolTeamsRes.count ?? 0, POOL_LIMIT);
    // Les maps ne se comptent pas en base : leur vivier EST le registre, et
    // c'est la même liste que celle passée au tirage — deux comptages séparés
    // finiraient par promettre des cartes qu'aucun paquet ne peut donner.
    const maps = Math.min(MAP_POOL_SLUGS.length, POOL_LIMIT);
    pool = { distinct: players + teams + maps };
  }

  return res.status(200).json({
    cards,
    // Sur la collection ENTIÈRE, pas sur la page : c'est ce que la progression
    // et le compteur affichent, et une page de 40 ne dit rien du total.
    distinct: aggregated.length,
    total: aggregated.reduce((sum, a) => sum + a.count, 0),
    // PAS de répartition par rareté ici, à dessein : la rareté d'un sujet se
    // dérive de ses badges, donc l'obtenir pour tout le vivier demanderait une
    // lecture de profil par sujet — impraticable sur un millier. Le composant
    // masque cette section faute de données ; un dénominateur faux par rareté
    // serait pire qu'un dénominateur absent.
    pool,
    // `null` = dernière page, ou collection servie en entier (sans paramètre).
    nextCursor,
  });
});
