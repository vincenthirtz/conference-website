// utils/dashboard/buildTournamentDashboard.ts
// Source unique de vérité pour les données du mega-dashboard.
// Réutilisé par :
//  - /api/admin/tournament/[id]/dashboard (handler HTTP)
//  - /api/admin/alerts-summary (badge navbar)
//  - getServerSideProps de /admin/tournament/[id]/dashboard (SSR pre-fetch)

import { supabaseAdmin } from '../supabase';
import { isValidUUID } from '../apiHelpers';
import { DEFAULT_TENANT_ID } from '../tenant';

import { logger } from '../logger';
/* -----------------------------------------------------------
 * Types exportés
 * ---------------------------------------------------------*/

export type StageProgress = {
  id: string;
  name: string;
  stage_type: string | null;
  order_index: number | null;
  is_active: boolean;
  totalMatches: number;
  finishedMatches: number;
  pendingMatches: number;
  ongoingMatches: number;
  cancelledMatches: number;
  teamsCount: number;
  /** Cadence : matches terminés par tranche d'1h sur les dernières 12h (du plus ancien au plus récent). */
  hourlyBuckets: number[];
};

export type UpcomingMatch = {
  id: string;
  stage_id: string | null;
  stage_name: string | null;
  round_number: number | null;
  round_name: string | null;
  scheduled_at: string | null;
  team1_name: string | null;
  team2_name: string | null;
  stream_url: string | null;
};

export type Alert = {
  type: 'warning' | 'info' | 'error';
  message: string;
};

export type DisputedMatch = {
  id: string;
  team1Name: string | null;
  team2Name: string | null;
  reason: string | null;
  openedAt: string | null;
};

export type LiveMatch = {
  id: string;
  team1Name: string | null;
  team2Name: string | null;
  team1Score: number | null;
  team2Score: number | null;
  streamUrl: string | null;
  scheduledAt: string | null;
  roundName: string | null;
  stageName: string | null;
  matchFormat: string | null;
  /** Carte en cours (déduite des picks veto à l'index team1Score+team2Score). */
  currentMap: { name: string; type: string | null; index: number } | null;
};

export type ConflictDetail = {
  teamId: string;
  teamName: string | null;
  matchAId: string;
  matchAScheduledAt: string;
  matchBId: string;
  matchBScheduledAt: string;
  overlapMinutes: number;
};

export type StageReady = { stageId: string; stageName: string };

export type StatusGuard = {
  status: string;
  label: string;
  allowed: boolean;
  reason?: string;
};

export type Velocity = {
  /** Matchs terminés par heure sur la fenêtre (windowHours). */
  matchesPerHour: number;
  /** Largeur de la fenêtre d'observation (heures). */
  windowHours: number;
  /** Nombre de matchs finis sur la fenêtre. */
  finishedInWindow: number;
  /** Nombre de matchs restants à finir (pending + ongoing, hors bye/cancelled). */
  remainingMatches: number;
  /** ISO timestamp d'ETA de fin du tournoi, ou null si pas calculable. */
  etaIso: string | null;
};

export type RecentActivity = {
  id: string;
  staffName: string | null;
  action: string;
  readableAction: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

export type TicketsBreakdown = {
  /** Total tickets ouverts pour ce tournoi. */
  totalOpen: number;
  byCategory: {
    dispute: number;
    behavior: number;
    technical: number;
    other: number;
  };
  /** Décompose par sévérité — utilisé pour la couleur de chaque tranche. */
  bySeverity: { low: number; medium: number; high: number };
};

export type DiscordWebhookStatus = {
  channelType: string;
  configured: boolean;
  active: boolean;
  /** Présent uniquement si la migration database/discord_webhook_last_post.sql est appliquée. */
  lastPostAt: string | null;
  lastPostStatus: 'ok' | 'failed' | null;
  /** "stale" = un webhook actif qui n'a pas posté depuis > 4h alors qu'on attend du trafic. */
  isStale: boolean;
};

export type DiscordHealth = {
  /** Données par channel_type, scoped au tournoi (avec fallback global webhook). */
  channels: DiscordWebhookStatus[];
  /** Combien de channels sont configurés et actifs. */
  configuredCount: number;
  /** Combien de channels manquent une config alors qu'on attend du trafic. */
  missingExpectedCount: number;
};

export type CronCheckinHeartbeat = {
  /** ISO timestamp du dernier passage du cron, ou null si jamais lancé / heartbeat manquant. */
  lastRunAt: string | null;
  /** Minutes depuis le dernier passage. null si jamais lancé. */
  minutesSince: number | null;
  /** true si > 60 min ou jamais lancé alors qu'on a des matchs imminents (next 24h). */
  isStale: boolean;
};

export type DisputeBlockingDownstream = {
  sourceMatchId: string;
  impactedMatchIds: string[];
};

export type DisputesBlockingDownstreamSignal = {
  count: number;
  impactedMatchCount: number;
  matches: DisputeBlockingDownstream[];
};

export type DashboardSignals = {
  disputesOpen: { count: number; matches: DisputedMatch[] };
  /** Lot 3 — disputes whose result has already propagated to a downstream
   *  match that is now `ongoing`/`finished`/`walkover`. Each entry breaks
   *  bracket integrity until resolved. */
  disputesBlockingDownstream: DisputesBlockingDownstreamSignal;
  checkinNext24h: {
    upcoming: number;
    bothCheckedIn: number;
    oneSide: number;
    missing: number;
    forfeited: number;
  };
  conflictsCount: number;
  /** Top 5 des conflits détaillés pour le tooltip. */
  conflictsList: ConflictDetail[];
  pendingTeamsCount: number;
  rosterLockProximity: {
    lockedAt: string | null;
    hoursLeft: number | null;
    teamsBelowMin: number;
  };
  supportHighOpen: number;
  activeMvpPolls: number;
  stagesReadyToAdvance: StageReady[];
  liveMatches: LiveMatch[];
  velocity: Velocity;
  recentActivity: RecentActivity[];
  tickets: TicketsBreakdown;
  discordHealth: DiscordHealth;
  cronCheckin: CronCheckinHeartbeat;
};

export type DashboardData = {
  tournament: {
    id: string;
    name: string;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    timezone: string | null;
    format: string | null;
    min_players: number | null;
    max_teams: number | null;
    roster_locked_at: string | null;
  };
  summary: {
    totalTeams: number;
    totalMatches: number;
    finishedMatches: number;
    pendingMatches: number;
    ongoingMatches: number;
    completionPercent: number;
    eliminatedTeams: number;
    activeTeams: number;
  };
  stages: StageProgress[];
  upcomingMatches: UpcomingMatch[];
  alerts: Alert[];
  signals: DashboardSignals;
  guards: { current_status: string; guards: StatusGuard[] };
  /** Date de calcul du dashboard (utile pour mesurer la fraîcheur côté UI). */
  generatedAt: string;
};

export type DashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; status: 400 | 404 | 500; error: string };

/* -----------------------------------------------------------
 * Constantes internes
 * ---------------------------------------------------------*/

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  running: 'En cours',
  completed: 'Terminé',
  archived: 'Archivé',
};

const MATCH_DURATION_MIN: Record<string, number> = {
  bo1: 20,
  bo2: 30,
  bo3: 45,
  bo5: 70,
  bo7: 95,
};

/** Fenêtre par défaut pour la vélocité (heures). */
const VELOCITY_WINDOW_HOURS = 6;

/** Mapping minimal action → libellé FR (cf. utils/staffLogs.ts pour la liste complète). */
const STAFF_ACTION_LABEL: Record<string, string> = {
  login: 'Connexion',
  logout: 'Déconnexion',
  view_admin_page: 'Vue page admin',
  create_tournament: 'Création tournoi',
  update_tournament: 'Modification tournoi',
  delete_tournament: 'Suppression tournoi',
  create_stage: 'Création phase',
  update_stage: 'Modification phase',
  delete_stage: 'Suppression phase',
  create_match: 'Création match',
  update_match: 'Modification match',
  delete_match: 'Suppression match',
  update_bracket: 'Mise à jour bracket',
  update_scores: 'Mise à jour scores',
  staff_batch_action: 'Action batch',
  manage_team: 'Action équipe',
  update_team: 'Modification équipe',
  delete_team: 'Suppression équipe',
  tournament_update: 'Mise à jour tournoi',
  create_swiss_round: 'Création round swiss',
  advance_teams: 'Avancement équipes',
  apply_template: 'Application template',
  clone_stage: 'Clonage phase',
  auto_seed_bracket: 'Seeding auto',
  update_group_assignments: 'MAJ groupes',
  auto_distribute_groups: 'Distribution auto',
  bulk_schedule: 'Planif batch',
  bulk_update: 'Modif batch',
  map_veto: 'Veto maps',
  update_discord_webhook: 'Webhook Discord',
  delete_discord_webhook: 'Suppr webhook Discord',
  update_support_ticket: 'Ticket support',
  import_mvp: 'MVP importé',
  open_match_dispute: 'Ouverture dispute',
  resolve_match_dispute: 'Résolution dispute',
  cancel_match_dispute: 'Annulation dispute',
  auto_advance_stage: 'Auto-advance phase',
  generate_group_matches: 'Gén. matchs poule',
  other: 'Action staff',
};

/* -----------------------------------------------------------
 * Helpers de calcul PURS (partagés builder ↔ chemin léger)
 *
 * Ces fonctions ne font AUCUN accès DB : elles prennent les lignes déjà
 * chargées et renvoient un signal. Le builder complet ET le chemin léger
 * `fetchAlertsSignals` les réutilisent, ce qui GARANTIT que les compteurs du
 * badge navbar sont strictement identiques à ceux du dashboard.
 * ---------------------------------------------------------*/

/** Colonnes minimales lues par la détection de conflits d'horaire. */
export type ConflictMatchInput = {
  id: string;
  status: string | null;
  scheduled_at: string | null;
  is_bye: boolean | null;
  match_format: string | null;
  team1_id: string | null;
  team2_id: string | null;
};

/**
 * Détecte les chevauchements de créneaux pour une même équipe.
 * `count` = nombre total de conflits ; `list` = top 5 détaillés (tooltip).
 * `teamNameMap` est optionnel : le chemin léger n'a pas besoin des noms (il
 * ne consomme que `count`), le builder passe sa map pour enrichir la liste.
 */
export function computeScheduleConflicts(
  matches: ConflictMatchInput[],
  teamNameMap?: Map<string, string>
): { count: number; list: ConflictDetail[] } {
  const nameMap = teamNameMap ?? new Map<string, string>();
  const teamMatchSlots = new Map<
    string,
    { id: string; start: number; end: number }[]
  >();
  for (const m of matches) {
    if (m.is_bye || m.status === 'cancelled' || !m.scheduled_at) continue;
    const fmt = (m.match_format || 'bo3') as string;
    const dur = MATCH_DURATION_MIN[fmt] ?? 45;
    const start = new Date(m.scheduled_at).getTime();
    const end = start + dur * 60_000;
    for (const tid of [m.team1_id, m.team2_id]) {
      if (!tid) continue;
      const arr = teamMatchSlots.get(tid) ?? [];
      arr.push({ id: m.id, start, end });
      teamMatchSlots.set(tid, arr);
    }
  }
  let count = 0;
  const list: ConflictDetail[] = [];
  for (const [teamId, slots] of teamMatchSlots) {
    slots.sort((a, b) => a.start - b.start);
    for (let i = 0; i < slots.length - 1; i++) {
      if (slots[i].end > slots[i + 1].start) {
        count++;
        if (list.length < 5) {
          const overlapMs = slots[i].end - slots[i + 1].start;
          list.push({
            teamId,
            teamName: nameMap.get(teamId) ?? null,
            matchAId: slots[i].id,
            matchAScheduledAt: new Date(slots[i].start).toISOString(),
            matchBId: slots[i + 1].id,
            matchBScheduledAt: new Date(slots[i + 1].start).toISOString(),
            overlapMinutes: Math.max(1, Math.round(overlapMs / 60_000)),
          });
        }
      }
    }
  }
  return { count, list };
}

/** Colonnes minimales lues par le calcul check-in 24h. */
export type CheckinMatchInput = {
  is_bye: boolean | null;
  status: string | null;
  scheduled_at: string | null;
  forfeit_processed_at: string | null;
  team1_checked_in_at: string | null;
  team2_checked_in_at: string | null;
};

/** Compte les matchs à venir (fenêtre -30min → +24h) par état de check-in. */
export function computeCheckin24h(
  matches: CheckinMatchInput[],
  nowMs: number
): DashboardSignals['checkinNext24h'] {
  const checkin24h = {
    upcoming: 0,
    bothCheckedIn: 0,
    oneSide: 0,
    missing: 0,
    forfeited: 0,
  };
  for (const m of matches) {
    if (m.is_bye) continue;
    if (!m.scheduled_at) continue;
    const at = new Date(m.scheduled_at).getTime();
    if (at < nowMs - 30 * 60_000) continue;
    if (at > nowMs + 24 * 60 * 60_000) continue;
    if (m.status === 'cancelled') continue;
    checkin24h.upcoming++;
    if (m.forfeit_processed_at) {
      checkin24h.forfeited++;
      continue;
    }
    const t1 = !!m.team1_checked_in_at;
    const t2 = !!m.team2_checked_in_at;
    if (t1 && t2) checkin24h.bothCheckedIn++;
    else if (t1 || t2) checkin24h.oneSide++;
    else checkin24h.missing++;
  }
  return checkin24h;
}

/**
 * Proximité du roster lock. `hoursLeft` ne dépend que de `rosterLockedAt` et
 * `nowMs` ; `teamsBelowMin` (non utilisé par le badge) dépend de min_players +
 * membres. Le chemin léger passe des tableaux vides pour éviter de charger
 * team_members, ce qui n'affecte QUE `teamsBelowMin`, pas le badge.
 */
export function computeRosterLockProximity(params: {
  rosterLockedAt: string | null;
  minPlayers: number | null;
  nowMs: number;
  registeredTeamIds: string[];
  memberRows: { team_id: string }[];
}): DashboardSignals['rosterLockProximity'] {
  const { rosterLockedAt, minPlayers, nowMs, registeredTeamIds, memberRows } =
    params;
  const proximity: DashboardSignals['rosterLockProximity'] = {
    lockedAt: rosterLockedAt,
    hoursLeft: null,
    teamsBelowMin: 0,
  };
  if (rosterLockedAt) {
    const lockTs = new Date(rosterLockedAt).getTime();
    const diffMs = lockTs - nowMs;
    proximity.hoursLeft = diffMs > 0 ? Math.ceil(diffMs / 3_600_000) : 0;

    if (minPlayers && minPlayers > 0 && diffMs > 0) {
      const counts = new Map<string, number>();
      for (const r of memberRows) {
        counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1);
      }
      let below = 0;
      for (const teamId of new Set(registeredTeamIds)) {
        if ((counts.get(teamId) ?? 0) < minPlayers) below++;
      }
      proximity.teamsBelowMin = below;
    }
  }
  return proximity;
}

/**
 * Une phase est "prête à avancer" (côté complétion des matchs) quand elle est
 * active, contient au moins un match, et tous ses matchs sont finished ou
 * cancelled. Partagé pour éviter toute divergence de comptage.
 */
export function isStageMatchesComplete(sp: {
  is_active: boolean;
  totalMatches: number;
  finishedMatches: number;
  cancelledMatches: number;
}): boolean {
  return (
    sp.is_active &&
    sp.totalMatches > 0 &&
    sp.finishedMatches + sp.cancelledMatches === sp.totalMatches
  );
}

/** Les `settings` d'une phase portent-ils des règles d'avancement valides ? */
export function hasValidAdvancementRules(settings: unknown): boolean {
  const rules = (settings as { advancement_rules?: unknown } | null)
    ?.advancement_rules as
    | {
        target_stage_id?: unknown;
        advance_top?: unknown;
        advance_per_group?: unknown;
      }
    | undefined;
  return !!(
    rules &&
    rules.target_stage_id &&
    (rules.advance_top || rules.advance_per_group)
  );
}

/**
 * Chemin léger : dérive la liste des phases prêtes à avancer directement à
 * partir des phases (avec `settings`) et des matchs. Réplique EXACTEMENT la
 * logique du builder (isStageMatchesComplete + hasValidAdvancementRules) mais
 * en une seule passe, sans requête settings séparée.
 */
export function computeStagesReadyToAdvance(
  stages: {
    id: string;
    name: string;
    is_active: boolean;
    settings?: unknown;
  }[],
  matches: { stage_id: string | null; status: string | null }[]
): StageReady[] {
  const perStage = new Map<
    string,
    { totalMatches: number; finishedMatches: number; cancelledMatches: number }
  >();
  for (const m of matches) {
    if (!m.stage_id) continue;
    const c = perStage.get(m.stage_id) ?? {
      totalMatches: 0,
      finishedMatches: 0,
      cancelledMatches: 0,
    };
    c.totalMatches++;
    if (m.status === 'finished') c.finishedMatches++;
    else if (m.status === 'cancelled') c.cancelledMatches++;
    perStage.set(m.stage_id, c);
  }
  const ready: StageReady[] = [];
  for (const s of stages) {
    const c = perStage.get(s.id) ?? {
      totalMatches: 0,
      finishedMatches: 0,
      cancelledMatches: 0,
    };
    if (!isStageMatchesComplete({ is_active: s.is_active, ...c })) continue;
    if (!hasValidAdvancementRules(s.settings)) continue;
    ready.push({ stageId: s.id, stageName: s.name });
  }
  return ready;
}

/* -----------------------------------------------------------
 * Calcul principal
 * ---------------------------------------------------------*/

/**
 * Construit le payload complet du dashboard pour un tournoi.
 * Renvoie un résultat typé avec un statut HTTP recommandé en cas d'erreur,
 * pour permettre aux callers (route API ou SSR) de propager l'état.
 *
 * **Multi-tenant (S5c)** : `tenantId` est optionnel par compat ; en V1 mono-tenant,
 * les callers passent `ctx.tenantId` (admin) ou `DEFAULT_TENANT_ID` (SSR). Toutes
 * les sous-queries scopent par tenant pour eviter une fuite de donnees entre tenants.
 */
export async function fetchDashboardData(
  tournamentId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<DashboardResult> {
  if (!tournamentId || !isValidUUID(tournamentId)) {
    return { ok: false, status: 400, error: 'Invalid tournament id' };
  }

  if (!supabaseAdmin) {
    return {
      ok: false,
      status: 500,
      error: 'Database service unavailable (missing service role).',
    };
  }

  try {
    // Tournament
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select(
        'id, name, status, start_date, end_date, timezone, format, min_players, max_teams, roster_locked_at'
      )
      .eq('id', tournamentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (tErr || !tournament) {
      return { ok: false, status: 404, error: 'Tournament not found' };
    }

    // Stages, matches et tournament teams sont indépendants une fois le tournoi
    // validé → chargement en parallèle pour raccourcir le chemin critique
    // (ce builder tourne aussi en getServerSideProps, donc bloque le TTFB).
    const [stagesRes, matchesRes, tournamentTeamsRes] = await Promise.all([
      supabaseAdmin
        .from('tournament_stages')
        .select('id, name, stage_type, order_index, is_active')
        .eq('tournament_id', tournamentId)
        .eq('tenant_id', tenantId)
        .order('order_index', { ascending: true }),
      // Matches (with everything we need for signals)
      supabaseAdmin
        .from('matches')
        .select(
          `id, stage_id, status, round_number, round_name, scheduled_at, stream_url,
         team1_id, team2_id, winner_team_id, is_bye, bracket_side,
         match_format, team1_score, team2_score,
         dispute_reason, dispute_opened_at,
         next_match_win_id, next_match_win_slot,
         next_match_lose_id, next_match_lose_slot,
         team1_checked_in_at, team2_checked_in_at, forfeit_processed_at,
         completed_at`
        )
        .eq('tournament_id', tournamentId)
        .eq('tenant_id', tenantId),
      supabaseAdmin
        .from('tournament_teams')
        .select('team_id, status')
        .eq('tournament_id', tournamentId)
        .eq('tenant_id', tenantId),
    ]);

    const stages = stagesRes.data || [];
    const matches = matchesRes.data || [];
    const tournamentTeams = tournamentTeamsRes.data || [];

    // Stage teams counts
    const stageTeamCounts = new Map<string, number>();
    if (stages.length > 0) {
      const stageIds = stages.map((s) => s.id);
      const { data: stageTeamsData } = await supabaseAdmin
        .from('stage_teams')
        .select('stage_id')
        .eq('tenant_id', tenantId)
        .in('stage_id', stageIds);
      for (const row of stageTeamsData || []) {
        stageTeamCounts.set(
          row.stage_id,
          (stageTeamCounts.get(row.stage_id) ?? 0) + 1
        );
      }
    }

    // Stage progress (avec sparkline 12h)
    const SPARKLINE_HOURS = 12;
    const sparklineNowMs = Date.now();
    const sparklineStartMs = sparklineNowMs - SPARKLINE_HOURS * 3_600_000;

    const stageProgress: StageProgress[] = stages.map((s) => {
      const stageMatches = matches.filter((m) => m.stage_id === s.id);
      // Buckets : index 0 = heure la plus ancienne, index 11 = dernière heure pleine
      const buckets = new Array(SPARKLINE_HOURS).fill(0) as number[];
      for (const m of stageMatches) {
        if (m.status !== 'finished' || !m.completed_at) continue;
        const ts = new Date(m.completed_at).getTime();
        if (ts < sparklineStartMs || ts > sparklineNowMs) continue;
        const idx = Math.min(
          SPARKLINE_HOURS - 1,
          Math.floor((ts - sparklineStartMs) / 3_600_000)
        );
        buckets[idx]++;
      }
      return {
        id: s.id,
        name: s.name,
        stage_type: s.stage_type,
        order_index: s.order_index,
        is_active: s.is_active,
        totalMatches: stageMatches.length,
        finishedMatches: stageMatches.filter((m) => m.status === 'finished')
          .length,
        pendingMatches: stageMatches.filter((m) => m.status === 'pending')
          .length,
        ongoingMatches: stageMatches.filter((m) => m.status === 'ongoing')
          .length,
        cancelledMatches: stageMatches.filter((m) => m.status === 'cancelled')
          .length,
        teamsCount: stageTeamCounts.get(s.id) ?? 0,
        hourlyBuckets: buckets,
      };
    });

    // Summary
    const totalMatches = matches.filter((m) => m.status !== 'cancelled').length;
    const finishedMatches = matches.filter(
      (m) => m.status === 'finished'
    ).length;
    const pendingMatches = matches.filter((m) => m.status === 'pending').length;
    const ongoingMatches = matches.filter((m) => m.status === 'ongoing').length;

    // Eliminated teams
    const teamsWithLoss = new Set<string>();
    const teamsWithUpcoming = new Set<string>();
    for (const m of matches) {
      if (m.status === 'finished' && m.winner_team_id && !m.is_bye) {
        const loserId =
          m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id;
        if (loserId) teamsWithLoss.add(loserId);
      }
      if (m.status === 'pending' || m.status === 'ongoing') {
        if (m.team1_id) teamsWithUpcoming.add(m.team1_id);
        if (m.team2_id) teamsWithUpcoming.add(m.team2_id);
      }
    }
    const eliminatedTeams = new Set<string>();
    for (const teamId of teamsWithLoss) {
      if (!teamsWithUpcoming.has(teamId)) eliminatedTeams.add(teamId);
    }
    const totalTeams = tournamentTeams.length;
    const activeTeams = totalTeams - eliminatedTeams.size;

    // Upcoming matches
    const upcoming = matches
      .filter((m) => m.status === 'pending' || m.status === 'ongoing')
      .sort((a, b) => {
        if (!a.scheduled_at && !b.scheduled_at) return 0;
        if (!a.scheduled_at) return 1;
        if (!b.scheduled_at) return -1;
        return (
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime()
        );
      })
      .slice(0, 10);

    // Team name map (covers upcoming + disputed + live)
    const teamIds = new Set<string>();
    for (const m of upcoming) {
      if (m.team1_id) teamIds.add(m.team1_id);
      if (m.team2_id) teamIds.add(m.team2_id);
    }
    for (const m of matches) {
      if (m.status === 'disputed' || m.status === 'ongoing') {
        if (m.team1_id) teamIds.add(m.team1_id);
        if (m.team2_id) teamIds.add(m.team2_id);
      }
    }
    const teamNameMap = new Map<string, string>();
    if (teamIds.size > 0) {
      const { data: teamsData } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .in('id', Array.from(teamIds));
      for (const t of teamsData || []) teamNameMap.set(t.id, t.name);
    }
    const stageNameMap = new Map<string, string>();
    for (const s of stages) stageNameMap.set(s.id, s.name);

    const upcomingMatches: UpcomingMatch[] = upcoming.map((m) => ({
      id: m.id,
      stage_id: m.stage_id,
      stage_name: m.stage_id ? (stageNameMap.get(m.stage_id) ?? null) : null,
      round_number: m.round_number,
      round_name: m.round_name,
      scheduled_at: m.scheduled_at,
      team1_name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? null) : null,
      team2_name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? null) : null,
      stream_url: m.stream_url,
    }));

    // Alerts (héritées)
    const alerts: Alert[] = [];
    const noStreamCount = matches.filter(
      (m) =>
        (m.status === 'pending' || m.status === 'ongoing') &&
        !m.stream_url &&
        !m.is_bye
    ).length;
    if (noStreamCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${noStreamCount} match(s) a venir sans stream attribue.`,
      });
    }
    const missingTeamsCount = matches.filter(
      (m) => m.status === 'pending' && !m.is_bye && (!m.team1_id || !m.team2_id)
    ).length;
    if (missingTeamsCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${missingTeamsCount} match(s) en attente sans equipe(s) assignee(s).`,
      });
    }
    const now = new Date();
    const overdueCount = matches.filter(
      (m) =>
        m.status === 'pending' &&
        m.scheduled_at &&
        new Date(m.scheduled_at) < now
    ).length;
    if (overdueCount > 0) {
      alerts.push({
        type: 'error',
        message: `${overdueCount} match(s) en retard (heure programmee depassee).`,
      });
    }
    for (const sp of stageProgress) {
      if (!sp.is_active && sp.pendingMatches > 0) {
        alerts.push({
          type: 'info',
          message: `Stage "${sp.name}" est inactive mais contient ${sp.pendingMatches} match(s) en attente.`,
        });
      }
    }

    const completionPercent =
      totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

    /* -----------------------------------------------------------
     * Signaux actionnables (parallélisés)
     * ---------------------------------------------------------*/

    const NOW_MS = Date.now();

    const [
      pendingTeamsCountRes,
      supportHighRes,
      activeMvpPollsRes,
      teamMembersCountRes,
      recentLogsRes,
      ticketsBreakdownRes,
      discordWebhooksRes,
      cronHeartbeatRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('tournament_teams')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('tenant_id', tenantId)
        .eq('status', 'pending'),
      supabaseAdmin
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('severity', 'high')
        .eq('status', 'open'),
      supabaseAdmin
        .from('match_mvp_polls')
        .select('match_id, matches!inner(tournament_id)')
        .eq('tenant_id', tenantId)
        .is('winner_member_id', null)
        .eq('matches.tournament_id', tournamentId),
      tournament.min_players && tournament.roster_locked_at
        ? supabaseAdmin
            .from('team_members')
            .select('team_id, tournament_teams!inner(tournament_id)')
            .eq('tenant_id', tenantId)
            .eq('tournament_teams.tournament_id', tournamentId)
        : Promise.resolve({ data: null }),
      // Recent staff activity for this tournament (last 10 entries)
      supabaseAdmin
        .from('staff_logs')
        .select(
          `
          id, action, entity_type, entity_id, created_at,
          staff:staff!fk_staff_logs_staff(display_name)
          `
        )
        .eq('tournament_id', tournamentId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10),
      // Tickets ouverts pour le donut (catégorie + sévérité) — support_tickets
      // n'a pas de tenant_id (table globale).
      supabaseAdmin
        .from('support_tickets')
        .select('category, severity')
        .eq('tournament_id', tournamentId)
        .eq('status', 'open'),
      // Discord webhooks scoped au tournoi + globals (fallback)
      // On tente de lire last_post_at / last_post_status si la migration database/discord_webhook_last_post.sql
      // est appliquée ; sinon on dégrade gracieusement (PGRST204).
      supabaseAdmin
        .from('discord_webhooks')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(`tournament_id.eq.${tournamentId},tournament_id.is.null`),
      // Heartbeat du cron checkin (clé site_settings : last_cron_checkin_at)
      supabaseAdmin
        .from('site_settings')
        .select('value, updated_at')
        .eq('tenant_id', tenantId)
        .eq('key', 'last_cron_checkin_at')
        .maybeSingle(),
    ]);

    // Disputes
    const disputedRows = matches.filter((m) => m.status === 'disputed');
    const disputedMatches: DisputedMatch[] = disputedRows
      .slice(0, 10)
      .map((m) => ({
        id: m.id,
        team1Name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? null) : null,
        team2Name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? null) : null,
        reason: m.dispute_reason ?? null,
        openedAt: m.dispute_opened_at ?? null,
      }));

    // Disputes "qui bloquent l'aval" (Lot 3 — bracket propagation guards).
    // Pour chaque match en dispute, on regarde s'il a propagé vers un match
    // déjà ongoing/finished/walkover ET si ce slot porte toujours une de ses
    // équipes. Si oui, le dispute est figé : on ne peut pas le résoudre sans
    // toucher un match en cours. Le banner dashboard signale ça aux staff.
    const matchById = new Map<string, (typeof matches)[number]>();
    for (const m of matches) matchById.set(m.id, m);
    const liveStatusesForBlock = new Set<string>([
      'ongoing',
      'finished',
      'walkover',
    ]);
    const blockingDownstreamMatches: {
      sourceMatchId: string;
      impactedMatchIds: string[];
    }[] = [];
    for (const d of disputedRows) {
      const teamsOfDispute = new Set<string>();
      if (d.team1_id) teamsOfDispute.add(d.team1_id);
      if (d.team2_id) teamsOfDispute.add(d.team2_id);
      const impacted: string[] = [];

      const winId = (d as any).next_match_win_id as string | null | undefined;
      const winSlot = (d as any).next_match_win_slot as
        | 1
        | 2
        | null
        | undefined;
      if (winId && winSlot) {
        const wm = matchById.get(winId);
        if (wm && liveStatusesForBlock.has(wm.status)) {
          const slotTeam = winSlot === 1 ? wm.team1_id : wm.team2_id;
          if (slotTeam && teamsOfDispute.has(slotTeam)) impacted.push(wm.id);
        }
      }

      const loseId = (d as any).next_match_lose_id as string | null | undefined;
      const loseSlot = (d as any).next_match_lose_slot as
        | 1
        | 2
        | null
        | undefined;
      if (loseId && loseSlot) {
        const lm = matchById.get(loseId);
        if (lm && liveStatusesForBlock.has(lm.status)) {
          const slotTeam = loseSlot === 1 ? lm.team1_id : lm.team2_id;
          if (slotTeam && teamsOfDispute.has(slotTeam)) impacted.push(lm.id);
        }
      }

      if (impacted.length > 0) {
        blockingDownstreamMatches.push({
          sourceMatchId: d.id,
          impactedMatchIds: impacted,
        });
      }
    }
    const disputesBlockingDownstream = {
      count: blockingDownstreamMatches.length,
      impactedMatchCount: blockingDownstreamMatches.reduce(
        (acc, b) => acc + b.impactedMatchIds.length,
        0
      ),
      matches: blockingDownstreamMatches.slice(0, 10),
    };

    // Live matches — enrichis avec la map en cours (déduit des picks veto)
    const liveMatchesRows = matches.filter((m) => m.status === 'ongoing');
    const liveMatchPicks = new Map<
      string,
      { mapName: string; mapType: string | null; stepNumber: number }[]
    >();
    if (liveMatchesRows.length > 0) {
      const liveIds = liveMatchesRows.map((m) => m.id);
      const { data: vetoSteps } = await supabaseAdmin
        .from('match_map_vetos')
        .select('match_id, action, map_name, map_type, step_number')
        .eq('tenant_id', tenantId)
        .in('match_id', liveIds)
        .in('action', ['pick', 'decider'])
        .order('step_number', { ascending: true });
      for (const step of vetoSteps || []) {
        const arr = liveMatchPicks.get(step.match_id) ?? [];
        arr.push({
          mapName: step.map_name,
          mapType: step.map_type ?? null,
          stepNumber: step.step_number,
        });
        liveMatchPicks.set(step.match_id, arr);
      }
    }
    const liveMatches: LiveMatch[] = liveMatchesRows.map((m) => {
      const picks = liveMatchPicks.get(m.id) ?? [];
      // La carte en cours = pick à l'index (team1Score + team2Score). Si l'index
      // dépasse les picks disponibles, le veto n'est pas (encore) finalisé.
      const playedCount = (m.team1_score ?? 0) + (m.team2_score ?? 0);
      const currentPick = picks[playedCount] ?? null;
      return {
        id: m.id,
        team1Name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? null) : null,
        team2Name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? null) : null,
        team1Score: m.team1_score ?? null,
        team2Score: m.team2_score ?? null,
        streamUrl: m.stream_url ?? null,
        scheduledAt: m.scheduled_at ?? null,
        roundName: m.round_name ?? null,
        stageName: m.stage_id ? (stageNameMap.get(m.stage_id) ?? null) : null,
        matchFormat: m.match_format ?? null,
        currentMap: currentPick
          ? {
              name: currentPick.mapName,
              type: currentPick.mapType,
              index: playedCount + 1,
            }
          : null,
      };
    });

    // Check-in 24h (helper pur partagé avec le chemin léger du badge)
    const checkin24h = computeCheckin24h(matches, NOW_MS);

    // Conflits — count + short-list (top 5) via le helper pur partagé.
    const { count: conflictsCount, list: conflictsList } =
      computeScheduleConflicts(matches, teamNameMap);
    // Pour les conflits sans nom d'équipe, on essaye de combler
    const missingConflictTeamIds = conflictsList
      .filter((c) => !c.teamName)
      .map((c) => c.teamId);
    if (missingConflictTeamIds.length > 0) {
      const { data: extraTeams } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .in('id', missingConflictTeamIds);
      const extraMap = new Map<string, string>();
      for (const t of extraTeams || []) extraMap.set(t.id, t.name);
      for (const c of conflictsList) {
        if (!c.teamName) c.teamName = extraMap.get(c.teamId) ?? null;
      }
    }

    // Roster lock proximity (helper pur partagé avec le chemin léger du badge)
    const rosterLockProximity = computeRosterLockProximity({
      rosterLockedAt: tournament.roster_locked_at ?? null,
      minPlayers: tournament.min_players ?? null,
      nowMs: NOW_MS,
      registeredTeamIds: tournamentTeams
        .map((tt) => tt.team_id)
        .filter((x): x is string => !!x),
      memberRows: (teamMembersCountRes.data ?? []) as { team_id: string }[],
    });

    // Stages prêts à advance — mêmes prédicats partagés que le chemin léger.
    const stagesReadyToAdvance: StageReady[] = [];
    const candidateStageIds = stageProgress
      .filter(isStageMatchesComplete)
      .map((sp) => sp.id);
    if (candidateStageIds.length > 0) {
      const { data: stageSettings } = await supabaseAdmin
        .from('tournament_stages')
        .select('id, name, settings')
        .eq('tenant_id', tenantId)
        .in('id', candidateStageIds);
      for (const s of stageSettings || []) {
        if (hasValidAdvancementRules((s as any).settings)) {
          stagesReadyToAdvance.push({ stageId: s.id, stageName: s.name });
        }
      }
    }

    // Status guards
    const stageCount = stages.length;
    const teamCount = tournamentTeams.length;
    const nonCancelledMatches = matches.filter(
      (m) => m.status !== 'cancelled'
    ).length;
    const currentStatus = tournament.status ?? 'draft';
    const guardList: StatusGuard[] = [
      { status: 'draft', label: STATUS_LABELS.draft, allowed: true },
      {
        status: 'published',
        label: STATUS_LABELS.published,
        allowed: stageCount > 0,
        reason: stageCount > 0 ? undefined : 'Aucune phase configurée',
      },
      {
        status: 'running',
        label: STATUS_LABELS.running,
        allowed: stageCount > 0 && teamCount > 0,
        reason:
          stageCount > 0 && teamCount > 0
            ? undefined
            : stageCount === 0
              ? 'Aucune phase'
              : 'Aucune équipe inscrite',
      },
      {
        status: 'completed',
        label: STATUS_LABELS.completed,
        allowed:
          nonCancelledMatches > 0 && finishedMatches === nonCancelledMatches,
        reason:
          nonCancelledMatches > 0 && finishedMatches === nonCancelledMatches
            ? undefined
            : `Il reste ${nonCancelledMatches - finishedMatches} match(s) non terminé(s)`,
      },
      { status: 'archived', label: STATUS_LABELS.archived, allowed: true },
    ];

    /* -----------------------------------------------------------
     * Vélocité + ETA
     * ---------------------------------------------------------*/

    const windowStartMs = NOW_MS - VELOCITY_WINDOW_HOURS * 3_600_000;
    const finishedInWindow = matches.filter((m) => {
      if (m.status !== 'finished' || !m.completed_at) return false;
      const ts = new Date(m.completed_at).getTime();
      return ts >= windowStartMs && ts <= NOW_MS;
    }).length;

    const matchesPerHour = finishedInWindow / VELOCITY_WINDOW_HOURS;
    const remainingMatches = matches.filter(
      (m) => (m.status === 'pending' || m.status === 'ongoing') && !m.is_bye
    ).length;

    let etaIso: string | null = null;
    if (matchesPerHour > 0 && remainingMatches > 0) {
      const hoursToFinish = remainingMatches / matchesPerHour;
      etaIso = new Date(NOW_MS + hoursToFinish * 3_600_000).toISOString();
    } else if (remainingMatches === 0) {
      // Tournoi terminé : on ne renvoie pas d'ETA.
      etaIso = null;
    }

    const velocity: Velocity = {
      matchesPerHour: Math.round(matchesPerHour * 10) / 10, // 1 décimale
      windowHours: VELOCITY_WINDOW_HOURS,
      finishedInWindow,
      remainingMatches,
      etaIso,
    };

    /* -----------------------------------------------------------
     * Recent staff activity
     * ---------------------------------------------------------*/

    const recentActivity: RecentActivity[] = (recentLogsRes.data ?? []).map(
      (row: any) => {
        const staffRel = Array.isArray(row.staff) ? row.staff[0] : row.staff;
        return {
          id: row.id,
          staffName: staffRel?.display_name ?? null,
          action: row.action,
          readableAction:
            STAFF_ACTION_LABEL[row.action as string] ?? (row.action as string),
          entityType: row.entity_type ?? null,
          entityId: row.entity_id ?? null,
          createdAt: row.created_at,
        };
      }
    );

    /* -----------------------------------------------------------
     * Tickets breakdown (donut)
     * ---------------------------------------------------------*/

    const ticketRows = (ticketsBreakdownRes.data ?? []) as {
      category: 'dispute' | 'behavior' | 'technical' | 'other';
      severity: 'low' | 'medium' | 'high';
    }[];
    const tickets: TicketsBreakdown = {
      totalOpen: ticketRows.length,
      byCategory: { dispute: 0, behavior: 0, technical: 0, other: 0 },
      bySeverity: { low: 0, medium: 0, high: 0 },
    };
    for (const t of ticketRows) {
      if (t.category && t.category in tickets.byCategory) {
        tickets.byCategory[t.category]++;
      }
      if (t.severity && t.severity in tickets.bySeverity) {
        tickets.bySeverity[t.severity]++;
      }
    }

    /* -----------------------------------------------------------
     * Discord webhook health
     * ---------------------------------------------------------*/

    const VALID_DISCORD_CHANNELS = [
      'match_announcements',
      'match_results',
      'bracket_updates',
      'general_announcements',
      'veto_live',
      'checkin_reminders',
      'support_tickets',
      'mvp_polls',
    ] as const;

    const webhookRows = (discordWebhooksRes.data ?? []) as {
      tournament_id: string | null;
      channel_type: string;
      is_active: boolean | null;
      last_post_at?: string | null;
      last_post_status?: 'ok' | 'failed' | null;
    }[];

    // Quels channels devrait-on attendre du trafic dessus ?
    const expectsTraffic = (channel: string): boolean => {
      switch (channel) {
        case 'match_results':
          return finishedMatches > 0;
        case 'match_announcements':
        case 'bracket_updates':
          return ongoingMatches > 0 || finishedMatches > 0;
        case 'checkin_reminders':
          return checkin24h.upcoming > 0;
        case 'mvp_polls':
          return finishedMatches > 0;
        default:
          return false; // veto/support/general → on ne flag pas comme stale
      }
    };

    const STALE_HOURS = 4;
    const channels: DiscordWebhookStatus[] = VALID_DISCORD_CHANNELS.map(
      (channelType) => {
        // Préfère le webhook scoped au tournoi, sinon le global, sinon non configuré
        const scoped = webhookRows.find(
          (w) =>
            w.channel_type === channelType && w.tournament_id === tournamentId
        );
        const global = webhookRows.find(
          (w) => w.channel_type === channelType && w.tournament_id === null
        );
        const row = scoped ?? global;

        const lastPostAt = row?.last_post_at ?? null;
        const lastPostStatus = row?.last_post_status ?? null;
        const active = !!row?.is_active;

        let isStale = false;
        if (active && expectsTraffic(channelType)) {
          if (!lastPostAt) {
            // On ne peut pas affirmer "stale" sans la migration appliquée — on reste discret.
            isStale = false;
          } else {
            const ageMs = NOW_MS - new Date(lastPostAt).getTime();
            isStale = ageMs > STALE_HOURS * 3_600_000;
          }
        }

        return {
          channelType,
          configured: !!row,
          active,
          lastPostAt,
          lastPostStatus,
          isStale,
        };
      }
    );

    const discordHealth: DiscordHealth = {
      channels,
      configuredCount: channels.filter((c) => c.configured && c.active).length,
      missingExpectedCount: channels.filter(
        (c) => expectsTraffic(c.channelType) && (!c.configured || !c.active)
      ).length,
    };

    /* -----------------------------------------------------------
     * Cron checkin heartbeat
     * ---------------------------------------------------------*/

    const heartbeatRow = cronHeartbeatRes.data as {
      value: string | null;
      updated_at: string | null;
    } | null;
    const heartbeatIso =
      heartbeatRow?.value ?? heartbeatRow?.updated_at ?? null;
    let cronMinutesSince: number | null = null;
    if (heartbeatIso) {
      const ageMs = NOW_MS - new Date(heartbeatIso).getTime();
      cronMinutesSince = Math.max(0, Math.floor(ageMs / 60_000));
    }
    // Stale si le cron ne s'est pas exécuté depuis > 60 min ET on a des matchs imminents.
    // Si jamais lancé mais qu'on n'a aucun match à venir, ce n'est pas critique.
    const cronCheckin: CronCheckinHeartbeat = {
      lastRunAt: heartbeatIso,
      minutesSince: cronMinutesSince,
      isStale:
        checkin24h.upcoming > 0 &&
        (cronMinutesSince === null || cronMinutesSince > 60),
    };

    const signals: DashboardSignals = {
      disputesOpen: { count: disputedRows.length, matches: disputedMatches },
      disputesBlockingDownstream,
      checkinNext24h: checkin24h,
      conflictsCount,
      conflictsList,
      pendingTeamsCount: pendingTeamsCountRes.count ?? 0,
      rosterLockProximity,
      supportHighOpen: supportHighRes.count ?? 0,
      activeMvpPolls: activeMvpPollsRes.data?.length ?? 0,
      stagesReadyToAdvance,
      liveMatches,
      velocity,
      recentActivity,
      tickets,
      discordHealth,
      cronCheckin,
    };

    const data: DashboardData = {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        start_date: tournament.start_date,
        end_date: tournament.end_date,
        timezone: tournament.timezone ?? null,
        format: tournament.format ?? null,
        min_players: tournament.min_players ?? null,
        max_teams: tournament.max_teams ?? null,
        roster_locked_at: tournament.roster_locked_at ?? null,
      },
      summary: {
        totalTeams,
        totalMatches,
        finishedMatches,
        pendingMatches,
        ongoingMatches,
        completionPercent,
        eliminatedTeams: eliminatedTeams.size,
        activeTeams,
      },
      stages: stageProgress,
      upcomingMatches,
      alerts,
      signals,
      guards: { current_status: currentStatus, guards: guardList },
      generatedAt: new Date().toISOString(),
    };

    return { ok: true, data };
  } catch (err: unknown) {
    logger.error('[buildTournamentDashboard] error:', err);
    return { ok: false, status: 500, error: 'Internal server error' };
  }
}

/* -----------------------------------------------------------
 * Helper léger pour le badge navbar (compte agrégé)
 * ---------------------------------------------------------*/

export type AlertsSummary = {
  tournamentId: string | null;
  total: number;
  breakdown: {
    disputes: number;
    conflicts: number;
    supportHigh: number;
    pendingTeams: number;
    checkinMissing: number;
    rosterLockSoon: boolean; // <= 24h, > 0h
    stagesReady: number;
    activeMvpPolls: number;
  };
};

/**
 * Entrée bas-niveau du calcul de résumé d'alertes : exactement les 8 signaux
 * (+ l'id tournoi) que consomme le badge. Le builder complet ET le chemin
 * léger `fetchAlertsSignals` alimentent cette même structure, garantissant un
 * total/breakdown strictement identiques quelle que soit la source.
 */
export type AlertsSignalsInput = {
  tournamentId: string;
  disputes: number;
  conflicts: number;
  supportHigh: number;
  pendingTeams: number;
  checkinMissing: number;
  rosterLockedAt: string | null;
  rosterHoursLeft: number | null;
  stagesReady: number;
  activeMvpPolls: number;
};

/**
 * Source unique de vérité pour le total + breakdown du badge. Ne dépend que
 * des 8 signaux normalisés — aucune connaissance de la provenance des données.
 */
export function summarizeAlerts(
  input: AlertsSignalsInput | null
): AlertsSummary {
  if (!input) {
    return {
      tournamentId: null,
      total: 0,
      breakdown: {
        disputes: 0,
        conflicts: 0,
        supportHigh: 0,
        pendingTeams: 0,
        checkinMissing: 0,
        rosterLockSoon: false,
        stagesReady: 0,
        activeMvpPolls: 0,
      },
    };
  }

  const rosterLockSoon =
    !!input.rosterLockedAt &&
    input.rosterHoursLeft !== null &&
    input.rosterHoursLeft > 0 &&
    input.rosterHoursLeft <= 24;

  const breakdown = {
    disputes: input.disputes,
    conflicts: input.conflicts,
    supportHigh: input.supportHigh,
    pendingTeams: input.pendingTeams,
    checkinMissing: input.checkinMissing,
    rosterLockSoon,
    stagesReady: input.stagesReady,
    activeMvpPolls: input.activeMvpPolls,
  };

  const total =
    breakdown.disputes +
    breakdown.conflicts +
    breakdown.supportHigh +
    breakdown.pendingTeams +
    breakdown.checkinMissing +
    (breakdown.rosterLockSoon ? 1 : 0) +
    breakdown.stagesReady +
    breakdown.activeMvpPolls;

  return {
    tournamentId: input.tournamentId,
    total,
    breakdown,
  };
}

/**
 * Calcule le total d'alertes actives à partir d'un payload dashboard complet.
 * Utilisé par le badge navbar (combiné à `resolveCurrentTournamentId`) et par
 * la page dashboard. Adapte `DashboardData` vers `summarizeAlerts` — sortie
 * strictement inchangée.
 */
export function computeAlertsSummary(
  data: DashboardData | null
): AlertsSummary {
  if (!data) return summarizeAlerts(null);

  const s = data.signals;
  return summarizeAlerts({
    tournamentId: data.tournament.id,
    disputes: s.disputesOpen.count,
    conflicts: s.conflictsCount,
    supportHigh: s.supportHighOpen,
    pendingTeams: s.pendingTeamsCount,
    checkinMissing: s.checkinNext24h.missing,
    rosterLockedAt: s.rosterLockProximity.lockedAt,
    rosterHoursLeft: s.rosterLockProximity.hoursLeft,
    stagesReady: s.stagesReadyToAdvance.length,
    activeMvpPolls: s.activeMvpPolls,
  });
}
