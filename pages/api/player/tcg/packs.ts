// pages/api/player/tcg/packs.ts
//
//   GET  → mes paquets (ouverts et fermés) + mon solde de pièces.
//   POST → ouvrir un paquet : tirer ses cartes et les figer.
//
// LE TIRAGE VIENT AVANT LA CONSOMMATION. On compose le paquet, ET SEULEMENT
// ENSUITE on le marque ouvert. Un vivier vide (aucune joueuse classée, aucune
// équipe active) ne doit pas coûter son paquet à quelqu'un : dans ce cas on
// refuse sans rien toucher.
//
// RÉSERVATION ATOMIQUE, PUIS ANNULATION SI BESOIN.
//   `.is('opened_at', null)` sur la mise à jour : deux clics simultanés ne
//   peuvent pas ouvrir deux fois le même paquet — le second ne touche aucune
//   ligne. Si l'insertion des cartes échoue APRÈS cette réservation, on
//   relâche `opened_at` : mieux vaut un paquet encore fermé qu'un paquet
//   ouvert et vide, que rien ne permettrait de rejouer.
//
// UNE RARETÉ ILLISIBLE NE COÛTE PAS LE PAQUET. `readPlayerBadges` LÈVE sur
// erreur DB irrécupérable ; on l'attrape et on retombe sur `common`. Perdre une nuance de rareté est regrettable, perdre le paquet
// serait pire — et la carte reste juste sur l'essentiel : qui elle représente.

import type { NextApiRequest, NextApiResponse } from 'next';
import { cardFigureOf } from '@/utils/tcg/roleFigures';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
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
// Barèmes du drop en direct et du cadeau d'accueil. Rendus à l'interface pour
// la même raison que le prix du booster : elle les AFFICHE sans les connaître,
// et les recopier côté client les ferait mentir au premier réglage — c'est
// doublement vrai du guide, qui prétend énoncer la règle.
import {
  BATTLENET_VERIFIED_COINS,
  CHECKIN_STREAK_COINS,
  CHECKIN_STREAK_LENGTH,
  COLLECTION_SET_COINS,
  MATCH_PREDICTION_COINS,
  PLACEMENT_TIERS,
  earnReward,
  TWITCH_DROP_COINS,
  WELCOME_GIFT_COINS,
} from '@/utils/tcg/earnSources';
import {
  readFanartFaces,
  readPlayerFaces,
  readTeamFaces,
} from '@/utils/tcg/readCardFaces';
import { readOwnedSubjectKeys } from '@/utils/tcg/readOwnedCards';
import { readDrawPool } from '@/utils/tcg/readDrawPool';
import { checkCollectionSets } from '@/utils/tcg/grantCollectionSets';
import {
  decodePacksCursor,
  encodePacksCursor,
  parsePageLimit,
  type PacksCursor,
} from '@/utils/tcg/pageCursor';
// Le prix ET le barème sont rendus par l'API plutôt que recopiés dans la page :
// importer `economy.ts` côté client ferait entrer le moteur de rating dont il
// dérive le barème dans le bundle navigateur.
import {
  BOOSTER_PRICE_COINS,
  MATCH_WIN_COINS,
  SCRIM_WIN_COINS,
  RECYCLE_REFUND_COINS,
} from '@/utils/tcg/economy';
import { logger } from '@/utils/logger';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const tenantId = resolveTenantIdForUserRequest(req);

  if (req.method === 'GET') return listPacks(req, res, user.id, tenantId);
  if (req.method === 'POST') return openPack(req, res, user.id, tenantId);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
});

/* -------------------------------------------------------------------------- */
/* GET — mes paquets et mon solde                                              */
/* -------------------------------------------------------------------------- */

/** Taille de page par défaut : l'ancienne borne fixe, pour rester rétrocompatible. */
const DEFAULT_PACKS_LIMIT = 200;

async function listPacks(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  tenantId: string
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-tcg-packs')
  )
    return;

  // PAGINATION PAR CURSEUR, RÉTROCOMPATIBLE. Sans paramètre, la réponse est
  // celle d'avant — les 200 paquets les plus récents — plus `nextCursor`, qui
  // dit enfin s'il en existe d'autres au lieu de les taire.
  //   - `limit`  : 1..200, défaut 200 (l'ancienne borne) ;
  //   - `cursor` : rendu par la page précédente, opaque ;
  //   - `status` : `unopened` | `opened`. L'espace joueuse n'affiche QUE les
  //     paquets à ouvrir : sans ce filtre, un paquet fermé plus ancien que les
  //     200 derniers ne s'afficherait jamais, et ne pourrait donc pas s'ouvrir.
  const limitParam = parsePageLimit(req.query.limit);
  if (limitParam === 'invalid') {
    return res
      .status(400)
      .json({ error: 'Paramètre limit invalide.', code: 'invalid_limit' });
  }
  const limit = limitParam ?? DEFAULT_PACKS_LIMIT;

  let cursor: PacksCursor | null = null;
  if (req.query.cursor !== undefined) {
    cursor = decodePacksCursor(req.query.cursor);
    if (!cursor) {
      return res
        .status(400)
        .json({ error: 'Curseur invalide.', code: 'invalid_cursor' });
    }
  }

  const status = req.query.status;
  if (status !== undefined && status !== 'unopened' && status !== 'opened') {
    return res
      .status(400)
      .json({ error: 'Paramètre status invalide.', code: 'invalid_status' });
  }

  // Solde et barème changent d'un appel à l'autre : rien à garder en cache.
  res.setHeader('Cache-Control', 'private, no-store');

  let packsQuery = supabaseAdmin!
    .from('tcg_packs')
    .select('id, source_kind, granted_at, opened_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    // Un paquet `trade` n'est pas un paquet REÇU : il recueille les cartes d'un
    // échange accepté, ouvert d'emblée (`tcg_card_trades.sql`). Ses cartes sont
    // dans la collection ; le lister ici annoncerait un paquet jamais gagné.
    .neq('source_kind', 'trade');
  if (status === 'unopened') packsQuery = packsQuery.is('opened_at', null);
  if (status === 'opened') packsQuery = packsQuery.not('opened_at', 'is', null);
  if (cursor) {
    // « Strictement après » dans l'ordre (granted_at DESC, id DESC). Les deux
    // valeurs sont interpolées, d'où la validation de forme exacte dans
    // `decodePacksCursor` : ni virgule ni parenthèse ne peut y entrer.
    packsQuery = packsQuery.or(
      `granted_at.lt.${cursor.grantedAt},and(granted_at.eq.${cursor.grantedAt},id.lt.${cursor.id})`
    );
  }

  const [packsRes, walletRes, unopenedRes] = await Promise.all([
    packsQuery
      .order('granted_at', { ascending: false })
      // Second critère : plusieurs paquets peuvent partager une date
      // d'attribution (un cadeau distribué en lot). Sans lui, l'ordre des ex
      // æquo n'est pas garanti et le curseur sauterait ou répéterait un paquet.
      .order('id', { ascending: false })
      // Une ligne de plus que demandé : c'est elle qui dit s'il reste une page.
      .limit(limit + 1),
    supabaseAdmin!
      .from('tcg_wallets')
      .select('balance')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle(),
    // `unopened` est désormais un COMPTE, pas le filtrage de la page lue : avec
    // plus de 200 paquets, l'ancien calcul annonçait moins de paquets à ouvrir
    // qu'il n'en existait. `head: true` ne ramène aucune ligne.
    supabaseAdmin!
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .is('opened_at', null),
  ]);

  if (packsRes.error) {
    logger.error('[tcg/packs] lecture impossible: %s', packsRes.error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const rows = (packsRes.data ?? []) as Array<{
    id: string;
    source_kind: string;
    granted_at: string;
    opened_at: string | null;
  }>;
  const hasMore = rows.length > limit;
  const packs = hasMore ? rows.slice(0, limit) : rows;
  const last = packs[packs.length - 1];
  const nextCursor =
    hasMore && last
      ? encodePacksCursor({ grantedAt: last.granted_at, id: last.id })
      : null;

  // Compte illisible : on retombe sur l'ancien calcul (la page lue) plutôt que
  // de faire échouer l'écran pour un chiffre d'appoint.
  const unopened =
    !unopenedRes.error && typeof unopenedRes.count === 'number'
      ? unopenedRes.count
      : packs.filter((p) => !p.opened_at).length;

  return res.status(200).json({
    packs: packs.map((p) => ({
      id: p.id,
      source: p.source_kind,
      grantedAt: p.granted_at,
      openedAt: p.opened_at,
    })),
    unopened,
    nextCursor,
    // Pas de ligne de porte-monnaie = solde nul : état normal de quelqu'un qui
    // n'a encore rien gagné.
    balance: (walletRes.data as { balance?: number } | null)?.balance ?? 0,
    // Source unique du prix : l'interface l'affiche, elle ne le connaît pas.
    boosterPrice: BOOSTER_PRICE_COINS,
    // CE QUE RAPPORTE UNE VICTOIRE. Sans ce barème, la page montrait un solde
    // et un bouton d'achat sans jamais dire comment gagner des pièces : à zéro,
    // on voyait un prix et aucun chemin pour l'atteindre. Rendu par l'API pour
    // la même raison que le prix — l'interface l'affiche sans le connaître.
    earn: {
      matchWin: MATCH_WIN_COINS,
      scrimWin: SCRIM_WIN_COINS,
      // INCONDITIONNEL, à la différence du drop : c'est l'énoncé d'une règle
      // (« le cadeau d'accueil vaut tant »), pas la promesse d'en recevoir un.
      // Les deux cadeaux — édition et supportrice — valent le même montant.
      welcomeGift: WELCOME_GIFT_COINS,
      // Les voies ajoutées le 2026-09-15, pour que le guide énonce TOUTE la
      // règle sans la recopier. Inconditionnelles comme le cadeau d'accueil :
      // ce sont des barèmes, pas des promesses. `packs` dit si un paquet
      // accompagne les pièces — la vérification et les séries n'en donnent pas.
      checkinStreak: {
        length: CHECKIN_STREAK_LENGTH,
        coins: CHECKIN_STREAK_COINS,
        packs: earnReward('checkin_streak').packs,
      },
      placement: PLACEMENT_TIERS.map((tier) => ({
        maxRank: tier.maxRank,
        coins: tier.coins,
        packs: tier.packs,
      })),
      battlenetVerified: {
        coins: BATTLENET_VERIFIED_COINS,
        packs: earnReward('battlenet_verified').packs,
      },
      collectionSet: {
        coins: COLLECTION_SET_COINS,
        packs: earnReward('collection_set').packs,
      },
      // Pronostic juste : gratuit, en pièces seules (`MATCH_PREDICTION_COINS`).
      matchPrediction: {
        coins: MATCH_PREDICTION_COINS,
        packs: earnReward('match_prediction').packs,
      },
      // Le drop en direct n'est annoncé QUE s'il est réellement branché.
      // Promettre « et N pièces sur le stream » à un espace sans chaîne
      // connectée serait une promesse creuse — même discipline que le prix du
      // booster, masqué quand il est inconnu. `undefined` = rien à dire.
      ...(await twitchDropReward(tenantId)),
    },
    // Reprise d'un doublon. Rendue pour la même raison que le prix : le bouton
    // « Recycler (+N) » doit annoncer un montant JUSTE, et le recopier côté
    // client le ferait mentir au premier réglage du barème.
    recycleRefund: RECYCLE_REFUND_COINS,
  });
}

/**
 * Le barème du drop Twitch, ou rien.
 *
 * POURQUOI CONDITIONNEL. Le drop n'existe que si une chaîne est connectée ET
 * qu'une récompense de points de chaîne lui est désignée
 * (`twitch_broadcaster_connections.tcg_reward_id`). Annoncer le barème sans
 * cela ferait miroiter un moyen de gagner qui n'aboutirait jamais, et le
 * webhook rembourserait chaque tentative en répondant `reward_not_configured`.
 *
 * Ne lève jamais : une lecture en échec fait taire l'annonce plutôt que de
 * casser la page des paquets. Perdre une mention vaut mieux que perdre l'écran.
 */
async function twitchDropReward(
  tenantId: string
): Promise<{ twitchDrop?: number }> {
  if (!supabaseAdmin) return {};
  try {
    const { data, error } = await supabaseAdmin
      .from('twitch_broadcaster_connections')
      .select('tcg_reward_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) return {};
    const reward = (data as { tcg_reward_id?: unknown } | null)?.tcg_reward_id;
    return typeof reward === 'string' && reward.length > 0
      ? { twitchDrop: TWITCH_DROP_COINS }
      : {};
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/* POST — ouvrir un paquet                                                     */
/* -------------------------------------------------------------------------- */

async function openPack(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  tenantId: string
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'player-tcg-open')
  )
    return;

  const packId = String((req.body ?? {}).packId ?? '');
  if (!packId) {
    return res
      .status(400)
      .json({ error: 'Paquet manquant.', code: 'missing_pack' });
  }

  // 1) Le paquet doit m'appartenir et être fermé. On le LIT d'abord : la
  //    réservation viendra après le tirage, pour ne pas consommer un paquet
  //    qu'on ne saurait pas remplir.
  const { data: packRow, error: packError } = await supabaseAdmin!
    .from('tcg_packs')
    .select('id, opened_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('id', packId)
    .maybeSingle();

  if (packError) {
    logger.error('[tcg/packs] lecture paquet: %s', packError.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (!packRow) {
    // 404 et non 403 : on ne confirme pas l'existence d'un paquet qui n'est
    // pas le sien.
    return res.status(404).json({ error: 'Paquet introuvable.' });
  }
  if ((packRow as { opened_at: string | null }).opened_at) {
    return res
      .status(409)
      .json({ error: 'Paquet déjà ouvert.', code: 'already_opened' });
  }

  // 2) Les viviers — lus par le module PARTAGÉ avec les séries
  //    (`readDrawPool`) : une série ne doit exiger aucune carte qu'un paquet ne
  //    puisse donner, et la seule façon d'en être sûr est une lecture unique.
  const pool = await readDrawPool(tenantId);
  if (!pool.ok) {
    logger.error('[tcg/packs] viviers illisibles: %s', pool.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const { playerIds, teamIds, fanartIds } = pool.value;

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
    fanartIds,
    // Mascottes du jeu : même emplacement de DÉCOR, une fois sur quatre.
    // Registre en mémoire comme les maps — aucune requête de plus.
    mascotSlugs: GAME_MASCOT_SLUGS,
    decorRoll: Math.random(),
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
    return res
      .status(409)
      .json({ error: 'Aucune carte disponible.', code: 'empty_pool' });
  }

  // 3) Réservation atomique : `opened_at IS NULL` garantit qu'un seul appel
  //    l'emporte, même sur deux clics simultanés.
  const openedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin!
    .from('tcg_packs')
    .update({ opened_at: openedAt })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('id', packId)
    .is('opened_at', null)
    .select('id');

  if (claimError) {
    logger.error('[tcg/packs] réservation: %s', claimError.message);
    return res.status(500).json({ error: 'Ouverture impossible.' });
  }
  if (!claimed || claimed.length === 0) {
    return res
      .status(409)
      .json({ error: 'Paquet déjà ouvert.', code: 'already_opened' });
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
    tenantId,
    subjects.flatMap((s) => (s.kind === 'player' ? [s.userId] : []))
  );
  const cards = await Promise.all(
    subjects.map(async (subject, position) => {
      const rarity = await rarityOf(subject, tenantId, playerBadges);
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

  const { error: cardsError } = await supabaseAdmin!
    .from('tcg_pack_cards')
    .insert(cards);

  if (cardsError) {
    // On RELÂCHE la réservation : un paquet ouvert et vide ne se rejoue pas.
    logger.error(
      '[tcg/packs] cartes non écrites, réservation relâchée: %s',
      cardsError.message
    );
    const { error: releaseError } = await supabaseAdmin!
      .from('tcg_packs')
      .update({ opened_at: null })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('id', packId);
    if (releaseError) {
      logger.error(
        '[tcg/packs] paquet %s reste ouvert et VIDE: %s',
        packId,
        releaseError.message
      );
    }
    return res.status(500).json({ error: 'Ouverture impossible.' });
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

  return res.status(200).json({
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
  });
}

/** La rareté décidée à la validation. `null` si l'œuvre n'est plus publiable. */
async function readFanartRarity(
  tenantId: string,
  fanartId: string
): Promise<TcgRarity | null> {
  const { data, error } = await supabaseAdmin!
    .from('tcg_fanart_cards')
    .select('rarity')
    .eq('tenant_id', tenantId)
    .eq('id', fanartId)
    .eq('status', 'approved')
    .maybeSingle();
  if (error) {
    logger.warn('[tcg/packs] rareté de fan art illisible: %s', error.message);
    return null;
  }
  return ((data as { rarity?: TcgRarity } | null)?.rarity ?? null) || null;
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
  subject: DrawnSubject,
  tenantId: string,
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
      const rarity = await readFanartRarity(tenantId, subject.fanartId);
      return rarity ?? DEFAULT_FANART_RARITY;
    }

    // Lecture PARTAGÉE avec la page publique d'équipe : recopier ces deux
    // requêtes ici aurait donné deux barèmes jumeaux, libres de diverger.
    return readTeamRarity(tenantId, subject.teamId);
  } catch (err) {
    // Cf. l'en-tête : perdre une nuance de rareté vaut mieux que perdre le
    // paquet. La carte reste juste sur l'essentiel — qui elle représente.
    logger.warn(
      '[tcg/packs] rareté indisponible, repli sur common: %s',
      err instanceof Error ? err.message : String(err)
    );
    return 'common';
  }
}
