// pages/api/player/tcg/forge.ts
//
// LA FORGE — trois doublons d'une même rareté, plus des pièces, contre une
// carte de joueuse d'une rareté supérieure que l'on ne possède pas.
//
// POURQUOI CET ENDPOINT EXISTE. Au 2026-09-27 : 10 805 pièces gagnées, **zéro
// dépensée**. Le booster à 300 pièces était le seul débit, et il offrait « plus
// de la même chose » — douze comptes pouvaient se l'offrir, aucun ne l'a fait.
// Pendant ce temps les doublons s'entassaient, le recyclage à 30 pièces ayant
// servi UNE fois en tout. La forge relie les deux : elle consomme ce qui ne
// servait à rien pour rendre ce qui manque — la meilleure collection réunissait
// 3 équipes sur 10, personne n'avait jamais complété une série.
//
// TOUTES LES ÉCRITURES SONT DANS UNE TRANSACTION (`tcg_forge_card`). Retirer
// trois cartes, débiter, créer un paquet et y poser la carte n'ont de sens
// qu'ensemble : chaque frontière entre deux d'entre elles est un état absurde.
// Le projet a déjà tranché la question sur le booster, après qu'un 504
// PostgREST entre débit et livraison a fait perdre 300 pièces pour rien.
//
// LA FORGE REND UNE CARTE DE JOUEUSE, ET SEULEMENT ÇA. Ce n'est pas un oubli :
//   - une map (`common`) et une mascotte (`rare`) ont une rareté FIXE — « une
//     rareté supérieure » n'y veut rien dire, elles n'ont pas de palmarès à
//     mesurer ;
//   - une rareté d'équipe se lit par une requête PAR équipe, et le vivier
//     entier serait à parcourir pour en tirer une.
//   Un TCG de compétition parle d'abord de celles qui jouent : c'est le même
//   arbitrage que l'ordre de comblement d'un paquet (`utils/tcg/drawPack.ts`).
//
// LE TIRAGE EXCLUT CE QU'ON POSSÈDE DÉJÀ. C'est ce qui distingue la forge du
// booster et justifie son prix : on paie moins cher, pour moins de cartes, avec
// une certitude que le hasard n'offre pas.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { planForge, type ForgeCandidate } from '@/utils/tcg/forge';
import { cardRarity, type TcgRarity } from '@/utils/tcg/rarity';
import { cardSubjectKey } from '@/utils/tcg/subjectKey';
import {
  readCardsOfPacks,
  readOpenedPackIds,
} from '@/utils/tcg/readOwnedCards';
import { readDrawPool } from '@/utils/tcg/readDrawPool';
import { readPlayerBadges } from '@/utils/rating/readPlayerBadges';
import { logger } from '@/utils/logger';

export type ForgeResponse =
  | {
      packId: string;
      userId: string;
      rarity: TcgRarity;
      balance: number;
    }
  | { error: string; code?: string };

export default withAuthRoute(handler);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ForgeResponse>,
  { user }: { user: { id: string } }
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  // Une forge écrit quatre lignes et en détruit trois : le plafond est plus bas
  // que celui d'une lecture, et du même ordre que le recyclage.
  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'tcg-forge')) {
    return;
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible.' });
  }

  const tenantId = resolveTenantIdForUserRequest(req);
  const userId = user.id;

  const selection = parseSelection(req.body);
  if (!selection) {
    return res
      .status(400)
      .json({ error: 'Cartes à forger attendues.', code: 'invalid_body' });
  }

  // 1) Ma collection. Une carte d'un paquet fermé n'est pas encore possédée ;
  //    une carte d'un paquet qui n'est pas le mien ne l'est pas du tout.
  const packsRead = await readOpenedPackIds(tenantId, userId);
  if (!packsRead.ok) {
    logger.error('[tcg/forge] paquets illisibles: %s', packsRead.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const cardsRead = await readCardsOfPacks(packsRead.value);
  if (!cardsRead.ok) {
    logger.error('[tcg/forge] cartes illisibles: %s', cardsRead.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const owned: ForgeCandidate[] = [];
  for (const row of cardsRead.value) {
    const subjectKey = cardSubjectKey(row);
    // Une ligne sans sujet exploitable est une corruption (le CHECK du schéma
    // l'interdit). On l'écarte du calcul plutôt que de la compter comme un
    // doublon de rien.
    if (!subjectKey) continue;
    owned.push({
      packId: row.pack_id,
      position: row.position,
      rarity: row.rarity,
      subjectKey,
      // `readCardsOfPacks` ne rend QUE les cartes vivantes : une carte
      // recyclée n'apparaît pas dans cette liste. Le drapeau reste dans le
      // module pur, où il sert à décrire une collection complète.
      recycled: false,
    });
  }

  const balance = await readBalance(tenantId, userId);
  if (balance === null) {
    return res.status(500).json({ error: 'Solde illisible.' });
  }

  // 2) La décision, entièrement dans le module pur — elle se relit et se teste
  //    sans base.
  const plan = planForge({ selection, owned, balance });
  if (!plan.ok) {
    return res
      .status(409)
      .json({ error: refusalMessage(plan.reason), code: plan.reason });
  }

  // 3) Le sujet forgé : une joueuse du vivier, de la rareté visée, qu'on ne
  //    possède pas encore.
  const target = await pickForgedPlayer({
    tenantId,
    targetRarity: plan.targetRarity,
    ownedSubjectKeys: new Set(
      owned.filter((c) => !c.recycled).map((c) => c.subjectKey)
    ),
  });
  if (!target) {
    // Vivier épuisé pour ce palier : la joueuse possède déjà tout ce qu'on
    // pourrait lui donner. Ce n'est pas une panne, et surtout rien n'a été
    // débité — le refus arrive AVANT la transaction.
    return res.status(409).json({
      error: 'Aucune carte de cette rareté ne te manque pour l’instant.',
      code: 'pool_exhausted',
    });
  }

  // 4) Tout le reste, en une transaction.
  const { data, error } = await supabaseAdmin.rpc('tcg_forge_card', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_cards: plan.consume.map((c) => ({
      packId: c.packId,
      position: c.position,
    })),
    p_fee: plan.feeCoins,
    p_rarity: plan.targetRarity,
    p_subject_kind: 'player',
    p_card_user_id: target,
  });

  if (error) {
    const known = knownFailure(error.message);
    if (known)
      return res.status(409).json({ error: known.message, code: known.code });
    logger.error('[tcg/forge] transaction refusée: %s', error.message);
    return res.status(500).json({ error: 'Forge impossible.' });
  }

  const result = (data ?? {}) as {
    packId?: string;
    balance?: number;
  };
  if (!result.packId) {
    logger.error('[tcg/forge] transaction sans paquet rendu');
    return res.status(500).json({ error: 'Forge impossible.' });
  }

  return res.status(201).json({
    packId: result.packId,
    userId: target,
    rarity: plan.targetRarity,
    balance: result.balance ?? balance - plan.feeCoins,
  });
}

/** `{ cards: [{ packId, position }] }`, ou `null` si la forme ne tient pas. */
function parseSelection(
  body: unknown
): { packId: string; position: number }[] | null {
  const raw = (body as { cards?: unknown } | undefined)?.cards;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) return null;
  const out: { packId: string; position: number }[] = [];
  for (const entry of raw) {
    const packId = (entry as { packId?: unknown })?.packId;
    const position = (entry as { position?: unknown })?.position;
    if (typeof packId !== 'string' || !packId) return null;
    if (typeof position !== 'number' || !Number.isInteger(position))
      return null;
    out.push({ packId, position });
  }
  return out;
}

/** Le solde, lu au REGISTRE : c'est lui qui fait foi, pas son cache. */
async function readBalance(
  tenantId: string,
  userId: string
): Promise<number | null> {
  const { data, error } = await supabaseAdmin!
    .from('tcg_wallet_entries')
    .select('amount')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  if (error) {
    logger.error('[tcg/forge] solde illisible: %s', error.message);
    return null;
  }
  return (data ?? []).reduce(
    (sum, row) => sum + Number((row as { amount?: number }).amount ?? 0),
    0
  );
}

/**
 * Une joueuse du vivier, de la rareté visée, absente de la collection.
 *
 * Tirage UNIFORME parmi les candidates : à ce stade la rareté est déjà fixée
 * par la forge, et pondérer davantage reviendrait à reprendre d'une main la
 * certitude qu'on vend de l'autre.
 */
async function pickForgedPlayer(input: {
  tenantId: string;
  targetRarity: TcgRarity;
  ownedSubjectKeys: ReadonlySet<string>;
}): Promise<string | null> {
  const pool = await readDrawPool(input.tenantId);
  if (!pool.ok) {
    logger.error('[tcg/forge] vivier illisible: %s', pool.error);
    return null;
  }
  const candidates = pool.value.playerIds.filter(
    (id) => !input.ownedSubjectKeys.has(id)
  );
  if (candidates.length === 0) return null;

  // `readPlayerBadges` LÈVE sur erreur : ici, sans badges, on ne peut pas
  // distinguer les raretés, donc on ne forge pas — plutôt que de rendre une
  // `common` à quelqu'un qui vient de payer pour mieux.
  let badges: Map<string, unknown[]>;
  try {
    badges = (await readPlayerBadges(input.tenantId, candidates)) as Map<
      string,
      unknown[]
    >;
  } catch (err) {
    logger.error(
      '[tcg/forge] badges illisibles: %s',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }

  const matching = candidates.filter(
    (id) =>
      cardRarity((badges.get(id) ?? []) as Parameters<typeof cardRarity>[0]) ===
      input.targetRarity
  );
  if (matching.length === 0) return null;
  return matching[Math.floor(Math.random() * matching.length)] ?? null;
}

function refusalMessage(reason: string): string {
  switch (reason) {
    case 'not_enough':
      return 'Il faut trois doublons différents.';
    case 'mixed_rarity':
      return 'Les trois cartes doivent être de la même rareté.';
    case 'top_rarity':
      return 'Il n’y a rien au-dessus de légendaire.';
    case 'not_a_duplicate':
      return 'Une de ces cartes est ton seul exemplaire.';
    case 'insufficient_funds':
      return 'Solde insuffisant.';
    default:
      return 'Forge impossible.';
  }
}

/**
 * Les refus que la transaction lève elle-même.
 *
 * Ils DOUBLENT les contrôles du module pur, et c'est voulu : entre la lecture
 * et l'écriture, une autre requête a pu consommer la même carte. Le premier
 * jeu de contrôles rend un message utile, le second garantit l'invariant.
 */
function knownFailure(
  message: string
): { code: string; message: string } | null {
  if (message.includes('forge_cards_unavailable')) {
    return {
      code: 'already_used',
      message: 'Une de ces cartes vient d’être utilisée ailleurs.',
    };
  }
  if (message.includes('forge_would_empty_subject')) {
    return {
      code: 'not_a_duplicate',
      message: 'Une de ces cartes est ton seul exemplaire.',
    };
  }
  if (message.includes('forge_insufficient_funds')) {
    return { code: 'insufficient_funds', message: 'Solde insuffisant.' };
  }
  return null;
}
