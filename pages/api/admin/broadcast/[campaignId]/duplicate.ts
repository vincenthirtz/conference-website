// pages/api/admin/broadcast/[campaignId]/duplicate.ts
// Staff endpoint : duplique une campagne d'email existante.
//
// POST /api/admin/broadcast/{campaignId}/duplicate → 201 { campaign: { id } }
//
// Copie le contenu structuré de la campagne source dans une NOUVELLE ligne
// email_campaigns. La copie est TOUJOURS en statut 'draft' (jamais
// active/envoyable par accident) et reçoit un id slug unique dérivé de
// `${source.name} (copie)`. Aucun email n'est envoyé — comme la création.
//
// Idempotent via `Idempotency-Key` (double-click / retry admin) et no-store.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { getCampaign, generateUniqueCampaignId } from '@/utils/broadcasts';
import { campaignInputSchema } from '@/utils/campaignSchema';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../../utils/logger';

type DuplicateResponse = { campaign: { id: string } } | { error: string };

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'broadcast-duplicate' }),
  { permission: 'manage_broadcast' }
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DuplicateResponse>,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const campaignId = String(req.query.campaignId ?? '');
  const source = await getCampaign(campaignId);
  if (!source) {
    return res.status(404).json({ error: 'Campagne inconnue.' });
  }

  // Nom de la copie, tronqué à 120 pour respecter le schema (name.max(120)).
  const SUFFIX = ' (copie)';
  const name = `${source.name}${SUFFIX}`.slice(0, 120);

  // Contenu structuré : présent pour les campagnes 'db'. Défensif pour une
  // source builtin/legacy sans body — on dérive un contenu minimal valide
  // pour ne pas violer bodyParagraphs.min(1).
  const body = source.body;
  const bodyParagraphs =
    body && body.bodyParagraphs.length > 0
      ? body.bodyParagraphs
      : [source.description || source.subject];

  // Valide via le schema partagé avant insert (statut TOUJOURS 'draft').
  const parsed = campaignInputSchema.safeParse({
    name,
    subject: source.subject,
    description: source.description,
    audience: source.audience,
    status: 'draft',
    heading: body?.heading || source.name,
    greetingEnabled: body?.greetingEnabled ?? true,
    bodyParagraphs,
    ctaLabel: body?.ctaLabel ?? null,
    ctaUrl: body?.ctaUrl ?? null,
    footerNote: body?.footerNote ?? null,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({
      error: first
        ? `${first.path.join('.')}: ${first.message}`
        : 'Données invalides.',
    });
  }
  const input = parsed.data;

  // Id unique dérivé du slug du nouveau nom (même règle -2/-3 que la création).
  let id: string;
  try {
    id = await generateUniqueCampaignId(input.name);
  } catch (slugErr) {
    logger.error('[broadcast/duplicate] slug check error:', slugErr);
    return res.status(500).json({ error: 'Echec de la duplication.' });
  }

  const { error: insErr } = await supabaseAdmin.from('email_campaigns').insert({
    id,
    name: input.name,
    description: input.description,
    subject: input.subject,
    audience: input.audience,
    status: input.status,
    heading: input.heading,
    greeting_enabled: input.greetingEnabled,
    body_paragraphs: input.bodyParagraphs,
    cta_label: input.ctaLabel ?? null,
    cta_url: input.ctaUrl ?? null,
    footer_note: input.footerNote ?? null,
    created_by: ctx?.user?.id ?? null,
  });

  if (insErr) {
    logger.error('[broadcast/duplicate] insert error:', insErr);
    return res.status(500).json({ error: 'Echec de la duplication.' });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'broadcast',
        entity_id: id,
        payload: {
          campaign: id,
          campaign_name: input.name,
          source_campaign: source.id,
          mode: 'campaign-duplicated',
        },
      });
    } catch (logErr) {
      logger.error('[broadcast/duplicate] log error:', logErr);
    }
  }

  return res.status(201).json({ campaign: { id } });
}
