// GET /api/bot/v1/reminders
//
// Polled by the Discord bot every few minutes. Returns the reminders that
// became due since the last poll and atomically marks them as sent so a
// crashed bot retrying the call doesn't double-DM users.
//
// Three reminder kinds:
//   - match_checkin   : match starts in ~30 min; DM the captain with the
//                       check-in URL for their team. Per-side dedup via
//                       matches.team{1,2}_captain_dm_30_sent_at.
//   - tournament_j1   : tournament starts tomorrow; DM every captain. Per-
//                       tournament dedup via tournaments.j1_reminder_sent_at.
//   - cast_briefing   : a cast briefing is in ~30 min; DM the caster. Per-
//                       assignment dedup via cast_assignments.briefing_reminder_sent_at.
//
// Auth: x-api-key header validated against BOT_API_KEY.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { buildCheckinUrl } from '@/utils/checkin';
import {
  getDiscordLinksForUsers,
  type DiscordLink,
} from '@/utils/discordLinks';
import { logger } from '@/utils/logger';

// Polling window — matches scheduled in this interval are eligible.
// Bot polls every ~5 min so a 25–35 min window catches every match exactly
// once (T-30) with a small margin for clock drift.
const WINDOW_MIN = 25;
const WINDOW_MAX = 35;

type MatchCheckinReminder = {
  kind: 'match_checkin';
  id: string; // `${matchId}:team1` | `${matchId}:team2`
  discordUserId: string;
  discordUsername: string | null;
  matchId: string;
  scheduledAt: string;
  teamName: string;
  opponentName: string;
  tournamentName: string | null;
  scrimName: string | null;
  checkinUrl: string;
};

type TournamentJ1Reminder = {
  kind: 'tournament_j1';
  id: string; // `${tournamentId}:${authUserId}`
  discordUserId: string;
  discordUsername: string | null;
  tournamentId: string;
  tournamentName: string;
  startDate: string;
  teamName: string;
};

type CastBriefingReminder = {
  kind: 'cast_briefing';
  id: string; // assignment id
  discordUserId: string;
  discordUsername: string | null;
  matchId: string;
  scheduledAt: string | null;
  briefingAt: string;
  team1Name: string | null;
  team2Name: string | null;
};

type Reminder =
  | MatchCheckinReminder
  | TournamentJ1Reminder
  | CastBriefingReminder;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tenantId = req.botContext!.tenantId;
  const reminders: Reminder[] = [];
  const errors: string[] = [];

  try {
    const matchReminders = await collectMatchCheckinReminders(tenantId);
    reminders.push(...matchReminders);
  } catch (e) {
    logger.error('[bot/reminders] match_checkin error', e);
    errors.push('match_checkin');
  }

  try {
    const j1 = await collectTournamentJ1Reminders(tenantId);
    reminders.push(...j1);
  } catch (e) {
    logger.error('[bot/reminders] tournament_j1 error', e);
    errors.push('tournament_j1');
  }

  try {
    const cast = await collectCastBriefingReminders(tenantId);
    reminders.push(...cast);
  } catch (e) {
    logger.error('[bot/reminders] cast_briefing error', e);
    errors.push('cast_briefing');
  }

  return res.status(200).json({ reminders, errors });
}

/* ---------------------------------------------------------------------------
 * match_checkin
 * ------------------------------------------------------------------------- */

async function collectMatchCheckinReminders(
  tenantId: string
): Promise<MatchCheckinReminder[]> {
  const now = Date.now();
  const windowStart = new Date(now + WINDOW_MIN * 60_000).toISOString();
  const windowEnd = new Date(now + WINDOW_MAX * 60_000).toISOString();

  const { data: matches, error } = await supabaseAdmin!
    .from('matches')
    .select(
      `id, scheduled_at, status, is_bye,
       team1_id, team2_id,
       team1_captain_dm_30_sent_at, team2_captain_dm_30_sent_at,
       team1_checkin_token, team2_checkin_token,
       team1_checked_in_at, team2_checked_in_at,
       team1:team1_id (id, name, captain_id),
       team2:team2_id (id, name, captain_id),
       tournament:tournament_id (id, name),
       scrim:scrim_id (id, name)`
    )
    .eq('tenant_id', tenantId)
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd)
    .eq('status', 'pending')
    .neq('is_bye', true)
    .or(
      'team1_captain_dm_30_sent_at.is.null,team2_captain_dm_30_sent_at.is.null'
    );

  if (error) throw error;
  if (!matches || matches.length === 0) return [];

  // Collect captain auth_user_ids for bulk Discord-link lookup.
  const captainIds = new Set<string>();
  for (const m of matches as any[]) {
    if (
      !m.team1_captain_dm_30_sent_at &&
      m.team1?.captain_id &&
      !m.team1_checked_in_at
    ) {
      captainIds.add(m.team1.captain_id);
    }
    if (
      !m.team2_captain_dm_30_sent_at &&
      m.team2?.captain_id &&
      !m.team2_checked_in_at
    ) {
      captainIds.add(m.team2.captain_id);
    }
  }

  const linksByUser = await getDiscordLinksForUsers([...captainIds]);
  const reminders: MatchCheckinReminder[] = [];

  for (const m of matches as any[]) {
    for (const side of [1, 2] as const) {
      const team = side === 1 ? m.team1 : m.team2;
      const sentField =
        side === 1
          ? 'team1_captain_dm_30_sent_at'
          : 'team2_captain_dm_30_sent_at';
      const checkedField =
        side === 1 ? 'team1_checked_in_at' : 'team2_checked_in_at';
      const tokenField =
        side === 1 ? 'team1_checkin_token' : 'team2_checkin_token';
      const opponentTeam = side === 1 ? m.team2 : m.team1;

      if (m[sentField]) continue; // already DM'd
      if (m[checkedField]) continue; // captain already checked in
      if (!team?.captain_id) continue;
      const token = m[tokenField];
      if (!token) continue; // checkin tokens not generated yet

      const link = linksByUser.get(team.captain_id);
      if (!link) continue;

      // Atomic claim: only proceed if we can flip the column from NULL to now().
      const claimed = await claimMatchSide(tenantId, m.id, sentField);
      if (!claimed) continue;

      reminders.push({
        kind: 'match_checkin',
        id: `${m.id}:team${side}`,
        discordUserId: link.discordUserId,
        discordUsername: link.discordUsername,
        matchId: m.id,
        scheduledAt: m.scheduled_at,
        teamName: team.name ?? `Équipe ${side}`,
        opponentName: opponentTeam?.name ?? 'Adversaire',
        tournamentName: m.tournament?.name ?? null,
        scrimName: m.scrim?.name ?? null,
        checkinUrl: buildCheckinUrl(token),
      });
    }
  }

  return reminders;
}

async function claimMatchSide(
  tenantId: string,
  matchId: string,
  field: 'team1_captain_dm_30_sent_at' | 'team2_captain_dm_30_sent_at'
): Promise<boolean> {
  const { data, error } = await supabaseAdmin!
    .from('matches')
    .update({ [field]: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .is(field, null)
    .select('id');
  if (error) {
    logger.error('[bot/reminders] claim match side error', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/* ---------------------------------------------------------------------------
 * tournament_j1
 * ------------------------------------------------------------------------- */

async function collectTournamentJ1Reminders(
  tenantId: string
): Promise<TournamentJ1Reminder[]> {
  // Tomorrow's date in YYYY-MM-DD form (server timezone).
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);

  const { data: tournaments, error } = await supabaseAdmin!
    .from('tournaments')
    .select('id, name, start_date, j1_reminder_sent_at')
    .eq('tenant_id', tenantId)
    .gte('start_date', `${tomorrowDate}T00:00:00.000Z`)
    .lt('start_date', `${tomorrowDate}T23:59:59.999Z`)
    .is('j1_reminder_sent_at', null);

  if (error) throw error;
  if (!tournaments || tournaments.length === 0) return [];

  const reminders: TournamentJ1Reminder[] = [];

  for (const t of tournaments) {
    // Pull all teams registered across this tournament's stages.
    const { data: stages, error: stagesErr } = await supabaseAdmin!
      .from('tournament_stages')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', t.id);
    if (stagesErr) throw stagesErr;
    const stageIds = (stages ?? []).map((s) => s.id);
    if (stageIds.length === 0) continue;

    const { data: stageTeams, error: stError } = await supabaseAdmin!
      .from('stage_teams')
      .select('team:team_id (id, name, captain_id)')
      .eq('tenant_id', tenantId)
      .in('stage_id', stageIds);
    if (stError) throw stError;

    // De-dup by team id (a team can be in multiple stages).
    const captainByTeam = new Map<
      string,
      { teamId: string; teamName: string; captainId: string }
    >();
    for (const row of (stageTeams ?? []) as any[]) {
      const team = row.team;
      if (!team?.id || !team.captain_id) continue;
      if (!captainByTeam.has(team.id)) {
        captainByTeam.set(team.id, {
          teamId: team.id,
          teamName: team.name ?? '',
          captainId: team.captain_id,
        });
      }
    }
    if (captainByTeam.size === 0) continue;

    const linksByUser = await getDiscordLinksForUsers(
      [...captainByTeam.values()].map((e) => e.captainId)
    );

    // Mark the tournament as sent BEFORE returning so a concurrent poll
    // doesn't repeat the whole batch. The mark is per-tournament; if some
    // captains lack a Discord link, we just skip them (no retry path,
    // accepted trade-off — they'd never receive the DM anyway).
    const claimed = await claimTournamentJ1(tenantId, t.id);
    if (!claimed) continue;

    for (const entry of captainByTeam.values()) {
      const link = linksByUser.get(entry.captainId);
      if (!link) continue;
      reminders.push({
        kind: 'tournament_j1',
        id: `${t.id}:${entry.captainId}`,
        discordUserId: link.discordUserId,
        discordUsername: link.discordUsername,
        tournamentId: t.id,
        tournamentName: t.name,
        startDate: t.start_date,
        teamName: entry.teamName,
      });
    }
  }

  return reminders;
}

async function claimTournamentJ1(
  tenantId: string,
  tournamentId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin!
    .from('tournaments')
    .update({ j1_reminder_sent_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .is('j1_reminder_sent_at', null)
    .select('id');
  if (error) {
    logger.error('[bot/reminders] claim tournament j1 error', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/* ---------------------------------------------------------------------------
 * cast_briefing
 * ------------------------------------------------------------------------- */

async function collectCastBriefingReminders(
  tenantId: string
): Promise<CastBriefingReminder[]> {
  const now = Date.now();
  const windowStart = new Date(now + WINDOW_MIN * 60_000).toISOString();
  const windowEnd = new Date(now + WINDOW_MAX * 60_000).toISOString();

  const { data: assignments, error } = await supabaseAdmin!
    .from('cast_assignments')
    .select(
      `id, briefing_at, briefing_reminder_sent_at, match_id,
       cast_member:cast_member_id (id, name, auth_user_id),
       match:match_id (id, scheduled_at,
         team1:team1_id (name),
         team2:team2_id (name))`
    )
    .eq('tenant_id', tenantId)
    .gte('briefing_at', windowStart)
    .lte('briefing_at', windowEnd)
    .is('briefing_reminder_sent_at', null);

  if (error) throw error;
  if (!assignments || assignments.length === 0) return [];

  const casterAuthIds = new Set<string>();
  for (const a of assignments as any[]) {
    const authId = a.cast_member?.auth_user_id;
    if (authId) casterAuthIds.add(authId);
  }
  const linksByUser = await getDiscordLinksForUsers([...casterAuthIds]);

  const reminders: CastBriefingReminder[] = [];

  for (const a of assignments as any[]) {
    const authId = a.cast_member?.auth_user_id;
    if (!authId) continue;
    const link = linksByUser.get(authId);
    if (!link) continue;

    const claimed = await claimCastBriefing(tenantId, a.id);
    if (!claimed) continue;

    reminders.push({
      kind: 'cast_briefing',
      id: a.id,
      discordUserId: link.discordUserId,
      discordUsername: link.discordUsername,
      matchId: a.match_id,
      scheduledAt: a.match?.scheduled_at ?? null,
      briefingAt: a.briefing_at,
      team1Name: a.match?.team1?.name ?? null,
      team2Name: a.match?.team2?.name ?? null,
    });
  }

  return reminders;
}

async function claimCastBriefing(
  tenantId: string,
  assignmentId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin!
    .from('cast_assignments')
    .update({ briefing_reminder_sent_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', assignmentId)
    .is('briefing_reminder_sent_at', null)
    .select('id');
  if (error) {
    logger.error('[bot/reminders] claim cast briefing error', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-reminders' },
});
