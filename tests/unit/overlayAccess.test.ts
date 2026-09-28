// utils/admin/overlayAccess.ts — le droit aux overlays de régie, lu côté
// serveur pour l'onglet Outils d'un tournoi ET la page Diffusion › Overlays.
// Une seule lecture pour les deux : une capacité calculée deux fois finit par
// l'être de deux façons.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { readOverlayAccess } from '../../utils/admin/overlayAccess';

const OTHER = '77777777-7777-4777-8777-777777777777';

beforeEach(() => resetSupabaseMock());

describe('readOverlayAccess', () => {
  it('un espace sans palier payant n’a pas les sources par match', async () => {
    store.tenants = [
      { id: OTHER, plan: 'discovery', plan_status: 'active' },
    ] as any;
    const access = await readOverlayAccess(OTHER);
    expect(access.canUseMatchOverlays).toBe(false);
    expect(access.isDefaultTenant).toBe(false);
    expect(access.planLabel.length).toBeGreaterThan(0);
  });

  it('reconnaît l’espace de l’association (sources de don et d’alertes)', async () => {
    store.tenants = [
      { id: DEFAULT_TENANT_ID, plan: 'discovery', plan_status: 'active' },
    ] as any;
    expect((await readOverlayAccess(DEFAULT_TENANT_ID)).isDefaultTenant).toBe(
      true
    );
  });

  it('un espace introuvable retombe sur le palier gratuit', async () => {
    const access = await readOverlayAccess(OTHER);
    expect(access.canUseMatchOverlays).toBe(false);
  });
});
