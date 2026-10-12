// Récompense TCG de participation d'une équipe en DNF.
// Target: utils/tcg/grantTournamentParticipation.ts (+ son branchement dans
// `POST /api/admin/stages/[stageId]/disqualify` et la route de rattrapage
// `POST /api/admin/stages/[stageId]/participation-reward`).
//
// CE QUE CES CAS PROTÈGENT.
//   1. Le crédit : TOURNAMENT_PARTICIPATION_COINS (1000) à chaque joueuse des
//      feuilles de match de l'équipe sur CE tournoi, titulaires et remplaçantes,
//      `source_ref` = le tournoi.
//   2. L'idempotence : un second déclenchement ne recrédite personne et ne
//      reposte pas le message.
//   3. Un seul message sur le salon de l'équipe (event `team.message`).
//   4. Une équipe non disqualifiée est ignorée : rien n'est écrit.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateAllStandingsCache } from '../../utils/stages/standingsCache';

const { applyMatchScore, settleMatchPredictions } = vi.hoisted(() => ({
  applyMatchScore: vi.fn(async (input: { matchId: string }) => ({
    matchId: input.matchId,
    updated: true,
    winnerTeamId: null,
  })),
  settleMatchPredictions: vi.fn(async () => ({
    ok: true,
    settled: 0,
    credited: 0,
  })),
}));
vi.mock('../../utils/matches/applyScore', () => ({ applyMatchScore }));
vi.mock('../../utils/predictions/settle', () => ({ settleMatchPredictions }));

import {
  buildParticipationMessage,
  grantTournamentParticipation,
} from '../../utils/tcg/grantTournamentParticipation';
import { TOURNAMENT_PARTICIPATION_COINS } from '../../utils/tcg/earnSources';
import { MATCH_WIN_COINS } from '../../utils/tcg/economy';
import disqualifyHandler from '../../pages/api/admin/stages/[stageId]/disqualify';
import rewardHandler from '../../pages/api/admin/stages/[stageId]/participation-reward';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT = '6c1d8b3f-4e5a-4b2c-8d9e-0f1a2b3c4d5e';
const OTHER_TOURNAMENT = '7d2e9c4a-5f6b-4c3d-9e0f-1a2b3c4d5e6f';
const STAGE = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const DNF_TEAM = '9c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const OK_TEAM = '7a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const USER = (n: number) =>
  `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;

const entries = () =>
  (store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>;
const participationEntries = () =>
  entries().filter((e) => e.source_kind === 'tournament_participation');
const teamMessages = () =>
  ((store.bot_event_outbox ?? []) as Array<Record<string, any>>)
    .filter(
      (row) =>
        row.event_name === 'team.message' ||
        row.payload?.event === 'team.message'
    )
    .map((row) => row.payload?.data as Record<string, unknown>);

let seq = 0;
function played(
  team: string,
  user: string | null,
  over: { is_substitute?: boolean; tournament_id?: string } = {}
) {
  seq += 1;
  (store.match_participants ||= []).push({
    id: `cccccccc-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    tournament_id: over.tournament_id ?? TOURNAMENT,
    match_id: 'dddddddd-0000-4000-8000-000000000001',
    team_id: team,
    user_id: user,
    is_substitute: over.is_substitute ?? false,
  } as never);
}

function seed(
  opts: { dnf?: boolean; channel?: string | null; locale?: string } = {}
) {
  store.tournaments = [
    { id: TOURNAMENT, name: 'OW Cup 2026', status: 'ongoing' },
  ] as never;
  store.tournament_stages = [
    {
      id: STAGE,
      tournament_id: TOURNAMENT,
      name: 'Saison régulière',
      stage_type: 'round_robin',
      order_index: 0,
      is_active: true,
      settings: {},
    },
  ] as never;
  store.teams = [
    {
      id: DNF_TEAM,
      name: 'Éclypse',
      short_name: null,
      discord_channel_id: opts.channel === undefined ? '111' : opts.channel,
      discord_role_id: '222',
      preferred_locale: opts.locale ?? null,
    },
    {
      id: OK_TEAM,
      name: 'Alpha',
      short_name: null,
      discord_channel_id: '333',
      discord_role_id: '444',
      preferred_locale: null,
    },
  ] as never;
  store.stage_teams = [DNF_TEAM, OK_TEAM].map((id, i) => ({
    stage_id: STAGE,
    team_id: id,
    seed: i + 1,
    is_substitute: false,
    notes: null,
    disqualified_at:
      id === DNF_TEAM && opts.dnf !== false ? '2026-10-08T13:50:03Z' : null,
    disqualification_mode:
      id === DNF_TEAM && opts.dnf !== false ? 'forfeit' : null,
    disqualification_reason: null,
    disqualified_by: null,
    team: { id, name: id === DNF_TEAM ? 'Éclypse' : 'Alpha' },
  })) as never;
  store.matches = [] as never;
}

function staffRow(role: StaffMember['role']): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
async function callRoute(handler: any, body: Record<string, unknown>) {
  n += 1;
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  await handler(
    {
      method: 'POST',
      headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${n}` },
      query: { stageId: STAGE },
      body,
    },
    res
  );
  return res;
}

const grant = (teamId = DNF_TEAM) =>
  grantTournamentParticipation({
    tenantId: TENANT,
    tournamentId: TOURNAMENT,
    teamId,
  });

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateAllStandingsCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow('admin')] as never;
  store.match_participants = [] as never;
  store.team_members = [] as never;
  seq = 0;
});

describe('montant', () => {
  it('vaut 1000 pièces, dérivé de la victoire de match', () => {
    expect(TOURNAMENT_PARTICIPATION_COINS).toBe(1000);
    expect(TOURNAMENT_PARTICIPATION_COINS).toBe(10 * MATCH_WIN_COINS);
  });
});

describe('grantTournamentParticipation', () => {
  it('crédite chaque joueuse des feuilles de match (remplaçantes comprises) et poste un message', async () => {
    seed();
    played(DNF_TEAM, USER(1));
    played(DNF_TEAM, USER(1)); // deux matchs, une seule joueuse
    played(DNF_TEAM, USER(2));
    played(DNF_TEAM, USER(3), { is_substitute: true });
    played(DNF_TEAM, null); // sans compte : ignorée
    played(DNF_TEAM, USER(9), { tournament_id: OTHER_TOURNAMENT });
    played(OK_TEAM, USER(4));
    // Une recrue arrivée après l'abandon n'est pas payée.
    store.team_members = [
      { team_id: DNF_TEAM, user_id: USER(8), role: 'player' },
    ] as never;

    const report = await grant();

    expect(report).toMatchObject({
      status: 'granted',
      coins: 1000,
      eligible: 3,
      granted: 3,
      rosterSource: 'match_participants',
      message: 'sent',
    });
    const credited = participationEntries();
    expect(credited.map((e) => e.user_id).sort()).toEqual(
      [USER(1), USER(2), USER(3)].sort()
    );
    for (const e of credited) {
      expect(e).toMatchObject({
        tenant_id: TENANT,
        source_ref: TOURNAMENT,
        amount: TOURNAMENT_PARTICIPATION_COINS,
      });
    }

    const messages = teamMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      teamId: DNF_TEAM,
      channelId: '111',
      kind: 'tcg_participation',
      mentionRole: false,
      tournamentId: TOURNAMENT,
    });
    expect(String(messages[0].content)).toContain('1');
    expect(String(messages[0].content)).toContain('pièces');
    expect(String(messages[0].content)).toContain('OW Cup 2026');
  });

  it('est idempotente : un second déclenchement ne recrédite pas et ne reposte pas', async () => {
    seed();
    played(DNF_TEAM, USER(1));
    played(DNF_TEAM, USER(2));

    await grant();
    const again = await grant();

    expect(again).toMatchObject({
      status: 'nothing',
      eligible: 2,
      granted: 0,
      message: 'skipped',
    });
    expect(participationEntries()).toHaveLength(2);
    expect(teamMessages()).toHaveLength(1);
  });

  it('ignore une équipe qui n’est pas en DNF', async () => {
    seed({ dnf: false });
    played(DNF_TEAM, USER(1));
    played(OK_TEAM, USER(2));

    expect((await grant(DNF_TEAM)).status).toBe('not_dnf');
    expect((await grant(OK_TEAM)).status).toBe('not_dnf');
    expect(participationEntries()).toHaveLength(0);
    expect(teamMessages()).toHaveLength(0);
  });

  it('se rabat sur les membres actuels, hors encadrement, sans feuille de match', async () => {
    seed();
    store.team_members = [
      { team_id: DNF_TEAM, user_id: USER(1), role: 'player' },
      { team_id: DNF_TEAM, user_id: USER(2), role: 'substitute' },
      { team_id: DNF_TEAM, user_id: USER(3), role: 'coach' },
      { team_id: DNF_TEAM, user_id: null, role: 'player' },
      { team_id: OK_TEAM, user_id: USER(4), role: 'player' },
    ] as never;

    const report = await grant();

    expect(report).toMatchObject({
      status: 'granted',
      granted: 2,
      rosterSource: 'team_members',
    });
    expect(
      participationEntries()
        .map((e) => e.user_id)
        .sort()
    ).toEqual([USER(1), USER(2)].sort());
  });

  it('crédite sans message quand l’équipe n’a pas de salon Discord', async () => {
    seed({ channel: null });
    played(DNF_TEAM, USER(1));

    const report = await grant();

    expect(report).toMatchObject({ granted: 1, message: 'no_channel' });
    expect(teamMessages()).toHaveLength(0);
  });

  it('écrit le message en anglais pour une équipe anglophone', async () => {
    seed({ locale: 'en' });
    played(DNF_TEAM, USER(1));

    await grant();

    expect(String(teamMessages()[0]?.content)).toContain('coins');
  });
});

describe('buildParticipationMessage', () => {
  it('rend le texte français attendu', () => {
    const text = buildParticipationMessage({
      locale: 'fr',
      teamName: 'Éclypse',
      tournamentName: 'OW Cup',
      coins: 1000,
      players: 8,
      url: 'https://owwomenscup.fr/player/tcg',
    });
    expect(text).toContain("**Éclypse**, merci d'avoir participé à **OW Cup**");
    expect(text).toContain("Chaque joueuse de l'équipe (8)");
    expect(text).toContain('pièces');
    expect(text).toContain('https://owwomenscup.fr/player/tcg');
  });
});

describe('routes admin', () => {
  it('la disqualification verse la récompense et la rend dans sa réponse', async () => {
    seed({ dnf: false });
    played(DNF_TEAM, USER(1));
    played(DNF_TEAM, USER(2));

    const res = await callRoute(disqualifyHandler, {
      team_id: DNF_TEAM,
      mode: 'forfeit',
      reason: 'Abandon',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.participationReward).toMatchObject({
      status: 'granted',
      granted: 2,
      message: 'sent',
    });
    expect(participationEntries()).toHaveLength(2);
    expect(teamMessages()).toHaveLength(1);
  });

  it('le rattrapage refuse une équipe non disqualifiée (409)', async () => {
    seed();
    const res = await callRoute(rewardHandler, { team_id: OK_TEAM });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOT_DISQUALIFIED');
    expect(participationEntries()).toHaveLength(0);
  });

  it('le rattrapage verse une fois, puis ne fait plus rien', async () => {
    seed();
    played(DNF_TEAM, USER(1));
    played(DNF_TEAM, USER(2), { is_substitute: true });

    const first = await callRoute(rewardHandler, { team_id: DNF_TEAM });
    expect(first.statusCode).toBe(200);
    expect(first.body).toMatchObject({
      teamId: DNF_TEAM,
      teamName: 'Éclypse',
      status: 'granted',
      granted: 2,
      message: 'sent',
    });

    const second = await callRoute(rewardHandler, { team_id: DNF_TEAM });
    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({ status: 'nothing', granted: 0 });
    expect(participationEntries()).toHaveLength(2);
    expect(teamMessages()).toHaveLength(1);
    expect(
      (store.staff_logs ?? []).some(
        (l: any) => l.action === 'grant_participation_reward'
      )
    ).toBe(true);
  });
});
