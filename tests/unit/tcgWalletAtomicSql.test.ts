// tests/unit/tcgWalletAtomicSql.test.ts
//
// Ce que le mock Supabase NE PEUT PAS prouver, vérifié à la source : les
// fonctions SQL du porte-monnaie TCG (audit de sécurité du 2026-09-15).
//
// POURQUOI LIRE LE SQL. Le mock n'exécute ni transaction, ni verrou, ni `SUM`.
// Les routes sont testées contre les RÉPONSES des fonctions
// (`tcgBoosterApi.test.ts`, `adminTcgGrant.test.ts`) ; ce fichier vérifie que
// les fonctions elles-mêmes portent bien les trois garanties dont ces tests
// supposent l'existence — dans le bon ORDRE, et dans la MÊME fonction :
//   1. verrou de la ligne `tcg_wallets` (`FOR UPDATE`) ;
//   2. solde relu par `SUM(amount)` sur le REGISTRE, après le verrou ;
//   3. contrôle, écritures et cache à l'intérieur de cette même fonction.
// Un test qui lit du texte ne remplace pas une exécution — il empêche qu'une
// réécriture retire l'une de ces trois lignes sans que personne le voie.
//
// S'y ajoutent le recalcul `refreshBalance` (plus de plafond de 1000 lignes,
// repli sûr quand la fonction manque) et la migration de données des gains de
// scrim (clé stable `scrim:<id>`).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  resetSupabaseMock,
  rpcCalls,
  setRpcResult,
  store,
} from './__helpers__/supabaseMock';
import {
  refreshBalance,
  scrimRewardSourceRef,
} from '../../utils/tcg/grantVictoryRewards';

const MIGRATIONS = join(process.cwd(), 'database/migrations');
const walletSql = readFileSync(
  join(MIGRATIONS, 'tcg_wallet_atomic_balance.sql'),
  'utf8'
);
const scrimSql = readFileSync(
  join(MIGRATIONS, 'tcg_scrim_win_stable_ref.sql'),
  'utf8'
);

/** Le texte SQL sans commentaires `--` : on vérifie le code, pas la prose. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/** Le corps `$$ … $$` d'une fonction, commentaires retirés. */
function functionBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `fonction ${name} absente`).toBeGreaterThanOrEqual(0);
  const open = code.indexOf('$$', start);
  const close = code.indexOf('$$;', open + 2);
  return code.slice(start, close);
}

/** Indice de la première occurrence APRÈS `from`, ou -1. */
function indexAfter(body: string, pattern: RegExp, from = 0): number {
  const re = new RegExp(pattern.source, pattern.flags.replace('g', ''));
  const match = re.exec(body.slice(from));
  return match ? from + match.index : -1;
}

const LOCK =
  /FROM public\.tcg_wallets\s+WHERE tenant_id = p_tenant_id AND user_id = p_user_id\s+FOR UPDATE/;
const LEDGER_SUM =
  /SELECT COALESCE\(SUM\(amount\), 0\) INTO v_sum\s+FROM public\.tcg_wallet_entries\s+WHERE tenant_id = p_tenant_id AND user_id = p_user_id/;

describe('tcg_wallet_atomic_balance.sql — structure', () => {
  it('est transactionnelle et réserve EXECUTE au service_role', () => {
    const code = stripComments(walletSql);
    expect(code).toMatch(/^\s*BEGIN;/m);
    expect(code).toMatch(/^\s*COMMIT;/m);
    for (const signature of [
      'tcg_refresh_wallet_balance(uuid, uuid)',
      'tcg_purchase_booster(uuid, uuid, integer)',
      'tcg_admin_debit(uuid, uuid, integer, text, text)',
    ]) {
      const escaped = signature.replace(/[()]/g, '\\$&');
      for (const role of ['PUBLIC', 'anon', 'authenticated']) {
        expect(code).toMatch(
          new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM ${role};`)
        );
      }
      expect(code).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${escaped} TO service_role;`
        )
      );
    }
  });

  it.each([
    'tcg_refresh_wallet_balance',
    'tcg_purchase_booster',
    'tcg_admin_debit',
  ])(
    '%s : SECURITY DEFINER, search_path épinglé, jamais de décision sur le cache',
    (name) => {
      const body = functionBody(walletSql, name);
      expect(body).toMatch(/SECURITY DEFINER/);
      expect(body).toMatch(/SET search_path = public, pg_temp/);
      // Le cache ne décide de rien : aucune lecture de `balance`.
      expect(body).not.toMatch(/SELECT\s+balance/i);
    }
  );
});

describe('tcg_purchase_booster — verrou, contrôle et écritures dans la même fonction', () => {
  const body = functionBody(walletSql, 'tcg_purchase_booster');

  it('verrouille la ligne de porte-monnaie AVANT de relire le solde qui décide', () => {
    const lock = indexAfter(body, LOCK);
    expect(lock).toBeGreaterThan(0);
    const sumUnderLock = indexAfter(body, LEDGER_SUM, lock);
    expect(sumUnderLock).toBeGreaterThan(lock);
  });

  it('contrôle le solde SOUS verrou, puis écrit paquet, registre et cache — dans cet ordre', () => {
    const lock = indexAfter(body, LOCK);
    const sum = indexAfter(body, LEDGER_SUM, lock);
    const check = indexAfter(body, /IF v_sum < p_price THEN/, sum);
    const pack = indexAfter(
      body,
      /INSERT INTO public\.tcg_packs \(tenant_id, user_id, source_kind, source_match_id\)\s+VALUES \(p_tenant_id, p_user_id, 'purchase', NULL\)\s+RETURNING id INTO v_pack_id/,
      check
    );
    const entry = indexAfter(
      body,
      /INSERT INTO public\.tcg_wallet_entries[\s\S]*?VALUES \(p_tenant_id, p_user_id, -p_price, 'booster_purchase', v_pack_id::text\)/,
      pack
    );
    const cache = indexAfter(
      body,
      /UPDATE public\.tcg_wallets\s+SET balance = v_balance/,
      entry
    );
    for (const [label, idx] of Object.entries({ check, pack, entry, cache })) {
      expect(idx, label).toBeGreaterThan(0);
    }
    expect(check).toBeLessThan(pack);
    expect(pack).toBeLessThan(entry);
    expect(entry).toBeLessThan(cache);
  });

  it('le refus sous verrou n’écrit ni paquet ni registre', () => {
    const lock = indexAfter(body, LOCK);
    const check = indexAfter(body, /IF v_sum < p_price THEN/, lock);
    const endIf = indexAfter(body, /END IF;/, check);
    const refusal = body.slice(check, endIf);
    expect(refusal).toMatch(
      /RETURN jsonb_build_object\(\s*'status', 'insufficient_funds'/
    );
    expect(refusal).not.toMatch(/INSERT INTO/);
  });

  it('rejette un prix nul ou négatif (une dépense déguisée en gain)', () => {
    expect(body).toMatch(/p_price IS NULL OR p_price <= 0/);
  });

  it('ne connaît aucun moyen de paiement', () => {
    // Le corps des fonctions, pas leurs commentaires (qui RAPPELLENT la règle).
    for (const name of ['tcg_purchase_booster', 'tcg_admin_debit']) {
      expect(functionBody(walletSql, name)).not.toMatch(
        /helloasso|stripe|payment/i
      );
    }
  });
});

describe('tcg_admin_debit — jamais sous zéro, sous verrou', () => {
  const body = functionBody(walletSql, 'tcg_admin_debit');

  it('verrou → SUM → contrôle → écriture admin_grant → cache', () => {
    const lock = indexAfter(body, LOCK);
    const sum = indexAfter(body, LEDGER_SUM, lock);
    const check = indexAfter(body, /IF v_sum < p_cost THEN/, sum);
    const entry = indexAfter(
      body,
      /VALUES \(p_tenant_id, p_user_id, -p_cost, 'admin_grant', p_source_ref, p_note\)/,
      check
    );
    const cache = indexAfter(
      body,
      /UPDATE public\.tcg_wallets\s+SET balance = v_balance/,
      entry
    );
    expect(lock).toBeGreaterThan(0);
    expect(sum).toBeGreaterThan(lock);
    expect(check).toBeGreaterThan(sum);
    expect(entry).toBeGreaterThan(check);
    expect(cache).toBeGreaterThan(entry);
  });

  it('n’attrape pas la violation d’unicité : un rejeu annule la transaction entière', () => {
    expect(body).not.toMatch(/EXCEPTION\s+WHEN/);
  });
});

describe('tcg_refresh_wallet_balance — la somme est faite par la base, sous verrou', () => {
  const body = functionBody(walletSql, 'tcg_refresh_wallet_balance');

  it('verrou → SUM → réécriture du cache plafonnée à zéro', () => {
    const lock = indexAfter(body, LOCK);
    const sum = indexAfter(body, LEDGER_SUM, lock);
    const cache = indexAfter(
      body,
      /UPDATE public\.tcg_wallets\s+SET balance = v_balance/,
      sum
    );
    expect(lock).toBeGreaterThan(0);
    expect(sum).toBeGreaterThan(lock);
    expect(cache).toBeGreaterThan(sum);
    expect(body).toMatch(/GREATEST\(v_sum, 0\)/);
  });
});

/* -------------------------------------------------------------------------- */
/* refreshBalance côté application                                             */
/* -------------------------------------------------------------------------- */

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const USER = '11111111-1111-4111-8111-111111111111';

describe('refreshBalance', () => {
  beforeEach(() => resetSupabaseMock());

  it('délègue à `tcg_refresh_wallet_balance` et rend le solde écrit par la base', async () => {
    setRpcResult('tcg_refresh_wallet_balance', { data: 4200 });
    const balance = await refreshBalance(TENANT, USER);
    expect(balance).toBe(4200);
    expect(rpcCalls).toEqual([
      {
        fn: 'tcg_refresh_wallet_balance',
        params: { p_tenant_id: TENANT, p_user_id: USER },
      },
    ]);
    // Aucune somme JavaScript : la base a tout fait.
    expect(store.tcg_wallets ?? []).toHaveLength(0);
  });

  it('SANS la fonction : somme PAGINÉE — un registre de 2 500 lignes n’est plus coupé à 1000', async () => {
    // AVANT : `select('amount')` non paginé → PostgREST rend 1000 lignes → le
    // solde se fige sur les 1000 premières. Le mock applique `range`, ce test
    // échouerait donc sur une lecture en une seule page limitée à 1000.
    setRpcResult('tcg_refresh_wallet_balance', {
      error: { code: 'PGRST202', message: 'Could not find the function' },
    });
    store.tcg_wallet_entries = Array.from({ length: 2500 }, (_, i) => ({
      id: `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      tenant_id: TENANT,
      user_id: USER,
      amount: 10,
      source_kind: 'match_win',
      source_ref: `m-${i}`,
    })) as any;

    const balance = await refreshBalance(TENANT, USER);

    expect(balance).toBe(25_000);
    expect((store.tcg_wallets?.[0] as any)?.balance).toBe(25_000);
  });

  it('une PANNE de la fonction (≠ absence) n’écrit rien : pas de repli sans verrou sur un 504', async () => {
    setRpcResult('tcg_refresh_wallet_balance', {
      error: { message: '504 upstream timeout' },
    });
    store.tcg_wallet_entries = [
      { id: 'e1', tenant_id: TENANT, user_id: USER, amount: 50 },
    ] as any;
    const balance = await refreshBalance(TENANT, USER);
    expect(balance).toBeNull();
    expect(store.tcg_wallets ?? []).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Migration de données : gains de scrim sous la clé stable                    */
/* -------------------------------------------------------------------------- */

describe('tcg_scrim_win_stable_ref.sql', () => {
  const code = stripComments(scrimSql);

  it('écrit exactement la clé que le code utilise', () => {
    expect(scrimRewardSourceRef('abc')).toBe('scrim:abc');
    expect(code).toMatch(/'scrim:' \|\| m\.scrim_id::text AS new_ref/);
  });

  it('ne touche que les gains de scrim encore clés sur un miroir existant', () => {
    expect(code).toMatch(/e\.source_kind = 'scrim_win'/);
    expect(code).toMatch(/e\.source_ref NOT LIKE 'scrim:%'/);
    expect(code).toMatch(
      /JOIN public\.matches m\s+ON m\.id::text = e\.source_ref\s+AND m\.tenant_id = e\.tenant_id/
    );
    expect(code).toMatch(/m\.scrim_id IS NOT NULL/);
  });

  it('est rejouable sans violer l’unicité du registre', () => {
    // Une seule ligne par (tenant, joueuse, scrim) prend la clé…
    expect(code).toMatch(
      /row_number\(\) OVER \(\s*PARTITION BY e\.tenant_id, e\.user_id, m\.scrim_id/
    );
    expect(code).toMatch(/l\.rn = 1/);
    // …et jamais si la clé cible existe déjà.
    expect(code).toMatch(
      /NOT EXISTS \(\s*SELECT 1\s+FROM public\.tcg_wallet_entries d/
    );
    expect(code).toMatch(/^\s*BEGIN;/m);
    expect(code).toMatch(/^\s*COMMIT;/m);
    // Ne supprime rien.
    expect(code).not.toMatch(/\bDELETE\b/);
  });
});
