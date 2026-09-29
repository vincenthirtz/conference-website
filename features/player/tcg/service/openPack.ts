// features/player/tcg/service/openPack.ts — POST /api/player/tcg/packs :
// ouvrir un paquet, tirer ses cartes et les figer (lot P14, extrait tel quel
// de pages/api/player/tcg/packs.ts : même ordre, mêmes refus).
//
// LE TIRAGE VIENT AVANT LA CONSOMMATION : un vivier vide ne coûte pas son
// paquet (`empty_pool`, rien touché).
//
// RÉSERVATION ATOMIQUE, PUIS ANNULATION SI BESOIN : `opened_at IS NULL` sur la
// mise à jour (`repo.claimPack`) — deux clics simultanés ne peuvent pas ouvrir
// deux fois le même paquet. Si l'écriture des cartes échoue APRÈS, on relâche :
// mieux vaut un paquet encore fermé qu'un paquet ouvert et vide.
// L'Idempotency-Key de la route S'AJOUTE à cette garde, elle ne la remplace pas.
//
// UNE RARETÉ ILLISIBLE NE COÛTE PAS LE PAQUET : repli sur `common`.
//
// LES FACES sont relues par les lecteurs de la collection (`readCardFaces`) :
// la révélation hérite de la garantie de consentement photo.

import type { Logger } from '@/utils/logger';
import { cardFigureOf } from '@/utils/tcg/roleFigures';
import { readPlayerBadges } from '@/utils/rating/readPlayerBadges';
import {
  cardRarity,
  isFoil,
  MAP_CARD_RARITY,
  MASCOT_CARD_RARITY,
} from '@/utils/tcg/rarity';
import { DEFAULT_FANART_RARITY } from '@/utils/tcg/fanart';
import type { TcgRarity } from '@/utils/tcg/rarity';
import type { ProfileBadge } from '@/types/rating';
import { readTeamRarity } from '@/utils/tcg/readTeamRarity';
import {
  pickPackSubjects,
  PACK_SIZE,
  type DrawnSubject,
} from '@/utils/tcg/drawPack';
import { readMapFaces, MAP_POOL_SLUGS } from '@/utils/tcg/readMapFaces';
import {
  GAME_MASCOT_SLUGS,
  gameMascotDisplayName,
} from '@/utils/tcg/gameMascots';
import {
  readFanartFaces,
  readPlayerFaces,
  readTeamFaces,
} from '@/utils/tcg/readCardFaces';
import { readOwnedSubjectKeys } from '@/utils/tcg/readOwnedCards';
import { readDrawPool } from '@/utils/tcg/readDrawPool';
import { checkCollectionSets } from '@/utils/tcg/grantCollectionSets';
import * as repo from '../repository/core';
import { OpenPackBody } from '../schemas';
import { parseOrRefuse, refuse } from './errors';
import type { TcgServiceContext } from './context';

export async function openPack(ctx: TcgServiceContext, rawBody: unknown) {
  const { db, tenantId, userId, logger } = ctx;
  const { packId } = parseOrRefuse(OpenPackBody, rawBody, {
    message: 'Paquet manquant.',
    code: 'missing_pack',
  });

  // 1) Le paquet doit m'appartenir et être fermé. On le LIT d'abord : la
  //    réservation viendra après le tirage.
  const { pack, error: packError } = await repo.readOwnPack(db, {
    tenantId,
    userId,
    packId,
  });
  if (packError) {
    logger.error('[tcg/packs] lecture paquet: %s', packError.message);
    throw refuse(500, 'Lecture impossible.');
  }
  // 404 et non 403 : on ne confirme pas l'existence d'un paquet d'autrui.
  if (!pack) throw refuse(404, 'Paquet introuvable.');
  if (pack.opened_at) {
    throw refuse(409, 'Paquet déjà ouvert.', 'already_opened');
  }

  // 2) Les viviers — lus par le module PARTAGÉ avec les séries
  //    (`readDrawPool`) : une série ne doit exiger aucune carte qu'un paquet ne
  //    puisse donner, et la seule façon d'en être sûr est une lecture unique.
  const pool = await readDrawPool(tenantId);
  if (!pool.ok) {
    logger.error('[tcg/packs] viviers illisibles: %s', pool.error);
    throw refuse(500, 'Lecture impossible.');
  }
  const { playerIds, teamIds, fanartIds } = pool.value;

  // LA CARTE GARANTIE (récompense Twitch « mise en avant »). Elle prend
  // l'emplacement de DÉCOR, jamais celui d'une joueuse : le paquet garde sa
  // composition. Seulement si elle est ENCORE dans le vivier — une carte
  // retirée depuis l'attribution ne sort pas, le paquet est tiré normalement.
  const guaranteed = pack.guaranteed_fanart_id;
  const forcedFanart =
    guaranteed && fanartIds.includes(guaranteed) ? guaranteed : null;

  const subjects = pickPackSubjects({
    playerIds,
    teamIds,
    // Le vivier des maps n'est pas lu en base : c'est un registre en mémoire
    // (`config/maps/overwatch.ts`), Overwatch n'exposant aucune API de maps.
    // Aucune requête de plus, donc, et la même liste sert de dénominateur à la
    // progression de collection.
    mapSlugs: MAP_POOL_SLUGS,
    // Fan arts validées : elles partagent l'emplacement de DÉCOR avec les maps
    // (une fois sur deux), jamais celui d'une joueuse.
    // Carte garantie : seule fan art candidate, et un tirage de décor à 0
    // (la fan art passe en premier dans `pickDecorKind`).
    fanartIds: forcedFanart ? [forcedFanart] : fanartIds,
    // Mascottes du jeu : même emplacement de DÉCOR, une fois sur quatre.
    // Registre en mémoire comme les maps — aucune requête de plus.
    mascotSlugs: GAME_MASCOT_SLUGS,
    decorRoll: forcedFanart ? 0 : Math.random(),
    // Quatre fois la taille du paquet : trois viviers, chacun avec son repli.
    // Un tableau trop court n'échouerait pas — `pickDistinct` retombe sur « le
    // premier disponible » — mais rendrait le tirage discrètement moins
    // aléatoire, ce qui ne se verrait sur aucun test.
    rolls: Array.from({ length: PACK_SIZE * 4 }, () => Math.random()),
  });

  if (subjects.length === 0) {
    // Rien à distribuer : le paquet reste FERMÉ, il sera ouvrable plus tard.
    //
    // DEVENU QUASI INATTEIGNABLE depuis l'arrivée des cartes de map : le vivier
    // des maps est un registre en mémoire, jamais vide, donc un tenant sans
    // aucune joueuse ni équipe classée reçoit un paquet de maps plutôt qu'un
    // refus — et c'est mieux ainsi, un paquet non vide valant mieux qu'un
    // paquet refusé. La garde reste en place parce qu'elle ne coûte rien et
    // qu'elle couvre le jour où le registre serait vidé ; elle n'est plus la
    // protection qu'elle était, et le dire vaut mieux que le laisser croire.
    throw refuse(409, 'Aucune carte disponible.', 'empty_pool');
  }

  // 3) Réservation atomique : `opened_at IS NULL` garantit qu'un seul appel
  //    l'emporte, même sur deux clics simultanés.
  const openedAt = new Date().toISOString();
  const { claimed, error: claimError } = await repo.claimPack(db, {
    tenantId,
    userId,
    packId,
    openedAt,
  });
  if (claimError) {
    logger.error('[tcg/packs] réservation: %s', claimError.message);
    throw refuse(500, 'Ouverture impossible.');
  }
  if (claimed.length === 0) {
    throw refuse(409, 'Paquet déjà ouvert.', 'already_opened');
  }

  // 4) La rareté des sujets tirés — cinq calculs, pas un par candidate.
  //
  // Les badges des joueuses tirées sont lus EN UNE FOIS : la rareté appelait
  // `readPlayerProfile` par carte (~17 allers-retours base + GoTrue chacun,
  // pour n'en garder que les badges). La promesse est lancée sans être
  // attendue, pour courir en même temps que les lectures d'équipe et de fan
  // art ; `rarityOf` l'attend. Mêmes badges, même barème : voir la garantie de
  // parité de `utils/rating/readPlayerBadges.ts`.
  const playerBadges = readDrawnPlayerBadges(
    logger,
    tenantId,
    subjects.flatMap((s) => (s.kind === 'player' ? [s.userId] : []))
  );
  const cards: repo.PackCardInsert[] = await Promise.all(
    subjects.map(async (subject, position) => {
      const rarity = await rarityOf(ctx, subject, playerBadges);
      return {
        pack_id: packId,
        position,
        subject_kind: subject.kind,
        card_user_id: subject.kind === 'player' ? subject.userId : null,
        card_team_id: subject.kind === 'team' ? subject.teamId : null,
        card_map_slug: subject.kind === 'map' ? subject.slug : null,
        card_mascot_slug: subject.kind === 'mascot' ? subject.slug : null,
        card_fanart_id: subject.kind === 'fanart' ? subject.fanartId : null,
        rarity,
        is_foil: isFoil(Math.random()),
      };
    })
  );

  const { error: cardsError } = await repo.insertPackCards(db, cards);
  if (cardsError) {
    // On RELÂCHE la réservation : un paquet ouvert et vide ne se rejoue pas.
    logger.error(
      '[tcg/packs] cartes non écrites, réservation relâchée: %s',
      cardsError.message
    );
    const { error: releaseError } = await repo.releasePackClaim(db, {
      tenantId,
      userId,
      packId,
    });
    if (releaseError) {
      logger.error(
        '[tcg/packs] paquet %s reste ouvert et VIDE: %s',
        packId,
        releaseError.message
      );
    }
    throw refuse(500, 'Ouverture impossible.');
  }

  // 5) LES FACES DES CARTES TIRÉES — pour que l'ouverture se VOIE.
  //
  // Sans elles, la réponse ne portait que des identifiants : la page ne pouvait
  // rien montrer et se contentait de recharger la collection, où les nouvelles
  // cartes se fondaient en silence. Ouvrir un paquet sans découvrir ce qu'on a
  // obtenu, c'est retirer à un TCG son seul moment.
  //
  // On réutilise les lecteurs de la collection, et ce n'est pas qu'une économie
  // de code : ce sont eux qui portent la garantie de consentement (photo
  // `approved` ET non révoquée). La révélation en hérite, au lieu d'ouvrir une
  // seconde voie d'accès aux photos qu'il faudrait sécuriser séparément.
  // `drawn*` et non `playerIds` / `teamIds` : ces deux noms désignent déjà les
  // VIVIERS plus haut dans la fonction. Les réutiliser ici ne mélangeait pas
  // seulement deux notions — le tout du vivier et les cinq tirés — c'était une
  // redéclaration qui empêchait le module de compiler, donc un 500 sur la
  // route entière, GET compris.
  const drawnPlayerIds = cards
    .filter((c) => c.subject_kind === 'player')
    .map((c) => c.card_user_id as string);
  const drawnTeamIds = cards
    .filter((c) => c.subject_kind === 'team')
    .map((c) => c.card_team_id as string);
  const drawnMapSlugs = cards
    .filter((c) => c.subject_kind === 'map')
    .map((c) => c.card_map_slug as string);
  const drawnFanartIds = cards
    .filter((c) => c.subject_kind === 'fanart')
    .map((c) => c.card_fanart_id as string);

  const [
    playerFaces,
    teamFaces,
    mapFaces,
    fanartFaces,
    ownedBefore,
    setsCheck,
  ] = await Promise.all([
    readPlayerFaces(tenantId, drawnPlayerIds),
    readTeamFaces(tenantId, drawnTeamIds),
    // Sans `tenantId` : une map appartient au registre commun, pas au tenant.
    readMapFaces(drawnMapSlugs),
    readFanartFaces(tenantId, drawnFanartIds),
    // « Nouvelle carte ou doublon ? » — la question qu'on se pose en ouvrant.
    // La page la déduisait de la collection chargée, ce qui devient faux dès
    // que celle-ci est paginée : une carte possédée mais pas encore affichée
    // passerait pour nouvelle. Ciblé sur les sujets tirés, hors de CE paquet.
    readOwnedSubjectKeys(
      tenantId,
      userId,
      { players: drawnPlayerIds, teams: drawnTeamIds, maps: drawnMapSlugs },
      packId
    ),
    // SÉRIES : ce paquet en a-t-il complété une ? C'est le moment où la
    // récompense a du sens (et où l'annonce part). Best-effort : les cartes
    // sont écrites, une série non vérifiée ici sera rattrapée à la lecture
    // suivante de `/api/player/tcg/sets` — la clé du registre empêche tout
    // double crédit entre les deux voies. Ne lève jamais.
    checkCollectionSets({ tenantId, userId }),
  ]);
  if (!setsCheck.ok) {
    logger.warn('[tcg/packs] séries non vérifiées: %s', setsCheck.error);
  }

  // BEST-EFFORT : une lecture en échec n'annule pas une ouverture déjà écrite.
  // `isNew` est alors OMIS — l'interface n'affiche aucun badge plutôt qu'un
  // badge faux. Un sujet tiré deux fois dans le même paquet n'est « nouveau »
  // qu'à sa première position : la seconde est déjà un doublon.
  if (!ownedBefore.ok) {
    logger.warn('[tcg/packs] nouveauté illisible: %s', ownedBefore.error);
  }
  const seenInPack = new Set<string>();
  const isNewAt = (key: string): { isNew?: boolean } => {
    if (!ownedBefore.ok) return {};
    const fresh = !ownedBefore.value.has(key) && !seenInPack.has(key);
    seenInPack.add(key);
    return { isNew: fresh };
  };

  return {
    packId,
    openedAt,
    // AJOUT RÉTROCOMPATIBLE : les séries que CE paquet vient de compléter et
    // dont la récompense vient d'être écrite. Vide sur un rejeu, et vide si la
    // vérification a échoué (rattrapée plus tard).
    setsCompleted: setsCheck.ok ? setsCheck.newlyRewarded : [],
    // Même forme que `/api/player/tcg/collection`, à `count` près : la page
    // rend les deux avec le même composant, elle ne doit pas connaître deux
    // vocabulaires pour la même carte.
    cards: cards.map((c) => {
      const base = {
        position: c.position,
        rarity: c.rarity,
        isFoil: c.is_foil,
        ...isNewAt(
          `${c.subject_kind}:${c.card_user_id ?? c.card_team_id ?? c.card_map_slug ?? c.card_fanart_id}`
        ),
      };
      if (c.subject_kind === 'player') {
        const face = playerFaces.get(c.card_user_id as string);
        return {
          ...base,
          kind: 'player' as const,
          userId: c.card_user_id,
          teamId: null,
          displayName: face?.displayName ?? null,
          imageUrl: face?.imageUrl ?? null,
          figure: cardFigureOf(face),
        };
      }
      if (c.subject_kind === 'fanart') {
        const face = fanartFaces.get(c.card_fanart_id as string);
        return {
          ...base,
          kind: 'fanart' as const,
          userId: null,
          teamId: null,
          fanartId: c.card_fanart_id,
          // Le crédit voyage AVEC la carte : une fan art sans son autrice
          // n'est pas une carte, c'est une œuvre prise sans le dire.
          title: face?.title ?? null,
          artistName: face?.artistName ?? null,
          artistUrl: face?.artistUrl ?? null,
          imageUrl: face?.imageUrl ?? null,
          category: face?.category ?? 'fanart',
        };
      }
      if (c.subject_kind === 'mascot') {
        // Une mascotte n'a ni photo ni page : son nom vient du registre, son
        // visuel est calculé par la carte depuis son slug. Rien à lire en base
        // au-delà du slug lui-même.
        return {
          ...base,
          kind: 'mascot' as const,
          userId: null,
          teamId: null,
          slug: c.card_mascot_slug,
          name: gameMascotDisplayName(c.card_mascot_slug as string),
        };
      }
      if (c.subject_kind === 'map') {
        const face = mapFaces.get(c.card_map_slug as string);
        return {
          ...base,
          kind: 'map' as const,
          userId: null,
          teamId: null,
          slug: c.card_map_slug,
          name: face?.name ?? null,
          imageUrl: face?.imageUrl ?? null,
        };
      }
      const face = teamFaces.get(c.card_team_id as string);
      return {
        ...base,
        kind: 'team' as const,
        userId: null,
        teamId: c.card_team_id,
        name: face?.name ?? null,
        slug: face?.slug ?? null,
        logoUrl: face?.logoUrl ?? null,
        cardImageUrl: face?.cardImageUrl ?? null,
        // Même règle que la collection : la révélation montre la carte au
        // moment où on la découvre, c'est là que le crédit compte le plus.
        logoCredit: face?.logoCredit ?? null,
      };
    }),
  };
}

/** La rareté décidée à la validation. `null` si l'œuvre n'est plus publiable. */
async function readFanartRarity(
  ctx: TcgServiceContext,
  fanartId: string
): Promise<TcgRarity | null> {
  const { rarity, error } = await repo.readApprovedFanartRarity(ctx.db, {
    tenantId: ctx.tenantId,
    fanartId,
  });
  if (error) {
    ctx.logger.warn(
      '[tcg/packs] rareté de fan art illisible: %s',
      error.message
    );
    return null;
  }
  return ((rarity as TcgRarity | null) ?? null) || null;
}

/* -------------------------------------------------------------------------- */
/* Rareté d'un sujet                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Badges des joueuses tirées, ou `null` si la lecture a échoué. Ne rejette
 * jamais : la promesse est créée avant d'être attendue, et un rejet pas encore
 * écouté serait signalé comme non géré.
 *
 * Aucune joueuse tirée = aucune lecture (`readPlayerBadges` rend alors une Map
 * vide sans toucher la base).
 */
async function readDrawnPlayerBadges(
  logger: Logger,
  tenantId: string,
  userIds: string[]
): Promise<Map<string, ProfileBadge[]> | null> {
  try {
    return await readPlayerBadges(tenantId, userIds);
  } catch (err) {
    // Cf. l'en-tête : perdre une nuance de rareté vaut mieux que perdre le
    // paquet. Chaque carte joueuse retombe sur `common`, comme le faisait
    // l'échec de sa lecture de profil.
    logger.warn(
      '[tcg/packs] rareté indisponible, repli sur common: %s',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

async function rarityOf(
  ctx: TcgServiceContext,
  subject: DrawnSubject,
  playerBadges: Promise<Map<string, ProfileBadge[]> | null>
): Promise<TcgRarity> {
  try {
    if (subject.kind === 'player') {
      const badges = await playerBadges;
      return cardRarity(badges?.get(subject.userId) ?? []);
    }

    if (subject.kind === 'map') {
      // Rareté FIXE, et aucune lecture : une map n'a pas de palmarès, donc pas
      // de prestige à mesurer. Le détail du raisonnement est dans
      // `utils/tcg/rarity.ts`, où vivent toutes les décisions de rareté.
      return MAP_CARD_RARITY;
    }

    if (subject.kind === 'mascot') {
      // Rareté FIXE, comme les maps : une mascotte n'a pas de palmarès. Le
      // raisonnement complet est dans `utils/tcg/rarity.ts`.
      return MASCOT_CARD_RARITY;
    }

    if (subject.kind === 'fanart') {
      // La rareté d'une fan art est DÉCIDÉE à la validation par le staff : une
      // œuvre n'a pas de palmarès à mesurer. Elle est lue sur la ligne plutôt
      // que recalculée, et un repli prudent couvre l'imprévu.
      const rarity = await readFanartRarity(ctx, subject.fanartId);
      return rarity ?? DEFAULT_FANART_RARITY;
    }

    // Lecture PARTAGÉE avec la page publique d'équipe : recopier ces deux
    // requêtes ici aurait donné deux barèmes jumeaux, libres de diverger.
    return readTeamRarity(ctx.tenantId, subject.teamId);
  } catch (err) {
    // Cf. l'en-tête : perdre une nuance de rareté vaut mieux que perdre le
    // paquet. La carte reste juste sur l'essentiel — qui elle représente.
    ctx.logger.warn(
      '[tcg/packs] rareté indisponible, repli sur common: %s',
      err instanceof Error ? err.message : String(err)
    );
    return 'common';
  }
}
