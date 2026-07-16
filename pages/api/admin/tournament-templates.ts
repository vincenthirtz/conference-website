// pages/api/admin/tournament-templates.ts
// GET  : liste les templates personnalises (stockes dans site_settings)
// POST : creer un nouveau template personnalise
// DELETE: supprimer un template personnalise

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import type { TournamentTemplate } from '@/config/tournament-templates';

const SETTINGS_KEY = 'custom_tournament_templates';

type ApiResponse =
  | { templates: TournamentTemplate[] }
  | { template: TournamentTemplate }
  | { deleted: boolean }
  | { error: string };

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res, ctx);
    case 'DELETE':
      return handleDelete(req, res, ctx);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function getCustomTemplates(): Promise<TournamentTemplate[]> {
  const { data } = await supabaseAdmin!
    .from('site_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (!data?.value) return [];

  try {
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveCustomTemplates(
  templates: TournamentTemplate[]
): Promise<void> {
  const value = JSON.stringify(templates);

  // Upsert: try update first, insert if not exists
  const { data: existing } = await supabaseAdmin!
    .from('site_settings')
    .select('key')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin!
      .from('site_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', SETTINGS_KEY);
  } else {
    await supabaseAdmin!
      .from('site_settings')
      .insert({ key: SETTINGS_KEY, value });
  }
}

async function handleGet(
  _req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  const templates = await getCustomTemplates();
  return res.status(200).json({ templates });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { name, description, stages } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res
      .status(400)
      .json({ error: 'Le nom du template est obligatoire.' });
  }

  if (!Array.isArray(stages) || stages.length === 0) {
    return res.status(400).json({ error: 'Au moins un stage est requis.' });
  }

  // Validate each stage
  const validTypes = [
    'group',
    'bracket',
    'swiss',
    'round_robin',
    'showmatch',
    'other',
  ];
  for (const s of stages) {
    if (!s.name || !s.stage_type || !validTypes.includes(s.stage_type)) {
      return res.status(400).json({
        error: `Stage invalide : nom et type requis (types: ${validTypes.join(', ')}).`,
      });
    }
  }

  const templates = await getCustomTemplates();

  const newTemplate: TournamentTemplate = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    description: (description || '').trim(),
    stages: stages.map((s: any) => ({
      name: s.name,
      stage_type: s.stage_type,
      settings: s.settings || undefined,
    })),
  };

  templates.push(newTemplate);
  await saveCustomTemplates(templates);

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_tournament_template',
        entity_type: 'tournament_template',
        entity_id: newTemplate.id,
        tenant_id: ctx.tenantId,
        payload: {
          op: 'create',
          name: newTemplate.name,
          stageCount: newTemplate.stages.length,
        },
      });
    } catch (logErr) {
      logger.error('logStaffAction(update_tournament_template) error:', logErr);
    }
  }

  return res.status(201).json({ template: newTemplate });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { templateId } = req.body || {};

  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId est requis.' });
  }

  const templates = await getCustomTemplates();
  const filtered = templates.filter((t) => t.id !== templateId);

  if (filtered.length === templates.length) {
    return res.status(404).json({ error: 'Template non trouve.' });
  }

  await saveCustomTemplates(filtered);

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_tournament_template',
        entity_type: 'tournament_template',
        entity_id: templateId,
        tenant_id: ctx.tenantId,
        payload: { op: 'delete' },
      });
    } catch (logErr) {
      logger.error('logStaffAction(update_tournament_template) error:', logErr);
    }
  }

  return res.status(200).json({ deleted: true });
}
