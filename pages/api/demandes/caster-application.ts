// pages/api/demandes/caster-application.ts
// Candidatures "caster" (postuler pour devenir caster/streamer du tournoi).
// - POST : créer une candidature (demande type 'caster_application')
// - GET  : récupérer sa dernière candidature
//
// Auth : utilisateur connecté (Bearer) via withAuthRoute — PAS staff-gated.
// Le staff valide ensuite la candidature via /api/admin/demandes (action
// updateStatus → approved), ce qui promeut l'utilisateur en staff role='caster'
// (cf. side-effect dans pages/api/admin/demandes/index.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '../../../utils/logger';

// Body POST : motivation libre (optionnelle) + URL de portfolio (optionnelle).
// On valide au boundary avec zod (extraction typée → satisfait CodeQL et borne
// la taille des champs avant insertion JSONB).
const casterApplicationBodySchema = z.object({
  motivation: z
    .string()
    .trim()
    .max(1000, 'Motivation trop longue (max 1000 caractères).')
    .optional(),
  portfolioUrl: z
    .string()
    .trim()
    .max(300, 'URL trop longue (max 300 caractères).')
    .url('URL de portfolio invalide.')
    .optional(),
});

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60 * 60_000 },
      'caster-application'
    )
  )
    return;

  const userId = user.id;
  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: userId });

  if (req.method === 'GET') {
    const { data: latest, error: getErr } = await supabaseAdmin
      .from('demandes')
      .select('id, status, comment, created_at, processed_at')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('type', 'caster_application')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (getErr) {
      logger.error('[demandes/caster-application] GET error:', getErr);
      return res.status(500).json({ error: 'Failed to load application.' });
    }

    return res.status(200).json({ application: latest ?? null });
  }

  if (req.method === 'POST') {
    const parsed = casterApplicationBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid body.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const motivation = parsed.data.motivation || null;
    const portfolioUrl = parsed.data.portfolioUrl || null;

    // Guard 1 : déjà staff actif → ne peut pas (re)postuler.
    const { data: existingStaff, error: staffErr } = await supabaseAdmin
      .from('staff')
      .select('id, is_active')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (staffErr) {
      logger.error('[demandes/caster-application] staff check error:', staffErr);
      return res.status(500).json({ error: 'Verification error.' });
    }

    if (existingStaff && existingStaff.is_active !== false) {
      return res.status(409).json({
        error: 'Tu fais déjà partie du staff.',
        code: 'ALREADY_STAFF',
      });
    }

    // Guard 2 : déjà une candidature en attente (même tenant) → pas de doublon.
    const { data: existingPending, error: pendingErr } = await supabaseAdmin
      .from('demandes')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('type', 'caster_application')
      .eq('status', 'pending')
      .maybeSingle();

    if (pendingErr) {
      logger.error(
        '[demandes/caster-application] pending check error:',
        pendingErr
      );
      return res.status(500).json({ error: 'Verification error.' });
    }

    if (existingPending) {
      return res.status(409).json({
        error: 'Tu as déjà une candidature caster en attente.',
        code: 'ALREADY_PENDING',
        existingDemandeId: existingPending.id,
      });
    }

    const payload: Record<string, unknown> = {
      portfolio_url: portfolioUrl,
      user_email: user.email ?? null,
      user_display_name:
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        null,
    };

    const { data: newDemande, error: insertErr } = await supabaseAdmin
      .from('demandes')
      .insert({
        user_id: userId,
        type: 'caster_application',
        status: 'pending',
        source: 'website',
        comment: motivation,
        payload,
        tenant_id: tenantId,
      })
      .select('id, status, created_at')
      .single();

    if (insertErr || !newDemande) {
      logger.error('[demandes/caster-application] insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to create application.' });
    }

    return res.status(201).json({
      application: {
        id: newDemande.id,
        status: newDemande.status,
        created_at: newDemande.created_at,
      },
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
});
