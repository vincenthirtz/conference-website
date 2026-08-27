// tests/unit/teamRegistrationStatus.test.ts
//
// `GET /api/demandes/register-team` → `status` : la photo que lit la carte
// « Inscription au tournoi » de l'espace équipe
// (components/player/TeamRegistrationCard.tsx).
//
// Ce qu'on protège ici, c'est l'impasse que la carte ferme : l'inscription
// automatique de `/api/teams/create-with-member` est best-effort, le wizard
// renvoie vers l'espace équipe pour « réessayer », et l'espace n'avait aucune
// lecture de l'état d'inscription — donc aucun bouton. Les cas ci-dessous
// couvrent les états dont dépend l'affichage de ce bouton.
//
// Invariant le plus important : `canSubmit` doit refléter EXACTEMENT ce que le
// POST accepte. Une carte qui annonce « prête » suivie d'un refus au POST
// (ou l'inverse) est la même impasse sous un autre nom — d'où le test qui
// enchaîne GET puis POST.

import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock, setAuthUser } from './__helpers__/supabaseMock';
import { DEFAULT_CURRENT_TOURNAMENT_ID } from '../../utils/currentTournament';
import registerTeamHandler from '../../pages/api/demandes/register-team';
import type { TeamRegistrationStatus } from '../../pages/api/demandes/register-team';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_MANAGER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STRANGER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

let _tokenCounter = 0;
function makeAuthedReq(over: Partial<any> = {}): any {
  _tokenCounter += 1;
  return {
    method: 'GET',
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${_tokenCounter}`,
    },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Roster de `size` membres jouants, tous rattachés à l'équipe. */
function seedRoster(size: number) {
  store.team_members = Array.from({ length: size }, (_, i) => ({
    id: `tm-${i}`,
    team_id: TEAM_ID,
    user_id: `player-${i}`,
    role: i === 0 ? 'manager' : 'player',
  })) as any;
}

function seedBase({ minPlayers = 5, maxTeams = 8, status = 'published' } = {}) {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Shujaa',
      captain_id: CAPTAIN_ID,
      is_active: true,
    },
  ] as any;
  store.tournaments = [
    {
      id: DEFAULT_CURRENT_TOURNAMENT_ID,
      name: 'Cup 2026',
      status,
      max_teams: maxTeams,
      min_players: minPlayers,
      registration_fields: [],
    },
  ] as any;
  store.tournament_teams = [] as any;
  store.demandes = [] as any;
  seedRoster(6);
}

async function getStatus(): Promise<TeamRegistrationStatus> {
  const res = makeRes();
  await registerTeamHandler(makeAuthedReq({ method: 'GET' }), res);
  expect(res.statusCode).toBe(200);
  return (res.body as any).status as TeamRegistrationStatus;
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: CAPTAIN_ID });
});

describe('GET /api/demandes/register-team → status', () => {
  it('annonce canSubmit quand tout est en règle', async () => {
    seedBase();
    const status = await getStatus();

    expect(status.team).toEqual({ id: TEAM_ID, name: 'Shujaa' });
    expect(status.tournament?.id).toBe(DEFAULT_CURRENT_TOURNAMENT_ID);
    expect(status.registered).toBe(false);
    expect(status.blockers).toEqual([]);
    expect(status.canSubmit).toBe(true);
  });

  it('un roster incomplet AVERTIT mais ne bloque pas la candidature', async () => {
    // Décision produit 2026-08-27 : `min_players` reste la règle de complétude
    // (inscription auto directe, relances, validation staff) mais n'interdit
    // plus de se déclarer. La carte affiche l'écart et garde le bouton.
    seedBase({ minPlayers: 5 });
    seedRoster(2);

    const status = await getStatus();

    expect(status.blockers).toEqual([]);
    expect(status.canSubmit).toBe(true);
    expect(status.rosterShortfall).toBe(3);
    expect(status.minPlayers).toBe(5);
    expect(status.playerCount).toBe(2);
  });

  it('rosterShortfall vaut 0 quand le roster est complet', async () => {
    seedBase({ minPlayers: 5 });
    seedRoster(6);

    const status = await getStatus();

    expect(status.rosterShortfall).toBe(0);
    expect(status.canSubmit).toBe(true);
  });

  it('signale le tournoi complet', async () => {
    seedBase({ maxTeams: 2 });
    store.tournament_teams = [
      { id: 'r1', tournament_id: DEFAULT_CURRENT_TOURNAMENT_ID, team_id: 'x' },
      { id: 'r2', tournament_id: DEFAULT_CURRENT_TOURNAMENT_ID, team_id: 'y' },
    ] as any;

    const status = await getStatus();

    expect(status.blockers).toContain('tournament_full');
    expect(status.registeredTeams).toBe(2);
    expect(status.canSubmit).toBe(false);
  });

  it('signale les inscriptions fermées', async () => {
    seedBase({ status: 'draft' });
    const status = await getStatus();
    expect(status.blockers).toContain('not_open');
    expect(status.canSubmit).toBe(false);
  });

  it('voit l’équipe déjà inscrite', async () => {
    seedBase();
    store.tournament_teams = [
      {
        id: 'r1',
        tournament_id: DEFAULT_CURRENT_TOURNAMENT_ID,
        team_id: TEAM_ID,
      },
    ] as any;

    const status = await getStatus();

    expect(status.registered).toBe(true);
    expect(status.blockers).toContain('already_registered');
    expect(status.canSubmit).toBe(false);
  });

  it('voit une candidature en attente déposée par QUELQU’UN D’AUTRE de l’équipe', async () => {
    seedBase();
    store.demandes = [
      {
        id: 'demande-1',
        // Déposée par l'autre encadrant : la liste `demandes` (scopée à
        // l'appelant) ne la montre pas, mais la carte doit quand même savoir
        // qu'une candidature existe — sinon elle propose de la doubler.
        user_id: OTHER_MANAGER_ID,
        team_id: TEAM_ID,
        tournament_id: DEFAULT_CURRENT_TOURNAMENT_ID,
        type: 'team_registration',
        status: 'pending',
        created_at: '2026-08-26T22:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await registerTeamHandler(makeAuthedReq({ method: 'GET' }), res);
    const body = res.body as any;

    expect(body.demandes).toEqual([]);
    expect(body.status.pendingDemandeId).toBe('demande-1');
    expect(body.status.blockers).toContain('pending_request');
    expect(body.status.canSubmit).toBe(false);
  });

  it('remonte la dernière candidature refusée sans bloquer une nouvelle', async () => {
    seedBase();
    store.demandes = [
      {
        id: 'demande-old',
        user_id: CAPTAIN_ID,
        team_id: TEAM_ID,
        tournament_id: DEFAULT_CURRENT_TOURNAMENT_ID,
        type: 'team_registration',
        status: 'rejected',
        created_at: '2026-08-20T10:00:00.000Z',
      },
    ] as any;

    const status = await getStatus();

    expect(status.lastDemande?.id).toBe('demande-old');
    expect(status.lastDemande?.status).toBe('rejected');
    expect(status.pendingDemandeId).toBeNull();
    expect(status.canSubmit).toBe(true);
  });

  it('rend une photo vide pour qui ne gère aucune équipe', async () => {
    seedBase();
    setAuthUser({ id: STRANGER_ID });

    const status = await getStatus();

    expect(status.team).toBeNull();
    expect(status.tournament).toBeNull();
    expect(status.canSubmit).toBe(false);
  });

  it('canSubmit=true est tenu par le POST (même décompte des deux côtés)', async () => {
    seedBase();
    const status = await getStatus();
    expect(status.canSubmit).toBe(true);

    const res = makeRes();
    await registerTeamHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          teamId: status.team!.id,
          tournamentId: status.tournament!.id,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
  });

  it('canSubmit=true sur roster incomplet est AUSSI tenu par le POST', async () => {
    // L'invariant « GET et POST tranchent pareil » reste le point sensible :
    // c'est lui qui empêche la carte d'annoncer un bouton que le serveur
    // refuse. Il vaut donc dans les deux sens, y compris depuis l'assouplissement.
    seedBase({ minPlayers: 5 });
    seedRoster(2);
    const status = await getStatus();
    expect(status.canSubmit).toBe(true);
    expect(status.rosterShortfall).toBe(3);

    const res = makeRes();
    await registerTeamHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          teamId: TEAM_ID,
          tournamentId: DEFAULT_CURRENT_TOURNAMENT_ID,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
  });

  it('un tournoi complet, lui, bloque toujours (candidater ne libère pas de place)', async () => {
    seedBase({ maxTeams: 1 });
    store.tournament_teams = [
      { id: 'r1', tournament_id: DEFAULT_CURRENT_TOURNAMENT_ID, team_id: 'x' },
    ] as any;
    const status = await getStatus();
    expect(status.canSubmit).toBe(false);

    const res = makeRes();
    await registerTeamHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          teamId: TEAM_ID,
          tournamentId: DEFAULT_CURRENT_TOURNAMENT_ID,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
  });
});
