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
  it('commence par les overlays, l’écran le plus ouvert', () => {
    expect(DIFFUSION_TABS.map((t) => t.id)).toEqual([
      'overlays',
      'scenes',
      'live',
      'casters',
      'twitch',
    ]);
  });

  it('n’a plus d’onglet cockpit ni run-of-show', () => {
    const hrefs = DIFFUSION_TABS.map((t) => t.href);
    expect(hrefs).not.toContain('/admin/regie');
    expect(hrefs).not.toContain('/admin/events');
  });

  it('réserve les casteuses à manage_communications, comme leur page', () => {
    expect(ids(['manage_broadcast'])).not.toContain('casters');
    expect(ids(['manage_communications'])).toContain('casters');
  });

  it('masque les chaînes Twitch sans manage_broadcast, les montre avec', () => {
    expect(ids(['manage_tcg'])).not.toContain('twitch');
    expect(ids(['manage_broadcast'])).toContain('twitch');
  });

  it('montre tout pendant la lecture de la session', () => {
    expect(ids(null)).toEqual(DIFFUSION_TABS.map((t) => t.id));
  });

  it('garde toujours les écrans ouverts à tout le staff', () => {
    expect(ids([])).toEqual(
      DIFFUSION_TABS.filter((t) => !t.permission).map((t) => t.id)
    );
  });

  it('masque aux rôles étroits les écrans réservés au caster (lot L14)', () => {
    const forReferee = visibleDiffusionTabs(
      ['run_checkin', 'arbitrate_matches'],
      'referee'
    ).map((t) => t.id);
    expect(forReferee).toEqual([]);
    const forCaster = visibleDiffusionTabs(['use_cast_cockpit'], 'caster').map(
      (t) => t.id
    );
    expect(forCaster).toEqual(['overlays', 'scenes', 'live']);
  });

  it('chaque onglet vise une page admin distincte', () => {
    const hrefs = DIFFUSION_TABS.map((t) => t.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith('/admin/')).toBe(true);
  });
});
