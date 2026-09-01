// pages/api/admin/discord-logs.ts
//
// Admin : journal des actions du bot Discord (onglet « Discord » de /admin/logs).
//
// Deux sources, sélectionnées par `?source=` :
//   - source=player (défaut) : `bot_player_actions` — actions joueuses passées
//     PAR le bot (slash commands / boutons Discord).
//   - source=event           : `bot_event_outbox` — événements poussés par le
//     site VERS le bot (annonces, salons, rôles) + état de livraison.
//
// Les deux sont normalisées en `DiscordLogRow` : l'UI n'a qu'un rendu à tenir.
//
// Query params :
//   - source?: "player" | "event"        → source du journal (défaut "player")
//   - action?: string                    → action (player) ou event_name (event)
//   - entityType?: string                → source player uniquement
//   - actorDiscordUserId?: string        → source player uniquement
//   - targetDiscordUserId?: string       → source player uniquement
//   - status?: "pending"|"delivered"|"failed" → source event uniquement
//   - from?/to?: ISO date                → created_at >= / <=
//   - search?: string                    → ilike colonnes texte + plfts payload
//   - limit?/offset?: number             → pagination (défaut 100)
//   - includeTotal?: "1" | "true"        → count exact
//   - format=csv | export=csv            → export CSV (non paginé, capé)
//
// Réponse JSON : { logs: DiscordLogRow[], total: number | null }
//
// Rôle minimum : admin (le journal expose des identifiants Discord de joueuses).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';
import {
  isDiscordLogSource,
  playerActionLabel,
  OUTBOX_STATUSES,
  type DiscordLogRow,
  type DiscordLogSource,
  type OutboxStatus,
} from '@/utils/discordLogs';
import { logger } from '@/utils/logger';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';

export type AdminDiscordLogsResponse = {
  logs: DiscordLogRow[];
  total: number | null;
};

// Cap dur de l'export CSV (mémoire / temps de réponse), aligné sur /api/admin/logs.
const CSV_MAX_ROWS = 5000;

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

function firstParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

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

export default withStaffRoute(handler, { permission: 'manage_settings' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminDiscordLogsResponse | { error: string }>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const rawSource = firstParam(req.query.source);
  const source: DiscordLogSource = isDiscordLogSource(rawSource)
    ? rawSource
    : 'player';

  const action = firstParam(req.query.action);
  const entityType = firstParam(req.query.entityType);
  const actorDiscordUserId = firstParam(req.query.actorDiscordUserId);
  const targetDiscordUserId = firstParam(req.query.targetDiscordUserId);
  const status = firstParam(req.query.status);
  const from = firstParam(req.query.from);
  const to = firstParam(req.query.to);
  const includeTotal = firstParam(req.query.includeTotal);

  const wantCsv =
    firstParam(req.query.format) === 'csv' ||
    firstParam(req.query.export) === 'csv';
  const wantTotal =
    !wantCsv && (includeTotal === '1' || includeTotal === 'true');

  const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
    limit: 100,
  });
  const search = sanitizeSearch(req.query.search);

  // Les IDs Discord sont des snowflakes : une valeur non conforme ne peut rien
  // matcher, on préfère le 400 explicite au « 0 résultat » inexplicable.
  if (actorDiscordUserId && !DISCORD_ID_RE.test(actorDiscordUserId)) {
    return res.status(400).json({ error: 'actorDiscordUserId invalide' });
  }
  if (targetDiscordUserId && !DISCORD_ID_RE.test(targetDiscordUserId)) {
    return res.status(400).json({ error: 'targetDiscordUserId invalide' });
  }
  if (status && !(OUTBOX_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({ error: 'status invalide' });
  }

  try {
    const table =
      source === 'event' ? 'bot_event_outbox' : 'bot_player_actions';
    const columns =
      source === 'event'
        ? 'id, created_at, event_id, event_name, status, push_attempts, last_push_error, delivered_at, payload'
        : `id, created_at, action, entity_type, entity_id, actor_auth_user_id,
           actor_discord_user_id, target_auth_user_id, target_discord_user_id, payload`;

    let query = supabaseAdmin
      .from(table)
      .select(columns, { count: wantTotal ? 'exact' : undefined })
      .eq('tenant_id', ctx.tenantId);

    if (action) {
      query = query.eq(source === 'event' ? 'event_name' : 'action', action);
    }
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    if (source === 'event') {
      if (status) query = query.eq('status', status);
    } else {
      if (entityType) query = query.eq('entity_type', entityType);
      if (actorDiscordUserId) {
        query = query.eq('actor_discord_user_id', actorDiscordUserId);
      }
      if (targetDiscordUserId) {
        query = query.eq('target_discord_user_id', targetDiscordUserId);
      }
    }

    if (search) {
      // ilike sur les colonnes texte + full-text plainto sur le payload jsonb.
      // Les uuid (entity_id, *_auth_user_id) sont exclus : ilike y est invalide.
      const s = `%${escapePostgrestValue(search)}%`;
      // plainto_tsquery : on neutralise les délimiteurs du parser .or().
      const ftsTerm = search.replace(/[(),]/g, ' ').trim();
      const orParts =
        source === 'event'
          ? [
              `event_name.ilike.${s}`,
              `event_id.ilike.${s}`,
              `status.ilike.${s}`,
            ]
          : [
              `action.ilike.${s}`,
              `entity_type.ilike.${s}`,
              `actor_discord_user_id.ilike.${s}`,
              `target_discord_user_id.ilike.${s}`,
            ];
      if (ftsTerm) orParts.push(`payload.plfts.${ftsTerm}`);
      query = query.or(orParts.join(','));
    }

    query = query.order('created_at', { ascending: false });
    query = wantCsv
      ? query.range(0, CSV_MAX_ROWS - 1)
      : query.range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;
    if (error) {
      logger.error('[/api/admin/discord-logs] query error:', error);
      return res.status(500).json({ error: 'Failed to fetch Discord logs' });
    }

    const rows = (data ?? []) as unknown[];

    if (wantCsv && rows.length >= CSV_MAX_ROWS) {
      logger.warn(
        `[/api/admin/discord-logs] CSV export tronqué à ${CSV_MAX_ROWS} lignes (tenant ${ctx.tenantId})`
      );
    }

    const logs =
      source === 'event'
        ? (rows as OutboxRow[]).map(mapOutboxRow)
        : await mapPlayerRows(rows as PlayerActionRow[]);

    if (wantCsv) {
      const filename = `discord-logs-${source}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      // BOM UTF-8 pour Excel.
      res.status(200).end('﻿' + buildCsv(logs));
      return;
    }

    return res.status(200).json({
      logs,
      total: typeof count === 'number' ? count : null,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/discord-logs] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* -----------------------------------------------------------
 * Normalisation
 * ---------------------------------------------------------*/

function mapOutboxRow(row: OutboxRow): DiscordLogRow {
  return {
    id: `event:${row.id}`,
    source: 'event',
    created_at: row.created_at,
    action: row.event_name,
    action_label: row.event_name,
    // L'event outbox n'a pas d'entité typée : on expose l'event_id (clé
    // d'idempotence côté bot), utile pour recouper avec les logs du bot.
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

/**
 * Normalise les actions joueuses en résolvant les pseudos Discord en UNE
 * requête (acteurs + cibles confondus) — `bot_player_actions` ne stocke que
 * les IDs.
 */
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

/* -----------------------------------------------------------
 * CSV
 * ---------------------------------------------------------*/

function csvCell(value: unknown): string {
  const str =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  // Échappement RFC 4180 : guillemets doublés, cellule quotée si besoin.
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(logs: DiscordLogRow[]): string {
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
