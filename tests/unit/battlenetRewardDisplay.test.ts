// Incitation à vérifier son compte Battle.net : la promesse sur la carte, la
// confirmation au retour d'OAuth.
// Target: utils/tcg/battlenetRewardDisplay.ts (logique de la carte
//         `BattlenetVerifyCard`), GET /api/player/battlenet-status (`reward`).
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LE MONTANT VIENT DE L'API, QUI LE LIT DANS LE REGISTRE. La carte n'écrit
//      aucun nombre, et n'importe pas le registre (qui entraînerait le moteur de
//      rating dans le bundle) : on le vérifie sur son source.
//   2. ON NE PROMET PAS CE QUI NE SERA PAS TENU : compte déjà lié, récompense
//      déjà reçue, registre illisible → aucune phrase.
//   3. LE « +N PIÈCES » EXIGE LE PARAMÈTRE EXACT posé par le callback, et un
//      montant rendu par l'API.
//
// Rendre le composant demanderait un routeur et une bibliothèque DOM que la
// politique zéro dépendance interdit : la logique de rendu est donc extraite
// en fonctions pures, et c'est elle qui est testée.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetSupabaseMock,
  setAuthUser,
  store,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import {
  TCG_REWARD_BATTLENET,
  TCG_REWARD_QUERY_PARAM,
  creditedRewardCoins,
  normalizeRewardOffer,
  rewardHintCoins,
  withBattlenetRewardParam,
} from '../../utils/tcg/battlenetRewardDisplay';
import { BATTLENET_VERIFIED_COINS } from '../../utils/tcg/earnSources';
import { format } from '../../lib/i18n/useT';
import frVerify from '../../lib/i18n/locales/fr/battlenetVerify';
import enVerify from '../../lib/i18n/locales/en/battlenetVerify';
import statusHandler from '../../pages/api/player/battlenet-status';

const ALICE = '3f6c2a1e-8b4d-4c7e-9a2b-1d5e6f7a8b9c';

const offer = (claimable: boolean) => ({
  coins: BATTLENET_VERIFIED_COINS,
  claimable,
});

describe('la phrase de la carte', () => {
  const unlinked = {
    configured: true,
    linked: false,
    reward: offer(true),
  };

  it('annonce le montant de l’API à qui n’a pas encore vérifié', () => {
    expect(rewardHintCoins(unlinked)).toBe(BATTLENET_VERIFIED_COINS);
    // Et le texte l'interpole, dans les deux langues.
    expect(format(frVerify.fr.rewardHint, { coins: 100 })).toContain('100');
    expect(format(enVerify.rewardHint, { coins: 100 })).toContain('100');
  });

  it('se tait si déjà lié, déjà reçue, non activée ou feature dormante', () => {
    expect(rewardHintCoins({ ...unlinked, linked: true })).toBeNull();
    expect(rewardHintCoins({ ...unlinked, reward: offer(false) })).toBeNull();
    expect(rewardHintCoins({ ...unlinked, reward: null })).toBeNull();
    // API plus ancienne, sans le champ.
    expect(rewardHintCoins({ configured: true, linked: false })).toBeNull();
    expect(rewardHintCoins({ ...unlinked, configured: false })).toBeNull();
    expect(rewardHintCoins(null)).toBeNull();
  });

  it('refuse un montant aberrant plutôt que de l’afficher', () => {
    expect(normalizeRewardOffer({ coins: 0, claimable: true })).toBeNull();
    expect(normalizeRewardOffer({ coins: 1.5, claimable: true })).toBeNull();
    expect(normalizeRewardOffer({ coins: '100', claimable: true })).toBeNull();
    expect(normalizeRewardOffer({ coins: 100 })).toBeNull();
  });

  it('n’écrit aucun montant et n’importe pas le registre côté client', () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        '../../components/player/BattlenetVerifyCard.tsx'
      ),
      'utf8'
    );
    expect(source).not.toMatch(/earnSources|economy|grantBattlenetVerified/);
    expect(source).toContain('rewardHintCoins');
    expect(source).not.toContain(String(BATTLENET_VERIFIED_COINS));
  });
});

describe('le retour d’OAuth', () => {
  it('pose le paramètre de façon additive', () => {
    expect(withBattlenetRewardParam('/player/profile?battlenet=verified')).toBe(
      '/player/profile?battlenet=verified&tcg=battlenet_reward'
    );
    expect(withBattlenetRewardParam('/x')).toBe('/x?tcg=battlenet_reward');
    expect(`${TCG_REWARD_QUERY_PARAM}=${TCG_REWARD_BATTLENET}`).toBe(
      'tcg=battlenet_reward'
    );
  });

  it('confirme « +N pièces » seulement avec le paramètre exact et un montant d’API', () => {
    const status = { configured: true, linked: true, reward: offer(false) };
    // Déjà reçue (c'est le cas juste après le crédit) : le montant reste connu.
    expect(creditedRewardCoins('battlenet_reward', status)).toBe(
      BATTLENET_VERIFIED_COINS
    );
    expect(creditedRewardCoins(undefined, status)).toBeNull();
    expect(creditedRewardCoins('other', status)).toBeNull();
    expect(creditedRewardCoins(['battlenet_reward'], status)).toBeNull();
    expect(
      creditedRewardCoins('battlenet_reward', { ...status, reward: null })
    ).toBeNull();
    expect(format(frVerify.fr.toastRewardCredited, { coins: 100 })).toContain(
      '+100'
    );
  });
});

describe('GET /api/player/battlenet-status — reward', () => {
  function makeRes(): any {
    const res: any = { statusCode: 200, headers: {} };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: unknown) => ((res.body = b), res);
    res.end = () => res;
    res.setHeader = (k: string, v: unknown) => {
      res.headers[k] = v;
    };
    return res;
  }
  let n = 0;
  async function call() {
    n += 1;
    const res = makeRes();
    await statusHandler(
      {
        method: 'GET',
        headers: {
          host: 'h',
          authorization: `Bearer t-${n}`,
          'x-real-ip': `10.2.0.${n}`,
        },
        cookies: {},
        query: {},
        body: {},
      } as any,
      res
    );
    return res;
  }

  beforeEach(() => {
    resetSupabaseMock();
    vi.restoreAllMocks();
    setAuthUser({ id: ALICE });
  });

  it('offre le montant du registre, réclamable tant que rien n’est reçu', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.reward).toEqual(offer(true));
  });

  it('n’est plus réclamable une fois reçue, dans n’importe quel tenant', async () => {
    store.tcg_wallet_entries = [
      {
        id: 'e0000000-0000-4000-8000-000000000009',
        tenant_id: '5b8e2f14-7c3a-4d9e-8f1b-2a6c4e8d0f13',
        user_id: ALICE,
        amount: BATTLENET_VERIFIED_COINS,
        source_kind: 'battlenet_verified',
        source_ref: 'bnet:x',
      },
    ] as any;
    const res = await call();
    expect(res.body.reward).toEqual(offer(false));
  });

  it('registre illisible : pas réclamable — on ne promet pas à l’aveugle', async () => {
    const original = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
      if (table !== 'tcg_wallet_entries') return original(table);
      const failing: any = {
        select: () => failing,
        eq: () => failing,
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: null, count: null, error: { message: 'boom' } }),
      };
      return failing;
    }) as any);

    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.reward).toEqual(offer(false));
  });
});
