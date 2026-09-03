// pages/api/demandes/scrim.ts
// API pour les demandes de scrim (match amical entre deux equipes)
// - POST : creer une demande de scrim
// - GET  : recuperer ses propres demandes de type "scrim"

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { notifyScrimRequest } from '@/utils/discord';
import { withAuthRoute } from '@/utils/staff';
import {
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { normalizeSlots } from '@/utils/teams/scrimNegotiation';
import {
  notifyScrimRequestDm,
  notifyScrimRequestEmail,
  formatScrimDateFr,
} from '@/utils/scrimRequestNotify';

import { logger } from '../../../utils/logger';
export type ScrimRequestBody = {
  teamId: string;
  message?: string;
  /** Multi-slot negotiation: 1..5 ISO datetimes on the table. */
  proposedSlots?: string[];
  /** Legacy single-slot fallback (folded into proposedSlots). */
  preferredDate?: string;
};

const scrimBodySchema = z.object({
  teamId: z.string().trim().min(1, 'Selectionne une equipe adverse.'),
  message: z.string().trim().max(1000).optional().nullable(),
  proposedSlots: z.array(z.string()).optional(),
  preferredDate: z.string().optional(),
});

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'demandes-scrim'))
    return;

  const userId = user.id;
  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: userId,
  });

  if (req.method === 'GET') {
    const { data: demandes, error: demandesErr } = await supabaseAdmin
      .from('demandes')
      .select('*, team:teams!team_id(id, name, short_name, logo_url)')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .order('created_at', { ascending: false });

    if (demandesErr) {
      logger.error('[demandes/scrim] GET error:', demandesErr);
      return res.status(500).json({ error: 'Failed to load requests.' });
    }

    return res.status(200).json({ demandes: demandes || [] });
  }

  if (req.method === 'POST') {
    const parsed = scrimBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return res.status(400).json({
        error: first?.message || 'Requête invalide.',
        field: first?.path?.join('.') || undefined,
      });
    }
    const body = parsed.data;

    const teamId = body.teamId.trim();
    const message = body.message?.trim()?.slice(0, 1000) || null;

    // Verifier que l'user est capitaine ou manager d'une equipe active
    const access = await getManagedTeamForRequest(req, userId, tenantId);
    if (!access) {
      return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
    }

    // Permission fine (R2) : le rôle doit couvrir `manage_scrims`.
    const denied = assertTeamPermission(access, 'manage_scrims');
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const { data: myTeam } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('id', access.teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!myTeam) {
      return res.status(404).json({ error: 'Team introuvable.' });
    }

    // Ne peut pas demander un scrim contre sa propre equipe
    if (access.teamId === teamId) {
      return res.status(400).json({
        error: 'Tu ne peux pas demander un scrim contre ta propre equipe.',
      });
    }

    // Verifier que l'equipe cible existe
    const { data: targetTeam, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .eq('is_active', true)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (teamErr || !targetTeam) {
      return res.status(400).json({ error: "L'equipe cible n'existe pas." });
    }

    // Verifier s'il existe deja une demande de scrim pending vers cette equipe
    const { data: existingDemande, error: existingErr } = await supabaseAdmin
      .from('demandes')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .eq('team_id', teamId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingErr) {
      logger.error('[demandes/scrim] check existing error:', existingErr);
      return res.status(500).json({ error: 'Verification error.' });
    }

    if (existingDemande) {
      return res.status(400).json({
        error: 'Tu as deja une demande de scrim en attente vers cette equipe.',
      });
    }

    // Multi-slot negotiation : prefer `proposedSlots`, fall back to the legacy
    // single `preferredDate`. Validate 1..MAX_SCRIM_SLOTS + ISO + dedupe.
    const slotInput =
      body.proposedSlots && body.proposedSlots.length > 0
        ? body.proposedSlots
        : body.preferredDate
          ? [body.preferredDate]
          : [];
    const slotsResult = normalizeSlots(slotInput);
    if (!slotsResult.ok) {
      return res.status(400).json({ error: slotsResult.error });
    }
    const proposedSlots = slotsResult.slots;

    // Back-compat : preferred_date suit toujours slots[0].
    const preferredDate = proposedSlots[0];

    const payload: Record<string, unknown> = {
      user_email: user.email,
      user_display_name:
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        null,
      from_team_id: myTeam.id,
      from_team_name: myTeam.name,
      target_team_name: targetTeam.name,
      preferred_date: preferredDate,
      scrim_nego: {
        slots: proposedSlots,
        proposed_by: myTeam.id,
        rounds: 1,
        agreed_slot: null,
      },
    };

    const { data: newDemande, error: insertErr } = await supabaseAdmin
      .from('demandes')
      .insert({
        user_id: userId,
        team_id: teamId,
        type: 'scrim',
        status: 'pending',
        comment: message,
        source: 'website',
        payload,
        tenant_id: tenantId,
      })
      .select('*')
      .single();

    if (insertErr) {
      logger.error('[demandes/scrim] insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to create request.' });
    }

    // Fire-and-forget Discord notification (errors are logged inside).
    notifyScrimRequest({
      fromTeamName: myTeam.name,
      targetTeamName: targetTeam.name,
      preferredDate,
      message,
      requesterDisplayName:
        (payload.user_display_name as string | null) ||
        (user.email as string | null),
    });

    // Email best-effort au capitaine de l'équipe CIBLE (s'ajoute au Discord).
    // Fire-and-forget : un échec email ne doit jamais casser la réponse 201.
    // Email ET message privé Discord partent ensemble : la capitaine est
    // jointe là où elle est, sans dépendre d'une boîte mail relevée le soir.
    const notifyArgs = {
      tenantId,
      targetTeamId: teamId,
      demandeId: (newDemande as { id?: string } | null)?.id ?? null,
      slots: proposedSlots,
      opponentName: myTeam.name,
      dateLabel: formatScrimDateFr(proposedSlots),
      message,
      requesterName: myTeam.name,
      isExternal: false,
    };
    void notifyScrimRequestEmail(notifyArgs).catch(() => {});
    void notifyScrimRequestDm(notifyArgs).catch(() => {});

    return res.status(201).json({
      success: true,
      demande: newDemande,
      message: `Ta demande de scrim contre "${targetTeam.name}" a ete envoyee.`,
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
});
