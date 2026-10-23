// Landing /tournament/[id] — getStaticProps et `summarizeLandingMatches`.
//
// CE QUE CE CAS PROTÈGE :
//   - les matchs sont lus UNE fois par régénération : le bloc de suivi, les
//     compteurs, l'aperçu des manches et le coup d'envoi en sont dérivés (il y
//     avait cinq lectures, dont une séquentielle) ;
//   - la playlist Reviews vient de la lecture du tournoi (plus de requête à part) ;
//   - la fenêtre ISR suit l'état du tournoi : 60 s pendant qu'il se joue, un
//     jour une fois archivé, 60 s si une lecture échoue ;
//   - les colonnes ajoutées pour les manches ne fuient pas dans les props du
//     bloc de suivi.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  fromCalls,
} from './__helpers__/supabaseMock';
import { failTable } from './__helpers__/failTable';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { getStaticProps } from '../../pages/tournament/[id]';
import {
  summarizeLandingMatches,
  type LandingMatchRow,
} from '../../utils/tournament/landingMatches';

const TOUR = 'eeeeeeee-0000-4000-8000-000000000001';
const PL = 'PLBu9E8qChrHcAbCdEfGhIjKlMnOpQrStU';
const A = { id: 'ta', slug: 'a', name: 'A', short_name: null, logo_url: null };
const B = { id: 'tb', slug: 'b', name: 'B', short_name: null, logo_url: null };

function row(over: Partial<LandingMatchRow> & { id: string }): LandingMatchRow {
  return {
    scheduled_at: null,
    status: 'pending',
    is_bye: false,
    round_name: null,
    round_number: null,
    bracket_side: null,
    match_format: 'bo3',
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    forfeit_team_id: null,
    stream_url: null,
    team1: A,
    team2: B,
    ...over,
  };
}

describe('summarizeLandingMatches', () => {
  const rows = [
    row({
      id: 'm2',
      round_number: 2,
      round_name: 'J2',
      scheduled_at: '2026-10-23T19:00:00+00:00',
    }),
    row({
      id: 'm1',
      round_number: 1,
      round_name: 'J1',
      status: 'finished',
      scheduled_at: '2026-10-16T19:00:00+00:00',
      team1: [A] as unknown as LandingMatchRow['team1'],
    }),
    row({ id: 'm3', round_number: 1, round_name: null, is_bye: true }),
    row({ id: 'm4', round_number: 1, bracket_side: 'wb', round_name: 'QF' }),
  ];

  it('compteurs : non annulés (exempts compris) et terminés', () => {
    const s = summarizeLandingMatches(rows);
    expect(s.totalMatches).toBe(4);
    expect(s.finishedMatchesCount).toBe(1);
  });

  it('coup d’envoi = premier match programmé', () => {
    expect(summarizeLandingMatches(rows).kickoffAt).toBe(
      '2026-10-16T19:00:00+00:00'
    );
    expect(summarizeLandingMatches([row({ id: 'x' })]).kickoffAt).toBeNull();
  });

  it('manches : une entrée par (numéro, côté), dans l’ordre', () => {
    expect(summarizeLandingMatches(rows).rounds).toEqual([
      { number: 1, name: 'J1', matchCount: 2, side: 'none' },
      { number: 1, name: 'QF', matchCount: 1, side: 'wb' },
      { number: 2, name: 'J2', matchCount: 1, side: 'none' },
    ]);
  });

  it('bloc de suivi : embeds dénoués, sans les colonnes des manches', () => {
    const [m] = summarizeLandingMatches([rows[1]]).hubMatches;
    expect(m.team1).toEqual(A);
    expect(m).not.toHaveProperty('round_number');
    expect(m).not.toHaveProperty('bracket_side');
  });
});

describe('landing tournoi — getStaticProps', () => {
  function seed(tournament: Record<string, unknown> = {}) {
    store.tournaments = [
      {
        id: TOUR,
        tenant_id: DEFAULT_TENANT_ID,
        slug: 'cup',
        name: 'Cup',
        status: 'running',
        visibility: 'public',
        start_date: '2026-09-14',
        end_date: '2026-12-20',
        reviews_playlist_id: PL,
        ...tournament,
      },
    ] as any;
    store.tournament_stages = [] as any;
    store.tournament_teams = [] as any;
    store.league_tournaments = [] as any;
    store.partners = [] as any;
    store.matches = [
      {
        id: 'm1',
        tenant_id: DEFAULT_TENANT_ID,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        round_name: 'J1',
        bracket_side: 'none',
        scheduled_at: '2026-09-16T19:00:00+00:00',
        team1: A,
        team2: B,
        winner_team_id: 'ta',
      },
      {
        id: 'm2',
        tenant_id: DEFAULT_TENANT_ID,
        tournament_id: TOUR,
        status: 'pending',
        is_bye: false,
        round_number: 2,
        round_name: 'J2',
        bracket_side: 'none',
        scheduled_at: '2026-10-23T19:00:00+00:00',
        team1: A,
        team2: B,
      },
      {
        id: 'gone',
        tenant_id: DEFAULT_TENANT_ID,
        tournament_id: TOUR,
        status: 'finished',
        round_number: 1,
        deleted_at: '2026-09-20T00:00:00Z',
      },
      {
        id: 'off',
        tenant_id: DEFAULT_TENANT_ID,
        tournament_id: TOUR,
        status: 'cancelled',
        round_number: 3,
      },
    ] as any;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    resetSupabaseMock();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('une lecture des matchs, une du tournoi, playlist comprise', async () => {
    seed();
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(fromCalls.filter((t) => t === 'matches')).toHaveLength(1);
    expect(fromCalls.filter((t) => t === 'tournaments')).toHaveLength(1);
    expect(res.props.hasReviews).toBe(true);
    expect(res.props.tournament).not.toHaveProperty('reviews_playlist_id');
  });

  it('compteurs, manches et coup d’envoi dérivés (supprimés et annulés exclus)', async () => {
    seed();
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.props.totalMatches).toBe(2);
    expect(res.props.finishedMatchesCount).toBe(1);
    expect(res.props.rounds.map((r: any) => r.number)).toEqual([1, 2]);
    expect(res.props.tournament.kickoff_at).toBe('2026-09-16T19:00:00+00:00');
    expect(res.props.hub.played).toBe(1);
  });

  it('tournoi en cours → 60 s ; archivé → un jour', async () => {
    seed();
    const live: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(live.revalidate).toBe(60);

    seed({
      status: 'completed',
      start_date: '2025-03-01',
      end_date: '2025-03-08',
    });
    const archived: any = await getStaticProps({
      params: { id: 'cup' },
    } as any);
    expect(archived.revalidate).toBe(86_400);
  });

  it('lecture des matchs en échec → fenêtre du direct, même archivé', async () => {
    seed({
      status: 'completed',
      start_date: '2025-03-01',
      end_date: '2025-03-08',
    });
    failTable('matches');
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.revalidate).toBe(60);
  });

  describe('tournoi clos — classement figé', () => {
    function seedRanking() {
      store.final_rankings = [
        {
          tenant_id: DEFAULT_TENANT_ID,
          tournament_id: TOUR,
          team_id: 'tb',
          rank: 2,
          prize: null,
        },
        {
          tenant_id: DEFAULT_TENANT_ID,
          tournament_id: TOUR,
          team_id: 'ta',
          rank: 1,
          prize: '500 €',
        },
      ] as any;
      store.teams = [
        {
          id: 'ta',
          tenant_id: DEFAULT_TENANT_ID,
          name: 'Alpha',
          slug: 'alpha',
          logo_url: null,
        },
        {
          id: 'tb',
          tenant_id: DEFAULT_TENANT_ID,
          name: 'Bravo',
          slug: 'bravo',
          logo_url: null,
        },
      ] as any;
    }

    it('lu et trié pour un tournoi clos', async () => {
      seed({ status: 'completed' });
      seedRanking();
      const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
      expect(
        res.props.finalRanking.map((r: any) => [r.rank, r.teamName, r.prize])
      ).toEqual([
        [1, 'Alpha', '500 €'],
        [2, 'Bravo', null],
      ]);
    });

    it('pas lu pendant le tournoi', async () => {
      seed();
      seedRanking();
      const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
      expect(res.props.finalRanking).toEqual([]);
      expect(fromCalls).not.toContain('final_rankings');
    });

    it('lecture en échec → section vide, fenêtre du direct', async () => {
      seed({
        status: 'completed',
        start_date: '2025-03-01',
        end_date: '2025-03-08',
      });
      failTable('final_rankings');
      const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
      expect(res.props.finalRanking).toEqual([]);
      expect(res.revalidate).toBe(60);
    });
  });

  it('introuvable ou privé → 404', async () => {
    seed({ visibility: 'private' });
    const priv: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(priv.notFound).toBe(true);
    const missing: any = await getStaticProps({
      params: { id: 'nope' },
    } as any);
    expect(missing.notFound).toBe(true);
  });
});
