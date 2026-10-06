// tests/unit/adminSupportTicketNotify.test.ts
//
// PATCH /api/admin/support/tickets/[id] avec `notify_reporter` : l'auteur·ice
// d'un signalement est prévenu·e par email de la suite donnée — seulement si
// le staff le demande, seulement à la résolution / clôture, jamais pour un
// signalement anonyme — et le résultat est versé au journal staff.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logStaffActionMock, sendResolutionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
  sendResolutionMock: vi.fn(async () => ({ success: true, id: 'm1' })),
}));

vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));
vi.mock('@/utils/email', () => ({
  sendSupportResolutionEmail: sendResolutionMock,
}));

import {
  resetSupabaseMock,
  setAuthUser,
  store,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/support/tickets/[id]';

const ID = '550e8400-e29b-41d4-a716-446655440000';

let n = 0;
function makeReq(body: Record<string, unknown>): any {
  n += 1;
  return {
    method: 'PATCH',
    headers: { host: 'h', authorization: `Bearer notify-${n}` },
    query: { id: ID },
    body,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    status: 'open',
    severity: 'medium',
    category: 'behavior',
    subject: 'Insultes en vocal',
    message: 'msg',
    is_anonymous: false,
    reporter_email: 'joueuse@example.com',
    discord_user_id: null,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  sendResolutionMock.mockClear();
  sendResolutionMock.mockResolvedValue({ success: true, id: 'm1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  setAuthUser({ id: 'user-1' });
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role: 'admin',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.support_tickets = [ticket()] as any;
});

describe('PATCH support ticket — notifier la personne', () => {
  it('envoie l’email à la résolution, avec la note, et le journalise', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        status: 'resolved',
        resolution_note: 'Sanction appliquée.',
        notify_reporter: true,
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(sendResolutionMock).toHaveBeenCalledTimes(1);
    expect(sendResolutionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'joueuse@example.com',
        ticketId: ID,
        status: 'resolved',
        note: 'Sanction appliquée.',
      })
    );
    expect(res.body.notification).toEqual({
      email: 'sent',
      discord: 'no_account',
    });
    expect(logStaffActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_support_ticket',
        payload: expect.objectContaining({
          notification: { email: 'sent', discord: 'no_account' },
        }),
      })
    );
  });

  it('sans la case cochée, personne n’est prévenu', async () => {
    const res = makeRes();
    await handler(makeReq({ status: 'closed' }), res);
    expect(res.statusCode).toBe(200);
    expect(sendResolutionMock).not.toHaveBeenCalled();
    expect(res.body.notification).toBeNull();
  });

  it('refuse une notification hors résolution / clôture (400)', async () => {
    const res = makeRes();
    await handler(
      makeReq({ status: 'in_progress', notify_reporter: true }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(sendResolutionMock).not.toHaveBeenCalled();
  });

  it('refuse un notify_reporter non booléen (400)', async () => {
    const res = makeRes();
    await handler(makeReq({ status: 'resolved', notify_reporter: 'oui' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('un signalement anonyme n’est jamais recontacté', async () => {
    store.support_tickets = [ticket({ is_anonymous: true })] as any;
    const res = makeRes();
    await handler(makeReq({ status: 'resolved', notify_reporter: true }), res);
    expect(res.statusCode).toBe(200);
    expect(sendResolutionMock).not.toHaveBeenCalled();
    expect(res.body.notification.email).toBe('no_address');
  });

  it('un échec d’envoi n’annule pas la résolution', async () => {
    sendResolutionMock.mockResolvedValue({ success: false, error: 'x' } as any);
    store.support_tickets = [ticket({ discord_user_id: '1234' })] as any;
    const res = makeRes();
    await handler(makeReq({ status: 'closed', notify_reporter: true }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ticket.status).toBe('closed');
    // Pas de MP Discord possible aujourd'hui : dit tel quel.
    expect(res.body.notification).toEqual({
      email: 'failed',
      discord: 'unavailable',
    });
  });
});
