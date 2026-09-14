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
// UNE RARETÉ ILLISIBLE NE COÛTE PAS LE PAQUET. `readPlayerProfile` LÈVE sur
// erreur DB irrécupérable ; on l'attrape par sujet et on retombe sur
// `common`. Perdre une nuance de rareté est regrettable, perdre le paquet
// serait pire — et la carte reste juste sur l'essentiel : qui elle représente.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { readPlayerProfile } from '@/utils/rating/readPlayerProfile';
import { cardRarity, isFoil, MAP_CARD_RARITY } from '@/utils/tcg/rarity';
import type { TcgRarity } from '@/utils/tcg/rarity';
import { readTeamRarity } from '@/utils/tcg/readTeamRarity';
import {
  pickPackSubjects,
  PACK_SIZE,
  POOL_LIMIT,
  type DrawnSubject,
} from '@/utils/tcg/drawPack';
import { readMapFaces, MAP_POOL_SLUGS } from '@/utils/tcg/readMapFaces';
// Barèmes du drop en direct et du cadeau d'accueil. Rendus à l'interface pour
// la même raison que le prix du booster : elle les AFFICHE sans les connaître,
// et les recopier côté client les ferait mentir au premier réglage — c'est
// doublement vrai du guide, qui prétend énoncer la règle.
import {
  TWITCH_DROP_COINS,
  WELCOME_GIFT_COINS,
} from '@/utils/tcg/earnSources';
import { readPlayerFaces, readTeamFaces } from '@/utils/tcg/readCardFaces';
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

  const [packsRes, walletRes] = await Promise.all([
    supabaseAdmin!
      .from('tcg_packs')
      .select('id, source_kind, granted_at, opened_at')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('granted_at', { ascending: false })
      .limit(200),
    supabaseAdmin!
      .from('tcg_wallets')
      .select('balance')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (packsRes.error) {
    logger.error('[tcg/packs] lecture impossible: %s', packsRes.error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const packs = (packsRes.data ?? []) as Array<{
    id: string;
    source_kind: string;
    granted_at: string;
    opened_at: string | null;
  }>;

  return res.status(200).json({
    packs: packs.map((p) => ({
      id: p.id,
      source: p.source_kind,
      grantedAt: p.granted_at,
      openedAt: p.opened_at,
    })),
    unopened: packs.filter((p) => !p.opened_at).length,
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

  // 2) Les viviers.
  const [playersRes, teamsRes] = await Promise.all([
    supabaseAdmin!
      .from('player_ratings')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .limit(POOL_LIMIT),
    supabaseAdmin!
      .from('teams')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      // `is_active` est NULLABLE (défaut `true`). `.neq('is_active', false)`
      // exclurait les lignes NULL — en SQL, `NULL <> false` ne vaut pas vrai.
      // Une équipe au drapeau non renseigné disparaîtrait donc du vivier sans
      // que rien ne le signale. `or(...)` accepte les deux formes de « active ».
      .or('is_active.is.null,is_active.eq.true')
      .limit(POOL_LIMIT),
  ]);

  if (playersRes.error || teamsRes.error) {
    logger.error(
      '[tcg/packs] viviers illisibles: %s',
      playersRes.error?.message ?? teamsRes.error?.message
    );
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const playerIds = ((playersRes.data ?? []) as Array<{ user_id: string }>).map(
    (r) => r.user_id
  );
  const teamIds = ((teamsRes.data ?? []) as Array<{ id: string }>).map(
    (r) => r.id
  );

  const subjects = pickPackSubjects({
    playerIds,
    teamIds,
    // Le vivier des maps n'est pas lu en base : c'est un registre en mémoire
    // (`config/maps/overwatch.ts`), Overwatch n'exposant aucune API de maps.
    // Aucune requête de plus, donc, et la même liste sert de dénominateur à la
    // progression de collection.
    mapSlugs: MAP_POOL_SLUGS,
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
  const cards = await Promise.all(
    subjects.map(async (subject, position) => {
      const rarity = await rarityOf(subject, tenantId);
      return {
        pack_id: packId,
        position,
        subject_kind: subject.kind,
        card_user_id: subject.kind === 'player' ? subject.userId : null,
        card_team_id: subject.kind === 'team' ? subject.teamId : null,
        card_map_slug: subject.kind === 'map' ? subject.slug : null,
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

  const [playerFaces, teamFaces, mapFaces] = await Promise.all([
    readPlayerFaces(tenantId, drawnPlayerIds),
    readTeamFaces(tenantId, drawnTeamIds),
    // Sans `tenantId` : une map appartient au registre commun, pas au tenant.
    readMapFaces(drawnMapSlugs),
  ]);

  return res.status(200).json({
    packId,
    openedAt,
    // Même forme que `/api/player/tcg/collection`, à `count` près : la page
    // rend les deux avec le même composant, elle ne doit pas connaître deux
    // vocabulaires pour la même carte.
    cards: cards.map((c) => {
      const base = {
        position: c.position,
        rarity: c.rarity,
        isFoil: c.is_foil,
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
      };
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Rareté d'un sujet                                                           */
/* -------------------------------------------------------------------------- */

async function rarityOf(
  subject: DrawnSubject,
  tenantId: string
): Promise<TcgRarity> {
  try {
    if (subject.kind === 'player') {
      const profile = await readPlayerProfile(subject.userId, tenantId);
      return cardRarity(profile?.achievements.badges ?? []);
    }

    if (subject.kind === 'map') {
      // Rareté FIXE, et aucune lecture : une map n'a pas de palmarès, donc pas
      // de prestige à mesurer. Le détail du raisonnement est dans
      // `utils/tcg/rarity.ts`, où vivent toutes les décisions de rareté.
      return MAP_CARD_RARITY;
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
