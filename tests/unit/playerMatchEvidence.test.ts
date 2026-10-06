// POST /api/player/matches/[matchId]/evidence — capture jointe depuis le site
// (lot P4, pendant web de la route bot evidence).
//
// Ce que ces tests protègent :
//   1. LE DROIT. Le même que la déclaration du score (reportRight.ts) :
//      capitaine ou manager d'équipe, jamais un membre simple, une coach ou un
//      tiers ; jamais quelqu'un qui tient les deux équipes (une preuve porte
//      un `team_side`).
//   2. LE CÔTÉ. La ligne `match_evidence` porte le camp de l'appelante.
//   3. LE CONTENU. Type lu sur les octets (pas sur le nom), taille plafonnée,
//      aucun upload quand le refus tombe.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setStorageUploadResult,
  storageUploads,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/player/matches/[matchId]/evidence';
import { evidenceErrorMessage } from '../../features/player/matches/disputeView';
import fr from '../../lib/i18n/locales/fr/playerMatch';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH_ID = '550e8400-e29b-41d4-a716-446655440a01';
const TEAM_1 = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440b02';
const CAP1 = '00000000-0000-0000-0000-0000000000c1';
const CAP2 = '00000000-0000-0000-0000-0000000000c2';
const MEMBER = '00000000-0000-0000-0000-0000000000d1';
const OUTSIDER = '00000000-0000-0000-0000-0000000000ff';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

let _bearer = 0;
function makeReq(over: Partial<any> = {}, includeAuth = true): any {
  _bearer += 1;
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = `Bearer ev-${Date.now()}-${_bearer}`;
  return {
    method: 'POST',
    headers,
    query: { matchId: MATCH_ID },
    body: { file_base64: PNG_DATA_URL, filename: 'fin.png' },
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
      tournament_id: null,
      scrim_id: null,
      status: 'disputed',
      is_bye: false,
      match_format: 'bo3',
      team1_id: TEAM_1,
      team2_id: TEAM_2,
      team1: { id: TEAM_1, name: 'Phenix', captain_id: CAP1 },
      team2: { id: TEAM_2, name: 'Avoidgers', captain_id: CAP2 },
      tournament: null,
    },
  ] as any;
  store.teams = [
    { id: TEAM_1, tenant_id: TENANT_ID, name: 'Phenix' },
    { id: TEAM_2, tenant_id: TENANT_ID, name: 'Avoidgers' },
  ] as any;
  store.team_members = [] as any;
  store.match_evidence = [] as any;
}

function seedMember(userId: string, teamId: string, role: string) {
  (store.team_members as any[]).push({
    team_id: teamId,
    user_id: userId,
    role,
    tenant_id: TENANT_ID,
  });
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: CAP1 });
  seed();
});

async function post(over: Partial<any> = {}, includeAuth = true) {
  const res = makeRes();
  await handler(makeReq(over, includeAuth), res);
  return res;
}

describe('garde', () => {
  it('405 hors POST', async () => {
    const res = await post({ method: 'GET' });
    expect(res.statusCode).toBe(405);
  });

  it('401 sans session', async () => {
    const res = await post({}, false);
    expect(res.statusCode).toBe(401);
    expect(storageUploads).toHaveLength(0);
  });

  it('400 INVALID_MATCH_ID sur un identifiant illisible', async () => {
    const res = await post({ query: { matchId: 'pas-un-uuid' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_MATCH_ID');
  });

  it('404 sur un match inexistant', async () => {
    store.matches = [];
    const res = await post();
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('MATCH_NOT_FOUND');
  });

  it('refuse le suivi staff `?as=` (route self)', async () => {
    const res = await post({ query: { matchId: MATCH_ID, as: CAP2 } });
    expect(res.statusCode).toBe(403);
    expect(storageUploads).toHaveLength(0);
  });
});

describe('autorisations : le droit de déclarer, rien de plus', () => {
  it('la capitaine de team1 dépose pour le côté 1', async () => {
    const res = await post();
    expect(res.statusCode).toBe(201);
    expect(res.body.kind).toBe('screenshot');
    const row = (store.match_evidence as any[])[0];
    expect(row).toMatchObject({
      match_id: MATCH_ID,
      team_side: 1,
      submitted_by_auth_user_id: CAP1,
      discord_user_id: null,
      kind: 'screenshot',
      mime_type: 'image/png',
      external_url: null,
    });
    expect(row.storage_path).toBe(`${TENANT_ID}/${MATCH_ID}/${row.id}.png`);
    expect(storageUploads).toEqual([
      { bucket: 'match-evidence', path: row.storage_path },
    ]);
  });

  it('la capitaine de team2 dépose pour le côté 2', async () => {
    setAuthUser({ id: CAP2 });
    const res = await post();
    expect(res.statusCode).toBe(201);
    expect((store.match_evidence as any[])[0].team_side).toBe(2);
  });

  it('une manager d’équipe dépose pour son côté', async () => {
    seedMember(MEMBER, TEAM_2, 'manager');
    setAuthUser({ id: MEMBER });
    const res = await post();
    expect(res.statusCode).toBe(201);
    expect((store.match_evidence as any[])[0].team_side).toBe(2);
  });

  it('une joueuse simple de l’équipe : 403 NOT_REPORTER, rien d’écrit', async () => {
    seedMember(MEMBER, TEAM_1, 'player');
    setAuthUser({ id: MEMBER });
    const res = await post();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('NOT_REPORTER');
    expect(store.match_evidence).toHaveLength(0);
    expect(storageUploads).toHaveLength(0);
  });

  it('une coach : 403 NOT_REPORTER', async () => {
    seedMember(MEMBER, TEAM_1, 'coach');
    setAuthUser({ id: MEMBER });
    const res = await post();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('NOT_REPORTER');
  });

  it('un tiers : 403 NOT_REPORTER, aucun upload', async () => {
    setAuthUser({ id: OUTSIDER });
    const res = await post();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('NOT_REPORTER');
    expect(storageUploads).toHaveLength(0);
  });

  it('les deux équipes tenues : 403 REPORT_BOTH_SIDES', async () => {
    seedMember(CAP1, TEAM_2, 'manager');
    const res = await post();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('REPORT_BOTH_SIDES');
    expect(store.match_evidence).toHaveLength(0);
  });
});

describe('contenu', () => {
  it('400 EVIDENCE_NOT_IMAGE : le nom .png ne suffit pas', async () => {
    const res = await post({
      body: {
        file_base64: Buffer.from('pas une image').toString('base64'),
        filename: 'fin.png',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('EVIDENCE_NOT_IMAGE');
    expect(storageUploads).toHaveLength(0);
  });

  it('400 EVIDENCE_TOO_LARGE au-delà de 4 Mo', async () => {
    const big = Buffer.alloc(4 * 1024 * 1024 + 16);
    PNG_BYTES.copy(big);
    const res = await post({
      body: { file_base64: big.toString('base64') },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('EVIDENCE_TOO_LARGE');
    expect(storageUploads).toHaveLength(0);
  });

  it('400 sans fichier', async () => {
    const res = await post({ body: {} });
    expect(res.statusCode).toBe(400);
    expect(storageUploads).toHaveLength(0);
  });

  it('upload en échec : 500 EVIDENCE_UPLOAD_FAILED, aucune ligne', async () => {
    setStorageUploadResult({ error: { message: 'bucket down' } });
    const res = await post();
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('EVIDENCE_UPLOAD_FAILED');
    expect(store.match_evidence).toHaveLength(0);
  });
});

describe('evidenceErrorMessage : un refus → un message traduit', () => {
  const t = fr.fr;
  it('traduit les codes, jamais le texte serveur', () => {
    expect(evidenceErrorMessage(400, 'EVIDENCE_TOO_LARGE', t)).toBe(
      t.evidenceErrTooLarge
    );
    expect(evidenceErrorMessage(400, 'EVIDENCE_NOT_IMAGE', t)).toBe(
      t.evidenceErrType
    );
    expect(evidenceErrorMessage(403, 'REPORT_BOTH_SIDES', t)).toBe(
      t.evidenceErrBothSides
    );
    expect(evidenceErrorMessage(403, 'NOT_REPORTER', t)).toBe(
      t.evidenceErrRight
    );
    expect(evidenceErrorMessage(429, null, t)).toBe(t.evidenceErrRateLimited);
    expect(evidenceErrorMessage(500, 'EVIDENCE_SAVE_FAILED', t)).toBe(
      t.evidenceErrGeneric
    );
  });
});
