// pages/api/public/free-players/resend-link.ts
//
// « J'ai perdu mon lien. » — renvoie les liens de retrait et de prolongation
// d'une fiche « joueuse libre » à l'adresse de cette fiche, et à elle seule.
//
// POURQUOI. Le lien de retrait n'existait que dans l'email de confirmation.
// L'avoir perdu laissait deux issues : écrire au staff, ou remplir à nouveau le
// formulaire complet (qui renvoie l'email, mais republie la fiche au passage —
// l'inverse de ce que veut quelqu'un qui cherche à la retirer).
//
// SÉCURITÉ. Le formulaire ne fait rien d'autre qu'envoyer un email à l'adresse
// saisie, si une fiche y est rattachée : celle qui tape l'adresse d'une autre ne
// reçoit rien, c'est la titulaire qui reçoit le lien. La réponse est IDENTIQUE
// que la fiche existe ou non — sinon le formulaire deviendrait un oracle pour
// tester qui cherche une équipe. Honeypot + captcha + rate-limit par IP, comme
// le formulaire d'inscription, contre l'usage en arrosoir.

import type { NextApiRequest, NextApiResponse } from 'next';
import * as z from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { normalizeEmail } from '@/utils/emailQuality';
import { sendFreePlayerLinksEmail } from '@/utils/email';
import {
  buildFreePlayerRemovalUrl,
  buildFreePlayerRenewUrl,
} from '@/utils/freePlayerRemoval';
import { FREE_PLAYER_LIMITS } from '@/utils/freePlayers';
import { logger } from '@/utils/logger';

const bodySchema = z.object({
  email: z.string().trim().email().max(FREE_PLAYER_LIMITS.contactEmail),
  honeypot: z.string().optional(),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
});

/** Réponse unique du chemin nominal : ne révèle pas si une fiche existe. */
function ok(res: NextApiResponse) {
  return res.status(200).json({ success: true });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Adresse email invalide.', code: 'VALIDATION' });
  }
  const body = parsed.data;

  // Honeypot rempli ⇒ bot : succès générique, comme à l'inscription.
  if (body.honeypot && body.honeypot.trim().length > 0) return ok(res);

  if (
    applyRateLimit(
      req,
      res,
      { max: 3, windowMs: 60_000 },
      'free-players-resend-link'
    )
  ) {
    return;
  }

  const captchaResult = await verifyCaptcha(
    body.captchaToken ?? '',
    body.captchaAnswer ?? ''
  );
  if (!captchaResult.valid) {
    return res.status(400).json({
      error: captchaResult.error || 'Captcha invalide',
      code: 'CAPTCHA',
    });
  }

  const email = normalizeEmail(body.email);
  const tenantId = await resolveTenantIdForPublicRequestAsync(req);

  // Même clé que l'upsert de l'inscription : (tenant, source web, email
  // normalisé). Une fiche expirée reçoit aussi ses liens — elle peut vouloir
  // revenir, ou disparaître pour de bon.
  const { data, error } = await supabaseAdmin
    .from('free_players')
    .select('id, display_name')
    .eq('tenant_id', tenantId)
    .eq('source', 'web')
    .eq('contact_email', email)
    .maybeSingle();
  if (error) {
    // Erreur muette côté réponse (pas d'oracle), visible côté logs.
    logger.error('[free-players/resend-link] lookup error', error);
    return ok(res);
  }

  const row = data as { id: string; display_name: string | null } | null;
  if (row) {
    void sendFreePlayerLinksEmail({
      tenantId,
      to: email,
      displayName: row.display_name ?? '',
      renewUrl: buildFreePlayerRenewUrl(row.id),
      removeUrl: buildFreePlayerRemovalUrl(row.id),
    }).catch((err) => {
      logger.error('[free-players/resend-link] email failed', err);
    });
  }

  return ok(res);
}
