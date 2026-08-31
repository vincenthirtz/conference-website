import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { emitBotEvent } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(
    async (
      _event: string,
      _payload: Record<string, unknown>,
      _tenantId: string
    ) => ({ delivered: true, attempts: 1 })
  ),
}));
vi.mock('@/utils/botEvents', () => ({ emitBotEvent }));

import {
  store,
  resetSupabaseMock,
  setAuthListUsers,
} from './__helpers__/supabaseMock';

import {
  loadTeamRosterStates,
  renderTemplate,
  buildRosterReminder,
  classifyRoster,
  composeTeamMessages,
  sendTeamMessages,
  buildTemplateValues,
  type TeamRosterContext,
  type TeamRosterState,
} from '../../utils/teamMessages';

import cronHandler, { daysUntil } from '../../pages/api/cron/team-roster-reminders';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';

/* -----------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------*/

function team(overrides: Partial<TeamRosterState> = {}): TeamRosterState {
  return {
    teamId: 't1',
    teamName: 'Chocomates',
    slug: 'chocomates',
    discordChannelId: 'chan-1',
    discordRoleId: 'role-1',
    captainUserId: 'u1',
    starters: 4,
    substitutes: 0,
    fixtures: [],
    missingStarters: 1,
    missingBattleTags: 0,
    neverLoggedIn: 1,
    ...overrides,
  };
}

function ctx(overrides: Partial<TeamRosterContext> = {}): TeamRosterContext {
  return {
    tournamentId: TOURNAMENT,
    tournamentName: "OW WOMEN's CUP 2026",
    minPlayers: 5,
    startDate: '2026-09-18',
    deadline: '2026-08-31T21:00:00.000Z',
    teams: [],
    ...overrides,
  };
}

function seedTournament(opts: { minPlayers?: number | null } = {}) {
  store.tournaments = [
    {
      id: TOURNAMENT,
      tenant_id: TENANT,
      name: "OW WOMEN's CUP 2026",
      status: 'published',
      min_players: opts.minPlayers === undefined ? 5 : opts.minPlayers,
      start_date: '2026-09-18',
    },
  ];
}

/* -----------------------------------------------------------
 * renderTemplate
 * ---------------------------------------------------------*/

describe('renderTemplate', () => {
  it('substitue les variables connues', () => {
    const out = renderTemplate(
      'Salut {equipe}, il manque {manquants} joueuse(s) sur {minimum}.',
      buildTemplateValues(team(), ctx())
    );
    expect(out).toBe('Salut Chocomates, il manque 1 joueuse(s) sur 5.');
  });

  it('laisse VISIBLE une variable inconnue plutôt que de la vider', () => {
    // Un trou silencieux dans un message déjà posté est pire qu'une coquille
    // repérée à la relecture.
    const out = renderTemplate('{equipe} — {typo_ici}', {
      equipe: 'Chocomates',
    });
    expect(out).toBe('Chocomates — {typo_ici}');
  });
});

/* -----------------------------------------------------------
 * classifyRoster / buildRosterReminder
 * ---------------------------------------------------------*/

describe('classifyRoster', () => {
  it('incomplete quand les titulaires sont sous min_players', () => {
    expect(classifyRoster(team({ starters: 4 }), ctx())).toBe('incomplete');
  });

  it('complete_with_warnings si roster plein mais comptes dormants', () => {
    expect(
      classifyRoster(
        team({ starters: 5, missingStarters: 0, neverLoggedIn: 2 }),
        ctx()
      )
    ).toBe('complete_with_warnings');
  });

  it('complete quand tout est en règle', () => {
    expect(
      classifyRoster(
        team({ starters: 5, missingStarters: 0, neverLoggedIn: 0 }),
        ctx()
      )
    ).toBe('complete');
  });

  it('jamais incomplete si min_players non configuré', () => {
    expect(
      classifyRoster(team({ starters: 1 }), ctx({ minPlayers: 0 }))
    ).not.toBe('incomplete');
  });
});

describe('buildRosterReminder', () => {
  it('détaille le nombre de joueuses manquantes et les comptes dormants', () => {
    const msg = buildRosterReminder(team(), ctx());
    expect(msg.kind).toBe('incomplete');
    expect(msg.content).toContain('4/5');
    expect(msg.content).toContain('**1 joueuse**');
    expect(msg.content).toContain('jamais connectée');
    expect(msg.content).toContain('31 août');
    expect(msg.deliverable).toBe(true);
  });

  it("bascule sur le message 'roster complet' sans alerte", () => {
    const msg = buildRosterReminder(
      team({ starters: 5, substitutes: 2, missingStarters: 0, neverLoggedIn: 0 }),
      ctx()
    );
    expect(msg.kind).toBe('complete');
    expect(msg.content).toContain('Roster complet');
    expect(msg.content).not.toContain('Il manque');
  });

  it('préfixe la mention du rôle seulement si demandé', () => {
    expect(buildRosterReminder(team(), ctx()).content).not.toContain('<@&');
    expect(
      buildRosterReminder(team(), ctx(), { mention: true }).content
    ).toContain('<@&role-1>');
  });

  it('marque non livrable une équipe sans salon provisionné', () => {
    const msg = buildRosterReminder(
      team({ discordChannelId: null }),
      ctx()
    );
    expect(msg.deliverable).toBe(false);
  });
});

/* -----------------------------------------------------------
 * composeTeamMessages
 * ---------------------------------------------------------*/

describe('composeTeamMessages', () => {
  const full = ctx({
    teams: [
      team({ teamId: 'a', teamName: 'A', starters: 1, missingStarters: 4 }),
      team({
        teamId: 'b',
        teamName: 'B',
        starters: 5,
        missingStarters: 0,
        neverLoggedIn: 2,
      }),
      team({
        teamId: 'c',
        teamName: 'C',
        starters: 5,
        missingStarters: 0,
        neverLoggedIn: 0,
      }),
    ],
  });

  it("only='incomplete' ne garde que les rosters sous le minimum", () => {
    const out = composeTeamMessages(full, {
      preset: 'roster-reminder',
      only: 'incomplete',
    });
    expect(out.map((m) => m.team.teamName)).toEqual(['A']);
  });

  it("only='needs_attention' exclut les équipes en règle", () => {
    const out = composeTeamMessages(full, {
      preset: 'roster-reminder',
      only: 'needs_attention',
    });
    expect(out.map((m) => m.team.teamName)).toEqual(['A', 'B']);
  });

  it('teamIds restreint le ciblage', () => {
    const out = composeTeamMessages(full, {
      preset: 'roster-reminder',
      teamIds: ['c'],
    });
    expect(out.map((m) => m.team.teamName)).toEqual(['C']);
  });

  it('preset custom rend le gabarit par équipe', () => {
    const out = composeTeamMessages(full, {
      preset: 'custom',
      template: '{equipe} : {titulaires}/{minimum}',
    });
    expect(out.map((m) => m.content)).toEqual([
      'A : 1/5',
      'B : 5/5',
      'C : 5/5',
    ]);
    expect(out.every((m) => m.kind === 'custom')).toBe(true);
  });
});

/* -----------------------------------------------------------
 * sendTeamMessages
 * ---------------------------------------------------------*/

describe('sendTeamMessages', () => {
  beforeEach(() => {
    emitBotEvent.mockClear();
  });

  it('émet un event par équipe livrable et ignore les autres', async () => {
    const messages = composeTeamMessages(
      ctx({
        teams: [
          team({ teamId: 'a', teamName: 'A' }),
          team({ teamId: 'b', teamName: 'B', discordChannelId: null }),
        ],
      }),
      { preset: 'roster-reminder' }
    );

    const result = await sendTeamMessages(messages, {
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      source: 'admin',
    });

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(emitBotEvent).toHaveBeenCalledTimes(1);
    const [event, payload, tenant] = emitBotEvent.mock.calls[0];
    expect(event).toBe('team.message');
    expect(payload.channelId).toBe('chan-1');
    expect(tenant).toBe(TENANT);
    expect(result.teams.find((t) => t.teamId === 'b')?.status).toBe(
      'skipped_no_channel'
    );
  });

  it("n'autorise le ping du rôle que si le contenu porte la mention", async () => {
    const withMention = composeTeamMessages(
      ctx({ teams: [team()] }),
      { preset: 'roster-reminder', mention: true }
    );
    await sendTeamMessages(withMention, {
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      source: 'admin',
    });
    expect(emitBotEvent.mock.calls[0][1].mentionRole).toBe(true);

    emitBotEvent.mockClear();
    const silent = composeTeamMessages(ctx({ teams: [team()] }), {
      preset: 'roster-reminder',
    });
    await sendTeamMessages(silent, {
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      source: 'admin',
    });
    expect(emitBotEvent.mock.calls[0][1].mentionRole).toBe(false);
  });

  it("une équipe en échec n'interrompt pas les suivantes", async () => {
    emitBotEvent.mockRejectedValueOnce(new Error('boom'));
    const messages = composeTeamMessages(
      ctx({
        teams: [
          team({ teamId: 'a', teamName: 'A' }),
          team({ teamId: 'b', teamName: 'B', discordChannelId: 'chan-2' }),
        ],
      }),
      { preset: 'roster-reminder' }
    );

    const result = await sendTeamMessages(messages, {
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      source: 'cron',
    });

    expect(result.sent).toBe(1);
    expect(result.teams.find((t) => t.teamId === 'a')?.status).toBe('error');
    expect(result.teams.find((t) => t.teamId === 'b')?.status).toBe('sent');
  });
});

/* -----------------------------------------------------------
 * loadTeamRosterStates (avec mock Supabase)
 * ---------------------------------------------------------*/

describe('loadTeamRosterStates', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seedTournament();
    store.tournament_teams = [
      { tournament_id: TOURNAMENT, team_id: 'team-a' },
      { tournament_id: TOURNAMENT, team_id: 'team-b' },
    ];
    store.teams = [
      {
        id: 'team-a',
        name: 'Alpha',
        slug: 'alpha',
        captain_id: 'u1',
        is_active: true,
        deleted_at: null,
        discord_channel_id: 'chan-a',
        discord_role_id: 'role-a',
      },
      {
        id: 'team-b',
        name: 'Bravo',
        slug: 'bravo',
        captain_id: 'u3',
        is_active: true,
        deleted_at: null,
        discord_channel_id: null,
        discord_role_id: null,
      },
    ];
    store.team_members = [
      { team_id: 'team-a', user_id: 'u1', is_substitute: false, battle_tag: 'A#1' },
      { team_id: 'team-a', user_id: 'u2', is_substitute: false, battle_tag: null },
      { team_id: 'team-a', user_id: 'u5', is_substitute: true, battle_tag: 'E#5' },
      { team_id: 'team-b', user_id: 'u3', is_substitute: false, battle_tag: 'B#1' },
    ];
    setAuthListUsers([
      { id: 'u1', email: 'u1@x.fr', last_sign_in_at: '2026-07-01T10:00:00Z' },
      { id: 'u2', email: 'u2@x.fr', last_sign_in_at: null },
      { id: 'u3', email: 'u3@x.fr', last_sign_in_at: null },
      { id: 'u5', email: 'u5@x.fr', last_sign_in_at: null },
    ] as never);
  });

  it('compte titulaires, remplaçantes, BattleTags et comptes dormants', async () => {
    const result = await loadTeamRosterStates(TOURNAMENT, TENANT);
    expect(result).not.toBeNull();

    const alpha = result!.teams.find((t) => t.teamName === 'Alpha')!;
    expect(alpha.starters).toBe(2);
    expect(alpha.substitutes).toBe(1);
    expect(alpha.missingStarters).toBe(3);
    expect(alpha.missingBattleTags).toBe(1);
    expect(alpha.neverLoggedIn).toBe(2); // u2 + u5
    expect(alpha.discordChannelId).toBe('chan-a');
  });

  it('conserve une équipe sans salon (affichée non contactable)', async () => {
    const result = await loadTeamRosterStates(TOURNAMENT, TENANT);
    const bravo = result!.teams.find((t) => t.teamName === 'Bravo')!;
    expect(bravo.discordChannelId).toBeNull();
    expect(buildRosterReminder(bravo, result!).deliverable).toBe(false);
  });

  it("n'attend ni effectif ni BattleTag de l'encadrement (coach / manager)", async () => {
    // Une manager sans BattleTag ne doit apparaître NI dans l'effectif jouant
    // (min_players), NI dans les BattleTags manquants : le rappel Discord lui
    // réclamait un BattleTag qu'aucune règle n'exige d'elle.
    store.team_members = [
      ...store.team_members,
      {
        team_id: 'team-a',
        user_id: 'u6',
        role: 'manager',
        is_substitute: false,
        battle_tag: null,
      },
      {
        team_id: 'team-a',
        user_id: 'u7',
        role: 'coach',
        is_substitute: false,
        battle_tag: null,
      },
    ];
    const result = await loadTeamRosterStates(TOURNAMENT, TENANT);
    const alpha = result!.teams.find((t) => t.teamName === 'Alpha')!;
    expect(alpha.starters).toBe(2);
    expect(alpha.missingBattleTags).toBe(1); // u2 seule, pas u6/u7
    expect(buildRosterReminder(alpha, result!).content).toContain(
      '1 membre n’a pas'
    );
  });

  it('missingStarters = 0 quand min_players non configuré', async () => {
    seedTournament({ minPlayers: null });
    const result = await loadTeamRosterStates(TOURNAMENT, TENANT);
    expect(result!.minPlayers).toBe(0);
    expect(result!.teams.every((t) => t.missingStarters === 0)).toBe(true);
  });
});

/* -----------------------------------------------------------
 * cron : fenêtre de jalons
 * ---------------------------------------------------------*/

describe('cron team-roster-reminders', () => {
  const OLD_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    resetSupabaseMock();
    emitBotEvent.mockClear();
    process.env.CRON_SECRET = 'test-secret';
    seedTournament();
    store.tournament_teams = [{ tournament_id: TOURNAMENT, team_id: 'team-a' }];
    store.teams = [
      {
        id: 'team-a',
        name: 'Alpha',
        slug: 'alpha',
        captain_id: 'u1',
        is_active: true,
        deleted_at: null,
        discord_channel_id: 'chan-a',
        discord_role_id: 'role-a',
      },
    ];
    store.team_members = [
      { team_id: 'team-a', user_id: 'u1', is_substitute: false, battle_tag: 'A#1' },
    ];
    setAuthListUsers([
      { id: 'u1', email: 'u1@x.fr', last_sign_in_at: '2026-07-01T10:00:00Z' },
    ] as never);
  });

  afterAll(() => {
    process.env.CRON_SECRET = OLD_SECRET;
    vi.useRealTimers();
  });

  function mockRes() {
    const res: Record<string, unknown> = {};
    res.statusCode = 200;
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (payload: unknown) => {
      res.payload = payload;
      return res;
    };
    res.setHeader = () => res;
    return res as never;
  }

  it('refuse sans secret', async () => {
    const res = mockRes();
    await cronHandler(
      { method: 'POST', headers: {}, query: {} } as never,
      res
    );
    expect((res as unknown as { statusCode: number }).statusCode).toBe(401);
  });

  it("n'envoie rien hors jalon", async () => {
    // start_date 2026-09-18, pas de deadline en base → référence = start_date.
    // On se place à J-40, qui n'est pas un jalon.
    vi.setSystemTime(new Date('2026-08-09T09:00:00Z'));
    const res = mockRes();
    await cronHandler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
        query: {},
      } as never,
      res
    );
    const payload = (res as unknown as { payload: Record<string, unknown> })
      .payload;
    expect(payload.skipped).toBe('not_a_milestone');
    expect(emitBotEvent).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('envoie au jalon J-7', async () => {
    vi.setSystemTime(new Date('2026-09-11T09:00:00Z'));
    const res = mockRes();
    await cronHandler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
        query: {},
      } as never,
      res
    );
    const payload = (res as unknown as { payload: Record<string, unknown> })
      .payload;
    expect(payload.daysRemaining).toBe(7);
    expect(payload.sent).toBe(1);
    expect(emitBotEvent).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('daysUntil', () => {
  it('compte les jours calendaires UTC', () => {
    const now = Date.parse('2026-09-11T23:00:00Z');
    expect(daysUntil('2026-09-18', now)).toBe(7);
    expect(daysUntil('2026-09-11', now)).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
 * {matchs} — le calendrier PROPRE à chaque équipe
 *
 * Le tableau complet oblige chaque équipe à chercher ses lignes parmi 28. La
 * variable rend son calendrier à elle, du point de vue de la destinataire :
 * « vs untel », jamais « A – B ».
 * ------------------------------------------------------------------------- */

describe('gabarit — variable {matchs}', () => {
  const ctx: TeamRosterContext = {
    tournamentId: TOURNAMENT,
    tournamentName: "OW WOMEN's CUP 2026",
    minPlayers: 5,
    startDate: '2026-09-18',
    deadline: null,
    teams: [],
  };

  it('rend une ligne par match, dans l’ordre reçu', () => {
    const values = buildTemplateValues(
      team({
        fixtures: [
          'J1 · vendredi 18 septembre à 19:00 · vs Venom Valkyries',
          'J2 · mercredi 23 septembre à 20:30 · vs Team Positivité',
        ],
      }),
      ctx
    );
    expect(values.matchs).toBe(
      'J1 · vendredi 18 septembre à 19:00 · vs Venom Valkyries\n' +
        'J2 · mercredi 23 septembre à 20:30 · vs Team Positivité'
    );
  });

  it('rend une chaîne vide quand l’équipe n’a aucun match', () => {
    // Le gabarit doit pouvoir le dire lui-même plutôt que de recevoir un trou
    // au milieu d'une phrase.
    expect(buildTemplateValues(team({ fixtures: [] }), ctx).matchs).toBe('');
  });

  it('se substitue dans un gabarit libre', () => {
    const rendered = renderTemplate('Vos matchs :\n{matchs}', {
      matchs: 'J1 · vs Venom Valkyries',
    });
    expect(rendered).toBe('Vos matchs :\nJ1 · vs Venom Valkyries');
  });
});
