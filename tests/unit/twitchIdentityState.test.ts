// State OAuth du rattachement Twitch côté joueuse.
// Target: utils/twitchIdentity.ts
//
// CE QUE CES CAS PROTÈGENT. Le state est la SEULE preuve que le retour OAuth
// répond bien à une demande que nous avons émise. S'il cesse d'être vérifié —
// signature, péremption, ou comparaison en temps constant — un tiers peut faire
// rattacher un compte Twitch au compte de quelqu'un d'autre. C'est une prise de
// contrôle d'identité silencieuse, pas une gêne.
//
// LA PÉREMPTION COMPTE AUTANT QUE LA SIGNATURE : un state correctement signé
// mais vieux d'une semaine est un state volé qui traîne. Et un state daté du
// FUTUR est aberrant — horloge trafiquée ou charge forgée.

import { describe, it, expect, beforeAll } from 'vitest';

import {
  signTwitchIdentityState,
  verifyTwitchIdentityState,
  generateStateNonce,
} from '../../utils/twitchIdentity';

const USER = '11111111-1111-4111-8111-111111111111';

beforeAll(() => {
  // La signature dérive d'un secret d'environnement ; sans lui le module lève.
  process.env.TWITCH_CLIENT_SECRET ||= 'test-twitch-secret';
});

describe('state OAuth Twitch', () => {
  it('signe puis relit un état intact', () => {
    const nonce = generateStateNonce();
    const state = signTwitchIdentityState({
      nonce,
      authUserId: USER,
      returnTo: '/player/profile',
    });

    const parsed = verifyTwitchIdentityState(state);
    expect(parsed?.nonce).toBe(nonce);
    expect(parsed?.authUserId).toBe(USER);
    expect(parsed?.returnTo).toBe('/player/profile');
  });

  it('refuse un corps altéré', () => {
    // Le cœur de la garantie : changer le compte visé doit invalider la
    // signature, sinon on rattache le compte Twitch à qui l'on veut.
    const state = signTwitchIdentityState({
      nonce: generateStateNonce(),
      authUserId: USER,
      returnTo: '/player/profile',
    });
    const [body, sig] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        nonce: 'x',
        authUserId: '22222222-2222-4222-8222-222222222222',
        returnTo: '/player/profile',
        issuedAt: Date.now(),
      }),
      'utf8'
    ).toString('base64url');

    expect(verifyTwitchIdentityState(`${forged}.${sig}`)).toBeNull();
    expect(body).not.toBe(forged);
  });

  it('refuse une signature tronquée sans lever', () => {
    // Longueurs différentes : `timingSafeEqual` jette si on l'appelle tel quel.
    const state = signTwitchIdentityState({
      nonce: generateStateNonce(),
      authUserId: USER,
      returnTo: '/',
    });
    expect(() =>
      verifyTwitchIdentityState(`${state.split('.')[0]}.abc`)
    ).not.toThrow();
    expect(verifyTwitchIdentityState(`${state.split('.')[0]}.abc`)).toBeNull();
  });

  it('refuse un état périmé', () => {
    const state = signTwitchIdentityState({
      nonce: generateStateNonce(),
      authUserId: USER,
      returnTo: '/',
      issuedAt: Date.now() - 60 * 60 * 1000,
    });
    expect(verifyTwitchIdentityState(state)).toBeNull();
  });

  it('refuse un état daté du FUTUR', () => {
    // Aberrant : horloge trafiquée ou charge construite à la main.
    const state = signTwitchIdentityState({
      nonce: generateStateNonce(),
      authUserId: USER,
      returnTo: '/',
      issuedAt: Date.now() + 10 * 60 * 1000,
    });
    expect(verifyTwitchIdentityState(state)).toBeNull();
  });

  it('refuse une entrée vide ou malformée plutôt que de lever', () => {
    for (const bad of [undefined, null, '', 'sans-point', '.abc', 'abc.']) {
      expect(verifyTwitchIdentityState(bad as string | null)).toBeNull();
    }
  });

  it('rend des nonces distincts', () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => generateStateNonce())
    );
    expect(seen.size).toBe(50);
  });
});
