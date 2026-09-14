// Unit tests — aiguillage des jetons d'invitation sur /api/invitations/[token].
//
// LA GARDE QUI MANQUAIT.
//
// Le site émet trois familles de jetons (espace staff, invitation d'équipe
// nominative, lien d'équipe partageable) pour DEUX pages publiques, et deux de
// ces familles produisent la même URL `/invitation/<token>`. Le 2026-09-04, la
// page a été réécrite pour la famille « espace » : tous les liens d'équipe ont
// commencé à répondre « Invitation introuvable » — sans qu'aucun test ne bouge.
//
// Pourquoi rien n'a bougé : chaque handler était testé ISOLÉMENT (teamInviteLink
// .test.ts exerce `by-token` en l'important en direct), et
// teamCreateAsManager.test.ts vérifiait même que l'URL contient `/invitation/`
// — sans jamais vérifier que quelqu'un sait la résoudre. Une URL et son
// résolveur étaient testés séparément, donc le lien entre les deux ne l'était
// pas du tout.
//
// Ce fichier teste précisément ce lien : pour CHAQUE famille, le jeton présenté
// à la route publique doit être reconnu comme tel. Un futur lot qui reprendrait
// la route pour une seule famille casserait ici, et non en production.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
  rosterLockErrorMessage: () => 'Roster verrouillé',
}));

import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import handler from '../../pages/api/invitations/[token]';
import { buildInviteUrl, buildJoinUrl } from '../../utils/teams/inviteLinks';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INVITEE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const sha256 = (v: string) =>
  crypto.createHash('sha256').update(v).digest('hex');

/** Jeton d'équipe RÉALISTE : 32 octets base64url → 43 caractères. */
const teamToken = () => crypto.randomBytes(32).toString('base64url');
/** Jeton d'espace RÉALISTE : 32 octets hex → 64 caractères. */
const tenantToken = () => crypto.randomBytes(32).toString('hex');

const inFuture = () =>
  new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

function mockRes() {
  const res: Record<string, unknown> = {};
  res.statusCode = 200;
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  res.setHeader = vi.fn(() => res);
  return res as {
    statusCode: number;
    body: Record<string, unknown>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
  };
}

async function get(token: string) {
  const res = mockRes();
  await handler(
    { method: 'GET', query: { token }, headers: {} } as never,
    res as never
  );
  return res;
}

function seedTeamInvitation(token: string) {
  store.demandes = [
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      type: 'invite',
      status: 'pending',
      user_id: INVITEE_ID,
      team_id: TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      source: 'website',
      payload: {
        invite_token_hash: sha256(token),
        invite_email: 'invitee@example.com',
        desired_role: 'substitute',
        expires_at: inFuture(),
      },
    },
  ];
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Team Positivité',
      slug: 'team-positivite',
      logo_url: null,
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ];
}

function seedTenantInvitation(token: string) {
  store.tenant_invitations = [
    {
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      tenant_id: CONFERENCE_TENANT_ID,
      email: 'staff@example.com',
      role: 'admin',
      token_hash: sha256(token),
      expires_at: inFuture(),
      accepted_at: null,
      revoked_at: null,
    },
  ];
  store.tenants = [
    { id: CONFERENCE_TENANT_ID, name: 'Women’s Cup', slug: 'conference' },
  ];
}

function seedJoinLink(token: string) {
  store.team_invite_links = [
    {
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ID,
      token_hash: sha256(token),
      role: 'player',
      expires_at: inFuture(),
      max_uses: null,
      uses_count: 0,
      revoked_at: null,
    },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('GET /api/invitations/[token] — aiguillage par famille', () => {
  it("reconnaît une invitation d'ÉQUIPE (la régression du 2026-09-04)", async () => {
    const token = teamToken();
    seedTeamInvitation(token);

    const res = await get(token);

    // AVANT le correctif : 404 UNKNOWN_INVITATION, parce que la route ne
    // regardait que `tenant_invitations`.
    expect(res.statusCode).toBe(200);
    expect(res.body.kind).toBe('team');
    expect((res.body.invitation as Record<string, unknown>).team_name).toBe(
      'Team Positivité'
    );
  });

  it("reconnaît une invitation d'ESPACE", async () => {
    const token = tenantToken();
    seedTenantInvitation(token);

    const res = await get(token);

    expect(res.statusCode).toBe(200);
    expect(res.body.kind).toBe('tenant');
    expect(res.body.status).toBe('pending');
  });

  it('renvoie un lien d’équipe PARTAGEABLE vers /rejoindre au lieu de le nier', async () => {
    const token = teamToken();
    seedJoinLink(token);

    const res = await get(token);

    expect(res.statusCode).toBe(200);
    expect(res.body.kind).toBe('join-link');
    expect(res.body.redirectTo).toBe(`/rejoindre/${encodeURIComponent(token)}`);
  });

  it('reste un lien PARTAGEABLE même après avoir servi une fois', async () => {
    // LE CAS QUE LA PREMIÈRE VERSION DE CE FICHIER MANQUAIT, et par lequel le
    // résolveur se trompait : les familles ne s'excluent pas toutes. Rejoindre
    // par un lien partageable crée une demande qui range le hash du MÊME jeton
    // dans `payload.invite_token_hash` (cf. /api/teams/invite-links/by-token).
    // Le jeton vit alors dans les deux tables.
    //
    // En classant `demandes` d'abord, `/invitation/<jeton>` répondait « cette
    // invitation est déjà approved » sur un lien d'équipe parfaitement vivant,
    // au lieu de renvoyer vers la page qui sait le servir.
    const token = teamToken();
    seedJoinLink(token);
    seedTeamInvitation(token);
    // La demande née de cet usage n'est plus `pending` : c'est l'état réel
    // après une inscription réussie.
    (store.demandes as Array<Record<string, unknown>>)[0].status = 'approved';

    const res = await get(token);

    expect(res.statusCode).toBe(200);
    expect(res.body.kind).toBe('join-link');
    expect(res.body.redirectTo).toBe(`/rejoindre/${encodeURIComponent(token)}`);
  });

  it('reste un 404 sec pour un jeton qui n’existe nulle part', async () => {
    const res = await get(teamToken());

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('UNKNOWN_INVITATION');
  });

  it("n'écarte plus un jeton d'équipe sur sa LONGUEUR", async () => {
    // L'ancien garde (`token.length < 32`) était calibré sur le seul format
    // d'espace (64 hex) ; un jeton d'équipe fait 43 caractères. Il passait de
    // justesse — mais le garde restait un refus de forme sur un jeton valide,
    // et il aurait rejeté tout format plus court introduit ensuite.
    const token = teamToken();
    expect(token.length).toBe(43);
    seedTeamInvitation(token);

    const res = await get(token);

    expect(res.statusCode).not.toBe(400);
  });
});

describe('anti-dérive : toute URL émise a un résolveur', () => {
  // Le pendant du `sceneTypeWiring.test.js` du repo caster : on ne teste pas
  // qu'une chaîne est bien formée, on teste que la page qu'elle désigne sait
  // lire la famille de jeton qu'elle transporte.
  const FAMILIES = [
    {
      name: 'invitation d’équipe (nominative)',
      buildUrl: buildInviteUrl,
      path: '/invitation/',
      seed: seedTeamInvitation,
      expectedKind: 'team',
    },
    {
      name: 'lien d’équipe partageable',
      buildUrl: buildJoinUrl,
      path: '/rejoindre/',
      seed: seedJoinLink,
      // Servi par sa propre page, mais la route publique doit savoir l'y
      // renvoyer plutôt que répondre « introuvable ».
      expectedKind: 'join-link',
    },
  ] as const;

  for (const family of FAMILIES) {
    it(`${family.name} : l'URL pointe où on croit, et le jeton y est résolu`, async () => {
      const token = teamToken();
      expect(family.buildUrl(token)).toContain(family.path);

      family.seed(token);
      const res = await get(token);

      expect(res.statusCode).toBe(200);
      expect(res.body.kind).toBe(family.expectedKind);
    });
  }

  it('buildInviteUrl ne produit pas de double slash si SITE_URL en a un', () => {
    // `NEXT_PUBLIC_SITE_URL=https://owwomenscup.fr/` produisait
    // `https://owwomenscup.fr//invitation/<token>`.
    expect(buildInviteUrl('abc')).not.toContain('//invitation/');
    expect(buildJoinUrl('abc')).not.toContain('//rejoindre/');
  });
});
