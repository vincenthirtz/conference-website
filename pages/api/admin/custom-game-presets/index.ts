// pages/api/admin/custom-game-presets/index.ts
//
// Presets de partie personnalisée (`custom_game_presets`) — code d'import du
// jeu + rappel de config, résolus par périmètre (tenant > tournoi > phase).
// Aucun jeu n'expose d'API pour LANCER un lobby : le code d'import est le seul
// artefact automatisable, on le distribue à l'hôte du match.
//
// GET  — `?game=<slug>` (défaut overwatch), filtres optionnels
//        `?tournament_id=<uuid>` (renvoie aussi les presets tenant applicables)
//        → `{ presets: PresetRow[] }`, triés du plus général au plus spécifique.
// POST — créer un preset (`{ game?, tournament_id?, stage_id?, name,
//        import_code, description?, map_pool?, enabled? }`) → 201 `{ preset }`.
//        409 si un preset existe déjà sur le même périmètre (un seul par
//        périmètre — c'est ce qui rend la résolution déterministe).
//
// Auth : admin+ sur le tenant actif. Scope tenant strict via `ctx.tenantId`.
// Writes : withAdminIdempotency + applyRateLimit. Audit : staff_logs
// action='other', entity_type='custom_game_preset'.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { isGameSlug } from '@/config/games';
import {
  normalizeImportCode,
  isValidImportCode,
  normalizeMapPool,
  presetScope,
  PRESET_NAME_MAX,
  PRESET_DESCRIPTION_MAX,
  type CustomGamePresetRow,
} from '@/utils/customGamePresets';

export const PRESET_COLUMNS =
  'id, tenant_id, game, tournament_id, stage_id, name, import_code, description, map_pool, enabled, created_by, created_at, updated_at';

export const DEFAULT_PRESET_GAME = 'overwatch';

const uuid = z.string().uuid();

const createBodySchema = z
  .object({
    game: z.string().optional(),
    tournament_id: uuid.nullable().optional(),
    stage_id: uuid.nullable().optional(),
    name: z.string().trim().min(1).max(PRESET_NAME_MAX),
    import_code: z.string().min(1),
    description: z
      .string()
      .trim()
      .max(PRESET_DESCRIPTION_MAX)
      .nullable()
      .optional(),
    map_pool: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((b) => !b.stage_id || !!b.tournament_id, {
    message: 'stage_id requires tournament_id',
    path: ['stage_id'],
  });

/** Tri du plus général au plus spécifique, puis par nom — stable pour l'UI. */
export function sortPresets(
  rows: CustomGamePresetRow[]
): CustomGamePresetRow[] {
  const rank = { tenant: 0, tournament: 1, stage: 2 } as const;
  return [...rows].sort((a, b) => {
    const ra = rank[presetScope(a)];
    const rb = rank[presetScope(b)];
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') return handleList(req, res, ctx);
  if (req.method === 'POST') {
    if (
      applyRateLimit(
        req,
        res,
        { max: 30, windowMs: 60_000 },
        'admin-custom-game-presets'
      )
    ) {
      return;
    }
    return handleCreate(req, res, ctx);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

function readQueryParam(req: NextApiRequest, key: string): string | null {
  const raw = req.query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function handleList(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const game = readQueryParam(req, 'game') ?? DEFAULT_PRESET_GAME;
  if (!isGameSlug(game)) {
    return res
      .status(400)
      .json({ error: 'Invalid game slug.', code: 'INVALID_GAME' });
  }

  const tournamentId = readQueryParam(req, 'tournament_id');
  if (tournamentId && !uuid.safeParse(tournamentId).success) {
    return res
      .status(400)
      .json({ error: 'Invalid tournament id.', code: 'INVALID_TOURNAMENT_ID' });
  }

  const { data, error } = await supabaseAdmin
    .from('custom_game_presets')
    .select(PRESET_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('game', game);

  if (error) {
    logger.error('[admin/custom-game-presets] list error', error, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }

  let rows = (data ?? []) as CustomGamePresetRow[];

  // Filtre tournoi : on garde le périmètre demandé ET le défaut tenant, qui
  // sert de repli pour ce tournoi — c'est exactement ce que l'admin doit voir
  // pour comprendre quel code partira réellement.
  if (tournamentId) {
    rows = rows.filter(
      (r) => r.tournament_id === tournamentId || r.tournament_id === null
    );
  }

  return res.status(200).json({ presets: sortPresets(rows) });
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const game = parsed.data.game ?? DEFAULT_PRESET_GAME;
  if (!isGameSlug(game)) {
    return res
      .status(400)
      .json({ error: 'Invalid game slug.', code: 'INVALID_GAME' });
  }

  const importCode = normalizeImportCode(parsed.data.import_code, game);
  if (!isValidImportCode(importCode, game)) {
    return res.status(400).json({
      error:
        game === DEFAULT_PRESET_GAME
          ? "Code d'import invalide (4 à 12 caractères alphanumériques)."
          : "Code d'import invalide.",
      code: 'INVALID_IMPORT_CODE',
    });
  }

  const tournamentId = parsed.data.tournament_id ?? null;
  const stageId = parsed.data.stage_id ?? null;

  // Refs loose côté DB (pas de FK) → on vérifie ici que le tournoi et la phase
  // appartiennent bien au tenant actif, sinon un preset pourrait être rattaché
  // à un tournoi d'un autre tenant et ne jamais se résoudre.
  if (tournamentId) {
    const { data: t, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select('id')
      .eq('id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (tErr) {
      logger.error(
        '[admin/custom-game-presets] tournament lookup error',
        tErr,
        {
          tenantId: ctx.tenantId,
        }
      );
      return res.status(500).json({ error: 'Server error.' });
    }
    if (!t) {
      return res
        .status(404)
        .json({ error: 'Tournament not found.', code: 'UNKNOWN_TOURNAMENT' });
    }
  }

  if (stageId) {
    const { data: s, error: sErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id')
      .eq('id', stageId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (sErr) {
      logger.error('[admin/custom-game-presets] stage lookup error', sErr, {
        tenantId: ctx.tenantId,
      });
      return res.status(500).json({ error: 'Server error.' });
    }
    if (
      !s ||
      (s as { tournament_id?: string }).tournament_id !== tournamentId
    ) {
      return res
        .status(404)
        .json({ error: 'Stage not found.', code: 'UNKNOWN_STAGE' });
    }
  }

  // Un seul preset par périmètre — l'index unique DB le garantit, on
  // pré-vérifie pour renvoyer un 409 explicite (et parce que le mock de test
  // n'applique pas les contraintes).
  const { data: existing, error: existErr } = await supabaseAdmin
    .from('custom_game_presets')
    .select('id, tournament_id, stage_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('game', game);

  if (existErr) {
    logger.error('[admin/custom-game-presets] dedup lookup error', existErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }

  const clash = ((existing ?? []) as CustomGamePresetRow[]).some(
    (r) =>
      (r.tournament_id ?? null) === tournamentId &&
      (r.stage_id ?? null) === stageId
  );
  if (clash) {
    return res.status(409).json({
      error: 'A preset already exists for this scope.',
      code: 'DUPLICATE_PRESET_SCOPE',
    });
  }

  const now = new Date().toISOString();
  const insert = {
    tenant_id: ctx.tenantId,
    game,
    tournament_id: tournamentId,
    stage_id: stageId,
    name: parsed.data.name,
    import_code: importCode,
    description: parsed.data.description ?? null,
    map_pool: normalizeMapPool(parsed.data.map_pool ?? []),
    enabled: parsed.data.enabled ?? true,
    created_by: ctx.staff.id,
    created_at: now,
    updated_at: now,
  };

  const { data: created, error: insertErr } = await supabaseAdmin
    .from('custom_game_presets')
    .insert(insert)
    .select(PRESET_COLUMNS)
    .single();

  if (insertErr || !created) {
    logger.error('[admin/custom-game-presets] insert error', insertErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to create preset.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'custom_game_preset',
    entity_id: (created as CustomGamePresetRow).id,
    tenant_id: ctx.tenantId,
    tournament_id: tournamentId,
    payload: {
      action: 'create_custom_game_preset',
      game,
      scope: presetScope({ tournament_id: tournamentId, stage_id: stageId }),
      name: insert.name,
      // Volontairement PAS le code d'import : un log staff est plus largement
      // lisible que la table, et le code donne accès au lobby.
    },
  });

  return res.status(201).json({ preset: created as CustomGamePresetRow });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-custom-game-presets' }),
  'admin'
);
