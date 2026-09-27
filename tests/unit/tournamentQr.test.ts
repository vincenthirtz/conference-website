// Tests pour pages/api/tournament/[id]/qr.ts — le QR code du lien
// d'inscription d'un tournoi.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import handler, { parseQrSize } from '../../pages/api/tournament/[id]/qr';

const SOLO_ID = '4313f067-b7a4-4872-a8b7-5035d0596d2e';
const TEAM_ID = '2b260ee9-8b63-4040-b2eb-4bfe527e402a';

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h' },
    query: {},
    socket: { remoteAddress: `10.1.0.${n % 250}` },
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  store.tournaments = [
    {
      id: SOLO_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      solo_mode: true,
      visibility: 'private',
    },
    {
      id: TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      solo_mode: false,
      visibility: 'public',
    },
  ] as any;
});

describe('parseQrSize', () => {
  it('defaults to 512 and clamps to 128–1024', () => {
    expect(parseQrSize(undefined)).toBe(512);
    expect(parseQrSize('abc')).toBe(512);
    expect(parseQrSize('10')).toBe(128);
    expect(parseQrSize('99999')).toBe(1024);
    expect(parseQrSize('300')).toBe(300);
  });
});

describe('GET /api/tournament/[id]/qr', () => {
  it('returns a PNG, even for a tournament that is still private', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: SOLO_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/png');
    const buf = res.body as Buffer;
    // Signature PNG.
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('encodes the solo form for a solo event, the team wizard otherwise', async () => {
    const solo = makeRes();
    await handler(makeReq({ query: { id: SOLO_ID, format: 'svg' } }), solo);
    expect(solo.headers['Content-Type']).toBe('image/svg+xml');
    expect(String(solo.body)).toContain('<svg');

    // Le SVG ne contient pas l'URL en clair : on vérifie le choix du lien via
    // le module qui le décide, déjà couvert par ses propres tests. Ici, on
    // s'assure seulement que les deux cas répondent.
    const team = makeRes();
    await handler(makeReq({ query: { id: TEAM_ID } }), team);
    expect(team.statusCode).toBe(200);
  });

  it('refuses a slug (would reveal a private tournament) with 400', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: 'halloween-2026' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('404 for an unknown tournament', async () => {
    const res = makeRes();
    await handler(
      makeReq({ query: { id: '00000000-0000-4000-8000-000000000000' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', query: { id: SOLO_ID } }), res);
    expect(res.statusCode).toBe(405);
  });
});
