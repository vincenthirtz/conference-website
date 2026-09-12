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

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';
import { readPlayerFaces, readTeamFaces } from '@/utils/tcg/readCardFaces';
import { logger } from '@/utils/logger';

/** Borne de sécurité : au-delà, la collection se pagine (v2). */
const MAX_PACKS = 500;
const MAX_CARDS = 5000;

type Aggregated = {
  kind: 'player' | 'team';
  subjectId: string;
  count: number;
  /** Meilleure rareté possédée : la rareté est figée par tirage et peut différer d'un exemplaire à l'autre. */
  rarity: TcgRarity;
  /** Vrai dès qu'un exemplaire est brillant. */
  hasFoil: boolean;
};

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

  const tenantId = resolveTenantIdForUserRequest(req);
  const userId = user.id;

  // 1) Mes paquets ouverts. Un paquet fermé ne contient encore rien.
  const { data: packRows, error: packError } = await supabaseAdmin
    .from('tcg_packs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .not('opened_at', 'is', null)
    .limit(MAX_PACKS);

  if (packError) {
    logger.error('[tcg/collection] paquets illisibles: %s', packError.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const packIds = ((packRows ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (packIds.length === 0) {
    return res.status(200).json({ cards: [], distinct: 0, total: 0 });
  }

  // 2) Leurs cartes.
  const { data: cardRows, error: cardError } = await supabaseAdmin
    .from('tcg_pack_cards')
    .select('subject_kind, card_user_id, card_team_id, rarity, is_foil')
    .in('pack_id', packIds)
    .limit(MAX_CARDS);

  if (cardError) {
    logger.error('[tcg/collection] cartes illisibles: %s', cardError.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  // 3) Agrégation par sujet.
  const byKey = new Map<string, Aggregated>();
  for (const row of (cardRows ?? []) as Array<{
    subject_kind: 'player' | 'team';
    card_user_id: string | null;
    card_team_id: string | null;
    rarity: TcgRarity;
    is_foil: boolean;
  }>) {
    const subjectId =
      row.subject_kind === 'player' ? row.card_user_id : row.card_team_id;
    // Le CHECK du schéma garantit exactement un sujet ; une ligne sans sujet
    // serait une corruption, on la saute plutôt que d'afficher une carte vide.
    if (!subjectId) continue;

    const key = `${row.subject_kind}:${subjectId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        kind: row.subject_kind,
        subjectId,
        count: 1,
        rarity: row.rarity,
        hasFoil: Boolean(row.is_foil),
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
  }

  const aggregated = [...byKey.values()];

  // 4) Les faces — relues, jamais figées (retrait de consentement rétroactif).
  const [playerFaces, teamFaces] = await Promise.all([
    readPlayerFaces(
      tenantId,
      aggregated.filter((a) => a.kind === 'player').map((a) => a.subjectId)
    ),
    readTeamFaces(
      tenantId,
      aggregated.filter((a) => a.kind === 'team').map((a) => a.subjectId)
    ),
  ]);

  const cards = aggregated
    .map((a) => {
      if (a.kind === 'player') {
        const face = playerFaces.get(a.subjectId);
        return {
          kind: 'player' as const,
          userId: a.subjectId,
          displayName: face?.displayName ?? null,
          imageUrl: face?.imageUrl ?? null,
          rarity: a.rarity,
          isFoil: a.hasFoil,
          count: a.count,
        };
      }
      const face = teamFaces.get(a.subjectId);
      return {
        kind: 'team' as const,
        teamId: a.subjectId,
        name: face?.name ?? null,
        slug: face?.slug ?? null,
        logoUrl: face?.logoUrl ?? null,
        rarity: a.rarity,
        isFoil: a.hasFoil,
        count: a.count,
      };
    })
    // Les plus rares d'abord : une collection se regarde par ses pièces fortes.
    .sort(
      (x, y) => RARITY_ORDER.indexOf(y.rarity) - RARITY_ORDER.indexOf(x.rarity)
    );

  return res.status(200).json({
    cards,
    distinct: cards.length,
    total: aggregated.reduce((sum, a) => sum + a.count, 0),
  });
});
