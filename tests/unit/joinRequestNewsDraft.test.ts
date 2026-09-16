// tests/unit/joinRequestNewsDraft.test.ts
//
// Accepter une candidature crée une actu « <prénom> rejoint <équipe> ». Elle
// naissait PUBLIÉE : prénom de la joueuse en ligne, indexable, repris par le
// sitemap, avant même qu'elle soit prévenue de son acceptation. Ce fichier
// verrouille qu'elle naît en BROUILLON — le staff publie s'il y a lieu.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
} from './__helpers__/supabaseMock';

import joinRequestsHandler from '../../pages/api/teams/join-requests';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const DEMANDE = '550e8400-e29b-41d4-a716-446655440000';

let _tok = 0;
function makeReq(body: Record<string, unknown>): any {
  _tok += 1;
  return {
    method: 'POST',
    headers: {
      host: 'h',
      authorization: `Bearer jr-draft-${Date.now()}-${_tok}`,
    },
    query: {},
    body,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: 'captain-1' });
  store.teams = [
    {
      id: 'team-1',
      tenant_id: TENANT,
      captain_id: 'captain-1',
      is_active: true,
      name: 'Alpha',
      logo_url: null,
    },
  ] as any;
  store.team_members = [];
  store.tournament_teams = [];
  store.demandes = [
    {
      id: DEMANDE,
      team_id: 'team-1',
      type: 'join',
      status: 'pending',
      user_id: 'new-player',
      payload: { desired_role: 'player', user_battle_tag: 'Camille#1234' },
    },
  ] as any;
  store.news = [];
  setRpcResult('approve_join_request', {
    data: { id: 'tm-new', team_id: 'team-1', user_id: 'new-player' },
    error: null,
  });
});

describe('POST /api/teams/join-requests approve — actu automatique', () => {
  it('crée un BROUILLON, jamais une actu publiée', async () => {
    const res = makeRes();
    await joinRequestsHandler(
      makeReq({ demandeId: DEMANDE, action: 'approve' }),
      res
    );

    expect(res.statusCode).toBe(200);
    const news = store.news as any[];
    expect(news).toHaveLength(1);
    expect(news[0].status).toBe('draft');
    // Pas de date de publication : c'est la publication par le staff qui la
    // pose. Une date ici ferait passer le brouillon pour déjà paru.
    expect(news[0].published_at).toBeNull();
    expect(news.some((n) => n.status === 'published')).toBe(false);
  });
});
