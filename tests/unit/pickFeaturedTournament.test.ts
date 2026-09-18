// Le tournoi que la page d'accueil met en avant.
//
// LE BUG QUE CES TESTS FIGENT. Le 18 septembre 2026, jour du coup d'envoi, la
// home a perdu sa carte « L'événement » — et avec elle la bande des affiches du
// soir et celle des équipes engagées, toutes deux rendues par cette section. En
// cause : le tournoi n'était retenu que si `start_date >= maintenant`. Une
// colonne `date` devient minuit UTC, soit 2 h du matin à Paris : le tournoi est
// sorti de la page pendant la nuit, le jour où on venait le lire.
//
// L'horloge est injectée : sinon ces tests changeraient de verdict selon le
// jour où on les lance.

import { describe, it, expect } from 'vitest';
import { pickFeaturedTournament } from '@/utils/home/loadHomeData';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** L'édition 2026, telle qu'elle est en base. */
const owwc26 = {
  id: 'e8fa740c',
  status: 'published',
  start_date: '2026-09-18',
  end_date: '2026-10-23',
};

describe('pickFeaturedTournament', () => {
  it('garde le tournoi le JOUR de son coup d’envoi', () => {
    expect(pickFeaturedTournament([owwc26], at('2026-09-18'))).toBe(owwc26);
  });

  it('le garde pendant toute la compétition, sans attendre un `running`', () => {
    expect(pickFeaturedTournament([owwc26], at('2026-10-01'))).toBe(owwc26);
    // Le dernier jour se joue encore.
    expect(pickFeaturedTournament([owwc26], at('2026-10-23'))).toBe(owwc26);
  });

  it('le lâche une fois la compétition finie', () => {
    expect(pickFeaturedTournament([owwc26], at('2026-10-24'))).toBeNull();
  });

  it('l’annonce avant qu’il commence', () => {
    expect(pickFeaturedTournament([owwc26], at('2026-06-01'))).toBe(owwc26);
  });

  it('sans date de fin, l’événement tient sur sa journée', () => {
    const journee = { id: 'x', status: 'published', start_date: '2026-09-18' };
    expect(pickFeaturedTournament([journee], at('2026-09-18'))).toBe(journee);
    expect(pickFeaturedTournament([journee], at('2026-09-19'))).toBeNull();
  });

  it('ce qui SE JOUE prime sur ce qui va se jouer', () => {
    const enCours = { id: 'live', status: 'running', start_date: '2026-01-01' };
    expect(pickFeaturedTournament([owwc26, enCours], at('2026-06-01'))).toBe(
      enCours
    );
  });

  it('ignore les brouillons et les éditions terminées', () => {
    const rows = [
      { id: 'draft', status: 'draft', start_date: '2026-09-18' },
      { id: 'done', status: 'completed', start_date: '2026-09-18' },
    ];
    expect(pickFeaturedTournament(rows, at('2026-09-18'))).toBeNull();
  });

  it('sans date de début, rien à annoncer', () => {
    const rows = [{ id: 'sansdate', status: 'published', start_date: null }];
    expect(pickFeaturedTournament(rows, at('2026-09-18'))).toBeNull();
  });

  it('prend le PREMIER de la liste, qui arrive triée par date', () => {
    const suivant = {
      id: '2027',
      status: 'published',
      start_date: '2027-09-01',
    };
    expect(pickFeaturedTournament([owwc26, suivant], at('2026-09-18'))).toBe(
      owwc26
    );
  });
});
