// Unit tests — route /api/player/scouting (N5).
//
// Ce que le handler doit garantir et qui ne se voit pas dans le cœur pur :
//
//   - la LIGNE DE CONFIDENTIALITÉ : le dossier ne remonte que MES revues, sous
//     aucun prétexte celles de l'adversaire. C'est le test le plus important
//     du fichier ;
//   - le refus de se scouter soi-même (un dossier contre soi n'a pas de sens) ;
//   - l'exigence d'appartenir à une équipe (sans la sienne, il n'y a ni
//     confrontation directe ni adversaire commun à croiser) ;
//   - le scope tenant sur l'équipe cible.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import handler from '../../pages/api/player/scouting';

const TEAM_ME = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEAM_THEM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEAM_OTHER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAYER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OUTSIDER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

let _tok = 0;
function makeReq(over: Partial<any> = {}): any {
  _tok += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_tok}` },
    query: { team: TEAM_THEM },
    body: {},
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

function team(id: string, name: string) {
  return {
    id,
    name,
    short_name: null,
    logo_url: null,
    slug: null,
    country: null,
    captain_id: null,
    tenant_id: CONFERENCE_TENANT_ID,
    is_active: true,
    deleted_at: null,
  };
}

function seed() {
  store.teams = [
    team(TEAM_ME, 'Alpha'),
    team(TEAM_THEM, 'Bravo'),
    team(TEAM_OTHER, 'Charlie'),
  ] as any;
  store.team_members = [
    {
      id: 'tm-1',
      team_id: TEAM_ME,
      user_id: PLAYER,
      role: 'player',
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ] as any;
  store.matches = [
    {
      id: 'match-h2h',
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'finished',
      scheduled_at: '2026-07-01T20:00:00.000Z',
      completed_at: null,
      team1_id: TEAM_ME,
      team2_id: TEAM_THEM,
      team1_score: 3,
      team2_score: 1,
      winner_team_id: TEAM_ME,
      deleted_at: null,
    },
    {
      id: 'match-mine-vs-other',
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'finished',
      scheduled_at: '2026-07-05T20:00:00.000Z',
      completed_at: null,
      team1_id: TEAM_ME,
      team2_id: TEAM_OTHER,
      team1_score: 3,
      team2_score: 0,
      winner_team_id: TEAM_ME,
      deleted_at: null,
    },
    {
      id: 'match-theirs-vs-other',
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'finished',
      scheduled_at: '2026-07-06T20:00:00.000Z',
      completed_at: null,
      team1_id: TEAM_THEM,
      team2_id: TEAM_OTHER,
      team1_score: 0,
      team2_score: 3,
      winner_team_id: TEAM_OTHER,
      deleted_at: null,
    },
  ] as any;
  store.scrims = [] as any;
  store.team_ratings = [] as any;
  store.demandes = [] as any;
  store.team_availability = [] as any;
  store.team_reviews = [
    {
      id: 'rev-mine',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ME,
      subject_type: 'match',
      subject_id: 'match-h2h',
      opponent_team_id: TEAM_THEM,
      played_at: '2026-07-01T20:00:00.000Z',
      vod_url: null,
      notes: 'Elles jouent très agressif sur le premier point.',
    },
    {
      id: 'rev-theirs',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_THEM,
      subject_type: 'match',
      subject_id: 'match-h2h',
      opponent_team_id: TEAM_ME,
      played_at: '2026-07-01T20:00:00.000Z',
      vod_url: null,
      notes: 'SECRET — la revue de l’adversaire, jamais visible ici.',
    },
  ] as any;
}

async function call(over: Partial<any> = {}) {
  const req = makeReq(over);
  const res = makeRes();
  await handler(req, res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  seed();
  setAuthUser({ id: PLAYER });
});

describe('confidentialité', () => {
  it('ne remonte QUE mes revues, jamais celles de l’adversaire', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.myNotes).toHaveLength(1);
    expect(res.body.myNotes[0].notes).toMatch(/agressif/);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('SECRET');
  });
});

describe('garde-fous', () => {
  it('refuse de se scouter soi-même', async () => {
    const res = await call({ query: { team: TEAM_ME } });
    expect(res.statusCode).toBe(400);
  });

  it('exige une équipe cible', async () => {
    const res = await call({ query: {} });
    expect(res.statusCode).toBe(400);
  });

  it('refuse à qui n’a pas d’équipe', async () => {
    setAuthUser({ id: OUTSIDER });
    const res = await call();
    expect(res.statusCode).toBe(403);
  });

  it('renvoie 404 pour une équipe inconnue', async () => {
    const res = await call({
      query: { team: '99999999-9999-9999-9999-999999999999' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejette une méthode non supportée', async () => {
    const res = await call({ method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});

describe('contenu du dossier', () => {
  it('compose le bilan direct depuis mon point de vue', async () => {
    const res = await call();
    expect(res.body.report.headToHead.played).toBe(1);
    expect(res.body.report.headToHead.wins).toBe(1);
    expect(res.body.report.headToHead.recent[0].myScore).toBe(3);
  });

  it('croise les adversaires communs et les nomme', async () => {
    const res = await call();
    const common = res.body.report.commonOpponents;
    expect(common).toHaveLength(1);
    expect(common[0]).toMatchObject({
      teamId: TEAM_OTHER,
      myWins: 1,
      myLosses: 0,
      theirWins: 0,
      theirLosses: 1,
    });
    expect(res.body.teamNames[TEAM_OTHER]).toBe('Charlie');
  });

  it('se tait sur la forme sous le seuil d’échantillon', async () => {
    // Bravo n'a que 2 affrontements décidés dans le jeu de test.
    const res = await call();
    expect(res.body.report.recentForm).toBeNull();
    expect(res.body.report.record).toBeNull();
  });
});
