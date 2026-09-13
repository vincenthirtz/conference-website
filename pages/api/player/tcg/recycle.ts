// pages/api/player/tcg/recycle.ts
//
// Recycler un DOUBLON contre des pièces.
//
// POURQUOI CET ENDPOINT EXISTE. Un doublon ne servait à rien : la collection
// les comptait (« 4 cartes différentes · 7 exemplaires ») sans qu'on puisse
// rien en faire. Le troisième exemplaire d'une même joueuse était un objet
// mort. Le recyclage referme la boucle — gagner, ouvrir, recycler, racheter.
//
// UN DOUBLON, JAMAIS LE DERNIER EXEMPLAIRE. On exige qu'il reste au moins une
// autre carte NON recyclée du même sujet. Sans ce contrôle, « recycler un
// doublon » deviendrait « détruire sa collection contre de la monnaie », et
// une joueuse pourrait effacer une carte qu'elle est seule à posséder d'un
// clic mal placé. Le refus est explicite (`not_a_duplicate`), pas silencieux.
//
// DEUX GARDE-FOUS INDÉPENDANTS CONTRE LE DOUBLE RECYCLAGE, tous deux portés
// par le schéma plutôt que par la prudence de l'appelant :
//   1. LA RÉSERVATION EST ATOMIQUE. Le marquage exige `recycled_at IS NULL` ;
//      deux clics simultanés ne peuvent pas réussir tous les deux, le second
//      ne touche aucune ligne.
//   2. LE REGISTRE EST UNIQUE PAR SOURCE. `source_ref = <pack_id>:<position>`
//      désigne LA carte, et `UNIQUE (tenant_id, user_id, source_kind,
//      source_ref)` interdit de la créditer deux fois même si la requête est
//      rejouée.
//
// ON MARQUE AVANT DE CRÉDITER, l'inverse de l'achat de booster — et pour la
// même raison qui le fait débiter avant de livrer : il vaut mieux une carte
// retirée sans crédit (réparable, et le marquage est relâché ci-dessous)
// qu'un crédit sans carte retirée, qui serait de la monnaie créée à partir de
// rien.
//
// LA CARTE N'EST PAS SUPPRIMÉE, elle est marquée. C'est ce qui garde le crédit
// correspondant EXPLICABLE dans l'historique du porte-monnaie : « un solde
// qu'on ne peut pas expliquer est un solde qu'on ne peut pas corriger ».

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { RECYCLE_REFUND_COINS } from '@/utils/tcg/economy';
import { refreshBalance } from '@/utils/tcg/grantVictoryRewards';
import { cardSubjectKey } from '@/utils/tcg/subjectKey';
import { logger } from '@/utils/logger';

/** Borne de lecture, comme les autres routes de collection. */
const MAX_PACKS = 500;
const MAX_CARDS = 5000;

type CardRow = {
  pack_id: string;
  position: number;
  subject_kind: 'player' | 'team' | 'map';
  card_user_id: string | null;
  card_team_id: string | null;
  card_map_slug: string | null;
};

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'player-tcg-recycle'
    )
  ) {
    return;
  }

  const body = (req.body ?? {}) as { packId?: unknown; position?: unknown };
  const packId = typeof body.packId === 'string' ? body.packId : '';
  const position =
    typeof body.position === 'number' && Number.isInteger(body.position)
      ? body.position
      : null;

  if (!packId || position === null || position < 0) {
    return res
      .status(400)
      .json({ error: 'Carte manquante.', code: 'missing_card' });
  }

  const tenantId = resolveTenantIdForUserRequest(req);
  const userId = user.id;

  // 1) Mes paquets OUVERTS. Une carte d'un paquet fermé n'est pas encore
  //    possédée ; une carte d'un paquet qui n'est pas le mien ne l'est pas non
  //    plus. Cette liste borne tout le reste.
  const { data: packRows, error: packError } = await supabaseAdmin
    .from('tcg_packs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .not('opened_at', 'is', null)
    .limit(MAX_PACKS);

  if (packError) {
    logger.error('[tcg/recycle] paquets illisibles: %s', packError.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const packIds = ((packRows ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (!packIds.includes(packId)) {
    // 404 et non 403 : on ne confirme pas l'existence d'une carte qui n'est
    // pas la sienne.
    return res.status(404).json({ error: 'Carte introuvable.' });
  }

  // 2) Mes cartes encore possédées, pour identifier le sujet ET compter ses
  //    exemplaires. Une seule lecture sert aux deux.
  const { data: cardRows, error: cardsError } = await supabaseAdmin
    .from('tcg_pack_cards')
    .select(
      'pack_id, position, subject_kind, card_user_id, card_team_id, card_map_slug'
    )
    .in('pack_id', packIds)
    .is('recycled_at', null)
    .limit(MAX_CARDS);

  if (cardsError) {
    logger.error('[tcg/recycle] cartes illisibles: %s', cardsError.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const cards = (cardRows ?? []) as CardRow[];
  const target = cards.find(
    (c) => c.pack_id === packId && c.position === position
  );
  if (!target) {
    // Soit elle n'existe pas, soit elle est DÉJÀ recyclée (le filtre
    // ci-dessus l'exclut). Les deux se répondent pareil du point de vue de
    // l'appelante : cette carte n'est plus recyclable.
    return res
      .status(409)
      .json({ error: 'Carte déjà recyclée.', code: 'already_recycled' });
  }

  // Clé partagée avec les autres lecteurs (`utils/tcg/subjectKey.ts`) plutôt
  // qu'un ternaire local : c'est la même question, elle doit avoir la même
  // réponse partout — sinon une carte de map serait comptée comme une carte
  // d'équipe sans sujet, et « mon seul exemplaire » deviendrait faux.
  const subjectOf = (c: CardRow) => cardSubjectKey(c);
  const targetSubject = subjectOf(target);
  if (!targetSubject) {
    // Ligne sans sujet exploitable : le CHECK du schéma l'interdit, donc c'est
    // une corruption. On refuse plutôt que de créditer une carte qu'on ne sait
    // pas identifier — un crédit sans contrepartie est de la monnaie créée.
    logger.error(
      '[tcg/recycle] carte %s:%s sans sujet exploitable',
      packId,
      position
    );
    return res.status(409).json({
      error: 'Cette carte est illisible.',
      code: 'not_a_duplicate',
    });
  }
  const copies = cards.filter((c) => subjectOf(c) === targetSubject).length;

  if (copies < 2) {
    // Le contrôle qui distingue « recycler un doublon » de « détruire sa
    // collection ». Explicite, pour que l'interface puisse le dire.
    return res.status(409).json({
      error: 'Cette carte est ton seul exemplaire.',
      code: 'not_a_duplicate',
    });
  }

  // 3) Réservation ATOMIQUE : `recycled_at IS NULL` garantit qu'un seul appel
  //    l'emporte, même sur deux clics simultanés.
  const recycledAt = new Date().toISOString();
  const { data: marked, error: markError } = await supabaseAdmin
    .from('tcg_pack_cards')
    .update({ recycled_at: recycledAt })
    // `packIds` REDONDE la vérification de propriété faite plus haut, à
    // dessein : sans lui, cet UPDATE ne serait juste que grâce à un contrôle
    // situé cinquante lignes au-dessus. Le jour où quelqu'un déplace ce
    // contrôle, l'écriture ne rattraperait rien toute seule. La table n'a ni
    // `user_id` ni `tenant_id` (elle les tient de son paquet), donc c'est la
    // seule façon de rendre cette écriture auto-suffisante.
    .in('pack_id', packIds)
    .eq('pack_id', packId)
    .eq('position', position)
    .is('recycled_at', null)
    .select('pack_id');

  if (markError) {
    logger.error('[tcg/recycle] marquage impossible: %s', markError.message);
    return res.status(500).json({ error: 'Recyclage impossible.' });
  }
  if (!marked || marked.length === 0) {
    return res
      .status(409)
      .json({ error: 'Carte déjà recyclée.', code: 'already_recycled' });
  }

  // 4) Le crédit. `source_ref` désigne LA carte : la contrainte d'unicité du
  //    registre interdit de la créditer deux fois, quoi qu'il arrive.
  const { error: entryError } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      amount: RECYCLE_REFUND_COINS,
      source_kind: 'card_recycled',
      source_ref: `${packId}:${position}`,
    });

  if (entryError) {
    // UNE ERREUR N'EST PAS UNE ABSENCE D'ÉCRITURE. Un 504 PostgREST survenant
    // APRÈS le commit rend une erreur alors que la ligne existe — ce mode
    // d'échec est constaté en production sur ce projet (~1,7 % en septembre).
    // Relâcher aveuglément le marquage rendrait alors la carte À une joueuse
    // qui a DÉJÀ été créditée : elle garderait la carte et les pièces, soit
    // exactement la monnaie créée à partir de rien que l'en-tête prétend
    // empêcher.
    //
    // On relit donc par la clé UNIQUE avant de décider. Cette relecture est
    // sûre là où une relecture AVANT écriture ne l'aurait pas été : la
    // contrainte a déjà tranché, on ne fait que constater son verdict.
    const { data: existing, error: recheckError } = await supabaseAdmin
      .from('tcg_wallet_entries')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('source_kind', 'card_recycled')
      .eq('source_ref', `${packId}:${position}`)
      .maybeSingle();

    if (existing) {
      // Le crédit est bien là : l'erreur portait sur l'accusé de réception, pas
      // sur l'écriture. Le recyclage a donc réussi — on ne relâche RIEN.
      logger.warn(
        '[tcg/recycle] crédit committé malgré une erreur (%s) — recyclage confirmé',
        entryError.message
      );
      await refreshBalance(tenantId, userId);
      return res.status(200).json({
        recycled: { packId, position },
        refund: RECYCLE_REFUND_COINS,
      });
    }

    if (recheckError) {
      // On ne sait pas trancher. Dans le doute, on NE relâche PAS : laisser une
      // carte marquée sans crédit est réparable à la main, rendre une carte
      // déjà payée ne l'est pas.
      logger.error(
        '[tcg/recycle] état indéterminé pour %s:%s — marquage CONSERVÉ: %s',
        packId,
        position,
        recheckError.message
      );
      return res.status(500).json({ error: 'Recyclage impossible.' });
    }

    // ON RELÂCHE LE MARQUAGE : une carte retirée sans crédit est une perte
    // sèche pour la joueuse. En la rendant, l'état revient exactement là où il
    // était et le geste est rejouable.
    logger.error(
      '[tcg/recycle] crédit échoué, marquage relâché: %s',
      entryError.message
    );
    const { error: releaseError } = await supabaseAdmin
      .from('tcg_pack_cards')
      .update({ recycled_at: null })
      .eq('pack_id', packId)
      .eq('position', position);
    if (releaseError) {
      // Carte perdue sans contrepartie : le seul état incohérent possible, on
      // le dit fort pour qu'il soit réparable à la main.
      logger.error(
        '[tcg/recycle] carte %s:%s RETIRÉE sans crédit: %s',
        packId,
        position,
        releaseError.message
      );
    }
    return res.status(500).json({ error: 'Recyclage impossible.' });
  }

  // 5) Le solde se recalcule depuis le registre, jamais par incrément : un
  //    incrément perdu creuse un écart définitif, un recalcul se répare seul.
  await refreshBalance(tenantId, userId);

  return res.status(200).json({
    recycled: { packId, position },
    refund: RECYCLE_REFUND_COINS,
  });
});
