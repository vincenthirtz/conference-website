// Sweep 2i: smaller remaining 0% files + improve scraper coverage.
//
// Targets:
//  - pages/api/netlify-builds.ts
//  - pages/api/patch-notes.ts (cheerio scrape happy path)
//  - utils/statusConfig.ts (pure constant — just import to mark as covered)
//  - utils/supabaseAdmin.ts (module export — already loaded; just verify)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { resetSupabaseMock } from './__helpers__/supabaseMock';

import patchNotesHandler from '../../pages/api/patch-notes';
import { STATUS_CONFIG } from '../../utils/statusConfig';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
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
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
});

/* -----------------------------------------------------------
 * /api/patch-notes — happy-path scrape
 * ---------------------------------------------------------*/

describe('/api/patch-notes happy-path scrape', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
  });

  afterEach(() => {
    fetchSpy?.mockRestore?.();
  });

  it('200 parses HTML with anchors, titles, dates, hero updates', async () => {
    const html = `
      <html><body>
        <div class="PatchNotes-patch">
          <span class="anchor" id="patch-2026-01"></span>
          <h2 class="PatchNotes-patchTitle">Patch 2026.01</h2>
          <div class="PatchNotes-date">8 janvier 2026</div>
          <p class="PatchNotes-sectionDescription">Equilibrage de la saison.</p>
          <div class="PatchNotes-section">
            <h4 class="PatchNotes-sectionTitle">Heroes</h4>
            <div class="PatchNotesHeroUpdate">
              <div class="PatchNotesHeroUpdate-header">
                <h5>Tracer</h5>
                <img src="/img/tracer.png" />
              </div>
              <div class="PatchNotesHeroUpdate-body">Buff to Pulse Bomb damage.</div>
            </div>
          </div>
        </div>
        <div class="PatchNotes-patch">
          <span class="anchor" id="patch-2025-12"></span>
          <h2 class="PatchNotes-patchTitle">Patch 2025.12</h2>
          <div class="PatchNotes-date">15 décembre 2025</div>
        </div>
        <!-- Patch with no anchor → should be skipped -->
        <div class="PatchNotes-patch">
          <h2 class="PatchNotes-patchTitle">Orphan</h2>
        </div>
      </body></html>`;
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    } as any);
    const res = makeRes();
    await patchNotesHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    // Items will come from DB by default (empty), then fall back to scraped.
    // The scrape produces 2 items (the orphan with no anchor is skipped).
    expect((res.body as any).items.length).toBe(2);
    const first = (res.body as any).items[0];
    expect(first.id).toBe('patch-2026-01');
    expect(first.heroes.length).toBe(1);
    expect(first.heroes[0].name).toBe('Tracer');
  });
});

/* -----------------------------------------------------------
 * utils/statusConfig
 * ---------------------------------------------------------*/

describe('statusConfig', () => {
  it('exports a config for every match status', () => {
    expect(STATUS_CONFIG.pending.label).toBe('A venir');
    expect(STATUS_CONFIG.ongoing.label).toBe('En cours');
    expect(STATUS_CONFIG.finished.label).toBe('Terminé');
    expect(STATUS_CONFIG.cancelled.label).toBe('Annulé');
    expect(STATUS_CONFIG.postponed.label).toBe('Reporté');
    expect(STATUS_CONFIG.disputed.label).toBe('Contesté');
    expect(STATUS_CONFIG.walkover.label).toBe('Walkover');
  });

  it('every entry has dot + bg class strings', () => {
    for (const cfg of Object.values(STATUS_CONFIG)) {
      expect(typeof cfg.dot).toBe('string');
      expect(typeof cfg.bg).toBe('string');
      expect(cfg.dot.length).toBeGreaterThan(0);
      expect(cfg.bg.length).toBeGreaterThan(0);
    }
  });
});
