// Encart « événement du moment » de l'espace joueuse : la logique sortie de
// EventSignupCard (URL de l'inscription regroupée, message d'erreur).

import { describe, it, expect } from 'vitest';
import { dashboardUrls } from '@/features/player/dashboard/client';
import {
  eventPoolErrorKind,
  eventPoolKey,
} from '@/features/player/dashboard/hooks/useEventPoolSignup';
import { PlayerHttpError } from '@/utils/player/playerHttp';

describe('encart événement : inscription regroupée', () => {
  it('vise la route pool du tournoi, comme l’appel d’origine', () => {
    expect(dashboardUrls.eventPool('t-1')).toBe('/api/tournament/t-1/pool');
  });

  it('« inscriptions closes » sur REGISTRATION_CLOSED', () => {
    const err = new PlayerHttpError('Fermé', 409, {
      error: 'Fermé',
      code: 'REGISTRATION_CLOSED',
    });
    expect(eventPoolErrorKind(err)).toBe('closed');
  });

  it('message générique pour tout autre échec (code, réseau, inconnu)', () => {
    expect(
      eventPoolErrorKind(
        new PlayerHttpError('x', 400, { error: 'x', code: 'VALIDATION' })
      )
    ).toBe('generic');
    expect(eventPoolErrorKind(new TypeError('Failed to fetch'))).toBe(
      'generic'
    );
    expect(eventPoolErrorKind(null)).toBe('generic');
  });

  it('clé de cache propre à la joueuse et au tournoi', () => {
    expect(eventPoolKey('t-1')).toEqual([
      'player',
      'self',
      null,
      'event-pool',
      't-1',
    ]);
  });
});
