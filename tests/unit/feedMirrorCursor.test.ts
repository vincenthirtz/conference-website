// Curseur et garde d'idempotence du miroir social.
// Target: utils/social/feedMirror.ts
//
// CE QUE CES TESTS PROTÈGENT — incident du 2026-09-12. Quatre lectures de
// curseur ont expiré en 504 côté PostgREST. `readSetting` renvoyait alors
// `null`, que `readCursor` ne distinguait pas de « pas encore de curseur » : il
// rendait la fenêtre de 24 h, et le miroir a reposté dans le salon Discord des
// publications de la veille, déjà envoyées. Quatre 504, quatre doublons.
//
// La distinction « illisible ≠ absent » ne se teste PAS avec le mock Supabase
// partagé : il n'a aucun moyen de forcer une erreur de lecture. D'où ce mock
// local, minimal, dont on pilote la réponse — et qui a la priorité sur celui du
// setup global.
//
// ⚠️ La fabrique d'un `vi.mock` est HISSÉE au-dessus du fichier : elle ne peut
// référencer aucune `const` déclarée plus bas. L'état pilotable passe donc par
// `vi.hoisted`, comme ailleurs dans cette suite.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: {
    setting: { data: null as unknown, error: null as unknown },
    outbox: { data: [] as unknown[], error: null as unknown },
  },
}));

vi.mock('@/utils/supabase', () => {
  function chain(table: string) {
    const api = {
      select: () => api,
      eq: () => api,
      gte: () => api,
      // `alreadyMirrored` termine sur `.limit()`, `readSettingResult` sur
      // `.maybeSingle()` : les deux rendent la réponse pilotée.
      limit: () =>
        Promise.resolve(
          table === 'bot_event_outbox' ? db.outbox : { data: [], error: null }
        ),
      maybeSingle: () => Promise.resolve(db.setting),
    };
    return api;
  }
  return {
    supabaseAdmin: { from: (table: string) => chain(table) },
    getServerClient: () => ({}),
  };
});

import {
  FIRST_RUN_WINDOW_MS,
  alreadyMirrored,
  readCursor,
} from '../../utils/social/feedMirror';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const POST_AT = '2026-09-11T15:48:33.964Z';
const CLEAN_URL = 'https://bsky.app/profile/womenscup.bsky.social/post/3mva';

beforeEach(() => {
  db.setting = { data: null, error: null };
  db.outbox = { data: [], error: null };
});

describe('readCursor', () => {
  it('rend la date stockée quand la lecture aboutit', async () => {
    db.setting = { data: { value: POST_AT }, error: null };
    const since = await readCursor(TENANT, 'bluesky');
    expect(since?.toISOString()).toBe(POST_AT);
  });

  it('rend null quand la LECTURE ÉCHOUE — le cas du 2026-09-12', async () => {
    // 504 côté PostgREST. On ne sait rien de ce qui est déjà parti : la seule
    // réponse sûre est « je ne sais pas », surtout pas « rejoue 24 h ».
    db.setting = {
      data: null,
      error: { message: 'canceling statement due to statement timeout' },
    };
    expect(await readCursor(TENANT, 'bluesky')).toBeNull();
  });

  it('rend la fenêtre de 24 h quand le curseur est ABSENT', async () => {
    // Premier passage : ce cas-là doit continuer de rejouer 24 h, sinon une
    // source nouvellement branchée resterait muette pour toujours.
    db.setting = { data: null, error: null };
    const since = await readCursor(TENANT, 'bluesky');
    const expected = Date.now() - FIRST_RUN_WINDOW_MS;
    expect(since).not.toBeNull();
    expect(Math.abs((since as Date).getTime() - expected)).toBeLessThan(5_000);
  });

  it('rend la fenêtre de 24 h quand la valeur stockée est illisible', async () => {
    // Valeur corrompue : rejouer une fois répare, puisque le passage réussi
    // réécrit un curseur valide. Un `null` permanent, lui, ne guérirait jamais.
    db.setting = { data: { value: 'pas-une-date' }, error: null };
    const since = await readCursor(TENANT, 'bluesky');
    expect(since).not.toBeNull();
    expect(
      Math.abs((since as Date).getTime() - (Date.now() - FIRST_RUN_WINDOW_MS))
    ).toBeLessThan(5_000);
  });
});

describe('alreadyMirrored', () => {
  it('reconnaît une publication déjà émise', async () => {
    db.outbox = {
      data: [{ payload: { data: { url: CLEAN_URL } } }],
      error: null,
    };
    expect(await alreadyMirrored(TENANT, CLEAN_URL)).toEqual({
      ok: true,
      already: true,
    });
  });

  it('ne confond pas deux publications distinctes', async () => {
    db.outbox = {
      data: [{ payload: { data: { url: `${CLEAN_URL}-autre` } } }],
      error: null,
    };
    expect(await alreadyMirrored(TENANT, CLEAN_URL)).toEqual({
      ok: true,
      already: false,
    });
  });

  it('tolère une ligne sans URL exploitable', async () => {
    db.outbox = { data: [{ payload: {} }, { payload: null }], error: null };
    expect(await alreadyMirrored(TENANT, CLEAN_URL)).toEqual({
      ok: true,
      already: false,
    });
  });

  it('signale son propre échec plutôt que de répondre « jamais vu »', async () => {
    // Répondre `already: false` sur une erreur ramènerait le doublon par la
    // porte de service : l'appelant doit pouvoir s'arrêter.
    db.outbox = { data: [], error: { message: 'timeout' } };
    expect(await alreadyMirrored(TENANT, CLEAN_URL)).toEqual({
      ok: false,
      error: 'timeout',
    });
  });
});
