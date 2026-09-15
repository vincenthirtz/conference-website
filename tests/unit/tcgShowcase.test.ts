// tests/unit/tcgShowcase.test.ts
//
// La VITRINE TCG : `utils/tcg/showcase.ts`, `pages/api/player/tcg/showcase.ts`,
// la régénération (`revalidatePlayerCard.ts`) et la fiche publique
// (`getStaticProps` de `pages/player/[userId].tsx`).
//
// CE QUE CES CAS PROTÈGENT.
//   1. OPT-IN : désactivée par défaut, rien sur la fiche publique tant que la
//      joueuse ne l'active pas ; désactiver n'est JAMAIS bloqué.
//   2. POSSESSION RELUE : on n'expose que ce qu'on possède, et une carte cédée
//      ou recyclée sort de la vitrine sans que personne ne nettoie la ligne.
//   3. CONSENTEMENT : la face d'une joueuse exposée passe par `readCardFaces` —
//      photo retirée = avatar, jamais l'ancienne photo — et les vitrines qui
//      l'exposent sont régénérées avec sa fiche.
//
// ⚠️ Le mock ne sait pas filtrer un tableau (`cs`) : `readShowcaseOwnersShowing`
// revérifie en mémoire, et c'est ce que le cas de régénération exerce.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetSupabaseMock,
  setAuthUser,
  store,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  parseShowcaseKey,
  readPublicShowcase,
  readShowcaseOwnersShowing,
} from '../../utils/tcg/showcase';
import { revalidatePlayerCard } from '../../utils/tcg/revalidatePlayerCard';
import handler from '../../pages/api/player/tcg/showcase';
import { getStaticProps } from '@/pages/player/[userId]';

const TENANT = DEFAULT_TENANT_ID;
const OWNER = '3d4e5f60-7182-4394-a5b6-c7d8e9f0a1b2';
const STAR = '4e5f6071-8293-44a5-b6c7-d8e9f0a1b2c3';
const OTHER = '5f607182-93a4-45b6-87d8-e9f0a1b2c3d4';
const TEAM = '60718293-a4b5-46c7-98e9-f0a1b2c3d4e5';

const PHOTO_PATH = 'tcg/star.png';
const PHOTO_URL = `https://storage.example.test/teams-images/${PHOTO_PATH}`;
const STAR_AVATAR = 'https://cdn.test/star-avatar.png';

let _token = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
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
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {},
    revalidated: [] as string[],
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  // `res.revalidate` n'existe que dans le runtime Next : doublé ici.
  res.revalidate = async (path: string) => {
    res.revalidated.push(path);
  };
  return res;
}

function seedPeople() {
  store.player_ratings = [
    {
      user_id: OWNER,
      tenant_id: TENANT,
      display_name: 'Owner',
      battle_tag: null,
      avatar_url: null,
      rating: 1500,
      rd: 200,
      volatility: 0.06,
      peak_rating: 1500,
      games_played: 0,
      wins: 0,
      losses: 0,
    },
    {
      user_id: STAR,
      tenant_id: TENANT,
      display_name: 'Star',
      battle_tag: null,
      avatar_url: STAR_AVATAR,
      rating: 1500,
      rd: 200,
      volatility: 0.06,
      peak_rating: 1500,
      games_played: 0,
      wins: 0,
      losses: 0,
    },
  ] as any;
  store.teams = [
    {
      id: TEAM,
      tenant_id: TENANT,
      name: 'Hinode Sparkles',
      short_name: 'HIN',
      slug: 'hinode-sparkles',
      logo_url: '/img/teams-images/hinode-sparkles.png',
      tcg_image_path: null,
      deleted_at: null,
      is_active: true,
    },
  ] as any;
}

let _packs = 0;
/** Un paquet ouvert de `userId` avec ces cartes. */
function seedCards(
  userId: string,
  cards: Array<{
    kind: 'player' | 'team' | 'map';
    id: string;
    rarity?: string;
    recycledAt?: string | null;
  }>
) {
  _packs += 1;
  const packId = `cc000000-0000-4000-8000-${String(_packs).padStart(12, '0')}`;
  (store.tcg_packs ||= []).push({
    id: packId,
    tenant_id: TENANT,
    user_id: userId,
    source_kind: 'purchase',
    source_match_id: null,
    granted_at: '2026-09-01T00:00:00.000Z',
    opened_at: '2026-09-01T00:01:00.000Z',
  });
  cards.forEach((card, position) => {
    (store.tcg_pack_cards ||= []).push({
      pack_id: packId,
      position,
      subject_kind: card.kind,
      card_user_id: card.kind === 'player' ? card.id : null,
      card_team_id: card.kind === 'team' ? card.id : null,
      card_map_slug: card.kind === 'map' ? card.id : null,
      rarity: card.rarity ?? 'common',
      is_foil: false,
      recycled_at: card.recycledAt ?? null,
    });
  });
}

function approveStarPhoto() {
  store.tcg_player_cards = [
    {
      tenant_id: TENANT,
      user_id: STAR,
      photo_path: PHOTO_PATH,
      photo_status: 'approved',
      revoked_at: null,
      opted_in_at: '2026-08-01T00:00:00Z',
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  _packs = 0;
  setAuthUser({ id: OWNER });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clés de sujet', () => {
  it('accepte les trois formes et refuse le reste', () => {
    expect(parseShowcaseKey(`player:${STAR}`)).toEqual({
      kind: 'player',
      id: STAR,
    });
    expect(parseShowcaseKey('map:kings-row')).toEqual({
      kind: 'map',
      id: 'kings-row',
    });
    expect(parseShowcaseKey('player:not-a-uuid')).toBeNull();
    expect(parseShowcaseKey('map:Kings Row')).toBeNull();
    expect(parseShowcaseKey('team')).toBeNull();
    expect(parseShowcaseKey(`photo:${STAR}`)).toBeNull();
    expect(parseShowcaseKey(42)).toBeNull();
  });
});

describe('GET /api/player/tcg/showcase', () => {
  it('est désactivée par défaut', async () => {
    seedPeople();
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      enabled: false,
      cards: [],
      unavailable: 0,
      maxCards: 3,
    });
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    // Classée : la fiche publique existe.
    expect(res.body.publicProfileUrl).toBe(`/player/${OWNER}`);
  });
});

describe('PUT /api/player/tcg/showcase', () => {
  it('active une vitrine de cartes possédées et régénère la fiche', async () => {
    seedPeople();
    seedCards(OWNER, [
      { kind: 'player', id: STAR, rarity: 'rare' },
      { kind: 'team', id: TEAM },
    ]);

    const res = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        body: { enabled: true, cards: [`player:${STAR}`, `team:${TEAM}`] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.cards.map((c: { key: string }) => c.key)).toEqual([
      `player:${STAR}`,
      `team:${TEAM}`,
    ]);
    expect(store.tcg_showcases).toEqual([
      expect.objectContaining({
        tenant_id: TENANT,
        user_id: OWNER,
        enabled: true,
        subject_keys: [`player:${STAR}`, `team:${TEAM}`],
      }),
    ]);
    expect(res.revalidated).toContain(`/player/${OWNER}`);
  });

  it('refuse une carte non possédée (409 not_owned)', async () => {
    seedPeople();
    seedCards(OWNER, [{ kind: 'team', id: TEAM }]);
    const res = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        body: { enabled: true, cards: [`player:${STAR}`] },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('not_owned');
    expect(store.tcg_showcases ?? []).toHaveLength(0);
  });

  it('refuse plus de trois cartes et une clé mal formée', async () => {
    const tooMany = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        body: {
          enabled: true,
          cards: ['map:a', 'map:b', 'map:c', 'map:d'],
        },
      }),
      tooMany
    );
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.body.code).toBe('invalid_body');

    const bad = makeRes();
    await handler(
      makeReq({ method: 'PUT', body: { enabled: true, cards: ['x:y'] } }),
      bad
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('invalid_card');
  });

  it('ne bloque JAMAIS une désactivation, même si une carte a été cédée', async () => {
    seedPeople();
    store.tcg_showcases = [
      {
        tenant_id: TENANT,
        user_id: OWNER,
        enabled: true,
        subject_keys: [`player:${STAR}`],
      },
    ] as any;
    // Plus aucune carte : celle de STAR est partie.
    const res = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        body: { enabled: false, cards: [`player:${STAR}`] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.unavailable).toBe(1);
    expect((store.tcg_showcases as any[])[0].enabled).toBe(false);
    expect(res.revalidated).toContain(`/player/${OWNER}`);
  });
});

describe('readPublicShowcase — ce que voit une visiteuse', () => {
  it('rend null sans réglage, et null quand la vitrine est désactivée', async () => {
    seedPeople();
    seedCards(OWNER, [{ kind: 'team', id: TEAM }]);
    expect(await readPublicShowcase(TENANT, OWNER)).toBeNull();

    store.tcg_showcases = [
      {
        tenant_id: TENANT,
        user_id: OWNER,
        enabled: false,
        subject_keys: [`team:${TEAM}`],
      },
    ] as any;
    expect(await readPublicShowcase(TENANT, OWNER)).toBeNull();
  });

  it('se relit contre la possession réelle : une carte recyclée ou cédée disparaît', async () => {
    seedPeople();
    seedCards(OWNER, [
      { kind: 'team', id: TEAM },
      { kind: 'map', id: 'kings-row' },
    ]);
    store.tcg_showcases = [
      {
        tenant_id: TENANT,
        user_id: OWNER,
        enabled: true,
        subject_keys: [`team:${TEAM}`, 'map:kings-row', `player:${STAR}`],
      },
    ] as any;

    const before = await readPublicShowcase(TENANT, OWNER);
    // La carte de STAR n'a jamais été possédée : absente.
    expect(before?.map((c) => c.key)).toEqual([
      `team:${TEAM}`,
      'map:kings-row',
    ]);

    // La carte d'équipe est recyclée ; la map est « cédée » (paquet transféré).
    for (const card of store.tcg_pack_cards as Array<Record<string, unknown>>) {
      if (card.card_team_id === TEAM) card.recycled_at = '2026-09-03T00:00:00Z';
    }
    const after = await readPublicShowcase(TENANT, OWNER);
    expect(after?.map((c) => c.key)).toEqual(['map:kings-row']);

    for (const pack of store.tcg_packs as Array<Record<string, unknown>>) {
      pack.user_id = OTHER;
    }
    expect(await readPublicShowcase(TENANT, OWNER)).toBeNull();
  });

  it('passe les faces par le filtre de consentement : photo retirée = avatar', async () => {
    seedPeople();
    seedCards(OWNER, [{ kind: 'player', id: STAR }]);
    store.tcg_showcases = [
      {
        tenant_id: TENANT,
        user_id: OWNER,
        enabled: true,
        subject_keys: [`player:${STAR}`],
      },
    ] as any;

    approveStarPhoto();
    const withPhoto = await readPublicShowcase(TENANT, OWNER);
    expect(withPhoto?.[0]).toMatchObject({
      kind: 'player',
      imageUrl: PHOTO_URL,
    });

    // Retrait : `revoked_at` posé, chemin vidé — comme DELETE /photo.
    (store.tcg_player_cards as any[])[0].revoked_at = '2026-09-04T00:00:00Z';
    const revoked = await readPublicShowcase(TENANT, OWNER);
    expect(revoked?.[0]).toMatchObject({
      kind: 'player',
      imageUrl: STAR_AVATAR,
    });
    expect(JSON.stringify(revoked)).not.toContain(PHOTO_PATH);

    // Photo en attente de relecture : pas davantage.
    (store.tcg_player_cards as any[])[0].revoked_at = null;
    (store.tcg_player_cards as any[])[0].photo_status = 'pending';
    const pending = await readPublicShowcase(TENANT, OWNER);
    expect(JSON.stringify(pending)).not.toContain(PHOTO_PATH);
  });
});

describe('régénération des vitrines qui exposent une joueuse', () => {
  it('régénère la fiche de la joueuse ET celles des vitrines actives qui l’exposent', async () => {
    store.tcg_showcases = [
      {
        tenant_id: TENANT,
        user_id: OWNER,
        enabled: true,
        subject_keys: [`player:${STAR}`],
      },
      // Désactivée : sa fiche n'expose rien, inutile de la régénérer.
      {
        tenant_id: TENANT,
        user_id: OTHER,
        enabled: false,
        subject_keys: [`player:${STAR}`],
      },
    ] as any;

    expect(await readShowcaseOwnersShowing(`player:${STAR}`)).toEqual([OWNER]);

    const res = makeRes();
    await revalidatePlayerCard(res, STAR);
    expect(res.revalidated).toEqual([`/player/${STAR}`, `/player/${OWNER}`]);
  });

  it('ne régénère rien de plus quand aucune vitrine n’expose la joueuse', async () => {
    store.tcg_showcases = [
      {
        tenant_id: TENANT,
        user_id: OWNER,
        enabled: true,
        subject_keys: [`team:${TEAM}`],
      },
    ] as any;
    const res = makeRes();
    await revalidatePlayerCard(res, STAR);
    expect(res.revalidated).toEqual([`/player/${STAR}`]);
  });
});

describe('fiche publique /player/[userId]', () => {
  async function staticProps() {
    return (await getStaticProps({ params: { userId: OWNER } } as never)) as {
      props: { tcgShowcase: unknown };
    };
  }

  it('n’a pas de vitrine tant qu’elle n’est pas activée', async () => {
    seedPeople();
    seedCards(OWNER, [{ kind: 'team', id: TEAM }]);
    store.tcg_showcases = [
      {
        tenant_id: TENANT,
        user_id: OWNER,
        enabled: false,
        subject_keys: [`team:${TEAM}`],
      },
    ] as any;
    const result = await staticProps();
    expect(result.props.tcgShowcase).toBeNull();
  });

  it('montre la vitrine activée', async () => {
    seedPeople();
    seedCards(OWNER, [{ kind: 'team', id: TEAM }]);
    store.tcg_showcases = [
      {
        tenant_id: TENANT,
        user_id: OWNER,
        enabled: true,
        subject_keys: [`team:${TEAM}`],
      },
    ] as any;
    const result = await staticProps();
    expect(result.props.tcgShowcase).toEqual([
      expect.objectContaining({ key: `team:${TEAM}`, name: 'Hinode Sparkles' }),
    ]);
  });
});
