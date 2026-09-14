// Unit tests — illustration de la carte TCG d'une équipe.
//
//   POST/DELETE /api/teams/[teamId]/tcg-image → dépose / retire
//   readTeamFaces()                            → résout l'URL, ou laisse null
//
// Ce qui est vérifié, au-delà du chemin heureux :
//   - la garde est `manage_team_info` : une joueuse du roster n'y touche pas,
//     la capitaine oui, et le staff `>= admin` passe sur n'importe quelle équipe
//     (c'est ce qui fait tenir « capitaine OU staff » sur une seule route) ;
//   - un remplacement SUPPRIME le fichier précédent — sans quoi le bucket
//     accumule des orphelins que plus rien ne référence ;
//   - une écriture en base qui échoue ne laisse pas derrière elle le fichier
//     qu'on venait de poser ;
//   - le REPLI : sans illustration, la face ne fabrique pas d'URL vide, elle
//     rend `null` et c'est la carte qui retombe sur le logo.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setStorageUploadResult,
  setTableWriteError,
  storageUploads,
  storageRemovals,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import handler from '../../pages/api/teams/[teamId]/tcg-image';
import { readTeamFaces } from '../../utils/tcg/readCardFaces';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

let _tok = 0;
const freshToken = () => `t-${Date.now()}-${(_tok += 1)}`;

/** 1×1 PNG, vrais magic bytes. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: { teamId: TEAM_ID },
    body: { data: PNG_BASE64, mimeType: 'image/png' },
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

function seedTeam(tcgImagePath: string | null = null) {
  store.teams = [
    {
      id: TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha',
      short_name: 'ALP',
      slug: 'alpha',
      logo_url: 'https://cdn.example.test/logo.png',
      tcg_image_path: tcgImagePath,
      captain_id: CAPTAIN_ID,
      is_active: true,
    },
  ] as any;
  store.team_members = [
    { id: 'tm-cap', team_id: TEAM_ID, user_id: CAPTAIN_ID, role: 'player' },
    { id: 'tm-ply', team_id: TEAM_ID, user_id: PLAYER_ID, role: 'player' },
  ] as any;
}

const teamRow = () => (store.teams as any[])[0];

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CAPTAIN_ID });
  setStorageUploadResult({ error: null });
  seedTeam();
});

describe('garde', () => {
  it('refuse une méthode autre que POST/DELETE', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('refuse un teamId qui n’est pas un UUID', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { teamId: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('refuse une joueuse du roster sans permission (403)', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(403);
    // Et rien n'est parti dans le bucket au passage.
    expect(storageUploads).toHaveLength(0);
  });

  it('accepte la capitaine', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
  });

  it('accepte le staff sur une équipe dont il n’est pas membre', async () => {
    // C'est le bypass de `hasTeamPermission` qui fait tenir « capitaine OU
    // staff » sur une seule route, sans handler d'administration parallèle.
    const STAFF_AUTH = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    store.staff = [
      {
        id: 'staff-1',
        auth_user_id: STAFF_AUTH,
        role: 'admin',
        is_active: true,
      },
    ] as any;
    setAuthUser({ id: STAFF_AUTH });

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('dépôt', () => {
  it('range le fichier sous tcg/ et enregistre le CHEMIN, pas l’URL', async () => {
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(storageUploads).toHaveLength(1);
    expect(storageUploads[0].bucket).toBe('teams-images');
    expect(storageUploads[0].path).toMatch(
      new RegExp(`^tcg/team-${TEAM_ID}-[0-9a-f]{16}\\.png$`)
    );
    // En base : le chemin. L'URL est dérivée à la lecture.
    expect(teamRow().tcg_image_path).toBe(storageUploads[0].path);
    expect(res.body.url).toContain(storageUploads[0].path);
  });

  it('refuse un type non supporté', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { data: PNG_BASE64, mimeType: 'image/gif' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('unsupported_type');
    expect(teamRow().tcg_image_path).toBeNull();
  });

  it('refuse un contenu qui ne correspond pas au type annoncé', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        // Des octets quelconques présentés comme du PNG.
        body: {
          data: Buffer.from('pas une image').toString('base64'),
          mimeType: 'image/png',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('content_mismatch');
    expect(storageUploads).toHaveLength(0);
  });

  it('supprime le fichier précédent quand on remplace', async () => {
    seedTeam('tcg/team-old-deadbeef.png');

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(storageRemovals.flatMap((r) => r.paths)).toContain(
      'tcg/team-old-deadbeef.png'
    );
    expect(teamRow().tcg_image_path).not.toBe('tcg/team-old-deadbeef.png');
  });

  it('ne laisse pas le fichier derrière lui si l’écriture en base échoue', async () => {
    setTableWriteError('teams', { message: 'boom' });

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(500);
    // Le fichier vient d'être posé, plus rien ne le référencera : il repart.
    const uploaded = storageUploads[0]?.path;
    expect(uploaded).toBeTruthy();
    expect(storageRemovals.flatMap((r) => r.paths)).toContain(uploaded);
  });
});

describe('retrait', () => {
  it('vide la colonne et supprime le fichier', async () => {
    seedTeam('tcg/team-x-1234.png');

    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', body: {} }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.url).toBeNull();
    expect(teamRow().tcg_image_path).toBeNull();
    expect(storageRemovals.flatMap((r) => r.paths)).toContain(
      'tcg/team-x-1234.png'
    );
  });
});

describe('repli sur le logo', () => {
  it('résout l’URL de l’illustration quand elle existe', async () => {
    seedTeam('tcg/team-x-1234.png');

    const faces = await readTeamFaces(CONFERENCE_TENANT_ID, [TEAM_ID]);
    const face = faces.get(TEAM_ID)!;

    expect(face.cardImageUrl).toContain('tcg/team-x-1234.png');
    // Le logo reste lisible À CÔTÉ : les deux champs ne se confondent pas,
    // parce que le cadrage de la carte en dépend.
    expect(face.logoUrl).toBe('https://cdn.example.test/logo.png');
  });

  it('rend null — pas une URL vide — quand l’équipe n’a rien déposé', async () => {
    const faces = await readTeamFaces(CONFERENCE_TENANT_ID, [TEAM_ID]);
    const face = faces.get(TEAM_ID)!;

    expect(face.cardImageUrl).toBeNull();
    expect(face.logoUrl).toBe('https://cdn.example.test/logo.png');
  });
});
