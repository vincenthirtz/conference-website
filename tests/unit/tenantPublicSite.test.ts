// tests/unit/tenantPublicSite.test.ts
//
// Site public par espace : résolution du tenant et réécriture par domaine.
//
// Le problème réglé ici : 32 pages publiques et 51 routes d'API figeaient
// `DEFAULT_TENANT_ID`. Un espace sur son propre domaine voyait donc le contenu
// de la conférence repeint à ses couleurs — le `custom_domain` n'était résolu
// que pour la marque, jamais pour les données.
//
// Trois signaux, dans cet ordre : le domaine (le plus fort — sur
// cup-estivale.fr tout appartient à cet espace), le préfixe de chemin, puis
// `?tenant=` (les routes d'API n'ont pas de préfixe : une page préfixée doit
// pouvoir transmettre son espace).

import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  resolveTenantIdForPublicRequestAsync,
  DEFAULT_TENANT_ID,
  __resetTenantSlugCacheForTests,
} from '../../utils/tenant';
import { hasTenantVariant } from '../../utils/tenantHostEdge';

const TENANT_B = '11111111-2222-4333-8444-555555555555';

function makeReq(over: { host?: string; url?: string } = {}): any {
  return {
    headers: { host: over.host ?? 'owwomenscup.fr' },
    url: over.url ?? '/tournaments',
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
    },
  ] as any;
});

describe('résolution publique du tenant', () => {
  it('domaine de la plateforme → espace historique', async () => {
    expect(await resolveTenantIdForPublicRequestAsync(makeReq())).toBe(
      DEFAULT_TENANT_ID
    );
  });

  it('domaine propre → son espace, y compris sur une route d’API', async () => {
    // Le cas qui manquait : les routes d'API ne sont jamais préfixées, seul le
    // domaine peut les rattacher au bon espace.
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ host: 'cup-estivale.fr', url: '/api/news' })
    );
    expect(id).toBe(TENANT_B);
  });

  it('domaine propre avec port et casse → normalisé', async () => {
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ host: 'CUP-Estivale.FR:443', url: '/' })
    );
    expect(id).toBe(TENANT_B);
  });

  it('préfixe de chemin → son espace', async () => {
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ url: '/cup-estivale/tournaments' })
    );
    expect(id).toBe(TENANT_B);
  });

  it('?tenant= → son espace (relais des pages préfixées vers l’API)', async () => {
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ url: '/api/news?tenant=cup-estivale' })
    );
    expect(id).toBe(TENANT_B);
  });

  it('slug inconnu → espace historique, jamais d’erreur au visiteur', async () => {
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ url: '/inconnu/tournaments' })
    );
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('espace désactivé → espace historique', async () => {
    (store.tenants as any[])[1].is_active = false;
    const id = await resolveTenantIdForPublicRequestAsync(
      makeReq({ host: 'cup-estivale.fr', url: '/' })
    );
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('segments réservés : /api et /admin ne sont pas pris pour des slugs', async () => {
    for (const url of ['/api/news', '/admin/dashboard', '/_next/static/x']) {
      expect(await resolveTenantIdForPublicRequestAsync(makeReq({ url }))).toBe(
        DEFAULT_TENANT_ID
      );
    }
  });
});

describe('routes ayant une variante par espace (middleware)', () => {
  it('reconnaît les chemins migrés', () => {
    expect(hasTenantVariant('/tournaments')).toBe(true);
    expect(hasTenantVariant('/tournois')).toBe(true);
    expect(hasTenantVariant('/news')).toBe(true);
    expect(hasTenantVariant('/news/mon-article')).toBe(true);
  });

  it('refuse les chemins NON migrés — mieux vaut la page actuelle qu’un 404', () => {
    // C'est tout l'objet de cette liste : réécrire vers une page absente
    // remplacerait un contenu par une erreur.
    expect(hasTenantVariant('/palmares')).toBe(false);
    expect(hasTenantVariant('/leaderboard')).toBe(false);
    expect(hasTenantVariant('/')).toBe(false);
    expect(hasTenantVariant('/news/a/b')).toBe(false);
  });
});
