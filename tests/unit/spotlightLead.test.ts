// Ce que la carte « L'événement » annonce en premier.
//
// CE QUI MÉRITE UN TEST ICI, c'est l'ORDRE. La fonction est courte et son
// chemin heureux se lit ; ce qui ne se lit pas, c'est pourquoi « complet »
// arrive après « ça commence » — et c'est précisément le bug qui a motivé son
// existence : à deux jours du coup d'envoi, la carte menait par « toutes les
// places sont prises ».
//
// L'horloge est injectée : sans ça, chaque test changerait de résultat selon
// le jour où on le lance.

import { describe, it, expect } from 'vitest';
import {
  daysUntilStart,
  spotlightLead,
  SPOTLIGHT_IMMINENT_DAYS,
} from '@/utils/home/spotlightLead';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('daysUntilStart', () => {
  it('compte en jours de CALENDRIER, pas en fractions', () => {
    // 23 h la veille : quelqu'un qui regarde un calendrier dit « demain », pas
    // « dans 0,04 jour ».
    expect(daysUntilStart('2026-09-18', new Date('2026-09-17T23:00:00Z'))).toBe(
      1
    );
  });

  it('vaut 0 le jour même', () => {
    expect(daysUntilStart('2026-09-18', at('2026-09-18'))).toBe(0);
  });

  it('devient négatif une fois le départ passé', () => {
    expect(daysUntilStart('2026-09-18', at('2026-09-20'))).toBe(-2);
  });

  it('ne décompte pas vers l’inconnu', () => {
    expect(daysUntilStart(null, at('2026-09-16'))).toBeNull();
    expect(daysUntilStart(undefined, at('2026-09-16'))).toBeNull();
    expect(daysUntilStart('pas une date', at('2026-09-16'))).toBeNull();
  });
});

describe('spotlightLead — l’ordre EST la décision', () => {
  const full = { startDate: '2026-09-18', teamCount: 8, maxTeams: 8 };

  it('ce qui SE JOUE passe avant tout', () => {
    expect(
      spotlightLead({ ...full, status: 'running' }, at('2026-06-01'))
    ).toEqual({ kind: 'live' });
  });

  // Le bug d'origine, figé : complet ET imminent mène par l'imminence.
  it('ce qui VA se jouer passe avant « complet »', () => {
    expect(spotlightLead(full, at('2026-09-16'))).toEqual({
      kind: 'starting',
      days: 2,
    });
  });

  it('« complet » redevient le titre quand le départ est lointain', () => {
    expect(spotlightLead(full, at('2026-06-01'))).toEqual({ kind: 'full' });
  });

  it('des places libres et rien en vue : inscriptions ouvertes', () => {
    expect(
      spotlightLead(
        { startDate: '2026-09-18', teamCount: 3, maxTeams: 8 },
        at('2026-06-01')
      )
    ).toEqual({ kind: 'open' });
  });
});

describe('spotlightLead — les bords', () => {
  it('le dernier jour de la fenêtre est encore imminent, le suivant non', () => {
    const base = { startDate: '2026-09-18', teamCount: 8, maxTeams: 8 };
    const veille = new Date(at('2026-09-18'));
    veille.setUTCDate(veille.getUTCDate() - SPOTLIGHT_IMMINENT_DAYS);
    expect(spotlightLead(base, veille).kind).toBe('starting');

    const trop_tot = new Date(veille);
    trop_tot.setUTCDate(trop_tot.getUTCDate() - 1);
    expect(spotlightLead(base, trop_tot).kind).toBe('full');
  });

  it('un départ PASSÉ n’est plus imminent', () => {
    // Sans `status: 'running'` en base, un tournoi dont la date est dépassée
    // ne doit pas annoncer « dans -3 jours ».
    expect(
      spotlightLead(
        { startDate: '2026-09-18', teamCount: 8, maxTeams: 8 },
        at('2026-09-21')
      )
    ).toEqual({ kind: 'full' });
  });

  // Le pendant du bug de l'imminence, côté APRÈS le coup d'envoi : le 19
  // septembre, le tournoi de la veille se jouait encore (jusqu'au 23 octobre)
  // et la carte remettait « Complet » en titre, faute d'un `running` posé à la
  // main.
  it('commencé mais pas fini : ça SE JOUE, statut ou pas', () => {
    const enCours = {
      startDate: '2026-09-18',
      endDate: '2026-10-23',
      teamCount: 8,
      maxTeams: 8,
    };
    expect(spotlightLead(enCours, at('2026-09-19'))).toEqual({ kind: 'live' });
    // Le dernier jour compte encore.
    expect(spotlightLead(enCours, at('2026-10-23'))).toEqual({ kind: 'live' });
    // Le lendemain de la fin, non.
    expect(spotlightLead(enCours, at('2026-10-24'))).toEqual({ kind: 'full' });
  });

  it('avant le départ, la date de fin ne change rien', () => {
    expect(
      spotlightLead(
        {
          startDate: '2026-09-18',
          endDate: '2026-10-23',
          teamCount: 8,
          maxTeams: 8,
        },
        at('2026-09-16')
      )
    ).toEqual({ kind: 'starting', days: 2 });
  });

  it('sans plafond déclaré, un tournoi n’est jamais complet', () => {
    // 40 inscrites ne font pas un tournoi plein si personne n'a dit combien il
    // en fallait.
    expect(
      spotlightLead(
        { startDate: '2026-09-18', teamCount: 40, maxTeams: null },
        at('2026-06-01')
      )
    ).toEqual({ kind: 'open' });
    expect(
      spotlightLead(
        { startDate: '2026-09-18', teamCount: 40, maxTeams: 0 },
        at('2026-06-01')
      )
    ).toEqual({ kind: 'open' });
  });

  it('sans date de début, l’état des places décide seul', () => {
    expect(
      spotlightLead({ teamCount: 8, maxTeams: 8 }, at('2026-09-16'))
    ).toEqual({ kind: 'full' });
    expect(
      spotlightLead({ teamCount: 2, maxTeams: 8 }, at('2026-09-16'))
    ).toEqual({ kind: 'open' });
  });
});
