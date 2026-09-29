import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  PLAYER_ERROR_CODES,
  PlayerError,
  parseBody,
} from '@/utils/player/errors';
import { AdminError } from '@/utils/admin/errors';
import { playerErrorMessage } from '@/features/player/_shared/errorMessage';
import nsPlayerErrors from '@/lib/i18n/locales/fr/playerErrors';
import enPlayerErrors from '@/lib/i18n/locales/en/playerErrors';

describe('catalogue des erreurs joueuse (P4)', () => {
  it('chaque code du catalogue a son message FR et EN, et rien de plus', () => {
    const codes = [...PLAYER_ERROR_CODES].sort();
    expect(Object.keys(nsPlayerErrors.fr).sort()).toEqual(codes);
    expect(Object.keys(enPlayerErrors).sort()).toEqual(codes);
  });

  it('PlayerError est sérialisée par le noyau comme une AdminError', () => {
    const err = new PlayerError(409, 'precondition', 'Trop tard.', {
      reason: 'roster_locked',
    });
    expect(err).toBeInstanceOf(AdminError);
    expect(err.toBody('req-1')).toEqual({
      error: 'Trop tard.',
      code: 'precondition',
      reason: 'roster_locked',
      requestId: 'req-1',
    });
  });
});

describe('parseBody', () => {
  const Body = z.object({
    name: z.string({ error: 'Nom requis.' }).min(2, 'Nom trop court.'),
    age: z.number({ error: 'Âge requis.' }),
  });

  it('rend les données typées', () => {
    expect(parseBody(Body, { name: 'Ana', age: 3 })).toEqual({
      ok: true,
      data: { name: 'Ana', age: 3 },
    });
  });

  it('première issue = message, code validation, fields par champ', () => {
    const r = parseBody(Body, { name: 'A' });
    expect(r).toEqual({
      ok: false,
      body: {
        error: 'Nom trop court.',
        code: 'validation',
        fields: { name: 'Nom trop court.', age: 'Âge requis.' },
      },
    });
  });

  it('message et code historiques prioritaires ; corps absent = {}', () => {
    const r = parseBody(Body, undefined, {
      message: 'Corps invalide.',
      code: 'INVALID_BODY',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.body.error).toBe('Corps invalide.');
      expect(r.body.code).toBe('INVALID_BODY');
    }
  });
});

describe('playerErrorMessage', () => {
  const fr = nsPlayerErrors.fr;
  it('code du catalogue → message traduit', () => {
    expect(playerErrorMessage({ error: 'x', code: 'forbidden' }, fr)).toBe(
      fr.forbidden
    );
  });
  it('code historique → texte serveur en repli', () => {
    expect(
      playerErrorMessage(
        { error: 'Roster verrouillé.', code: 'ROSTER_LOCKED' },
        fr
      )
    ).toBe('Roster verrouillé.');
  });
  it('corps illisible → message générique', () => {
    expect(playerErrorMessage(null, fr)).toBe(fr.internal);
    expect(playerErrorMessage({ error: '  ' }, fr)).toBe(fr.internal);
  });
});
