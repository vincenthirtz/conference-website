// tests/unit/planLimits.test.ts
//
// T2 — les limites d'un plan, appliquées.
//
// `maxLeagues` était déclaré dans `planFeatures.ts` depuis l'origine et n'avait
// AUCUN appelant : un espace `regie`, vendu « une ligue », pouvait en créer dix.
// Ces tests tiennent les trois propriétés qui comptent :
//
//   1. la limite refuse au bon moment, et le refus dit comment l'éviter ;
//   2. un plan illimité ne paie pas le prix d'un comptage qu'il n'a pas ;
//   3. aucune capacité déclarée ne peut rester sans lieu d'application — ou
//      alors elle est marquée « commerciale » et justifiée, explicitement.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});
vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import {
  assertPlanLimit,
  planLimitBody,
  PLAN_FEATURE_ENFORCEMENT,
} from '../../utils/billing/planLimits';
import { getPlanFeatures } from '../../utils/billing/planFeatures';

const TENANT = CONFERENCE_TENANT_ID;

function seedTenant(plan: string, status = 'active') {
  store.tenants = [
    {
      id: TENANT,
      slug: 'conf',
      name: 'Conf',
      is_active: true,
      plan,
      plan_status: status,
      plan_expires_at: null,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  store.leagues = [] as any;
});

describe('assertPlanLimit — ligues', () => {
  it('laisse passer sous la limite', async () => {
    seedTenant('regie'); // maxLeagues: 1
    const v = await assertPlanLimit(TENANT, 'leagues');
    expect(v.ok).toBe(true);
    expect(v.used).toBe(0);
    expect(v.max).toBe(1);
  });

  it('refuse À la limite, et nomme le palier qui la lève', async () => {
    seedTenant('regie');
    store.leagues = [{ id: 'l1', tenant_id: TENANT, name: 'Saison 1' }] as any;

    const v = await assertPlanLimit(TENANT, 'leagues');
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe('PLAN_LIMIT_REACHED');
    expect(v.used).toBe(1);
    expect(v.max).toBe(1);
    // Un refus qui ne dit pas comment l'éviter envoie le client au support.
    expect(v.upgradeTo).toBe('circuit');
    expect(planLimitBody(v).error).toContain('Circuit');
  });

  it('ne compte pas les ligues des autres espaces', async () => {
    seedTenant('regie');
    store.leagues = [
      { id: 'l1', tenant_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'X' },
    ] as any;
    const v = await assertPlanLimit(TENANT, 'leagues');
    expect(v.ok).toBe(true);
  });

  it('un plan illimité ne déclenche AUCUN comptage', async () => {
    seedTenant('foundation'); // maxLeagues: Infinity
    const spy = vi.spyOn(store, 'leagues', 'get');
    const v = await assertPlanLimit(TENANT, 'leagues');
    expect(v.ok).toBe(true);
    expect(v.max).toBe(Infinity);
    // La table n'est jamais lue : le plan phare ne paie pas en latence une
    // limite qu'il n'a pas.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('un plan payant expiré retombe sur la limite de discovery', async () => {
    // circuit past_due → effectivePlan = discovery → maxLeagues 0.
    seedTenant('circuit', 'past_due');
    const v = await assertPlanLimit(TENANT, 'leagues');
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.max).toBe(0);
    expect(v.plan).toBe('discovery');
  });

  it('une lecture en erreur AUTORISE plutôt que de bloquer', async () => {
    // Espace inconnu : le compteur ne peut rien dire. Un client ne doit pas
    // être empêché de travailler parce qu'une lecture a échoué.
    const v = await assertPlanLimit(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'leagues'
    );
    expect(v.ok).toBe(true);
  });
});

describe('registre d’application des capacités', () => {
  it('toute capacité déclarée a un lieu d’application, ou une justification', () => {
    // Le garde-fou du lot : `maxLeagues` a vécu des mois dans le type sans
    // appelant. Ajouter une capacité oblige désormais à dire où elle s'applique
    // — ou à assumer par écrit qu'elle est commerciale.
    const declared = Object.keys(getPlanFeatures('foundation')).sort();
    const registered = Object.keys(PLAN_FEATURE_ENFORCEMENT).sort();
    expect(registered).toEqual(declared);

    for (const [key, entry] of Object.entries(PLAN_FEATURE_ENFORCEMENT)) {
      if (entry.kind === 'code') {
        expect(entry.where.length, `${key}: lieu d'application vide`).toBeGreaterThan(0);
      } else {
        expect(entry.why.length, `${key}: justification vide`).toBeGreaterThan(40);
      }
    }
  });
});
