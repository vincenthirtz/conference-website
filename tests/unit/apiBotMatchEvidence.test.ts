// tests/unit/apiBotMatchEvidence.test.ts
//
// POST/GET /api/bot/v1/matches/[matchId]/evidence — captain evidence path
// (feature "Integrite des resultats & anti-triche", slice 1 : preuve).
//
// Couvre :
//   * POST screenshot (magic bytes PNG valides) -> 201 + row + upload bucket
//   * POST replay_url -> 201 + external_url (pas de storage_path)
//   * POST screenshot avec magic bytes invalides -> 400
//   * POST par un non-capitaine -> 403 (aucune row)
//   * GET -> liste avec signedUrl pour binaire + externalUrl pour lien,
//     jamais storage_path

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  storageUploads,
} from './__helpers__/supabaseMock';
import { __resetBotIdempotencyCache } from '../../utils/botAuth';
import { __resetMaintenanceCache } from '../../utils/maintenance';
import handler from '../../pages/api/bot/v1/matches/[matchId]/evidence';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH_ID = '550e8400-e29b-41d4-a716-446655440a01';
const TEAM_1 = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440b02';
const CAP1 = '00000000-0000-0000-0000-0000000000c1';
const CAP2 = '00000000-0000-0000-0000-0000000000c2';
const DISCORD_1 = '900000000000000001';
const DISCORD_2 = '900000000000000002';
const DISCORD_OUTSIDER = '900000000000000009';

// Minimal valid PNG header (8-byte signature + a few bytes of payload).
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const PNG_BASE64 = PNG_BYTES.toString('base64');
const NOT_AN_IMAGE_BASE64 = Buffer.from('definitely not an image').toString(
  'base64'
);

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', 'x-api-key': 'test-key', 'x-tenant-id': TENANT_ID },
    query: { matchId: MATCH_ID },
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seed() {
  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: TENANT_ID,
      team1_id: TEAM_1,
      team2_id: TEAM_2,
      team1: { id: TEAM_1, name: 'Phenix', captain_id: CAP1 },
      team2: { id: TEAM_2, name: 'Avoidgers', captain_id: CAP2 },
    },
  ] as any;
  store.teams = [
    { id: TEAM_1, tenant_id: TENANT_ID, name: 'Phenix', captain_id: CAP1 },
    { id: TEAM_2, tenant_id: TENANT_ID, name: 'Avoidgers', captain_id: CAP2 },
  ] as any;
  store.user_discord_links = [
    { auth_user_id: CAP1, discord_user_id: DISCORD_1 },
    { auth_user_id: CAP2, discord_user_id: DISCORD_2 },
  ] as any;
  store.match_evidence = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  __resetMaintenanceCache();
  seedBotAuth({ tenantId: TENANT_ID });
  store.site_settings = [
    { key: 'bot_maintenance_mode', value: 'false' },
  ] as any;
  seed();
});

afterEach(async () => {
  await __resetBotIdempotencyCache();
});

describe('POST /api/bot/v1/matches/[matchId]/evidence', () => {
  it('stores a screenshot (valid PNG magic bytes) and uploads to the bucket', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          kind: 'screenshot',
          discordUserId: DISCORD_1,
          file_base64: PNG_BASE64,
          filename: 'proof.png',
          note: 'GG',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.kind).toBe('screenshot');
    expect(typeof res.body.id).toBe('string');

    expect(store.match_evidence).toHaveLength(1);
    const row = store.match_evidence[0] as any;
    expect(row.team_side).toBe(1);
    expect(row.kind).toBe('screenshot');
    expect(row.mime_type).toBe('image/png');
    expect(row.storage_path).toContain(`${TENANT_ID}/${MATCH_ID}/`);
    expect(row.external_url).toBeNull();
    expect(typeof row.sha256).toBe('string');
    expect(row.submitted_by_auth_user_id).toBe(CAP1);
    expect(row.note).toBe('GG');

    // Uploaded to the private match-evidence bucket.
    expect(storageUploads).toHaveLength(1);
    expect(storageUploads[0].bucket).toBe('match-evidence');
  });

  it('stores a replay_url without any storage object', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          kind: 'replay_url',
          discordUserId: DISCORD_2,
          external_url: 'https://youtu.be/abc123',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.kind).toBe('replay_url');
    const row = store.match_evidence[0] as any;
    expect(row.team_side).toBe(2);
    expect(row.external_url).toBe('https://youtu.be/abc123');
    expect(row.storage_path).toBeNull();
    expect(storageUploads).toHaveLength(0);
  });

  it('rejects a screenshot whose bytes are not a real image (400)', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          kind: 'screenshot',
          discordUserId: DISCORD_1,
          file_base64: NOT_AN_IMAGE_BASE64,
          filename: 'fake.png',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/image/i);
    expect(store.match_evidence).toHaveLength(0);
    expect(storageUploads).toHaveLength(0);
  });

  it('rejects a non-captain with 403 (no row inserted)', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          kind: 'screenshot',
          discordUserId: DISCORD_OUTSIDER,
          file_base64: PNG_BASE64,
          filename: 'proof.png',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect(store.match_evidence).toHaveLength(0);
  });

  it('returns 404 when the match does not exist', async () => {
    store.matches = [] as any;
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          kind: 'replay_url',
          discordUserId: DISCORD_1,
          external_url: 'https://x.test/replay',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/bot/v1/matches/[matchId]/evidence', () => {
  it('lists evidence with signed URLs for binaries and external_url for links', async () => {
    store.match_evidence = [
      {
        id: 'ev-1',
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 1,
        kind: 'screenshot',
        storage_path: `${TENANT_ID}/${MATCH_ID}/ev-1.png`,
        external_url: null,
        mime_type: 'image/png',
        size_bytes: 1234,
        sha256: 'abc',
        note: null,
        created_at: '2026-07-13T00:00:00.000Z',
      },
      {
        id: 'ev-2',
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 2,
        kind: 'replay_url',
        storage_path: null,
        external_url: 'https://youtu.be/abc',
        mime_type: null,
        size_bytes: null,
        sha256: null,
        note: null,
        created_at: '2026-07-13T00:01:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(
      makeReq({
        method: 'GET',
        query: { matchId: MATCH_ID, actorDiscordUserId: DISCORD_1 },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.evidence).toHaveLength(2);
    const shot = res.body.evidence.find((e: any) => e.id === 'ev-1');
    const link = res.body.evidence.find((e: any) => e.id === 'ev-2');
    expect(shot.signedUrl).toBeTruthy();
    expect(shot.externalUrl).toBeNull();
    // storage_path never leaks to the client.
    expect(shot.storagePath).toBeUndefined();
    expect(shot.storage_path).toBeUndefined();
    expect(link.externalUrl).toBe('https://youtu.be/abc');
    expect(link.signedUrl).toBeNull();
  });

  it('rejects a GET from a non-captain with 403', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'GET',
        query: { matchId: MATCH_ID, actorDiscordUserId: DISCORD_OUTSIDER },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});
