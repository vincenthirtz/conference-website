import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerError = vi.hoisted(() => vi.fn());
vi.mock('../../utils/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { cronBaseUrl } = await import(
  '../../netlify/functions/_lib/cronBaseUrl'
);

const NETLIFY = {
  URL: 'https://owwc.netlify.app',
  SITE_URL: 'https://site.fr',
};

describe('cronBaseUrl', () => {
  beforeEach(() => loggerError.mockClear());

  describe('CRON_API_BASE_URL absente : enchaînement historique inchangé', () => {
    it('prend URL en priorité', () => {
      expect(cronBaseUrl({ ...NETLIFY })).toBe('https://owwc.netlify.app');
    });

    it('replie sur SITE_URL puis sur le domaine en dur', () => {
      expect(cronBaseUrl({ SITE_URL: 'https://site.fr' })).toBe(
        'https://site.fr'
      );
      expect(cronBaseUrl({})).toBe('https://owwomenscup.fr');
    });

    it('renvoie la valeur historique telle quelle (slash final compris)', () => {
      expect(cronBaseUrl({ URL: 'https://owwc.netlify.app/' })).toBe(
        'https://owwc.netlify.app/'
      );
    });

    it('traite une valeur vide ou blanche comme absente', () => {
      expect(cronBaseUrl({ ...NETLIFY, CRON_API_BASE_URL: '' })).toBe(
        'https://owwc.netlify.app'
      );
      expect(cronBaseUrl({ ...NETLIFY, CRON_API_BASE_URL: '   ' })).toBe(
        'https://owwc.netlify.app'
      );
      expect(loggerError).not.toHaveBeenCalled();
    });
  });

  describe('CRON_API_BASE_URL valide', () => {
    it("l'emporte sur URL et SITE_URL", () => {
      expect(
        cronBaseUrl({
          ...NETLIFY,
          CRON_API_BASE_URL: 'https://api.owwomenscup.fr',
        })
      ).toBe('https://api.owwomenscup.fr');
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('retire le ou les slashes finaux et les espaces', () => {
      expect(
        cronBaseUrl({ CRON_API_BASE_URL: ' https://api.owwomenscup.fr/ ' })
      ).toBe('https://api.owwomenscup.fr');
      expect(
        cronBaseUrl({ CRON_API_BASE_URL: 'https://api.owwomenscup.fr//' })
      ).toBe('https://api.owwomenscup.fr');
    });
  });

  describe('CRON_API_BASE_URL invalide : ignorée, repli historique, erreur loguée', () => {
    it.each([
      ['http (secret en clair)', 'http://api.owwomenscup.fr'],
      ['illisible', 'api.owwomenscup.fr'],
      ['autre protocole', 'ftp://api.owwomenscup.fr'],
      ['identifiants', 'https://u:p@api.owwomenscup.fr'],
      ['query', 'https://api.owwomenscup.fr/?x=1'],
      ['fragment', 'https://api.owwomenscup.fr/#x'],
    ])('%s', (_label, value) => {
      expect(cronBaseUrl({ ...NETLIFY, CRON_API_BASE_URL: value })).toBe(
        'https://owwc.netlify.app'
      );
      expect(loggerError).toHaveBeenCalledTimes(1);
    });
  });
});
