// tests/unit/siteUrl.test.ts
//
// `absoluteUrl` sert à FABRIQUER DES LIENS QU'ON DONNE À D'AUTRES — composeurs
// Bluesky/X, presse-papiers. Une erreur ici ne casse pas le site : elle produit
// un lien mort chez le réseau, c'est-à-dire au seul endroit où personne de chez
// nous ne le verra. D'où ces cas, tous des variantes de « l'origine manque ou
// est mal formée ».
//
// Le test ne présume pas de l'environnement vitest : `window` est posé ou retiré
// explicitement, ce qui vaut aussi bien sous `node` que sous `jsdom`.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { absoluteUrl } from '../../utils/siteUrl';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('absoluteUrl', () => {
  it('préfixe le chemin par NEXT_PUBLIC_SITE_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://owwomenscup.fr');
    expect(absoluteUrl('/news/mon-article')).toBe(
      'https://owwomenscup.fr/news/mon-article'
    );
  });

  it('ne double pas la barre quand la base en porte une', () => {
    // Cas RÉEL : la valeur en production est saisie à la main dans Netlify, et
    // une barre finale s'y glisse naturellement.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://owwomenscup.fr/');
    expect(absoluteUrl('/news/a')).toBe('https://owwomenscup.fr/news/a');
  });

  it('tolère plusieurs barres finales', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://owwomenscup.fr///');
    expect(absoluteUrl('/news/a')).toBe('https://owwomenscup.fr/news/a');
  });

  it("retombe sur l'origine du navigateur quand la variable manque", () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
    expect(absoluteUrl('/news/a')).toBe('http://localhost:3000/news/a');
  });

  it('rend le chemin inchangé quand aucune origine n’est connue', () => {
    // Rendu serveur sans `NEXT_PUBLIC_SITE_URL` : un lien relatif reste
    // utilisable dans la page, là où une URL bricolée ne l'est nulle part.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubGlobal('window', undefined);
    expect(absoluteUrl('/news/a')).toBe('/news/a');
  });
});
