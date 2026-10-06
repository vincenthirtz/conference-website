// Pré-remplissage du formulaire /support (lot P3 — check-in manqué).
// Target: utils/support/prefill.ts

import { describe, expect, it } from 'vitest';
import {
  SUPPORT_MESSAGE_MAX,
  SUPPORT_SUBJECT_MAX,
  buildSupportHref,
  parseSupportPrefill,
} from '../../utils/support/prefill';

describe('buildSupportHref / parseSupportPrefill', () => {
  it('aller-retour : ce qui est construit est relu à l’identique', () => {
    const prefill = {
      category: 'dispute' as const,
      subject: 'Check-in manqué — Alpha vs Bravo',
      message: 'Bonjour,\nIdentifiant du match : abc & co ?=',
    };
    const href = buildSupportHref(prefill);
    expect(href.startsWith('/support?')).toBe(true);
    const query = Object.fromEntries(
      new URLSearchParams(href.slice('/support?'.length))
    );
    expect(parseSupportPrefill(query)).toEqual(prefill);
  });

  it('sans contenu : /support nu', () => {
    expect(buildSupportHref({})).toBe('/support');
    expect(buildSupportHref({ subject: '   ' })).toBe('/support');
  });

  it('une catégorie inconnue est ignorée, pas rejetée', () => {
    expect(
      parseSupportPrefill({ category: 'admin', subject: 'Sujet' })
    ).toEqual({ subject: 'Sujet' });
  });

  it('les textes sont bornés aux limites de l’API ticket', () => {
    const out = parseSupportPrefill({
      subject: 's'.repeat(SUPPORT_SUBJECT_MAX + 50),
      message: 'm'.repeat(SUPPORT_MESSAGE_MAX + 50),
    });
    expect(out.subject).toHaveLength(SUPPORT_SUBJECT_MAX);
    expect(out.message).toHaveLength(SUPPORT_MESSAGE_MAX);
  });

  it('un paramètre répété prend sa première valeur', () => {
    expect(parseSupportPrefill({ category: ['technical', 'dispute'] })).toEqual(
      { category: 'technical' }
    );
  });
});
