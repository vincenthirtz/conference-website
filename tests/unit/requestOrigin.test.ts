// tests/unit/requestOrigin.test.ts
//
// Origine publique des URL de retour HelloAsso (utils/requestOrigin.ts).

import { describe, it, expect } from 'vitest';
import { requestOrigin } from '@/utils/requestOrigin';

const req = (headers: Record<string, string | undefined>) => ({ headers });

describe('requestOrigin', () => {
  it('garde https quand le relais l’annonce (cas Netlify)', () => {
    expect(
      requestOrigin(
        req({ host: 'owwomenscup.fr', 'x-forwarded-proto': 'https' })
      )
    ).toBe('https://owwomenscup.fr');
  });

  it('force https quand un saut interne annonce http', () => {
    expect(
      requestOrigin(
        req({ host: 'owwomenscup.fr', 'x-forwarded-proto': 'http' })
      )
    ).toBe('https://owwomenscup.fr');
  });

  it('ne prend que la première valeur d’une liste', () => {
    expect(
      requestOrigin(
        req({ host: 'owwomenscup.fr', 'x-forwarded-proto': 'https, http' })
      )
    ).toBe('https://owwomenscup.fr');
  });

  it('défaut https sans en-tête', () => {
    expect(requestOrigin(req({ host: 'club.example.org' }))).toBe(
      'https://club.example.org'
    );
  });

  it('laisse http en local explicite', () => {
    expect(
      requestOrigin(
        req({ host: 'localhost:3000', 'x-forwarded-proto': 'http' })
      )
    ).toBe('http://localhost:3000');
  });
});
