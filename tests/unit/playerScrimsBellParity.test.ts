// tests/unit/playerScrimsBellParity.test.ts
//
// La cloche et le tableau de bord comptent les MÊMES scrims.
//
// Avant : `/api/player/notifications` comptait toute demande de scrim
// `pending` adressée à l'équipe ; `/api/player/dashboard` ne gardait que celles
// où c'est à l'équipe de répondre, dans les deux sens. Une contre-proposition
// en attente de l'adversaire faisait donc « 1 » sur la cloche et rien sur le
// tableau de bord — un badge fantôme. Une seule règle désormais
// (utils/teams/scrimsAwaitingTeam.ts).
//
// Même fichier : les allègements de lecture du tableau de bord ne changent
// aucun total affiché (messages non lus, historique des demandes).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import dashboardHandler, {
  DEMANDES_HISTORY_LIMIT,
} from '../../pages/api/player/dashboard';
import notificationsHandler from '../../pages/api/player/notifications';
import { isTeamsTurn } from '../../utils/teams/scrimsAwaitingTeam';

const CAPTAIN = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OPP = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const OTHER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

let _t = 0;
function makeReq(): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    query: {},
    body: {},
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

const at = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

function seedTeam() {
  store.teams = [
    { id: TEAM, name: 'Alpha', captain_id: CAPTAIN, is_active: true },
    { id: OPP, name: 'Bravo', captain_id: 'someone', is_active: true },
  ] as any;
  store.team_members = [
    { id: 'm-cap', team_id: TEAM, user_id: CAPTAIN, role: 'player' },
  ] as any;
}

function scrim(
  id: string,
  over: { team_id: string; payload: Record<string, unknown> }
) {
  return {
    id,
    type: 'scrim',
    status: 'pending',
    source: 'website',
    user_id: null,
    comment: null,
    created_at: at(5),
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CAPTAIN });
});

async function both() {
  const d = makeRes();
  await dashboardHandler(makeReq(), d);
  const n = makeRes();
  await notificationsHandler(makeReq(), n);
  expect(d.statusCode).toBe(200);
  expect(n.statusCode).toBe(200);
  return { dashboard: d.body as any, bell: n.body as any };
}

describe('règle « c’est à l’équipe de répondre »', () => {
  it('prédicat pur : proposée par l’autre camp (ou héritée) = à nous', () => {
    expect(isTeamsTurn({ payload: null }, TEAM)).toBe(true);
    expect(isTeamsTurn({ payload: { from_team_id: OPP } }, TEAM)).toBe(true);
    // Demande émise par nous, jamais contrée : la balle est chez l'adversaire.
    expect(isTeamsTurn({ payload: { from_team_id: TEAM } }, TEAM)).toBe(false);
    expect(
      isTeamsTurn(
        {
          payload: {
            from_team_id: OPP,
            scrim_nego: { slots: [at(-60)], proposed_by: TEAM, rounds: 2 },
          },
        },
        TEAM
      )
    ).toBe(false);
  });
});

describe('cloche = tableau de bord', () => {
  it('compte les mêmes scrims, dans les deux sens', async () => {
    seedTeam();
    store.demandes = [
      // (a) Reçue, jamais contrée : à nous → compte.
      scrim('a', { team_id: TEAM, payload: { from_team_id: OPP } }),
      // (b) Reçue, mais NOUS avons contré : à l'adversaire → ne compte pas.
      //     C'est le badge fantôme d'avant.
      scrim('b', {
        team_id: TEAM,
        payload: {
          from_team_id: OPP,
          scrim_nego: { slots: [at(-60)], proposed_by: TEAM, rounds: 2 },
        },
      }),
      // (b2) Idem, une seconde : sans elle, l'ancienne cloche (a + b) tombait
      //      par hasard sur le même total que la règle juste (a + c).
      scrim('b2', {
        team_id: TEAM,
        payload: {
          from_team_id: OTHER,
          scrim_nego: { slots: [at(-30)], proposed_by: TEAM, rounds: 3 },
        },
      }),
      // (c) Émise par nous, l'adversaire a contré : à nous → compte. La cloche
      //     l'ignorait (team_id = l'adversaire).
      scrim('c', {
        team_id: OPP,
        payload: {
          from_team_id: TEAM,
          scrim_nego: { slots: [at(-90)], proposed_by: OPP, rounds: 2 },
        },
      }),
      // (d) Émise par nous, sans réponse : à l'adversaire → ne compte pas.
      scrim('d', { team_id: OPP, payload: { from_team_id: TEAM } }),
      // (e) Une autre équipe, sans rapport.
      scrim('e', { team_id: OTHER, payload: { from_team_id: OPP } }),
    ] as any;

    const { dashboard, bell } = await both();
    expect(dashboard.pendingScrims.map((s: any) => s.id).sort()).toEqual([
      'a',
      'c',
    ]);
    expect(bell.pendingScrims).toBe(2);
    expect(bell.pendingScrims).toBe(dashboard.pendingScrims.length);
  });
});

/**
 * L'ancien calcul du tableau de bord, recopié tel quel : tous les messages
 * envoyés ET reçus, regroupés par conversation, somme des non-lus. Sert
 * d'oracle au `count` qui l'a remplacé.
 */
function legacyUnread(rows: any[], teamId: string): number {
  const conv = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const unreadByConv = new Map<string, number>();
  for (const msg of rows.filter(
    (m) =>
      m.type === 'captain_message' &&
      (m.team_id === teamId || m.payload?.from_team_id === teamId)
  )) {
    const payload = msg.payload || {};
    const convId =
      payload.conversation_id || conv(payload.from_team_id || '', msg.team_id);
    const isUnread = msg.team_id === teamId && msg.status === 'pending';
    if (isUnread) unreadByConv.set(convId, (unreadByConv.get(convId) || 0) + 1);
    else if (!unreadByConv.has(convId)) unreadByConv.set(convId, 0);
  }
  let total = 0;
  for (const n of unreadByConv.values()) total += n;
  return total;
}

describe('messages non lus — même total qu’avant l’allègement', () => {
  it('compte les reçus non lus, ignore envoyés, lus et autres équipes', async () => {
    seedTeam();
    const msg = (
      id: string,
      team_id: string,
      from: string,
      status: string,
      conversation_id?: string
    ) => ({
      id,
      type: 'captain_message',
      team_id,
      user_id: 'x',
      status,
      comment: 'hi',
      payload: { from_team_id: from, conversation_id },
      created_at: at(1),
    });
    store.demandes = [
      msg('m1', TEAM, OPP, 'pending', 'c1'),
      msg('m2', TEAM, OPP, 'pending', 'c1'),
      msg('m3', TEAM, OTHER, 'pending'), // conversation déduite
      msg('m4', TEAM, OPP, 'approved', 'c1'), // lu
      msg('m5', OPP, TEAM, 'pending', 'c1'), // envoyé par nous
      msg('m6', OTHER, OPP, 'pending'), // sans rapport
    ] as any;

    const expected = legacyUnread(store.demandes as any[], TEAM);
    expect(expected).toBe(3);

    const { dashboard, bell } = await both();
    expect(dashboard.unreadMessages).toBe(expected);
    // La cloche applique la même définition depuis toujours.
    expect(bell.unreadMessages).toBe(expected);
  });
});

describe('historique des demandes — colonnes explicites et plafond', () => {
  it('garde la demande en cours et les champs lus par l’écran', async () => {
    seedTeam();
    const rows: any[] = [];
    for (let i = 0; i < DEMANDES_HISTORY_LIMIT + 10; i++) {
      rows.push({
        id: `j-${i}`,
        type: 'join',
        status: 'rejected',
        user_id: CAPTAIN,
        team_id: OPP,
        comment: null,
        staff_note: null,
        payload: { team_name: 'Bravo' },
        created_at: at(1000 + i),
        updated_at: at(900 + i),
        processed_at: at(900 + i),
      });
    }
    // La plus récente, en cours : doit survivre au plafond.
    rows.push({
      id: 'j-current',
      type: 'join',
      status: 'pending',
      user_id: CAPTAIN,
      team_id: OPP,
      comment: 'coucou',
      staff_note: null,
      payload: { team_name: 'Bravo' },
      created_at: at(1),
    });
    store.demandes = rows;

    const d = makeRes();
    await dashboardHandler(makeReq(), d);
    const b = d.body as any;
    expect(b.demandesJoin).toHaveLength(DEMANDES_HISTORY_LIMIT);
    expect(b.demandesJoin[0].id).toBe('j-current');
    expect(b.demandesJoin[0].status).toBe('pending');
    expect(b.demandesJoin[0].comment).toBe('coucou');
    expect(b.demandesJoin[0].payload).toEqual({ team_name: 'Bravo' });
  });

  it('sous le plafond, rend tout l’historique comme avant', async () => {
    seedTeam();
    store.demandes = [
      {
        id: 'c-1',
        type: 'captain_request',
        status: 'approved',
        user_id: CAPTAIN,
        payload: { team_name: 'Alpha' },
        created_at: at(10),
      },
      {
        id: 'c-2',
        type: 'captain_request',
        status: 'cancelled',
        user_id: CAPTAIN,
        payload: { team_name: 'Alpha' },
        created_at: at(20),
      },
    ] as any;
    const d = makeRes();
    await dashboardHandler(makeReq(), d);
    expect((d.body as any).demandesCaptain.map((x: any) => x.id)).toEqual([
      'c-1',
      'c-2',
    ]);
  });
});
