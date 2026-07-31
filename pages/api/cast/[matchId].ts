// pages/api/cast/[matchId].ts
// Aggregate read endpoint for the caster dashboard.
// Returns everything a caster needs in one request:
//   - match info (teams, scores, status, lobby code, stream URL, schedule, format)
//   - tournament info
//   - veto state (steps + flow + picked maps)
//   - both team rosters (members with battle_tag, role, substitute flag)
//   - H2H stats between the two teams (count, wins each side, last 3 meetings)
//
// Auth: caster role minimum (same as the rest of the staff system).

import type { NextApiRequest, NextApiResponse } from 'next';
import { isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import {
  resolveMissingDisplayNames,
  withFallbackDisplayName,
} from '@/utils/teams/memberDisplayName';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import type { AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { VETO_FLOWS } from '@/types/veto';
import type { VetoStep, VetoFlowStep } from '@/types/veto';

export default withStaffRoute(handler, 'caster');

type Member = {
  id: string;
  battle_tag: string | null;
  role: string;
  is_substitute: boolean;
  is_captain: boolean;
  is_manager: boolean;
  /** Encadrement (coach / manager) : hors roster jouant. */
  is_staff: boolean;
  /** Pseudo — l'encadrement n'a pas forcément de BattleTag. */
  display_name: string | null;
};

type H2HMeeting = {
  matchId: string;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
  completedAt: string | null;
  tournamentName: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const tenantId = ctx.tenantId;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { matchId } = req.query;
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  // 1) Match + teams + tournament + stage
  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, match_format, round_name, round_number, bracket_side,
      team1_id, team2_id, team1_score, team2_score, winner_team_id,
      forfeit_team_id, scheduled_at, completed_at,
      stream_url, replay_url, lobby_code, notes,
      team1:team1_id(id, name, short_name, logo_url, country, captain_id),
      team2:team2_id(id, name, short_name, logo_url, country, captain_id),
      tournament:tournament_id(id, name, slug),
      stage:stage_id(id, name, stage_type)
      `
    )
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (matchErr || !match) {
    return res.status(404).json({ error: 'Match introuvable' });
  }

  const team1 = Array.isArray(match.team1) ? match.team1[0] : match.team1;
  const team2 = Array.isArray(match.team2) ? match.team2[0] : match.team2;
  const tournament = Array.isArray(match.tournament)
    ? match.tournament[0]
    : match.tournament;
  const stage = Array.isArray(match.stage) ? match.stage[0] : match.stage;

  // 2) Veto steps (raw)
  const { data: vetoSteps } = await supabaseAdmin
    .from('match_map_vetos')
    .select('*')
    .eq('match_id', matchId)
    .eq('tenant_id', tenantId)
    .order('step_number', { ascending: true });

  const format = match.match_format || 'bo3';
  const flow: VetoFlowStep[] = VETO_FLOWS[format] || VETO_FLOWS['bo3'];
  const steps = (vetoSteps || []) as VetoStep[];
  const pickedMaps = steps
    .filter((s) => s.action === 'pick' || s.action === 'decider')
    .map((s) => ({
      map_name: s.map_name,
      map_type: s.map_type,
      picked_by: s.team_id,
    }));

  const veto = {
    format,
    flow,
    steps,
    currentStepIndex: steps.length,
    isComplete: steps.length >= flow.length,
    pickedMaps,
  };

  // 3) Rosters for both teams (members + captain flag)
  const teamIds = [match.team1_id, match.team2_id].filter(
    (x): x is string => !!x
  );

  const team1Members: Member[] = [];
  const team2Members: Member[] = [];

  if (teamIds.length > 0) {
    const { data: members } = await supabaseAdmin
      .from('team_members')
      .select(
        'id, team_id, user_id, role, battle_tag, display_name, is_substitute'
      )
      .eq('tenant_id', tenantId)
      .in('team_id', teamIds);

    // Le pseudo vit sur le compte : `team_members.display_name` est une
    // surcharge par équipe, presque toujours nulle. Sans ce repli, un membre
    // d'encadrement (pas de BattleTag obligatoire) n'a rien à afficher.
    const memberNames = await resolveMissingDisplayNames(
      (members || []) as {
        user_id?: string | null;
        display_name?: string | null;
      }[]
    );

    for (const m of members || []) {
      const enriched: Member = {
        id: m.id,
        battle_tag: m.battle_tag ?? null,
        role: m.role,
        is_substitute: !!m.is_substitute,
        is_captain:
          (m.team_id === match.team1_id && team1?.captain_id === m.user_id) ||
          (m.team_id === match.team2_id && team2?.captain_id === m.user_id),
        is_manager: m.role === 'manager',
        is_staff: isNonPlayingTeamRole(m.role as string | null),
        display_name: withFallbackDisplayName(m, memberNames),
      };
      if (m.team_id === match.team1_id) team1Members.push(enriched);
      else if (m.team_id === match.team2_id) team2Members.push(enriched);
    }

    // Capitaine, puis joueuses (titulaires avant remplaçantes), puis encadrement
    const sortMembers = (a: Member, b: Member) => {
      if (a.is_captain !== b.is_captain) return a.is_captain ? -1 : 1;
      // Encadrement en DERNIER : il précédait les joueuses, ce qui le mettait
      // en tête d'un roster de diffusion — et le tronquait (BriefingPanel
      // n'affiche que les 8 premières lignes).
      if (a.is_staff !== b.is_staff) return a.is_staff ? 1 : -1;
      if (a.is_substitute !== b.is_substitute) return a.is_substitute ? 1 : -1;
      return (a.battle_tag || '').localeCompare(b.battle_tag || '');
    };
    team1Members.sort(sortMembers);
    team2Members.sort(sortMembers);
  }

  // 4) H2H stats (only finished/walkover matches between these two teams)
  let h2hWinsTeam1 = 0;
  let h2hWinsTeam2 = 0;
  let h2hTotal = 0;
  const h2hMeetings: H2HMeeting[] = [];

  if (match.team1_id && match.team2_id) {
    const a = match.team1_id;
    const b = match.team2_id;
    const { data: pastMatches } = await supabaseAdmin
      .from('matches')
      .select(
        `
        id, team1_id, team2_id, team1_score, team2_score,
        winner_team_id, completed_at, status,
        tournament:tournament_id(name)
        `
      )
      .or(
        `and(team1_id.eq.${a},team2_id.eq.${b}),and(team1_id.eq.${b},team2_id.eq.${a})`
      )
      .eq('tenant_id', tenantId)
      .in('status', ['finished', 'walkover'])
      .neq('id', matchId)
      .order('completed_at', { ascending: false })
      .limit(20);

    for (const pm of pastMatches || []) {
      h2hTotal += 1;
      if (pm.winner_team_id === a) h2hWinsTeam1 += 1;
      else if (pm.winner_team_id === b) h2hWinsTeam2 += 1;

      const tn = Array.isArray(pm.tournament)
        ? pm.tournament[0]
        : pm.tournament;

      // Normalize scores so team1Score is always our current team1's score
      const wasReversed = pm.team1_id !== a;
      h2hMeetings.push({
        matchId: pm.id,
        team1Score: wasReversed ? pm.team2_score : pm.team1_score,
        team2Score: wasReversed ? pm.team1_score : pm.team2_score,
        winnerTeamId: pm.winner_team_id ?? null,
        completedAt: pm.completed_at ?? null,
        tournamentName: tn?.name ?? null,
      });
    }
  }

  // 5) Linked cast_member profile of the connected staff caster (optional)
  let castProfile: {
    id: string;
    name: string;
    title: string | null;
    imageUrl: string | null;
    twitchUrl: string | null;
  } | null = null;

  if (ctx.user?.id) {
    const { data: linked } = await supabaseAdmin
      .from('cast_members')
      .select('id, name, title, image_url, twitch_url, is_active')
      .eq('auth_user_id', ctx.user.id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      // Une fiche interne (auto-provision admin/owner) n'a pas de profil public :
      // on ne surface pas de carte "castProfile" dans le viewer public.
      .eq('is_internal', false)
      .maybeSingle();

    if (linked) {
      castProfile = {
        id: linked.id,
        name: linked.name,
        title: linked.title,
        imageUrl: linked.image_url,
        twitchUrl: linked.twitch_url,
      };
    }
  }

  return res.status(200).json({
    castProfile,
    match: {
      id: match.id,
      status: match.status,
      matchFormat: format,
      roundName: match.round_name,
      roundNumber: match.round_number,
      bracketSide: match.bracket_side,
      team1Id: match.team1_id,
      team2Id: match.team2_id,
      team1Score: match.team1_score,
      team2Score: match.team2_score,
      winnerTeamId: match.winner_team_id,
      forfeitTeamId: match.forfeit_team_id,
      scheduledAt: match.scheduled_at,
      completedAt: match.completed_at,
      streamUrl: match.stream_url,
      replayUrl: match.replay_url,
      lobbyCode: match.lobby_code,
      notes: match.notes,
    },
    team1: team1
      ? {
          id: team1.id,
          name: team1.name,
          shortName: team1.short_name,
          logoUrl: team1.logo_url,
          country: team1.country,
          members: team1Members,
        }
      : null,
    team2: team2
      ? {
          id: team2.id,
          name: team2.name,
          shortName: team2.short_name,
          logoUrl: team2.logo_url,
          country: team2.country,
          members: team2Members,
        }
      : null,
    tournament: tournament
      ? { id: tournament.id, name: tournament.name, slug: tournament.slug }
      : null,
    stage: stage
      ? { id: stage.id, name: stage.name, stageType: stage.stage_type }
      : null,
    veto,
    h2h: {
      total: h2hTotal,
      winsTeam1: h2hWinsTeam1,
      winsTeam2: h2hWinsTeam2,
      meetings: h2hMeetings.slice(0, 5),
    },
  });
}
