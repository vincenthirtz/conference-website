// tests/unit/emailUnsubscribe.test.ts
//
// Tests pour le token de désabonnement signé (utils/emailUnsubscribe.ts).
//   - round-trip : generate → verify renvoie le même userId.
//   - tamper : toute altération (payload, signature, secret) → null.
//
// Le secret est figé via env avant import (UNSUBSCRIBE_SECRET prioritaire).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  generateEmailUnsubscribeToken,
  verifyEmailUnsubscribeToken,
} from '@/utils/emailUnsubscribe';

const USER_ID = '11111111-1111-1111-1111-111111111111';

describe('emailUnsubscribe token', () => {
  const prevUnsub = process.env.UNSUBSCRIBE_SECRET;
  const prevCron = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = 'fixed-unsub-secret';
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (prevUnsub === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prevUnsub;
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  });

  it('round-trips: verify returns the original userId', () => {
    const token = generateUnsubscribeToken(USER_ID);
    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);
    expect(verifyUnsubscribeToken(token)).toBe(USER_ID);
  });

  it('produces a URL-safe token (no +, /, = chars)', () => {
    const token = generateUnsubscribeToken(USER_ID);
    expect(/[+/=]/.test(token)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const token = generateUnsubscribeToken(USER_ID);
    const [payload, sig] = token.split('.');
    // Flip a char in the payload; signature no longer matches.
    const flipped =
      (payload[0] === 'A' ? 'B' : 'A') + payload.slice(1) + '.' + sig;
    expect(verifyUnsubscribeToken(flipped)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = generateUnsubscribeToken(USER_ID);
    const [payload, sig] = token.split('.');
    const flippedSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifyUnsubscribeToken(`${payload}.${flippedSig}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = generateUnsubscribeToken(USER_ID);
    process.env.UNSUBSCRIBE_SECRET = 'rotated-secret';
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it('falls back to CRON_SECRET when UNSUBSCRIBE_SECRET is absent', () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    process.env.CRON_SECRET = 'the-cron-secret';
    const token = generateUnsubscribeToken(USER_ID);
    expect(verifyUnsubscribeToken(token)).toBe(USER_ID);
  });

  it('rejects malformed tokens', () => {
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('no-dot')).toBeNull();
    expect(verifyUnsubscribeToken('.onlysig')).toBeNull();
    expect(verifyUnsubscribeToken('onlypayload.')).toBeNull();
    expect(verifyUnsubscribeToken('a.b.c')).toBeNull();
  });
});

describe('emailUnsubscribe EMAIL token', () => {
  const prevUnsub = process.env.UNSUBSCRIBE_SECRET;
  const prevCron = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = 'fixed-unsub-secret';
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (prevUnsub === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prevUnsub;
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  });

  it('round-trips: verify returns the (lowercased) email', () => {
    const token = generateEmailUnsubscribeToken('Foo@Bar.com');
    expect(verifyEmailUnsubscribeToken(token)).toBe('foo@bar.com');
  });

  it('normalizes casing/whitespace before signing (same token)', () => {
    expect(generateEmailUnsubscribeToken('  A@B.COM ')).toBe(
      generateEmailUnsubscribeToken('a@b.com')
    );
  });

  it('produces a URL-safe token', () => {
    const token = generateEmailUnsubscribeToken('a@b.com');
    expect(/[+/=]/.test(token)).toBe(false);
  });

  it('email and user tokens are NOT interchangeable', () => {
    // Un token user (champ `u`) ne se vérifie pas comme email, et vice-versa.
    const userToken = generateUnsubscribeToken(USER_ID);
    expect(verifyEmailUnsubscribeToken(userToken)).toBeNull();

    const emailToken = generateEmailUnsubscribeToken('a@b.com');
    expect(verifyUnsubscribeToken(emailToken)).toBeNull();
  });

  it('rejects tampered / wrong-secret email tokens', () => {
    const token = generateEmailUnsubscribeToken('a@b.com');
    const [payload, sig] = token.split('.');
    const flippedSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifyEmailUnsubscribeToken(`${payload}.${flippedSig}`)).toBeNull();

    process.env.UNSUBSCRIBE_SECRET = 'rotated-secret';
    expect(verifyEmailUnsubscribeToken(token)).toBeNull();
  });
});
