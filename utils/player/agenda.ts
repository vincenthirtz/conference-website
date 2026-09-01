// utils/player/agenda.ts
//
// « Mes échéances » — lot J2 de docs/PLAN-espace-joueur.md.
//
// Le site connaît tout du calendrier d'une joueuse (matchs, scrims, fenêtres de
// check-in, date butoir de roster) et n'en offrait AUCUNE vue personnelle : le
// prochain match seulement, et une liste plate. L'export `.ics` existait déjà,
// mais par TOURNOI et par créneau de scrim — jamais « mes échéances à moi ».
//
// Deux principes :
//
//   1. TOUTES mes équipes, pas l'équipe active. Un manager qui en encadre trois
//      a UN agenda, pas trois. C'est la seule lecture de l'espace joueur qui
//      ignore délibérément le sélecteur d'équipe.
//   2. Le check-in n'est pas un événement séparé. En faire un doublerait chaque
//      match dans l'agenda de la personne ; il devient une ALARME sur
//      l'événement du match, ce que tous les clients savent afficher.
//
// Le module lit la base et rend une structure ; la mise en forme ICS vit plus
// bas et reste pure (testable sans DB).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { listMemberships } from '@/utils/teams/memberships';
import { getManagedTeams } from '@/utils/teams/managementAccess';
import { loadRosterDeadline } from '@/utils/teamMessages';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import { escapeIcs, foldIcsLine, icsDate } from '@/utils/tournamentCalendar';

export type AgendaKind = 'match' | 'scrim' | 'deadline';

export type AgendaEntry = {
  /** Stable et unique tous types confondus — sert d'UID iCalendar. */
  id: string;
  kind: AgendaKind;
  /** Début, ISO UTC. Une entrée sans date n'entre jamais dans l'agenda. */
  startsAt: string;
  /** Durée estimée, en minutes (BO3 ≈ 60, BO5 ≈ 90, deadline = 0). */
  durationMinutes: number;
  title: string;
  subtitle: string | null;
  /** Chemin interne (fil du match, page de scrim…), jamais absolu. */
  path: string | null;
  team: { id: string; name: string } | null;
  status: string | null;
  /**
   * Ouverture du check-in, quand elle existe. Portée par l'entrée du match —
   * pas par une entrée séparée, cf. en-tête.
   */
  checkinOpensAt: string | null;
};

export type PlayerAgenda = {
  teams: { id: string; name: string }[];
  entries: AgendaEntry[];
};

const CANCELLED = new Set(['cancelled', 'canceled', 'draft']);

/** Durée d'affichage d'un match selon son format. */
export function durationForMatchFormat(format: string | null): number {
  const bo = format ? Number.parseInt(format.replace(/[^\d]/g, ''), 10) : 0;
  if (bo >= 5) return 90;
  if (bo >= 3) return 60;
  return 45;
}

/**
 * Toutes les équipes de la personne dans ce tenant : appartenances ET équipes
 * encadrées. Les deux, parce qu'une capitaine peut n'avoir aucune ligne
 * `team_members` (le capitanat vit sur `teams.captain_id`) et qu'un manager
 * multi-équipes en a plusieurs.
 */
async function resolveAgendaTeamIds(
  userId: string,
  tenantId: string
): Promise<string[]> {
  const [memberships, managed] = await Promise.all([
    listMemberships(userId, tenantId),
    getManagedTeams(userId, tenantId),
  ]);
  const ids = new Set<string>();
  for (const m of memberships) if (m.team_id) ids.add(m.team_id);
  for (const a of managed) ids.add(a.teamId);
  return Array.from(ids);
}

/**
 * Agenda personnel, trié par date croissante.
 *
 * `from` / `to` bornent la fenêtre (défaut : de maintenant à +120 jours pour la
 * vue, l'appelant élargit pour le flux ICS). Ne throw jamais : un agenda qui ne
 * charge plus vaut mieux vide qu'en erreur — la page qui l'affiche a d'autres
 * choses à montrer.
 */
export async function loadPlayerAgenda(
  userId: string,
  tenantId: string,
  opts: { from?: Date; to?: Date } = {}
): Promise<PlayerAgenda> {
  if (!supabaseAdmin || !userId) return { teams: [], entries: [] };

  const from = opts.from ?? new Date(Date.now() - 2 * 60 * 60_000);
  const to = opts.to ?? new Date(Date.now() + 120 * 24 * 60 * 60_000);
  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  const teamIds = await resolveAgendaTeamIds(userId, tenantId);
  if (teamIds.length === 0) return { teams: [], entries: [] };

  const orTeams = (a: string, b: string) =>
    teamIds.map((id) => `${a}.eq.${id},${b}.eq.${id}`).join(',');

  const [teamsRes, matchesRes, scrimsRes, deadlineISO] = await Promise.all([
    supabaseAdmin.from('teams').select('id, name').in('id', teamIds),
    supabaseAdmin
      .from('matches')
      .select(
        `id, status, scheduled_at, match_format, round_name,
         team1_id, team2_id,
         team1:team1_id(id, name),
         team2:team2_id(id, name),
         tournament:tournament_id(id, name)`
      )
      .eq('tenant_id', tenantId)
      .or(orTeams('team1_id', 'team2_id'))
      .gte('scheduled_at', fromISO)
      .lte('scheduled_at', toISO)
      .limit(200),
    supabaseAdmin
      .from('scrims')
      .select('id, name, scheduled_date, status, team1_id, team2_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .or(orTeams('team1_id', 'team2_id'))
      .gte('scheduled_date', fromISO)
      .lte('scheduled_date', toISO)
      .limit(200),
    loadRosterDeadline().catch(() => null),
  ]);

  if (teamsRes.error) logger.error('[agenda] teams error:', teamsRes.error);
  if (matchesRes.error)
    logger.error('[agenda] matches error:', matchesRes.error);
  if (scrimsRes.error) logger.error('[agenda] scrims error:', scrimsRes.error);

  const teamRows = (teamsRes.data ?? []) as { id: string; name: string }[];
  const nameOf = new Map(teamRows.map((t) => [t.id, t.name]));
  const mine = new Set(teamIds);

  const entries: AgendaEntry[] = [];

  for (const raw of (matchesRes.data ?? []) as Record<string, unknown>[]) {
    const status = (raw.status as string | null) ?? null;
    if (status && CANCELLED.has(status)) continue;
    const startsAt = raw.scheduled_at as string | null;
    if (!startsAt) continue;

    const myTeamId = mine.has(raw.team1_id as string)
      ? (raw.team1_id as string)
      : (raw.team2_id as string);
    const t1 = unwrapName(raw.team1);
    const t2 = unwrapName(raw.team2);
    const tournament = unwrapName(raw.tournament);
    const format = (raw.match_format as string | null) ?? null;

    entries.push({
      id: `match-${raw.id as string}`,
      kind: 'match',
      startsAt,
      durationMinutes: durationForMatchFormat(format),
      title: `${t1 ?? '?'} vs ${t2 ?? '?'}`,
      subtitle:
        [tournament, raw.round_name as string | null, format?.toUpperCase()]
          .filter(Boolean)
          .join(' · ') || null,
      path: `/player/match/${raw.id as string}`,
      team: { id: myTeamId, name: nameOf.get(myTeamId) ?? '' },
      status,
      checkinOpensAt: new Date(
        new Date(startsAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
      ).toISOString(),
    });
  }

  for (const raw of (scrimsRes.data ?? []) as Record<string, unknown>[]) {
    const status = (raw.status as string | null) ?? null;
    if (status && CANCELLED.has(status)) continue;
    const startsAt = raw.scheduled_date as string | null;
    if (!startsAt) continue;

    const myTeamId = mine.has(raw.team1_id as string)
      ? (raw.team1_id as string)
      : (raw.team2_id as string);
    const otherId =
      myTeamId === raw.team1_id
        ? (raw.team2_id as string | null)
        : (raw.team1_id as string | null);

    entries.push({
      id: `scrim-${raw.id as string}`,
      kind: 'scrim',
      startsAt,
      durationMinutes: 120,
      title: (raw.name as string | null) || 'Scrim',
      subtitle: otherId ? (nameOf.get(otherId) ?? null) : null,
      path: `/player/scrims/${raw.id as string}`,
      team: { id: myTeamId, name: nameOf.get(myTeamId) ?? '' },
      status,
      checkinOpensAt: null,
    });
  }

  // Date butoir de roster : une seule entrée, et seulement si elle est dans la
  // fenêtre. C'est la seule échéance de l'agenda qui ne soit pas une rencontre.
  if (deadlineISO && deadlineISO >= fromISO && deadlineISO <= toISO) {
    entries.push({
      id: `deadline-roster-${deadlineISO}`,
      kind: 'deadline',
      startsAt: deadlineISO,
      durationMinutes: 0,
      title: 'Date butoir — roster',
      subtitle: null,
      path: '/player/manage-team',
      team: null,
      status: null,
      checkinOpensAt: null,
    });
  }

  entries.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return { teams: teamRows, entries };
}

function unwrapName(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (v && typeof v === 'object' && 'name' in v) {
    const n = (v as { name?: unknown }).name;
    return typeof n === 'string' ? n : null;
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Flux iCalendar
 * ---------------------------------------------------------------------- */

export type AgendaIcsOptions = {
  calendarName: string;
  /** Base absolue du site, sans slash final. */
  siteUrl: string;
  domain?: string;
  /** DTSTAMP ; injectable pour les tests. */
  nowIso?: string;
};

/**
 * Construit le flux ICS de l'agenda. PUR : aucune lecture, aucune horloge hors
 * `nowIso`.
 *
 * Le check-in devient une VALARM à l'ouverture de sa fenêtre plutôt qu'un
 * second événement : l'agenda d'une joueuse ne doit pas compter double.
 */
export function buildAgendaIcs(
  entries: AgendaEntry[],
  opts: AgendaIcsOptions
): string {
  const domain = opts.domain ?? 'owwomenscup.fr';
  const stamp = icsDate(opts.nowIso ?? new Date().toISOString());
  const site = opts.siteUrl.replace(/\/$/, '');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${domain}//player-agenda//FR`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(opts.calendarName)}`,
    'X-WR-TIMEZONE:Europe/Paris',
  ];

  for (const e of entries) {
    const start = new Date(e.startsAt);
    if (isNaN(start.getTime())) continue;
    const endIso = new Date(
      start.getTime() + Math.max(e.durationMinutes, 15) * 60_000
    ).toISOString();

    lines.push('BEGIN:VEVENT');
    lines.push(foldIcsLine(`UID:${escapeIcs(e.id)}@${domain}`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${icsDate(e.startsAt)}`);
    lines.push(`DTEND:${icsDate(endIso)}`);
    lines.push(foldIcsLine(`SUMMARY:${escapeIcs(e.title)}`));
    if (e.subtitle) {
      lines.push(foldIcsLine(`DESCRIPTION:${escapeIcs(e.subtitle)}`));
    }
    if (e.path) lines.push(foldIcsLine(`URL:${escapeIcs(site + e.path)}`));
    if (e.status === 'cancelled') lines.push('STATUS:CANCELLED');

    if (e.checkinOpensAt) {
      const minutesBefore = Math.round(
        (start.getTime() - new Date(e.checkinOpensAt).getTime()) / 60_000
      );
      if (minutesBefore > 0) {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push(foldIcsLine(`DESCRIPTION:${escapeIcs(e.title)}`));
        lines.push(`TRIGGER:-PT${minutesBefore}M`);
        lines.push('END:VALARM');
      }
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
