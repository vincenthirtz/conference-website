// pages/api/player/tcg/trades/blocks.ts
//
// « Ne plus recevoir de proposition de cette personne. »
//
// POURQUOI. Les échanges n'offraient que deux réponses à une sollicitation non
// désirée : refuser (et subir 24 h de répit avant la suivante), ou couper les
// échanges POUR TOUT LE MONDE. Entre les deux manquait « pas avec elle » — et
// dans un milieu où les joueuses subissent du harcèlement, devoir se couper de
// tout le monde pour se protéger d'une seule personne, c'est la faire gagner.
//
// CE QUE LA PERSONNE BLOQUÉE APPREND : RIEN. Sa proposition reçoit
// `recipient_unavailable`, exactement comme si la destinataire n'acceptait pas
// les échanges. Le refus vit dans `tcg_propose_trade`, avec tous les autres
// invariants de l'échange — une garde de sécurité ne doit pas être la seule à
// dépendre du chemin emprunté pour l'atteindre.
//
// LE BLOCAGE EST ORIENTÉ : il empêche l'autre de ME solliciter, pas l'inverse.
// Le rendre réciproque serait plus simple à écrire et faux à l'usage — et
// surtout, ça révélerait le blocage à la première tentative.
//
// AUCUN PLAFOND SUR LE NOMBRE DE BLOCAGES, et c'est délibéré : on ne rationne
// pas une protection.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const userId = user.id;

  switch (req.method) {
    case 'GET':
      if (
        applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'tcg-blocks')
      ) {
        return;
      }
      return list(res, tenantId, userId);
    case 'POST':
      if (
        applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'tcg-block')
      ) {
        return;
      }
      return block(req, res, tenantId, userId);
    case 'DELETE':
      if (
        applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'tcg-unblock')
      ) {
        return;
      }
      return unblock(req, res, tenantId, userId);
    default:
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ error: 'Method not allowed.' });
  }
});

async function list(res: NextApiResponse, tenantId: string, userId: string) {
  const { data, error } = await supabaseAdmin!
    .from('tcg_trade_blocks')
    .select('blocked_user_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('[tcg/blocks] lecture impossible: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  return res.status(200).json({
    blocked: (data ?? []).map((row) => ({
      userId: (row as { blocked_user_id: string }).blocked_user_id,
      since: (row as { created_at: string }).created_at,
    })),
  });
}

/** L'identifiant visé, ou `null` si la forme ne tient pas. */
function targetOf(body: unknown): string | null {
  const raw = (body as { userId?: unknown } | undefined)?.userId;
  return typeof raw === 'string' && UUID_RE.test(raw)
    ? raw.toLowerCase()
    : null;
}

async function block(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  const target = targetOf(req.body);
  if (!target) {
    return res
      .status(400)
      .json({ error: 'Joueuse invalide.', code: 'invalid_body' });
  }
  if (target === userId.toLowerCase()) {
    return res
      .status(400)
      .json({ error: 'Pas de blocage de soi-même.', code: 'self_block' });
  }

  // `upsert` et non `insert` : rebloquer quelqu'un déjà bloqué doit réussir en
  // silence. Un 409 ici ne dirait rien d'utile — l'état voulu est atteint — et
  // obligerait l'écran à distinguer deux cas qui se valent.
  const { error } = await supabaseAdmin!
    .from('tcg_trade_blocks')
    .upsert(
      { tenant_id: tenantId, user_id: userId, blocked_user_id: target },
      { onConflict: 'tenant_id,user_id,blocked_user_id' }
    );
  if (error) {
    logger.error('[tcg/blocks] blocage impossible: %s', error.message);
    return res.status(500).json({ error: 'Blocage impossible.' });
  }

  return res.status(201).json({ blocked: target });
}

async function unblock(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  const target = targetOf(req.body);
  if (!target) {
    return res
      .status(400)
      .json({ error: 'Joueuse invalide.', code: 'invalid_body' });
  }

  const { error } = await supabaseAdmin!
    .from('tcg_trade_blocks')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('blocked_user_id', target);
  if (error) {
    logger.error('[tcg/blocks] déblocage impossible: %s', error.message);
    return res.status(500).json({ error: 'Déblocage impossible.' });
  }

  // 200 même si rien n'a été supprimé : l'état voulu est atteint, et compter
  // les lignes pour rendre un 404 ne ferait que confirmer qui était bloqué.
  return res.status(200).json({ unblocked: target });
}
