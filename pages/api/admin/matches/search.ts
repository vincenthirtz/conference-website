// pages/api/admin/matches/search.ts
// Admin: recherche fuzzy de matches scoped tenant.
//
// Usage: alimente l'autocomplete du <AddSegmentModal> de la page Director (et
// tout autre selecteur de match a venir cote admin). L'endpoint reste leger :
// shape minimaliste, pas d'embed games / disputes / dispositifs cast.
//
// Query params :
//   - q?       texte fuzzy. Cherche sur le nom des equipes (team1/team2),
//              sur le nom du tournoi et sur les champs textuels du match
//              (round_name, notes, lobby_code). Min 2 chars utiles ; en
//              dessous, on retourne juste les `limit` matches a venir sans
//              filtre texte.
//   - upcoming?  bool, default true. Filtre `scheduled_at >= now()` (ou
//                `scheduled_at IS NULL` pour ne pas perdre les matches non
//                planifies). Passe `?upcoming=0` pour avoir l'historique.
//   - limit?     int, default 20, max 50.
//
// Auth: withStaffRoute(manager) — meme niveau que /api/admin/matches/[matchId]
// et /api/admin/tournament/[id]/matches. Le manager doit pouvoir piloter
// l'event run-of-show.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import { logger } from '../../../../utils/logger';

export type AdminMatchSearchResult = {
  id: string;
  kickoffAt: string | null;
  tournamentName: string | null;
  teamAName: string | null;
  teamBName: string | null;
  status: string | null;
};

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const q = sanitizeSearch(req.query.q, 100);
  const upcomingRaw = req.query.upcoming;
  const upcoming =
    upcomingRaw === undefined || upcomingRaw === '1' || upcomingRaw === 'true';

  const rawLimit = Array.isArray(req.query.limit)
    ? req.query.limit[0]
    : req.query.limit;
  const parsedLimit = Number.parseInt(rawLimit ?? '20', 10);
  const limit = Math.max(
    1,
    Math.min(50, Number.isFinite(parsedLimit) ? parsedLimit : 20)
  );

  try {
    // Etape 1 : si on a une query texte, resoudre les team_ids et tournament_ids
    // matchants. matches.team1_id / team2_id / tournament_id sont indexes, donc
    // l'enrichissement IN(...) reste rapide. PostgREST ne supporte pas le
    // .or() sur des colonnes de tables embed.
    let matchingTeamIds: string[] | null = null;
    let matchingTournamentIds: string[] | null = null;

    if (q && q.length >= 2) {
      const safe = escapePostgrestValue(q);
      const pattern = `%${safe}%`;

      const [teamsRes, tournamentsRes] = await Promise.all([
        supabaseAdmin
          .from('teams')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .or(`name.ilike.${pattern},short_name.ilike.${pattern}`)
          .limit(50),
        supabaseAdmin
          .from('tournaments')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
          .limit(50),
      ]);

      if (teamsRes.error) {
        logger.error(
          '[admin/matches/search] teams lookup error',
          teamsRes.error
        );
      }
      if (tournamentsRes.error) {
        logger.error(
          '[admin/matches/search] tournaments lookup error',
          tournamentsRes.error
        );
      }

      matchingTeamIds = (teamsRes.data ?? [])
        .map((r) => (r as { id: string }).id)
        .filter(Boolean);
      matchingTournamentIds = (tournamentsRes.data ?? [])
        .map((r) => (r as { id: string }).id)
        .filter(Boolean);
    }

    // Etape 2 : construire la query principale sur `matches`. Toujours scoped
    // tenant. `winner_team_id IS NULL` n'est pas un proxy fiable pour
    // "upcoming" (cf. matches finished sans winner) — on filtre sur
    // scheduled_at, plus simple et plus lisible cote admin.
    let query = supabaseAdmin
      .from('matches')
      .select(
        `id, scheduled_at, status, round_name, lobby_code, notes,
         team1:team1_id (id, name, short_name),
         team2:team2_id (id, name, short_name),
         tournament:tournament_id (id, name)`
      )
      .eq('tenant_id', ctx.tenantId);

    if (upcoming) {
      // On accepte aussi les matches sans planning : ils sont a programmer,
      // donc pertinents pour un Director qui prepare son run.
      const nowIso = new Date().toISOString();
      query = query.or(`scheduled_at.gte.${nowIso},scheduled_at.is.null`);
    }

    if (q && q.length >= 2) {
      const safe = escapePostgrestValue(q);
      const pattern = `%${safe}%`;

      // Liste des clauses .or pour matcher : champs textuels du match OU
      // team_ids resolus a l'etape 1 OU tournament_ids resolus a l'etape 1.
      const clauses: string[] = [
        `round_name.ilike.${pattern}`,
        `lobby_code.ilike.${pattern}`,
        `notes.ilike.${pattern}`,
      ];

      if (matchingTeamIds && matchingTeamIds.length > 0) {
        const list = matchingTeamIds.join(',');
        clauses.push(`team1_id.in.(${list})`);
        clauses.push(`team2_id.in.(${list})`);
      }

      if (matchingTournamentIds && matchingTournamentIds.length > 0) {
        const list = matchingTournamentIds.join(',');
        clauses.push(`tournament_id.in.(${list})`);
      }

      query = query.or(clauses.join(','));
    }

    query = query
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(limit);

    const { data, error } = await query;

    if (error) {
      logger.error('[admin/matches/search] error', error);
      return res.status(500).json({ error: 'Echec de la recherche' });
    }

    const matches: AdminMatchSearchResult[] = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const t1 = pickRel(r.team1);
      const t2 = pickRel(r.team2);
      const tn = pickRel(r.tournament);
      return {
        id: String(r.id),
        kickoffAt: (r.scheduled_at as string | null) ?? null,
        tournamentName: (tn?.name as string | null) ?? null,
        teamAName: (t1?.name as string | null) ?? null,
        teamBName: (t2?.name as string | null) ?? null,
        status: (r.status as string | null) ?? null,
      };
    });

    return res.status(200).json({ matches });
  } catch (err) {
    logger.error('[admin/matches/search] unexpected error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function pickRel(rel: unknown): { id: string; name: string | null } | null {
  if (!rel) return null;
  const obj = Array.isArray(rel) ? rel[0] : rel;
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : null,
  };
}
