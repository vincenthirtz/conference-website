// « Ne pas figurer dans le TCG » — le retrait total (lot T9).
//
// POURQUOI CES CAS SONT DES INVARIANTS DE CONSENTEMENT, pas des tests d'API.
// Les trois garde-fous de docs/TCG.md §2 couvrent la PHOTO ; celui-ci couvre la
// PERSONNE. Ses trois modes d'échec sont tous silencieux :
//
//   1. déclarer quelqu'un retirée alors que sa photo est encore joignable dans
//      un bucket PUBLIC (l'ordre des écritures) ;
//   2. la laisser dans le vivier, donc la faire retirer des paquets qui
//      continuent de la tirer ;
//   3. laisser une carte déjà tirée porter son nom — un retrait qui n'en est
//      pas un, juste un arrêt des ventes.
//
// Aucun ne produit d'erreur : dans les trois cas tout « marche ».

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { enqueuePhotoPurge } = vi.hoisted(() => ({
  enqueuePhotoPurge: vi.fn(async () => true),
}));
vi.mock('@/utils/tcg/photoPurge', () => ({ enqueuePhotoPurge }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/player/tcg/exclusion';
import { readPlayerFaces } from '../../utils/tcg/readCardFaces';
import { readDrawPool } from '../../utils/tcg/readDrawPool';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const ME = 'user-me';
const HER = 'user-her';

function makeReq(method: string): any {
  return {
    method,
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies: {},
    query: {},
    body: {},
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function card() {
  return ((store.tcg_player_cards as any[]) ?? []).find(
    (r) => r.user_id === ME
  );
}

beforeEach(() => {
  resetSupabaseMock();
  enqueuePhotoPurge.mockClear();
  enqueuePhotoPurge.mockResolvedValue(true);
  setAuthUser({ id: ME });
  store.tcg_player_cards = [] as never;
  store.player_ratings = [
    { tenant_id: TENANT, user_id: ME, display_name: 'Moi', avatar_url: null },
    { tenant_id: TENANT, user_id: HER, display_name: 'Elle', avatar_url: null },
  ] as never;
  store.teams = [] as never;
  store.tcg_fanart_cards = [] as never;
  store.player_hero_preferences = [] as never;
  store.team_members = [] as never;
});

describe('POST — se retirer', () => {
  it('crée la ligne même sans aucun dépôt — le cas le plus fréquent', async () => {
    // Celle dont on parle est justement celle qui n'a jamais rien déposé : sa
    // carte existe sans qu'elle ait rien fait.
    const res = makeRes();
    await handler(makeReq('POST'), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).excluded).toBe(true);
    expect(card()?.excluded_at).toBeTruthy();
  });

  it('purge la photo AVANT de déclarer le retrait', async () => {
    store.tcg_player_cards = [
      {
        tenant_id: TENANT,
        user_id: ME,
        photo_path: 'tcg/me.png',
        photo_status: 'approved',
        opted_in_at: '2026-09-01T00:00:00.000Z',
        revoked_at: null,
        excluded_at: null,
      },
    ] as never;

    const res = makeRes();
    await handler(makeReq('POST'), res);

    expect(res.statusCode).toBe(200);
    expect(enqueuePhotoPurge).toHaveBeenCalledOnce();
    expect(card()?.photo_path).toBeNull();
    expect(card()?.revoked_at).toBeTruthy();
    expect(card()?.excluded_at).toBeTruthy();
  });

  it('ABANDONNE si la photo n’a pas pu être mise en file', async () => {
    // Le mode d'échec inacceptable : se déclarer retirée avec son visage encore
    // joignable par URL, dans un bucket public, sans plus rien pour le désigner.
    enqueuePhotoPurge.mockResolvedValue(false);
    store.tcg_player_cards = [
      {
        tenant_id: TENANT,
        user_id: ME,
        photo_path: 'tcg/me.png',
        photo_status: 'approved',
        revoked_at: null,
        excluded_at: null,
      },
    ] as never;

    const res = makeRes();
    await handler(makeReq('POST'), res);

    expect(res.statusCode).toBe(500);
    // Rien n'est écrit : un retrait à recommencer vaut mieux qu'un orphelin.
    expect(card()?.excluded_at ?? null).toBeNull();
    expect(card()?.photo_path).toBe('tcg/me.png');
  });
});

describe('DELETE — revenir', () => {
  it('rend le retrait réversible', async () => {
    // Un retrait qu'on ne peut pas défaire est une décision qu'on hésite à
    // prendre — donc un consentement qu'on n'ose pas retirer.
    await handler(makeReq('POST'), makeRes());
    const res = makeRes();
    await handler(makeReq('DELETE'), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).excluded).toBe(false);
    expect(card()?.excluded_at).toBeNull();
  });
});

describe('le retrait sort vraiment du jeu', () => {
  it('sort du VIVIER de tirage', async () => {
    await handler(makeReq('POST'), makeRes());

    const pool = await readDrawPool(TENANT);
    expect(pool.ok).toBe(true);
    if (!pool.ok) return;
    expect(pool.value.playerIds).not.toContain(ME);
    // Les autres restent : le retrait est individuel, pas un arrêt du jeu.
    expect(pool.value.playerIds).toContain(HER);
  });

  it('ANONYMISE les cartes déjà tirées, sans les supprimer', async () => {
    await handler(makeReq('POST'), makeRes());

    const faces = await readPlayerFaces(TENANT, [ME, HER]);
    const mine = faces.get(ME);
    // La face existe encore — la carte reste dans les collections d'autrui.
    // Détruire la collection de tiers, parfois une carte obtenue par échange,
    // reviendrait à réparer un défaut de consentement en en créant un autre.
    expect(mine).toBeDefined();
    expect(mine?.withdrawn).toBe(true);
    // …mais plus rien n'y désigne quelqu'un.
    expect(mine?.displayName).toBeNull();
    expect(mine?.imageUrl).toBeNull();
    expect(mine?.figureRole).toBeNull();
    expect(mine?.teamColor).toBeNull();

    // L'autre est intacte.
    expect(faces.get(HER)?.displayName).toBe('Elle');
  });

  it('anonymise AUSSI une joueuse sans ligne de classement', async () => {
    // Le chemin de repli : sans ce test, il rendrait figurine et couleur
    // d'équipe, et défaisait le retrait en silence.
    store.player_ratings = [] as never;
    await handler(makeReq('POST'), makeRes());

    const faces = await readPlayerFaces(TENANT, [ME]);
    expect(faces.get(ME)?.withdrawn).toBe(true);
    expect(faces.get(ME)?.displayName).toBeNull();
  });
});

describe('GET / méthode', () => {
  it('rend l’état', async () => {
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res.body).toMatchObject({ excluded: false });
  });

  it('refuse un PUT', async () => {
    const res = makeRes();
    await handler(makeReq('PUT'), res);
    expect(res.statusCode).toBe(405);
  });
});
