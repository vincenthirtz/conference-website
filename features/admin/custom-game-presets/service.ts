// features/admin/custom-game-presets/service.ts — presets de partie
// personnalisée (`custom_game_presets`) : code d'import du jeu + rappel de
// config, résolus par périmètre (tenant > tournoi > phase). Aucun jeu n'expose
// d'API pour LANCER un lobby : le code d'import est le seul artefact
// automatisable, on le distribue à l'hôte du match.
//
// Un seul preset par périmètre (409 `DUPLICATE_PRESET_SCOPE`) — c'est ce qui
// rend la résolution déterministe. Le PÉRIMÈTRE n'est pas modifiable au PATCH :
// changer de périmètre = supprimer + recréer.
//
// Le journal ne porte JAMAIS le code d'import (il donne accès au lobby, et les
// journaux staff sont largement lisibles) : seulement le nom des champs.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError, LegacyAdminError } from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import { firstParam } from '@/utils/admin/pathParams';
import { isGameSlug } from '@/config/games';
import {
  isValidImportCode,
  normalizeImportCode,
  normalizeMapPool,
  presetScope,
} from '@/utils/customGamePresets';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';
import { PresetCreateBody, PresetPatchBody, presetUuid } from './schemas';

export const DEFAULT_PRESET_GAME = 'overwatch';

export type PresetRow = NonNullable<
  Awaited<ReturnType<typeof repo.findPreset>>['row']
>;

/** Tri du plus général au plus spécifique, puis par nom — stable pour l'UI. */
export function sortPresets(rows: PresetRow[]): PresetRow[] {
  const rank = { tenant: 0, tournament: 1, stage: 2 } as const;
  return [...rows].sort((a, b) => {
    const ra = rank[presetScope(a)];
    const rb = rank[presetScope(b)];
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

const serverError = () => new AdminError(500, 'internal', 'Server error.');
const invalidGame = () =>
  new LegacyAdminError(400, 'Invalid game slug.', { code: 'INVALID_GAME' });
const invalidBody = (fields: unknown) =>
  new LegacyAdminError(400, 'Invalid body.', {
    code: 'INVALID_BODY',
    extra: { fields },
  });
const unknownPreset = () =>
  new LegacyAdminError(404, 'Preset not found.', { code: 'UNKNOWN_PRESET' });

function invalidImportCode(game: string): LegacyAdminError {
  return new LegacyAdminError(
    400,
    game === DEFAULT_PRESET_GAME
      ? "Code d'import invalide (4 à 12 caractères alphanumériques)."
      : "Code d'import invalide.",
    { code: 'INVALID_IMPORT_CODE' }
  );
}

/** Paramètre de requête non vide, sinon `null` (`?a=1&a=2` → `'1'`). */
function queryString(raw: unknown): string | null {
  const value = firstParam(raw);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPresetId(raw: unknown): string {
  const value = firstParam(raw);
  if (typeof value !== 'string' || !isValidUUID(value)) {
    throw new LegacyAdminError(400, 'Invalid preset id.', {
      code: 'INVALID_PRESET_ID',
    });
  }
  return value;
}

async function loadPreset(
  ctx: ServiceContext,
  presetId: string,
  label: 'patch' | 'delete'
): Promise<PresetRow> {
  const { row, error } = await repo.findPreset(ctx.db, ctx.tenantId, presetId);
  if (error) {
    ctx.logger.error(
      `[admin/custom-game-presets] ${label} lookup error`,
      null,
      {
        tenantId: ctx.tenantId,
      }
    );
    throw serverError();
  }
  if (!row) throw unknownPreset();
  return row;
}

/* ---------------------------------------------------------------------------
 * GET — `?game=` (défaut overwatch), `?tournament_id=` (+ défauts tenant)
 * ------------------------------------------------------------------------ */

export async function listPresets(
  ctx: ServiceContext,
  query: { game?: unknown; tournament_id?: unknown }
): Promise<{ presets: PresetRow[] }> {
  const game = queryString(query.game) ?? DEFAULT_PRESET_GAME;
  if (!isGameSlug(game)) throw invalidGame();

  const tournamentId = queryString(query.tournament_id);
  if (tournamentId && !presetUuid.safeParse(tournamentId).success) {
    throw new LegacyAdminError(400, 'Invalid tournament id.', {
      code: 'INVALID_TOURNAMENT_ID',
    });
  }

  const { rows, error } = await repo.listPresets(ctx.db, ctx.tenantId, game);
  if (error) {
    ctx.logger.error('[admin/custom-game-presets] list error', error, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }

  // Filtre tournoi : on garde le périmètre demandé ET le défaut tenant, qui
  // sert de repli pour ce tournoi — c'est exactement ce que l'admin doit voir
  // pour comprendre quel code partira réellement.
  const visible = tournamentId
    ? rows.filter(
        (r) => r.tournament_id === tournamentId || r.tournament_id === null
      )
    : rows;

  return { presets: sortPresets(visible) };
}

/* ---------------------------------------------------------------------------
 * POST — créer (409 si le périmètre est déjà pris)
 * ------------------------------------------------------------------------ */

export async function createPreset(
  ctx: ServiceContext,
  staffId: string,
  rawBody: unknown
): Promise<Audited<{ preset: PresetRow }>> {
  const parsed = PresetCreateBody.safeParse(rawBody);
  if (!parsed.success) throw invalidBody(parsed.error.flatten().fieldErrors);

  const game = parsed.data.game ?? DEFAULT_PRESET_GAME;
  if (!isGameSlug(game)) throw invalidGame();

  const importCode = normalizeImportCode(parsed.data.import_code, game);
  if (!isValidImportCode(importCode, game)) throw invalidImportCode(game);

  const tournamentId = parsed.data.tournament_id ?? null;
  const stageId = parsed.data.stage_id ?? null;

  // Refs loose côté DB (pas de FK) → on vérifie ici que le tournoi et la phase
  // appartiennent bien au tenant actif, sinon un preset pourrait être rattaché
  // à un tournoi d'un autre tenant et ne jamais se résoudre.
  if (tournamentId) {
    const t = await repo.findTournament(ctx.db, ctx.tenantId, tournamentId);
    if (t.error) {
      ctx.logger.error(
        '[admin/custom-game-presets] tournament lookup error',
        t.error,
        { tenantId: ctx.tenantId }
      );
      throw serverError();
    }
    if (!t.row) {
      throw new LegacyAdminError(404, 'Tournament not found.', {
        code: 'UNKNOWN_TOURNAMENT',
      });
    }
  }

  if (stageId) {
    const s = await repo.findStage(ctx.db, ctx.tenantId, stageId);
    if (s.error) {
      ctx.logger.error(
        '[admin/custom-game-presets] stage lookup error',
        s.error,
        {
          tenantId: ctx.tenantId,
        }
      );
      throw serverError();
    }
    if (!s.row || s.row.tournament_id !== tournamentId) {
      throw new LegacyAdminError(404, 'Stage not found.', {
        code: 'UNKNOWN_STAGE',
      });
    }
  }

  // Un seul preset par périmètre — l'index unique DB le garantit, on
  // pré-vérifie pour renvoyer un 409 explicite (et parce que le mock de test
  // n'applique pas les contraintes).
  const scopes = await repo.listPresetScopes(ctx.db, ctx.tenantId, game);
  if (scopes.error) {
    ctx.logger.error(
      '[admin/custom-game-presets] dedup lookup error',
      scopes.error,
      { tenantId: ctx.tenantId }
    );
    throw serverError();
  }
  const clash = scopes.rows.some(
    (r) =>
      (r.tournament_id ?? null) === tournamentId &&
      (r.stage_id ?? null) === stageId
  );
  if (clash) {
    throw new LegacyAdminError(409, 'A preset already exists for this scope.', {
      code: 'DUPLICATE_PRESET_SCOPE',
    });
  }

  const now = new Date().toISOString();
  const name = parsed.data.name;
  const { row, error } = await repo.insertPreset(ctx.db, {
    tenant_id: ctx.tenantId,
    game,
    tournament_id: tournamentId,
    stage_id: stageId,
    name,
    import_code: importCode,
    description: parsed.data.description ?? null,
    map_pool: normalizeMapPool(parsed.data.map_pool ?? []),
    enabled: parsed.data.enabled ?? true,
    created_by: staffId,
    created_at: now,
    updated_at: now,
  });
  if (error || !row) {
    ctx.logger.error('[admin/custom-game-presets] insert error', error, {
      tenantId: ctx.tenantId,
    });
    throw new AdminError(500, 'internal', 'Failed to create preset.');
  }

  return {
    result: { preset: row },
    audit: {
      entity_type: 'custom_game_preset',
      entity_id: row.id,
      tournament_id: tournamentId,
      payload: {
        action: 'create_custom_game_preset',
        game,
        scope: presetScope({ tournament_id: tournamentId, stage_id: stageId }),
        name,
        // Volontairement PAS le code d'import (cf. l'en-tête).
      },
    },
  };
}

/* ---------------------------------------------------------------------------
 * PATCH / DELETE /api/admin/custom-game-presets/[presetId]
 * ------------------------------------------------------------------------ */

export async function updatePreset(
  ctx: ServiceContext,
  rawPresetId: unknown,
  rawBody: unknown
): Promise<Audited<{ preset: PresetRow }>> {
  const presetId = readPresetId(rawPresetId);
  const parsed = PresetPatchBody.safeParse(rawBody);
  if (!parsed.success) throw invalidBody(parsed.error.flatten().fieldErrors);

  const row = await loadPreset(ctx, presetId, 'patch');

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const d = parsed.data;
  if (d.name !== undefined) update.name = d.name;
  if (d.description !== undefined) update.description = d.description ?? null;
  if (d.map_pool !== undefined) update.map_pool = normalizeMapPool(d.map_pool);
  if (d.enabled !== undefined) update.enabled = d.enabled;

  if (d.import_code !== undefined) {
    const game = row.game || DEFAULT_PRESET_GAME;
    const code = normalizeImportCode(d.import_code, game);
    if (!isValidImportCode(code, game)) throw invalidImportCode(game);
    update.import_code = code;
  }

  const updated = await repo.updatePreset(
    ctx.db,
    ctx.tenantId,
    presetId,
    update
  );
  if (updated.error || !updated.row) {
    ctx.logger.error(
      '[admin/custom-game-presets] patch update error',
      updated.error,
      { tenantId: ctx.tenantId }
    );
    throw new AdminError(500, 'internal', 'Failed to update preset.');
  }

  return {
    result: { preset: updated.row },
    audit: {
      entity_type: 'custom_game_preset',
      entity_id: presetId,
      tournament_id: row.tournament_id ?? null,
      payload: {
        action: 'update_custom_game_preset',
        // Les NOMS des champs touchés, jamais leurs valeurs.
        fields: Object.keys(update).filter((k) => k !== 'updated_at'),
      },
    },
  };
}

export async function deletePreset(
  ctx: ServiceContext,
  rawPresetId: unknown
): Promise<Audited<{ ok: true }>> {
  const presetId = readPresetId(rawPresetId);
  const row = await loadPreset(ctx, presetId, 'delete');

  const { error } = await repo.deletePreset(ctx.db, ctx.tenantId, presetId);
  if (error) {
    ctx.logger.error('[admin/custom-game-presets] delete error', error, {
      tenantId: ctx.tenantId,
    });
    throw new AdminError(500, 'internal', 'Failed to delete preset.');
  }

  return {
    result: { ok: true },
    audit: {
      entity_type: 'custom_game_preset',
      entity_id: presetId,
      tournament_id: row.tournament_id ?? null,
      payload: {
        action: 'delete_custom_game_preset',
        game: row.game,
        scope: presetScope(row),
        name: row.name,
      },
    },
  };
}
