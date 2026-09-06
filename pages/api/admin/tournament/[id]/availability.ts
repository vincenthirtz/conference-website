// pages/api/admin/tournament/[id]/availability.ts
//
// Toutes les contraintes de disponibilité qui pèsent sur un tournoi — lot 2 de
// docs/PLAN-plateforme-tournois.md. C'est la lecture que consomment le diagnostic
// de planning (lot 3), le calendrier (lot 4) et l'auto-scheduler (lot 6) : une
// seule requête plutôt qu'un aller-retour par équipe.
//
// GET → `{ tournamentId, teams: [{ id, name, constraints }], constraints }`
//   - `teams`       : les équipes ENGAGÉES, chacune avec ses contraintes, même
//                     vide — l'admin doit voir qui n'a rien déclaré autant que
//                     qui a déclaré quelque chose ;
//   - `constraints` : la liste à plat, prête pour `findAvailabilityViolations`.
//
// Périmètre : les contraintes propres au tournoi ET les globales de ces mêmes
// équipes. Une règle permanente (« on ne joue jamais le lundi ») pèse sur ce
// tournoi comme sur les autres ; la filtrer donnerait un diagnostic rassurant
// et faux.
//
// Auth : permission `manage_tournaments`, scope tenant strict. Lecture seule.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';
import { isValidUUID } from '@/utils/apiHelpers';
import type { AvailabilityConstraint } from '@/utils/matches/availability';
import {
  AVAILABILITY_COLUMNS,
  rowToConstraint,
  type AvailabilityRow,
} from '@/utils/matches/availabilityRows';

type TeamBlock = {
  id: string;
  name: string | null;
  constraints: AvailabilityConstraint[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const raw = req.query.id;
  const tournamentId = Array.isArray(raw) ? raw[0] : raw;
  if (!tournamentId || !isValidUUID(tournamentId)) {
    return res
      .status(400)
      .json({ error: 'Invalid tournament id', code: 'INVALID_TOURNAMENT_ID' });
  }

  const { data: tournament, error: tErr } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (tErr) {
    logger.error('[admin/tournament-availability] tournament lookup', tErr, {
      tournamentId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tournament) {
    return res
      .status(404)
      .json({ error: 'Tournament not found', code: 'TOURNAMENT_NOT_FOUND' });
  }

  const { data: entrants, error: eErr } = await supabaseAdmin
    .from('tournament_teams')
    .select('team_id, team:teams!tournament_teams_team_id_fkey(id, name)')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId);

  if (eErr) {
    logger.error('[admin/tournament-availability] entrants', eErr, { tournamentId });
    return res.status(500).json({ error: 'Server error.' });
  }

  type EntrantRow = {
    team_id: string;
    team: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
  };
  const teamNames = new Map<string, string | null>();
  for (const row of (entrants ?? []) as EntrantRow[]) {
    // PostgREST rend l'embed en objet OU en tableau selon la relation résolue :
    // normaliser ici évite de propager l'ambiguïté dans le reste du calcul.
    const team = Array.isArray(row.team) ? row.team[0] : row.team;
    teamNames.set(row.team_id, team?.name ?? null);
  }
  const teamIds = [...teamNames.keys()];

  if (teamIds.length === 0) {
    return res.status(200).json({ tournamentId, teams: [], constraints: [] });
  }

  const { data, error } = await supabaseAdmin
    .from('team_availability_constraints')
    .select(AVAILABILITY_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .in('team_id', teamIds)
    .or(`tournament_id.eq.${tournamentId},tournament_id.is.null`)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('[admin/tournament-availability] constraints', error, {
      tournamentId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }

  const constraints = ((data ?? []) as AvailabilityRow[]).map(rowToConstraint);

  const byTeam = new Map<string, AvailabilityConstraint[]>();
  for (const c of constraints) {
    const list = byTeam.get(c.teamId);
    if (list) list.push(c);
    else byTeam.set(c.teamId, [c]);
  }

  const teams: TeamBlock[] = teamIds
    .map((id) => ({
      id,
      name: teamNames.get(id) ?? null,
      constraints: byTeam.get(id) ?? [],
    }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  return res.status(200).json({ tournamentId, teams, constraints });
}

export default withStaffRoute(handler, { permission: 'manage_tournaments' });
