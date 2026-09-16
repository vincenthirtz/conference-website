// Cron de check-in — deux trous constatés avant la soirée du 18/09.
//
//   1. Aucune des deux équipes n'a pointé : le match passait `cancelled` EN
//      SILENCE, alors que le forfait simple notifie Discord + mail. Et il ne
//      suffit pas de notifier : les messages du FORFAIT (« attribué à X »,
//      « votre équipe a été déclarée forfait ») sont faux pour un match sans
//      vainqueur — ce test exige les messages d'annulation.
//   2. Le garde « un tournoi est-il actif ? » excluait un tournoi sans
//      `end_date` (NULL >= x est faux en SQL) : check-in coupé.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  sendMatchCheckinEmail,
  sendCheckinReminderEmail,
  sendCheckinForfeitEmail,
  sendCheckinCancelledEmail,
  notifyCheckinReminder,
  notifyCheckinForfeit,
  notifyCheckinCancelledNoShow,
  notifyLineupReminder,
  applyMatchScore,
} = vi.hoisted(() => ({
  sendMatchCheckinEmail: vi.fn(async () => ({ ok: true as const })),
  sendCheckinReminderEmail: vi.fn(async () => ({ ok: true as const })),
  sendCheckinForfeitEmail: vi.fn(async () => ({ ok: true as const })),
  sendCheckinCancelledEmail: vi.fn(async () => ({ ok: true as const })),
  notifyCheckinReminder: vi.fn(async () => undefined),
  notifyCheckinForfeit: vi.fn(async () => undefined),
  notifyCheckinCancelledNoShow: vi.fn(async () => undefined),
  notifyLineupReminder: vi.fn(async () => undefined),
  applyMatchScore: vi.fn(async () => undefined),
}));

vi.mock('../../utils/email', () => ({
  sendMatchCheckinEmail,
  sendCheckinReminderEmail,
  sendCheckinForfeitEmail,
  sendCheckinCancelledEmail,
}));
vi.mock('../../utils/discord', () => ({
  notifyCheckinReminder,
  notifyCheckinForfeit,
  notifyCheckinCancelledNoShow,
  notifyLineupReminder,
}));
vi.mock('../../utils/matches/applyScore', () => ({ applyMatchScore }));

import {
  store,
  resetSupabaseMock,
  setAdminUser,
} from './__helpers__/supabaseMock';

import {
  hasActiveTournamentWindow,
  processMatchCheckin,
} from '../../utils/checkin';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function lite(over: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    tenant_id: TENANT_ID,
    tournament_id: 'tour-1',
    status: 'pending',
    is_bye: false,
    scheduled_at: new Date(Date.now() - 60_000).toISOString(),
    team1_id: 'team-a',
    team2_id: 'team-b',
    team1_checkin_token: 'ta',
    team2_checkin_token: 'tb',
    team1_checked_in_at: null,
    team2_checked_in_at: null,
    checkin_email_sent_at: '2026-09-18T16:00:00.000Z',
    reminder_30_sent_at: '2026-09-18T16:30:00.000Z',
    reminder_15_sent_at: '2026-09-18T16:45:00.000Z',
    forfeit_processed_at: null,
    team1: { id: 'team-a', name: 'Alpha', discord_role_id: '111' },
    team2: { id: 'team-b', name: 'Bravo', discord_role_id: '222' },
    tournament: { id: 'tour-1', name: 'Cup 2026' },
    ...over,
  } as any;
}

beforeEach(() => {
  resetSupabaseMock();
  for (const fn of [
    sendMatchCheckinEmail,
    sendCheckinReminderEmail,
    sendCheckinForfeitEmail,
    sendCheckinCancelledEmail,
    notifyCheckinReminder,
    notifyCheckinForfeit,
    notifyCheckinCancelledNoShow,
    notifyLineupReminder,
    applyMatchScore,
  ]) {
    fn.mockClear();
  }
});

describe('annulation faute de check-in des deux équipes', () => {
  it('annule ET prévient les deux équipes avec un message d’ANNULATION', async () => {
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;
    setAdminUser('captain-a', 'a@example.com');
    setAdminUser('captain-b', 'b@example.com');
    store.teams = [
      { id: 'team-a', tenant_id: TENANT_ID, captain_id: 'captain-a' },
      { id: 'team-b', tenant_id: TENANT_ID, captain_id: 'captain-b' },
    ] as any;

    const r = await processMatchCheckin(lite());

    expect(r.steps).toContain('forfeit_both_cancelled');
    expect((store.matches[0] as any).status).toBe('cancelled');
    expect(applyMatchScore).not.toHaveBeenCalled();

    // Aucun message de FORFAIT : ils désigneraient un perdant et un vainqueur.
    expect(notifyCheckinForfeit).not.toHaveBeenCalled();
    expect(sendCheckinForfeitEmail).not.toHaveBeenCalled();

    // UN seul embed, qui mentionne les deux équipes — pas deux posts.
    expect(notifyCheckinCancelledNoShow).toHaveBeenCalledTimes(1);
    const discord = (notifyCheckinCancelledNoShow.mock.calls[0] as any[])[0];
    expect([discord.team1Name, discord.team2Name]).toEqual(['Alpha', 'Bravo']);
    expect([discord.team1RoleId, discord.team2RoleId]).toEqual(['111', '222']);

    // Chaque capitaine reçoit l'annulation, avec l'équipe D'EN FACE nommée.
    expect(sendCheckinCancelledEmail).toHaveBeenCalledTimes(2);
    const mails = sendCheckinCancelledEmail.mock.calls.map((c: any[]) => c[0]);
    const byTo = Object.fromEntries(mails.map((m: any) => [m.to, m]));
    expect(byTo['a@example.com']).toMatchObject({
      teamName: 'Alpha',
      opponentName: 'Bravo',
    });
    expect(byTo['b@example.com']).toMatchObject({
      teamName: 'Bravo',
      opponentName: 'Alpha',
    });
    expect((store.matches[0] as any).forfeit_processed_at).toBeTruthy();
  });

  it('une notification qui échoue ne défait pas l’annulation', async () => {
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;
    notifyCheckinCancelledNoShow.mockRejectedValueOnce(
      new Error('discord down')
    );

    const r = await processMatchCheckin(lite());

    expect(r.steps).toContain('forfeit_both_cancelled');
    expect((store.matches[0] as any).status).toBe('cancelled');
    expect((store.matches[0] as any).forfeit_processed_at).toBeTruthy();
  });
});

describe('hasActiveTournamentWindow — end_date absente', () => {
  it('compte un tournoi en cours sans date de fin', async () => {
    const now = new Date();
    store.tournaments = [
      {
        id: 'open-ended',
        tenant_id: TENANT_ID,
        status: 'running',
        start_date: new Date(now.getTime() - 3 * 86_400_000)
          .toISOString()
          .slice(0, 10),
        end_date: null,
      },
    ] as any;
    expect(await hasActiveTournamentWindow(now)).toBe(true);
  });

  it('exclut toujours un tournoi terminé depuis longtemps', async () => {
    const now = new Date();
    store.tournaments = [
      {
        id: 'past',
        tenant_id: TENANT_ID,
        status: 'running',
        start_date: '2020-01-01',
        end_date: '2020-02-01',
      },
    ] as any;
    expect(await hasActiveTournamentWindow(now)).toBe(false);
  });
});
