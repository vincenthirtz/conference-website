// pages/api/admin/teams/import-platform.ts
// POST : import en masse d'équipes depuis Toornament / Challonge / start.gg.
//
// Body : { source: 'toornament' | 'challonge' | 'startgg', sourceRef: string, tournamentId?: string }
// Lit la clé API correspondante depuis site_settings.
//
// Retourne : { created, skipped, errors, teams } (même format que /import-csv)

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { supabaseAdmin } from '@/utils/supabase';
import {
  importTeams,
  type ImportResult,
  type ImportSourceLabel,
} from '@/utils/teamImport';
import { fetchToornamentParticipants } from '@/utils/tournamentImport/toornament';
import { fetchChallongeParticipants } from '@/utils/tournamentImport/challonge';
import { fetchStartGgParticipants } from '@/utils/tournamentImport/startgg';
import { logger } from '../../../../utils/logger';
import {
  PlatformImportError,
  type PlatformSource,
} from '@/utils/tournamentImport/types';

type ApiResponse = ImportResult | { error: string };

const SETTING_KEYS: Record<PlatformSource, string> = {
  toornament: 'toornament_api_key',
  challonge: 'challonge_api_key',
  startgg: 'startgg_api_key',
};

const SOURCE_LABELS: Record<PlatformSource, ImportSourceLabel> = {
  toornament: 'toornament_import',
  challonge: 'challonge_import',
  startgg: 'startgg_import',
};

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60_000 },
      'admin-teams-import-platform'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  const { source, sourceRef, tournamentId } = req.body || {};

  if (
    source !== 'toornament' &&
    source !== 'challonge' &&
    source !== 'startgg'
  ) {
    return res.status(400).json({
      error: 'Source invalide. Attendu : toornament | challonge | startgg.',
    });
  }

  if (!sourceRef || typeof sourceRef !== 'string' || !sourceRef.trim()) {
    return res
      .status(400)
      .json({ error: 'Le champ "sourceRef" (URL ou ID) est requis.' });
  }

  // Read API key from site_settings
  const settingKey = SETTING_KEYS[source as PlatformSource];
  const { data: setting } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', settingKey)
    .maybeSingle();

  const apiKey = setting?.value?.trim();
  if (!apiKey) {
    return res.status(400).json({
      error: `Clé API non configurée. Renseignez "${settingKey}" dans les paramètres.`,
    });
  }

  try {
    let rows;
    switch (source as PlatformSource) {
      case 'toornament':
        rows = await fetchToornamentParticipants(sourceRef, apiKey);
        break;
      case 'challonge':
        rows = await fetchChallongeParticipants(sourceRef, apiKey);
        break;
      case 'startgg':
        rows = await fetchStartGgParticipants(sourceRef, apiKey);
        break;
    }

    if (rows.length === 0) {
      return res.status(200).json({
        created: 0,
        skipped: 0,
        errors: [
          { row: 0, message: 'Aucune équipe renvoyée par la plateforme.' },
        ],
        teams: [],
      });
    }

    const result = await importTeams(rows, {
      tournamentId:
        typeof tournamentId === 'string' && tournamentId
          ? tournamentId
          : undefined,
      sourceLabel: SOURCE_LABELS[source as PlatformSource],
      staffId: ctx?.staff?.id ?? null,
    });

    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof PlatformImportError) {
      const httpStatus =
        err.status >= 400 && err.status < 600 ? err.status : 502;
      return res.status(httpStatus).json({ error: err.message });
    }
    logger.error('[admin/teams/import-platform] error:', err);
    return res
      .status(500)
      .json({ error: (err as Error)?.message || 'Erreur import plateforme' });
  }
}
