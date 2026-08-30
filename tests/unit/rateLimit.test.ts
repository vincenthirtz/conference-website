import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Global setup mocks @/utils/rateLimit so unit tests can bypass it. This file
// exercises the REAL implementation, so undo that mock before importing.
vi.unmock('@/utils/rateLimit');

import {
  applyRateLimit,
  getClientIp,
  refundRateLimit,
} from '../../utils/rateLimit';

function makeReq(
  headers: Record<string, string> = {},
  remote = '1.2.3.4'
): NextApiRequest {
  return {
    headers,
    socket: { remoteAddress: remote } as any,
  } as unknown as NextApiRequest;
}

function makeRes(): {
  res: NextApiResponse;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const res = {
    status,
    setHeader,
  } as unknown as NextApiResponse;
  return { res, status, json, setHeader };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getClientIp', () => {
  it('prefers cf-connecting-ip', () => {
    const req = makeReq({
      'cf-connecting-ip': '9.9.9.9',
      'x-real-ip': '8.8.8.8',
      'x-forwarded-for': '7.7.7.7',
    });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip', () => {
    const req = makeReq({
      'x-real-ip': '8.8.8.8',
      'x-forwarded-for': '7.7.7.7',
    });
    expect(getClientIp(req)).toBe('8.8.8.8');
  });

  it('falls back to first hop of x-forwarded-for', () => {
    const req = makeReq({ 'x-forwarded-for': '7.7.7.7, 6.6.6.6' });
    expect(getClientIp(req)).toBe('7.7.7.7');
  });

  it('falls back to socket remoteAddress', () => {
    const req = makeReq({}, '1.1.1.1');
    expect(getClientIp(req)).toBe('1.1.1.1');
  });

  it('returns "unknown" when nothing is set', () => {
    const req = { headers: {}, socket: {} } as unknown as NextApiRequest;
    expect(getClientIp(req)).toBe('unknown');
  });

  it('rejects obviously spoofed values', () => {
    const req = makeReq({ 'cf-connecting-ip': '<script>alert(1)</script>' });
    expect(getClientIp(req)).toBe('unknown');
  });
});

describe('applyRateLimit', () => {
  it('allows the first request and does not call res.status', () => {
    const { res, status } = makeRes();
    const blocked = applyRateLimit(
      makeReq({ 'x-real-ip': '10.0.0.1' }),
      res,
      { max: 3, windowMs: 60_000 },
      'rl-test-1'
    );
    expect(blocked).toBe(false);
    expect(status).not.toHaveBeenCalled();
  });

  it('allows up to `max` requests within the window', () => {
    for (let i = 0; i < 3; i++) {
      const { res, status } = makeRes();
      const blocked = applyRateLimit(
        makeReq({ 'x-real-ip': '10.0.0.2' }),
        res,
        { max: 3, windowMs: 60_000 },
        'rl-test-2'
      );
      expect(blocked).toBe(false);
      expect(status).not.toHaveBeenCalled();
    }
  });

  it('blocks the (max+1)th request with 429 and a Retry-After header', () => {
    for (let i = 0; i < 3; i++) {
      const { res } = makeRes();
      applyRateLimit(
        makeReq({ 'x-real-ip': '10.0.0.3' }),
        res,
        { max: 3, windowMs: 60_000 },
        'rl-test-3'
      );
    }
    const { res, status, json, setHeader } = makeRes();
    const blocked = applyRateLimit(
      makeReq({ 'x-real-ip': '10.0.0.3' }),
      res,
      { max: 3, windowMs: 60_000 },
      'rl-test-3'
    );

    expect(blocked).toBe(true);
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('clears expired timestamps once the window passes', () => {
    for (let i = 0; i < 3; i++) {
      const { res } = makeRes();
      applyRateLimit(
        makeReq({ 'x-real-ip': '10.0.0.4' }),
        res,
        { max: 3, windowMs: 60_000 },
        'rl-test-4'
      );
    }

    // Move past the window
    vi.setSystemTime(new Date('2026-04-01T12:01:01Z'));

    const { res, status } = makeRes();
    const blocked = applyRateLimit(
      makeReq({ 'x-real-ip': '10.0.0.4' }),
      res,
      { max: 3, windowMs: 60_000 },
      'rl-test-4'
    );

    expect(blocked).toBe(false);
    expect(status).not.toHaveBeenCalled();
  });

  it('isolates store names — different storeName means independent counters', () => {
    for (let i = 0; i < 3; i++) {
      const { res } = makeRes();
      applyRateLimit(
        makeReq({ 'x-real-ip': '10.0.0.5' }),
        res,
        { max: 3, windowMs: 60_000 },
        'rl-test-5a'
      );
    }

    const { res, status } = makeRes();
    const blocked = applyRateLimit(
      makeReq({ 'x-real-ip': '10.0.0.5' }),
      res,
      { max: 3, windowMs: 60_000 },
      'rl-test-5b'
    );
    expect(blocked).toBe(false);
    expect(status).not.toHaveBeenCalled();
  });

  it('isolates IPs within the same store', () => {
    for (let i = 0; i < 3; i++) {
      const { res } = makeRes();
      applyRateLimit(
        makeReq({ 'x-real-ip': '10.0.0.6' }),
        res,
        { max: 3, windowMs: 60_000 },
        'rl-test-6'
      );
    }

    const { res, status } = makeRes();
    const blocked = applyRateLimit(
      makeReq({ 'x-real-ip': '10.0.0.7' }),
      res,
      { max: 3, windowMs: 60_000 },
      'rl-test-6'
    );
    expect(blocked).toBe(false);
    expect(status).not.toHaveBeenCalled();
  });
});

describe('refundRateLimit', () => {
  it('rend la tentative : une panne de notre côté ne coûte rien', () => {
    // C'est le scénario vécu : le quota d'e-mails était épuisé, l'inscription
    // échouait en 500, et chaque essai débitait quand même. Au 6ᵉ, la personne
    // lisait « trop de tentatives » sans avoir rien fait de mal.
    const store = 'refund-panne';
    const cfg = { max: 2, windowMs: 60_000 };
    const req = makeReq({ 'x-real-ip': '9.9.9.9' });

    expect(applyRateLimit(req, makeRes().res, cfg, store)).toBe(false);
    refundRateLimit(req, store); // l'appel a échoué chez nous
    expect(applyRateLimit(req, makeRes().res, cfg, store)).toBe(false);
    refundRateLimit(req, store);

    // Après deux échecs rendus, le quota est intact.
    expect(applyRateLimit(req, makeRes().res, cfg, store)).toBe(false);
    expect(applyRateLimit(req, makeRes().res, cfg, store)).toBe(false);
    const blocked = makeRes();
    expect(applyRateLimit(req, blocked.res, cfg, store)).toBe(true);
  });

  it('ne rend rien quand l’IP n’a aucune tentative en cours', () => {
    const req = makeReq({ 'x-real-ip': '9.9.9.10' });
    expect(() => refundRateLimit(req, 'refund-vide')).not.toThrow();
  });

  it('ne rend qu’UNE tentative par appel', () => {
    // Un refus légitime (validation, doublon) doit rester décompté : le refund
    // est ciblé, il ne remet pas les compteurs à zéro.
    const store = 'refund-unitaire';
    const cfg = { max: 3, windowMs: 60_000 };
    const req = makeReq({ 'x-real-ip': '9.9.9.11' });

    applyRateLimit(req, makeRes().res, cfg, store);
    applyRateLimit(req, makeRes().res, cfg, store);
    refundRateLimit(req, store);

    expect(applyRateLimit(req, makeRes().res, cfg, store)).toBe(false);
    expect(applyRateLimit(req, makeRes().res, cfg, store)).toBe(false);
    expect(applyRateLimit(req, makeRes().res, cfg, store)).toBe(true);
  });
});
