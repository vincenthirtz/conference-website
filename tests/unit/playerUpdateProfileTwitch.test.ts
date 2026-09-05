// La chaîne Twitch d'une joueuse a DEUX écritures possibles — elle-même sur son
// compte (ce handler), sa capitaine ou une manager sur la fiche de roster
// (`/api/teams/[teamId]/members/[memberId]/profile`) — et UNE colonne d'arrivée
// commune, `team_members.twitch`, que lit la page publique de l'équipe.
//
// Ce fichier garde la règle qui rend les deux écritures compatibles : la
// déclaration de la joueuse fait autorité, mais un champ laissé vide par
// quelqu'un qui n'avait rien déclaré n'efface pas ce que sa capitaine a saisi.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import handler from '../../pages/api/player/update-profile';

const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MEMBER_ID = '33333333-3333-3333-3333-333333333333';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(body: Record<string, unknown>): any {
  return {
    method: 'PATCH',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body,
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

/** Seed la joueuse + sa fiche de roster. `meta` = son `user_metadata`. */
function seed(rosterTwitch: string | null, meta: Record<string, unknown> = {}) {
  setAuthUser({ id: PLAYER_ID, user_metadata: meta });
  setAdminUser(PLAYER_ID, 'joueuse@example.com', { user_metadata: meta });
  store.team_members = [
    {
      id: MEMBER_ID,
      team_id: TEAM_ID,
      user_id: PLAYER_ID,
      role: 'player',
      battle_tag: 'Ply#1',
      twitch: rosterTwitch,
      specialty: null,
      skill_rating: null,
    },
  ] as any;
}

const rosterTwitch = () => (store.team_members?.[0] as any)?.twitch;

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
});

describe('PATCH /api/player/update-profile — chaîne Twitch', () => {
  it('accepte un pseudo et le propage sur la fiche de roster', async () => {
    seed(null);
    const res = makeRes();
    await handler(makeReq({ twitch: 'ma_chaine' }), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).twitch).toBe('ma_chaine');
    // Sans propagation, la joueuse aurait déclaré sa chaîne et ne la verrait
    // nulle part sur le roster où elle joue.
    expect(rosterTwitch()).toBe('ma_chaine');
  });

  it('accepte une URL twitch.tv complète', async () => {
    seed(null);
    const res = makeRes();
    await handler(makeReq({ twitch: 'https://twitch.tv/ma_chaine' }), res);

    expect(res.statusCode).toBe(200);
    expect(rosterTwitch()).toBe('https://twitch.tv/ma_chaine');
  });

  it('refuse une URL vers un autre domaine', async () => {
    seed(null);
    const res = makeRes();
    await handler(makeReq({ twitch: 'https://discord.gg/abcd' }), res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('TWITCH_INVALID');
    expect(rosterTwitch()).toBeNull();
  });

  it('refuse un pseudo mal formé', async () => {
    seed(null);
    const res = makeRes();
    await handler(makeReq({ twitch: 'pseudo avec espaces' }), res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('TWITCH_INVALID');
  });

  it('efface la chaîne quand la joueuse avait déclaré la sienne', async () => {
    seed('ancienne_chaine', { twitch: 'ancienne_chaine' });
    const res = makeRes();
    await handler(makeReq({ twitch: null }), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).twitch).toBeNull();
    expect(rosterTwitch()).toBeNull();
  });

  it("n'efface PAS la chaîne saisie par la capitaine quand la joueuse n'avait rien déclaré", async () => {
    // Le cas réel : la capitaine a renseigné la chaîne, la joueuse ouvre son
    // profil pour corriger son BattleTag. Le formulaire envoie `twitch: null`
    // parce que le champ est vide — ça ne doit rien effacer.
    seed('saisie_par_la_capitaine', {});
    const res = makeRes();
    await handler(makeReq({ battle_tag: 'Ply#4242', twitch: null }), res);

    expect(res.statusCode).toBe(200);
    expect(rosterTwitch()).toBe('saisie_par_la_capitaine');
    // Le reste de la sauvegarde passe normalement.
    expect((store.team_members?.[0] as any).battle_tag).toBe('Ply#4242');
  });

  it('ne touche pas à la chaîne quand la clé est absente du corps', async () => {
    seed('saisie_par_la_capitaine', {});
    const res = makeRes();
    await handler(makeReq({ display_name: 'Nouvelle' }), res);

    expect(res.statusCode).toBe(200);
    expect(rosterTwitch()).toBe('saisie_par_la_capitaine');
  });
});
