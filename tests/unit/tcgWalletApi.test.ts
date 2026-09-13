// tests/unit/tcgWalletApi.test.ts
// GET /api/player/tcg/wallet — « d'où viennent mes pièces ? »
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. L'ORDRE. Le registre se lit du plus récent au plus ancien : c'est ce que
//      l'index `(tenant_id, user_id, created_at DESC)` de la migration prévoit,
//      et un historique dans le désordre est illisible.
//   2. `shownTotal` = SOMME DES LIGNES RENDUES, pas du registre entier. Un
//      total qui ne correspond pas à ce qu'on affiche créerait un écart
//      inexplicable — précisément ce que cette page doit aider à repérer.
//   3. `sourceKind` RENDU BRUT. L'API rend le fait, l'interface le formule.
//      Si un libellé traduit apparaissait ici, le vocabulaire vivrait à deux
//      endroits et la route devrait connaître la langue de la lectrice.
//   4. LE SCOPING TENANT. Une joueuse peut jouer dans plusieurs organisations ;
//      son porte-monnaie est celui du tenant courant.
//   5. LES DÉPENSES SONT VISIBLES. Un registre qui ne montrerait que les gains
//      n'expliquerait pas un solde qui baisse.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';

import handler from '../../pages/api/player/tcg/wallet';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function entry(over: Record<string, unknown>) {
  return {
    id: `e-${Math.random().toString(16).slice(2)}`,
    tenant_id: DEFAULT_TENANT_ID,
    user_id: PLAYER,
    amount: 100,
    source_kind: 'match_win',
    source_ref: 'match-1',
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: PLAYER });
});

describe('GET /api/player/tcg/wallet', () => {
  it('rend un registre vide sans erreur', async () => {
    // N'avoir jamais rien gagné est l'état normal de la majorité.
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.entries).toEqual([]);
    expect(res.body.shownTotal).toBe(0);
    expect(res.body.truncated).toBe(false);
  });

  it('rend les mouvements du plus récent au plus ancien', async () => {
    store.tcg_wallet_entries = [
      entry({ created_at: '2026-01-01T00:00:00.000Z', source_ref: 'vieux' }),
      entry({ created_at: '2026-03-01T00:00:00.000Z', source_ref: 'recent' }),
      entry({ created_at: '2026-02-01T00:00:00.000Z', source_ref: 'milieu' }),
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.body.entries.map((e: any) => e.sourceRef)).toEqual([
      'recent',
      'milieu',
      'vieux',
    ]);
  });

  it('montre les dépenses, pas seulement les gains', async () => {
    // Un registre qui tairait les débits n'expliquerait pas un solde qui baisse.
    store.tcg_wallet_entries = [
      entry({ amount: 100, source_kind: 'match_win' }),
      entry({
        amount: -300,
        source_kind: 'booster_purchase',
        source_ref: 'pack-1',
        created_at: '2026-02-01T00:00:00.000Z',
      }),
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    const kinds = res.body.entries.map((e: any) => e.sourceKind);
    expect(kinds).toContain('booster_purchase');
    const spend = res.body.entries.find(
      (e: any) => e.sourceKind === 'booster_purchase'
    );
    expect(spend.amount).toBe(-300);
  });

  it('rend `sourceKind` BRUT, jamais un libellé traduit', async () => {
    // Traduire ici obligerait la route à connaître la langue de la lectrice, et
    // ferait vivre le vocabulaire à deux endroits.
    store.tcg_wallet_entries = [entry({ source_kind: 'scrim_win' })] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.body.entries[0].sourceKind).toBe('scrim_win');
    expect(JSON.stringify(res.body)).not.toContain('Victoire');
  });

  it('additionne exactement les lignes rendues', async () => {
    store.tcg_wallet_entries = [
      entry({ amount: 100 }),
      entry({ amount: 50, source_ref: 'm2' }),
      entry({
        amount: -300,
        source_kind: 'booster_purchase',
        source_ref: 'p1',
      }),
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.body.shownTotal).toBe(-150);
  });

  it('borne à 50 et le DIT', async () => {
    // `truncated` évite le pire des cas : une joueuse qui compte les lignes
    // affichées et conclut que son solde est faux.
    store.tcg_wallet_entries = Array.from({ length: 60 }, (_, i) =>
      entry({ source_ref: `m-${i}`, created_at: `2026-01-${(i % 28) + 1}` })
    ) as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.body.entries).toHaveLength(50);
    expect(res.body.truncated).toBe(true);
  });

  it('ne voit pas le porte-monnaie d’un AUTRE tenant', async () => {
    store.tcg_wallet_entries = [
      entry({ tenant_id: OTHER_TENANT, amount: 999 }),
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.body.entries).toEqual([]);
  });

  it('refuse une méthode non autorisée', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});
