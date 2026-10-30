// @vitest-environment happy-dom
// Le casting POGTV : saison régulière seulement, jamais sur un event ponctuel.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StreamingSection from '@/components/tournament/landing/StreamingSection';
import { isRegularSeason } from '@/components/tournament/landing/types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

const t = nsTournamentLanding.fr;

afterEach(cleanup);

describe('isRegularSeason', () => {
  it('reconnaît les saisons de la Cup', () => {
    expect(isRegularSeason('ow-womens-cup-2026')).toBe(true);
    expect(isRegularSeason('ow-womens-cup-2027')).toBe(true);
  });

  it('écarte les events, et un tournoi sans identifiant', () => {
    expect(isRegularSeason('halloween-2026')).toBe(false);
    expect(isRegularSeason('tournoi-mixte')).toBe(false);
    expect(isRegularSeason(null)).toBe(false);
    expect(isRegularSeason(undefined)).toBe(false);
  });
});

describe('StreamingSection', () => {
  it('saison régulière : le casting POGTV et sa mention', () => {
    render(<StreamingSection phase="upcoming" showCasting />);
    expect(screen.getByText(t.streamCastersHeading)).toBeTruthy();
    expect(screen.getByText(t.streamCastSoonBody)).toBeTruthy();
    expect(screen.getByText(t.streamSubtitle)).toBeTruthy();
  });

  it('event : le bandeau Twitch, sans casting ni mention de la Cup', () => {
    render(<StreamingSection phase="upcoming" showCasting={false} />);
    expect(screen.queryByText(t.streamCastersHeading)).toBeNull();
    expect(screen.queryByText(t.streamCastSoonBody)).toBeNull();
    expect(screen.queryByText(t.streamSubtitle)).toBeNull();
    expect(screen.getByText(t.streamSubtitleEvent)).toBeTruthy();
    expect(screen.getByText(t.streamCtaTwitch)).toBeTruthy();
  });
});
