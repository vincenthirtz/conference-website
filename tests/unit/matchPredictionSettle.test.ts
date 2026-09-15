// Pronostics — règlement et crédit TCG.
// Target: utils/predictions/settle.ts
//
// CE QUE CES CAS PROTÈGENT.
//   1. UN PRONOSTIC JUSTE PAIE `MATCH_PREDICTION_COINS`, UNE FOIS : un
//      règlement rejoué (correction de score, reprise) ne recrédite personne.
//   2. UN FORFAIT NE PAIE PERSONNE.
//   3. UNE PERSONNE PASSÉE SUR LA FEUILLE DE MATCH APRÈS SON PRONOSTIC N'EST
//      PAS PAYÉE.
//   4. UN CRÉDIT REFUSÉ NE MARQUE RIEN : le règlement suivant doit pouvoir
//      payer. Marquer `won` sans crédit perdrait des pièces pour toujours.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  resetSupabaseMock,
  setTableWriteError,
  store,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { MATCH_PREDICTION_COINS } from '../../utils/tcg/earnSources';
import { settleMatchPredictions } from '../../utils/predictions/settle';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH = '33333333-3333-4333-8333-333333333333';
const TEAM_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const USER = (n: number) =>
  `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;

const BEFORE = '2026-09-20T17:00:00.000Z';

function seedMatch(over: Record<string, unknown> = {}) {
  store.matches = [
    {
      id: MATCH,
      tenant_id: TENANT,
      tournament_id: '55555555-5555-4555-8555-555555555555',
      scrim_id: null,
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      winner_team_id: TEAM_A,
      forfeit_team_id: null,
      status: 'finished',
      is_bye: false,
      deleted_at: null,
      scheduled_at: '2026-09-20T19:00:00.000Z',
      started_at: '2026-09-20T19:02:00.000Z',
      completed_at: '2026-09-20T20:00:00.000Z',
      ...over,
    },
  ] as any;
}

function prediction(
  n: number,
  team: string,
  over: Record<string, unknown> = {}
) {
  return {
    id: `pred-${n}`,
    tenant_id: TENANT,
    match_id: MATCH,
    user_id: USER(n),
    predicted_winner_team_id: team,
    created_at: BEFORE,
    updated_at: BEFORE,
    result: null,
    settled_at: null,
    ...over,
  };
}

const entries = () => (store.tcg_wallet_entries ?? []) as any[];
const byId = (id: string) =>
  ((store.match_predictions ?? []) as any[]).find((p) => p.id === id);

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  seedMatch();
});

describe('settleMatchPredictions', () => {
  it('paie les pronostics justes, marque les autres perdus', async () => {
    store.match_predictions = [
      prediction(1, TEAM_A),
      prediction(2, TEAM_B),
    ] as any;

    const report = await settleMatchPredictions(TENANT, MATCH);
    expect(report).toEqual({ ok: true, settled: 2, credited: 1 });

    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({
      user_id: USER(1),
      amount: MATCH_PREDICTION_COINS,
      source_kind: 'match_prediction',
      source_ref: MATCH,
    });
    expect(byId('pred-1').result).toBe('won');
    expect(byId('pred-2').result).toBe('lost');
    expect(byId('pred-1').settled_at).toBeTruthy();
  });

  it('ne recrédite personne au rejeu', async () => {
    store.match_predictions = [prediction(1, TEAM_A)] as any;
    await settleMatchPredictions(TENANT, MATCH);
    // Même un pronostic « remis à zéro » ne rouvre pas le crédit : la clé du
    // registre (`source_ref = match`) l'interdit.
    byId('pred-1').settled_at = null;
    byId('pred-1').result = null;
    const again = await settleMatchPredictions(TENANT, MATCH);
    expect(again.ok).toBe(true);
    expect(entries()).toHaveLength(1);
  });

  it('ne paie personne sur un forfait', async () => {
    seedMatch({ forfeit_team_id: TEAM_B });
    store.match_predictions = [prediction(1, TEAM_A)] as any;
    const report = await settleMatchPredictions(TENANT, MATCH);
    expect(report).toEqual({ ok: true, settled: 1, credited: 0 });
    expect(entries()).toHaveLength(0);
    expect(byId('pred-1').result).toBe('void');
  });

  it('ne règle rien tant que l’issue n’est pas définitive', async () => {
    seedMatch({ status: 'disputed' });
    store.match_predictions = [prediction(1, TEAM_A)] as any;
    const report = await settleMatchPredictions(TENANT, MATCH);
    expect(report).toEqual({ ok: false, reason: 'not_final' });
    expect(byId('pred-1').settled_at).toBeNull();
  });

  it('ne paie pas une personne passée sur la feuille de match', async () => {
    store.match_predictions = [prediction(1, TEAM_A)] as any;
    store.match_participants = [
      { tenant_id: TENANT, match_id: MATCH, team_id: TEAM_A, user_id: USER(1) },
    ] as any;
    await settleMatchPredictions(TENANT, MATCH);
    expect(entries()).toHaveLength(0);
    expect(byId('pred-1').result).toBe('void');
  });

  it('ne paie pas un pronostic postérieur au lancement', async () => {
    store.match_predictions = [
      prediction(1, TEAM_A, { updated_at: '2026-09-20T19:30:00.000Z' }),
    ] as any;
    await settleMatchPredictions(TENANT, MATCH);
    expect(entries()).toHaveLength(0);
    expect(byId('pred-1').result).toBe('void');
  });

  it('ne marque rien si le crédit est refusé', async () => {
    store.match_predictions = [prediction(1, TEAM_A)] as any;
    setTableWriteError('tcg_wallet_entries', {
      message: 'violates check constraint',
    });
    const report = await settleMatchPredictions(TENANT, MATCH);
    expect(report.ok).toBe(false);
    expect(byId('pred-1').settled_at).toBeNull();

    // La migration passée, le règlement suivant paie.
    setTableWriteError('tcg_wallet_entries', null);
    await settleMatchPredictions(TENANT, MATCH);
    expect(entries()).toHaveLength(1);
    expect(byId('pred-1').result).toBe('won');
  });
});
