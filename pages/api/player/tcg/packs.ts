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
import { cardRarity, teamCardRarity, isFoil } from '@/utils/tcg/rarity';
import type { TcgRarity } from '@/utils/tcg/rarity';
import { pickPackSubjects, PACK_SIZE } from '@/utils/tcg/drawPack';
// Le prix est rendu par l'API plutôt que recopié dans la page : importer
// `economy.ts` côté client ferait entrer le moteur de rating dont il dérive le
// barème dans le bundle navigateur.
import { BOOSTER_PRICE_COINS } from '@/utils/tcg/economy';
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
  });
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
      .limit(1000),
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
      .limit(1000),
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
    rolls: Array.from({ length: PACK_SIZE * 2 }, () => Math.random()),
  });

  if (subjects.length === 0) {
    // Rien à distribuer : le paquet reste FERMÉ, il sera ouvrable plus tard.
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

  return res.status(200).json({
    packId,
    openedAt,
    cards: cards.map((c) => ({
      position: c.position,
      kind: c.subject_kind,
      userId: c.card_user_id,
      teamId: c.card_team_id,
      rarity: c.rarity,
      isFoil: c.is_foil,
    })),
  });
}

/* -------------------------------------------------------------------------- */
/* Rareté d'un sujet                                                           */
/* -------------------------------------------------------------------------- */

async function rarityOf(
  subject:
    | { kind: 'player'; userId: string }
    | { kind: 'team'; teamId: string },
  tenantId: string
): Promise<TcgRarity> {
  try {
    if (subject.kind === 'player') {
      const profile = await readPlayerProfile(subject.userId, tenantId);
      return cardRarity(profile?.achievements.badges ?? []);
    }

    const [ratingRes, ranksRes] = await Promise.all([
      supabaseAdmin!
        .from('team_ratings')
        .select('rating')
        .eq('tenant_id', tenantId)
        .eq('team_id', subject.teamId)
        .maybeSingle(),
      supabaseAdmin!
        .from('final_rankings')
        .select('rank')
        .eq('tenant_id', tenantId)
        .eq('team_id', subject.teamId)
        .order('rank', { ascending: true })
        .limit(1),
    ]);

    const rating =
      (ratingRes.data as { rating?: number } | null)?.rating ?? null;
    const bestRank =
      ((ranksRes.data ?? []) as Array<{ rank: number }>)[0]?.rank ?? null;

    return teamCardRarity({ bestRank, rating });
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
