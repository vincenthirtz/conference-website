// Libellé affichable d'un tag d'actualité (utils/news/newsTag.ts).
//
// Le défaut corrigé : quatre surfaces capitalisaient le slug brut, ce qui
// affichait « ANNOUNCEMENTS », « TEAMS », « TOURNAMENTS » sur un site
// francophone. Et les slugs ne sont pas normalisés en base — trois chemins
// d'écriture y ont déposé `tournaments`, `tournament` ET `tournois`.

import { describe, it, expect } from 'vitest';

import { newsTagFamily, newsTagLabel } from '../../utils/news/newsTag';
import frNewsTags from '../../lib/i18n/locales/fr/newsTags';
import enNewsTags from '../../lib/i18n/locales/en/newsTags';

const fr = frNewsTags.fr;

describe('newsTagFamily', () => {
  it('rassemble les variantes accumulées en base', () => {
    for (const slug of ['tournaments', 'tournament', 'tournois', 'tournoi']) {
      expect(newsTagFamily(slug)).toBe('tournaments');
    }
  });

  it('ignore casse, accents, tirets et blancs', () => {
    expect(newsTagFamily('  ÉVÈNEMENT ')).toBe('events');
    expect(newsTagFamily('patch-notes')).toBe('updates');
  });

  it('rend null pour un slug hors famille', () => {
    expect(newsTagFamily('interview')).toBeNull();
    expect(newsTagFamily('')).toBeNull();
    expect(newsTagFamily(null)).toBeNull();
  });
});

describe('newsTagLabel', () => {
  it('traduit les tags que la base contient réellement', () => {
    expect(newsTagLabel('announcements', fr)).toBe('Annonces');
    expect(newsTagLabel('teams', fr)).toBe('Équipes');
    expect(newsTagLabel('tournaments', fr)).toBe('Tournois');
    expect(newsTagLabel('tournois', fr)).toBe('Tournois');
  });

  it('suit la langue', () => {
    expect(newsTagLabel('announcements', enNewsTags)).toBe('Announcements');
  });

  it('garde un slug inconnu lisible plutôt que de le noyer dans « Général »', () => {
    // Effacer l'intention de qui a saisi « interview » serait pire que de ne
    // pas savoir le traduire.
    expect(newsTagLabel('interview', fr)).toBe('Interview');
    expect(newsTagLabel('behind-the-scenes', fr)).toBe('Behind the scenes');
  });

  it('rend null quand il n’y a pas de tag', () => {
    expect(newsTagLabel(null, fr)).toBeNull();
    expect(newsTagLabel('   ', fr)).toBeNull();
  });
});
