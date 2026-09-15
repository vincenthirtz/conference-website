// pages/api/circuit-partners/apply.ts
//
// POST public : un circuit féminin ou mixte candidate à l'offre partenaire
// (`/organisateurs/circuits-feminins`). La candidature est ENREGISTRÉE ; rien
// n'est accordé ici. L'accord — un plan posé sur un espace, pour une durée
// finie (`config/circuitPartnerOffer.ts`) — est un geste du staff de
// plateforme (`/api/admin/circuit-partners/[id]`).
//
// ANTI-SPAM : même chaîne que les autres formulaires publics sans compte —
// honeypot (succès générique : ne pas apprendre au bot qu'il est détecté),
// limite par IP, captcha HMAC, qualité de l'adresse email.
//
// LE JEU VIENT DU REGISTRE. Un slug hors `config/games` est refusé : l'offre
// repose sur le multi-jeux existant, pas sur une promesse de jeu à venir.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { checkEmailQuality, normalizeEmail } from '@/utils/emailQuality';
import {
  sendCircuitPartnerConfirmationEmail,
  sendCircuitPartnerStaffEmail,
} from '@/utils/email';
import { getGame } from '@/config/games';
import { logger } from '@/utils/logger';
import { circuitPartnerApplicationBodySchema } from '@/lib/apiContracts/public/circuitPartners';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = circuitPartnerApplicationBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error:
        'Formulaire incomplet : structure, contact, email, jeu, format, présentation et les deux engagements sont requis.',
      code: 'VALIDATION',
    });
  }
  const body = parsed.data;

  if (body.honeypot && body.honeypot.trim().length > 0) {
    return res.status(201).json({ ok: true });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60 * 60 * 1000 },
      'circuit-partner-apply'
    )
  ) {
    return;
  }

  const captcha = verifyCaptcha(
    (body.captchaToken || '').toString(),
    (body.captchaAnswer || '').toString()
  );
  if (!captcha.valid) {
    return res.status(400).json({
      error: captcha.error || 'Captcha invalide',
      code: 'CAPTCHA',
    });
  }

  const game = getGame(body.game);
  if (!game) {
    return res.status(400).json({
      error: 'Ce jeu n’est pas pris en charge par la plateforme.',
      code: 'UNKNOWN_GAME',
    });
  }

  const email = normalizeEmail(body.email);
  if (!checkEmailQuality(email).ok) {
    return res.status(400).json({
      error: 'Cette adresse email ne peut pas être utilisée.',
      code: 'VALIDATION',
    });
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : (req.socket?.remoteAddress ?? null);

  const { data, error } = await supabaseAdmin
    .from('circuit_partner_applications')
    .insert({
      organization_name: body.organizationName,
      contact_name: body.contactName,
      email,
      game: game.slug,
      format: body.format,
      season_start: body.seasonStart ?? null,
      expected_teams: body.expectedTeams ?? null,
      website: body.website || null,
      community_url: body.communityUrl || null,
      existing_tenant_slug: body.existingSpaceSlug || null,
      message: body.message,
      commits_code_of_conduct: body.commitsCodeOfConduct,
      commits_safety_lead: body.commitsSafetyLead,
      status: 'new',
      ip_address: ipAddress,
      user_agent: req.headers['user-agent'] ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.error(
      '[circuit-partners/apply] insert error: %s',
      error?.message ?? 'no row'
    );
    return res
      .status(500)
      .json({ error: 'Envoi impossible pour le moment. Réessayez.' });
  }

  const applicationId = (data as { id: string }).id;

  // Best-effort : la candidature est enregistrée, un email raté ne l'annule pas.
  void sendCircuitPartnerStaffEmail({
    applicationId,
    organizationName: body.organizationName,
    contactName: body.contactName,
    email,
    gameLabel: game.label,
    format: body.format,
    expectedTeams: body.expectedTeams ?? null,
    seasonStart: body.seasonStart ?? null,
    existingSpaceSlug: body.existingSpaceSlug || null,
    message: body.message,
  }).catch((e) => logger.warn('[circuit-partners/apply] staff email', e));
  void sendCircuitPartnerConfirmationEmail({
    to: email,
    contactName: body.contactName,
    organizationName: body.organizationName,
  }).catch((e) => logger.warn('[circuit-partners/apply] confirmation', e));

  return res.status(201).json({ ok: true, id: applicationId });
}
