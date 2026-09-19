// Page publique /tournament/[id]/stats — getStaticProps.
//
// CE QUE CE CAS PROTÈGE : un match seulement PROGRAMMÉ n'est pas un match joué.
// Il comptait (0 V / 0 D) et faisait apparaître au classement des équipes qui
// n'avaient pas encore joué, avec un winrate de 0 %.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { getStaticProps } from '../../pages/tournament/[id]/stats';

const TOUR = 'eeeeeeee-0000-4000-8000-000000000001';
const STAGE = 'ffffffff-0000-4000-8000-000000000001';
const [A, B, C, D] = ['a', 'b', 'c', 'd'].map(
  (x) => `${x.repeat(8)}-0000-4000-8000-000000000001`
);

beforeEach(() => {
  resetSupabaseMock();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  store.tournaments = [
    {
      id: TOUR,
      tenant_id: DEFAULT_TENANT_ID,
      slug: 'cup',
      name: 'Cup',
      status: 'published',
      visibility: 'public',
    },
  ] as any;
  store.tournament_stages = [
    {
      id: STAGE,
      tenant_id: DEFAULT_TENANT_ID,
      tournament_id: TOUR,
      stage_type: 'round_robin',
    },
  ] as any;
  const team = (id: string, name: string) => ({
    tenant_id: DEFAULT_TENANT_ID,
    stage_id: STAGE,
    team_id: id,
    team: { id, name, short_name: null, logo_url: null },
  });
  store.stage_teams = [
    team(A, 'A'),
    team(B, 'B'),
    team(C, 'C'),
    team(D, 'D'),
  ] as any;
  store.matches = [
    {
      id: 'm1',
      tenant_id: DEFAULT_TENANT_ID,
      tournament_id: TOUR,
      status: 'finished',
      is_bye: false,
      team1_id: A,
      team2_id: B,
      winner_team_id: A,
    },
    {
      id: 'm2',
      tenant_id: DEFAULT_TENANT_ID,
      tournament_id: TOUR,
      status: 'pending',
      is_bye: false,
      team1_id: C,
      team2_id: D,
      winner_team_id: null,
    },
  ] as any;
  store.games = [] as any;
});

describe('stats du tournoi — matchs joués', () => {
  it('ignore les matchs seulement programmés', async () => {
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    const ids = res.props.teamStats.map((s: any) => s.teamId).sort();
    expect(ids).toEqual([A, B].sort());
    expect(res.props.teamStats.find((s: any) => s.teamId === A)).toMatchObject({
      matchesPlayed: 1,
      wins: 1,
    });
  });
});
