// tests/unit/tcgCatalogReadErrors.test.ts
//
// Catalogue public `/tcg` (ISR 300 s) : une lecture ratée ne doit JAMAIS être
// publiée comme « aucune équipe / 0 joueuse ».
//
//   - en régénération, getStaticProps LÈVE : Next garde la dernière version
//     réussie et retente à la requête suivante ;
//   - au build (`NEXT_PHASE` = production-build), lever ferait échouer tout le
//     déploiement : on rend la page dégradée avec un revalidate court.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = {
  data?: unknown;
  count?: number | null;
  error: { message: string } | null;
};
const results: Record<string, Result> = {};

function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'or', 'order', 'limit']) {
    q[m] = () => q;
  }
  q.then = (onOk: (r: Result) => unknown, onKo?: (e: unknown) => unknown) =>
    Promise.resolve(results[table] ?? { data: [], error: null }).then(
      onOk,
      onKo
    );
  return q;
}

vi.mock('@/utils/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => chain(table),
    storage: {
      from: () => ({
        getPublicUrl: (p: string) => ({
          data: { publicUrl: `https://cdn.test/${p}` },
        }),
      }),
    },
  },
}));
vi.mock('@/utils/tcg/readCardFaces', () => ({
  readTeamFaces: async () => new Map(),
}));
vi.mock('@/utils/tcg/readTeamRarity', () => ({
  readTeamRarities: async () => new Map(),
}));
const logError = vi.fn();
vi.mock('@/utils/logger', () => ({
  logger: {
    error: (...a: unknown[]) => logError(...a),
    warn: () => {},
    info: () => {},
    debug: () => {},
  },
}));

import { getStaticProps } from '@/pages/tcg';

const TEAM = '33333333-3333-4333-8333-333333333333';
const savedPhase = process.env.NEXT_PHASE;

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  results.teams = { data: [{ id: TEAM }], error: null };
  results.player_ratings = { data: null, count: 42, error: null };
  results.tcg_fanart_cards = { data: [], error: null };
  logError.mockReset();
  delete process.env.NEXT_PHASE;
});
afterEach(() => {
  if (savedPhase === undefined) delete process.env.NEXT_PHASE;
  else process.env.NEXT_PHASE = savedPhase;
});

describe('/tcg — getStaticProps face à une lecture ratée', () => {
  it('lectures saines : catalogue complet, revalidate 300', async () => {
    const r = (await getStaticProps({} as never)) as any;
    expect(r.revalidate).toBe(300);
    expect(r.props.playerCount).toBe(42);
    // Le barème public voyage avec le catalogue (cf. utils/tcg/publicBareme).
    expect(r.props.bareme.boosterPrice).toBeGreaterThan(0);
    expect(r.props.cards.some((c: { kind: string }) => c.kind === 'team')).toBe(
      true
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it.each([
    ['teams', 'équipes'],
    ['player_ratings', 'compte des joueuses'],
    ['tcg_fanart_cards', 'visuels'],
  ])(
    '%s en échec en régénération : lève et journalise',
    async (table, what) => {
      results[table] = { data: null, count: null, error: { message: 'boom' } };
      await expect(getStaticProps({} as never)).rejects.toThrow(what);
      expect(logError).toHaveBeenCalled();
    }
  );

  it('au build : page dégradée publiée avec un revalidate court', async () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    results.teams = { data: null, error: { message: 'boom' } };
    const r = (await getStaticProps({} as never)) as any;
    expect(r.revalidate).toBe(30);
    // Le barème ne lit rien en base : présent même en page dégradée.
    expect(r.props.bareme.matchWin.coins).toBeGreaterThan(0);
    expect(r.props.cards.some((c: { kind: string }) => c.kind === 'map')).toBe(
      true
    );
    expect(logError).toHaveBeenCalled();
  });
});
