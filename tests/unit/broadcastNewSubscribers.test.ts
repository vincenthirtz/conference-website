// tests/unit/broadcastNewSubscribers.test.ts
//
// Feature « Envoyer aux nouveaux inscrits » sur les campagnes email broadcast :
//   POST /api/admin/broadcast/{id} { onlyNew: true[, dryRun] }
// Ne cible que les comptes de l'audience ACTUELLE jamais encore adressés pour
// cette campagne (diff sur broadcast_recipients `sent`). Un envoi direct réussi
// enregistre désormais ses destinataires comme `sent` (amorce du diff).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const {
  sendIdahobitLiveEmail,
  buildIdahobitLiveEmailHtml,
  sendCampaignEmail,
  buildCampaignEmailHtml,
} = vi.hoisted(() => ({
  sendIdahobitLiveEmail: vi.fn(
    async (): Promise<{ success: boolean; id?: string; error?: string }> => ({
      success: true,
    })
  ),
  buildIdahobitLiveEmailHtml: vi.fn(
    (label: string | null) => `<html>preview ${label ?? ''}</html>`
  ),
  sendCampaignEmail: vi.fn(
    async (): Promise<{ success: boolean; id?: string; error?: string }> => ({
      success: true,
    })
  ),
  buildCampaignEmailHtml: vi.fn(() => '<html>db</html>'),
}));
vi.mock('@/utils/email', () => ({
  sendIdahobitLiveEmail,
  buildIdahobitLiveEmailHtml,
  sendCampaignEmail,
  buildCampaignEmailHtml,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import campaignHandler from '../../pages/api/admin/broadcast/[campaignId]/index';

const BUILTIN_ID = 'idahobit-live-2026'; // audience 'all-confirmed-users'

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tok = 0;
function makeReq(over: Partial<any> = {}): any {
  _tok += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_tok}` },
    query: {},
    body: {},
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

function confirmedUser(id: string) {
  return {
    id,
    email: `${id}@x.com`,
    email_confirmed_at: '2026-01-01',
    user_metadata: {},
  } as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  store.broadcast_recipients = [] as any;
  sendIdahobitLiveEmail.mockResolvedValue({ success: true });
});

describe('onlyNew — dry-run diff', () => {
  it('with no prior sends, every confirmed recipient is « new »', async () => {
    setAuthListUsers([confirmedUser('u1'), confirmedUser('u2'), confirmedUser('u3')]);

    const res = makeRes();
    await campaignHandler(
      makeReq({
        query: { campaignId: BUILTIN_ID },
        body: { dryRun: true, onlyNew: true },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.onlyNew).toBe(true);
    expect(res.body.newCount).toBe(3);
    expect(res.body.alreadySent).toBe(0);
    expect(res.body.audienceTotal).toBe(3);
    expect(res.body.emailOnlyExcluded).toBe(0);
  });

  it('excludes recipients already marked sent for this campaign', async () => {
    setAuthListUsers([confirmedUser('u1'), confirmedUser('u2'), confirmedUser('u3')]);
    store.broadcast_recipients = [
      { campaign_id: BUILTIN_ID, user_id: 'u1', email: 'u1@x.com', status: 'sent' },
      // pending ne compte pas comme « déjà envoyé »
      { campaign_id: BUILTIN_ID, user_id: 'u2', email: 'u2@x.com', status: 'pending' },
      // sent mais AUTRE campagne → ne doit pas filtrer u3 ici
      { campaign_id: 'other', user_id: 'u3', email: 'u3@x.com', status: 'sent' },
    ] as any;

    const res = makeRes();
    await campaignHandler(
      makeReq({
        query: { campaignId: BUILTIN_ID },
        body: { dryRun: true, onlyNew: true },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.newCount).toBe(2); // u2 + u3
    expect(res.body.alreadySent).toBe(1); // u1
  });
});

describe('onlyNew — real send records the trace', () => {
  it('sends to new recipients then records them as sent (next diff = 0)', async () => {
    setAuthListUsers([confirmedUser('u1'), confirmedUser('u2')]);

    // 1er envoi ciblé « nouveaux »
    const send = makeRes();
    await campaignHandler(
      makeReq({ query: { campaignId: BUILTIN_ID }, body: { onlyNew: true } }),
      send
    );
    expect(send.statusCode).toBe(200);
    expect(send.body.sent).toBe(2);
    expect(sendIdahobitLiveEmail).toHaveBeenCalledTimes(2);

    // La trace par-destinataire a été écrite
    const sentRows = (store.broadcast_recipients as any[]).filter(
      (r) => r.campaign_id === BUILTIN_ID && r.status === 'sent'
    );
    expect(sentRows.map((r) => r.user_id).sort()).toEqual(['u1', 'u2']);

    // 2e vérification : plus aucun nouveau
    const dry = makeRes();
    await campaignHandler(
      makeReq({
        query: { campaignId: BUILTIN_ID },
        body: { dryRun: true, onlyNew: true },
      }),
      dry
    );
    expect(dry.body.newCount).toBe(0);
    expect(dry.body.alreadySent).toBe(2);
  });

  it('a plain (non-onlyNew) send also records the trace, seeding future diffs', async () => {
    setAuthListUsers([confirmedUser('u1'), confirmedUser('u2')]);

    const send = makeRes();
    await campaignHandler(
      makeReq({ query: { campaignId: BUILTIN_ID }, body: {} }),
      send
    );
    expect(send.body.sent).toBe(2);

    const dry = makeRes();
    await campaignHandler(
      makeReq({
        query: { campaignId: BUILTIN_ID },
        body: { dryRun: true, onlyNew: true },
      }),
      dry
    );
    // Les 2 destinataires de l'envoi classique sont désormais « déjà envoyés »
    expect(dry.body.newCount).toBe(0);
    expect(dry.body.alreadySent).toBe(2);
  });
});
