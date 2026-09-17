// Sources OBS « scrims à venir » (`/overlay/scrims`) et « faire un don »
// (`/overlay/don`).
// Targets : utils/overlay/scrimsOverlay.ts (pur), pages/api/overlay/scrims.ts,
//           pages/overlay/don.tsx, components/admin/tournament/StreamSourcesPanel
//
// CE QUE CES CAS PROTÈGENT :
//   1. LES PROCHAINS SCRIMS, PAS LES PLUS LOINTAINS : en cours d'abord, puis du
//      plus proche au plus lointain — l'inverse de `/api/scrims`.
//   2. PAS DE FANTÔMES : un scrim `scheduled` joué depuis longtemps mais jamais
//      clos ne s'affiche plus comme « à venir ».
//   3. ON NE DIFFUSE QUE LE PUBLIC : ni privé, ni brouillon, ni autre espace.
//   4. LE QR DE DON EST SUR FOND BLANC (sinon il ne se scanne pas) et n'est
//      proposé qu'à l'espace de la Women's Cup, à qui il appartient.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const routerQuery: { current: Record<string, string> } = { current: {} };
vi.mock('next/router', () => ({
  useRouter: () => ({ query: routerQuery.current, isReady: true }),
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  parseScrimHorizon,
  parseScrimLimit,
  selectUpcomingScrims,
  STALE_SCHEDULED_MS,
  type ScrimRowForOverlay,
} from '../../utils/overlay/scrimsOverlay';
import handler from '../../pages/api/overlay/scrims';
import DonationOverlayPage from '../../pages/overlay/don';
import StreamSourcesPanel from '../../components/admin/tournament/StreamSourcesPanel';

const NOW = Date.parse('2026-09-17T18:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function scrim(
  id: string,
  over: Partial<ScrimRowForOverlay> = {}
): ScrimRowForOverlay {
  return {
    id,
    name: `Scrim ${id}`,
    slug: id,
    status: 'scheduled',
    scheduled_date: null,
    team1: { name: 'Venom Valkyries', short_name: 'VV', logo_url: null },
    team2: null,
    ...over,
  };
}

describe('sélection des scrims à venir', () => {
  it('met les scrims en cours en tête, puis les prochains dans l’ordre', () => {
    const rows = [
      scrim('far', { scheduled_date: new Date(NOW + 72 * HOUR).toISOString() }),
      scrim('soon', { scheduled_date: new Date(NOW + 2 * HOUR).toISOString() }),
      scrim('undated'),
      scrim('live', {
        status: 'running',
        scheduled_date: new Date(NOW - HOUR).toISOString(),
      }),
    ];
    const out = selectUpcomingScrims(rows, NOW, 14);
    expect(out.map((s) => s.id)).toEqual(['live', 'soon', 'far', 'undated']);
    expect(out[0]!.phase).toBe('live');
    expect(out[1]!.team2).toBeNull();
  });

  it('écarte les scrims jamais clos, hors horizon, terminés ou annulés', () => {
    const rows = [
      scrim('ghost', {
        scheduled_date: new Date(NOW - STALE_SCHEDULED_MS - HOUR).toISOString(),
      }),
      scrim('late-start', {
        scheduled_date: new Date(NOW - HOUR).toISOString(),
      }),
      scrim('next-month', {
        scheduled_date: new Date(NOW + 20 * 24 * HOUR).toISOString(),
      }),
      scrim('done', { status: 'completed' }),
      scrim('cancelled', { status: 'cancelled' }),
    ];
    expect(selectUpcomingScrims(rows, NOW, 14).map((s) => s.id)).toEqual([
      'late-start',
    ]);
  });

  it('borne ?days= et ?limit=', () => {
    expect(parseScrimHorizon(undefined)).toBe(14);
    expect(parseScrimHorizon('365')).toBe(60);
    expect(parseScrimLimit('0')).toBe(1);
    expect(parseScrimLimit(undefined)).toBe(6);
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

describe('GET /api/overlay/scrims', () => {
  const future = new Date(Date.now() + 24 * HOUR).toISOString();

  beforeEach(() => {
    resetSupabaseMock();
    const base = {
      tenant_id: DEFAULT_TENANT_ID,
      is_public: true,
      deleted_at: null,
      status: 'scheduled',
      scheduled_date: future,
      team1_id: null,
      team2_id: null,
    };
    store.scrims = [
      { ...base, id: 's-public', name: 'Public', slug: 's-public' },
      {
        ...base,
        id: 's-private',
        name: 'Privé',
        slug: 's-private',
        is_public: false,
      },
      {
        ...base,
        id: 's-draft',
        name: 'Brouillon',
        slug: 's-draft',
        status: 'draft',
      },
      {
        ...base,
        id: 's-deleted',
        name: 'Supprimé',
        slug: 's-deleted',
        deleted_at: future,
      },
      {
        ...base,
        id: 's-other',
        name: 'Autre espace',
        slug: 's-other',
        tenant_id: 'dddddddd-0000-4000-8000-000000000009',
      },
    ];
  });

  it('ne sert que les scrims publics, programmés, de l’espace', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.scrims.map((s: { id: string }) => s.id)).toEqual([
      's-public',
    ]);
    expect(res.body.total).toBe(1);
    expect(res.headers['Cache-Control']).toContain('s-maxage=30');
  });

  it('refuse les autres méthodes', async () => {
    const res = makeRes();
    await handler({ ...makeReq({}), method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('source « faire un don »', () => {
  it('pose le QR HelloAsso de /don sur fond blanc', () => {
    routerQuery.current = {};
    const html = renderToStaticMarkup(createElement(DonationOverlayPage));
    expect(html).toContain('src="/images/qr.png"');
    expect(html).toMatch(
      /class="[^"]*bg-white[^"]*"><img src="\/images\/qr.png"/
    );
    expect(html).toContain('owwomenscup.fr/don');
  });

  it('propose un encart d’angle et une accroche bornée', () => {
    routerQuery.current = { layout: 'corner', title: 'x'.repeat(200) };
    const html = renderToStaticMarkup(createElement(DonationOverlayPage));
    expect(html).toContain('bottom-10 right-10');
    expect(html).toContain('x'.repeat(80));
    expect(html).not.toContain('x'.repeat(81));
  });
});

describe('panneau « Sources de stream »', () => {
  const props = {
    tournamentRef: 'ow-womens-cup-2026',
    baseUrl: 'https://owwomenscup.fr',
    enabled: true,
    planLabel: 'Régie',
  };

  it('liste les scrims à venir, et le don pour la Women’s Cup seulement', () => {
    const wc = renderToStaticMarkup(
      createElement(StreamSourcesPanel, { ...props, showDonation: true })
    );
    expect(wc).toContain('https://owwomenscup.fr/overlay/scrims');
    expect(wc).toContain('https://owwomenscup.fr/overlay/don');

    const other = renderToStaticMarkup(
      createElement(StreamSourcesPanel, props)
    );
    expect(other).toContain('/overlay/scrims');
    expect(other).not.toContain('/overlay/don');
  });
});
