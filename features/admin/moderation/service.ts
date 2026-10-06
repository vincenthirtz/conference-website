// features/admin/moderation/service.ts — règles staff de la modération :
// blacklists joueurs et entités, journal des alertes, tickets support et
// leur conversion en entrée de blacklist. Ref : docs/BLACKLIST_DESIGN.md.
//
// Normalisations à l'écriture (inchangées) : texte vide → null, battle_tag en
// minuscules ; `banned_by` = compte auth du staff (FK auth.users), pas son
// id staff. Le journal staff est écrit par `defineAdminRoute`.

import type { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import type { TablesUpdate } from '@/types/database.generated';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import type { Audited } from '../_shared/audited';
import { parseWithLegacyFields } from '../_shared/legacyParse';
import * as repo from './repository';
import {
  BlacklistAlertsQuery,
  BlacklistCreateBody,
  BlacklistUpdateBody,
  ConvertEntityBody,
  ConvertPlayerBody,
  EntityBlacklistCreateBody,
  EntityBlacklistUpdateBody,
  TICKET_CATEGORIES,
  TICKET_SEARCH_MAX_LENGTH,
  TICKET_SEVERITIES,
  TICKET_STATUSES,
} from './schemas';

/** Normalise une valeur texte optionnelle en `string | null` (vide → null). */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalise un battletag pour le stockage (lowercase + trim). */
function normalizeBattleTag(value: string | null | undefined): string | null {
  const trimmed = nullableText(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function activeFilter(active: unknown): boolean | null {
  if (active === 'true') return true;
  if (active === 'false') return false;
  return null;
}

/** Compte auth du staff : `banned_by` référence auth.users, pas `staff.id`. */
function authUserId(ctx: ServiceContext): string {
  if (ctx.actor.kind !== 'staff') {
    throw new AdminError(403, 'forbidden', 'Accès refusé.');
  }
  return ctx.actor.userId;
}

type Page = { limit: number; offset: number };

/* ---------------------------------------------------------------------------
 * Blacklist joueurs
 * ------------------------------------------------------------------------ */

export async function listPlayerBlacklist(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  page: Page
) {
  const search = sanitizeSearch(query.search as string | string[] | undefined);
  const { rows, count, error } = await repo.listPlayerBlacklist(
    ctx.db,
    ctx.tenantId,
    {
      ...page,
      searchPattern: search ? `%${escapePostgrestValue(search)}%` : null,
      active: activeFilter(query.active),
    }
  );
  if (error) {
    ctx.logger.error('[admin/blacklist] list error', error);
    throw new AdminError(500, 'internal', 'Failed to load the blacklist.');
  }
  return { items: rows, total: typeof count === 'number' ? count : null };
}

export async function addPlayerToBlacklist(
  ctx: ServiceContext,
  rawBody: unknown
) {
  const body = parseWithLegacyFields(BlacklistCreateBody, rawBody ?? {});
  const insertPayload = {
    tenant_id: ctx.tenantId,
    battle_tag: normalizeBattleTag(body.battle_tag),
    display_name: nullableText(body.display_name),
    discord_user_id: nullableText(body.discord_user_id),
    reason: nullableText(body.reason),
    notes: nullableText(body.notes),
    banned_by: authUserId(ctx),
    active: true,
  };
  const { row, error } = await repo.insertPlayerBlacklist(
    ctx.db,
    insertPayload
  );
  if (error || !row) {
    ctx.logger.error('[admin/blacklist] create error', error);
    throw new AdminError(
      500,
      'internal',
      'Failed to create the blacklist entry.'
    );
  }
  return {
    result: row,
    audit: {
      entity_type: 'blacklist',
      entity_id: row.id,
      payload: {
        battle_tag: insertPayload.battle_tag,
        display_name: insertPayload.display_name,
        discord_user_id: insertPayload.discord_user_id,
        reason: insertPayload.reason,
      },
    },
  } satisfies Audited<unknown>;
}

export async function updatePlayerBlacklistEntry(
  ctx: ServiceContext,
  id: string,
  rawBody: unknown
) {
  const body = parseWithLegacyFields(BlacklistUpdateBody, rawBody ?? {});
  const updatePayload: Record<string, unknown> = {};
  if (body.reason !== undefined)
    updatePayload.reason = nullableText(body.reason);
  if (body.notes !== undefined) updatePayload.notes = nullableText(body.notes);
  if (body.active !== undefined) updatePayload.active = body.active;

  const { row, error } = await repo.updatePlayerBlacklist(
    ctx.db,
    ctx.tenantId,
    id,
    updatePayload as TablesUpdate<'player_blacklist'>
  );
  if (error) {
    ctx.logger.error('[admin/blacklist/id] update error', error);
    throw new AdminError(
      500,
      'internal',
      'Failed to update the blacklist entry.'
    );
  }
  if (!row) throw new NotFoundError('Blacklist entry not found.');
  return {
    result: row,
    audit: {
      entity_type: 'blacklist',
      entity_id: row.id,
      payload: updatePayload,
    },
  } satisfies Audited<unknown>;
}

export async function removePlayerBlacklistEntry(
  ctx: ServiceContext,
  id: string
) {
  const { row, error } = await repo.deletePlayerBlacklist(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (error) {
    ctx.logger.error('[admin/blacklist/id] delete error', error);
    throw new AdminError(
      500,
      'internal',
      'Failed to delete the blacklist entry.'
    );
  }
  if (!row) throw new NotFoundError('Blacklist entry not found.');
  return {
    result: undefined,
    audit: { entity_type: 'blacklist', entity_id: id, payload: null },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Blacklist entités (équipes / structures)
 * ------------------------------------------------------------------------ */

export async function listEntityBlacklist(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  page: Page
) {
  const search = sanitizeSearch(query.search as string | string[] | undefined);
  const entityType = query.entity_type;
  const { rows, count, error } = await repo.listEntityBlacklist(
    ctx.db,
    ctx.tenantId,
    {
      ...page,
      namePattern: search ? `%${escapePostgrestValue(search)}%` : null,
      active: activeFilter(query.active),
      entityType:
        entityType === 'team' || entityType === 'org' ? entityType : null,
    }
  );
  if (error) {
    ctx.logger.error('[admin/entity-blacklist] list error', error);
    throw new AdminError(
      500,
      'internal',
      'Failed to load the entity blacklist.'
    );
  }
  return { items: rows, total: typeof count === 'number' ? count : null };
}

export async function addEntityToBlacklist(
  ctx: ServiceContext,
  rawBody: unknown
) {
  const body = parseWithLegacyFields(EntityBlacklistCreateBody, rawBody ?? {});
  const insertPayload = {
    tenant_id: ctx.tenantId,
    entity_type: body.entity_type,
    // Nom stocké tel que saisi (trimé) — le matching normalise à la lecture
    // (cf. utils/moderation/entityBlacklist.ts).
    name: body.name,
    reason: nullableText(body.reason),
    notes: nullableText(body.notes),
    banned_by: authUserId(ctx),
    active: true,
  };
  const { row, error } = await repo.insertEntityBlacklist(
    ctx.db,
    insertPayload
  );
  if (error || !row) {
    ctx.logger.error('[admin/entity-blacklist] create error', error);
    throw new AdminError(
      500,
      'internal',
      'Failed to create the entity blacklist entry.'
    );
  }
  return {
    result: row,
    audit: {
      entity_type: 'entity_blacklist',
      entity_id: row.id,
      payload: {
        entity_type: insertPayload.entity_type,
        name: insertPayload.name,
        reason: insertPayload.reason,
      },
    },
  } satisfies Audited<unknown>;
}

export async function updateEntityBlacklistEntry(
  ctx: ServiceContext,
  id: string,
  rawBody: unknown
) {
  const body = parseWithLegacyFields(EntityBlacklistUpdateBody, rawBody ?? {});
  const updatePayload: Record<string, unknown> = {};
  if (body.name !== undefined) updatePayload.name = body.name;
  if (body.entity_type !== undefined)
    updatePayload.entity_type = body.entity_type;
  if (body.reason !== undefined)
    updatePayload.reason = nullableText(body.reason);
  if (body.notes !== undefined) updatePayload.notes = nullableText(body.notes);
  if (body.active !== undefined) updatePayload.active = body.active;

  const { row, error } = await repo.updateEntityBlacklist(
    ctx.db,
    ctx.tenantId,
    id,
    updatePayload as TablesUpdate<'entity_blacklist'>
  );
  if (error) {
    ctx.logger.error('[admin/entity-blacklist/id] update error', error);
    throw new AdminError(
      500,
      'internal',
      'Failed to update the entity blacklist entry.'
    );
  }
  if (!row) throw new NotFoundError('Entity blacklist entry not found.');
  return {
    result: row,
    audit: {
      entity_type: 'entity_blacklist',
      entity_id: row.id,
      payload: updatePayload,
    },
  } satisfies Audited<unknown>;
}

export async function removeEntityBlacklistEntry(
  ctx: ServiceContext,
  id: string
) {
  const { row, error } = await repo.deleteEntityBlacklist(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (error) {
    ctx.logger.error('[admin/entity-blacklist/id] delete error', error);
    throw new AdminError(
      500,
      'internal',
      'Failed to delete the entity blacklist entry.'
    );
  }
  if (!row) throw new NotFoundError('Entity blacklist entry not found.');
  return {
    result: undefined,
    audit: { entity_type: 'entity_blacklist', entity_id: id, payload: null },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Journal des alertes de détection (curseur descendant sur created_at)
 * ------------------------------------------------------------------------ */

/** Query déjà validée par la route (`BlacklistAlertsQuery`). */
export async function listBlacklistAlerts(
  ctx: ServiceContext,
  q: z.output<typeof BlacklistAlertsQuery>
) {
  // On lit limit+1 pour savoir s'il reste une page (curseur = created_at de la
  // dernière row renvoyée). Tri descendant strict.
  const { rows, error } = await repo.listBlacklistAlerts(ctx.db, ctx.tenantId, {
    limit: q.limit + 1,
    before: q.before ? new Date(q.before).toISOString() : null,
    strength: q.strength ?? null,
    source: q.source ?? null,
    discordUserId: q.discordUserId ?? null,
  });
  if (error) {
    ctx.logger.error('[admin/blacklist/alerts] list error', error);
    throw new AdminError(
      500,
      'internal',
      'Failed to load the blacklist alerts.'
    );
  }

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const nextCursor =
    hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

  const alerts = page.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    discordUserId: r.discord_user_id,
    battleTag: r.battle_tag,
    displayName: r.display_name,
    matchedOn: r.matched_on,
    strength: r.strength,
    source: r.source,
    context: r.context,
    reason: r.reason,
    blacklistEntryId: r.blacklist_entry_id,
  }));
  return { alerts, nextCursor };
}

/* ---------------------------------------------------------------------------
 * Tickets support — MULTI-TENANT : scopés par l'espace actif du staff (un
 * signalement est nominatif et souvent sensible).
 * ------------------------------------------------------------------------ */

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export async function listSupportTickets(
  ctx: ServiceContext,
  query: Record<string, unknown>
) {
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const offset = Math.max(0, Number(query.offset) || 0);

  // Recherche libre : sujet OU message OU nom du déclarant. Les caractères
  // sensibles pour PostgREST sont retirés (la structure du .or() ne peut pas
  // être altérée) ; les %…% gardent une recherche de sous-chaîne.
  const rawSearch = query.search;
  const search =
    typeof rawSearch === 'string'
      ? rawSearch.trim().slice(0, TICKET_SEARCH_MAX_LENGTH)
      : '';
  const safe = search ? escapePostgrestValue(search) : '';

  const { page, open, high, resolved } = await repo.listSupportTickets(
    ctx.db,
    ctx.tenantId,
    {
      status: oneOf(query.status, TICKET_STATUSES),
      severity: oneOf(query.severity, TICKET_SEVERITIES),
      category: oneOf(query.category, TICKET_CATEGORIES),
      tournamentId:
        typeof query.tournament_id === 'string' && query.tournament_id
          ? query.tournament_id
          : null,
      searchPattern: safe ? `%${safe}%` : null,
      oldestFirst: query.sort === 'oldest',
      limit,
      offset,
    }
  );

  const firstError = page.error || open.error || high.error || resolved.error;
  if (firstError) {
    ctx.logger.error('[admin/support/tickets] list error:', firstError);
    throw new AdminError(500, 'internal', 'Échec du chargement');
  }

  return {
    tickets: page.data || [],
    total: page.count ?? null,
    limit,
    offset,
    counts: {
      total: page.count ?? 0,
      open: open.count ?? 0,
      high_severity: high.count ?? 0,
      resolved: resolved.count ?? 0,
    },
  };
}

export async function getSupportTicket(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.getSupportTicket(ctx.db, ctx.tenantId, id);
  if (error || !row) throw new NotFoundError('Ticket introuvable');
  return { ticket: row };
}

export async function updateSupportTicket(
  ctx: ServiceContext,
  id: string,
  body: Record<string, unknown>
) {
  const { status, resolution_note } = body;
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (status !== undefined) {
    if (
      typeof status !== 'string' ||
      !(TICKET_STATUSES as readonly string[]).includes(status)
    ) {
      throw new ValidationError(
        `Statut invalide. Valeurs : ${TICKET_STATUSES.join(', ')}`
      );
    }
    update.status = status;
    if (status === 'resolved' || status === 'closed') {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = ctx.actor.kind === 'staff' ? ctx.actor.userId : null;
    }
  }

  if (resolution_note !== undefined) {
    if (resolution_note !== null && typeof resolution_note !== 'string') {
      throw new ValidationError('resolution_note invalide');
    }
    update.resolution_note = resolution_note
      ? String(resolution_note).slice(0, 2000)
      : null;
  }

  if (Object.keys(update).length === 1) {
    throw new ValidationError('Rien à mettre à jour');
  }

  const { row, error } = await repo.updateSupportTicket(
    ctx.db,
    ctx.tenantId,
    id,
    update as TablesUpdate<'support_tickets'>
  );
  if (error || !row) {
    ctx.logger.error('[admin/support/tickets/id] update error:', error);
    throw new AdminError(500, 'internal', 'Échec de la mise à jour');
  }

  return {
    result: { ticket: row },
    audit: {
      entity_type: 'support_ticket',
      entity_id: id,
      tournament_id: row.tournament_id ?? null,
      payload: {
        new_status: update.status ?? null,
        has_note: !!update.resolution_note,
      },
    },
  } satisfies Audited<unknown>;
}

export async function deleteSupportTicket(ctx: ServiceContext, id: string) {
  const { error } = await repo.deleteSupportTicket(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/support/tickets/id] delete error:', error);
    throw new AdminError(500, 'internal', 'Échec de la suppression');
  }
  return {
    result: { success: true as const },
    audit: {
      entity_type: 'support_ticket',
      entity_id: id,
      tournament_id: null,
      payload: { deleted: true },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Conversion d'un ticket en entrée de blacklist (joueur ou entité)
 * ------------------------------------------------------------------------ */

type ConvertResult = {
  kind: 'player' | 'entity';
  entry: Record<string, unknown> & { id: string };
  ticket_id: string;
};

export async function convertTicketToBlacklist(
  ctx: ServiceContext,
  ticketId: string,
  rawBody: unknown
): Promise<Audited<ConvertResult>> {
  // Discrimination manuelle sur `kind` (400 propre si absent/inconnu), puis
  // parse zod du schéma correspondant.
  const raw = (rawBody ?? {}) as Record<string, unknown>;
  const rawKind = raw.kind;
  if (rawKind !== 'player' && rawKind !== 'entity') {
    throw new ValidationError("Champ 'kind' requis ('player' ou 'entity').");
  }
  const parsed =
    rawKind === 'player'
      ? parseWithLegacyFields(ConvertPlayerBody, rawBody ?? {})
      : parseWithLegacyFields(ConvertEntityBody, rawBody ?? {});

  const { row: ticket, error: ticketError } =
    await repo.getTicketConversionState(ctx.db, ctx.tenantId, ticketId);
  if (ticketError) {
    ctx.logger.error(
      '[admin/support/convert-blacklist] ticket load error',
      ticketError
    );
    throw new AdminError(500, 'internal', 'Failed to load the ticket.');
  }
  if (!ticket) throw new NotFoundError('Ticket introuvable.');

  // Déjà converti pour ce kind → 409 (conflit d'état métier).
  if (rawKind === 'player' && ticket.converted_player_blacklist_id) {
    throw new AdminError(
      409,
      'conflict',
      'Ce ticket a déjà été converti en entrée blacklist joueur.'
    );
  }
  if (rawKind === 'entity' && ticket.converted_entity_blacklist_id) {
    throw new AdminError(
      409,
      'conflict',
      'Ce ticket a déjà été converti en entrée blacklist entité.'
    );
  }

  // L'entrée est écrite dans l'espace COURANT du staff.
  let entry: ConvertResult['entry'];
  let convertedColumn:
    | 'converted_player_blacklist_id'
    | 'converted_entity_blacklist_id';
  let logIdentifiers: Record<string, unknown>;

  if (parsed.kind === 'player') {
    const insertPayload = {
      tenant_id: ctx.tenantId,
      battle_tag: normalizeBattleTag(parsed.battle_tag),
      display_name: nullableText(parsed.display_name),
      discord_user_id: nullableText(parsed.discord_user_id),
      reason: nullableText(parsed.reason),
      notes: nullableText(parsed.notes),
      banned_by: authUserId(ctx),
      active: true,
    };
    const { row, error } = await repo.insertPlayerBlacklist(
      ctx.db,
      insertPayload
    );
    if (error || !row) {
      ctx.logger.error(
        '[admin/support/convert-blacklist] player insert error',
        error
      );
      throw new AdminError(
        500,
        'internal',
        'Failed to create the blacklist entry.'
      );
    }
    entry = row;
    convertedColumn = 'converted_player_blacklist_id';
    logIdentifiers = {
      battle_tag: insertPayload.battle_tag,
      display_name: insertPayload.display_name,
      discord_user_id: insertPayload.discord_user_id,
    };
  } else {
    const insertPayload = {
      tenant_id: ctx.tenantId,
      entity_type: parsed.entity_type,
      name: parsed.name,
      reason: nullableText(parsed.reason),
      notes: nullableText(parsed.notes),
      banned_by: authUserId(ctx),
      active: true,
    };
    const { row, error } = await repo.insertEntityBlacklist(
      ctx.db,
      insertPayload
    );
    if (error || !row) {
      ctx.logger.error(
        '[admin/support/convert-blacklist] entity insert error',
        error
      );
      throw new AdminError(
        500,
        'internal',
        'Failed to create the entity blacklist entry.'
      );
    }
    entry = row;
    convertedColumn = 'converted_entity_blacklist_id';
    logIdentifiers = {
      entity_type: insertPayload.entity_type,
      name: insertPayload.name,
    };
  }

  // Trace la conversion sur le ticket. Best-effort : l'entrée de blacklist
  // EXISTE déjà (c'est elle qui compte) — l'échec est loggé, la réponse reste
  // un 201, le lien pourra être reposé à la main.
  const { error: updateError } = await repo.linkTicketConversion(
    ctx.db,
    ctx.tenantId,
    ticketId,
    convertedColumn,
    entry.id
  );
  if (updateError) {
    ctx.logger.error(
      '[admin/support/convert-blacklist] ticket link update error (entry created anyway)',
      updateError
    );
  }

  return {
    result: { kind: parsed.kind, entry, ticket_id: ticketId },
    audit: {
      entity_type: 'support_ticket',
      entity_id: ticketId,
      payload: {
        kind: parsed.kind,
        blacklist_entry_id: entry.id,
        ...logIdentifiers,
      },
    },
  };
}
