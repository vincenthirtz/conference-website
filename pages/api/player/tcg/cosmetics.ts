// pages/api/player/tcg/cosmetics.ts
//
// LES COSMÉTIQUES DE VITRINE : acheter (POST) et poser (PUT).
//
// POURQUOI. Au 2026-09-27 : 10 805 pièces gagnées, **zéro dépensée**, et DEUX
// vitrines configurées sur 63 comptes. Le booster était le seul débit et
// offrait « plus de la même chose ». Un habillage ne donne aucun avantage et ne
// dérègle rien : il récompense un effort par de la visibilité — ce que la
// vitrine fait déjà, gratuitement, pour deux personnes.
//
// DEUX VERBES, DEUX RÈGLES OPPOSÉES, et c'est la clé du lot :
//   - POST fait payer, une fois, et refuse un second achat du même objet ;
//   - PUT ne fait JAMAIS payer. Changer d'habillage est gratuit, revenir au
//     rendu par défaut aussi. Sans cette séparation, chaque essai coûterait —
//     et personne n'essaierait, ce qui vide le débit de son objet.
//
// L'ACHAT EST TRANSACTIONNEL (`tcg_buy_cosmetic`) : débiter puis débloquer sont
// deux écritures qui n'ont de sens qu'ensemble, et le projet s'est déjà brûlé
// sur cette frontière (`tcg_purchase_booster`).

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import {
  COSMETICS,
  canEquip,
  planCosmeticPurchase,
  type CosmeticKind,
} from '@/utils/tcg/cosmetics';
import { logger } from '@/utils/logger';
import { parseBody } from '../../../../utils/player/errors';
import {
  BuyCosmeticBody,
  EquipCosmeticsBody,
} from '../../../../features/player/tcg/schemas';

type ShowcaseRow = {
  frame: string | null;
  background: string | null;
  unlocked_cosmetics: string[] | null;
};

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }: { user: { id: string } }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  res.setHeader('Cache-Control', 'private, no-store');

  const tenantId = resolveTenantIdForUserRequest(req);

  switch (req.method) {
    case 'GET':
      if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'tcg-cosm')) {
        return;
      }
      return handleGet(res, tenantId, user.id);
    case 'POST':
      if (
        applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'tcg-cosm-buy')
      ) {
        return;
      }
      return handleBuy(req, res, tenantId, user.id);
    case 'PUT':
      if (
        applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'tcg-cosm-put')
      ) {
        return;
      }
      return handleEquip(req, res, tenantId, user.id);
    default:
      res.setHeader('Allow', 'GET, POST, PUT');
      return res.status(405).json({ error: 'Method not allowed.' });
  }
});

/** La ligne de vitrine, ou des valeurs par défaut si elle n'existe pas encore. */
async function readShowcase(
  tenantId: string,
  userId: string
): Promise<ShowcaseRow | null> {
  const { data, error } = await supabaseAdmin!
    .from('tcg_showcases')
    .select('frame, background, unlocked_cosmetics')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.error('[tcg/cosmetics] vitrine illisible: %s', error.message);
    return null;
  }
  return (
    (data as ShowcaseRow | null) ?? {
      frame: null,
      background: null,
      unlocked_cosmetics: [],
    }
  );
}

async function handleGet(
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  const row = await readShowcase(tenantId, userId);
  if (!row) return res.status(500).json({ error: 'Lecture impossible.' });
  return res.status(200).json({
    // Le catalogue voyage avec l'état : l'écran n'a pas à l'embarquer en dur,
    // et un prix réglé côté barème arrive tout seul.
    catalog: COSMETICS,
    owned: row.unlocked_cosmetics ?? [],
    frame: row.frame,
    background: row.background,
  });
}

async function handleBuy(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  const row = await readShowcase(tenantId, userId);
  if (!row) return res.status(500).json({ error: 'Lecture impossible.' });

  const balance = await readBalance(tenantId, userId);
  if (balance === null)
    return res.status(500).json({ error: 'Solde illisible.' });

  const parsed = parseBody(BuyCosmeticBody, req.body);
  if (!parsed.ok) return res.status(400).json(parsed.body);
  const plan = planCosmeticPurchase({
    key: parsed.data.key,
    owned: row.unlocked_cosmetics ?? [],
    balance,
  });
  if (!plan.ok) {
    return res
      .status(plan.reason === 'unknown_cosmetic' ? 400 : 409)
      .json({ error: refusal(plan.reason), code: plan.reason });
  }

  const { data, error } = await supabaseAdmin!.rpc('tcg_buy_cosmetic', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_key: plan.cosmetic.key,
    p_price: plan.cosmetic.priceCoins,
  });

  if (error) {
    // Les refus levés par la transaction DOUBLENT ceux du module pur : entre la
    // lecture et l'écriture, un autre onglet a pu acheter le même objet.
    if (error.message.includes('cosmetic_already_owned')) {
      return res
        .status(409)
        .json({ error: refusal('already_owned'), code: 'already_owned' });
    }
    if (error.message.includes('cosmetic_insufficient_funds')) {
      return res.status(409).json({
        error: refusal('insufficient_funds'),
        code: 'insufficient_funds',
      });
    }
    logger.error('[tcg/cosmetics] achat refusé: %s', error.message);
    return res.status(500).json({ error: 'Achat impossible.' });
  }

  return res.status(201).json({
    key: plan.cosmetic.key,
    balance:
      (data as { balance?: number } | null)?.balance ??
      balance - plan.cosmetic.priceCoins,
  });
}

async function handleEquip(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  const parsed = parseBody(EquipCosmeticsBody, req.body, {
    message: 'Habillage invalide.',
    code: 'invalid_body',
  });
  if (!parsed.ok) return res.status(400).json(parsed.body);
  const body = parsed.data;
  const patch: Record<string, unknown> = {};

  const row = await readShowcase(tenantId, userId);
  if (!row) return res.status(500).json({ error: 'Lecture impossible.' });
  const owned = row.unlocked_cosmetics ?? [];

  for (const kind of ['frame', 'background'] as CosmeticKind[]) {
    if (!(kind in body)) continue;
    const raw = body[kind];
    // `null` = retour au rendu par défaut. Il ne dépend de rien, exprès.
    const key = raw === null ? null : typeof raw === 'string' ? raw : undefined;
    if (key === undefined) {
      return res
        .status(400)
        .json({ error: 'Habillage invalide.', code: 'invalid_body' });
    }
    if (!canEquip({ key, kind, owned })) {
      return res
        .status(409)
        .json({ error: 'Habillage non débloqué.', code: 'not_unlocked' });
    }
    patch[kind] = key;
  }

  if (Object.keys(patch).length === 0) {
    return res
      .status(400)
      .json({ error: 'Rien à changer.', code: 'invalid_body' });
  }

  const { error } = await supabaseAdmin!.from('tcg_showcases').upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,user_id' }
  );
  if (error) {
    logger.error('[tcg/cosmetics] habillage non écrit: %s', error.message);
    return res.status(500).json({ error: 'Enregistrement impossible.' });
  }

  return res.status(200).json({ ...patch });
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
    logger.error('[tcg/cosmetics] solde illisible: %s', error.message);
    return null;
  }
  return (data ?? []).reduce(
    (sum, r) => sum + Number((r as { amount?: number }).amount ?? 0),
    0
  );
}

function refusal(reason: string): string {
  switch (reason) {
    case 'already_owned':
      return 'Tu possèdes déjà cet habillage.';
    case 'insufficient_funds':
      return 'Solde insuffisant.';
    default:
      return 'Habillage inconnu.';
  }
}
