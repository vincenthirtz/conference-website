// tests/unit/playerSchemasP4.test.ts — schémas partagés joueuse (lot P4) :
// miroirs des listes métier qu'un schéma sans alias ne peut pas importer,
// sémantique des champs tolérants, et route `suggest` (colonnes explicites).

import { beforeEach, describe, expect, it } from 'vitest';
import { SCRIM_ACTIONS } from '@/utils/teams/scrimRequestActions';
import {
  MEMBER_DISPLAY_NAME_MAX,
  MEMBER_PRONOUNS_MAX,
  MEMBER_TAGLINE_MAX,
} from '@/utils/markdown/teamPublicMarkdown';
import { SCRIM_REQUEST_ACTIONS } from '@/features/player/scrims/schemas';
import {
  MEMBER_PROFILE_LIMITS,
  UpdateMemberBody,
} from '@/features/player/team/schemas';
import { UpdatePlayerProfileBody } from '@/features/player/profile/schemas';
import { TradeBlockBody } from '@/features/player/tcg/schemas';
import { TeamInvitationActionBody } from '@/features/player/invitations/schemas';
import {
  CancelDemandeBody,
  ScrimDemandeBody,
} from '@/features/player/demandes/schemas';
import { parseBody } from '@/utils/player/errors';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import suggestHandler from '../../pages/api/teams/scrim-plannings/[planningId]/suggest';

describe('miroirs des listes métier', () => {
  it('SCRIM_REQUEST_ACTIONS = SCRIM_ACTIONS', () => {
    expect([...SCRIM_REQUEST_ACTIONS]).toEqual([...SCRIM_ACTIONS]);
  });
  it('plafonds de la fiche membre = MEMBER_*_MAX', () => {
    expect(MEMBER_PROFILE_LIMITS.displayName).toBe(MEMBER_DISPLAY_NAME_MAX);
    expect(MEMBER_PROFILE_LIMITS.pronouns).toBe(MEMBER_PRONOUNS_MAX);
    expect(MEMBER_PROFILE_LIMITS.tagline).toBe(MEMBER_TAGLINE_MAX);
  });
});

describe('sémantique des schémas', () => {
  const UUID = '11111111-1111-1111-1111-111111111111';

  it('UUID au sens d’isValidUUID (sans contrainte de version)', () => {
    expect(parseBody(CancelDemandeBody, { demandeId: UUID }).ok).toBe(true);
    const r = parseBody(CancelDemandeBody, { demandeId: 'x' });
    expect(r.ok ? null : r.body.error).toBe('demandeId (UUID) requis.');
  });

  it('update-member : présence des clés conservée (null compris)', () => {
    const out = UpdateMemberBody.parse({ memberId: UUID, battle_tag: null });
    expect('battle_tag' in out).toBe(true);
    expect('role' in out).toBe(false);
  });

  it('update-profile : non-texte ignoré, texte trop long refusé', () => {
    expect(UpdatePlayerProfileBody.parse({ display_name: 5 })).toEqual({});
    const r = parseBody(UpdatePlayerProfileBody, {
      display_name: 'x'.repeat(51),
    });
    expect(r.ok ? null : r.body.error).toBe(
      'Le nom affiche ne peut pas depasser 50 caracteres.'
    );
  });

  it('blocage TCG : identifiant normalisé en minuscules', () => {
    expect(
      TradeBlockBody.parse({ userId: UUID.replace(/1/g, 'A') }).userId
    ).toBe(UUID.replace(/1/g, 'a'));
  });

  it('invitation : toute action autre que reject vaut accept', () => {
    expect(TeamInvitationActionBody.parse({}).action).toBe('accept');
    expect(TeamInvitationActionBody.parse({ action: 'zz' }).action).toBe(
      'accept'
    );
    expect(TeamInvitationActionBody.parse({ action: 'reject' }).action).toBe(
      'reject'
    );
  });
});

describe('GET /api/teams/scrim-plannings/[planningId]/suggest', () => {
  const PLANNING_ID = '550e8400-e29b-41d4-a716-4466554400a1';
  const TEAM_A = '550e8400-e29b-41d4-a716-4466554400b1';
  const TEAM_B = '550e8400-e29b-41d4-a716-4466554400b2';

  function makeRes() {
    const res: any = { statusCode: 200, body: undefined, headers: {} };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: unknown) => ((res.body = b), res);
    res.setHeader = (k: string, v: unknown) => {
      res.headers[k] = v;
    };
    return res;
  }
  let n = 0;
  const req = () => ({
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer sg-${++n}` },
    query: { planningId: PLANNING_ID },
    body: {},
  });

  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: 'cap-a', user_metadata: {} });
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;
    store.staff = [] as any;
    store.scrim_planning_availabilities = [];
    store.scrim_plannings = [
      {
        id: PLANNING_ID,
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        status: 'open',
        deleted_at: null,
        horizon_start: '2026-08-01',
        horizon_days: 1,
        slot_minutes: 60,
        day_start_min: 1200,
        day_end_min: 1320,
        timezone: 'Europe/Paris',
      },
    ] as any;
  });

  it('sans peinture passée → aucune suggestion', async () => {
    const res = makeRes();
    await suggestHandler(req() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ slots: [] });
  });

  it('session fermée → 409 PLANNING_NOT_OPEN', async () => {
    (store.scrim_plannings[0] as any).status = 'validated';
    const res = makeRes();
    await suggestHandler(req() as any, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PLANNING_NOT_OPEN');
  });
});

describe('ScrimDemandeBody — teamId absent', () => {
  // Le message brut de zod (« Invalid input: expected string, received
  // undefined », en anglais) remontait tel quel à la joueuse.
  it('rend le message historique, pas celui de zod', () => {
    const r = parseBody(ScrimDemandeBody, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.body.error).toBe('Selectionne une equipe adverse.');
      expect(r.body.code).toBe('validation');
      expect(r.body.fields?.teamId).toBe('Selectionne une equipe adverse.');
    }
  });

  it('même message pour un teamId vide ou non textuel', () => {
    for (const teamId of ['  ', 42, null]) {
      const r = ScrimDemandeBody.safeParse({ teamId });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0].message).toBe(
          'Selectionne une equipe adverse.'
        );
      }
    }
  });
});
