// POST /api/admin/stream-alert-test — déclenche une alerte de TEST dans la
// boîte d'alertes (`/overlay/alertes`).
//
// POURQUOI. Le « rejouer » de Streamlabs ne sert que les widgets Streamlabs :
// notre source ne lit que NOTRE table. Sans ce bouton, vérifier la scène avant
// le direct exigeait un vrai follow depuis un second compte. Le mode `?demo=1`
// ne le remplace pas : il tourne SANS réseau, donc il ne prouve pas que la
// chaîne table → poll → source fonctionne. Celui-ci passe par le même chemin
// qu'un vrai événement Twitch.
//
// MÊME TABLE QUE LE WEBHOOK, marquée par sa clé : `twitch_message_id` vaut
// `test-<uuid>`, jamais un identifiant Twitch (qui est un UUID nu). Une alerte
// de test se reconnaît donc en base, et ne peut pas entrer en collision avec
// un vrai message.
//
// LES RÈGLES S'APPLIQUENT, VOLONTAIREMENT. Un type éteint ou un seuil trop haut
// filtre aussi l'alerte de test : c'est ce que la régie veut vérifier. Le
// panneau le rappelle à côté du bouton.
//
// PAS DE DON ICI : les dons viennent de HelloAsso (`helloasso_donations`),
// une table qu'on ne salit pas avec de faux paiements.

import crypto from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import type { AuthenticatedStaffContext } from '@/types/staff';
import { TWITCH_ALERT_KINDS, type AlertKind } from '@/utils/overlay/alertBox';

/** Une quantité plausible par type — assez pour passer un seuil modeste. */
const SAMPLE_AMOUNT: Partial<Record<AlertKind, number>> = {
  resub: 6,
  gift: 5,
  cheer: 500,
  raid: 42,
};

const BodySchema = z.object({
  // Les types qu'un webhook Twitch dépose — pas `donation` (cf. en-tête).
  kind: z
    .string()
    .refine((k): k is AlertKind =>
      (TWITCH_ALERT_KINDS as readonly string[]).includes(k)
    ),
  name: z.string().trim().min(1).max(60).optional(),
});

const DEFAULT_NAME = 'Test';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Un clic répété en rafale remplirait la file d'attente de la source.
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'stream-alert-test')
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Type d’alerte invalide.' });
  }
  const { kind } = parsed.data;

  const { error } = await supabaseAdmin.from('stream_alert_events').insert({
    tenant_id: ctx.tenantId,
    twitch_message_id: `test-${crypto.randomUUID()}`,
    kind,
    actor_name: parsed.data.name ?? DEFAULT_NAME,
    amount: SAMPLE_AMOUNT[kind] ?? null,
    tier: kind === 'sub' || kind === 'resub' ? '1000' : null,
  });

  if (error) {
    logger.error(
      '[admin/stream-alert-test] écriture impossible: %s',
      (error as { message?: string }).message ?? String(error)
    );
    return res.status(500).json({ error: 'Écriture impossible.' });
  }

  return res.status(200).json({ ok: true, kind });
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
