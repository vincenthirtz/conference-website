// Catégorie « L'association » du TCG.
// Targets : pages/api/admin/tcg/association.ts, pages/api/admin/tcg/fanart.ts,
//           utils/tcg/fanart.ts, utils/tcg/readCardFaces.ts
//
// CE QUE CES CAS PROTÈGENT :
//   1. UNE CARTE DE L'ASSOCIATION N'A PAS DE PROPOSANTE. `submitted_by` reste
//      NULL : l'effacement du compte d'un membre du staff ne doit pas retirer
//      des cartes que d'autres possèdent.
//   2. UN LOGO D'ÉVÉNEMENT EST COPIÉ, UNE FOIS. La carte ne pointe pas sur le
//      fichier du calendrier, et un second import est refusé.
//   3. LES DEUX FILES NE SE MÉLANGENT PAS : la modération des fan arts ne voit
//      pas les cartes de l'association, et inversement.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  storageCopies,
  storageUploads,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  bucketPathFromPublicUrl,
  fanartCategoryOf,
} from '../../utils/tcg/fanart';
import { readFanartFaces } from '../../utils/tcg/readCardFaces';
import handler from '../../pages/api/admin/tcg/association';
import fanartAdminHandler from '../../pages/api/admin/tcg/fanart';

const STAFF = '22222222-0000-4000-8000-000000000002';
const ASSO = '44444444-0000-4000-8000-000000000004';
const FANART = '33333333-0000-4000-8000-000000000003';
const LOGO_URL =
  'https://abc.supabase.co/storage/v1/object/public/teams-images/logo-rose-8ec9.png';

const PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let _token = 0;
function makeReq(over: Partial<any> = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

async function call(h: typeof handler, over: Partial<any> = {}) {
  const res = makeRes();
  await h(makeReq(over), res);
  return res;
}

const rows = () => (store.tcg_fanart_cards ?? []) as any[];

function seedLogos(logos: Array<Record<string, unknown>>) {
  store.site_settings = [
    {
      tenant_id: DEFAULT_TENANT_ID,
      key: 'seasonal_logos',
      value: JSON.stringify(logos),
    },
  ] as any;
}

const ROSE = {
  id: 'logo-rose',
  name: 'Octobre Rose',
  url: LOGO_URL,
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  enabled: true,
};

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-staff' });
  store.staff = [
    {
      id: STAFF,
      auth_user_id: 'user-staff',
      email: 'staff@example.com',
      role: 'owner',
      is_pole_admin: false,
    },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('règles pures', () => {
  it('extrait le chemin du bucket d’une URL publique', () => {
    expect(bucketPathFromPublicUrl(LOGO_URL, 'teams-images')).toBe(
      'logo-rose-8ec9.png'
    );
  });

  it('refuse un chemin du site, un autre bucket ou une remontée', () => {
    expect(
      bucketPathFromPublicUrl('/img/logos/2026-logo.png', 'teams-images')
    ).toBeNull();
    expect(
      bucketPathFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/autre/x.png',
        'teams-images'
      )
    ).toBeNull();
    expect(
      bucketPathFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/teams-images/../x.png',
        'teams-images'
      )
    ).toBeNull();
  });

  it('ramène toute valeur inconnue à « fanart »', () => {
    expect(fanartCategoryOf('association')).toBe('association');
    expect(fanartCategoryOf(null)).toBe('fanart');
    expect(fanartCategoryOf('autre')).toBe('fanart');
  });
});

describe('POST /api/admin/tcg/association — dépôt', () => {
  it('publie tout de suite, sans proposante, avec le crédit par défaut', async () => {
    const res = await call(handler, {
      method: 'POST',
      body: {
        action: 'upload',
        data: PNG_BASE64,
        mimeType: 'image/png',
        title: 'Staff au complet',
        rarity: 'epic',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      category: 'association',
      submitted_by: null,
      status: 'approved',
      rarity: 'epic',
      reviewed_by: STAFF,
    });
    expect(rows()[0].artist_name).toBe('L’association');
    expect(storageUploads[0].path).toMatch(/^tcg-association\//);
  });

  it('refuse un titre trop court', async () => {
    const res = await call(handler, {
      method: 'POST',
      body: {
        action: 'upload',
        data: PNG_BASE64,
        mimeType: 'image/png',
        title: 'x',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(rows()).toHaveLength(0);
  });
});

describe('POST /api/admin/tcg/association — logo d’événement', () => {
  it('copie le logo et note son origine', async () => {
    seedLogos([ROSE]);
    const res = await call(handler, {
      method: 'POST',
      body: { action: 'import_logo', logoId: 'logo-rose' },
    });

    expect(res.statusCode).toBe(201);
    expect(storageCopies).toHaveLength(1);
    expect(storageCopies[0].from).toBe('logo-rose-8ec9.png');
    expect(storageCopies[0].to).toMatch(/^tcg-association\/.+\.png$/);
    expect(rows()[0]).toMatchObject({
      category: 'association',
      source_ref: 'seasonal:logo-rose',
      title: 'Octobre Rose',
      image_path: storageCopies[0].to,
    });
  });

  it('refuse un second import du même logo', async () => {
    seedLogos([ROSE]);
    await call(handler, {
      method: 'POST',
      body: { action: 'import_logo', logoId: 'logo-rose' },
    });
    const res = await call(handler, {
      method: 'POST',
      body: { action: 'import_logo', logoId: 'logo-rose' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('already_imported');
    expect(rows()).toHaveLength(1);
  });

  it('refuse un logo hébergé hors du bucket', async () => {
    seedLogos([{ ...ROSE, url: '/img/logos/2026-logo.png' }]);
    const res = await call(handler, {
      method: 'POST',
      body: { action: 'import_logo', logoId: 'logo-rose' },
    });
    expect(res.statusCode).toBe(422);
    expect(storageCopies).toHaveLength(0);
  });

  it('liste les logos avec leur état d’import', async () => {
    seedLogos([ROSE, { ...ROSE, id: 'logo-site', url: '/img/x.png' }]);
    await call(handler, {
      method: 'POST',
      body: { action: 'import_logo', logoId: 'logo-rose' },
    });

    const res = await call(handler);

    expect(res.statusCode).toBe(200);
    const byId = Object.fromEntries(
      res.body.eventLogos.map((l: any) => [l.id, l])
    );
    expect(byId['logo-rose'].cardId).toBe(rows()[0].id);
    expect(byId['logo-site']).toMatchObject({
      importable: false,
      cardId: null,
    });
    expect(res.body.items).toHaveLength(1);
  });
});

describe('PATCH /api/admin/tcg/association', () => {
  beforeEach(() => {
    store.tcg_fanart_cards = [
      {
        id: ASSO,
        tenant_id: DEFAULT_TENANT_ID,
        category: 'association',
        submitted_by: null,
        title: 'Octobre Rose',
        artist_name: 'L’association',
        image_path: 'tcg-association/rose.png',
        status: 'approved',
        rarity: 'rare',
        source_ref: 'seasonal:logo-rose',
        created_at: '2026-09-28T10:00:00.000Z',
      },
      {
        id: FANART,
        tenant_id: DEFAULT_TENANT_ID,
        category: 'fanart',
        submitted_by: '11111111-0000-4000-8000-000000000001',
        title: 'Hinode en garde',
        artist_name: 'Lya',
        image_path: 'tcg-fanart/lya.png',
        status: 'approved',
        rarity: 'epic',
        created_at: '2026-09-15T10:00:00.000Z',
      },
    ] as any;
  });

  it('retire puis rétablit', async () => {
    let res = await call(handler, {
      method: 'PATCH',
      body: { action: 'revoke', id: ASSO },
    });
    expect(res.statusCode).toBe(200);
    expect(rows()[0].status).toBe('revoked');

    res = await call(handler, {
      method: 'PATCH',
      body: { action: 'restore', id: ASSO },
    });
    expect(res.statusCode).toBe(200);
    expect(rows()[0].status).toBe('approved');
  });

  it('ne touche jamais une fan art de la communauté', async () => {
    const res = await call(handler, {
      method: 'PATCH',
      body: { action: 'revoke', id: FANART },
    });
    expect(res.statusCode).toBe(409);
    expect(rows()[1].status).toBe('approved');
  });

  it('la file des fan arts ne montre pas l’association', async () => {
    const res = await call(fanartAdminHandler as any, {
      query: { status: 'approved' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.items.map((i: any) => i.id)).toEqual([FANART]);
  });

  it('la face de carte porte sa catégorie', async () => {
    const faces = await readFanartFaces(DEFAULT_TENANT_ID, [ASSO, FANART]);
    expect(faces.get(ASSO)?.category).toBe('association');
    expect(faces.get(FANART)?.category).toBe('fanart');
  });
});
