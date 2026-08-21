// pages/api/admin/logs.ts
// Admin: lecture des staff_logs globaux (journal d'audit).
//
// - GET : liste paginée/filtrée des logs staff, formatés via formatStaffLog()
// - GET ?format=csv : export CSV (non paginé, capé) des logs filtrés
//
// Query params :
//   - staffId?: string                  → filtre sur un staff précis
//   - tournamentId?: string             → filtre sur un tournoi (colonne tournament_id)
//   - entityType?: string               → filtre sur le type d'entité ("match", "tournament", "stage", "team", "demande", etc.)
//   - matchId?: string (uuid)           → remappé sur entity_type='match'  + entity_id
//   - stageId?: string (uuid)           → remappé sur entity_type='stage'  + entity_id
//   - teamId?: string (uuid)            → remappé sur entity_type='team'   + entity_id
//   - userId?: string (uuid)            → remappé sur entity_type='user'   + entity_id
//     (journal d'un compte : rôle, suspension, suppression, relance d'accès…)
//     (la table staff_logs n'a PAS de colonnes match_id/stage_id/team_id : ces
//      filtres UI historiques sont re-mappés sur entity_type + entity_id.)
//   - action?: string                   → filtre sur l'action ("update_match", "create_tournament", ...)
//   - from?: ISO date                   → created_at >= from
//   - to?: ISO date                     → created_at <= to
//   - search?: string                   → ilike sur action + entity_type, et full-text (plfts) sur payload
//   - limit?: number (default 100)
//   - offset?: number (default 0)
//   - orderDir?: "asc" | "desc" (default "desc")
//   - includeTotal?: "1" | "true"       → inclut le count total (exact)
//   - format?: "csv" | export=csv       → réponse CSV téléchargeable (ignore la pagination)
//
// Réponse JSON :
// {
//   logs: Array<ReturnType<typeof formatStaffLog> & { staff_display_name: string | null }>,
//   total: number | null
// }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import {
  StaffLog,
  formatStaffLog,
  STAFF_LOG_ACTION_LABELS,
} from '@/utils/staffLogs';
import type { StaffLogAction } from '@/types/staffLogs';
import { logger } from '../../../utils/logger';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';

export type AdminLogsResponse = {
  logs: Array<ReturnType<typeof formatStaffLog>>;
  total: number | null;
};

// Cap dur pour l'export CSV (protège la mémoire / le temps de réponse).
const CSV_MAX_ROWS = 5000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

// Rôle minimum : admin (vision globale du journal d'audit)
export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminLogsResponse | { error: string; detail?: string }>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      staffId,
      tournamentId,
      entityType,
      matchId,
      stageId,
      teamId,
      userId,
      action,
      from,
      to,
      orderDir,
      includeTotal,
      format,
      export: exportParam,
    } = req.query;

    const wantCsv =
      firstParam(format) === 'csv' || firstParam(exportParam) === 'csv';

    const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
      limit: 100,
    });
    const search = sanitizeSearch(req.query.search);

    const ascending = orderDir === 'asc' ? true : false;

    const wantTotal =
      !wantCsv && (includeTotal === '1' || includeTotal === 'true');

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin not configured' });
    }

    // Pas de relation FK exploitable côté PostgREST → select simple (résolution
    // des noms staff en une requête séparée plus bas).
    let query = supabaseAdmin
      .from('staff_logs')
      .select(
        'id, created_at, staff_id, action, entity_type, entity_id, payload, tournament_id, tenant_id',
        {
          count: wantTotal ? 'exact' : undefined,
        }
      )
      .eq('tenant_id', ctx.tenantId);

    if (staffId && !Array.isArray(staffId)) {
      query = query.eq('staff_id', staffId);
    }

    if (tournamentId && !Array.isArray(tournamentId)) {
      query = query.eq('tournament_id', tournamentId);
    }

    // Filtres UI historiques stage/match/team : la table n'a pas de colonnes
    // dédiées, on les re-mappe sur entity_type + entity_id (entity_id est un
    // uuid → on ne l'applique que si la valeur est un uuid valide, sinon on
    // ignore silencieusement pour éviter un 500 PostgREST).
    const entityRemap: Array<[string, string | undefined]> = [
      ['match', firstParam(matchId)],
      ['stage', firstParam(stageId)],
      ['team', firstParam(teamId)],
      // `user` alimente le panneau « journal du compte » de /admin/users/manage.
      ['user', firstParam(userId)],
    ];
    const remapped = entityRemap.find(([, id]) => id && UUID_RE.test(id));
    if (remapped) {
      query = query.eq('entity_type', remapped[0]).eq('entity_id', remapped[1]);
    } else if (entityType && !Array.isArray(entityType)) {
      // Filtre entity_type explicite (uniquement si pas déjà contraint par le remap).
      query = query.eq('entity_type', entityType);
    }

    if (action && !Array.isArray(action)) {
      query = query.eq('action', action);
    }

    if (from && !Array.isArray(from)) {
      query = query.gte('created_at', from);
    }

    if (to && !Array.isArray(to)) {
      query = query.lte('created_at', to);
    }

    if (search) {
      // Recherche unifiée : ilike sur les colonnes texte (action, entity_type)
      // + full-text plainto (plfts) sur le payload jsonb. entity_id est un uuid
      // → non inclus (ilike invalide sur uuid).
      const safe = escapePostgrestValue(search);
      const s = `%${safe}%`;
      // Le payload passe par plainto_tsquery : on neutralise les délimiteurs de
      // la chaîne .or() (virgules / parenthèses) qui casseraient le parsing.
      const ftsTerm = search.replace(/[(),]/g, ' ').trim();
      const orParts = [`action.ilike.${s}`, `entity_type.ilike.${s}`];
      if (ftsTerm) orParts.push(`payload.plfts.${ftsTerm}`);
      query = query.or(orParts.join(','));
    }

    query = query.order('created_at', { ascending });

    // L'export CSV ignore la pagination (cap dur), la vue paginée applique range().
    if (wantCsv) {
      query = query.range(0, CSV_MAX_ROWS - 1);
    } else {
      query = query.range(offsetNum, offsetNum + limitNum - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('admin logs GET error:', error);
      return res.status(500).json({
        error: 'Failed to fetch staff logs',
      });
    }

    const rawLogs = ((data as unknown) || []) as StaffLog[];

    if (wantCsv && rawLogs.length >= CSV_MAX_ROWS) {
      logger.warn(
        `[/api/admin/logs] CSV export tronqué à ${CSV_MAX_ROWS} lignes (tenant ${ctx.tenantId})`
      );
    }

    // Résolution de l'acteur : staff_id -> display_name (fallback email).
    const staffIds = Array.from(
      new Set(rawLogs.map((l) => l.staff_id).filter((id): id is string => !!id))
    );
    const staffNameById = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staffRows, error: staffErr } = await supabaseAdmin
        .from('staff')
        .select('id, display_name, email')
        .in('id', staffIds);
      if (staffErr) {
        logger.error('admin logs staff lookup error:', staffErr);
      }
      for (const s of (staffRows ?? []) as {
        id: string;
        display_name: string | null;
        email: string | null;
      }[]) {
        const name = s.display_name?.trim() || s.email?.trim() || null;
        if (name) staffNameById.set(s.id, name);
      }
    }

    if (wantCsv) {
      const csv = buildCsv(rawLogs, staffNameById);
      const filename = `staff-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      // BOM UTF-8 pour Excel.
      res.status(200).end('﻿' + csv);
      return;
    }

    const formatted = rawLogs.map((log) => ({
      ...formatStaffLog(log),
      staff_display_name: log.staff_id
        ? (staffNameById.get(log.staff_id) ?? null)
        : null,
    }));

    return res.status(200).json({
      logs: formatted,
      total: typeof count === 'number' ? count : null,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/logs] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
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

function buildCsv(
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
