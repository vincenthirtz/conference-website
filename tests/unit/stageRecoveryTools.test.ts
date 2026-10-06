// Outils de rattrapage d'une phase (lot A1) : logique pure de la grille de
// saisie rapide des scores et du formulaire « Forcer l'ordre ».

import { describe, expect, it } from 'vitest';
import {
  buildBatch,
  chunkEntries,
  type GridMatch,
  initialCell,
  isPlayable,
  roundsOf,
} from '@/features/admin/stages/batchScoresDraft';
import { validateOverrideDraft } from '@/features/admin/stages/hooks/useTiebreakerOverrides';
import { snapshotReasonLabel } from '@/features/admin/stages/ui/BracketSnapshotsPanel';
import nsAdminStageHistory from '@/lib/i18n/locales/admin-fr/adminStageHistory';

function match(over: Partial<GridMatch> & { id: string }): GridMatch {
  return {
    round_number: 1,
    status: 'pending',
    team1_id: 't1',
    team2_id: 't2',
    team1_score: 0,
    team2_score: 0,
    ...over,
  };
}

describe('batchScoresDraft', () => {
  it('rounds croissants, « sans round » en dernier', () => {
    const rounds = roundsOf([
      match({ id: 'a', round_number: 2 }),
      match({ id: 'b', round_number: null }),
      match({ id: 'c', round_number: 1 }),
      match({ id: 'd', round_number: 2 }),
    ]);
    expect(rounds).toEqual([1, 2, null]);
  });

  it('jouable : deux équipes connues et match non annulé', () => {
    expect(isPlayable(match({ id: 'a' }))).toBe(true);
    expect(isPlayable(match({ id: 'a', team2_id: null }))).toBe(false);
    expect(isPlayable(match({ id: 'a', status: 'cancelled' }))).toBe(false);
  });

  it('valeur initiale : le 0-0 d’un match pending n’est pas un score', () => {
    expect(initialCell(match({ id: 'a' }))).toEqual({ team1: '', team2: '' });
    expect(
      initialCell(
        match({ id: 'a', status: 'finished', team1_score: 3, team2_score: 1 })
      )
    ).toEqual({ team1: '3', team2: '1' });
  });

  it('n’envoie que les lignes modifiées et valides', () => {
    const matches = [
      match({ id: 'a' }),
      match({ id: 'b', status: 'finished', team1_score: 2, team2_score: 0 }),
      match({ id: 'c' }),
    ];
    const { entries, errors } = buildBatch(
      matches,
      {
        a: { team1: '3', team2: ' 1 ' },
        b: { team1: '2', team2: '0' }, // inchangé
        // c : pas touché
      },
      { forbidTies: true }
    );
    expect(entries).toEqual([{ matchId: 'a', team1Score: 3, team2Score: 1 }]);
    expect(errors).toEqual({});
  });

  it('signale les lignes invalides sans les envoyer', () => {
    const matches = [
      match({ id: 'half' }),
      match({ id: 'neg' }),
      match({ id: 'dec' }),
      match({ id: 'tie' }),
      match({ id: 'gone', team1_id: null }),
    ];
    const { entries, errors } = buildBatch(
      matches,
      {
        half: { team1: '2', team2: '' },
        neg: { team1: '-1', team2: '2' },
        dec: { team1: '1.5', team2: '2' },
        tie: { team1: '2', team2: '2' },
        gone: { team1: '1', team2: '0' },
      },
      { forbidTies: true }
    );
    expect(entries).toEqual([]);
    expect(errors).toEqual({
      half: 'bsErrBothScores',
      neg: 'bsErrNotInteger',
      dec: 'bsErrNotInteger',
      tie: 'bsErrTie',
    });
  });

  it('égalité admise hors bracket', () => {
    const { entries, errors } = buildBatch(
      [match({ id: 'tie' })],
      { tie: { team1: '1', team2: '1' } },
      { forbidTies: false }
    );
    expect(errors).toEqual({});
    expect(entries).toHaveLength(1);
  });

  it('découpe en lots de 50 en conservant l’ordre', () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const chunks = chunkEntries(items);
    expect(chunks.map((c) => c.length)).toEqual([50, 50, 20]);
    expect(chunks.flat()).toEqual(items);
  });
});

describe('validateOverrideDraft', () => {
  const standings = [
    { teamId: 'a', score: 6 },
    { teamId: 'b', score: 6 },
    { teamId: 'c', score: 3 },
  ];
  const ok = { winnerTeamId: 'b', loserTeamId: 'a', reason: 'arbitrage' };

  it('accepte deux équipes à égalité avec un motif', () => {
    expect(validateOverrideDraft(ok, standings)).toBeNull();
  });

  it('motif obligatoire (espaces seuls refusés)', () => {
    expect(validateOverrideDraft({ ...ok, reason: '   ' }, standings)).toBe(
      'ovErrReason'
    );
  });

  it('deux équipes distinctes requises', () => {
    expect(validateOverrideDraft({ ...ok, loserTeamId: '' }, standings)).toBe(
      'ovErrTeams'
    );
    expect(validateOverrideDraft({ ...ok, loserTeamId: 'b' }, standings)).toBe(
      'ovErrSame'
    );
  });

  it('refuse une dérogation entre scores différents (sans effet)', () => {
    expect(validateOverrideDraft({ ...ok, loserTeamId: 'c' }, standings)).toBe(
      'ovErrNotTied'
    );
  });

  it('refuse une équipe absente du classement', () => {
    expect(validateOverrideDraft({ ...ok, loserTeamId: 'zz' }, standings)).toBe(
      'ovErrUnknownTeam'
    );
  });
});

describe('snapshotReasonLabel', () => {
  const t = nsAdminStageHistory.fr;
  it('traduit les motifs techniques, garde un motif libre', () => {
    expect(snapshotReasonLabel('pre_restore', t)).toBe(t.snapReasonPreRestore);
    expect(snapshotReasonLabel(null, t)).toBe(t.snapReasonManual);
    expect(snapshotReasonLabel('avant correction R2', t)).toBe(
      'avant correction R2'
    );
  });
});
