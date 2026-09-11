import { describe, it, expect } from 'vitest';
import { leaguePeriodLabel } from '@/utils/leagues/leaguePeriodLabel';
import nsLeaguesIndex from '@/lib/i18n/locales/fr/leaguesIndex';
import enLeaguesIndex from '@/lib/i18n/locales/en/leaguesIndex';

const fr = nsLeaguesIndex.fr;
const en = enLeaguesIndex;

describe('leaguePeriodLabel', () => {
  it('rien quand la ligue n’a aucune date', () => {
    expect(
      leaguePeriodLabel({ start_date: null, end_date: null }, fr, 'fr')
    ).toBeNull();
  });

  it('plage complète en français', () => {
    expect(
      leaguePeriodLabel(
        { start_date: '2026-09-12', end_date: '2026-11-30' },
        fr,
        'fr-FR'
      )
    ).toBe('12 sept. 2026 — 30 nov. 2026');
  });

  it('début seul : gabarit traduit, date dans la langue active', () => {
    const frLabel = leaguePeriodLabel(
      { start_date: '2026-09-12', end_date: null },
      fr,
      'fr'
    );
    const enLabel = leaguePeriodLabel(
      { start_date: '2026-09-12', end_date: null },
      en,
      'en'
    );
    expect(frLabel).toBe('À partir du 12 sept. 2026');
    expect(enLabel?.startsWith('From 12 Sep')).toBe(true);
    expect(enLabel).not.toMatch(/À partir|sept\./);
  });

  it('fin seule', () => {
    expect(
      leaguePeriodLabel({ start_date: null, end_date: '2026-11-30' }, fr, 'fr')
    ).toBe("Jusqu'au 30 nov. 2026");
    expect(
      leaguePeriodLabel({ start_date: null, end_date: '2026-11-30' }, en, 'en')
    ).toBe('Until 30 Nov 2026');
  });

  it('jour calculé dans le fuseau du site, pas celui de la machine', () => {
    // 23 h 30 UTC le 1er mars = 0 h 30 le 2 mars à Paris.
    expect(
      leaguePeriodLabel(
        { start_date: '2026-03-01T23:30:00Z', end_date: null },
        fr,
        'fr'
      )
    ).toBe('À partir du 02 mars 2026');
  });
});
