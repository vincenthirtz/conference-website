// pages/api/player/tcg/wallet.ts
//
// « D'où viennent mes pièces ? » — le registre, rendu lisible.
//
// POURQUOI CETTE ROUTE EXISTE. `tcg_wallets.balance` est un CACHE ; la source
// de vérité est `tcg_wallet_entries`, qui justifie le solde ligne à ligne.
// L'en-tête de la migration l'annonçait : « un solde qu'on ne peut pas
// expliquer est un solde qu'on ne peut pas corriger — et il faudra pouvoir
// répondre "d'où viennent mes pièces ?" ». La table portait même un index
// `(tenant_id, user_id, created_at DESC)` créé exprès pour cette lecture. Elle
// n'avait simplement jamais été livrée : l'espace joueuse affichait un solde
// sans aucun moyen de savoir ce qui l'avait formé.
//
// BORNÉE, PAS PAGINÉE. Au rythme d'un mouvement par victoire, 50 lignes
// couvrent une saison entière. Ajouter un curseur pour un cas qui n'existe pas
// serait de la complexité sans usage ; la borne, elle, empêche un registre
// ancien de faire grossir la réponse sans limite.
//
// L'API REND LE FAIT, L'INTERFACE LE FORMULE. On renvoie `sourceKind` brut
// (`match_win`, `scrim_win`, `booster_purchase`, `admin_grant`) et jamais un
// libellé : traduire ici obligerait le serveur à connaître la langue de la
// lectrice, et figerait le vocabulaire dans deux endroits à la fois.
//
// LE SOLDE EST RECALCULÉ DEPUIS LE REGISTRE, pas lu dans le cache. C'est la
// seule façon de garantir que le total affiché est bien la somme des lignes
// affichées — un écart entre les deux serait précisément ce que cette page
// doit permettre de repérer, pas ce qu'elle doit masquer.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';

/** Mouvements rendus. Cf. l'en-tête : une borne, pas une pagination. */
const MAX_ENTRIES = 50;

type EntryRow = {
  id: string;
  amount: number;
  source_kind: string;
  source_ref: string;
  created_at: string;
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
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-tcg-wallet')
  ) {
    return;
  }

  const tenantId = resolveTenantIdForUserRequest(req);

  const { data, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .select('id, amount, source_kind, source_ref, created_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(MAX_ENTRIES);

  if (error) {
    logger.error('[tcg/wallet] registre illisible: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const rows = (data ?? []) as EntryRow[];

  // Somme des lignes RENDUES, et non du registre entier : au-delà de la borne,
  // annoncer un total qui ne correspond pas à ce qu'on montre créerait un
  // écart inexplicable. `truncated` dit franchement que l'histoire continue.
  const shownTotal = rows.reduce(
    (sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0),
    0
  );

  return res.status(200).json({
    entries: rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      sourceKind: r.source_kind,
      sourceRef: r.source_ref,
      createdAt: r.created_at,
    })),
    shownTotal,
    truncated: rows.length === MAX_ENTRIES,
  });
});
