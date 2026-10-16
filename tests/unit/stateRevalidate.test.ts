// utils/isr/stateRevalidate — fenêtres ISR selon l'état de ce que montre la page.
//
// CE QUE CE CAS PROTÈGE :
//   - un tournoi qui se joue (statut `running`, ou `published` dans ses dates)
//     garde la fenêtre du direct (≤ 60 s) : scores et bracket restent justes
//     même sans régénération à la demande ;
//   - seul ce qui ne se joue plus passe aux fenêtres longues (1 h, 1 jour) ;
//   - une lecture en échec ne fige jamais une page partielle longtemps ;
//   - l'accueil repasse en 15 min AVANT le premier coup d'envoi d'une journée ;
//   - l'en-tête CDN des embeds ne sert jamais plus vieux que la fenêtre.

import { describe, it, expect } from 'vitest';
import {
  HOME_MATCHDAY_LEAD_MS,
  ISR_ARCHIVED_S,
  ISR_HOME_MATCHDAY_S,
  ISR_HOME_QUIET_S,
  ISR_LIVE_S,
  ISR_MATCH_OPEN_S,
  ISR_MATCH_SETTLING_S,
  ISR_RECENTLY_DONE_S,
  ISR_UPCOMING_S,
  homeRevalidateSeconds,
  matchRevalidateSeconds,
  publicCdnCacheControl,
  tournamentIsrState,
  tournamentRevalidateSeconds,
} from '@/utils/isr/stateRevalidate';

// 16/10/2026 à 20 h, heure de Paris (UTC+2).
const NOW = new Date('2026-10-16T18:00:00Z');

describe('tournamentIsrState', () => {
  it('statut running → direct, quelles que soient les dates', () => {
    expect(
      tournamentIsrState(
        { status: 'running', start_date: '2026-01-01', end_date: '2026-01-02' },
        NOW
      )
    ).toBe('live');
  });

  it('published DANS ses dates → direct (le staff a oublié `running`)', () => {
    expect(
      tournamentIsrState(
        {
          status: 'published',
          start_date: '2026-09-14',
          end_date: '2026-12-20',
        },
        NOW
      )
    ).toBe('live');
  });

  it('published le jour même, sans date de fin → direct', () => {
    expect(
      tournamentIsrState({ status: 'published', start_date: '2026-10-16' }, NOW)
    ).toBe('live');
  });

  it('soirée qui déborde : direct encore le lendemain de la date de fin', () => {
    expect(
      tournamentIsrState(
        {
          status: 'published',
          start_date: '2026-10-15',
          end_date: '2026-10-15',
        },
        NOW
      )
    ).toBe('live');
  });

  it('jour calendaire de PARIS : 23 h 30 le 16 (21 h 30 UTC) est le 16', () => {
    const lateEvening = new Date('2026-10-16T21:30:00Z');
    expect(
      tournamentIsrState(
        { status: 'published', start_date: '2026-10-17' },
        lateEvening
      )
    ).toBe('upcoming');
    // 00 h 30 le 17 à Paris = 22 h 30 UTC le 16 : le tournoi a commencé.
    const afterMidnight = new Date('2026-10-16T22:30:00Z');
    expect(
      tournamentIsrState(
        { status: 'published', start_date: '2026-10-17' },
        afterMidnight
      )
    ).toBe('live');
  });

  it('published à venir → upcoming', () => {
    expect(
      tournamentIsrState({ status: 'published', start_date: '2026-11-02' }, NOW)
    ).toBe('upcoming');
    expect(tournamentIsrState({ status: 'published' }, NOW)).toBe('upcoming');
  });

  it('terminé depuis moins d’une semaine → recentlyDone', () => {
    expect(
      tournamentIsrState(
        {
          status: 'completed',
          start_date: '2026-09-14',
          end_date: '2026-10-10',
        },
        NOW
      )
    ).toBe('recentlyDone');
  });

  it('terminé depuis plus d’une semaine → archived', () => {
    expect(
      tournamentIsrState(
        {
          status: 'completed',
          start_date: '2026-03-01',
          end_date: '2026-03-08',
        },
        NOW
      )
    ).toBe('archived');
    expect(
      tournamentIsrState({ status: 'archived', start_date: '2025-06-01' }, NOW)
    ).toBe('archived');
  });

  it('terminé sans aucune date → recentlyDone (on ne sait pas depuis quand)', () => {
    expect(tournamentIsrState({ status: 'completed' }, NOW)).toBe(
      'recentlyDone'
    );
  });

  it('statut inconnu → direct : dans le doute, frais', () => {
    expect(tournamentIsrState({ status: 'mystery' }, NOW)).toBe('live');
    expect(tournamentIsrState({}, NOW)).toBe('live');
  });

  it('accepte un horodatage complet comme borne', () => {
    expect(
      tournamentIsrState(
        { status: 'completed', end_date: '2026-03-08T20:00:00+00:00' },
        NOW
      )
    ).toBe('archived');
  });
});

describe('tournamentRevalidateSeconds', () => {
  it('suit l’état', () => {
    expect(tournamentRevalidateSeconds({ status: 'running' }, NOW)).toBe(
      ISR_LIVE_S
    );
    expect(
      tournamentRevalidateSeconds(
        { status: 'published', start_date: '2026-11-02' },
        NOW
      )
    ).toBe(ISR_UPCOMING_S);
    expect(
      tournamentRevalidateSeconds(
        { status: 'completed', end_date: '2026-10-12' },
        NOW
      )
    ).toBe(ISR_RECENTLY_DONE_S);
    expect(
      tournamentRevalidateSeconds(
        { status: 'completed', end_date: '2026-01-12' },
        NOW
      )
    ).toBe(ISR_ARCHIVED_S);
  });

  it('le direct reste sous la minute', () => {
    expect(ISR_LIVE_S).toBeLessThanOrEqual(60);
  });

  it('lecture dégradée → jamais plus que la fenêtre du direct', () => {
    expect(
      tournamentRevalidateSeconds(
        { status: 'completed', end_date: '2026-01-12' },
        NOW,
        { degraded: true }
      )
    ).toBe(ISR_LIVE_S);
  });
});

describe('matchRevalidateSeconds', () => {
  it('match à jouer ou en cours → 30 s', () => {
    expect(matchRevalidateSeconds({ status: 'pending' }, NOW)).toBe(
      ISR_MATCH_OPEN_S
    );
    expect(matchRevalidateSeconds({ status: 'ongoing' }, NOW)).toBe(
      ISR_MATCH_OPEN_S
    );
    expect(matchRevalidateSeconds({}, NOW)).toBe(ISR_MATCH_OPEN_S);
  });

  it('tranché depuis moins de 24 h → 5 min (MVP du public, maps)', () => {
    expect(
      matchRevalidateSeconds(
        { status: 'finished', completed_at: '2026-10-16T17:00:00Z' },
        NOW
      )
    ).toBe(ISR_MATCH_SETTLING_S);
  });

  it('tranché depuis plus de 24 h → un jour', () => {
    expect(
      matchRevalidateSeconds(
        { status: 'finished', completed_at: '2026-10-14T17:00:00Z' },
        NOW
      )
    ).toBe(ISR_ARCHIVED_S);
    expect(
      matchRevalidateSeconds(
        { status: 'walkover', scheduled_at: '2026-10-01T19:00:00Z' },
        NOW
      )
    ).toBe(ISR_ARCHIVED_S);
  });

  it('tranché sans aucune date → 5 min', () => {
    expect(matchRevalidateSeconds({ status: 'finished' }, NOW)).toBe(
      ISR_MATCH_SETTLING_S
    );
  });
});

describe('homeRevalidateSeconds', () => {
  it('jour de matchs : 15 min dès 2 h avant le premier coup d’envoi', () => {
    expect(homeRevalidateSeconds('2026-10-16T19:00:00Z', NOW)).toBe(
      ISR_HOME_MATCHDAY_S
    );
    // Journée entamée : le premier coup d'envoi est passé.
    expect(homeRevalidateSeconds('2026-10-16T17:00:00Z', NOW)).toBe(
      ISR_HOME_MATCHDAY_S
    );
  });

  it('hors journée de matchs : 1 h', () => {
    expect(homeRevalidateSeconds('2026-10-18T19:00:00Z', NOW)).toBe(
      ISR_HOME_QUIET_S
    );
    expect(homeRevalidateSeconds(null, NOW)).toBe(ISR_HOME_QUIET_S);
    expect(homeRevalidateSeconds('pas une date', NOW)).toBe(ISR_HOME_QUIET_S);
  });

  it('un rendu « calme » repasse avant que la journée ne commence', () => {
    // Invariant documenté : sinon la fenêtre d'une heure enjamberait l'entrée
    // dans la journée de matchs.
    expect(HOME_MATCHDAY_LEAD_MS / 1000).toBeGreaterThanOrEqual(
      ISR_HOME_QUIET_S
    );
  });

  it('contenu en échec → 15 min au plus', () => {
    expect(homeRevalidateSeconds(null, NOW, { degraded: true })).toBe(
      ISR_HOME_MATCHDAY_S
    );
  });
});

describe('publicCdnCacheControl', () => {
  it('public, moitié fraîche, moitié servie périmée', () => {
    expect(publicCdnCacheControl(60)).toBe(
      'public, s-maxage=30, stale-while-revalidate=30'
    );
  });

  it('âge maximal servi = la fenêtre', () => {
    for (const w of [1, 7, 60, 300, 3600, 86_400]) {
      const m = /s-maxage=(\d+), stale-while-revalidate=(\d+)/.exec(
        publicCdnCacheControl(w)
      );
      expect(m).not.toBeNull();
      const total = Number(m?.[1]) + Number(m?.[2]);
      expect(total).toBeLessThanOrEqual(Math.max(w, 2));
    }
  });
});
