// PATCH /api/admin/stream-alerts — la persistance des fichiers déposés.
//
// POURQUOI CE FICHIER. Le 18/09, deux dépôts d'habillage à vingt minutes d'un
// direct ont laissé la vidéo dans le bucket et `frame_path` à NULL, sans la
// moindre erreur. Le panneau affichait pourtant la vidéo — c'est l'aperçu LOCAL
// du fichier choisi, pas ce qui est en base — et la régie a cru l'avoir
// enregistrée. Au rechargement suivant, il n'y avait jamais rien eu. Le son,
// lui, était passé : même code, même requête.
//
// Ce qui est couvert ici est donc précisément ce qui manquait : que le chemin
// écrit soit RELU, et qu'un écart fasse échouer la requête au lieu de rendre un
// « enregistré » mensonger.

import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/stream-alerts';

const USER = 'user-1';

/** Un webm minimal : les 4 octets de signature EBML suffisent au contrôle. */
const WEBM_BASE64 = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00,
]).toString('base64');

let _t = 0;
function makeReq(body: unknown): any {
  _t += 1;
  return {
    method: 'PATCH',
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${_t}`,
      origin: 'https://h',
    },
    query: {},
    body,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

async function call(body: unknown) {
  const res = makeRes();
  await handler(makeReq(body), res);
  return res;
}

const settingsRow = () =>
  (store.stream_alert_settings as any[])?.find(
    (r) => r.tenant_id === CONFERENCE_TENANT_ID
  );

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER });
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: USER,
      email: 'a@a.com',
      role: 'admin',
      display_name: 'Admin',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.stream_alert_settings = [
    {
      tenant_id: CONFERENCE_TENANT_ID,
      enabled: true,
      duration_ms: null,
      sound_url: null,
      sound_volume: 70,
      accent_color: null,
      frame_path: null,
      frame_kind: null,
      sound_path: null,
      updated_at: '2026-09-18T10:00:00.000Z',
      updated_by: null,
    },
  ] as any;
  store.stream_alert_rules = [] as any;
});

describe('PATCH /api/admin/stream-alerts — fichiers déposés', () => {
  it("enregistre le CHEMIN de l'habillage, pas seulement le fichier", async () => {
    const res = await call({
      frame: { data: WEBM_BASE64, mimeType: 'video/webm' },
    });

    expect(res.statusCode).toBe(200);
    const row = settingsRow();
    expect(row.frame_path).toMatch(/^stream-alerts\/.*\.webm$/);
    expect(row.frame_kind).toBe('video');
  });

  it("n'efface pas l'habillage quand la requête n'y touche pas", async () => {
    await call({ frame: { data: WEBM_BASE64, mimeType: 'video/webm' } });
    const before = settingsRow().frame_path;

    // Clé absente = « n'y touche pas ». Un simple changement de volume ne doit
    // pas effacer l'habillage de la veille.
    await call({ settings: { soundVolume: 42 } });

    expect(settingsRow().frame_path).toBe(before);
    expect(settingsRow().sound_volume).toBe(42);
  });

  it('retire l’habillage sur un `null` explicite', async () => {
    await call({ frame: { data: WEBM_BASE64, mimeType: 'video/webm' } });
    const res = await call({ frame: null });

    expect(res.statusCode).toBe(200);
    expect(settingsRow().frame_path).toBeNull();
    expect(settingsRow().frame_kind).toBeNull();
  });

  it('refuse un fichier dont le contenu ne correspond pas au type annoncé', async () => {
    const res = await call({
      frame: {
        data: Buffer.from('pas une video').toString('base64'),
        mimeType: 'video/webm',
      },
    });

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('content_mismatch');
    expect(settingsRow().frame_path).toBeNull();
  });
});
