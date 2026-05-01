// utils/checkin.ts
// Per-match check-in orchestrator.
//
// Time-based state machine driven by `matches.scheduled_at` :
//   T-60min : generate tokens (if missing) + send check-in email to captains
//   T-30min : Discord reminder for un-checked-in teams
//   T-15min : Discord reminder for un-checked-in teams
//   T-0     : auto-forfeit any team that didn't check in
//
// Each step is gated by a `*_sent_at` (or `forfeit_processed_at`) timestamp
// stored on the match row, so re-running the cron is idempotent.

import crypto from 'crypto';
import { supabaseAdmin } from './supabase';
import { sendMatchCheckinEmail } from './email';
import { notifyCheckinReminder, notifyCheckinForfeit } from './discord';
import { applyMatchScore } from './matches/applyScore';

import { logger } from './logger';
export const CHECKIN_OPEN_MINUTES = 60;
export const REMINDER_30_MINUTES = 30;
export const REMINDER_15_MINUTES = 15;

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr';

/* -----------------------------------------------------------
 * Token helpers
 * ---------------------------------------------------------*/

export function generateCheckinToken(): string {
  // 24 random bytes -> 32 chars base64url. Plenty for collision resistance.
  return crypto.randomBytes(24).toString('base64url');
}

export function buildCheckinUrl(token: string): string {
  return `${SITE_URL.replace(/\/$/, '')}/checkin/${token}`;
}

/* -----------------------------------------------------------
 * Token redemption (called by public route + Draftbot)
 * ---------------------------------------------------------*/

export type CheckinResolveResult =
  | {
      ok: true;
      matchId: string;
      teamSlot: 1 | 2;
      teamName: string;
      teamId: string;
      opponentName: string | null;
      tournamentName: string | null;
      scheduledAt: string | null;
      alreadyCheckedIn: boolean;
      checkedInAt: string | null;
      matchStatus: string;
    }
  | { ok: false; error: string };

/**
 * Look up a token without redeeming it. Used by the public page to render
 * a confirmation screen before the captain clicks "Check-in".
 */
export async function resolveCheckinToken(
  token: string
): Promise<CheckinResolveResult> {
  if (!supabaseAdmin) return { ok: false, error: 'Service indisponible' };
  if (!token || token.length < 16)
    return { ok: false, error: 'Token invalide' };

  // Lookup the match by either team1 or team2 token
  const { data: match, error } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, scheduled_at,
      team1_id, team2_id,
      team1_checkin_token, team2_checkin_token,
      team1_checked_in_at, team2_checked_in_at,
      team1:team1_id(id, name),
      team2:team2_id(id, name),
      tournament:tournament_id(id, name)
      `
    )
    .or(`team1_checkin_token.eq.${token},team2_checkin_token.eq.${token}`)
    .maybeSingle();

  if (error || !match) {
    return { ok: false, error: 'Token introuvable' };
  }

  const isTeam1 = match.team1_checkin_token === token;
  const teamSlot: 1 | 2 = isTeam1 ? 1 : 2;
  const teamRel = isTeam1 ? match.team1 : match.team2;
  const oppRel = isTeam1 ? match.team2 : match.team1;
  const team = Array.isArray(teamRel) ? teamRel[0] : teamRel;
  const opp = Array.isArray(oppRel) ? oppRel[0] : oppRel;
  const tn = Array.isArray(match.tournament)
    ? match.tournament[0]
    : match.tournament;

  if (!team) return { ok: false, error: 'Équipe introuvable pour ce token' };

  const checkedInAt = isTeam1
    ? match.team1_checked_in_at
    : match.team2_checked_in_at;

  return {
    ok: true,
    matchId: match.id,
    teamSlot,
    teamId: team.id,
    teamName: team.name,
    opponentName: opp?.name ?? null,
    tournamentName: tn?.name ?? null,
    scheduledAt: match.scheduled_at ?? null,
    alreadyCheckedIn: !!checkedInAt,
    checkedInAt: checkedInAt ?? null,
    matchStatus: match.status,
  };
}

export type CheckinRedeemResult =
  | {
      ok: true;
      matchId: string;
      teamSlot: 1 | 2;
      teamName: string;
      checkedInAt: string;
      alreadyCheckedIn: boolean;
    }
  | { ok: false; error: string };

/**
 * Redeem a check-in token: marks the team as checked-in if not already.
 * Idempotent — calling twice on a valid token is safe.
 */
export async function redeemCheckinToken(
  token: string
): Promise<CheckinRedeemResult> {
  const resolved = await resolveCheckinToken(token);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  if (
    resolved.matchStatus !== 'pending' &&
    resolved.matchStatus !== 'ongoing'
  ) {
    return {
      ok: false,
      error: `Check-in fermé (statut du match : ${resolved.matchStatus})`,
    };
  }

  if (resolved.alreadyCheckedIn) {
    return {
      ok: true,
      matchId: resolved.matchId,
      teamSlot: resolved.teamSlot,
      teamName: resolved.teamName,
      checkedInAt: resolved.checkedInAt!,
      alreadyCheckedIn: true,
    };
  }

  const now = new Date().toISOString();
  const field =
    resolved.teamSlot === 1 ? 'team1_checked_in_at' : 'team2_checked_in_at';

  const { error } = await supabaseAdmin!
    .from('matches')
    .update({ [field]: now })
    .eq('id', resolved.matchId);

  if (error) {
    logger.error('[checkin] redeem update error:', error);
    return { ok: false, error: "Échec de l'enregistrement du check-in" };
  }

  return {
    ok: true,
    matchId: resolved.matchId,
    teamSlot: resolved.teamSlot,
    teamName: resolved.teamName,
    checkedInAt: now,
    alreadyCheckedIn: false,
  };
}

/* -----------------------------------------------------------
 * Captain email lookup
 * ---------------------------------------------------------*/

async function getCaptainEmail(teamId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('captain_id')
    .eq('id', teamId)
    .maybeSingle();

  if (!team?.captain_id) return null;

  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(
      team.captain_id
    );
    return data?.user?.email ?? null;
  } catch (e) {
    logger.error('[checkin] getCaptainEmail error:', e);
    return null;
  }
}

/* -----------------------------------------------------------
 * Per-match orchestration (the actual state machine)
 * ---------------------------------------------------------*/

type MatchLite = {
  id: string;
  tournament_id: string | null;
  status: string;
  is_bye: boolean | null;
  scheduled_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_checkin_token: string | null;
  team2_checkin_token: string | null;
  team1_checked_in_at: string | null;
  team2_checked_in_at: string | null;
  checkin_email_sent_at: string | null;
  reminder_30_sent_at: string | null;
  reminder_15_sent_at: string | null;
  forfeit_processed_at: string | null;
  team1?: { id: string; name: string; discord_role_id: string | null } | null;
  team2?: { id: string; name: string; discord_role_id: string | null } | null;
  tournament?: { id: string; name: string } | null;
};

export type ProcessStepResult = {
  matchId: string;
  steps: string[];
  errors: string[];
};

/**
 * Run the check-in state machine for a single match.
 * Returns the list of steps that were executed during this call.
 */
export async function processMatchCheckin(
  match: MatchLite
): Promise<ProcessStepResult> {
  const result: ProcessStepResult = {
    matchId: match.id,
    steps: [],
    errors: [],
  };

  if (!supabaseAdmin) {
    result.errors.push('supabase admin unavailable');
    return result;
  }

  // Skip byes, finished matches, etc.
  if (match.is_bye) return result;
  if (match.status !== 'pending') return result;
  if (!match.scheduled_at) return result;
  if (!match.team1_id || !match.team2_id) return result;

  const now = new Date();
  const kickoff = new Date(match.scheduled_at);
  const minutesUntil = (kickoff.getTime() - now.getTime()) / 60000;

  // Step 1: T-60min — generate tokens + send emails
  if (
    minutesUntil <= CHECKIN_OPEN_MINUTES &&
    minutesUntil > 0 &&
    !match.checkin_email_sent_at
  ) {
    await runCheckinOpenStep(match, result);
  }

  // Step 2: T-30min — Discord reminder
  if (
    minutesUntil <= REMINDER_30_MINUTES &&
    minutesUntil > REMINDER_15_MINUTES &&
    !match.reminder_30_sent_at
  ) {
    await runReminderStep(match, 30, result);
  }

  // Step 3: T-15min — Discord reminder
  if (
    minutesUntil <= REMINDER_15_MINUTES &&
    minutesUntil > 0 &&
    !match.reminder_15_sent_at
  ) {
    await runReminderStep(match, 15, result);
  }

  // Step 4: T-0 — auto-forfeit (allow up to 60min late so we don't miss matches)
  if (minutesUntil <= 0 && minutesUntil > -60 && !match.forfeit_processed_at) {
    await runForfeitStep(match, result);
  }

  return result;
}

/* -----------------------------------------------------------
 * Step implementations
 * ---------------------------------------------------------*/

async function runCheckinOpenStep(
  match: MatchLite,
  result: ProcessStepResult
): Promise<void> {
  // 1) Generate tokens if missing
  const updates: Record<string, string> = {};
  if (!match.team1_checkin_token) {
    updates.team1_checkin_token = generateCheckinToken();
  }
  if (!match.team2_checkin_token) {
    updates.team2_checkin_token = generateCheckinToken();
  }

  // We need the tokens to build URLs even if they were already present
  const team1Token = updates.team1_checkin_token || match.team1_checkin_token!;
  const team2Token = updates.team2_checkin_token || match.team2_checkin_token!;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin!
      .from('matches')
      .update(updates)
      .eq('id', match.id);

    if (error) {
      result.errors.push(`token gen: ${error.message}`);
      return;
    }
  }

  // 2) Send emails to both captains (only if not already checked in)
  const tournamentName = match.tournament?.name || "OW Women's Cup";

  const team1Email = match.team1_checked_in_at
    ? null
    : await getCaptainEmail(match.team1_id!);
  const team2Email = match.team2_checked_in_at
    ? null
    : await getCaptainEmail(match.team2_id!);

  const team1Name = match.team1?.name || 'Équipe 1';
  const team2Name = match.team2?.name || 'Équipe 2';

  const sends: Promise<unknown>[] = [];
  if (team1Email) {
    sends.push(
      sendMatchCheckinEmail({
        to: team1Email,
        teamName: team1Name,
        opponentName: team2Name,
        scheduledAt: match.scheduled_at!,
        checkinUrl: buildCheckinUrl(team1Token),
        tournamentName,
      })
    );
  }
  if (team2Email) {
    sends.push(
      sendMatchCheckinEmail({
        to: team2Email,
        teamName: team2Name,
        opponentName: team1Name,
        scheduledAt: match.scheduled_at!,
        checkinUrl: buildCheckinUrl(team2Token),
        tournamentName,
      })
    );
  }

  if (sends.length > 0) {
    await Promise.allSettled(sends);
  }

  // 3) Mark as sent so we don't retry
  const { error: markErr } = await supabaseAdmin!
    .from('matches')
    .update({ checkin_email_sent_at: new Date().toISOString() })
    .eq('id', match.id);

  if (markErr) {
    result.errors.push(`mark email sent: ${markErr.message}`);
    return;
  }

  result.steps.push(
    `email_sent (${[team1Email, team2Email].filter(Boolean).length} recipients)`
  );
}

async function runReminderStep(
  match: MatchLite,
  minutes: 30 | 15,
  result: ProcessStepResult
): Promise<void> {
  const team1Token = match.team1_checkin_token;
  const team2Token = match.team2_checkin_token;

  // Ping each team that hasn't checked in
  const team1Name = match.team1?.name || 'Équipe 1';
  const team2Name = match.team2?.name || 'Équipe 2';

  const pings: Promise<unknown>[] = [];

  if (!match.team1_checked_in_at && team1Token) {
    pings.push(
      notifyCheckinReminder({
        tournamentId: match.tournament_id,
        matchId: match.id,
        teamName: team1Name,
        teamRoleId: match.team1?.discord_role_id ?? null,
        opponentName: team2Name,
        scheduledAt: match.scheduled_at!,
        minutesBeforeKickoff: minutes,
        checkinUrl: buildCheckinUrl(team1Token),
      })
    );
  }

  if (!match.team2_checked_in_at && team2Token) {
    pings.push(
      notifyCheckinReminder({
        tournamentId: match.tournament_id,
        matchId: match.id,
        teamName: team2Name,
        teamRoleId: match.team2?.discord_role_id ?? null,
        opponentName: team1Name,
        scheduledAt: match.scheduled_at!,
        minutesBeforeKickoff: minutes,
        checkinUrl: buildCheckinUrl(team2Token),
      })
    );
  }

  if (pings.length > 0) {
    await Promise.allSettled(pings);
  }

  const field = minutes === 30 ? 'reminder_30_sent_at' : 'reminder_15_sent_at';
  const { error } = await supabaseAdmin!
    .from('matches')
    .update({ [field]: new Date().toISOString() })
    .eq('id', match.id);

  if (error) {
    result.errors.push(`mark reminder ${minutes}: ${error.message}`);
    return;
  }

  result.steps.push(`reminder_${minutes} (${pings.length} pinged)`);
}

async function runForfeitStep(
  match: MatchLite,
  result: ProcessStepResult
): Promise<void> {
  const team1CheckedIn = !!match.team1_checked_in_at;
  const team2CheckedIn = !!match.team2_checked_in_at;

  const team1Name = match.team1?.name || 'Équipe 1';
  const team2Name = match.team2?.name || 'Équipe 2';

  // Both teams checked in -> no action, just mark processed
  if (team1CheckedIn && team2CheckedIn) {
    await markForfeitProcessed(match.id, result);
    result.steps.push('forfeit_skipped (both teams checked in)');
    return;
  }

  // Both teams missing -> cancel the match (no winner, no propagation)
  if (!team1CheckedIn && !team2CheckedIn) {
    const { error } = await supabaseAdmin!
      .from('matches')
      .update({
        status: 'cancelled',
        notes: "Annulé : aucune équipe n'a check-in",
      })
      .eq('id', match.id);
    if (error) {
      result.errors.push(`cancel both: ${error.message}`);
      return;
    }
    await markForfeitProcessed(match.id, result);
    result.steps.push('forfeit_both_cancelled');
    return;
  }

  // One team missing -> forfeit
  const forfeitTeamId = team1CheckedIn ? match.team2_id! : match.team1_id!;
  const forfeitedName = team1CheckedIn ? team2Name : team1Name;
  const winnerName = team1CheckedIn ? team1Name : team2Name;
  const forfeitedRoleId = team1CheckedIn
    ? (match.team2?.discord_role_id ?? null)
    : (match.team1?.discord_role_id ?? null);

  try {
    await applyMatchScore({
      matchId: match.id,
      forfeitTeamId,
      staffId: null,
      propagateBracket: true,
    });
  } catch (e) {
    result.errors.push(
      `applyMatchScore forfeit: ${e instanceof Error ? e.message : String(e)}`
    );
    return;
  }

  // Discord ping for the forfeit (separate from the auto match-result ping
  // that applyMatchScore triggers — this one is on the dedicated checkin
  // channel).
  await notifyCheckinForfeit({
    tournamentId: match.tournament_id,
    matchId: match.id,
    forfeitedTeamName: forfeitedName,
    forfeitedTeamRoleId: forfeitedRoleId,
    opponentName: winnerName,
  }).catch((e) => logger.error('[checkin] notifyCheckinForfeit error:', e));

  await markForfeitProcessed(match.id, result);
  result.steps.push(`forfeit (${forfeitedName} -> walkover)`);
}

async function markForfeitProcessed(
  matchId: string,
  result: ProcessStepResult
): Promise<void> {
  const { error } = await supabaseAdmin!
    .from('matches')
    .update({ forfeit_processed_at: new Date().toISOString() })
    .eq('id', matchId);
  if (error) {
    result.errors.push(`mark forfeit processed: ${error.message}`);
  }
}

/* -----------------------------------------------------------
 * Bulk processor (called by the cron and the manual admin button)
 * ---------------------------------------------------------*/

export type BulkProcessResult = {
  scanned: number;
  acted: number;
  errors: number;
  details: ProcessStepResult[];
};

const SELECT_FIELDS = `
  id, tournament_id, status, is_bye, scheduled_at,
  team1_id, team2_id,
  team1_checkin_token, team2_checkin_token,
  team1_checked_in_at, team2_checked_in_at,
  checkin_email_sent_at, reminder_30_sent_at, reminder_15_sent_at,
  forfeit_processed_at,
  team1:team1_id(id, name, discord_role_id),
  team2:team2_id(id, name, discord_role_id),
  tournament:tournament_id(id, name)
`;

/**
 * Scans all upcoming pending matches in a window from T-65min to T-65min late
 * (so the cron can be a few minutes off without missing anything) and runs
 * the state machine on each one.
 */
export async function processCheckinForUpcomingMatches(opts?: {
  tournamentId?: string;
}): Promise<BulkProcessResult> {
  const summary: BulkProcessResult = {
    scanned: 0,
    acted: 0,
    errors: 0,
    details: [],
  };

  if (!supabaseAdmin) return summary;

  const now = new Date();
  const windowStart = new Date(now.getTime() - 65 * 60_000).toISOString();
  const windowEnd = new Date(now.getTime() + 65 * 60_000).toISOString();

  let q = supabaseAdmin
    .from('matches')
    .select(SELECT_FIELDS)
    .eq('status', 'pending')
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd);

  if (opts?.tournamentId) {
    q = q.eq('tournament_id', opts.tournamentId);
  }

  const { data: matches, error } = await q;

  if (error) {
    logger.error('[checkin] bulk scan error:', error);
    return summary;
  }

  for (const raw of matches || []) {
    summary.scanned += 1;
    const match = normalizeMatch(raw);
    const stepResult = await processMatchCheckin(match);
    if (stepResult.steps.length > 0 || stepResult.errors.length > 0) {
      summary.details.push(stepResult);
    }
    if (stepResult.steps.length > 0) summary.acted += 1;
    if (stepResult.errors.length > 0) summary.errors += 1;
  }

  return summary;
}

function normalizeMatch(raw: Record<string, unknown>): MatchLite {
  const team1 = Array.isArray(raw.team1) ? raw.team1[0] : raw.team1;
  const team2 = Array.isArray(raw.team2) ? raw.team2[0] : raw.team2;
  const tournament = Array.isArray(raw.tournament)
    ? raw.tournament[0]
    : raw.tournament;
  return {
    ...(raw as MatchLite),
    team1: (team1 as MatchLite['team1']) ?? null,
    team2: (team2 as MatchLite['team2']) ?? null,
    tournament: (tournament as MatchLite['tournament']) ?? null,
  };
}

/* -----------------------------------------------------------
 * Status helpers (for admin UI)
 * ---------------------------------------------------------*/

export type CheckinStatusRow = {
  matchId: string;
  scheduledAt: string | null;
  status: string;
  team1: { id: string | null; name: string | null; checkedInAt: string | null };
  team2: { id: string | null; name: string | null; checkedInAt: string | null };
  emailSentAt: string | null;
  reminder30At: string | null;
  reminder15At: string | null;
  forfeitProcessedAt: string | null;
};

export async function listCheckinStatus(
  tournamentId: string
): Promise<CheckinStatusRow[]> {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, scheduled_at, status,
      team1_id, team2_id,
      team1_checked_in_at, team2_checked_in_at,
      checkin_email_sent_at, reminder_30_sent_at, reminder_15_sent_at,
      forfeit_processed_at,
      team1:team1_id(id, name),
      team2:team2_id(id, name)
      `
    )
    .eq('tournament_id', tournamentId)
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (error) {
    logger.error('[checkin] listCheckinStatus error:', error);
    return [];
  }

  return (data || []).map((m: any) => {
    const t1 = Array.isArray(m.team1) ? m.team1[0] : m.team1;
    const t2 = Array.isArray(m.team2) ? m.team2[0] : m.team2;
    return {
      matchId: m.id,
      scheduledAt: m.scheduled_at ?? null,
      status: m.status,
      team1: {
        id: t1?.id ?? null,
        name: t1?.name ?? null,
        checkedInAt: m.team1_checked_in_at ?? null,
      },
      team2: {
        id: t2?.id ?? null,
        name: t2?.name ?? null,
        checkedInAt: m.team2_checked_in_at ?? null,
      },
      emailSentAt: m.checkin_email_sent_at ?? null,
      reminder30At: m.reminder_30_sent_at ?? null,
      reminder15At: m.reminder_15_sent_at ?? null,
      forfeitProcessedAt: m.forfeit_processed_at ?? null,
    };
  });
}
