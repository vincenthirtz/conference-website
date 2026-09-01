// Agenda personnel — lot J2 (docs/PLAN-espace-joueur.md).
//
// Ce qui compte ici :
//  1. l'agenda porte TOUTES les équipes de la personne (un manager qui en
//     encadre trois n'a pas trois agendas) ;
//  2. le flux ICS est un fichier que des clients tiers vont parser : sa forme
//     (CRLF, UID unique, VALARM de check-in) n'est pas cosmétique ;
//  3. le check-in ne crée JAMAIS un second événement — il doublerait chaque
//     match dans l'agenda de la personne.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  buildAgendaIcs,
  durationForMatchFormat,
  loadPlayerAgenda,
  type AgendaEntry,
} from '../../utils/player/agenda';

const USER = '00000000-0000-0000-0000-0000000000aa';
const TEAM_A = '00000000-0000-0000-0000-0000000000b1';
const TEAM_B = '00000000-0000-0000-0000-0000000000b2';
const OPP = '00000000-0000-0000-0000-0000000000cc';

function inDays(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60_000).toISOString();
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER });

  store.teams = [
    { id: TEAM_A, name: 'Phenix', captain_id: null, is_active: true },
    { id: TEAM_B, name: 'Secondes', captain_id: null, is_active: true },
    { id: OPP, name: 'Avoidgers', captain_id: null, is_active: true },
  ] as any;
  store.team_members = [
    { id: 'tm-1', team_id: TEAM_A, user_id: USER, role: 'player' },
  ] as any;
  store.matches = [
    {
      id: 'm-1',
      status: 'pending',
      scheduled_at: inDays(3),
      match_format: 'bo3',
      round_name: 'J1',
      team1_id: TEAM_A,
      team2_id: OPP,
      team1: { id: TEAM_A, name: 'Phenix' },
      team2: { id: OPP, name: 'Avoidgers' },
      tournament: { id: 't-1', name: 'Cup 2026' },
    },
    {
      id: 'm-cancelled',
      status: 'cancelled',
      scheduled_at: inDays(4),
      match_format: 'bo3',
      team1_id: TEAM_A,
      team2_id: OPP,
      team1: { id: TEAM_A, name: 'Phenix' },
      team2: { id: OPP, name: 'Avoidgers' },
    },
  ] as any;
  store.scrims = [
    {
      id: 's-1',
      name: 'Scrim mardi',
      scheduled_date: inDays(1),
      status: 'scheduled',
      team1_id: TEAM_A,
      team2_id: OPP,
      deleted_at: null,
    },
  ] as any;
});

describe('loadPlayerAgenda', () => {
  it('rassemble matchs et scrims, triés, sans les annulés', async () => {
    const agenda = await loadPlayerAgenda(USER, 'tenant-1');
    const ids = agenda.entries.map((e) => e.id);

    expect(ids).toEqual(['scrim-s-1', 'match-m-1']); // le scrim est plus proche
    expect(ids).not.toContain('match-m-cancelled');
  });

  it('porte le fil du match et l’ouverture du check-in sur l’entrée match', async () => {
    const agenda = await loadPlayerAgenda(USER, 'tenant-1');
    const match = agenda.entries.find((e) => e.kind === 'match')!;

    expect(match.path).toBe('/player/match/m-1');
    expect(match.checkinOpensAt).toBeTruthy();
    expect(new Date(match.checkinOpensAt!).getTime()).toBeLessThan(
      new Date(match.startsAt).getTime()
    );
  });

  it('couvre TOUTES les équipes, pas seulement la première', async () => {
    // La personne encadre aussi TEAM_B, qui joue son propre match.
    (store.team_members as any[]).push({
      id: 'tm-2',
      team_id: TEAM_B,
      user_id: USER,
      role: 'manager',
    });
    (store.matches as any[]).push({
      id: 'm-2',
      status: 'pending',
      scheduled_at: inDays(2),
      match_format: 'bo3',
      team1_id: TEAM_B,
      team2_id: OPP,
      team1: { id: TEAM_B, name: 'Secondes' },
      team2: { id: OPP, name: 'Avoidgers' },
    });

    const agenda = await loadPlayerAgenda(USER, 'tenant-1');
    const teams = new Set(agenda.entries.map((e) => e.team?.id));
    expect(teams.has(TEAM_A)).toBe(true);
    expect(teams.has(TEAM_B)).toBe(true);
  });

  it('rend un agenda vide (et pas une erreur) sans aucune équipe', async () => {
    store.team_members = [] as any;
    const agenda = await loadPlayerAgenda(USER, 'tenant-1');
    expect(agenda).toEqual({ teams: [], entries: [] });
  });
});

describe('durationForMatchFormat', () => {
  it('donne plus de temps à un BO5 qu’à un BO3', () => {
    expect(durationForMatchFormat('bo5')).toBeGreaterThan(
      durationForMatchFormat('bo3')
    );
    expect(durationForMatchFormat(null)).toBeGreaterThan(0);
  });
});

describe('buildAgendaIcs', () => {
  const base: AgendaEntry = {
    id: 'match-m-1',
    kind: 'match',
    startsAt: '2026-09-18T17:00:00.000Z',
    durationMinutes: 60,
    title: 'Phenix vs Avoidgers',
    subtitle: 'Cup 2026 · J1',
    path: '/player/match/m-1',
    team: { id: TEAM_A, name: 'Phenix' },
    status: 'pending',
    checkinOpensAt: '2026-09-18T16:30:00.000Z',
  };

  const opts = {
    calendarName: 'Mes matchs',
    siteUrl: 'https://owwomenscup.fr',
    nowIso: '2026-09-01T00:00:00.000Z',
  };

  it('produit un VCALENDAR en CRLF avec un VEVENT par entrée', () => {
    const ics = buildAgendaIcs([base], opts);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.split('BEGIN:VEVENT').length - 1).toBe(1);
    expect(ics).toContain('UID:match-m-1@owwomenscup.fr');
    expect(ics).toContain('DTSTART:20260918T170000Z');
    expect(ics).toContain('URL:https://owwomenscup.fr/player/match/m-1');
  });

  it('transforme le check-in en ALARME, jamais en second événement', () => {
    const ics = buildAgendaIcs([base], opts);
    expect(ics.split('BEGIN:VEVENT').length - 1).toBe(1);
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT30M');
  });

  it('n’ajoute pas d’alarme quand il n’y a pas de check-in', () => {
    const ics = buildAgendaIcs(
      [{ ...base, checkinOpensAt: null, id: 'scrim-s-1', kind: 'scrim' }],
      opts
    );
    expect(ics).not.toContain('BEGIN:VALARM');
  });

  it('échappe les caractères spéciaux du titre', () => {
    const ics = buildAgendaIcs(
      [{ ...base, title: 'Phenix, A vs B; test' }],
      opts
    );
    expect(ics).toContain(String.raw`SUMMARY:Phenix\, A vs B\; test`);
  });
});
