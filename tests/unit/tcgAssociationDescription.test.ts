// Description « à propos » des cartes de la catégorie « L'association ».
// Targets : utils/tcg/cardDescription.ts, pages/api/admin/tcg/association.ts,
//           utils/tcg/readCardFaces.ts (readFanartFaces)
//
// CE QUE CES CAS PROTÈGENT :
//   1. TEXTE BRUT, NETTOYÉ : caractères de contrôle et invisibles retirés,
//      liens et balises REFUSÉS (jamais supprimés en silence).
//   2. SEUL LE STAFF ÉCRIT, ET SEULEMENT SUR L'ASSOCIATION : la route ne
//      touche jamais une fan art, et une face de fan art ne rend jamais de
//      description même si la ligne en portait une.
//   3. UNE DESCRIPTION REFUSÉE NE LAISSE PAS D'IMAGE dans le bucket public.
//   4. MIGRATION NON APPLIQUÉE : écrire une description répond 503
//      `migration_pending`, pas 500.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setTableWriteError,
  storageUploads,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  CARD_DESCRIPTION_MAX,
  CARD_DESCRIPTION_MAX_LINES,
  cardDescriptionLength,
  normalizeCardDescription,
} from '../../utils/tcg/cardDescription';
import { readFanartFaces } from '../../utils/tcg/readCardFaces';
import handler from '../../pages/api/admin/tcg/association';

const STAFF = '22222222-0000-4000-8000-000000000002';
const ASSO = '44444444-0000-4000-8000-000000000004';
const FANART = '33333333-0000-4000-8000-000000000003';

const PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let _token = 0;
function makeReq(over: Partial<any> = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer d-${Date.now()}-${_token}` },
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

async function call(over: Partial<any> = {}) {
  const res = makeRes();
  await handler(makeReq(over), res);
  return res;
}

const rows = () => (store.tcg_fanart_cards ?? []) as any[];
const byId = (id: string) => rows().find((r) => r.id === id);

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

describe('normalizeCardDescription — règles pures', () => {
  it('vide ou absent → null (effacer est un geste valide)', () => {
    expect(normalizeCardDescription(null)).toEqual({
      ok: true,
      description: null,
    });
    expect(normalizeCardDescription(undefined)).toEqual({
      ok: true,
      description: null,
    });
    expect(normalizeCardDescription('  \n\t  ')).toEqual({
      ok: true,
      description: null,
    });
  });

  it('retire contrôles, invisibles et inversions de sens, unifie les espaces', () => {
    const raw = '  Arukdo\u0007  organise​ la‮ Cup\r\n\r\n\r\n\r\nSon   chat. ';
    expect(normalizeCardDescription(raw)).toEqual({
      ok: true,
      description: 'Arukdo organise la Cup\n\nSon chat.',
    });
  });

  it.each([
    'Rejoins https://exemple.org',
    'mon site : www.exemple.fr',
    'discord.gg/abcdef',
    'Passe sur monsite.gg',
    'contact: arukdo.fr',
    'javascript://x',
  ])('refuse un lien : %s', (raw) => {
    expect(normalizeCardDescription(raw)).toEqual({
      ok: false,
      code: 'links_not_allowed',
    });
  });

  it('ne prend pas une extension isolée pour un lien', () => {
    expect(normalizeCardDescription('J’aime le .gg et les maps.')).toEqual({
      ok: true,
      description: 'J’aime le .gg et les maps.',
    });
  });

  it('refuse une balise HTML, accepte des chevrons qui n’en sont pas', () => {
    expect(normalizeCardDescription('<b>gras</b>')).toEqual({
      ok: false,
      code: 'markup_not_allowed',
    });
    expect(normalizeCardDescription('<img src=x onerror=alert(1)>')).toEqual({
      ok: false,
      code: 'markup_not_allowed',
    });
    expect(normalizeCardDescription('2 < 3 et <3')).toEqual({
      ok: true,
      description: '2 < 3 et <3',
    });
  });

  it('borne la longueur APRÈS nettoyage, en caractères', () => {
    const exact = 'é'.repeat(CARD_DESCRIPTION_MAX);
    expect(normalizeCardDescription(exact)).toEqual({
      ok: true,
      description: exact,
    });
    expect(normalizeCardDescription(`${exact}x`)).toEqual({
      ok: false,
      code: 'too_long',
    });
    // Des espaces doublés ne comptent pas : ils seront retirés.
    expect(cardDescriptionLength(`a${' '.repeat(10)}b`)).toBe(3);
  });

  it('plafonne le nombre de lignes en recollant la fin', () => {
    const raw = Array.from({ length: 9 }, (_, i) => `l${i}`).join('\n');
    const res = normalizeCardDescription(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const lines = (res.description ?? '').split('\n');
    expect(lines).toHaveLength(CARD_DESCRIPTION_MAX_LINES);
    expect(lines.at(-1)).toBe('l5 l6 l7 l8');
  });
});

describe('POST /api/admin/tcg/association — description au dépôt', () => {
  it('enregistre la description nettoyée et la rend', async () => {
    const res = await call({
      method: 'POST',
      body: {
        action: 'upload',
        data: PNG_BASE64,
        mimeType: 'image/png',
        title: 'Arukdo',
        rarity: 'rare',
        description: '  Organise la Cup.​  Sur la photo : son chat. ',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(rows()[0].description).toBe(
      'Organise la Cup. Sur la photo : son chat.'
    );
    expect(res.body.item.description).toBe(
      'Organise la Cup. Sur la photo : son chat.'
    );
  });

  it('refuse une description avec lien AVANT d’envoyer l’image', async () => {
    const res = await call({
      method: 'POST',
      body: {
        action: 'upload',
        data: PNG_BASE64,
        mimeType: 'image/png',
        title: 'Arukdo',
        description: 'Suivez-moi sur twitch.tv/arukdo',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('links_not_allowed');
    expect(storageUploads).toHaveLength(0);
    expect(rows()).toHaveLength(0);
  });

  it('sans description, la carte n’en porte pas', async () => {
    const res = await call({
      method: 'POST',
      body: {
        action: 'upload',
        data: PNG_BASE64,
        mimeType: 'image/png',
        title: 'Staff',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(rows()[0].description ?? null).toBeNull();
    expect(res.body.item.description).toBeNull();
  });
});

describe('PATCH /api/admin/tcg/association — description', () => {
  beforeEach(() => {
    store.tcg_fanart_cards = [
      {
        id: ASSO,
        tenant_id: DEFAULT_TENANT_ID,
        category: 'association',
        submitted_by: null,
        title: 'Arukdo',
        artist_name: 'Arukdo',
        image_path: 'tcg-association/arukdo-chat-v1.webp',
        status: 'approved',
        rarity: 'rare',
        source_ref: 'staff:arukdo:v1',
        description: null,
        created_at: '2026-10-12T10:00:00.000Z',
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
        // Ne devrait pas exister (CHECK) : sert à prouver qu'on ne l'affiche pas.
        description: 'texte qui ne doit jamais sortir',
        created_at: '2026-09-15T10:00:00.000Z',
      },
    ] as any;
  });

  it('écrit, puis efface avec null', async () => {
    let res = await call({
      method: 'PATCH',
      body: { action: 'update', id: ASSO, description: 'À propos.' },
    });
    expect(res.statusCode).toBe(200);
    expect(byId(ASSO).description).toBe('À propos.');

    res = await call({
      method: 'PATCH',
      body: { action: 'update', id: ASSO, description: null },
    });
    expect(res.statusCode).toBe(200);
    expect(byId(ASSO).description).toBeNull();
  });

  it('un champ absent ne touche pas la description', async () => {
    byId(ASSO).description = 'Gardée.';
    const res = await call({
      method: 'PATCH',
      body: { action: 'update', id: ASSO, rarity: 'epic' },
    });
    expect(res.statusCode).toBe(200);
    expect(byId(ASSO)).toMatchObject({
      rarity: 'epic',
      description: 'Gardée.',
    });
  });

  it('refuse une balise, avec un code stable', async () => {
    const res = await call({
      method: 'PATCH',
      body: { action: 'update', id: ASSO, description: '<script>x</script>' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'markup_not_allowed',
      maxLength: CARD_DESCRIPTION_MAX,
    });
    expect(byId(ASSO).description).toBeNull();
  });

  it('ne décrit jamais une fan art de la communauté', async () => {
    const res = await call({
      method: 'PATCH',
      body: { action: 'update', id: FANART, description: 'Détournée.' },
    });
    expect(res.statusCode).toBe(409);
    expect(byId(FANART).description).toBe('texte qui ne doit jamais sortir');
  });

  it('migration non appliquée : 503 migration_pending, pas 500', async () => {
    setTableWriteError('tcg_fanart_cards', {
      message:
        'column "description" of relation "tcg_fanart_cards" does not exist',
    });
    const res = await call({
      method: 'PATCH',
      body: { action: 'update', id: ASSO, description: 'À propos.' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('migration_pending');
  });

  it('la liste staff rend la description et la borne', async () => {
    byId(ASSO).description = 'À propos.';
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.descriptionMaxLength).toBe(CARD_DESCRIPTION_MAX);
    expect(res.body.items[0]).toMatchObject({
      id: ASSO,
      description: 'À propos.',
    });
  });

  it('la face rend la description de l’association, jamais celle d’une fan art', async () => {
    byId(ASSO).description = 'À propos.';
    const faces = await readFanartFaces(DEFAULT_TENANT_ID, [ASSO, FANART]);
    expect(faces.get(ASSO)?.description).toBe('À propos.');
    expect(faces.get(FANART)?.description).toBeNull();
  });

  it('une carte retirée ne rend ni face ni description', async () => {
    byId(ASSO).description = 'À propos.';
    byId(ASSO).status = 'revoked';
    const faces = await readFanartFaces(DEFAULT_TENANT_ID, [ASSO]);
    expect(faces.has(ASSO)).toBe(false);
  });
});
