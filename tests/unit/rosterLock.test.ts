import { describe, it, expect, vi, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import {
  rosterLockErrorMessage,
  isTeamRosterLocked,
} from '../../utils/teams/rosterLock';

type Reg = {
  tournament_id: string;
  /** Dérogation propre à CETTE inscription (par équipe). */
  roster_unlocked_until?: string | null;
};
type Tournament = {
  id: string;
  name: string | null;
  roster_locked_at: string | null;
  status: string;
  /** Fenêtre de dérogation temporaire (cf. roster_unlocked_until). */
  roster_unlocked_until?: string | null;
};

const TEAM_ID = 'team-1';
// S5a: tenantId obligatoire en premier parametre positionnel.
const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function seedRegistrations(rows: Reg[]) {
  // The mock filters by team_id (the rosterLock query does .eq('team_id', …)),
  // so attach the test team_id + tenant_id automatically to keep seeds compact.
  store.tournament_teams = rows.map((r) => ({
    ...r,
    team_id: TEAM_ID,
    tenant_id: TENANT_ID,
  })) as any;
}

function seedTournaments(rows: Tournament[]) {
  store.tournaments = rows.map((r) => ({ ...r, tenant_id: TENANT_ID })) as any;
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('rosterLockErrorMessage', () => {
  it('returns the unlocked message when status is not locked', () => {
    expect(rosterLockErrorMessage({ locked: false })).toBe(
      'Roster non verrouillé'
    );
  });

  it('includes the tournament name when provided', () => {
    const msg = rosterLockErrorMessage({
      locked: true,
      tournamentId: 'tid-123456',
      tournamentName: 'Coupe Hiver',
      lockedAt: '2026-01-15T10:00:00.000Z',
    });
    expect(msg).toContain('« Coupe Hiver »');
    // Le message est lu par des CAPITAINES : il nomme la seule action qui leur
    // est ouverte — demander une fenêtre — et plus le drapeau interne
    // `force=true`, qu'ils ne peuvent pas utiliser.
    expect(msg).not.toContain('force=true');
    expect(msg).toContain('fenêtre');
  });

  it('falls back to a tournament id prefix when no name is set', () => {
    const msg = rosterLockErrorMessage({
      locked: true,
      tournamentId: '0123456789abcdef',
      tournamentName: null,
      lockedAt: '2026-01-15T10:00:00.000Z',
    });
    // Falls back to first 8 chars of the id
    expect(msg).toContain('« 01234567 »');
  });

  it('formats the lock date in fr-FR locale', () => {
    const msg = rosterLockErrorMessage({
      locked: true,
      tournamentId: 'tid',
      tournamentName: 'X',
      lockedAt: '2026-01-15T10:00:00.000Z',
    });
    // toLocaleString('fr-FR') uses DD/MM/YYYY — assert the day/month digits appear.
    expect(msg).toMatch(/15\/01\/2026/);
  });
});

describe('isTeamRosterLocked', () => {
  it('returns unlocked when the team has no tournament registrations', async () => {
    seedRegistrations([]);
    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('returns unlocked when none of the registered tournaments has a lock date', async () => {
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Open Spring',
        roster_locked_at: null,
        status: 'in_progress',
      },
    ]);
    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('returns unlocked when the lock date is in the future', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Future Cup',
        roster_locked_at: future,
        status: 'in_progress',
      },
    ]);
    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('returns locked with tournament details when at least one lock date has passed', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Hiver 2026',
        roster_locked_at: past,
        status: 'in_progress',
      },
    ]);
    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status).toEqual({
      locked: true,
      tournamentId: 't1',
      tournamentName: 'Hiver 2026',
      lockedAt: past,
    });
  });

  it('ignores archived tournaments even if their lock date has passed', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't-archived' }]);
    seedTournaments([
      {
        id: 't-archived',
        name: 'Old',
        roster_locked_at: past,
        status: 'archived',
      },
    ]);
    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('ignores completed tournaments even if their lock date has passed', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't-done' }]);
    seedTournaments([
      {
        id: 't-done',
        name: 'Done',
        roster_locked_at: past,
        status: 'completed',
      },
    ]);
    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('returns the first locking tournament when several are locked', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't1' }, { tournament_id: 't2' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'First',
        roster_locked_at: past,
        status: 'in_progress',
      },
      {
        id: 't2',
        name: 'Second',
        roster_locked_at: past,
        status: 'in_progress',
      },
    ]);
    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(true);
    if (status.locked) {
      expect(status.tournamentId).toBe('t1');
    }
  });

  it('skips registrations with a null tournament_id', async () => {
    seedRegistrations([{ tournament_id: null as unknown as string }]);
    seedTournaments([]);
    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('falls back to a null tournament name when none is set on the row', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      { id: 't1', name: null, roster_locked_at: past, status: 'in_progress' },
    ]);
    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    if (!status.locked) throw new Error('expected locked');
    expect(status.tournamentName).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Fenêtre de déverrouillage temporaire
 * -------------------------------------------------------------------------
 *
 * Passé `roster_locked_at`, un capitaine ne peut plus rien. Les cas légitimes
 * existent pourtant — blessure, remplaçante, oubli découvert la veille — et la
 * seule issue était `force=true` côté admin : c'était donc à l'admin de faire
 * la manipulation à la place du capitaine.
 *
 * La fenêtre inverse la charge. Ce qui doit rester vrai :
 *   - elle lève le verrou tant qu'elle est ouverte ;
 *   - elle ne lève QUE le tournoi qui l'ouvre ;
 *   - expirée, elle ne lève plus rien — c'est tout l'intérêt d'une date.
 */
describe('fenêtre de déverrouillage', () => {
  const PAST = new Date(Date.now() - 3_600_000).toISOString();
  const FUTURE = new Date(Date.now() + 3_600_000).toISOString();

  it('ouverte : le roster n’est plus verrouillé, et on sait jusqu’à quand', async () => {
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Coupe Hiver',
        roster_locked_at: PAST,
        roster_unlocked_until: FUTURE,
        status: 'running',
      },
    ]);

    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
    if (!status.locked) {
      // Dire « pas de verrou » tout court laisserait croire qu'il n'y a rien à
      // surveiller : l'appelant doit pouvoir afficher l'échéance.
      expect(status.unlockedUntil).toBe(FUTURE);
      expect(status.unlockedTournamentName).toBe('Coupe Hiver');
    }
  });

  it('expirée : le verrou reprend', async () => {
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Coupe Hiver',
        roster_locked_at: PAST,
        roster_unlocked_until: PAST,
        status: 'running',
      },
    ]);

    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(true);
  });

  it('ne dispense QUE du tournoi qui l’ouvre', async () => {
    // Deux tournois verrouillés, un seul déverrouillé : l'équipe reste bloquée
    // par l'autre. Sinon une dérogation accordée pour une coupe ouvrirait le
    // roster d'un championnat en cours.
    seedRegistrations([{ tournament_id: 't1' }, { tournament_id: 't2' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Coupe Hiver',
        roster_locked_at: PAST,
        roster_unlocked_until: FUTURE,
        status: 'running',
      },
      {
        id: 't2',
        name: 'Championnat',
        roster_locked_at: PAST,
        roster_unlocked_until: null,
        status: 'running',
      },
    ]);

    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(true);
    if (status.locked) expect(status.tournamentName).toBe('Championnat');
  });

  it('deux fenêtres ouvertes : c’est la plus proche qui fixe la fin du répit', async () => {
    const SOON = new Date(Date.now() + 600_000).toISOString();
    seedRegistrations([{ tournament_id: 't1' }, { tournament_id: 't2' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'A',
        roster_locked_at: PAST,
        roster_unlocked_until: FUTURE,
        status: 'running',
      },
      {
        id: 't2',
        name: 'B',
        roster_locked_at: PAST,
        roster_unlocked_until: SOON,
        status: 'running',
      },
    ]);

    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
    if (!status.locked) expect(status.unlockedUntil).toBe(SOON);
  });

  it('sans verrou du tout, la fenêtre ne change rien', async () => {
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Coupe',
        roster_locked_at: null,
        roster_unlocked_until: FUTURE,
        status: 'running',
      },
    ]);

    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
    if (!status.locked) expect(status.unlockedUntil).toBeUndefined();
  });
});

describe('dérogation par équipe', () => {
  const PAST2 = new Date(Date.now() - 3_600_000).toISOString();
  const FUTURE2 = new Date(Date.now() + 3_600_000).toISOString();

  it('la fenêtre de l’équipe lève le verrou, sans toucher au tournoi', async () => {
    // C'est le cas qui motive cette portée : une équipe précise a une raison,
    // les autres n'en ont pas.
    seedRegistrations([
      { tournament_id: 't1', roster_unlocked_until: FUTURE2 },
    ]);
    seedTournaments([
      {
        id: 't1',
        name: 'Coupe',
        roster_locked_at: PAST2,
        roster_unlocked_until: null,
        status: 'running',
      },
    ]);

    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
    if (!status.locked) expect(status.unlockedUntil).toBe(FUTURE2);
  });

  it('expirée côté équipe, le verrou reprend', async () => {
    seedRegistrations([{ tournament_id: 't1', roster_unlocked_until: PAST2 }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Coupe',
        roster_locked_at: PAST2,
        roster_unlocked_until: null,
        status: 'running',
      },
    ]);

    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(true);
  });

  it('les deux portées se cumulent au plus permissif', async () => {
    // Fenêtre d'équipe courte, fenêtre de tournoi longue : c'est la plus
    // favorable qui vaut — sinon ouvrir pour tout le monde raccourcirait le
    // répit d'une équipe qui en avait déjà un.
    const SOON = new Date(Date.now() + 600_000).toISOString();
    seedRegistrations([{ tournament_id: 't1', roster_unlocked_until: SOON }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Coupe',
        roster_locked_at: PAST2,
        roster_unlocked_until: FUTURE2,
        status: 'running',
      },
    ]);

    const status = await isTeamRosterLocked(TENANT_ID, TEAM_ID);
    expect(status.locked).toBe(false);
    if (!status.locked) expect(status.unlockedUntil).toBe(FUTURE2);
  });
});
