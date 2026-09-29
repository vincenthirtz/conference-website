// features/player/scrims/service/searches.ts — recherche de scrim de MON
// équipe (R5) + alerte d'adversaire (R6). Déplacé de
// pages/api/teams/scrim-searches (lot P13) : mêmes règles, mêmes messages.
//
// Une seule recherche active par équipe (index unique partiel) : relancer =
// mettre à jour l'active. `teams.open_for_scrim` est recalé après chaque
// mutation — dérivé de « a une recherche vivante ».

import { LegacyAdminError } from '@/utils/admin/errors';
import { emitBotEvent } from '@/utils/botEvents';
import { parseBody } from '@/utils/player/errors';
import {
  MAX_SEARCH_SLOTS,
  defaultExpiryFor,
  expireStaleSearches,
  isSearchLive,
  normalizeSearchSlots,
  overlappingSlots,
  syncOpenForScrimFlag,
  type ScrimSearchRow,
} from '@/utils/teams/scrimSearch';
import {
  cancelActiveSearch,
  insertSearch,
  listOtherActiveSearches,
  readActiveSearch,
  readActiveSearchId,
  updateSearch,
  type ScrimSearchWrite,
} from '../repository/searches';
import {
  ScrimSearchBody,
  type ScrimSearchResponse,
  type ScrimSearchSaveResponse,
} from '../schemas';
import type { ScrimsTeamCtx } from './context';

/** Plafond d'équipes alertées par annonce — on notifie, on ne spamme pas. */
const MAX_MATCH_NOTIFIED = 10;

export async function readMySearch(
  ctx: ScrimsTeamCtx
): Promise<ScrimSearchResponse> {
  const { search, error } = await readActiveSearch(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error) {
    ctx.logger.error('[scrim-searches] GET error', error);
    throw new LegacyAdminError(500, 'Lecture impossible.');
  }
  // Une recherche périmée est traitée comme absente (et nettoyée en fond).
  if (search && !isSearchLive(search as unknown as ScrimSearchRow)) {
    void expireStaleSearches(ctx.tenantId);
    return { search: null };
  }
  return { search };
}

export async function closeMySearch(
  ctx: ScrimsTeamCtx
): Promise<{ success: true; search: null }> {
  const { error } = await cancelActiveSearch(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error) {
    ctx.logger.error('[scrim-searches] DELETE error', error);
    throw new LegacyAdminError(500, 'Clôture impossible.');
  }
  await syncOpenForScrimFlag(ctx.tenantId, ctx.team.teamId);
  return { success: true, search: null };
}

export async function saveMySearch(
  ctx: ScrimsTeamCtx,
  rawBody: unknown
): Promise<ScrimSearchSaveResponse> {
  const parsed = parseBody(ScrimSearchBody, rawBody, {
    message: `Requête invalide : 1 à ${MAX_SEARCH_SLOTS} créneaux attendus.`,
    code: 'INVALID_BODY',
  });
  if (!parsed.ok) {
    throw new LegacyAdminError(400, parsed.body.error, {
      code: parsed.body.code,
    });
  }

  const slotsResult = normalizeSearchSlots(parsed.data.slots);
  if (!slotsResult.ok) {
    throw new LegacyAdminError(400, slotsResult.error, {
      code: 'INVALID_SLOTS',
    });
  }
  const slots = slotsResult.slots;
  const { tenantId } = ctx;
  const teamId = ctx.team.teamId;

  const payload: ScrimSearchWrite = {
    tenant_id: tenantId,
    team_id: teamId,
    created_by: ctx.userId,
    slots,
    format: parsed.data.format?.trim() || null,
    note: parsed.data.note?.trim() || null,
    status: 'active',
    expires_at: defaultExpiryFor(slots),
  };

  // Relance = mise à jour de l'active existante : jamais de doublon.
  const existingId = await readActiveSearchId(ctx.db, tenantId, teamId);
  const { search, error } = existingId
    ? await updateSearch(ctx.db, existingId, payload)
    : await insertSearch(ctx.db, payload);
  if (error) {
    ctx.logger.error(
      `[scrim-searches] ${existingId ? 'update' : 'insert'} error`,
      error
    );
    throw new LegacyAdminError(
      500,
      existingId ? 'Mise à jour impossible.' : 'Création impossible.'
    );
  }

  await syncOpenForScrimFlag(tenantId, teamId);

  // R6 : alerte d'adversaire. UN event ciblé (outbox → push/Discord/email
  // selon les préférences) vers les équipes dont une recherche vivante recoupe
  // nos créneaux ; aucun envoi si personne ne correspond.
  const matched = await findMatchingTeams(ctx, teamId, slots);
  if (matched.length > 0) {
    void emitBotEvent(
      'scrim.search.matched',
      {
        searchId: search?.id ?? null,
        teamId,
        slots,
        format: payload.format,
        note: payload.note,
        targetTeamIds: matched.map((m) => m.teamId),
        matches: matched,
      },
      tenantId
    ).catch((e) =>
      ctx.logger.error('[scrim-searches] scrim.search.matched emit error', e)
    );
  }

  return { search, matchedTeams: matched.length };
}

/**
 * Équipes dont une recherche vivante partage au moins un créneau avec `slots`,
 * meilleur candidat d'abord, plafonné.
 */
async function findMatchingTeams(
  ctx: ScrimsTeamCtx,
  selfTeamId: string,
  slots: string[]
): Promise<Array<{ teamId: string; commonSlots: string[] }>> {
  const { rows, error } = await listOtherActiveSearches(
    ctx.db,
    ctx.tenantId,
    selfTeamId
  );
  if (error) {
    ctx.logger.error('[scrim-searches] match read error', error);
    return [];
  }

  const out: Array<{ teamId: string; commonSlots: string[] }> = [];
  for (const row of rows as unknown as ScrimSearchRow[]) {
    if (!isSearchLive(row)) continue;
    const common = overlappingSlots(slots, row.slots || []);
    if (common.length > 0)
      out.push({ teamId: row.team_id, commonSlots: common });
  }
  out.sort((a, b) => b.commonSlots.length - a.commonSlots.length);
  return out.slice(0, MAX_MATCH_NOTIFIED);
}
