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
import {
  sendMatchCheckinEmail,
  sendCheckinReminderEmail,
  sendCheckinForfeitEmail,
} from './email';
import {
  notifyCheckinReminder,
  notifyCheckinForfeit,
  notifyLineupReminder,
} from './discord';
import { applyMatchScore } from './matches/applyScore';
import { emitBotEvent } from './botEvents';

import { logger } from './logger';
export const CHECKIN_OPEN_MINUTES = 60;
export const REMINDER_30_MINUTES = 30;
export const REMINDER_15_MINUTES = 15;

/**
 * T-20 : rappel « feuille de match » aux équipes qui ONT fait leur check-in
 * mais n'ont pas déclaré qui joue.
 *
 * Volontairement AVANT le rappel de check-in T-15 : les deux ne s'adressent
 * jamais aux mêmes équipes (l'un vise celles qui n'ont pas coché, l'autre
 * celles qui ont coché), et composer demande plus de temps que cliquer sur un
 * lien de confirmation.
 */
export const LINEUP_REMINDER_MINUTES = 20;

// Default auto-forfeit grace window (minutes after kickoff) used as the
// fallback whenever a tournament has no explicit `checkin_grace_minutes`.
// Historically this equalled CHECKIN_OPEN_MINUTES (60) — we keep the value
// identical so tournaments without the new column behave exactly as before.
export const DEFAULT_GRACE_MINUTES = 60;
const GRACE_MIN = 0;
const GRACE_MAX = 120;

/**
 * Resolve the per-tournament auto-forfeit grace window (minutes).
 *
 * ⚠️ DÉGRADATION GRACIEUSE — `tournaments.checkin_grace_minutes` est ajoutée
 * par une migration séparée qui peut NE PAS être appliquée en prod au moment
 * où ce code est déployé (push sur work = auto-deploy immédiat). On NE lit donc
 * JAMAIS cette colonne dans un select de colonnes existantes (un select d'une
 * colonne absente fait échouer toute la requête → casserait le cron). On la lit
 * via une requête ISOLÉE en try/catch : à la moindre erreur (colonne absente,
 * réseau, …) OU si la valeur est null/undefined/hors plage, on retombe sur la
 * constante DEFAULT_GRACE_MINUTES (60) — comportement identique à aujourd'hui.
 */
async function resolveGraceMinutes(
  tenantId: string,
  tournamentId: string | null
): Promise<number> {
  if (!supabaseAdmin || !tournamentId) return DEFAULT_GRACE_MINUTES;
  try {
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      // Select ISOLÉ et dédié : si la colonne n'existe pas encore, SEULE cette
      // requête échoue (catch ci-dessous → fallback), pas le reste du cron.
      .select('checkin_grace_minutes')
      .eq('tenant_id', tenantId)
      .eq('id', tournamentId)
      .maybeSingle();

    if (error) return DEFAULT_GRACE_MINUTES;

    const raw = (data as { checkin_grace_minutes?: unknown } | null)
      ?.checkin_grace_minutes;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return DEFAULT_GRACE_MINUTES;
    }
    // Clamp into the contracted 0–120 range; out-of-range → fallback.
    if (raw < GRACE_MIN || raw > GRACE_MAX) return DEFAULT_GRACE_MINUTES;
    return Math.round(raw);
  } catch {
    return DEFAULT_GRACE_MINUTES;
  }
}

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
 *
 * @param tenantId Tenant scope (S5a — defense-in-depth) — restreint la recherche
 *                  aux matches du tenant courant pour qu'un token volé ne puisse
 *                  pas révéler un match d'un autre tenant.
 * @param token    Token brut transmis dans l'URL ou l'API.
 */
export async function resolveCheckinToken(
  tenantId: string,
  token: string
): Promise<CheckinResolveResult> {
  if (!supabaseAdmin) return { ok: false, error: 'Service indisponible' };
  if (!token || token.length < 16)
    return { ok: false, error: 'Token invalide' };
  // Les tokens sont base64url (`[A-Za-z0-9_-]`). On valide le charset AVANT
  // d'interpoler le token dans le filtre `.or(...)` PostgREST ci-dessous :
  // défense en profondeur contre une injection de filtre (`,` / `.` / `(`)
  // via un token forgé.
  if (!/^[A-Za-z0-9_-]+$/.test(token))
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
    .eq('tenant_id', tenantId)
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
 *
 * @param tenantId Tenant scope (S5a) — propagé à resolveCheckinToken et
 *                  à l'UPDATE final pour éviter de marquer un check-in
 *                  sur un match d'un autre tenant.
 * @param token    Token brut.
 */
export async function redeemCheckinToken(
  tenantId: string,
  token: string
): Promise<CheckinRedeemResult> {
  const resolved = await resolveCheckinToken(tenantId, token);
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
    .eq('tenant_id', tenantId)
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

async function getCaptainEmail(
  tenantId: string,
  teamId: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('captain_id')
    .eq('tenant_id', tenantId)
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

/**
 * Resolve the captain email for a team and send the urgent check-in reminder.
 * Fully fail-safe: any error (no email on file, Brevo failure, etc.) is caught
 * and logged so it never breaks the reminder step or the forfeit pipeline.
 */
async function sendReminderEmailSafely(opts: {
  tenantId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  scheduledAt: string;
  checkinUrl: string;
  tournamentName: string;
  minutesBeforeKickoff: number;
}): Promise<void> {
  try {
    const email = await getCaptainEmail(opts.tenantId, opts.teamId);
    if (!email) return;
    await sendCheckinReminderEmail({
      to: email,
      teamName: opts.teamName,
      opponentName: opts.opponentName,
      scheduledAt: opts.scheduledAt,
      checkinUrl: opts.checkinUrl,
      tournamentName: opts.tournamentName,
      minutesBeforeKickoff: opts.minutesBeforeKickoff,
    });
  } catch (e) {
    logger.error('[checkin] sendCheckinReminderEmail error:', e);
  }
}

/* -----------------------------------------------------------
 * Per-match orchestration (the actual state machine)
 * ---------------------------------------------------------*/

type MatchLite = {
  id: string;
  // Tenant scope (S5a — defense-in-depth). Source-of-truth pour scoper toutes
  // les mutations declenchees par le state machine check-in (update matches,
  // appel applyMatchScore, etc.).
  tenant_id: string;
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
  // Rappel « feuille de match », marqué PAR ÉQUIPE : les deux côtés ne font
  // pas leur check-in au même moment, et c'est le check-in qui ouvre la
  // feuille. Un marqueur unique partirait sur la première équipe prête et
  // laisserait l'autre sans relance.
  team1_lineup_reminder_sent_at?: string | null;
  team2_lineup_reminder_sent_at?: string | null;
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

  // Step 3: T-20min — rappel « feuille de match » aux équipes qui ONT coché.
  // Évalué par équipe (et pas gated par un marqueur de match) : une équipe qui
  // fait son check-in à T-16 doit encore pouvoir être relancée.
  if (minutesUntil <= LINEUP_REMINDER_MINUTES && minutesUntil > 0) {
    await runLineupReminderStep(match, result, Math.round(minutesUntil));
  }

  // Step 4: T-15min — Discord reminder
  if (
    minutesUntil <= REMINDER_15_MINUTES &&
    minutesUntil > 0 &&
    !match.reminder_15_sent_at
  ) {
    await runReminderStep(match, 15, result);
  }

  // Step 5: auto-forfeit. A team that hasn't checked in by kickoff is forfeited;
  // the per-tournament grace window only widens the *catch-up* span during which
  // the cron may still act (so a few missed ticks don't skip the match), exactly
  // as the hard-coded `-60` upper bound did before. The grace is read via an
  // ISOLATED query with a 60-min fallback (see resolveGraceMinutes), so a
  // not-yet-migrated DB behaves identically to today (window [T-0, T+60]).
  if (minutesUntil <= 0 && !match.forfeit_processed_at) {
    const graceMinutes = await resolveGraceMinutes(
      match.tenant_id,
      match.tournament_id
    );
    const minutesSinceKickoff = -minutesUntil;
    if (minutesSinceKickoff < graceMinutes) {
      await runForfeitStep(match, result, graceMinutes);
    }
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
      .eq('tenant_id', match.tenant_id)
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
    : await getCaptainEmail(match.tenant_id, match.team1_id!);
  const team2Email = match.team2_checked_in_at
    ? null
    : await getCaptainEmail(match.tenant_id, match.team2_id!);

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
    .eq('tenant_id', match.tenant_id)
    .eq('id', match.id);

  if (markErr) {
    result.errors.push(`mark email sent: ${markErr.message}`);
    return;
  }

  result.steps.push(
    `email_sent (${[team1Email, team2Email].filter(Boolean).length} recipients)`
  );

  await emitBotEvent(
    'checkin.opened',
    {
      match_id: match.id,
      tournament_id: match.tournament?.id ?? null,
      scheduled_at: match.scheduled_at,
      teamA_name: match.team1?.name ?? null,
      teamB_name: match.team2?.name ?? null,
    },
    match.tenant_id
  ).catch((err) => logger.warn('[checkin] checkin.opened emit failed', err));
}

/**
 * Relance les équipes qui ont fait leur check-in SANS valider leur feuille.
 *
 * Le complément exact de `runReminderStep` : celui-ci pingue qui n'a pas
 * coché, celui-là pingue qui a coché et n'a rien déclaré. Sans cette relance,
 * une équipe qui confirme sa présence puis ferme l'onglet repart sans
 * composition — et le classement retombe sur le roster figé à la saisie du
 * score, ce que la feuille existe pour corriger.
 *
 * Trois précautions :
 *   1. par ÉQUIPE, marqueur compris : les deux côtés ne cochent pas au même
 *      instant, et gater sur le match laisserait la seconde sans relance ;
 *   2. rien pour qui n'a pas coché — la feuille n'est pas encore ouverte, la
 *      relancer enverrait vers une porte fermée (c'est le rappel de check-in
 *      qui s'en charge) ;
 *   3. best-effort de bout en bout : une lecture de `match_lineups` qui échoue
 *      fait sortir sans rien marquer, plutôt que de risquer un ping en double
 *      ou, pire, de faire échouer le pipeline de forfait en aval.
 */
async function runLineupReminderStep(
  match: MatchLite,
  result: ProcessStepResult,
  minutesLeft: number
): Promise<void> {
  const sides = [
    {
      teamId: match.team1_id,
      team: match.team1,
      checkedIn: match.team1_checked_in_at,
      sentAt: match.team1_lineup_reminder_sent_at,
      opponent: match.team2?.name || 'Équipe 2',
      field: 'team1_lineup_reminder_sent_at' as const,
    },
    {
      teamId: match.team2_id,
      team: match.team2,
      checkedIn: match.team2_checked_in_at,
      sentAt: match.team2_lineup_reminder_sent_at,
      opponent: match.team1?.name || 'Équipe 1',
      field: 'team2_lineup_reminder_sent_at' as const,
    },
  ].filter((s) => !!s.teamId && !!s.checkedIn && !s.sentAt);

  if (sides.length === 0) return;

  // Qui a DÉJÀ validé : ces équipes n'ont rien à faire.
  let validated = new Set<string>();
  try {
    const { data, error } = await supabaseAdmin!
      .from('match_lineups')
      .select('team_id')
      .eq('match_id', match.id)
      .eq('status', 'validated');
    if (error) {
      result.errors.push(`lineup reminder read: ${error.message}`);
      return;
    }
    validated = new Set(
      ((data || []) as { team_id?: string | null }[])
        .map((r) => r.team_id)
        .filter((id): id is string => !!id)
    );
  } catch (err) {
    result.errors.push(
      `lineup reminder read: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  const pending = sides.filter((s) => !validated.has(s.teamId as string));
  if (pending.length === 0) return;

  // Le rappel de feuille de match ouvre LE match concerné (fil du match, lot J1
  // de docs/PLAN-espace-joueur.md) et non plus la liste « Mes matchs » : à 30
  // minutes du coup d'envoi, faire chercher la bonne ligne dans une liste est
  // exactement le geste qu'on veut éviter.
  const lineupUrl = `${SITE_URL.replace(/\/$/, '')}/player/match/${match.id}`;

  await Promise.allSettled(
    pending.map((s) =>
      notifyLineupReminder({
        tournamentId: match.tournament_id,
        matchId: match.id,
        teamName: s.team?.name || 'Équipe',
        teamRoleId: s.team?.discord_role_id ?? null,
        opponentName: s.opponent,
        scheduledAt: match.scheduled_at!,
        minutesBeforeKickoff: minutesLeft,
        lineupUrl,
      })
    )
  );

  // Un UPDATE par côté : les deux marqueurs sont indépendants, et une équipe
  // relancée ne doit pas dépendre du sort de l'autre.
  for (const s of pending) {
    const { error } = await supabaseAdmin!
      .from('matches')
      .update({ [s.field]: new Date().toISOString() })
      .eq('tenant_id', match.tenant_id)
      .eq('id', match.id);
    if (error) {
      result.errors.push(`mark lineup reminder ${s.field}: ${error.message}`);
    }
  }

  result.steps.push(`lineup_reminder (${pending.length} pinged)`);
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
  const tournamentName = match.tournament?.name || "OW Women's Cup";

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

  // Email reminder ALONGSIDE the Discord ping — for captains without Discord.
  // Critical-transactional: sent unconditionally (no opt-out), like the T-60
  // email. The whole step is gated by reminder_{30,15}_sent_at, so this runs
  // exactly once per match per step (idempotent — no double-send). Each send
  // is fire-and-forget with its own try/catch so an email failure never breaks
  // the step or the downstream forfeit pipeline.
  if (!match.team1_checked_in_at && team1Token) {
    await sendReminderEmailSafely({
      tenantId: match.tenant_id,
      teamId: match.team1_id!,
      teamName: team1Name,
      opponentName: team2Name,
      scheduledAt: match.scheduled_at!,
      checkinUrl: buildCheckinUrl(team1Token),
      tournamentName,
      minutesBeforeKickoff: minutes,
    });
  }
  if (!match.team2_checked_in_at && team2Token) {
    await sendReminderEmailSafely({
      tenantId: match.tenant_id,
      teamId: match.team2_id!,
      teamName: team2Name,
      opponentName: team1Name,
      scheduledAt: match.scheduled_at!,
      checkinUrl: buildCheckinUrl(team2Token),
      tournamentName,
      minutesBeforeKickoff: minutes,
    });
  }

  const field = minutes === 30 ? 'reminder_30_sent_at' : 'reminder_15_sent_at';
  const { error } = await supabaseAdmin!
    .from('matches')
    .update({ [field]: new Date().toISOString() })
    .eq('tenant_id', match.tenant_id)
    .eq('id', match.id);

  if (error) {
    result.errors.push(`mark reminder ${minutes}: ${error.message}`);
    return;
  }

  result.steps.push(`reminder_${minutes} (${pings.length} pinged)`);
}

// Canonical motif written to matches.no_show_reason on an auto-forfeit.
export const AUTO_FORFEIT_NO_CHECKIN_REASON = 'auto_forfeit_no_checkin';

/**
 * Best-effort write of `matches.no_show_reason`.
 *
 * ⚠️ DÉGRADATION GRACIEUSE — `matches.no_show_reason` est ajoutée par une
 * migration séparée qui peut NE PAS être appliquée en prod au moment du
 * déploiement. Cette écriture est donc volontairement ISOLÉE dans son propre
 * try/catch (et son propre UPDATE) : si la colonne n'existe pas, SEULE cette
 * requête échoue — le forfait/walkover (applyMatchScore + forfeit_processed_at)
 * a déjà été appliqué avant et n'est PAS affecté. On log et on continue.
 */
async function recordNoShowReason(
  tenantId: string,
  matchId: string,
  reason: string
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin
      .from('matches')
      .update({ no_show_reason: reason })
      .eq('tenant_id', tenantId)
      .eq('id', matchId);
    if (error) {
      logger.warn('[checkin] no_show_reason write skipped:', error.message);
    }
  } catch (e) {
    logger.warn('[checkin] no_show_reason write error (column missing?):', e);
  }
}

/**
 * Resolve the forfeited team's captain email and send the forfeit notice.
 * Fire-and-forget: any failure is caught & logged so it never breaks the
 * forfeit pipeline or the cron.
 */
async function sendForfeitEmailSafely(opts: {
  tenantId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  scheduledAt: string;
  tournamentName: string;
  graceMinutes: number;
}): Promise<void> {
  try {
    const email = await getCaptainEmail(opts.tenantId, opts.teamId);
    if (!email) return;
    await sendCheckinForfeitEmail({
      to: email,
      teamName: opts.teamName,
      opponentName: opts.opponentName,
      scheduledAt: opts.scheduledAt,
      tournamentName: opts.tournamentName,
      graceMinutes: opts.graceMinutes,
    });
  } catch (e) {
    logger.error('[checkin] sendCheckinForfeitEmail error:', e);
  }
}

async function runForfeitStep(
  match: MatchLite,
  result: ProcessStepResult,
  graceMinutes: number = DEFAULT_GRACE_MINUTES
): Promise<void> {
  const team1CheckedIn = !!match.team1_checked_in_at;
  const team2CheckedIn = !!match.team2_checked_in_at;

  const team1Name = match.team1?.name || 'Équipe 1';
  const team2Name = match.team2?.name || 'Équipe 2';

  // Both teams checked in -> no action, just mark processed
  if (team1CheckedIn && team2CheckedIn) {
    await markForfeitProcessed(match.tenant_id, match.id, result);
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
      .eq('tenant_id', match.tenant_id)
      .eq('id', match.id);
    if (error) {
      result.errors.push(`cancel both: ${error.message}`);
      return;
    }
    // Best-effort motif (isolated — never blocks the cancel above).
    await recordNoShowReason(
      match.tenant_id,
      match.id,
      AUTO_FORFEIT_NO_CHECKIN_REASON
    );
    await markForfeitProcessed(match.tenant_id, match.id, result);
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
      tenantId: match.tenant_id,
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

  // Best-effort motif AFTER the critical forfeit has been applied. If the
  // column doesn't exist yet, this fails in isolation and the forfeit stands.
  await recordNoShowReason(
    match.tenant_id,
    match.id,
    AUTO_FORFEIT_NO_CHECKIN_REASON
  );

  // Discord ping for the forfeit (separate from the auto match-result ping
  // that applyMatchScore triggers — this one is on the dedicated checkin
  // channel). Enriched with the grace window (optional, backwards-compatible).
  await notifyCheckinForfeit({
    tournamentId: match.tournament_id,
    matchId: match.id,
    forfeitedTeamName: forfeitedName,
    forfeitedTeamRoleId: forfeitedRoleId,
    opponentName: winnerName,
    graceMinutes,
  }).catch((e) => logger.error('[checkin] notifyCheckinForfeit error:', e));

  // Email the forfeited team's captain. Fire-and-forget — an email failure
  // must never interrupt the cron (sendForfeitEmailSafely swallows errors).
  if (match.scheduled_at) {
    await sendForfeitEmailSafely({
      tenantId: match.tenant_id,
      teamId: forfeitTeamId,
      teamName: forfeitedName,
      opponentName: winnerName,
      scheduledAt: match.scheduled_at,
      tournamentName: match.tournament?.name || "OW Women's Cup",
      graceMinutes,
    });
  }

  await markForfeitProcessed(match.tenant_id, match.id, result);
  result.steps.push(`forfeit (${forfeitedName} -> walkover)`);
}

async function markForfeitProcessed(
  tenantId: string,
  matchId: string,
  result: ProcessStepResult
): Promise<void> {
  const { error } = await supabaseAdmin!
    .from('matches')
    .update({ forfeit_processed_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
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
  /**
   * Set to `true` when the cron short-circuited because no tournament window is
   * currently active (see `hasActiveTournamentWindow`). Purely observability —
   * a skipped run leaves `scanned/acted/errors` at 0. Absent on normal runs and
   * on the targeted admin path (which bypasses the guard).
   */
  skipped?: boolean;
};

/**
 * True s'il existe ≥1 tournoi « actif » (status ∈ published|running) dont la
 * fenêtre [start_date, end_date] chevauche [today-1j, today+1j].
 *
 * Le buffer ±1 jour couvre les matchs proches de minuit et l'écart UTC vs
 * Europe/Paris (start_date/end_date sont des DATE sans fuseau). On compare des
 * chaînes 'YYYY-MM-DD' (slice ISO) — cohérent avec le type DATE côté Postgres.
 *
 * FAIL-OPEN : si la requête échoue (colonne/réseau/exception), on retourne
 * `true` + on logge l'erreur, pour ne JAMAIS couper silencieusement le check-in
 * pendant un vrai tournoi à cause d'une erreur transitoire. La vraie sécurité
 * downstream reste la fenêtre de match (±65 min) du scanner. Le seul cas
 * renvoyant `false` sans requête est `supabaseAdmin` absent — auquel cas le
 * scanner ne tournerait de toute façon pas.
 */
export async function hasActiveTournamentWindow(
  now: Date = new Date()
): Promise<boolean> {
  if (!supabaseAdmin) return false;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const upper = new Date(now.getTime() + DAY_MS).toISOString().slice(0, 10); // today+1
  const lower = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10); // today-1

  try {
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select('id')
      .in('status', ['published', 'running'])
      .lte('start_date', upper)
      .gte('end_date', lower)
      .limit(1);

    if (error) {
      logger.error('[checkin] hasActiveTournamentWindow query error:', error);
      return true; // fail-open
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    logger.error('[checkin] hasActiveTournamentWindow exception:', e);
    return true; // fail-open
  }
}

const SELECT_FIELDS = `
  id, tenant_id, tournament_id, status, is_bye, scheduled_at,
  team1_id, team2_id,
  team1_checkin_token, team2_checkin_token,
  team1_checked_in_at, team2_checked_in_at,
  checkin_email_sent_at, reminder_30_sent_at, reminder_15_sent_at,
  team1_lineup_reminder_sent_at, team2_lineup_reminder_sent_at,
  forfeit_processed_at,
  team1:team1_id(id, name, discord_role_id),
  team2:team2_id(id, name, discord_role_id),
  tournament:tournament_id(id, name)
`;

/**
 * Scans all upcoming pending matches in a window from T-65min to T-65min late
 * (so the cron can be a few minutes off without missing anything) and runs
 * the state machine on each one.
 *
 * @param opts.tenantId Si fourni, restreint le scan a ce tenant. Sinon (cron
 *                       multi-tenant cross-tenant), on traite tous les tenants
 *                       — chaque ligne porte son propre tenant_id qui est
 *                       propage aux mutations downstream (S5a).
 */
export async function processCheckinForUpcomingMatches(opts?: {
  tournamentId?: string;
  tenantId?: string;
}): Promise<BulkProcessResult> {
  const summary: BulkProcessResult = {
    scanned: 0,
    acted: 0,
    errors: 0,
    details: [],
  };

  if (!supabaseAdmin) return summary;

  const now = new Date();

  // Garde « hors période tournoi » : le cron (sans tournamentId ciblé) ne doit
  // scanner que pendant la fenêtre d'un tournoi actif. Le chemin admin ciblé
  // (avec tournamentId) BYPASSE ce garde — il sait ce qu'il déclenche.
  if (!opts?.tournamentId) {
    const active = await hasActiveTournamentWindow(now);
    if (!active) {
      logger.info('[checkin] hors période tournoi — scan ignoré');
      return { ...summary, skipped: true };
    }
  }

  // Past edge must cover the widest possible auto-forfeit catch-up span: a
  // tournament may set checkin_grace_minutes up to GRACE_MAX (120), so a match
  // can still be forfeit-eligible up to ~that many minutes after kickoff. We
  // scan a little beyond GRACE_MAX so a late cron tick never misses it.
  const windowStart = new Date(
    now.getTime() - (GRACE_MAX + 5) * 60_000
  ).toISOString();
  const windowEnd = new Date(now.getTime() + 65 * 60_000).toISOString();

  let q = supabaseAdmin
    .from('matches')
    .select(SELECT_FIELDS)
    .eq('status', 'pending')
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd);

  if (opts?.tenantId) {
    q = q.eq('tenant_id', opts.tenantId);
  }

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
  tenantId: string,
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
    .eq('tenant_id', tenantId)
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
