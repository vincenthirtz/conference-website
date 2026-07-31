// tests/unit/subjectParam.test.ts
//
// `withSubjectParam` — the client half of the `?as=` contract (S2 of
// docs/PLAN-espace-unifie.md). Every player screen and card routes its reads
// through it, so a bug here silently makes an inspected dashboard show the
// STAFF's data under someone else's name.
//
// (The React side — PlayerAreaContext — is not unit-tested: unit tests run in
// node and the zero-dependency policy rules out @testing-library/react. It is
// covered end-to-end by the Playwright player specs.)

import { describe, it, expect } from 'vitest';
import {
  SUBJECT_QUERY_PARAM,
  withSubjectParam,
} from '../../utils/subjectParam';

const SUBJECT = '33333333-3333-4333-8333-333333333333';

describe('withSubjectParam', () => {
  it('is a no-op without a subject', () => {
    expect(withSubjectParam('/api/player/matches')).toBe('/api/player/matches');
    expect(withSubjectParam('/api/player/matches', null)).toBe(
      '/api/player/matches'
    );
    expect(withSubjectParam('/api/player/matches', '')).toBe(
      '/api/player/matches'
    );
  });

  it('appends the subject with ? on a bare path', () => {
    expect(withSubjectParam('/api/player/matches', SUBJECT)).toBe(
      `/api/player/matches?${SUBJECT_QUERY_PARAM}=${SUBJECT}`
    );
  });

  it('appends with & when the path already carries a query', () => {
    // Real call site: TeamRhythmCard passes ?tz=…
    expect(
      withSubjectParam('/api/player/team-rhythm?tz=Europe%2FParis', SUBJECT)
    ).toBe(
      `/api/player/team-rhythm?tz=Europe%2FParis&${SUBJECT_QUERY_PARAM}=${SUBJECT}`
    );
  });

  it('encodes the subject id', () => {
    expect(withSubjectParam('/api/x', 'a b&c=d')).toBe(
      `/api/x?${SUBJECT_QUERY_PARAM}=a%20b%26c%3Dd`
    );
  });

  it('uses the same param name the server reads', () => {
    expect(SUBJECT_QUERY_PARAM).toBe('as');
  });
});
