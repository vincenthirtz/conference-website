// Constat « limites de débit contournables par en-tête forgé ».
//
// `getClientIp` croyait `cf-connecting-ip` / `x-real-ip` / `x-forwarded-for`,
// que le client envoie lui-même : faire varier l'un d'eux donnait un compteur
// neuf à chaque requête. Correctif ADDITIF : l'en-tête plateforme Netlify
// `x-nf-client-connection-ip` fait foi quand il est présent et bien formé ;
// sinon l'algorithme historique s'applique À L'IDENTIQUE.
//
// Le second bloc est le filet anti-régression d'un soir de match : il recopie
// l'ancienne implémentation et vérifie la parité sur un tableau de cas. Si la
// sortie divergeait (ex. tout le monde sur 'unknown'), tout le site partagerait
// un seul compteur et servirait des 429 en masse.

import { describe, it, expect, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.unmock('@/utils/rateLimit');

import { applyRateLimit, getClientIp } from '../../utils/rateLimit';

type Headers = Record<string, string | string[]>;

function makeReq(
  headers: Headers = {},
  remote: string | undefined = '1.2.3.4'
): NextApiRequest {
  return {
    headers,
    socket: { remoteAddress: remote } as any,
  } as unknown as NextApiRequest;
}

/** Copie conforme de getClientIp AVANT le correctif (référence de parité). */
function legacyGetClientIp(req: NextApiRequest): string {
  const IP_RE = /^[\d.a-fA-F:]+$/;
  const cfIp = req.headers['cf-connecting-ip'];
  const realIp = req.headers['x-real-ip'];
  const forwarded = req.headers['x-forwarded-for'];
  const raw =
    (typeof cfIp === 'string' ? cfIp : undefined) ||
    (typeof realIp === 'string' ? realIp : undefined) ||
    (typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : undefined) ||
    req.socket.remoteAddress ||
    'unknown';
  return IP_RE.test(raw) ? raw : 'unknown';
}

describe('getClientIp — en-tête Netlify', () => {
  it("l'emporte sur un cf-connecting-ip forgé", () => {
    const req = makeReq({
      'x-nf-client-connection-ip': '203.0.113.7',
      'cf-connecting-ip': '9.9.9.9',
      'x-real-ip': '8.8.8.8',
      'x-forwarded-for': '7.7.7.7',
    });
    expect(getClientIp(req)).toBe('203.0.113.7');
  });

  it('accepte une IPv6', () => {
    const req = makeReq({
      'x-nf-client-connection-ip': '2001:db8::1',
      'cf-connecting-ip': '9.9.9.9',
    });
    expect(getClientIp(req)).toBe('2001:db8::1');
  });

  it('faire varier cf-connecting-ip ne donne plus de compteur neuf', () => {
    const store = 'nf-forged-loop';
    const cfg = { max: 3, windowMs: 60_000 };
    const res = () =>
      ({
        status: vi.fn(() => ({ json: vi.fn() })),
        setHeader: vi.fn(),
      }) as unknown as NextApiResponse;

    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        applyRateLimit(
          makeReq({
            'x-nf-client-connection-ip': '203.0.113.8',
            'cf-connecting-ip': `10.0.0.${i + 1}`,
          }),
          res(),
          cfg,
          store
        )
      );
    }
    expect(results).toEqual([false, false, false, true, true]);
  });

  it.each([
    ['vide', ''],
    ['blanc', '   '],
    ['format invalide', '<script>'],
    ['valeurs jointes', '203.0.113.7, 9.9.9.9'],
  ])(
    '%s → repli sur l’algorithme historique, jamais "unknown" imposé',
    (_l, v) => {
      const req = makeReq({
        'x-nf-client-connection-ip': v,
        'x-real-ip': '8.8.8.8',
      });
      expect(getClientIp(req)).toBe(legacyGetClientIp(req));
      expect(getClientIp(req)).toBe('8.8.8.8');
    }
  );

  it('valeur tableau (non string) → repli historique', () => {
    const req = makeReq({
      'x-nf-client-connection-ip': ['203.0.113.7'],
      'x-forwarded-for': '7.7.7.7',
    });
    expect(getClientIp(req)).toBe('7.7.7.7');
  });
});

describe('getClientIp — parité exacte sans en-tête Netlify', () => {
  const cases: Array<[string, Headers, string | undefined]> = [
    ['aucun en-tête, socket', {}, '1.1.1.1'],
    ['aucun en-tête, pas de socket', {}, undefined],
    ['cf seul', { 'cf-connecting-ip': '9.9.9.9' }, '1.1.1.1'],
    ['real seul', { 'x-real-ip': '8.8.8.8' }, '1.1.1.1'],
    ['xff une valeur', { 'x-forwarded-for': '7.7.7.7' }, '1.1.1.1'],
    ['xff chaîne', { 'x-forwarded-for': '7.7.7.7, 6.6.6.6' }, '1.1.1.1'],
    ['xff espaces', { 'x-forwarded-for': '  7.7.7.7 ,6.6.6.6' }, '1.1.1.1'],
    ['xff vide', { 'x-forwarded-for': '' }, '1.1.1.1'],
    ['xff premier vide', { 'x-forwarded-for': ', 6.6.6.6' }, '1.1.1.1'],
    [
      'les trois',
      {
        'cf-connecting-ip': '9.9.9.9',
        'x-real-ip': '8.8.8.8',
        'x-forwarded-for': '7.7.7.7',
      },
      '1.1.1.1',
    ],
    [
      'real + xff',
      { 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '7.7.7.7' },
      '1.1.1.1',
    ],
    [
      'cf vide → real',
      { 'cf-connecting-ip': '', 'x-real-ip': '8.8.8.8' },
      '1.1.1.1',
    ],
    ['cf forgé invalide', { 'cf-connecting-ip': '<script>' }, '1.1.1.1'],
    [
      'cf invalide masque real',
      { 'cf-connecting-ip': 'abc xyz', 'x-real-ip': '8.8.8.8' },
      '1.1.1.1',
    ],
    ['xff tableau ignoré', { 'x-forwarded-for': ['7.7.7.7'] }, '1.1.1.1'],
    ['ipv6', { 'x-real-ip': '2001:db8::2' }, '1.1.1.1'],
    ['socket ipv4-mapped', {}, '::ffff:127.0.0.1'],
    ['socket ipv6', {}, '::1'],
    [
      'autre en-tête x-nf- sans rapport',
      { 'x-nf-request-id': 'abc' },
      '1.1.1.1',
    ],
  ];

  it.each(cases)('%s', (_label, headers, remote) => {
    const req = makeReq(headers, remote);
    expect(getClientIp(req)).toBe(legacyGetClientIp(req));
  });
});
