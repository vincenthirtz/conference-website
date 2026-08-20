// Feuille de match — les deux routes.
//
// Ce que la brique répare : `snapshotMatchParticipants` figeait le ROSTER
// COURANT au moment de la saisie du score (« approximation assumée », dit son
// propre commentaire). Personne n'avait jamais déclaré qui jouait.
//
// Les invariants qui comptent ici, et qu'un refactor ne doit pas emporter :
//   1. le CHECK-IN est la porte ;
//   2. une feuille validée est FIGÉE — sinon elle ne prouve rien ;
//   3. « validée par l'équipe » et « validée par le staff » restent DISTINCTES,
//      sans quoi une contestation devient ininterprétable.
//
// Cibles : pages/api/teams/matches/[matchId]/lineup.ts,
//          pages/api/admin/matches/[matchId]/lineup.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import teamLineupHandler from '../../pages/api/teams/matches/[matchId]/lineup';
import adminLineupHandler from '../../pages/api/admin/matches/[matchId]/lineup';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEAM_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const CAPTAIN = 'd0000000-0000-4000-8000-000000000001';
const PLAYER_1 = 'd0000000-0000-4000-8000-000000000002';
const PLAYER_2 = 'd0000000-0000-4000-8000-000000000003';
const COACH = 'd0000000-0000-4000-8000-000000000004';
const PLAIN = 'd0000000-0000-4000-8000-000000000005';
const STAFF_USER = 'd0000000-0000-4000-8000-000000000009';

let _tokenCounter = 0;
function makeReq(over: Partial<any> = {}): any {
  _tokenCounter += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${_tokenCounter}` },
    query: { matchId: MATCH },
    body: {},
    cookies: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: STAFF_USER,
    email: 'staff@example.com',
    role: 'admin',
    display_name: 'Staff',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

/** Check-in de l'équipe A posé ou non — c'est la porte de la feuille. */
function seed({ checkedIn = true }: { checkedIn?: boolean } = {}) {
  store.matches = [
    {
      id: MATCH,
      tenant_id: TENANT,
      tournament_id: null,
      status: 'scheduled',
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      team1_checked_in_at: checkedIn ? '2026-08-21T10:00:00Z' : null,
      team2_checked_in_at: null,
      scheduled_at: '2099-06-01T18:00:00.000Z',
      deleted_at: null,
    },
  ] as any;
  store.teams = [
    {
      id: TEAM_A,
      tenant_id: TENANT,
      name: 'Alpha',
      captain_id: CAPTAIN,
      is_active: true,
    },
    {
      id: TEAM_B,
      tenant_id: TENANT,
      name: 'Bravo',
      captain_id: 'x',
      is_active: true,
    },
  ] as any;
  store.team_members = [
    {
      id: 'm-cap',
      tenant_id: TENANT,
      team_id: TEAM_A,
      user_id: CAPTAIN,
      role: 'player',
      battle_tag: 'Cap#1111',
      is_substitute: false,
    },
    {
      id: 'm-p1',
      tenant_id: TENANT,
      team_id: TEAM_A,
      user_id: PLAYER_1,
      role: 'player',
      battle_tag: 'P1#1111',
      is_substitute: false,
    },
    {
      id: 'm-p2',
      tenant_id: TENANT,
      team_id: TEAM_A,
      user_id: PLAYER_2,
      role: 'substitute',
      battle_tag: 'P2#1111',
      is_substitute: true,
    },
    {
      id: 'm-coach',
      tenant_id: TENANT,
      team_id: TEAM_A,
      user_id: COACH,
      role: 'coach',
      battle_tag: null,
      is_substitute: false,
    },
    {
      id: 'm-plain',
      tenant_id: TENANT,
      team_id: TEAM_B,
      user_id: PLAIN,
      role: 'player',
      battle_tag: 'Pl#1111',
      is_substitute: false,
    },
  ] as any;
  store.match_participants = [] as any;
  store.match_lineups = [] as any;
  store.staff = [staffRow()] as any;
  store.staff_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  seed();
  setAuthUser({ id: CAPTAIN });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ========================================================================== */
describe('route équipe — accès', () => {
  it('le COACH y a droit : c’est le geste de son métier', async () => {
    setAuthUser({ id: COACH });
    const res = makeRes();
    await teamLineupHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
  });

  it('une joueuse ordinaire n’y a pas droit', async () => {
    setAuthUser({ id: PLAYER_1 });
    const res = makeRes();
    await teamLineupHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });
});

describe('route équipe — le check-in est la porte', () => {
  it('avant le check-in, la feuille est close et le DIT', async () => {
    seed({ checkedIn: false });
    const res = makeRes();
    await teamLineupHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      open: false,
      closedReason: 'awaiting_checkin',
    });
    // Un message actionnable, pas « indisponible ».
    expect((res.body as any).closedMessage).toMatch(/check-in/i);
  });

  it('avant le check-in, enregistrer est refusé', async () => {
    seed({ checkedIn: false });
    const res = makeRes();
    await teamLineupHandler(
      makeReq({ method: 'PUT', body: { starters: [CAPTAIN] } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'awaiting_checkin' });
  });
});

describe('route équipe — composition', () => {
  it('n’expose que le roster JOUANT : le coach n’entre pas en jeu', async () => {
    const res = makeRes();
    await teamLineupHandler(makeReq(), res);
    const ids = (res.body as any).eligible.map((e: any) => e.userId);
    expect(ids).toContain(CAPTAIN);
    expect(ids).toContain(PLAYER_1);
    // La remplaçante EST éligible — le banc n'est pas une exclusion.
    expect(ids).toContain(PLAYER_2);
    expect(ids).not.toContain(COACH);
  });

  it('enregistre un brouillon sans le valider', async () => {
    const res = makeRes();
    await teamLineupHandler(
      makeReq({ method: 'PUT', body: { starters: [CAPTAIN, PLAYER_2] } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'draft' });
    expect(store.match_participants).toHaveLength(2);
    // Un brouillon ne porte PAS de validation : la contrainte
    // chk_match_lineups_validation_complete l'exige aussi en base.
    const header = (store.match_lineups as any[])[0];
    expect(header).toMatchObject({ status: 'draft', validated_at: null });
  });

  it('refuse quelqu’un qui n’est pas du roster de l’équipe', async () => {
    const res = makeRes();
    await teamLineupHandler(
      makeReq({ method: 'PUT', body: { starters: [CAPTAIN, PLAIN] } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'not_eligible' });
  });

  it('refuse une feuille vide', async () => {
    const res = makeRes();
    await teamLineupHandler(
      makeReq({ method: 'PUT', body: { starters: [] } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'empty' });
  });
});

describe('route équipe — la validation FIGE', () => {
  it('valide, et marque l’engagement de l’ÉQUIPE', async () => {
    const res = makeRes();
    await teamLineupHandler(
      makeReq({ method: 'POST', body: { starters: [CAPTAIN, PLAYER_1] } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: 'validated',
      validatedByKind: 'team',
    });
    const header = (store.match_lineups as any[])[0];
    expect(header.validated_by).toBe(CAPTAIN);
    expect(header.validated_at).toBeTruthy();
  });

  it('une fois validée, on ne peut plus la réécrire', async () => {
    await teamLineupHandler(
      makeReq({ method: 'POST', body: { starters: [CAPTAIN] } }),
      makeRes()
    );
    const res = makeRes();
    await teamLineupHandler(
      makeReq({ method: 'PUT', body: { starters: [PLAYER_1] } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'ALREADY_VALIDATED' });
    // Et la composition d'origine tient.
    expect((store.match_participants as any[]).map((p) => p.user_id)).toEqual([
      CAPTAIN,
    ]);
  });
});

/* ========================================================================== */
describe('route admin', () => {
  beforeEach(() => {
    setAuthUser({ id: STAFF_USER });
  });

  it('rend les deux feuilles du match', async () => {
    const res = makeRes();
    await adminLineupHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const teamIds = (res.body as any).lineups.map((l: any) => l.teamId);
    expect(new Set(teamIds)).toEqual(new Set([TEAM_A, TEAM_B]));
  });

  it('valide à la place de l’équipe, et le dit — `admin`, pas `team`', async () => {
    // La distinction est ce qui rend une contestation interprétable : une
    // feuille validée par l'organisation n'engage pas l'équipe pareil.
    const res = makeRes();
    await adminLineupHandler(
      makeReq({
        method: 'POST',
        body: { teamId: TEAM_A, starters: [CAPTAIN, PLAYER_1] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: 'validated',
      validatedByKind: 'admin',
    });
  });

  it('refuse de valider une équipe qui n’a pas fait son check-in', async () => {
    // TEAM_B n'a pas coché. Valider sa composition n'aurait aucun sens — c'est
    // le forfait qui répond à ce cas.
    const res = makeRes();
    await adminLineupHandler(
      makeReq({ method: 'POST', body: { teamId: TEAM_B, starters: [PLAIN] } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'awaiting_checkin' });
  });

  it('rouvrir est le SEUL geste qui défige une feuille', async () => {
    await adminLineupHandler(
      makeReq({
        method: 'POST',
        body: { teamId: TEAM_A, starters: [CAPTAIN] },
      }),
      makeRes()
    );
    const res = makeRes();
    await adminLineupHandler(
      makeReq({ method: 'POST', body: { teamId: TEAM_A, reopen: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'draft' });
    const header = (store.match_lineups as any[]).find(
      (h) => h.team_id === TEAM_A
    );
    expect(header).toMatchObject({
      status: 'draft',
      validated_at: null,
      validated_by_kind: null,
    });
  });

  it('refuse une équipe étrangère au match', async () => {
    const res = makeRes();
    await adminLineupHandler(
      makeReq({
        method: 'POST',
        body: { teamId: '99999999-9999-4999-8999-999999999999' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});
