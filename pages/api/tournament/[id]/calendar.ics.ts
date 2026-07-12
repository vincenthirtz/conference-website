// pages/api/tournament/[id]/calendar.ics.ts
// Flux iCalendar PUBLIC (lecture seule) de l'agenda des matchs d'un tournoi.
// - Téléchargement direct (.ics) OU abonnement webcal:// (le client refetch et
//   voit les reprogrammations sans réimporter).
// - Même chemin de données que la vue publique des matchs (findTournamentByIdOrSlug
//   + supabaseAdmin), tournois publics uniquement, colonnes non-PII.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import {
  buildMatchesCalendar,
  type CalendarMatch,
} from '@/utils/tournamentCalendar';
import { logger } from '@/utils/logger';

type TournamentLite = {
  id: string;
  slug: string | null;
  name: string;
  visibility: string | null;
};

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://owwomenscup.fr'
).replace(/\/$/, '');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const tenantId = DEFAULT_TENANT_ID;

  try {
    const tournament = await findTournamentByIdOrSlug<TournamentLite>(
      id,
      'id, slug, name, visibility',
      tenantId
    );
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    if (tournament.visibility && tournament.visibility !== 'public') {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const { data, error } = await supabaseAdmin
      .from('matches')
      .select(
        `
        id,
        scheduled_at,
        status,
        is_bye,
        round_name,
        match_format,
        stage:tournament_stages ( name ),
        team1:team1_id ( name, short_name ),
        team2:team2_id ( name, short_name )
      `
      )
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id)
      .neq('status', 'cancelled')
      .not('scheduled_at', 'is', null)
      .order('scheduled_at', { ascending: true });

    if (error) {
      logger.error('calendar.ics matches error:', error);
      return res.status(500).json({ error: 'Failed to load matches' });
    }

    const rows = (data || []) as any[];
    const matches: CalendarMatch[] = rows.map((m) => ({
      id: m.id,
      scheduledAt: m.scheduled_at,
      team1Name: m.team1?.short_name || m.team1?.name || 'TBD',
      team2Name: m.team2?.short_name || m.team2?.name || 'TBD',
      stageName: m.stage?.name ?? null,
      roundName: m.round_name ?? null,
      matchFormat: m.match_format ?? null,
      status: m.status ?? null,
      isBye: m.is_bye ?? null,
      url: `${SITE_URL}/match/${m.id}`,
    }));

    const ics = buildMatchesCalendar(matches, {
      calendarName: `${tournament.name} — matchs`,
      domain: 'owwomenscup.fr',
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${tournament.slug || tournament.id}-matchs.ics"`
    );
    // CDN 5 min ; les abonnés webcal voient les reprogrammations sans réimport.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600'
    );
    return res.status(200).send(ics);
  } catch (err) {
    logger.error('[/api/tournament/[id]/calendar.ics] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
