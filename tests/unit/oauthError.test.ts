import { describe, expect, it } from 'vitest';
import {
  isIdentityAlreadyLinked,
  readOAuthError,
  readOAuthErrorFromHash,
  readOAuthErrorFromQuery,
} from '../../utils/auth/oauthError';

describe('readOAuthErrorFromQuery', () => {
  it('renvoie null sur une query vide ou sans erreur', () => {
    expect(readOAuthErrorFromQuery(null)).toBeNull();
    expect(readOAuthErrorFromQuery(undefined)).toBeNull();
    expect(readOAuthErrorFromQuery({})).toBeNull();
    expect(
      readOAuthErrorFromQuery({ code: 'abc', next: '/player' })
    ).toBeNull();
  });

  it('lit error_code + error_description', () => {
    expect(
      readOAuthErrorFromQuery({
        error: 'invalid_request',
        error_code: 'identity_already_exists',
        error_description: 'Identity is already linked to another user',
      })
    ).toEqual({
      code: 'identity_already_exists',
      description: 'Identity is already linked to another user',
    });
  });

  it('retombe sur `error` quand `error_code` manque', () => {
    expect(readOAuthErrorFromQuery({ error: 'access_denied' })).toEqual({
      code: 'access_denied',
      description: null,
    });
  });

  it('prend la première valeur quand le paramètre est répété', () => {
    // Next.js rend un tableau dès qu'un paramètre apparaît deux fois.
    expect(
      readOAuthErrorFromQuery({ error: ['access_denied', 'autre'] })
    ).toEqual({ code: 'access_denied', description: null });
  });
});

describe('readOAuthErrorFromHash', () => {
  it('renvoie null sur un fragment absent, vide ou sans erreur', () => {
    expect(readOAuthErrorFromHash(null)).toBeNull();
    expect(readOAuthErrorFromHash('')).toBeNull();
    expect(readOAuthErrorFromHash('#')).toBeNull();
    expect(readOAuthErrorFromHash('#access_token=xyz')).toBeNull();
  });

  it('lit une erreur portée par le fragment (flow implicite)', () => {
    // Le fragment n'atteint jamais le serveur : il faut le lire côté client.
    expect(
      readOAuthErrorFromHash(
        '#error=invalid_request&error_code=identity_already_exists&error_description=Identity%20is%20already%20linked'
      )
    ).toEqual({
      code: 'identity_already_exists',
      description: 'Identity is already linked',
    });
  });

  it('tolère un fragment sans le # de tête', () => {
    expect(readOAuthErrorFromHash('error=access_denied')).toEqual({
      code: 'access_denied',
      description: null,
    });
  });
});

describe('readOAuthError', () => {
  it('la query prime sur le fragment', () => {
    expect(
      readOAuthError({ error_code: 'from_query' }, '#error_code=from_hash')
    ).toEqual({ code: 'from_query', description: null });
  });

  it('retombe sur le fragment quand la query est propre', () => {
    expect(readOAuthError({ code: 'abc' }, '#error_code=from_hash')).toEqual({
      code: 'from_hash',
      description: null,
    });
  });

  it('renvoie null quand aucun des deux ne porte d’erreur', () => {
    expect(readOAuthError({ code: 'abc' }, '#access_token=xyz')).toBeNull();
  });
});

describe('isIdentityAlreadyLinked', () => {
  it('reconnaît le code Supabase', () => {
    expect(
      isIdentityAlreadyLinked({
        code: 'identity_already_exists',
        description: null,
      })
    ).toBe(true);
  });

  it('reconnaît aussi le libellé, le code variant selon les versions', () => {
    expect(
      isIdentityAlreadyLinked({
        code: 'invalid_request',
        description: 'Identity is already linked to another user',
      })
    ).toBe(true);
  });

  it('reste faux pour les autres échecs', () => {
    expect(
      isIdentityAlreadyLinked({ code: 'access_denied', description: null })
    ).toBe(false);
    expect(isIdentityAlreadyLinked(null)).toBe(false);
    expect(isIdentityAlreadyLinked(undefined)).toBe(false);
  });
});
