// tests/unit/webhookSsrf.test.ts
//
// Garde anti-SSRF des webhooks sortants :
//   - checkWebhookUrl (écriture : création ET modification) ;
//   - isBlockedWebhookAddress (plages privées / réservées, v4 + v6) ;
//   - postWebhook (envoi : résolution DNS revérifiée, pas de redirection).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWebhookUrl, isBlockedWebhookAddress } from '../../utils/webhooks';
import {
  assertPublicWebhookTarget,
  postWebhook,
} from '../../utils/webhookDelivery';

describe('isBlockedWebhookAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '[::1]',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '2001:db8::1',
  ])('bloque %s', (ip) => {
    expect(isBlockedWebhookAddress(ip)).toBe(true);
  });

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111'])(
    'laisse passer %s',
    (ip) => {
      expect(isBlockedWebhookAddress(ip)).toBe(false);
    }
  );

  it("un nom d'hôte n'est pas une IP : non bloqué ici", () => {
    expect(isBlockedWebhookAddress('example.com')).toBe(false);
  });
});

describe('checkWebhookUrl', () => {
  it('accepte une URL HTTPS publique et la normalise', () => {
    expect(checkWebhookUrl('  https://Example.com/hook  ')).toEqual({
      ok: true,
      url: 'https://example.com/hook',
    });
  });

  it.each([
    ['http://example.com/h', 'HTTPS'],
    ['ftp://example.com/h', 'HTTPS'],
    ['https://user:pw@example.com/h', 'identifiants'],
    ['https://localhost/h', 'non public'],
    ['https://foo.localhost/h', 'non public'],
    ['https://mariadb/h', 'non public'],
    ['https://svc.internal/h', 'non public'],
    ['https://127.0.0.1/h', 'privée'],
    ['https://2130706433/h', 'privée'], // 127.0.0.1 en décimal
    ['https://0x7f.1/h', 'privée'],
    ['https://169.254.169.254/latest/meta-data', 'privée'],
    ['https://[::1]/h', 'privée'],
    ['https://[::ffff:10.0.0.1]/h', 'privée'],
    ['pas une url', 'invalide'],
    ['', 'requise'],
  ])('refuse %s', (url, reason) => {
    const res = checkWebhookUrl(url);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain(reason);
  });

  it('refuse une URL trop longue', () => {
    const res = checkWebhookUrl(`https://example.com/${'a'.repeat(2100)}`);
    expect(res.ok).toBe(false);
  });

  it('refuse un non-string', () => {
    expect(checkWebhookUrl(42).ok).toBe(false);
  });
});

describe('assertPublicWebhookTarget / postWebhook', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuse un nom qui RÉSOUT vers une adresse privée, sans appel réseau', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await postWebhook(
      'https://evil.example.com/h',
      '{}',
      {},
      { resolve: async () => ['10.0.0.5'] }
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBeNull();
    expect(res.error).toMatch(/privée/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une IP privée littérale (abonnement antérieur à la règle)', async () => {
    expect(
      await assertPublicWebhookTarget('http://192.168.0.10/h', async () => [])
    ).toMatch(/privée/);
  });

  it('erreur DNS → refus explicite', async () => {
    const reason = await assertPublicWebhookTarget(
      'https://nope.example.com/h',
      async () => {
        throw new Error('ENOTFOUND');
      }
    );
    expect(reason).toMatch(/DNS/);
  });

  it('POST sans suivre les redirections ; une 3xx est un échec', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await postWebhook(
      'https://example.com/h',
      '{"a":1}',
      { 'X-Test': '1' },
      { resolve: async () => ['93.184.216.34'] }
    );
    expect(res).toEqual({ ok: false, status: 302, error: 'HTTP 302' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.redirect).toBe('manual');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
  });

  it('2xx → ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 }))
    );
    const res = await postWebhook(
      'https://example.com/h',
      '{}',
      {},
      { resolve: async () => ['93.184.216.34'] }
    );
    expect(res).toEqual({ ok: true, status: 200, error: null });
  });
});
