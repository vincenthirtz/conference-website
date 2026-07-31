// Unit tests — route GET/PUT /api/player/team-rhythm (N1).
//
// La logique pure est couverte par `teamRhythm.test.ts`. Ici on teste ce qui ne
// se voit que dans le handler, et qui est précisément ce qui peut trahir
// l'intention de la feature :
//
//   - l'ouverture À TOUT MEMBRE (une route d'équipe qui exigerait la gestion
//     reproduirait exactement le problème qu'on cherche à résoudre) ;
//   - la garde `canAnnounce`, qui elle reste sur `manage_scrims` ;
//   - l'exclusion des déclarations ORPHELINES (membre parti), qui gonfleraient
//     le noyau — et donc feraient annoncer des créneaux que personne ne joue.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import handler from '../../pages/api/player/team-rhythm';
import { rhythmSlotKey } from '../../utils/teams/teamRhythm';

const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PLAYER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const GONE = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const TUE_21 = rhythmSlotKey(2, 21 * 60);
const THU_21 = rhythmSlotKey(4, 21 * 60);

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
  store.team_members = [
    {
      id: 'tm-captain',
      team_id: TEAM_A,
      user_id: CAPTAIN,
      role: 'player',
      display_name: 'Cap',
      tenant_id: CONFERENCE_TENANT_ID,
    },
    {
      id: 'tm-player',
      team_id: TEAM_A,
      user_id: PLAYER,
      role: 'player',
      display_name: 'Joueuse',
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ] as any;
  store.team_availability = [] as any;
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

describe('accès', () => {
  it('laisse un membre SANS rôle de gestion déclarer ses créneaux', () => {
    // Le cœur de la feature : si cette route exigeait `manage_scrims`, elle
    // reproduirait le problème qu'elle est censée corriger.
    return call({ method: 'PUT', body: { slots: [TUE_21] } }).then((res) => {
      expect(res.statusCode).toBe(200);
      expect(store.team_availability).toHaveLength(1);
      expect((store.team_availability[0] as any).user_id).toBe(PLAYER);
    });
  });

  it('refuse la déclaration de quelqu’un sans équipe', async () => {
    setAuthUser({ id: GONE });
    const res = await call({ method: 'PUT', body: { slots: [TUE_21] } });
    expect(res.statusCode).toBe(403);
  });

  it('répond 200 avec teamId null en lecture sans équipe', async () => {
    setAuthUser({ id: GONE });
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.teamId).toBeNull();
    expect(res.body.coreSlots).toEqual([]);
  });

  it('rejette une méthode non supportée', async () => {
    const res = await call({ method: 'DELETE' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, PUT');
  });
});

describe('déclaration', () => {
  it('refuse une clé hors grille plutôt que de la filtrer', async () => {
    const res = await call({ method: 'PUT', body: { slots: ['2-180'] } });
    expect(res.statusCode).toBe(400);
    expect(store.team_availability).toHaveLength(0);
  });

  it('remplace la déclaration précédente au lieu d’en empiler une seconde', async () => {
    await call({ method: 'PUT', body: { slots: [TUE_21] } });
    await call({ method: 'PUT', body: { slots: [THU_21] } });
    expect(store.team_availability).toHaveLength(1);
    expect((store.team_availability[0] as any).slots).toEqual([THU_21]);
  });

  it('accepte le tableau vide — c’est ainsi qu’on se retire', async () => {
    await call({ method: 'PUT', body: { slots: [TUE_21] } });
    const res = await call({ method: 'PUT', body: { slots: [] } });
    expect(res.statusCode).toBe(200);
    expect((store.team_availability[0] as any).slots).toEqual([]);
  });
});

describe('agrégation', () => {
  beforeEach(() => {
    store.team_availability = [
      {
        id: 'av-1',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_A,
        user_id: PLAYER,
        timezone: 'Europe/Paris',
        slots: [TUE_21, THU_21],
      },
      {
        id: 'av-2',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_A,
        user_id: CAPTAIN,
        timezone: 'Europe/Paris',
        slots: [TUE_21],
      },
    ] as any;
  });

  it('compte les membres et sort le noyau au seuil de l’effectif', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.memberCount).toBe(2);
    expect(res.body.declaredCount).toBe(2);
    expect(res.body.threshold).toBe(2);
    expect(res.body.heatmap[TUE_21].count).toBe(2);
    expect(res.body.coreSlots).toEqual([TUE_21]);
  });

  it('projette le noyau en instants réels prêts pour une annonce', async () => {
    const res = await call();
    expect(res.body.suggestedSlots).toHaveLength(1);
    // Un instant, pas une clé de grille : c'est ce que consomme une annonce.
    expect(Number.isFinite(Date.parse(res.body.suggestedSlots[0]))).toBe(true);
    expect(Date.parse(res.body.suggestedSlots[0])).toBeGreaterThan(Date.now());
  });

  it('ignore la déclaration d’un membre qui a quitté l’équipe', async () => {
    // Sinon le noyau resterait atteint grâce à quelqu'un qui ne jouera pas —
    // et l'équipe annoncerait un créneau qu'elle ne peut pas honorer.
    (store.team_availability as any).push({
      id: 'av-orphan',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_A,
      user_id: GONE,
      timezone: 'Europe/Paris',
      slots: [THU_21],
    });
    const res = await call();
    expect(res.body.declaredCount).toBe(2);
    expect(res.body.heatmap[THU_21].count).toBe(1);
    expect(res.body.coreSlots).toEqual([TUE_21]);
  });

  it('renvoie MES créneaux et les noms du roster', async () => {
    const res = await call();
    expect(res.body.mySlots).toEqual([TUE_21, THU_21]);
    expect(res.body.memberNames[CAPTAIN]).toBe('Cap');
  });
});

describe('canAnnounce', () => {
  it('est refusé à une joueuse sans permission scrims', async () => {
    const res = await call();
    expect(res.body.canAnnounce).toBe(false);
  });

  it('est accordé à la capitaine', async () => {
    setAuthUser({ id: CAPTAIN });
    const res = await call();
    expect(res.body.canAnnounce).toBe(true);
  });
});
