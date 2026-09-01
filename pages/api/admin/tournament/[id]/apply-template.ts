// pages/api/admin/tournament/[id]/apply-template.ts
// Applique un template pre-defini a un tournoi (cree les stages automatiquement).
// POST : { templateId: string, append?: boolean }
// append=true : ajoute les stages du template apres les stages existants

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { TOURNAMENT_TEMPLATES } from '@/config/tournament-templates';

import { logger } from '../../../../../utils/logger';
type ApiResponse = { stages: any[] } | { error: string };

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tournament-apply-template' }),
  'admin'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const tournamentId = String(id);
  const { templateId, append } = req.body || {};

  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId is required' });
  }

  try {
    // Verify template exists (check built-in first, then custom)
    let template = TOURNAMENT_TEMPLATES.find((t) => t.id === templateId);

    if (!template) {
      const { data: settingsRow } = await supabaseAdmin
        .from('site_settings')
        .select('value')
        .eq('tenant_id', ctx.tenantId)
        .eq('key', 'custom_tournament_templates')
        .maybeSingle();

      if (settingsRow?.value) {
        try {
          const custom = JSON.parse(settingsRow.value);
          if (Array.isArray(custom)) {
            template = custom.find((t: any) => t.id === templateId);
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (!template) {
      return res
        .status(400)
        .json({ error: `Template "${templateId}" not found` });
    }

    // Verify tournament exists (scoped to current tenant)
    const { data: tournament, error: tournamentErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name')
      .eq('id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (tournamentErr || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Check existing stages
    const { data: existingStages } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, order_index')
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .order('order_index', { ascending: false });

    const hasExisting = existingStages && existingStages.length > 0;

    if (hasExisting && !append) {
      return res.status(400).json({
        error:
          'Ce tournoi a deja des stages. Supprimez-les avant d\'appliquer un template, ou utilisez le mode "append".',
      });
    }

    // In append mode, start order_index after the last existing stage
    const startIndex = hasExisting
      ? (existingStages![0].order_index ?? existingStages!.length - 1) + 1
      : 0;

    // Create stages from template
    const stageInserts = template.stages.map((s, idx) => ({
      tenant_id: ctx.tenantId,
      tournament_id: tournamentId,
      name: s.name,
      slug: s.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      stage_type: s.stage_type,
      order_index: startIndex + idx,
      is_active: false,
      is_public: false,
      start_date: null,
      end_date: null,
      settings: s.settings || null,
    }));

    const { data: createdStages, error: insertErr } = await supabaseAdmin
      .from('tournament_stages')
      .insert(stageInserts)
      .select('*');

    if (insertErr || !createdStages) {
      logger.error('apply-template insert stages error:', insertErr);
      return res
        .status(500)
        .json({ error: 'Failed to create stages from template' });
    }

    // Log staff action
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'apply_template',
          entity_type: 'tournament',
          entity_id: tournamentId,
          tournament_id: tournamentId,
          payload: {
            template_id: templateId,
            template_name: template.name,
            append: !!append,
            created_stage_ids: createdStages.map((s: any) => s.id),
          },
        });
      } catch (e) {
        logger.error('apply-template logStaffAction error:', e);
      }
    }

    return res.status(201).json({ stages: createdStages });
  } catch (err: unknown) {
    logger.error('[/api/admin/tournament/[id]/apply-template] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
