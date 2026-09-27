// Tests du mode « inscription individuelle » (`tournaments.solo_mode`).
//
// Le drapeau ne change rien au modèle de données : une participante solo reste
// représentée par une équipe d'UNE joueuse, et tout l'aval (phases, lobbies
// FFA, classement) continue de raisonner en équipes. Ce que le drapeau change,
// c'est ce qui NE DOIT PAS arriver — et qui, autrement, n'aurait aucune trace
// visible en base :
//
//   1. Aucun `team.created` n'est émis. Sans cette coupure, le bot provisionne
//      un rôle Discord + un salon vocal + un salon texte PAR INSCRITE. Trente
//      participantes = trente rôles et soixante salons. Rien dans les données
//      ne signalerait l'erreur : elle ne se verrait que sur le serveur.
//   2. Le tournoi solo continue d'inscrire normalement. Une coupure trop large
//      (« on saute la fin du handler ») passerait ce test-ci et casserait
//      l'inscription — d'où l'assertion sur `tournament` dans le même test.
//
// La création côté admin est couverte à part : `solo_mode` ET `min_players`
// étaient absents du payload inséré, donc silencieusement perdus à la création
// (même piège que la whitelist de `tenant_discord_config`).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  sendTeamJoinEmail,
  sendWelcomeEmail,
  sendTeamAccessEmail,
  sendTeamInviteLinkEmail,
} = vi.hoisted(() => ({
  sendTeamJoinEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => ({ success: true as const })),
  sendTeamAccessEmail: vi.fn(async () => ({ success: true as const })),
  sendTeamInviteLinkEmail: vi.fn(async () => ({ success: true as const })),
}));
vi.mock('@/utils/email', () => ({
  sendTeamJoinEmail,
  sendWelcomeEmail,
  sendTeamAccessEmail,
  sendTeamInviteLinkEmail,
}));

const { emitBotEvent } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));
vi.mock('@/utils/botEvents', () => ({ emitBotEvent }));

import {
  store,
  resetSupabaseMock,
  setAuthListUsers,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';

import createWithMemberHandler from '../../pages/api/teams/create-with-member';
import adminTournamentsHandler from '../../pages/api/admin/tournaments/index';
import { generateChallenge } from '../../utils/captcha';

/* -----------------------------------------------------------
 * Helpers req/res + captcha (même pattern que teamCreateAsManager)
 * ---------------------------------------------------------*/

function solveQuestion(question: string): number {
  const m = question.match(/^(\d+)\s+([+\-×])\s+(\d+)$/);
  if (!m) throw new Error(`question inattendue : ${question}`);
  const a = Number(m[1]);
  const b = Number(m[3]);
  if (m[2] === '+') return a + b;
  if (m[2] === '-') return a - b;
  return a * b;
}

async function validCaptcha() {
  const challenge = await generateChallenge();
  if (!challenge) throw new Error('captcha indisponible');
  return {
    captchaToken: challenge.token,
    captchaAnswer: String(solveQuestion(challenge.question)),
  };
}

async function makeReq(over: Partial<any> = {}): Promise<any> {
  const { body: overBody, ...rest } = over;
  return {
    method: 'POST',
    headers: { host: 'h' },
    query: {},
    ...rest,
    body: { ...(await validCaptcha()), ...(overBody ?? {}) },
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
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

/** Le payload que poste le formulaire solo : un roster d'une joueuse. */
function soloBody(tournamentId: string) {
  return {
    name: 'Sorcière',
    tournament_id: tournamentId,
    members: [
      {
        email: 'solo@example.com',
        role: 'player',
        battle_tag: 'Sorciere#1234',
        set_captain: true,
      },
    ],
  };
}

/** Tenant + staff : les routes admin passent par `withStaffRoute`. */
const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAFF_ID = 'staff-solo';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  emitBotEvent.mockClear();
  store.teams = [];
  store.team_members = [];
  store.demandes = [];
  store.tournament_teams = [];
  store.stage_teams = [];
  store.tournament_stages = [];
  setAuthListUsers([{ id: 'u-solo', email: 'solo@example.com' }]);
  setAuthUser({ id: 'user-staff' });
  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: 'user-staff',
      email: 'staff@example.com',
      role: 'admin',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    { id: TENANT, slug: 'conf', name: 'Conf', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
});

/* -----------------------------------------------------------
 * 1) Inscription individuelle : pas de provisionnement Discord
 * ---------------------------------------------------------*/

describe('POST /api/teams/create-with-member — tournoi en inscription individuelle', () => {
  it("n'émet aucun team.created, mais inscrit bien la participante", async () => {
    store.tournaments = [
      {
        id: 'tour-solo',
        name: 'Nuit d’Halloween',
        status: 'published',
        min_players: 1,
        solo_mode: true,
      },
    ] as any;
    // L'inscription directe insère dans `stage_teams`, une ligne par phase :
    // sans phase, le handler n'a nulle part où inscrire et rend 201 sans
    // `tournament`. La phase FFA est justement celle d'un événement solo.
    store.tournament_stages = [
      { id: 'stage-ffa', tournament_id: 'tour-solo', stage_type: 'ffa' },
    ] as any;

    const res = makeRes();
    await createWithMemberHandler(
      await makeReq({ body: soloBody('tour-solo') }),
      res
    );

    expect(res.statusCode).toBe(201);

    // La tique n'est PAS cosmétique : l'émission part d'une IIFE asynchrone
    // qui attend d'abord la résolution du Discord du créateur. Sans laisser
    // passer les microtasks, ce test resterait vert même si la garde
    // disparaissait — il constaterait seulement qu'on n'a pas encore émis.
    await new Promise((r) => setTimeout(r, 0));

    // Le cœur du test : rien n'est annoncé au bot, donc aucun rôle ni salon.
    const created = emitBotEvent.mock.calls.filter(
      (c: unknown[]) => c[0] === 'team.created'
    );
    expect(created).toHaveLength(0);

    // …et pour autant l'inscription a bien eu lieu : la coupure ne doit pas
    // avoir emporté la fin du handler avec elle.
    expect((res.body as any).tournament).toMatchObject({
      tournament_name: 'Nuit d’Halloween',
    });

    // La représentation reste une équipe d'une joueuse, qui porte son pseudo.
    const teams = (store.teams as any[]) ?? [];
    expect(teams).toHaveLength(1);
    expect(teams[0].name).toBe('Sorcière');
    const members = (store.team_members as any[]) ?? [];
    expect(members).toHaveLength(1);
    expect(members[0].user_id).toBe('u-solo');
    expect(members[0].role).toBe('player');
  });

  it('émet team.created quand le même tournoi n’est PAS en solo', async () => {
    store.tournaments = [
      {
        id: 'tour-team',
        name: 'Cup',
        status: 'published',
        min_players: 1,
        solo_mode: false,
      },
    ] as any;

    const res = makeRes();
    await createWithMemberHandler(
      await makeReq({ body: soloBody('tour-team') }),
      res
    );

    expect(res.statusCode).toBe(201);
    // L'émission est asynchrone (void d'une IIFE) : on laisse la microtask
    // s'exécuter avant d'observer.
    await new Promise((r) => setTimeout(r, 0));
    const created = emitBotEvent.mock.calls.filter(
      (c: unknown[]) => c[0] === 'team.created'
    );
    expect(created).toHaveLength(1);
  });

  it('émet team.created hors de tout tournoi (création d’équipe ordinaire)', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      await makeReq({
        body: {
          name: 'Team Libre',
          members: [
            {
              email: 'solo@example.com',
              role: 'player',
              battle_tag: 'Sorciere#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    await new Promise((r) => setTimeout(r, 0));
    expect(
      emitBotEvent.mock.calls.filter((c: unknown[]) => c[0] === 'team.created')
    ).toHaveLength(1);
  });
});

/* -----------------------------------------------------------
 * 2) Création admin : solo_mode et min_players atteignent la base
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournaments — champs d’inscription', () => {
  function adminReq(body: Record<string, unknown>): any {
    return {
      method: 'POST',
      headers: { host: 'h', authorization: 'Bearer t' },
      cookies: {},
      query: {},
      body,
    };
  }

  it('persiste solo_mode et min_players (tous deux perdus auparavant)', async () => {
    store.tournaments = [];
    const res = makeRes();
    await adminTournamentsHandler(
      adminReq({
        name: 'Nuit d’Halloween',
        status: 'published',
        min_players: 1,
        solo_mode: true,
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const row = (store.tournaments as any[])[0];
    expect(row.solo_mode).toBe(true);
    expect(row.min_players).toBe(1);
  });

  it('solo_mode vaut false par défaut, et n’accepte pas une valeur bancale', async () => {
    store.tournaments = [];
    const res = makeRes();
    await adminTournamentsHandler(
      adminReq({ name: 'Cup par équipes', solo_mode: 'oui' }),
      res
    );

    expect(res.statusCode).toBe(201);
    // `'oui'` n'est pas `true` : une chaîne non vide ne doit pas basculer le
    // tournoi en solo par la seule grâce de la véracité JavaScript.
    expect((store.tournaments as any[])[0].solo_mode).toBe(false);
  });

  it('persiste TOUS les champs du formulaire, pas seulement les connus', async () => {
    // Le formulaire envoyait `format_type`, `is_public`, `is_featured`,
    // `logo_url` et `banner_url` depuis toujours ; l'endpoint les jetait sans
    // un mot, et il fallait rouvrir le tournoi en édition pour qu'ils
    // prennent. Une whitelist silencieuse ne se voit que si on l'assère.
    store.tournaments = [];
    const res = makeRes();
    await adminTournamentsHandler(
      adminReq({
        name: 'Cup complète',
        format_type: 'swiss',
        max_players: 7,
        is_public: true,
        is_featured: true,
        logo_url: 'https://example.test/logo.png',
        banner_url: 'https://example.test/banner.png',
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const row = (store.tournaments as any[])[0];
    expect(row.format_type).toBe('swiss');
    expect(row.max_players).toBe(7);
    expect(row.is_featured).toBe(true);
    expect(row.logo_url).toBe('https://example.test/logo.png');
    expect(row.banner_url).toBe('https://example.test/banner.png');
    // `is_public` → `visibility` : MÊME correspondance que le PATCH, pas une
    // seconde convention. Un tournoi créé public doit l'être aussi à la
    // relecture, sinon l'écran d'édition contredit celui de création.
    expect(row.visibility).toBe('public');
  });

  it('ne publie RIEN par omission', async () => {
    store.tournaments = [];
    const res = makeRes();
    await adminTournamentsHandler(adminReq({ name: 'Brouillon' }), res);

    expect(res.statusCode).toBe(201);
    const row = (store.tournaments as any[])[0];
    expect(row.visibility).toBe('private');
    expect(row.is_featured).toBe(false);
  });

  it('refuse un max_players non entier, comme le PATCH', async () => {
    store.tournaments = [];
    const res = makeRes();
    await adminTournamentsHandler(
      adminReq({ name: 'Cup', max_players: 2.5 }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((store.tournaments as any[]) ?? []).toHaveLength(0);
  });

  it('refuse un min_players non entier plutôt que de l’ignorer', async () => {
    store.tournaments = [];
    const res = makeRes();
    await adminTournamentsHandler(
      adminReq({ name: 'Cup', min_players: 0 }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((store.tournaments as any[]) ?? []).toHaveLength(0);
  });
});
