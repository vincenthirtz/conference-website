// Check-in : fermeture serveur au coup d'envoi (lot P3).
// Target: utils/checkin.ts — `isCheckinWindowPassed`, `redeemCheckinToken`.
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LE JETON NE POINTE PLUS APRÈS LE COUP D'ENVOI. Avant, seul le statut
//      était vérifié : le lien du mail et le bouton Discord restaient valables
//      jusqu'au passage du cron de forfait.
//   2. L'ÉCRITURE EST CONDITIONNELLE. Un forfait posé (ou un statut changé)
//      entre la lecture et l'écriture ne laisse pas un check-in s'inscrire
//      par-dessus.
//   3. UN REJEU RESTE UN SUCCÈS. Une équipe déjà pointée, même relue après le
//      coup d'envoi ou pointée par un clic concurrent, reçoit `alreadyCheckedIn`.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/email', () => ({
  sendMatchCheckinEmail: vi.fn(),
  sendCheckinReminderEmail: vi.fn(),
  sendCheckinForfeitEmail: vi.fn(),
  sendCheckinCancelledEmail: vi.fn(),
}));
vi.mock('../../utils/discord', () => ({
  notifyCheckinReminder: vi.fn(),
  notifyCheckinForfeit: vi.fn(),
  notifyCheckinCancelledNoShow: vi.fn(),
  notifyLineupReminder: vi.fn(),
  notifyCheckinOpened: vi.fn(),
}));
vi.mock('../../utils/matches/applyScore', () => ({
  applyMatchScore: vi.fn(),
}));
vi.mock('../../utils/tcg/grantCheckinStreak', () => ({
  grantCheckinStreakReward: vi.fn(async () => ({ status: 'none' })),
}));

import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { isCheckinWindowPassed, redeemCheckinToken } from '../../utils/checkin';
import { buildCheckin } from '../../utils/matches/playerMatchView';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOKEN = 'k'.repeat(32);

const inMinutes = (n: number) =>
  new Date(Date.now() + n * 60_000).toISOString();

type Row = Record<string, unknown>;

function seed(over: Row = {}): Row {
  const row: Row = {
    id: 'match-1',
    tenant_id: TENANT,
    status: 'pending',
    scheduled_at: inMinutes(20),
    team1_id: 'team-a',
    team2_id: 'team-b',
    team1_checkin_token: TOKEN,
    team2_checkin_token: null,
    team1_checked_in_at: null,
    team2_checked_in_at: null,
    forfeit_processed_at: null,
    team1: { id: 'team-a', name: 'Alpha' },
    team2: { id: 'team-b', name: 'Bravo' },
    tournament: { id: 'tour-1', name: 'Cup' },
    ...over,
  };
  store.matches = [row] as never;
  return row;
}

/** Exécute `mutate` juste avant l'UPDATE de `matches` — la course perdue. */
function beforeMatchesUpdate(mutate: () => void) {
  const realFrom = supabaseAdmin.from.bind(supabaseAdmin);
  return vi.spyOn(supabaseAdmin as any, 'from').mockImplementation(((
    table: string
  ) => {
    const builder = realFrom(table) as unknown as {
      update: (p: Row) => unknown;
    };
    if (table === 'matches') {
      const realUpdate = builder.update.bind(builder);
      builder.update = (p: Row) => {
        mutate();
        return realUpdate(p);
      };
    }
    return builder;
  }) as never);
}

beforeEach(() => {
  resetSupabaseMock();
  vi.restoreAllMocks();
});

describe('isCheckinWindowPassed', () => {
  const kickoff = '2026-10-06T19:00:00.000Z';
  const at = (iso: string) => new Date(iso).getTime();

  it('ouvert jusqu’au coup d’envoi inclus, fermé juste après', () => {
    expect(isCheckinWindowPassed(kickoff, at(kickoff) - 1)).toBe(false);
    expect(isCheckinWindowPassed(kickoff, at(kickoff))).toBe(false);
    expect(isCheckinWindowPassed(kickoff, at(kickoff) + 1)).toBe(true);
  });

  it('un horaire absent ou illisible ne ferme rien', () => {
    expect(isCheckinWindowPassed(null)).toBe(false);
    expect(isCheckinWindowPassed(undefined)).toBe(false);
    expect(isCheckinWindowPassed('pas une date')).toBe(false);
  });

  it('même règle que le `isPassed` de l’écran joueuse', () => {
    for (const delta of [-60_000, 0, 1, 60_000]) {
      const now = at(kickoff) + delta;
      expect(buildCheckin({ scheduled_at: kickoff }, true, now).isPassed).toBe(
        isCheckinWindowPassed(kickoff, now)
      );
    }
  });
});

describe('redeemCheckinToken — garde horaire serveur', () => {
  it('pointe avant le coup d’envoi', async () => {
    const row = seed();
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({ ok: true, alreadyCheckedIn: false });
    expect(row.team1_checked_in_at).toBeTruthy();
  });

  it('refuse après le coup d’envoi (CHECKIN_WINDOW_CLOSED), sans rien écrire', async () => {
    const row = seed({ scheduled_at: inMinutes(-2) });
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({ ok: false, code: 'CHECKIN_WINDOW_CLOSED' });
    expect(row.team1_checked_in_at).toBeNull();
  });

  it('refuse aussi un match `ongoing` dont l’heure est passée', async () => {
    const row = seed({ status: 'ongoing', scheduled_at: inMinutes(-10) });
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({ ok: false, code: 'CHECKIN_WINDOW_CLOSED' });
    expect(row.team1_checked_in_at).toBeNull();
  });

  it('un statut fermé porte son code (CHECKIN_MATCH_CLOSED)', async () => {
    seed({ status: 'finished', scheduled_at: inMinutes(-30) });
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({ ok: false, code: 'CHECKIN_MATCH_CLOSED' });
    if (!r.ok) expect(r.error).toMatch(/Check-in fermé/);
  });

  it('un rejeu sur une équipe déjà pointée reste un succès après le coup d’envoi', async () => {
    seed({
      scheduled_at: inMinutes(-5),
      team1_checked_in_at: '2026-10-06T18:30:00.000Z',
    });
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({
      ok: true,
      alreadyCheckedIn: true,
      checkedInAt: '2026-10-06T18:30:00.000Z',
    });
  });

  it('sans horaire, pas de garde horaire (comportement d’avant)', async () => {
    const row = seed({ scheduled_at: null });
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({ ok: true, alreadyCheckedIn: false });
    expect(row.team1_checked_in_at).toBeTruthy();
  });
});

describe('redeemCheckinToken — écriture sûre face au forfait', () => {
  it('forfait déjà traité : refus, rien d’écrit', async () => {
    const row = seed({ forfeit_processed_at: inMinutes(-1) });
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({ ok: false, code: 'CHECKIN_WINDOW_CLOSED' });
    expect(row.team1_checked_in_at).toBeNull();
  });

  it('forfait posé ENTRE la lecture et l’écriture : refus, rien d’écrit', async () => {
    const row = seed();
    beforeMatchesUpdate(() => {
      row.forfeit_processed_at = new Date().toISOString();
    });
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({ ok: false, code: 'CHECKIN_WINDOW_CLOSED' });
    expect(row.team1_checked_in_at).toBeNull();
  });

  it('match annulé entre la lecture et l’écriture : CHECKIN_MATCH_CLOSED', async () => {
    const row = seed();
    beforeMatchesUpdate(() => {
      row.status = 'cancelled';
    });
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({ ok: false, code: 'CHECKIN_MATCH_CLOSED' });
    expect(row.team1_checked_in_at).toBeNull();
  });

  it('clic concurrent qui pointe le premier : succès idempotent, horodatage conservé', async () => {
    const row = seed();
    const first = '2026-10-06T18:45:00.000Z';
    beforeMatchesUpdate(() => {
      row.team1_checked_in_at = first;
    });
    const r = await redeemCheckinToken(TENANT, TOKEN);
    expect(r).toMatchObject({
      ok: true,
      alreadyCheckedIn: true,
      checkedInAt: first,
    });
    expect(row.team1_checked_in_at).toBe(first);
  });
});
