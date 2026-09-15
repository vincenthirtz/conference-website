// tests/unit/tcgTradesSets.test.ts
//
// Échanges × séries et vitrine.
//
//   1. ANTI-FARMING DES SÉRIES. Une série se paie une fois par joueuse ; si une
//      carte reçue par échange comptait, des comptes se passeraient une série
//      complète et toucheraient chacun la récompense. Règle retenue : une carte
//      d'un paquet `trade` ne compte NI pour la récompense NI pour la
//      progression affichée.
//   2. VITRINE. Accepter un échange régénère la fiche publique des DEUX
//      joueuses (ISR 300 s), sans jamais faire échouer l'échange.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
  store,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { checkCollectionSets } from '../../utils/tcg/grantCollectionSets';
import { readOwnedCardRows } from '../../utils/tcg/readOwnedCards';
import actionHandler from '../../pages/api/player/tcg/trades/[tradeId]';

const TENANT = DEFAULT_TENANT_ID;
const OWNER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const PARTNER = '5d6e7f80-91a2-4b3c-8d4e-5f60718293a4';
const TOURNAMENT = 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f60';
const STAGE = 'e3f4a5b6-c7d8-4e9f-8a1b-2c3d4e5f6071';
const TEAM = 'f4a5b6c7-d8e9-4f0a-9b2c-3d4e5f607182';
const P1 = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';
const P2 = '1b2c3d4e-5f60-4172-9839-4a5b6c7d8e9f';
const P3 = '2c3d4e5f-6071-4283-a94a-5b6c7d8e9fa0';
const TRADE = '7a1e4c2b-9d3f-4b6a-8e5c-2f7d1a9b3c80';
const SET_KEY = `roster:${TOURNAMENT}:${TEAM}`;

function seedEdition() {
  store.tournaments = [
    { id: TOURNAMENT, tenant_id: TENANT, name: 'Cup 2026', status: 'running' },
  ] as any;
  store.tournament_stages = [
    {
      id: STAGE,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT,
      deleted_at: null,
    },
  ] as any;
  store.stage_teams = [
    { stage_id: STAGE, team_id: TEAM, tenant_id: TENANT },
  ] as any;
  store.teams = [
    {
      id: TEAM,
      tenant_id: TENANT,
      name: 'Hinode Sparkles',
      slug: 'hinode-sparkles',
      deleted_at: null,
      is_active: true,
    },
  ] as any;
  store.team_members = [P1, P2, P3].map((userId, i) => ({
    id: `9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6${i}`,
    tenant_id: TENANT,
    team_id: TEAM,
    user_id: userId,
    role: 'dps',
  })) as any;
  store.player_ratings = [P1, P2, P3].map((userId) => ({
    user_id: userId,
    tenant_id: TENANT,
    display_name: null,
    battle_tag: null,
    avatar_url: null,
  })) as any;
}

let _pack = 0;
function seedPack(
  sourceKind: string,
  subjects: Array<['player' | 'team', string]>
): string {
  _pack += 1;
  const id = `aa000000-0000-4000-8000-${String(_pack).padStart(12, '0')}`;
  (store.tcg_packs ||= []).push({
    id,
    tenant_id: TENANT,
    user_id: OWNER,
    source_kind: sourceKind,
    source_match_id: null,
    granted_at: '2026-09-01T00:00:00.000Z',
    opened_at: '2026-09-01T00:01:00.000Z',
  });
  subjects.forEach(([kind, sid], position) => {
    (store.tcg_pack_cards ||= []).push({
      pack_id: id,
      position,
      subject_kind: kind,
      card_user_id: kind === 'player' ? sid : null,
      card_team_id: kind === 'team' ? sid : null,
      card_map_slug: null,
      rarity: 'common',
      is_foil: false,
      recycled_at: null,
    });
  });
  return id;
}

const setEntries = () =>
  ((store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>).filter(
    (e) => e.source_kind === 'collection_set'
  );

beforeEach(() => {
  resetSupabaseMock();
  _pack = 0;
  delete process.env.BOT_WEBHOOK_URL;
});

describe('séries — une carte reçue par échange ne compte pas', () => {
  it('une série complétée GRÂCE à une carte échangée ne crédite rien et ne s’affiche pas complète', async () => {
    seedEdition();
    seedPack('victory', [
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
    ]);
    // La dernière carte manquante, reçue par échange.
    seedPack('trade', [['player', P3]]);

    const result = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const roster = result.sets.find((s) => s.key === SET_KEY);
    expect(roster).toMatchObject({ owned: 3, total: 4, complete: false });
    expect(setEntries()).toHaveLength(0);
  });

  it('la même carte TIRÉE soi-même complète la série (témoin)', async () => {
    seedEdition();
    seedPack('victory', [
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
    ]);
    seedPack('purchase', [['player', P3]]);

    const result = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sets.find((s) => s.key === SET_KEY)?.complete).toBe(true);
  });

  it('la collection, elle, contient bien la carte reçue (option désactivée par défaut)', async () => {
    seedPack('trade', [['player', P3]]);
    const all = await readOwnedCardRows(TENANT, OWNER);
    const drawn = await readOwnedCardRows(TENANT, OWNER, {
      excludeTradedIn: true,
    });
    expect(all.ok && all.value.map((c) => c.card_user_id)).toEqual([P3]);
    expect(drawn.ok && drawn.value).toEqual([]);
  });
});

describe('vitrine — accepter régénère les deux fiches publiques', () => {
  function makeRes(revalidate: (path: string) => Promise<void>): any {
    const r: any = {
      statusCode: 200,
      body: undefined,
      headers: {},
      revalidate,
    };
    r.status = (c: number) => ((r.statusCode = c), r);
    r.json = (b: unknown) => ((r.body = b), r);
    r.setHeader = () => {};
    return r;
  }

  const req = (): any => ({
    method: 'POST',
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${Math.random()}`,
    },
    cookies: {},
    query: { tradeId: TRADE },
    body: { action: 'accept' },
  });

  it('régénère /player/<proposante> et /player/<destinataire>', async () => {
    setAuthUser({ id: PARTNER });
    setRpcResult('tcg_accept_trade', {
      data: {
        status: 'accepted',
        tradeId: TRADE,
        proposerId: OWNER,
        recipientId: PARTNER,
        cancelled: [],
      },
    });
    const revalidate = vi.fn(async () => {});
    const r = makeRes(revalidate);
    await actionHandler(req(), r);
    expect(r.statusCode).toBe(200);
    const paths = revalidate.mock.calls.map((c) => (c as unknown[])[0]);
    expect(paths).toEqual(
      expect.arrayContaining([`/player/${OWNER}`, `/player/${PARTNER}`])
    );
  });

  it('une régénération en échec ne fait pas échouer l’échange', async () => {
    setAuthUser({ id: PARTNER });
    setRpcResult('tcg_accept_trade', {
      data: {
        status: 'accepted',
        tradeId: TRADE,
        proposerId: OWNER,
        recipientId: PARTNER,
        cancelled: [],
      },
    });
    const r = makeRes(async () => {
      throw new Error('ISR indisponible');
    });
    await actionHandler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.trade.status).toBe('accepted');
  });

  it('un rejeu ne régénère rien (rien n’a bougé)', async () => {
    setAuthUser({ id: PARTNER });
    setRpcResult('tcg_accept_trade', {
      data: {
        status: 'already_accepted',
        tradeId: TRADE,
        proposerId: OWNER,
        recipientId: PARTNER,
      },
    });
    const revalidate = vi.fn(async () => {});
    await actionHandler(req(), makeRes(revalidate));
    expect(revalidate).not.toHaveBeenCalled();
  });
});
