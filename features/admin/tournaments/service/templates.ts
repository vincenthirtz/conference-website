// features/admin/tournaments/service/templates.ts — modèles de tournoi
// personnalisés (liste, création, suppression).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import type {
  TournamentTemplate,
  TemplateStage,
} from '@/config/tournament-templates';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/templates';

const VALID_STAGE_TYPES = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'other',
];

async function readTemplates(
  ctx: ServiceContext
): Promise<TournamentTemplate[]> {
  const raw = await repo.readTemplatesBlob(ctx.db);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listTournamentTemplates(ctx: ServiceContext) {
  return { templates: await readTemplates(ctx) };
}

export async function createTournamentTemplate(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<Audited<{ template: TournamentTemplate }>> {
  const { name, description, stages } = body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new LegacyAdminError(400, 'Le nom du template est obligatoire.');
  }
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new LegacyAdminError(400, 'Au moins un stage est requis.');
  }
  for (const s of stages as Array<Record<string, unknown>>) {
    if (
      !s.name ||
      !s.stage_type ||
      !VALID_STAGE_TYPES.includes(s.stage_type as string)
    ) {
      throw new LegacyAdminError(
        400,
        `Stage invalide : nom et type requis (types: ${VALID_STAGE_TYPES.join(', ')}).`
      );
    }
  }

  const templates = await readTemplates(ctx);
  const template: TournamentTemplate = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    description: (((description as string) || '') as string).trim(),
    stages: (stages as TemplateStage[]).map((s) => ({
      name: s.name,
      stage_type: s.stage_type,
      settings: s.settings || undefined,
    })),
  };
  templates.push(template);
  await repo.writeTemplatesBlob(ctx.db, JSON.stringify(templates));

  return {
    result: { template },
    audit: {
      entity_type: 'tournament_template',
      entity_id: template.id,
      payload: {
        op: 'create',
        name: template.name,
        stageCount: template.stages.length,
      },
    },
  };
}

export async function deleteTournamentTemplate(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<Audited<{ deleted: true }>> {
  const { templateId } = body;
  if (!templateId || typeof templateId !== 'string') {
    throw new LegacyAdminError(400, 'templateId est requis.');
  }
  const templates = await readTemplates(ctx);
  const filtered = templates.filter((t) => t.id !== templateId);
  if (filtered.length === templates.length) {
    throw new LegacyAdminError(404, 'Template non trouve.');
  }
  await repo.writeTemplatesBlob(ctx.db, JSON.stringify(filtered));
  return {
    result: { deleted: true },
    audit: {
      entity_type: 'tournament_template',
      entity_id: templateId,
      payload: { op: 'delete' },
    },
  };
}
