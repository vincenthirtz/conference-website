import { describe, it, expect } from 'vitest';

import {
  checkEmailQuality,
  normalizeEmail,
  EMAIL_QUALITY_MESSAGES,
} from '../../utils/emailQuality';
import {
  checkEmailDomainDns,
  type EmailDnsResolver,
} from '../../utils/emailDns';

describe('normalizeEmail', () => {
  it('trim + lowercase', () => {
    expect(normalizeEmail('  Foo.Bar@GMAIL.Com ')).toBe('foo.bar@gmail.com');
  });
});

describe('checkEmailQuality — syntaxe', () => {
  it.each([
    'foo.bar@gmail.com',
    'a@a.com', // syntaxe valide — c'est le check DNS qui doit l'attraper
    "o'neil+tag@sub.domain.co",
    'X@HOTMAIL.FR', // normalisé avant contrôle
  ])('accepte %s', (email) => {
    expect(checkEmailQuality(email)).toEqual({ ok: true });
  });

  it.each([
    'pas-un-email',
    'foo@',
    '@bar.com',
    'foo@bar', // pas de TLD
    'foo@bar.c', // TLD trop court
    'foo@bar.123', // TLD numérique
    'foo..bar@gmail.com', // points consécutifs dans le local-part
    '.foo@gmail.com', // point initial
    'foo@-bad.com', // label commençant par un tiret
    `${'a'.repeat(65)}@gmail.com`, // local-part > 64
    `foo@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`, // total > 254
  ])('rejette %s (syntax)', (email) => {
    expect(checkEmailQuality(email)).toEqual({ ok: false, reason: 'syntax' });
  });
});

describe('checkEmailQuality — domaines bloqués', () => {
  it.each([
    'x@yopmail.com',
    'x@YOPMAIL.com', // insensible à la casse
    'x@foo.yopmail.com', // sous-domaine d’un domaine bloqué
    'x@mailinator.com',
    'x@example.com', // placeholder
    'x@anything.test', // TLD réservé RFC 2606
    'x@machine.local',
    'x@domaine.invalid',
  ])('rejette %s (blocked_domain)', (email) => {
    expect(checkEmailQuality(email)).toEqual({
      ok: false,
      reason: 'blocked_domain',
    });
  });

  it('a un message utilisateur pour chaque raison', () => {
    expect(EMAIL_QUALITY_MESSAGES.syntax).toBeTruthy();
    expect(EMAIL_QUALITY_MESSAGES.blocked_domain).toBeTruthy();
  });
});

// ── Vérification DNS (résolveur injecté, aucun appel réseau) ─────────────

function makeResolver(over: Partial<EmailDnsResolver>): EmailDnsResolver {
  const nxdomain = () => {
    const err = new Error('queryMx ENOTFOUND') as Error & { code: string };
    err.code = 'ENOTFOUND';
    return Promise.reject(err);
  };
  return {
    resolveMx: nxdomain,
    resolve4: nxdomain,
    resolve6: nxdomain,
    ...over,
  };
}

describe('checkEmailDomainDns', () => {
  it('ok quand le domaine a un MX', async () => {
    const resolver = makeResolver({
      resolveMx: async () => [{ exchange: 'mx1.gmail.com' }],
    });
    expect(await checkEmailDomainDns('x@gmail.com', { resolver })).toEqual({
      ok: true,
    });
  });

  it('ok sans MX mais avec un enregistrement A (repli RFC 5321)', async () => {
    const resolver = makeResolver({
      resolveMx: async () => [],
      resolve4: async () => ['203.0.113.10'],
    });
    expect(await checkEmailDomainDns('x@site.fr', { resolver })).toEqual({
      ok: true,
    });
  });

  it('rejette un domaine NXDOMAIN (le cas a@a.com)', async () => {
    const resolver = makeResolver({});
    expect(await checkEmailDomainDns('a@a.com', { resolver })).toEqual({
      ok: false,
      reason: 'domain_unresolvable',
    });
  });

  it('rejette un null-MX RFC 7505 (« ce domaine ne reçoit pas d’email »)', async () => {
    const resolver = makeResolver({
      resolveMx: async () => [{ exchange: '.' }],
    });
    expect(await checkEmailDomainDns('x@no-mail.org', { resolver })).toEqual({
      ok: false,
      reason: 'domain_unresolvable',
    });
  });

  it('fail-open sur erreur DNS transitoire (SERVFAIL)', async () => {
    const servfail = () => {
      const err = new Error('queryMx ESERVFAIL') as Error & { code: string };
      err.code = 'ESERVFAIL';
      return Promise.reject(err);
    };
    const resolver = makeResolver({ resolveMx: servfail });
    expect(await checkEmailDomainDns('x@flaky.net', { resolver })).toEqual({
      ok: true,
    });
  });

  it('fail-open sur timeout du résolveur', async () => {
    const hang = () => new Promise<never>(() => {});
    const resolver = makeResolver({ resolveMx: hang });
    expect(
      await checkEmailDomainDns('x@slow.net', { resolver, timeoutMs: 20 })
    ).toEqual({ ok: true });
  });

  it('rejette une adresse sans domaine', async () => {
    expect(await checkEmailDomainDns('nope', {})).toEqual({
      ok: false,
      reason: 'domain_unresolvable',
    });
  });
});
