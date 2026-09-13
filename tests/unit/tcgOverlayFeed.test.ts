// Flux d'annonces de la source navigateur OBS + son jeton.
// Targets: utils/tcg/overlayFeed.ts, utils/tcg/overlayToken.ts
//
// CE QUE CES CAS PROTÈGENT, ET POURQUOI ÇA COMPTE PLUS QU'AILLEURS.
//
// L'overlay est servi sur une URL PUBLIQUE — une source navigateur ne peut pas
// se connecter. Tout ce qui sort du flux peut donc finir affiché sur un direct,
// puis dans un VOD, puis dans un clip. Deux invariants en découlent :
//
//   1. UNE SEULE IDENTITÉ AUTORISÉE, le pseudo Twitch, déjà public dans le
//      chat. Jamais le nom du compte du site : une joueuse a pu le choisir pour
//      un espace connecté sans vouloir le voir en surimpression d'un stream.
//      Sans pseudo rattaché, `twitchLogin` reste `null` — on n'invente rien.
//
//   2. UN JETON RÉVOCABLE, un seul actif par espace. Régénérer EST le geste
//      « le lien a fuité » : si l'ancien continuait de fonctionner, la
//      révocation ne révoquerait rien.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  readTcgOverlayFeed,
  OVERLAY_MAX_ITEMS,
} from '../../utils/tcg/overlayFeed';
import {
  generateOverlayToken,
  getActiveOverlayToken,
  rotateOverlayToken,
  revokeOverlayToken,
  resolveTenantFromOverlayToken,
} from '../../utils/tcg/overlayToken';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  resetSupabaseMock();
});

function seedEntry(over: Record<string, unknown> = {}) {
  store.tcg_wallet_entries = [
    ...((store.tcg_wallet_entries ?? []) as any[]),
    {
      id: `e-${((store.tcg_wallet_entries ?? []) as any[]).length + 1}`,
      tenant_id: TENANT,
      user_id: ALICE,
      source_kind: 'twitch_drop',
      amount: 25,
      created_at: new Date().toISOString(),
      ...over,
    },
  ] as any;
}

describe('readTcgOverlayFeed', () => {
  it('rend le pseudo Twitch, jamais un nom de compte', async () => {
    seedEntry();
    store.user_twitch_links = [
      { auth_user_id: ALICE, twitch_user_id: 'tw-1', twitch_login: 'kirisu' },
    ] as any;

    const items = await readTcgOverlayFeed(TENANT);
    expect(items).toHaveLength(1);
    expect(items[0].twitchLogin).toBe('kirisu');
    // La forme rendue est CLOSE : rien d'autre ne doit fuir vers l'URL publique.
    expect(Object.keys(items[0]).sort()).toEqual([
      'at',
      'id',
      'kind',
      'twitchLogin',
    ]);
  });

  it('rend `null` plutôt qu’un autre nom quand le compte n’est pas rattaché', async () => {
    seedEntry({ source_kind: 'match_win', user_id: BEA });
    const items = await readTcgOverlayFeed(TENANT);
    expect(items).toHaveLength(1);
    expect(items[0].twitchLogin).toBeNull();
  });

  it('n’annonce pas les origines hors direct', async () => {
    // Un achat de booster ou un recyclage n'est pas un événement de stream.
    seedEntry({ source_kind: 'booster_purchase' });
    seedEntry({ source_kind: 'card_recycled' });
    seedEntry({ source_kind: 'scrim_win' });

    const items = await readTcgOverlayFeed(TENANT);
    expect(items.map((i) => i.kind)).toEqual(['scrim_win']);
  });

  it('ne franchit pas la frontière de tenant', async () => {
    seedEntry({ tenant_id: OTHER_TENANT });
    await expect(readTcgOverlayFeed(TENANT)).resolves.toEqual([]);
  });

  it('ignore ce qui est plus vieux que la fenêtre', async () => {
    // L'overlay annonce le direct, il n'est pas un journal : un rechargement
    // d'OBS ne doit pas rejouer une heure d'événements.
    seedEntry({
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    await expect(readTcgOverlayFeed(TENANT)).resolves.toEqual([]);
  });

  it('borne le nombre d’éléments', async () => {
    for (let i = 0; i < OVERLAY_MAX_ITEMS + 10; i++) seedEntry();
    const items = await readTcgOverlayFeed(TENANT);
    expect(items.length).toBeLessThanOrEqual(OVERLAY_MAX_ITEMS);
  });

  it('rend une liste vide sans tenant plutôt que de tout lire', async () => {
    seedEntry();
    await expect(readTcgOverlayFeed('')).resolves.toEqual([]);
  });
});

describe('jeton d’overlay', () => {
  it('émet un jeton opaque et long', () => {
    const token = generateOverlayToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(generateOverlayToken()).not.toBe(token);
  });

  it('résout le tenant derrière un jeton actif', async () => {
    const token = await rotateOverlayToken(TENANT, ALICE);
    await expect(resolveTenantFromOverlayToken(token!)).resolves.toBe(TENANT);
  });

  it('RÉGÉNÉRER révoque le précédent — c’est le geste « le lien a fuité »', async () => {
    const first = await rotateOverlayToken(TENANT, ALICE);
    const second = await rotateOverlayToken(TENANT, ALICE);

    expect(second).not.toBe(first);
    // L'ancien lien, collé dans un OBS resté ouvert, ne doit plus rien servir.
    await expect(resolveTenantFromOverlayToken(first!)).resolves.toBeNull();
    await expect(resolveTenantFromOverlayToken(second!)).resolves.toBe(TENANT);
  });

  it('révoquer coupe l’accès sans en émettre un autre', async () => {
    const token = await rotateOverlayToken(TENANT, ALICE);
    await revokeOverlayToken(TENANT);

    await expect(resolveTenantFromOverlayToken(token!)).resolves.toBeNull();
    await expect(getActiveOverlayToken(TENANT)).resolves.toBeNull();
  });

  it('refuse un jeton inconnu', async () => {
    await expect(
      resolveTenantFromOverlayToken('inexistant')
    ).resolves.toBeNull();
  });
});
