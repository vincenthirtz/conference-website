// tests/unit/tenantPublicApi.test.ts
//
// API publique : à quel espace appartient une requête ?
//
// Un espace n'a pas de site public — il reçoit le bot, le back-office et
// l'API. Restait le cas de l'API : les 51 routes publiques figeaient
// `DEFAULT_TENANT_ID`, si bien qu'un espace interrogeant
// `/api/public/v1/tournaments` recevait les tournois de l'association. Une
// réponse valide, et fausse — le pire des deux.
//
// Trois signaux, du plus fort au plus explicite : le domaine propre, le
// préfixe de chemin, puis `?tenant=<slug>` — ce dernier étant le mécanisme
// prévu pour l'API anonyme. (L'API authentifiée tient son tenant de sa clé,
// cf. `utils/publicWriteApi.ts`.) Aucun signal → espace historique, donc le
// site de l'association répond exactement comme avant.

import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  resolveTenantIdForPublicRequestAsync,
  DEFAULT_TENANT_ID,
  __resetTenantSlugCacheForTests,
} from '../../utils/tenant';

const TENANT_B = '11111111-2222-4333-8444-555555555555';

function makeReq(over: { host?: string; url?: string } = {}): any {
  return {
    headers: { host: over.host ?? 'owwomenscup.fr' },
    url: over.url ?? '/api/public/v1/tournaments',
  };
}

beforeEach(() => {
  resetSupabaseMock();
  __resetTenantSlugCacheForTests();
  store.tenants = [
    {
      id: DEFAULT_TENANT_ID,
      slug: 'conference',
      is_active: true,
      custom_domain: null,
    },
    {
      id: TENANT_B,
      slug: 'cup-estivale',
      is_active: true,
      custom_domain: 'cup-estivale.fr',
      // Depuis T7, seul un domaine VÉRIFIÉ est routé…
      custom_domain_state: 'verified',
      // …et depuis T2, seulement si le plan inclut le white-label. Le palier
      // gratuit garde son slug : son domaine ne répondrait de toute façon pas.
      plan: 'regie',
      plan_status: 'active',
      plan_expires_at: null,
    },
  ] as any;
});

describe('résolution du tenant sur les routes publiques', () => {
  it('sans signal : espace historique — le site de l’association ne bouge pas', async () => {
    expect(await resolveTenantIdForPublicRequestAsync(makeReq())).toBe(
      DEFAULT_TENANT_ID
    );
  });

  it('?tenant= : le mécanisme de l’API anonyme', async () => {
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ url: '/api/public/v1/tournaments?tenant=cup-estivale' })
    );
    expect(id).toBe(TENANT_B);
  });

  it('?tenant= inconnu → espace historique, jamais d’erreur', async () => {
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ url: '/api/public/v1/tournaments?tenant=inconnu' })
    );
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('?tenant= d’un espace désactivé → espace historique', async () => {
    (store.tenants as any[])[1].is_active = false;
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ url: '/api/news?tenant=cup-estivale' })
    );
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('domaine propre → son espace (port et casse normalisés)', async () => {
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ host: 'CUP-Estivale.FR:443' })
    );
    expect(id).toBe(TENANT_B);
  });

  it('domaine propre NON vérifié → espace historique', async () => {
    // T7 : sans preuve de possession, le domaine ne route pas. Servir un
    // espace sur un nom que personne n'a prouvé tenir serait le vrai défaut.
    (store.tenants as any[])[1].custom_domain_state = 'pending';
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ host: 'cup-estivale.fr' })
    );
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('domaine propre sur un plan sans white-label → espace historique', async () => {
    // T2 : la capacité `whiteLabel` conditionne le domaine propre, à
    // l'écriture comme au routage.
    (store.tenants as any[])[1].plan = 'discovery';
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ host: 'cup-estivale.fr' })
    );
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('préfixe de chemin → son espace', async () => {
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ url: '/cup-estivale/tournaments' })
    );
    expect(id).toBe(TENANT_B);
  });

  it('segments réservés : /api et /admin ne sont pas pris pour des slugs', async () => {
    for (const url of ['/api/news', '/admin/dashboard', '/_next/static/x']) {
      expect(await resolveTenantIdForPublicRequestAsync(makeReq({ url }))).toBe(
        DEFAULT_TENANT_ID
      );
    }
  });
});
