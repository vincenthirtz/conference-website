// Unit tests — route /api/player/team-health (N3).
//
// Ce qui ne se voit que dans le handler :
//
//   - la réservation à qui GÈRE l'équipe (les gestes de réparation sont des
//     gestes de gestion ; l'équivalent membre est la checklist R11) ;
//   - le non-double-comptage d'une même personne entre « sans BattleTag » et
//     « BattleTag non vérifié » — sinon l'équipe croit avoir deux problèmes là
//     où elle n'en a qu'un ;
//   - l'effectif requis, qui vient du tournoi quand l'équipe y est inscrite et
//     de la taille de line-up sinon ;
//   - le refus de compter comme « jamais connecté » un compte INTROUVABLE :
//     ne pas savoir n'est pas un défaut.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import handler from '../../pages/api/player/team-health';
import { MAX_TEAM_PLAYERS } from '../../utils/constants';

const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PLAYER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OUTSIDER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

let _tok = 0;
function makeReq(over: Partial<any> = {}): any {
  _tok += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_tok}` },
    query: {},
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

/** Équipe complète et saine : 5 titulaires, BattleTags vérifiés, Discord lié. */
function seed() {
  store.teams = [
    {
      id: TEAM_A,
      name: 'Alpha',
      captain_id: CAPTAIN,
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.team_members = Array.from({ length: 5 }, (_, i) => ({
    id: `tm-${i}`,
    team_id: TEAM_A,
    user_id: i === 0 ? CAPTAIN : `member-${i}`,
    role: 'player',
    is_substitute: false,
    battle_tag: `Joueuse#000${i}`,
    battle_tag_verified_at: '2026-07-01T00:00:00.000Z',
    tenant_id: CONFERENCE_TENANT_ID,
  })) as any;
  store.user_discord_links = store.team_members.map((m: any) => ({
    user_id: m.user_id,
    discord_user_id: `discord-${m.user_id}`,
  })) as any;
  store.team_availability = store.team_members.map((m: any) => ({
    id: `av-${m.user_id}`,
    tenant_id: CONFERENCE_TENANT_ID,
    team_id: TEAM_A,
    user_id: m.user_id,
    timezone: 'Europe/Paris',
    slots: ['2-1260'],
  })) as any;
  store.scrim_searches = [] as any;
  store.matches = [] as any;
  store.scrims = [] as any;
  store.team_reviews = [] as any;
  store.tournaments = [] as any;
  store.tournament_teams = [] as any;
}

async function call(over: Partial<any> = {}) {
  const req = makeReq(over);
  const res = makeRes();
  await handler(req, res);
  return res;
}

const codes = (res: any) => res.body.issues.map((i: any) => i.code);

beforeEach(() => {
  resetSupabaseMock();
  seed();
  setAuthUser({ id: CAPTAIN });
});

describe('accès', () => {
  it('répond vide à qui ne gère aucune équipe', async () => {
    setAuthUser({ id: OUTSIDER });
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.teamId).toBeNull();
    expect(res.body.issues).toEqual([]);
  });

  it('répond vide à un simple membre', async () => {
    // Les gestes de réparation sont des gestes de gestion ; la checklist
    // individuelle (R11) couvre ce qu'un membre peut corriger seul.
    setAuthUser({ id: PLAYER });
    const res = await call();
    expect(res.body.teamId).toBeNull();
  });

  it('rejette une méthode non supportée', async () => {
    const res = await call({ method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});

describe('équipe saine', () => {
  it('ne signale rien quand tout va bien', async () => {
    // Le noyau existe (les 5 ont déclaré le même créneau) : l'absence
    // d'annonce publiée ne rend donc PAS l'équipe invisible.
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.teamId).toBe(TEAM_A);
    expect(res.body.issues).toEqual([]);
    expect(res.body.blockingCount).toBe(0);
  });

  it('signale l’invisibilité si personne n’a déclaré et qu’aucune annonce ne vit', async () => {
    store.team_availability = [] as any;
    const res = await call();
    expect(codes(res)).toContain('invisible_for_scrims');
    expect(codes(res)).toContain('no_rhythm');
  });
});

describe('roster', () => {
  it('signale le capitanat vacant', async () => {
    (store.teams[0] as any).captain_id = null;
    // Sans capitaine, l'accès de gestion passe par le rôle — on garde donc un
    // accès valide en repositionnant l'appelante comme manager.
    (store.team_members[0] as any).role = 'manager';
    const res = await call();
    expect(codes(res)).toContain('no_captain');
  });

  it('compte les titulaires manquants sur la taille de line-up hors tournoi', async () => {
    store.team_members = store.team_members.slice(0, 3) as any;
    const res = await call();
    expect(res.body.requiredStarters).toBe(MAX_TEAM_PLAYERS);
    expect(res.body.requiredStartersSource).toBe('lineup');
    const shortfall = res.body.issues.find(
      (i: any) => i.code === 'roster_shortfall'
    );
    expect(shortfall.count).toBe(2);
  });

  it('n’exige pas de BattleTag de l’encadrement et ne le compte pas dans l’effectif', async () => {
    // Une manager (ni BattleTag, ni compte Overwatch) rejoint une équipe déjà
    // au complet : elle ne doit créer aucun constat.
    store.team_members = [
      ...store.team_members,
      {
        id: 'tm-manager',
        team_id: TEAM_A,
        user_id: 'manager-1',
        role: 'manager',
        is_substitute: false,
        battle_tag: null,
        battle_tag_verified_at: null,
        tenant_id: CONFERENCE_TENANT_ID,
      },
    ] as any;
    store.user_discord_links = [
      ...store.user_discord_links,
      { user_id: 'manager-1', discord_user_id: 'discord-manager-1' },
    ] as any;
    const res = await call();
    expect(codes(res)).not.toContain('missing_battle_tag');
    expect(codes(res)).not.toContain('unverified_battle_tag');
  });

  it('ne compte pas deux fois la même personne entre les deux constats BattleTag', async () => {
    (store.team_members[0] as any).battle_tag = '';
    (store.team_members[0] as any).battle_tag_verified_at = null;
    (store.team_members[1] as any).battle_tag_verified_at = null;
    const res = await call();
    const missing = res.body.issues.find(
      (i: any) => i.code === 'missing_battle_tag'
    );
    const unverified = res.body.issues.find(
      (i: any) => i.code === 'unverified_battle_tag'
    );
    expect(missing.count).toBe(1);
    // La personne sans tag ne doit PAS gonfler aussi le compteur « non vérifié ».
    expect(unverified.count).toBe(1);
  });

  it('compte les membres sans compte Discord lié', async () => {
    store.user_discord_links = (store.user_discord_links as any).slice(0, 2);
    const res = await call();
    expect(
      res.body.issues.find((i: any) => i.code === 'discord_unlinked').count
    ).toBe(3);
  });
});

describe('comptes jamais connectés', () => {
  it('ne compte pas un compte introuvable — ne pas savoir n’est pas un défaut', async () => {
    const res = await call();
    expect(codes(res)).not.toContain('never_logged_in');
  });

  it('compte un compte connu qui n’a jamais ouvert de session', async () => {
    setAdminUser(CAPTAIN, 'cap@example.com');
    const res = await call();
    expect(
      res.body.issues.find((i: any) => i.code === 'never_logged_in').count
    ).toBe(1);
  });
});

describe('débriefs en retard', () => {
  it('compte les affrontements joués sans revue', async () => {
    store.matches = Array.from({ length: 4 }, (_, i) => ({
      id: `match-${i}`,
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'finished',
      team1_id: TEAM_A,
      team2_id: 'other-team',
      deleted_at: null,
    })) as any;
    store.team_reviews = [
      {
        id: 'r1',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_A,
        subject_type: 'match',
        subject_id: 'match-0',
        notes: 'vu',
      },
    ] as any;
    const res = await call();
    expect(
      res.body.issues.find((i: any) => i.code === 'unreviewed_encounters').count
    ).toBe(3);
  });
});
