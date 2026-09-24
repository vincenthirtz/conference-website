// tests/unit/appChrome.test.ts
//
// Couvre utils/layout/appChrome.ts — ce que la coquille monte autour de
// chaque type de page (refonte des menus, plan 9). Une ligne par cas.

import { describe, it, expect } from 'vitest';
import { resolveAppChrome } from '@/utils/layout/appChrome';

describe('resolveAppChrome', () => {
  it('site public : tout, indexable', () => {
    expect(resolveAppChrome('/tournament/[id]')).toMatchObject({
      bare: false,
      navbar: true,
      footer: true,
      floatingSocials: true,
      analytics: true,
      noindex: false,
      manifest: '/site.webmanifest',
    });
  });

  it('admin : en-tête, sans pied de page marketing, non mesuré ni indexé', () => {
    expect(resolveAppChrome('/admin/tcg')).toMatchObject({
      navbar: true,
      footer: false,
      floatingSocials: false,
      analytics: false,
      noindex: true,
      appScope: true,
      manifest: '/admin/manifest.webmanifest',
    });
  });

  it('espace joueuse : en-tête ET pied (accès au site), non indexé', () => {
    expect(resolveAppChrome('/player/matches')).toMatchObject({
      navbar: true,
      footer: true,
      noindex: true,
      manifest: '/player/manifest.webmanifest',
    });
  });

  it('profil public d’une joueuse : site public, indexable', () => {
    expect(resolveAppChrome('/player/[userId]')).toMatchObject({
      footer: true,
      noindex: false,
      appScope: false,
    });
  });

  it('cockpit caster : sa propre barre, ni menu ni pied', () => {
    expect(resolveAppChrome('/caster/cockpit')).toMatchObject({
      navbar: false,
      footer: false,
      analytics: false,
      noindex: true,
    });
  });

  it('iframes et overlays OBS : pages nues', () => {
    for (const p of ['/embed/bracket/[id]', '/overlay/day']) {
      expect(resolveAppChrome(p)).toMatchObject({
        bare: true,
        navbar: false,
        footer: false,
        noindex: true,
      });
    }
  });

  it('pages techniques : affichées normalement, jamais indexées', () => {
    expect(resolveAppChrome('/auth/discord-member')).toMatchObject({
      navbar: true,
      noindex: true,
    });
    expect(resolveAppChrome('/403').noindex).toBe(true);
  });
});
