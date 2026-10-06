// tests/unit/adminOptimisticLock.test.ts — verrou optimiste des fiches
// tournoi / équipe / actualité (lot A2), même motif que l'édition de match.
//
// Pour chaque fiche : version périmée → 409 `conflict` / `stale_update`, rien
// d'écrit ; version à jour → écrit ; champ absent → écrit (rétro-compatible).

import { describe, it, expect, beforeEach } from 'vitest';
import { store, supabaseAdmin } from './__helpers__/supabaseMock';
import type { ServiceContext } from '../../utils/admin/serviceContext';
import { ConflictError } from '../../utils/admin/errors';
import {
  STALE_UPDATE_REASON,
  assertFreshVersion,
  isStaleUpdateError,
} from '../../features/admin/_shared/optimisticLock';
import { patchTournament } from '../../features/admin/tournaments/service/tournaments';
import { updateTeam } from '../../features/admin/teams/service/teams';
import { updateNews } from '../../features/admin/news/service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOURN = '33333333-3333-4333-8333-333333333333';
const TEAM = '11111111-1111-4111-8111-111111111111';
const NEWS = '22222222-2222-4222-8222-222222222222';
const V1 = '2026-04-01T10:00:00.123456+00:00';
const V0 = '2026-03-31T09:00:00+00:00';

type Row = Record<string, unknown>;
const logger = { error() {}, warn() {}, info() {}, debug() {} } as any;

function ctx(): ServiceContext {
  return {
    db: supabaseAdmin as any,
    tenantId: TENANT,
    actor: { kind: 'staff', staffId: 'staff-1', userId: 'user-1' },
    logger,
  } as ServiceContext;
}

async function rejects(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    return err as {
      status?: number;
      code?: string;
      reason?: string;
      toBody?: () => Record<string, unknown>;
    };
  }
  throw new Error('attendu : refus');
}

describe('assertFreshVersion', () => {
  it('ne contrôle rien sans version attendue', () => {
    expect(() => assertFreshVersion(undefined, V1, 'x')).not.toThrow();
    expect(() => assertFreshVersion(null, V1, 'x')).not.toThrow();
    expect(() => assertFreshVersion('', V1, 'x')).not.toThrow();
  });

  it('accepte la même version, même écrite autrement', () => {
    expect(() => assertFreshVersion(V1, V1, 'x')).not.toThrow();
    expect(() =>
      assertFreshVersion(
        '2026-04-01T10:00:00Z',
        '2026-04-01T10:00:00+00:00',
        'x'
      )
    ).not.toThrow();
  });

  it('lève un 409 conflict / stale_update sur une version périmée', () => {
    let err: unknown;
    try {
      assertFreshVersion(V0, V1, 'Modifié entre-temps.');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConflictError);
    const body = (err as ConflictError).toBody();
    expect((err as ConflictError).status).toBe(409);
    expect(body).toMatchObject({
      error: 'Modifié entre-temps.',
      code: 'conflict',
      reason: STALE_UPDATE_REASON,
    });
  });

  it('isStaleUpdateError reconnaît le 409 côté client', () => {
    expect(
      isStaleUpdateError({ status: 409, payload: { reason: 'stale_update' } })
    ).toBe(true);
    expect(isStaleUpdateError({ status: 409, payload: { code: 'x' } })).toBe(
      false
    );
    expect(isStaleUpdateError({ status: 500, payload: null })).toBe(false);
    expect(isStaleUpdateError(null)).toBe(false);
  });
});

describe('tournoi : PATCH / PUT', () => {
  beforeEach(() => {
    store.tournaments = [
      {
        id: TOURN,
        tenant_id: TENANT,
        name: 'Cup',
        status: 'draft',
        visibility: 'private',
        updated_at: V1,
      },
    ] as Row[];
  });

  it('version périmée → 409, rien d’écrit', async () => {
    const err = await rejects(
      patchTournament(ctx(), TOURN, { name: 'Autre', expected_updated_at: V0 })
    );
    expect(err.status).toBe(409);
    expect(err.reason).toBe(STALE_UPDATE_REASON);
    expect((store.tournaments as Row[])[0].name).toBe('Cup');
  });

  it('version à jour → écrit et fait avancer updated_at', async () => {
    await patchTournament(ctx(), TOURN, {
      name: 'Nouveau',
      expected_updated_at: V1,
    });
    const row = (store.tournaments as Row[])[0];
    expect(row.name).toBe('Nouveau');
    expect(row.updated_at).not.toBe(V1);
  });

  it('sans expected_updated_at → écrit (rétro-compatible)', async () => {
    await patchTournament(ctx(), TOURN, { name: 'Sans verrou' });
    expect((store.tournaments as Row[])[0].name).toBe('Sans verrou');
  });
});

describe('équipe : PATCH', () => {
  beforeEach(() => {
    store.teams = [
      {
        id: TEAM,
        tenant_id: TENANT,
        name: 'Alpha',
        captain_id: null,
        is_active: true,
        updated_at: V1,
      },
    ] as Row[];
  });

  it('version périmée → 409, rien d’écrit', async () => {
    const err = await rejects(
      updateTeam(ctx(), TEAM, { name: 'Beta', expected_updated_at: V0 })
    );
    expect(err.status).toBe(409);
    expect(err.reason).toBe(STALE_UPDATE_REASON);
    expect((store.teams as Row[])[0].name).toBe('Alpha');
  });

  it('version à jour → écrit', async () => {
    await updateTeam(ctx(), TEAM, { name: 'Beta', expected_updated_at: V1 });
    expect((store.teams as Row[])[0].name).toBe('Beta');
  });

  it('sans expected_updated_at → écrit (rétro-compatible)', async () => {
    await updateTeam(ctx(), TEAM, { name: 'Gamma' });
    expect((store.teams as Row[])[0].name).toBe('Gamma');
  });
});

describe('actualité : PUT', () => {
  beforeEach(() => {
    store.news = [
      {
        id: NEWS,
        tenant_id: TENANT,
        title: 'Titre',
        slug: 'titre',
        tag: 'general',
        content: 'Contenu',
        status: 'draft',
        published_at: null,
        updated_at: V1,
      },
    ] as Row[];
  });

  const body = (extra: Record<string, unknown> = {}) => ({
    title: 'Titre modifié',
    content: 'Contenu',
    status: 'draft',
    ...extra,
  });

  it('version périmée → 409, rien d’écrit', async () => {
    const err = await rejects(
      updateNews(ctx(), NEWS, body({ expected_updated_at: V0 }))
    );
    expect(err.status).toBe(409);
    expect(err.reason).toBe(STALE_UPDATE_REASON);
    expect((store.news as Row[])[0].title).toBe('Titre');
  });

  it('version à jour → écrit', async () => {
    await updateNews(ctx(), NEWS, body({ expected_updated_at: V1 }));
    expect((store.news as Row[])[0].title).toBe('Titre modifié');
  });

  it('sans expected_updated_at → écrit (rétro-compatible)', async () => {
    await updateNews(ctx(), NEWS, body());
    expect((store.news as Row[])[0].title).toBe('Titre modifié');
  });
});
