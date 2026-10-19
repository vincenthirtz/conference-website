// utils/support/prefill.ts — l'anonymat proposé (`anonymous=1`), ajouté pour
// le guichet de la page /securite (Women's Library, lot 8a). Le reste du
// pré-remplissage est couvert par tests/unit/supportPrefill.test.ts.

import { describe, expect, it } from 'vitest';
import { buildSupportHref, parseSupportPrefill } from '@/utils/support/prefill';

describe('parseSupportPrefill — anonymous', () => {
  it.each(['1', 'true', 'TRUE', ' 1 '])('« %s » propose l’anonymat', (v) => {
    expect(parseSupportPrefill({ anonymous: v }).anonymous).toBe(true);
  });

  it.each(['0', 'false', 'oui', '', 'yes'])('« %s » est ignoré', (v) => {
    expect(parseSupportPrefill({ anonymous: v })).not.toHaveProperty(
      'anonymous'
    );
  });

  it('prend la première valeur d’un paramètre répété', () => {
    expect(parseSupportPrefill({ anonymous: ['1', '0'] }).anonymous).toBe(true);
  });

  it('absent : pas d’anonymat imposé', () => {
    expect(parseSupportPrefill({ category: 'behavior' })).toEqual({
      category: 'behavior',
    });
  });
});

describe('buildSupportHref — anonymous', () => {
  it('le guichet de /securite : comportement + anonymat proposé', () => {
    expect(buildSupportHref({ category: 'behavior', anonymous: true })).toBe(
      '/support?category=behavior&anonymous=1'
    );
  });

  it('anonymous: false n’ajoute rien', () => {
    expect(buildSupportHref({ category: 'behavior', anonymous: false })).toBe(
      '/support?category=behavior'
    );
  });

  it('aller-retour : ce qui est construit se relit à l’identique', () => {
    const href = buildSupportHref({ category: 'behavior', anonymous: true });
    const query = Object.fromEntries(
      new URLSearchParams(href.split('?')[1]).entries()
    );
    expect(parseSupportPrefill(query)).toEqual({
      category: 'behavior',
      anonymous: true,
    });
  });
});
