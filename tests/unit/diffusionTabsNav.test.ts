// L'espace « Diffusion » — components/admin/broadcast/DiffusionTabsNav.tsx
//
// Un onglet qui mène à un 403 n'est pas un raccourci : il est masqué à qui n'a
// pas la permission de la page visée. Pendant la lecture de la session
// (`null`), tout s'affiche plutôt que de faire clignoter la barre.

import { describe, it, expect } from 'vitest';
import {
  DIFFUSION_TABS,
  visibleDiffusionTabs,
} from '../../components/admin/broadcast/DiffusionTabsNav';

const ids = (perms: string[] | null) =>
  visibleDiffusionTabs(perms).map((t) => t.id);

describe('onglets Diffusion', () => {
  it('commence par le cockpit, dans l’ordre d’une soirée', () => {
    expect(DIFFUSION_TABS.slice(0, 2).map((t) => t.id)).toEqual([
      'cockpit',
      'live',
    ]);
  });

  it('réserve les casteuses à manage_communications, comme leur page', () => {
    expect(ids(['manage_broadcast'])).not.toContain('casters');
    expect(ids(['manage_communications'])).toContain('casters');
  });

  it('masque le run-of-show sans manage_broadcast, le montre avec', () => {
    expect(ids(['manage_tcg'])).not.toContain('runofshow');
    expect(ids(['manage_broadcast'])).toContain('runofshow');
  });

  it('montre tout pendant la lecture de la session', () => {
    expect(ids(null)).toEqual(DIFFUSION_TABS.map((t) => t.id));
  });

  it('garde toujours les écrans ouverts à tout le staff', () => {
    expect(ids([])).toEqual(
      DIFFUSION_TABS.filter((t) => !t.permission).map((t) => t.id)
    );
  });

  it('chaque onglet vise une page admin distincte', () => {
    const hrefs = DIFFUSION_TABS.map((t) => t.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith('/admin/')).toBe(true);
  });
});
