// tests/unit/playerUpdateProfilePrivacy.test.ts
//
// /api/player/update-profile — ce que la joueuse voit et contrôle de sa fiche :
//
//   - GET expose la chaîne Twitch EFFECTIVE et son origine (le formulaire
//     affichait un champ vide quand c'était la capitaine qui l'avait saisie) ;
//   - `clear_twitch` retire VRAIMENT le lien publié, roster compris, même
//     sans déclaration préalable de la joueuse ;
//   - un échec d'écriture sur le roster ne passe plus en silence
//     (`rosterSynced: false`) ;
//   - un avatar sur un hôte que l'affichage ne sait pas servir est refusé,
//     sans bloquer une joueuse dont l'avatar historique est déjà sur un tel hôte.
//
// Le cas « un null ne supprime pas la saisie de la capitaine » reste couvert
// par playerUpdateProfileTwitch.test.ts.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
  setTableWriteError,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import handler from '../../pages/api/player/update-profile';

const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUPABASE_AVATAR =
  'https://abcd.supabase.co/storage/v1/object/public/avatars/camille.png';

let _tok = 0;
function makeReq(method: 'GET' | 'PATCH', body?: Record<string, unknown>): any {
  _tok += 1;
  return {
    method,
    headers: {
      host: 'h',
      authorization: `Bearer upp-${Date.now()}-${_tok}`,
    },
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

function seed(rosterTwitch: string | null, meta: Record<string, unknown> = {}) {
  setAuthUser({ id: PLAYER_ID, user_metadata: meta });
  setAdminUser(PLAYER_ID, 'joueuse@example.com', { user_metadata: meta });
  store.team_members = [
    {
      id: 'tm-1',
      team_id: 'team-1',
      user_id: PLAYER_ID,
      role: 'player',
      battle_tag: 'Ply#1',
      twitch: rosterTwitch,
    },
  ] as any;
}

const rosterTwitch = () => (store.team_members?.[0] as any)?.twitch;

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setTableWriteError('team_members', null);
});

describe('GET /api/player/update-profile — chaîne publiée', () => {
  it('expose la valeur saisie par la capitaine avec l’origine roster', async () => {
    seed('saisie_capitaine', {});
    const res = makeRes();
    await handler(makeReq('GET'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      twitch: 'saisie_capitaine',
      twitchOrigin: 'roster',
    });
  });

  it('préfère la déclaration de la joueuse (origine self)', async () => {
    seed('saisie_capitaine', { twitch: 'a_moi' });
    const res = makeRes();
    await handler(makeReq('GET'), res);

    expect(res.body).toEqual({ twitch: 'a_moi', twitchOrigin: 'self' });
  });

  it('répond null/null quand rien n’est publié', async () => {
    seed(null, {});
    const res = makeRes();
    await handler(makeReq('GET'), res);

    expect(res.body).toEqual({ twitch: null, twitchOrigin: null });
  });
});

describe('PATCH clear_twitch — retirer le lien publié', () => {
  it('efface la valeur du roster même sans déclaration préalable', async () => {
    seed('saisie_capitaine', {});
    const res = makeRes();
    await handler(makeReq('PATCH', { clear_twitch: true }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.rosterSynced).toBe(true);
    expect(rosterTwitch()).toBeNull();

    // Et la lecture qui alimente le formulaire le confirme.
    const after = makeRes();
    await handler(makeReq('GET'), after);
    expect(after.body).toEqual({ twitch: null, twitchOrigin: null });
  });

  it('refuse clear_twitch accompagné d’une chaîne non vide', async () => {
    seed('saisie_capitaine', {});
    const res = makeRes();
    await handler(
      makeReq('PATCH', { clear_twitch: true, twitch: 'autre' }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TWITCH_INVALID');
    expect(rosterTwitch()).toBe('saisie_capitaine');
  });
});

describe('PATCH — propagation vers le roster', () => {
  it('répond rosterSynced: false quand l’écriture du roster échoue', async () => {
    seed(null, {});
    setTableWriteError('team_members', { message: 'boom' });
    const res = makeRes();
    await handler(makeReq('PATCH', { battle_tag: 'Ply#4242' }), res);

    // Les métadonnées sont écrites : pas de 500, mais pas de faux succès.
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rosterSynced).toBe(false);
  });

  it('répond rosterSynced: true quand la propagation passe', async () => {
    seed(null, {});
    const res = makeRes();
    await handler(makeReq('PATCH', { battle_tag: 'Ply#4242' }), res);

    expect(res.body.rosterSynced).toBe(true);
    expect((store.team_members?.[0] as any).battle_tag).toBe('Ply#4242');
  });
});

describe('PATCH avatar_url — hôte affichable', () => {
  it('refuse un hôte hors remotePatterns avec un code explicite', async () => {
    seed(null, {});
    const res = makeRes();
    await handler(
      makeReq('PATCH', { avatar_url: 'https://i.imgur.com/abcd.png' }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('AVATAR_HOST_UNSUPPORTED');
  });

  it('accepte une image du stockage public Supabase', async () => {
    seed(null, {});
    const res = makeRes();
    await handler(makeReq('PATCH', { avatar_url: SUPABASE_AVATAR }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.avatar_url).toBe(SUPABASE_AVATAR);
  });

  it('ne bloque pas l’enregistrement quand l’avatar historique (hôte non déclaré) est renvoyé tel quel', async () => {
    const legacy = 'https://i.imgur.com/ancien.png';
    seed(null, { avatar_url: legacy });
    const res = makeRes();
    await handler(
      makeReq('PATCH', { battle_tag: 'Ply#4242', avatar_url: legacy }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((store.team_members?.[0] as any).battle_tag).toBe('Ply#4242');
  });
});
