// Source OBS « résultat de scrim » (`/overlay/scrim-result`).
// Targets : utils/overlay/scrimResultOverlay.ts (pur),
//           pages/api/overlay/scrim-result.ts,
//           components/overlay/match/ScrimResultSource.tsx
//
// CE QUE CES CAS PROTÈGENT :
//   1. LE VAINQUEUR EST CELUI DU SITE (`winner_team_id`), pas une comparaison
//      recalculée ; un nul est un vrai résultat.
//   2. `latest` NE RESSORT PAS UN VIEUX SCORE : en cours d'abord, sinon un
//      scrim clos depuis moins de 24 h, sinon rien.
//   3. ON NE DIFFUSE QUE LE PUBLIC : ni privé, ni brouillon, ni supprimé.
//   4. PAS DE SCORE INVENTÉ : un scrim sans résultat n'affiche pas « 0 : 0 ».

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  buildScrimResultView,
  pickLatestResultScrim,
  RESULT_FRESH_MS,
  UPCOMING_LATE_MS,
  type ScrimRowForResult,
} from '../../utils/overlay/scrimResultOverlay';
import handler from '../../pages/api/overlay/scrim-result';
import {
  ScrimResultSource,
  resultFit,
} from '../../components/overlay/match/ScrimResultSource';

const T1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const T2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-09-17T21:00:00.000Z');
const HOUR = 3600 * 1000;

function row(
  id: string,
  over: Partial<ScrimRowForResult> = {}
): ScrimRowForResult {
  return {
    id,
    name: `Scrim ${id}`,
    slug: id,
    status: 'completed',
    scheduled_date: '2026-09-17T18:30:00.000Z',
    completed_at: new Date(NOW - HOUR).toISOString(),
    team1_id: T1,
    team2_id: T2,
    team1_score: 3,
    team2_score: 1,
    winner_team_id: T1,
    team1: { name: 'Team Positivité', short_name: 'TP', logo_url: null },
    team2: { name: 'DSC Nova', short_name: null, logo_url: null },
    ...over,
  };
}

describe('projection du résultat', () => {
  it('prend le vainqueur du site, pas une comparaison de scores', () => {
    // Forfait réglé 0-0 mais attribué à l'équipe 2 : l'écran suit le site.
    const v = buildScrimResultView(
      row('f', { team1_score: 0, team2_score: 0, winner_team_id: T2 })
    );
    expect(v.phase).toBe('final');
    expect(v.team2?.isWinner).toBe(true);
    expect(v.team1?.isWinner).toBe(false);
    expect(v.draw).toBe(false);
  });

  it('reconnaît un nul', () => {
    const v = buildScrimResultView(
      row('d', { team1_score: 2, team2_score: 2, winner_team_id: null })
    );
    expect(v.draw).toBe(true);
  });

  it('n’annonce pas de résultat tant que le score n’est pas posé', () => {
    const v = buildScrimResultView(
      row('p', {
        status: 'completed',
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
      })
    );
    expect(v.phase).toBe('pending');
    expect(v.draw).toBe(false);
    expect(v.team1?.isWinner).toBe(false);
  });
});

describe('le scrim du moment', () => {
  it('préfère un scrim en cours', () => {
    const rows = [
      row('done'),
      row('live', { status: 'running', completed_at: null }),
    ];
    expect(pickLatestResultScrim(rows, NOW)?.id).toBe('live');
  });

  it('avant le match, montre le prochain scrim du jour (sans score)', () => {
    const rows = [
      row('old-done', {
        completed_at: new Date(NOW - 20 * HOUR).toISOString(),
      }),
      row('tonight', {
        status: 'scheduled',
        scheduled_date: new Date(NOW + 2.5 * HOUR).toISOString(),
        completed_at: null,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
      }),
      row('next-week', {
        status: 'scheduled',
        scheduled_date: new Date(NOW + 7 * 24 * HOUR).toISOString(),
        completed_at: null,
      }),
      row('ghost', {
        status: 'scheduled',
        scheduled_date: new Date(NOW - UPCOMING_LATE_MS - HOUR).toISOString(),
        completed_at: null,
      }),
    ];
    const picked = pickLatestResultScrim(rows, NOW);
    expect(picked?.id).toBe('tonight');
    expect(buildScrimResultView(picked!).phase).toBe('pending');
  });

  it('juste après le match, le résultat reste affiché même si un autre scrim suit', () => {
    const rows = [
      row('just-done', { completed_at: new Date(NOW - HOUR).toISOString() }),
      row('later', {
        status: 'scheduled',
        scheduled_date: new Date(NOW + 2 * HOUR).toISOString(),
        completed_at: null,
      }),
    ];
    expect(pickLatestResultScrim(rows, NOW)?.id).toBe('just-done');
  });

  it('prend le dernier clos, mais pas au-delà de 24 h', () => {
    const rows = [
      row('old', {
        completed_at: new Date(NOW - RESULT_FRESH_MS - HOUR).toISOString(),
      }),
      row('recent', { completed_at: new Date(NOW - 2 * HOUR).toISOString() }),
      row('latest', { completed_at: new Date(NOW - HOUR).toISOString() }),
    ];
    expect(pickLatestResultScrim(rows, NOW)?.id).toBe('latest');
    expect(pickLatestResultScrim([rows[0]!], NOW)).toBeNull();
  });
});

function makeReq(query: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    cookies: {},
    query,
    body: {},
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

describe('GET /api/overlay/scrim-result', () => {
  beforeEach(() => {
    resetSupabaseMock();
    const base = {
      tenant_id: DEFAULT_TENANT_ID,
      is_public: true,
      deleted_at: null,
      status: 'completed',
      scheduled_date: new Date(Date.now() - 3 * HOUR).toISOString(),
      completed_at: new Date(Date.now() - HOUR).toISOString(),
      team1_id: null,
      team2_id: null,
      team1_score: 2,
      team2_score: 0,
      winner_team_id: null,
    };
    store.scrims = [
      {
        ...base,
        id: 'bbbbbbbb-0000-4000-8000-000000000001',
        name: 'Public',
        slug: 'scrim-public',
      },
      {
        ...base,
        id: 'bbbbbbbb-0000-4000-8000-000000000002',
        name: 'Privé',
        slug: 'scrim-prive',
        is_public: false,
      },
      {
        ...base,
        id: 'bbbbbbbb-0000-4000-8000-000000000003',
        name: 'Brouillon',
        slug: 'scrim-draft',
        status: 'draft',
      },
    ];
  });

  it('sert un scrim public par son slug', async () => {
    const res = makeRes();
    await handler(makeReq({ scrim: 'scrim-public' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.scrim.slug).toBe('scrim-public');
    expect(res.body.scrim.phase).toBe('final');
    expect(res.headers['Cache-Control']).toContain('s-maxage=5');
  });

  it('ne sert ni un scrim privé ni un brouillon', async () => {
    for (const slug of ['scrim-prive', 'scrim-draft']) {
      const res = makeRes();
      await handler(makeReq({ scrim: slug }), res);
      expect(res.statusCode).toBe(404);
    }
  });

  it('suit le scrim du moment par défaut', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.scrim.slug).toBe('scrim-public');
  });

  it('refuse un identifiant mal formé', async () => {
    const res = makeRes();
    await handler(makeReq({ scrim: '<script>' }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('rendu', () => {
  const render = (scrim: ReturnType<typeof buildScrimResultView> | null) =>
    renderToStaticMarkup(
      createElement(ScrimResultSource, {
        payload: { scrim, branding: null, serverTime: '' },
        accent: '#f0e63c',
        scale: 1,
      })
    );

  it('affiche le score, les équipes et le vainqueur', () => {
    const html = render(buildScrimResultView(row('r')));
    expect(html).toContain('Résultat final');
    expect(html).toContain('Team Positivité');
    expect(html).toContain('DSC Nova');
    expect(html).toContain('>3<');
    expect(html).toContain('>1<');
    expect(html).toContain('Victoire');
  });

  it('affiche le score en cours d’un scrim en direct', () => {
    const html = render(
      buildScrimResultView(
        row('l', {
          status: 'running',
          team1_score: 2,
          team2_score: 1,
          winner_team_id: null,
          completed_at: null,
        })
      )
    );
    expect(html).toContain('En direct');
    expect(html).toContain('>2<');
    expect(html).toContain('>1<');
    // Pas de vainqueur tant que le scrim n'est pas clos.
    expect(html).not.toMatch(
      /class="[^"]*rounded-full[^"]*text-black(?![^"]*invisible)[^"]*"[^>]*>Victoire/
    );
  });

  it('un scrim en direct sans score n’invente pas « 0 : 0 »', () => {
    const html = render(
      buildScrimResultView(
        row('l0', {
          status: 'running',
          team1_score: null,
          team2_score: null,
          winner_team_id: null,
          completed_at: null,
        })
      )
    );
    expect(html).not.toContain('>0<');
  });

  it('n’affiche pas « 0 : 0 » avant le résultat', () => {
    const html = render(
      buildScrimResultView(
        row('p', { status: 'scheduled', team1_score: null, team2_score: null })
      )
    );
    // Scrim programmé à 18:30 UTC : l'heure de Paris, pas une attente vague.
    expect(html).toContain('Coup d’envoi à 20:30');
    expect(html).not.toContain('>0<');
    // Ni tirets ni « VS » (déjà dans l'habillage de la régie).
    expect(html).not.toContain('>–<');
    expect(html).not.toContain('>VS<');
  });

  it('reste vide sans scrim', () => {
    expect(render(null)).toBe('');
  });

  it('remplit la source', () => {
    expect(resultFit({ width: 1424, height: 2000 })).toBeCloseTo(1);
    expect(resultFit({ width: 1920, height: 484 })).toBeCloseTo(1);
  });
});
