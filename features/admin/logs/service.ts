// features/admin/logs/service.ts — journal staff, journal du bot Discord et
// historique d'une entité (tiroir « Qui a touché à ça ? »).
//
// Messages d'erreur et comportements historiques conservés : filtre non
// conforme ignoré (uuid de remap) ou 400 (snowflake Discord, statut),
// export CSV capé à 5 000 lignes.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import {
  STAFF_LOG_ACTION_LABELS,
  formatStaffLog,
  type StaffLog,
} from '@/utils/staffLogs';
import type { StaffLogAction } from '@/types/staffLogs';
import {
  escapePostgrestValue,
  isValidUUID,
  sanitizeSearch,
} from '@/utils/apiHelpers';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';
import {
  isDiscordLogSource,
  playerActionLabel,
  OUTBOX_STATUSES,
  type DiscordLogRow,
  type DiscordLogSource,
  type OutboxStatus,
} from '@/utils/discordLogs';
import { canAccessTenant } from '@/utils/adminTenants';
import { hasAtLeastRole } from '@/utils/staff';
import type { AuthenticatedStaffContext } from '@/types/staff';
import { CSV_MAX_ROWS, csvCell } from './csv';
import { HISTORY_ENTITY_TYPES } from './schemas';
import * as repo from './repository';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISCORD_ID_RE = /^[0-9]{15,25}$/;

/** `?a=1&a=2` → `'1'`. */
function first(v: unknown): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' ? x : undefined;
}
/** Valeur retenue seulement si ce n'est PAS un tableau (règle historique). */
function single(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

export type Pagination = { limit: number; offset: number };

export type CsvFile = { filename: string; content: string };

function wantsCsv(q: Record<string, unknown>) {
  return first(q.format) === 'csv' || first(q.export) === 'csv';
}

/** Recherche : ilike sur les colonnes texte + full-text plainto sur le payload. */
function searchClause(raw: unknown, columns: string[]): string | undefined {
  const search = sanitizeSearch(raw as string | string[] | undefined);
  if (!search) return undefined;
  const s = `%${escapePostgrestValue(search)}%`;
  // plainto_tsquery : on neutralise les délimiteurs du parser `.or()`.
  const ftsTerm = search.replace(/[(),]/g, ' ').trim();
  const parts = columns.map((c) => `${c}.ilike.${s}`);
  if (ftsTerm) parts.push(`payload.plfts.${ftsTerm}`);
  return parts.join(',');
}

const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------ Journal staff ------------------------------ */

export type StaffLogsResult =
  | {
      kind: 'json';
      body: {
        logs: Array<
          ReturnType<typeof formatStaffLog> & {
            staff_display_name: string | null;
          }
        >;
        total: number | null;
      };
    }
  | { kind: 'csv'; file: CsvFile };

export async function readStaffLogs(
  ctx: ServiceContext,
  q: Record<string, unknown>,
  page: Pagination
): Promise<StaffLogsResult> {
  const csv = wantsCsv(q);
  const includeTotal = q.includeTotal;
  const withTotal = !csv && (includeTotal === '1' || includeTotal === 'true');

  // Filtres UI historiques stage/match/team/user : pas de colonnes dédiées,
  // remappés sur entity_type + entity_id — seulement si l'id est un uuid
  // (sinon ignoré, pour éviter un 500 PostgREST).
  const remap: Array<[string, string | undefined]> = [
    ['match', first(q.matchId)],
    ['stage', first(q.stageId)],
    ['team', first(q.teamId)],
    ['user', first(q.userId)],
  ];
  const hit = remap.find(([, id]) => id && UUID_RE.test(id));

  const { rows, error, count } = await repo.queryStaffLogs(
    ctx.db,
    ctx.tenantId,
    {
      staffId: single(q.staffId),
      tournamentId: single(q.tournamentId),
      entity: hit ? [hit[0], hit[1] as string] : undefined,
      entityType: single(q.entityType),
      action: single(q.action),
      from: single(q.from),
      to: single(q.to),
      or: searchClause(q.search, ['action', 'entity_type']),
      ascending: q.orderDir === 'asc',
      range: csv
        ? [0, CSV_MAX_ROWS - 1]
        : [page.offset, page.offset + page.limit - 1],
      withTotal,
    }
  );
  if (error) {
    ctx.logger.error('admin logs GET error:', error);
    throw new LegacyAdminError(500, 'Failed to fetch staff logs');
  }

  const rawLogs = rows as StaffLog[];
  if (csv && rawLogs.length >= CSV_MAX_ROWS) {
    ctx.logger.warn(
      `[/api/admin/logs] CSV export tronqué à ${CSV_MAX_ROWS} lignes (tenant ${ctx.tenantId})`
    );
  }

  // Acteur : staff_id → display_name (repli email).
  const staffIds = Array.from(
    new Set(rawLogs.map((l) => l.staff_id).filter((id): id is string => !!id))
  );
  const staffNameById = new Map<string, string>();
  if (staffIds.length > 0) {
    const { rows: staffRows, error: staffErr } = await repo.listStaffNames(
      ctx.db,
      staffIds
    );
    if (staffErr) ctx.logger.error('admin logs staff lookup error:', staffErr);
    for (const s of staffRows) {
      const name = s.display_name?.trim() || s.email?.trim() || null;
      if (name) staffNameById.set(s.id, name);
    }
  }

  if (csv) {
    return {
      kind: 'csv',
      file: {
        filename: `staff-logs-${today()}.csv`,
        content: buildStaffLogsCsv(rawLogs, staffNameById),
      },
    };
  }

  return {
    kind: 'json',
    body: {
      logs: rawLogs.map((log) => ({
        ...formatStaffLog(log),
        staff_display_name: log.staff_id
          ? (staffNameById.get(log.staff_id) ?? null)
          : null,
      })),
      total: typeof count === 'number' ? count : null,
    },
  };
}

function buildStaffLogsCsv(
  logs: StaffLog[],
  staffNameById: Map<string, string>
): string {
  const header = [
    'date',
    'action',
    'action_label',
    'staff',
    'entity_type',
    'entity_id',
    'tournament_id',
    'payload',
  ];
  const lines = [header.join(',')];
  for (const log of logs) {
    const label =
      STAFF_LOG_ACTION_LABELS[log.action as StaffLogAction] ?? log.action;
    const staffName = log.staff_id
      ? (staffNameById.get(log.staff_id) ?? '')
      : '';
    const payload = log.payload ? JSON.stringify(log.payload) : '';
    lines.push(
      [
        csvCell(new Date(log.created_at).toISOString()),
        csvCell(log.action),
        csvCell(label),
        csvCell(staffName),
        csvCell(log.entity_type),
        csvCell(log.entity_id),
        csvCell(log.tournament_id),
        csvCell(payload),
      ].join(',')
    );
  }
  return lines.join('\r\n');
}

/* --------------------------- Journal du bot Discord ------------------------ */

type PlayerActionRow = {
  id: number;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_auth_user_id: string | null;
  actor_discord_user_id: string | null;
  target_auth_user_id: string | null;
  target_discord_user_id: string | null;
  payload: unknown;
};

type OutboxRow = {
  id: number;
  created_at: string;
  event_id: string;
  event_name: string;
  status: string;
  push_attempts: number | null;
  last_push_error: string | null;
  delivered_at: string | null;
  payload: unknown;
};

export type DiscordLogsResult =
  | { kind: 'json'; body: { logs: DiscordLogRow[]; total: number | null } }
  | { kind: 'csv'; file: CsvFile };

export async function readDiscordLogs(
  ctx: ServiceContext,
  q: Record<string, unknown>,
  page: Pagination
): Promise<DiscordLogsResult> {
  const rawSource = first(q.source);
  const source: DiscordLogSource = isDiscordLogSource(rawSource)
    ? rawSource
    : 'player';
  const actorDiscordUserId = first(q.actorDiscordUserId);
  const targetDiscordUserId = first(q.targetDiscordUserId);
  const status = first(q.status);
  const includeTotal = first(q.includeTotal);
  const csv = wantsCsv(q);
  const withTotal = !csv && (includeTotal === '1' || includeTotal === 'true');

  // Snowflakes : une valeur non conforme ne peut rien matcher, le 400
  // explicite vaut mieux qu'un « 0 résultat » inexplicable.
  if (actorDiscordUserId && !DISCORD_ID_RE.test(actorDiscordUserId)) {
    throw new LegacyAdminError(400, 'actorDiscordUserId invalide');
  }
  if (targetDiscordUserId && !DISCORD_ID_RE.test(targetDiscordUserId)) {
    throw new LegacyAdminError(400, 'targetDiscordUserId invalide');
  }
  if (status && !(OUTBOX_STATUSES as readonly string[]).includes(status)) {
    throw new LegacyAdminError(400, 'status invalide');
  }

  const { rows, error, count } = await repo.queryDiscordLogs(
    ctx.db,
    ctx.tenantId,
    {
      source,
      action: first(q.action),
      entityType: first(q.entityType),
      actorDiscordUserId,
      targetDiscordUserId,
      status,
      from: first(q.from),
      to: first(q.to),
      or: searchClause(
        q.search,
        source === 'event'
          ? ['event_name', 'event_id', 'status']
          : [
              'action',
              'entity_type',
              'actor_discord_user_id',
              'target_discord_user_id',
            ]
      ),
      range: csv
        ? [0, CSV_MAX_ROWS - 1]
        : [page.offset, page.offset + page.limit - 1],
      withTotal,
    }
  );
  if (error) {
    ctx.logger.error('[/api/admin/discord-logs] query error:', error);
    throw new LegacyAdminError(500, 'Failed to fetch Discord logs');
  }

  if (csv && rows.length >= CSV_MAX_ROWS) {
    ctx.logger.warn(
      `[/api/admin/discord-logs] CSV export tronqué à ${CSV_MAX_ROWS} lignes (tenant ${ctx.tenantId})`
    );
  }

  const logs =
    source === 'event'
      ? (rows as OutboxRow[]).map(mapOutboxRow)
      : await mapPlayerRows(rows as PlayerActionRow[]);

  if (csv) {
    return {
      kind: 'csv',
      file: {
        filename: `discord-logs-${source}-${today()}.csv`,
        content: buildDiscordLogsCsv(logs),
      },
    };
  }
  return {
    kind: 'json',
    body: { logs, total: typeof count === 'number' ? count : null },
  };
}

function mapOutboxRow(row: OutboxRow): DiscordLogRow {
  return {
    id: `event:${row.id}`,
    source: 'event',
    created_at: row.created_at,
    action: row.event_name,
    action_label: row.event_name,
    // Pas d'entité typée dans l'outbox : l'event_id (clé d'idempotence côté
    // bot) permet de recouper avec les logs du bot.
    entity_type: 'event_id',
    entity_id: row.event_id,
    actor: null,
    target: null,
    status: (row.status as OutboxStatus) ?? null,
    push_attempts: row.push_attempts ?? null,
    last_push_error: row.last_push_error ?? null,
    delivered_at: row.delivered_at ?? null,
    payload: row.payload ?? null,
  };
}

/** Pseudos Discord résolus en UNE requête (acteurs + cibles confondus). */
async function mapPlayerRows(
  rows: PlayerActionRow[]
): Promise<DiscordLogRow[]> {
  const authUserIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.actor_auth_user_id, r.target_auth_user_id])
        .filter((id): id is string => !!id)
    )
  );
  const links = await getDiscordLinksForUsers(authUserIds);
  const username = (authUserId: string | null): string | null =>
    authUserId ? (links.get(authUserId)?.discordUsername ?? null) : null;

  return rows.map((row) => ({
    id: `player:${row.id}`,
    source: 'player' as const,
    created_at: row.created_at,
    action: row.action,
    action_label: playerActionLabel(row.action),
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    actor: {
      authUserId: row.actor_auth_user_id,
      discordUserId: row.actor_discord_user_id,
      discordUsername: username(row.actor_auth_user_id),
    },
    target:
      row.target_auth_user_id || row.target_discord_user_id
        ? {
            authUserId: row.target_auth_user_id,
            discordUserId: row.target_discord_user_id,
            discordUsername: username(row.target_auth_user_id),
          }
        : null,
    status: null,
    push_attempts: null,
    last_push_error: null,
    delivered_at: null,
    payload: row.payload ?? null,
  }));
}

function buildDiscordLogsCsv(logs: DiscordLogRow[]): string {
  const header = [
    'date',
    'source',
    'action',
    'action_label',
    'actor_discord_id',
    'actor_discord_username',
    'target_discord_id',
    'entity_type',
    'entity_id',
    'status',
    'push_attempts',
    'last_push_error',
    'payload',
  ];
  const lines = [header.join(',')];
  for (const log of logs) {
    lines.push(
      [
        csvCell(new Date(log.created_at).toISOString()),
        csvCell(log.source),
        csvCell(log.action),
        csvCell(log.action_label),
        csvCell(log.actor?.discordUserId ?? null),
        csvCell(log.actor?.discordUsername ?? null),
        csvCell(log.target?.discordUserId ?? null),
        csvCell(log.entity_type),
        csvCell(log.entity_id),
        csvCell(log.status),
        csvCell(log.push_attempts),
        csvCell(log.last_push_error),
        csvCell(log.payload ? JSON.stringify(log.payload) : ''),
      ].join(',')
    );
  }
  return lines.join('\r\n');
}

/* ---------------------- Rejeu d'un event outbox `failed` ------------------- */

/** `123`, `'123'` ou `'event:123'` (l'id que rend la liste) → 123. */
function outboxIdOf(raw: unknown): number {
  const s =
    typeof raw === 'number'
      ? String(raw)
      : typeof raw === 'string'
        ? raw.replace(/^event:/, '')
        : '';
  if (!/^[1-9]\d{0,15}$/.test(s)) {
    throw new LegacyAdminError(400, 'id invalide', { code: 'INVALID_ID' });
  }
  return Number(s);
}

/**
 * POST /api/admin/discord-logs/replay — remet en file un event `failed` de
 * `bot_event_outbox` (passé `failed` par le poison-pill du cron
 * outbox-maintenance quand le bot ne l'a pas acquitté à temps).
 *
 * Le bot le relira par son poller (`GET /api/bot/v1/events/pending` ne
 * filtre que sur `status = 'pending'`, sans fenêtre de temps). Deux
 * conditions pour qu'il le DISPATCHE au lieu de l'acquitter à vide :
 *   1. le claim distribué (`discord_event_ack`) est libéré — sinon
 *      `POST /events/handled` répond `wasNew=false` → ack sans dispatch ;
 *   2. `last_push_at = now` : le poison-pill compte désormais depuis le
 *      rejeu, pas depuis la création (sinon l'event redeviendrait `failed`
 *      au tick horaire suivant).
 * Le claim est libéré AVANT la remise en file : le poller ne voit jamais une
 * ligne `pending` dont le claim traîne encore.
 *
 * Idempotent : un event déjà `pending` répond 200 `replayed:false` sans
 * rien écrire ni journaliser ; `delivered` → 409 `ALREADY_DELIVERED`.
 */
export async function replayDiscordEvent(ctx: ServiceContext, body: unknown) {
  const id = outboxIdOf((body as { id?: unknown } | null)?.id);
  const { row, error } = await repo.getOutboxEvent(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[/api/admin/discord-logs/replay] read error:', error);
    throw new LegacyAdminError(500, 'Lecture impossible.');
  }
  if (!row) {
    throw new LegacyAdminError(404, 'Event introuvable.', {
      code: 'NOT_FOUND',
    });
  }
  if (row.status === 'delivered') {
    throw new LegacyAdminError(409, 'Event déjà livré.', {
      code: 'ALREADY_DELIVERED',
    });
  }
  const unchanged = {
    result: { id: row.id, status: 'pending' as const, replayed: false },
    audit: { skip: true },
  };
  if (row.status === 'pending') return unchanged;

  // discord_event_ack.event_id est un uuid : un event_id legacy non-uuid ne
  // peut pas y avoir de claim.
  if (isValidUUID(row.event_id)) {
    const { error: relErr } = await repo.releaseBotEventClaim(
      ctx.db,
      row.event_id
    );
    if (relErr) {
      ctx.logger.error(
        '[/api/admin/discord-logs/replay] claim release error:',
        relErr
      );
      throw new LegacyAdminError(500, 'Rejeu impossible.');
    }
  }

  const { row: requeued, error: upErr } = await repo.requeueFailedOutboxEvent(
    ctx.db,
    ctx.tenantId,
    id,
    new Date().toISOString()
  );
  if (upErr) {
    ctx.logger.error('[/api/admin/discord-logs/replay] requeue error:', upErr);
    throw new LegacyAdminError(500, 'Rejeu impossible.');
  }
  // Course perdue contre un autre rejeu : l'event est déjà en file.
  if (!requeued) return unchanged;

  return {
    result: { id: row.id, status: 'pending' as const, replayed: true },
    audit: {
      entity_type: 'bot_event',
      entity_id: row.event_id,
      payload: {
        action: 'replay_bot_event',
        outbox_id: row.id,
        event_name: row.event_name,
      },
    },
  };
}

/* ---------------------------- Historique d'entité -------------------------- */

const HISTORY_LIMIT = 50;

export async function readEntityHistory(
  ctx: ServiceContext,
  staff: AuthenticatedStaffContext,
  q: Record<string, unknown>
) {
  const type = String(q.type ?? '');
  const id = String(q.id ?? '');

  if (!(HISTORY_ENTITY_TYPES as readonly string[]).includes(type)) {
    throw new LegacyAdminError(400, 'Unknown entity type');
  }
  if (!id || !isValidUUID(id)) {
    throw new LegacyAdminError(400, 'Invalid entity id');
  }

  // Portée : l'espace ACTIF de l'appelant. Pour une entité `tenant`, c'est
  // l'espace REGARDÉ (accès vérifié) — le staff d'un espace voit les actions
  // de la plateforme SUR son espace.
  let scopeTenantId = ctx.tenantId;
  if (type === 'tenant') {
    if (!hasAtLeastRole(staff.role, 'admin')) {
      const isPoleAdmin =
        (staff.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
      if (!(await canAccessTenant(staff.staff.id, id, { isPoleAdmin }))) {
        throw new LegacyAdminError(403, 'No access to this tenant.');
      }
    }
    scopeTenantId = id;
  }

  const { rows, error } = await repo.listEntityHistory(
    ctx.db,
    scopeTenantId,
    type,
    id,
    HISTORY_LIMIT
  );
  if (error) {
    ctx.logger.error('[entity-history] read error', error);
    throw new LegacyAdminError(500, 'Lecture impossible.');
  }

  const logs = (rows as StaffLog[]).map((row) => formatStaffLog(row));
  return { entityType: type, entityId: id, logs };
}
