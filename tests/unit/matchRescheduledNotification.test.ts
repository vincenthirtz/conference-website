import { describe, it, expect } from 'vitest';
import {
  EMAIL_EVENT_TYPES,
  PLAYER_PUSH_EVENT_TYPES,
  WEB_PUSH_EVENT_TYPES,
  playerUrlForEvent,
  renderEmailPayload,
  renderWebPushPayload,
} from '../../utils/webPushEvents';

// « Ton match a bougé » est l'information la plus urgente qu'une équipe puisse
// recevoir de la plateforme. Elle ne voyageait que par le digest email, en
// opt-in — le canal le moins susceptible d'être actif chez celles qu'il faut
// prévenir. Ces tests figent le fait qu'elle emprunte les trois canaux.
const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const payload = {
  match_id: MATCH_ID,
  matchId: MATCH_ID,
  from: '2026-10-21T18:30:00.000Z', // 20 h 30 Paris
  to: '2026-10-21T20:00:00.000Z', // 22 h Paris
};

describe('match.rescheduled · canaux', () => {
  it('emprunte le push staff, le push joueuse ET l’email', () => {
    expect(WEB_PUSH_EVENT_TYPES).toContain('match.rescheduled');
    expect(PLAYER_PUSH_EVENT_TYPES).toContain('match.rescheduled');
    expect(EMAIL_EVENT_TYPES).toContain('match.rescheduled');
  });

  it('renvoie la joueuse vers la fiche du match, pas vers l’admin', () => {
    expect(playerUrlForEvent('match.rescheduled', payload)).toBe(
      `/player/match/${MATCH_ID}`
    );
  });
});

describe('match.rescheduled · push', () => {
  it('met la NOUVELLE date en avant', () => {
    const p = renderWebPushPayload('match.rescheduled', payload);
    expect(p.title).toBe('Match déplacé');
    expect(p.body).toContain('22:00');
    // L'ancienne date n'apporte rien sur un écran verrouillé.
    expect(p.body).not.toContain('20:30');
  });

  it('reste lisible sans date de destination', () => {
    const p = renderWebPushPayload('match.rescheduled', { match_id: MATCH_ID });
    expect(p.body).toContain('changé de date');
  });

  it('ne jette pas sur une date illisible', () => {
    const p = renderWebPushPayload('match.rescheduled', {
      match_id: MATCH_ID,
      to: 'pas-une-date',
    });
    expect(typeof p.body).toBe('string');
  });
});

describe('match.rescheduled · email', () => {
  it('écrit LES DEUX dates — c’est le canal où l’on vérifie', () => {
    const e = renderEmailPayload('match.rescheduled', payload);
    expect(e.heading).toBe('Match déplacé');
    expect(e.body).toContain('20:30');
    expect(e.body).toContain('22:00');
  });

  it('se contente de la nouvelle date quand l’ancienne manque', () => {
    const e = renderEmailPayload('match.rescheduled', {
      match_id: MATCH_ID,
      to: payload.to,
    });
    expect(e.body).toContain('22:00');
    expect(e.body).not.toContain('passe du');
  });
});
