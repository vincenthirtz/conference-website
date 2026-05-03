// Unit tests for POST /api/teams/[teamId]/upload-image.
//
// Mirrors the behavior of /api/admin/upload but is bound to the
// `edit_public_page` team permission instead of staff role. We verify:
//   - method + auth gating
//   - permission gating (captain / manager / plain player)
//   - mime-type allowlist (no PDF here)
//   - magic-byte validation
//   - successful upload returns the public URL

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setStorageUploadResult,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import handler from '../../pages/api/teams/[teamId]/upload-image';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, withAuth = true): any {
  return {
    method: 'POST',
    headers: {
      host: 'h',
      ...(withAuth ? { authorization: `Bearer ${freshToken()}` } : {}),
    },
    query: { teamId: TEAM_ID },
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

// 1×1 PNG (real magic bytes). Smallest valid PNG payload we can stub the
// upload with. We only need the first ~16 bytes for magic-byte validation.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// A minimal valid WebP container (RIFF....WEBP)
function makeWebpBase64(): string {
  const buf = Buffer.alloc(32);
  buf[0] = 0x52; // R
  buf[1] = 0x49; // I
  buf[2] = 0x46; // F
  buf[3] = 0x46; // F
  // bytes 4..7 = file size (placeholder)
  buf[8] = 0x57; // W
  buf[9] = 0x45; // E
  buf[10] = 0x42; // B
  buf[11] = 0x50; // P
  return buf.toString('base64');
}

function seedTeam() {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      is_active: true,
    },
  ] as any;
  store.team_members = [
    { id: 'tm-cap', team_id: TEAM_ID, user_id: CAPTAIN_ID, role: 'player' },
    { id: 'tm-ply', team_id: TEAM_ID, user_id: PLAYER_ID, role: 'player' },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CAPTAIN_ID });
  setStorageUploadResult({ error: null });
  seedTeam();
});

describe('method + auth', () => {
  it('rejects non-POST methods with 405', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects unauthenticated requests with 401', async () => {
    setAuthUser(null);
    const res = makeRes();
    await handler(makeReq({}, false), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid teamId', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { teamId: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('permission', () => {
  it('plain player gets 403', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await handler(
      makeReq({
        body: { data: PNG_BASE64, mimeType: 'image/png', filename: 'x.png' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('captain can upload', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: { data: PNG_BASE64, mimeType: 'image/png', filename: 'x.png' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(typeof (res.body as any).url).toBe('string');
    expect((res.body as any).url).toContain('teams-images');
  });
});

describe('payload validation', () => {
  it('rejects missing data', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { mimeType: 'image/png' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing mimeType', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { data: PNG_BASE64 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects PDF mimeType (image-only endpoint)', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          data: PNG_BASE64,
          mimeType: 'application/pdf',
          filename: 'x.pdf',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/non supporté/i);
  });

  it('rejects unknown mimeType', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          data: PNG_BASE64,
          mimeType: 'image/gif',
          filename: 'x.gif',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects content whose magic bytes do not match the declared mimeType', async () => {
    // PNG bytes claimed as JPEG → magic bytes mismatch
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          data: PNG_BASE64,
          mimeType: 'image/jpeg',
          filename: 'x.jpg',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/contenu/i);
  });

  it('accepts a valid WebP', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          data: makeWebpBase64(),
          mimeType: 'image/webp',
          filename: 'logo.webp',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('rejects images larger than 2MB', async () => {
    // 3MB of zeros — magic bytes won't match anyway, but we expect the size
    // check to fire first.
    const big = Buffer.alloc(3 * 1024 * 1024);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47; // valid PNG header
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          data: big.toString('base64'),
          mimeType: 'image/png',
          filename: 'big.png',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/lourde/i);
  });
});

describe('storage failure handling', () => {
  it('returns 500 when supabase storage upload errors out', async () => {
    setStorageUploadResult({ error: { message: 'boom' } });
    const res = makeRes();
    await handler(
      makeReq({
        body: { data: PNG_BASE64, mimeType: 'image/png', filename: 'x.png' },
      }),
      res
    );
    expect(res.statusCode).toBe(500);
  });
});
