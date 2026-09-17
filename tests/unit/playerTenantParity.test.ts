// tests/unit/playerTenantParity.test.ts
//
// PARITÉ DU LOT 10 — « avec les données d'aujourd'hui, chaque route basculée
// résout EXACTEMENT le même espace qu'avant ».
//
// POURQUOI CE TEST EST LE PLUS IMPORTANT DU LOT. Le lot change la façon dont
// ~60 routes joueuse choisissent leur espace, à la veille d'un tournoi où il ne
// sera pas déployé : il doit être démontrablement NEUTRE tant qu'un seul espace
// est peuplé, et ne changer quelque chose que le jour où une joueuse d'un autre
// espace se présente.
//
// COMMENT.
//
//   1. Un jeu de données qui imite la production d'aujourd'hui : l'espace
//      historique peuplé (joueuse, capitaine, manager de deux équipes, joueuse
//      sans équipe), POGTV ouvert mais sans joueuse, aucun domaine propre routé.
//   2. Un ORACLE qui recalcule ce que rendait l'ancien code, route par route :
//        - `sync`  : l'ancien résolveur synchrone → toujours DEFAULT_TENANT_ID ;
//        - `async` : l'ancien résolveur asynchrone, réimplémenté ici à
//          l'identique (première ligne `team_members` DANS L'ORDRE PHYSIQUE,
//          sinon le résolveur public).
//      L'oracle ne lit pas le nouveau code : s'il le faisait, la parité serait
//      vraie par construction.
//   3. Chaque route est APPELÉE pour de vrai, pour quatre profils × quatre
//      hôtes de la plateforme, et on observe deux choses :
//        a. ce que le résolveur a rendu (espionné sans être remplacé) ;
//        b. chaque `tenant_id` que la route a ensuite FILTRÉ ou ÉCRIT en base.
//      Le point b attrape une route qui résoudrait juste puis utiliserait un
//      autre espace : c'est la parité de la route, pas seulement du résolveur.
//   4. Un TÉMOIN : les mêmes routes, avec une joueuse réellement rattachée à
//      POGTV. Là, le nouveau code DOIT diverger de l'ancien (c'est le correctif)
//      — ce qui prouve que la mesure du point 3 sait voir une divergence, et
//      qu'un test de parité vert n'est pas un test aveugle.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const { resolutions } = vi.hoisted(() => ({
  resolutions: [] as Array<{ authUserId: string | null; tenantId: string }>,
}));

// Le résolveur est ESPIONNÉ, jamais remplacé : la vraie implémentation tourne,
// on note seulement ce qu'elle rend. `utils/subject.ts` l'importe en relatif
// (`./tenant`) ; Vitest résout les deux vers le même module.
vi.mock('@/utils/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/tenant')>();
  return {
    ...actual,
    resolvePlayerTenant: async (
      ...args: Parameters<typeof actual.resolvePlayerTenant>
    ) => {
      const r = await actual.resolvePlayerTenant(...args);
      resolutions.push({
        authUserId: args[1]?.authUserId ?? null,
        tenantId: r.tenantId,
      });
      return r;
    },
    resolveTenantIdForUserRequestAsync: async (
      ...args: Parameters<typeof actual.resolveTenantIdForUserRequestAsync>
    ) => {
      const tenantId = await actual.resolveTenantIdForUserRequestAsync(...args);
      resolutions.push({ authUserId: args[1]?.authUserId ?? null, tenantId });
      return tenantId;
    },
  };
});

vi.mock('@/utils/staffLogs', () => ({ logStaffAction: async () => undefined }));

import {
  resetSupabaseMock,
  setAuthUser,
  setCookieUser,
  store,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import {
  DEFAULT_TENANT_ID,
  __resetTenantSlugCacheForTests,
  resolveTenantIdForPublicRequestAsync,
} from '../../utils/tenant';

/* -----------------------------------------------------------
 * Données « d'aujourd'hui »
 * ---------------------------------------------------------*/

const POGTV = '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a';

const PLAYER = '10000000-0000-4000-8000-000000000001';
const CAPTAIN = '10000000-0000-4000-8000-000000000002';
const MANAGER = '10000000-0000-4000-8000-000000000003';
const FREE = '10000000-0000-4000-8000-000000000004';
const OTHER_CAPTAIN = '10000000-0000-4000-8000-000000000005';

const TEAM_1 = '20000000-0000-4000-8000-000000000001';
const TEAM_2 = '20000000-0000-4000-8000-000000000002';
const MATCH_ID = '30000000-0000-4000-8000-000000000001';
const SOME_ID = '40000000-0000-4000-8000-000000000001';

function seedToday(options: { playerTenant?: string } = {}) {
  resetSupabaseMock();
  __resetTenantSlugCacheForTests();
  const playerTenant = options.playerTenant ?? DEFAULT_TENANT_ID;
  store.tenants = [
    {
      id: DEFAULT_TENANT_ID,
      slug: 'conference',
      name: 'OW Women’s Cup',
      is_active: true,
    },
    // Ouvert, sans joueuse ni domaine propre routé.
    {
      id: POGTV,
      slug: 'pogtv',
      name: 'POGTV',
      is_active: true,
      custom_domain: null,
    },
  ];
  store.teams = [
    {
      id: TEAM_1,
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Phenix',
      slug: 'phenix',
      captain_id: CAPTAIN,
    },
    {
      id: TEAM_2,
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Avoidgers',
      slug: 'avoidgers',
      captain_id: OTHER_CAPTAIN,
    },
  ];
  // Ordre PHYSIQUE volontairement différent de l'ancienneté : l'oracle
  // `async` lit la première ligne physique, le nouveau code la plus ancienne.
  // Aujourd'hui tout est dans le même espace, donc les deux coïncident.
  store.team_members = [
    {
      id: 'tm-4',
      team_id: TEAM_2,
      user_id: MANAGER,
      role: 'manager',
      tenant_id: DEFAULT_TENANT_ID,
      created_at: '2026-04-01T00:00:00Z',
    },
    {
      id: 'tm-1',
      team_id: TEAM_1,
      user_id: PLAYER,
      role: 'player',
      tenant_id: playerTenant,
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 'tm-2',
      team_id: TEAM_1,
      user_id: CAPTAIN,
      role: 'captain',
      tenant_id: DEFAULT_TENANT_ID,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'tm-3',
      team_id: TEAM_1,
      user_id: MANAGER,
      role: 'manager',
      tenant_id: DEFAULT_TENANT_ID,
      created_at: '2026-03-01T00:00:00Z',
    },
    {
      id: 'tm-5',
      team_id: TEAM_2,
      user_id: OTHER_CAPTAIN,
      role: 'captain',
      tenant_id: DEFAULT_TENANT_ID,
      created_at: '2026-01-05T00:00:00Z',
    },
  ];
  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: DEFAULT_TENANT_ID,
      team1_id: TEAM_1,
      team2_id: TEAM_2,
      status: 'pending',
    },
  ];
}

/** Quatre profils × quatre hôtes de la plateforme (aucun n'est un domaine propre). */
const PERSONAS = [
  {
    name: 'joueuse, sans ?teamId',
    userId: PLAYER,
    host: 'owwomenscup.fr',
    teamId: null,
  },
  {
    name: 'capitaine, ?teamId de son équipe',
    userId: CAPTAIN,
    host: 'www.owwomenscup.fr',
    teamId: TEAM_1,
  },
  {
    name: 'manager multi-équipe, ?teamId de la 2de',
    userId: MANAGER,
    host: 'deploy-preview-7--owwomenscup.netlify.app',
    teamId: TEAM_2,
  },
  {
    name: 'sans équipe, ?teamId étranger',
    userId: FREE,
    host: 'localhost:3000',
    teamId: TEAM_2,
  },
] as const;
type Persona = (typeof PERSONAS)[number];

/* -----------------------------------------------------------
 * L'oracle : ce que rendait l'ANCIEN code
 * ---------------------------------------------------------*/

type LegacyKind = 'sync' | 'async';

async function legacyTenant(
  kind: LegacyKind,
  req: { headers: Record<string, string>; url?: string },
  userId: string | null
): Promise<string> {
  // Ancien `resolveTenantIdForUserRequest` : arguments ignorés.
  if (kind === 'sync') return DEFAULT_TENANT_ID;
  // Ancien `resolveTenantIdForUserRequestAsync` : `.eq(user_id).limit(1)` SANS
  // ordre — la première ligne physique — puis le résolveur public.
  if (userId) {
    const first = (store.team_members as Array<Record<string, unknown>>).find(
      (r) => r.user_id === userId
    );
    if (typeof first?.tenant_id === 'string' && first.tenant_id) {
      return first.tenant_id;
    }
  }
  return resolveTenantIdForPublicRequestAsync(req);
}

/* -----------------------------------------------------------
 * Les routes
 * ---------------------------------------------------------*/

type RouteSpec = {
  /** Chemin du fichier, relatif à la racine du dépôt. */
  file: string;
  /** Résolveur qu'utilisait la route AVANT le lot 10. */
  legacy: LegacyKind;
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
};

/** Les 35 routes d'API qui utilisaient le résolveur SYNCHRONE (direct ou via withSubjectRoute par défaut). */
const SYNC_ROUTES: RouteSpec[] = [
  // — appels directs —
  {
    file: 'pages/api/player/matches/[matchId]/report-score.ts',
    legacy: 'sync',
    method: 'POST',
    query: { matchId: MATCH_ID },
    body: { team1Score: 2, team2Score: 1 },
  },
  {
    file: 'pages/api/player/messages/[conversationId].ts',
    legacy: 'sync',
    query: { conversationId: `${TEAM_1}_${TEAM_2}` },
  },
  { file: 'pages/api/player/predictions/index.ts', legacy: 'sync' },
  { file: 'pages/api/player/predictions/leaderboard.ts', legacy: 'sync' },
  {
    file: 'pages/api/player/predictions/[matchId].ts',
    legacy: 'sync',
    query: { matchId: MATCH_ID },
  },
  { file: 'pages/api/player/tcg/booster.ts', legacy: 'sync', method: 'POST' },
  { file: 'pages/api/player/tcg/collection.ts', legacy: 'sync' },
  { file: 'pages/api/player/tcg/fanart.ts', legacy: 'sync' },
  { file: 'pages/api/player/tcg/packs.ts', legacy: 'sync' },
  { file: 'pages/api/player/tcg/photo.ts', legacy: 'sync' },
  {
    file: 'pages/api/player/tcg/recycle.ts',
    legacy: 'sync',
    method: 'POST',
    body: { packId: SOME_ID, position: 0 },
  },
  { file: 'pages/api/player/tcg/sets.ts', legacy: 'sync' },
  { file: 'pages/api/player/tcg/showcase.ts', legacy: 'sync' },
  { file: 'pages/api/player/tcg/trades/cards.ts', legacy: 'sync' },
  { file: 'pages/api/player/tcg/trades/index.ts', legacy: 'sync' },
  { file: 'pages/api/player/tcg/trades/partners.ts', legacy: 'sync' },
  { file: 'pages/api/player/tcg/trades/settings.ts', legacy: 'sync' },
  {
    file: 'pages/api/player/tcg/trades/[tradeId].ts',
    legacy: 'sync',
    method: 'POST',
    query: { tradeId: SOME_ID },
    body: { action: 'decline' },
  },
  { file: 'pages/api/player/tcg/wallet.ts', legacy: 'sync' },
  { file: 'pages/api/player/update-profile.ts', legacy: 'sync' },
  {
    file: 'pages/api/teams/[teamId]/members/[memberId]/profile.ts',
    legacy: 'sync',
    method: 'PATCH',
    query: { teamId: TEAM_1, memberId: SOME_ID },
    body: {},
  },
  {
    file: 'pages/api/teams/[teamId]/public-page.ts',
    legacy: 'sync',
    method: 'PATCH',
    query: { teamId: TEAM_1 },
    body: {},
  },
  // — withSubjectRoute sans `tenantResolution: 'async'` —
  { file: 'pages/api/player/agenda.ts', legacy: 'sync' },
  { file: 'pages/api/player/dashboard.ts', legacy: 'sync' },
  {
    file: 'pages/api/player/matches/[matchId].ts',
    legacy: 'sync',
    query: { matchId: MATCH_ID },
  },
  { file: 'pages/api/player/matches.ts', legacy: 'sync' },
  { file: 'pages/api/player/messages.ts', legacy: 'sync' },
  { file: 'pages/api/player/my-teams.ts', legacy: 'sync' },
  { file: 'pages/api/player/next-match.ts', legacy: 'sync' },
  { file: 'pages/api/player/notifications.ts', legacy: 'sync' },
  { file: 'pages/api/player/tcg/welcome-gift.ts', legacy: 'sync' },
  { file: 'pages/api/admin/teams/my.ts', legacy: 'sync' },
  {
    file: 'pages/api/teams/[teamId]/members.ts',
    legacy: 'sync',
    method: 'DELETE',
    query: { teamId: TEAM_1 },
    body: { memberId: 'tm-1' },
  },
  {
    file: 'pages/api/teams/matches/[matchId]/lineup.ts',
    legacy: 'sync',
    query: { matchId: MATCH_ID },
  },
  { file: 'pages/api/teams/member-permissions.ts', legacy: 'sync' },
];

/** Routes qui utilisaient déjà l'ancien résolveur ASYNCHRONE — réécrit par le lot. */
const ASYNC_ROUTES: RouteSpec[] = [
  // — withSubjectRoute `tenantResolution: 'async'` (option supprimée) —
  ...[
    'pages/api/demandes/captain.ts',
    'pages/api/demandes/join.ts',
    'pages/api/player/invitations/index.ts',
    'pages/api/player/progression.ts',
    'pages/api/player/scrims/index.ts',
    'pages/api/player/team-health.ts',
    'pages/api/player/team-rhythm.ts',
    'pages/api/teams/invitations/index.ts',
    'pages/api/teams/invite-links/index.ts',
    'pages/api/teams/join-requests.ts',
    'pages/api/teams/scrim-plannings/index.ts',
    'pages/api/teams/scrim-requests.ts',
    'pages/api/teams/search-players.ts',
  ].map((file): RouteSpec => ({ file, legacy: 'async' })),
  // Routes d'écriture : appelées avec LEUR méthode, pour que la mesure « b »
  // voie leurs lectures et écritures scopées (un GET s'arrêterait au 405).
  {
    file: 'pages/api/teams/invitations/[invitationId].ts',
    legacy: 'async',
    method: 'DELETE',
    query: { invitationId: SOME_ID },
  },
  {
    file: 'pages/api/teams/toggle-joinable.ts',
    legacy: 'async',
    method: 'POST',
    body: { joinable: true },
  },
  {
    file: 'pages/api/teams/toggle-scrim-open.ts',
    legacy: 'async',
    method: 'POST',
    body: { open: true },
  },
  {
    file: 'pages/api/teams/transfer-captain.ts',
    legacy: 'async',
    method: 'PATCH',
    body: { newCaptainUserId: PLAYER },
  },
  {
    file: 'pages/api/teams/update-member-role.ts',
    legacy: 'async',
    method: 'PATCH',
    body: { memberId: 'tm-1', role: 'player' },
  },
  {
    file: 'pages/api/teams/update-member-specialty.ts',
    legacy: 'async',
    method: 'PATCH',
    body: { memberId: 'tm-1', specialty: null },
  },
  {
    file: 'pages/api/teams/update-member.ts',
    legacy: 'async',
    method: 'PATCH',
    body: { memberId: 'tm-1', is_substitute: false },
  },
  // — appels directs —
  {
    file: 'pages/api/demandes/cancel.ts',
    legacy: 'async',
    method: 'DELETE',
    body: { demandeId: SOME_ID },
  },
  { file: 'pages/api/demandes/caster-application.ts', legacy: 'async' },
  { file: 'pages/api/demandes/register-team.ts', legacy: 'async' },
  { file: 'pages/api/demandes/scrim.ts', legacy: 'async' },
  { file: 'pages/api/demandes/transfer.ts', legacy: 'async' },
  { file: 'pages/api/player/agenda/subscription.ts', legacy: 'async' },
  {
    file: 'pages/api/player/invitations/[demandeId].ts',
    legacy: 'async',
    method: 'POST',
    query: { demandeId: SOME_ID },
    body: { action: 'reject' },
  },
  { file: 'pages/api/player/network-status.ts', legacy: 'async' },
  {
    file: 'pages/api/player/scouting.ts',
    legacy: 'async',
    query: { team: 'avoidgers' },
  },
  {
    file: 'pages/api/player/scrims/[scrimId]/report.ts',
    legacy: 'async',
    method: 'POST',
    query: { scrimId: SOME_ID },
    body: { team1Score: 2, team2Score: 1 },
  },
  { file: 'pages/api/player/team-reviews.ts', legacy: 'async' },
  { file: 'pages/api/player/teams-directory.ts', legacy: 'async' },
  {
    file: 'pages/api/team-openings/contact.ts',
    legacy: 'async',
    query: { id: SOME_ID },
  },
  {
    file: 'pages/api/teams/add-member.ts',
    legacy: 'async',
    method: 'POST',
    body: {},
  },
  { file: 'pages/api/teams/free-players.ts', legacy: 'async' },
  {
    file: 'pages/api/teams/invite-free-player.ts',
    legacy: 'async',
    method: 'POST',
    body: { teamId: TEAM_1, authUserId: SOME_ID },
  },
  {
    file: 'pages/api/teams/leave.ts',
    legacy: 'async',
    method: 'POST',
    body: {},
  },
  {
    file: 'pages/api/teams/scrim-plannings/[planningId]/availability.ts',
    legacy: 'async',
    method: 'PUT',
    query: { planningId: SOME_ID },
    body: {},
  },
  {
    file: 'pages/api/teams/scrim-plannings/[planningId]/index.ts',
    legacy: 'async',
    query: { planningId: SOME_ID },
  },
  {
    file: 'pages/api/teams/scrim-plannings/[planningId]/suggest.ts',
    legacy: 'async',
    query: { planningId: SOME_ID },
  },
  { file: 'pages/api/teams/scrim-searches.ts', legacy: 'async' },
  { file: 'pages/api/teams/transfer-requests.ts', legacy: 'async' },
];

/* -----------------------------------------------------------
 * Exécution instrumentée d'une route
 * ---------------------------------------------------------*/

const ROOT = path.resolve(__dirname, '../..');

let bearer = 0;

type Observation = {
  status: number;
  resolved: string[];
  /** Chaque `tenant_id` filtré ou écrit après résolution, avec sa table. */
  touched: Array<{ table: string; tenantId: unknown }>;
};

function instrumentDb(touched: Observation['touched']) {
  const realFrom = supabaseAdmin.from.bind(supabaseAdmin);
  vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
    const builder = realFrom(table) as unknown as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    const wrap = (name: string, pick: (...a: unknown[]) => unknown[]) => {
      const original = builder[name].bind(builder);
      builder[name] = (...a: unknown[]) => {
        for (const tenantId of pick(...a)) touched.push({ table, tenantId });
        return original(...a);
      };
    };
    const fromPayload = (payload: unknown) =>
      (Array.isArray(payload) ? payload : [payload])
        .filter(
          (p) => p && typeof p === 'object' && 'tenant_id' in (p as object)
        )
        .map((p) => (p as { tenant_id: unknown }).tenant_id);
    wrap('eq', (col, val) => (col === 'tenant_id' ? [val] : []));
    wrap('in', (col, vals) => (col === 'tenant_id' ? (vals as unknown[]) : []));
    wrap('insert', fromPayload);
    wrap('upsert', fromPayload);
    wrap('update', fromPayload);
    return builder;
  }) as never);

  const realRpc = supabaseAdmin.rpc.bind(supabaseAdmin);
  vi.spyOn(supabaseAdmin, 'rpc').mockImplementation(((
    fn: string,
    params?: Record<string, unknown>
  ) => {
    for (const [k, v] of Object.entries(params ?? {})) {
      if (k === 'p_tenant_id' || k === 'tenant_id') {
        touched.push({ table: `rpc:${fn}`, tenantId: v });
      }
    }
    return realRpc(fn, params as never);
  }) as never);
}

function makeReq(spec: RouteSpec, persona: Persona) {
  bearer += 1;
  const query: Record<string, string> = {};
  if (persona.teamId) query.teamId = persona.teamId;
  Object.assign(query, spec.query ?? {});
  const qs = new URLSearchParams(query).toString();
  return {
    method: spec.method ?? 'GET',
    url: `/${spec.file.replace(/^pages/, '').replace(/\.tsx?$/, '')}${qs ? `?${qs}` : ''}`,
    headers: {
      host: persona.host,
      authorization: `Bearer parity-${Date.now()}-${bearer}`,
      'content-type': 'application/json',
    },
    cookies: {},
    query,
    body: spec.body ?? {},
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function makeRes() {
  const res: Record<string, unknown> & { statusCode: number } = {
    statusCode: 200,
    headers: {},
  };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = () => res;
  res.send = () => res;
  res.end = () => res;
  res.redirect = () => res;
  res.setHeader = (k: string, v: unknown) => {
    (res.headers as Record<string, unknown>)[k] = v;
    return res;
  };
  res.getHeader = () => undefined;
  res.revalidate = async () => undefined;
  return res;
}

async function runRoute(
  spec: RouteSpec,
  persona: Persona
): Promise<Observation> {
  const touched: Observation['touched'] = [];
  instrumentDb(touched);
  setAuthUser({ id: persona.userId, email: `${persona.userId}@example.test` });
  resolutions.length = 0;
  const mod = await import(path.join(ROOT, spec.file));
  const req = makeReq(spec, persona);
  const res = makeRes();
  await mod.default(req, res);
  return {
    status: res.statusCode,
    resolved: resolutions.map((r) => r.tenantId),
    touched,
  };
}

/** Par route : le plus grand nombre de `tenant_id` observés en base sur un appel. */
const scopedWrites = new Map<string, number>();

/** Écarts entre la route et l'oracle. Vide ⇔ parité. */
async function divergences(spec: RouteSpec, persona: Persona) {
  const req = makeReq(spec, persona);
  const expected = await legacyTenant(spec.legacy, req, persona.userId);
  const obs = await runRoute(spec, persona);
  scopedWrites.set(
    spec.file,
    Math.max(scopedWrites.get(spec.file) ?? 0, obs.touched.length)
  );
  const problems: string[] = [];
  if (obs.resolved.length === 0) {
    problems.push(
      `aucune résolution d'espace (statut ${obs.status}) — la requête n'atteint pas le résolveur`
    );
  }
  for (const got of obs.resolved) {
    if (got !== expected) problems.push(`résolu ${got}, attendu ${expected}`);
  }
  for (const t of obs.touched) {
    if (t.tenantId !== expected) {
      problems.push(
        `${t.table} scopé sur ${String(t.tenantId)}, attendu ${expected}`
      );
    }
  }
  return problems;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 }))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* -----------------------------------------------------------
 * 1. Parité route par route
 * ---------------------------------------------------------*/

describe.each(PERSONAS)('parité — $name', (persona) => {
  it.each(SYNC_ROUTES.map((s) => [s.file, s] as const))(
    '%s (ancien résolveur synchrone)',
    async (_file, spec) => {
      seedToday();
      expect(await divergences(spec, persona)).toEqual([]);
    }
  );

  it.each(ASYNC_ROUTES.map((s) => [s.file, s] as const))(
    '%s (ancien résolveur asynchrone)',
    async (_file, spec) => {
      seedToday();
      expect(await divergences(spec, persona)).toEqual([]);
    }
  );
});

describe('parité — page SSR /team/[slug]/edit', () => {
  it.each(PERSONAS)('$name', async (persona) => {
    seedToday();
    resolutions.length = 0;
    setCookieUser({ id: persona.userId });
    const { getServerSideProps } = await import('../../pages/team/[slug]/edit');
    const query = persona.teamId ? `?teamId=${persona.teamId}` : '';
    await getServerSideProps({
      params: { slug: 'phenix' },
      query: {},
      req: {
        headers: { host: persona.host },
        url: `/team/phenix/edit${query}`,
        cookies: {},
      },
      res: { setHeader: () => {}, getHeader: () => undefined },
      resolvedUrl: '/team/phenix/edit',
    } as never);
    expect(resolutions.map((r) => r.tenantId)).toEqual([DEFAULT_TENANT_ID]);
  });
});

/* -----------------------------------------------------------
 * 2. Le témoin : la mesure sait voir une divergence
 * ---------------------------------------------------------*/

describe('la mesure « b » n’est pas vide', () => {
  it('chaque route a effectivement filtré ou écrit un tenant_id', () => {
    // Sans ce contrôle, une parité verte pourrait venir de routes qui
    // répondent 400/404/405 juste après la résolution, sans jamais toucher la
    // base. S'appuie sur les cas de parité ci-dessus, exécutés avant dans ce
    // fichier (ordre séquentiel) : lancé seul avec `-t`, il échoue, et c'est
    // voulu — il n'a de sens qu'après eux.
    expect(scopedWrites.size).toBe(SYNC_ROUTES.length + ASYNC_ROUTES.length);
    const unscoped = [...scopedWrites.entries()]
      .filter(([, n]) => n === 0)
      .map(([file]) => file);
    expect(unscoped).toEqual([]);
  });
});

describe('témoin — une joueuse réellement rattachée à POGTV', () => {
  const player = PERSONAS[0];
  const sample = [
    SYNC_ROUTES.find((s) => s.file.endsWith('predictions/index.ts')),
    SYNC_ROUTES.find((s) => s.file.endsWith('tcg/wallet.ts')),
    SYNC_ROUTES.find((s) => s.file.endsWith('player/dashboard.ts')),
  ] as RouteSpec[];

  it.each(sample.map((s) => [s.file, s] as const))(
    '%s diverge de l’ancien code — et c’est le correctif',
    async (_file, spec) => {
      seedToday({ playerTenant: POGTV });
      const problems = await divergences(spec, player);
      // L'ancien code l'envoyait dans l'espace par défaut : la mesure DOIT le voir.
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join('\n')).toContain(`résolu ${POGTV}`);
      // … et la mesure « b » aussi : la route a bien interrogé POGTV.
      expect(problems.join('\n')).toContain(`scopé sur ${POGTV}`);
    }
  );
});

/* -----------------------------------------------------------
 * 3. Inventaire : aucune route n'échappe au test
 * ---------------------------------------------------------*/

describe('inventaire', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  }
  const sources = walk(path.join(ROOT, 'pages'))
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => ({
      rel: path.relative(ROOT, f).split(path.sep).join('/'),
      src: readFileSync(f, 'utf8'),
    }));

  it('plus aucun appel au résolveur synchrone dans pages/', () => {
    const offenders = sources
      .filter((s) => /resolveTenantIdForUserRequest\s*\(/.test(s.src))
      .map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it('plus aucune option `tenantResolution`', () => {
    expect(
      sources
        .filter((s) => s.src.includes('tenantResolution'))
        .map((s) => s.rel)
    ).toEqual([]);
  });

  it('chaque route API qui résout l’espace joueuse est couverte par la parité', () => {
    const covered = new Set(
      [...SYNC_ROUTES, ...ASYNC_ROUTES].map((s) => s.file)
    );
    // Hors harnais, avec la raison :
    const excluded: Record<string, string> = {
      // Callback OAuth Battle.net : état signé + échange de jeton. Le crédit
      // TCG passe l'`authUserId` au même résolveur (vérifié ci-dessous).
      'pages/api/auth/battlenet/callback.ts': 'oauth',
      // Liaison Discord : appel SANS joueuse (inchangé) → domaine ou défaut.
      'pages/api/auth/link-discord.ts': 'sans joueuse',
      // Route staff (withStaffRoute) : l'espace du staff n'est pas celui d'une
      // joueuse ; appel inchangé, mêmes données.
      'pages/api/admin/free-players/index.ts': 'staff',
    };
    const resolving = sources
      .filter(
        (s) =>
          s.rel.startsWith('pages/api/') &&
          (/resolveTenantIdForUserRequestAsync\s*\(/.test(s.src) ||
            /withSubjectRoute\s*\(/.test(s.src))
      )
      .map((s) => s.rel)
      .filter((rel) => !(rel in excluded));
    expect(resolving.filter((rel) => !covered.has(rel))).toEqual([]);
  });

  it('le callback Battle.net résout l’espace de la joueuse, pas le défaut', () => {
    const src = sources.find(
      (s) => s.rel === 'pages/api/auth/battlenet/callback.ts'
    )?.src;
    expect(src).toMatch(
      /resolveTenantIdForUserRequestAsync\(req, \{\s*authUserId: userId,?\s*\}\)/
    );
  });
});
