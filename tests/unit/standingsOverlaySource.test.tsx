// @vitest-environment happy-dom
//
// La source OBS « classement » (`/overlay/standings`).
// Targets : components/overlay/match/StandingsSource.tsx
//
// CE QUE CES CAS PROTÈGENT :
//   1. LES LIGNES DE L'API, DANS SON ORDRE : la source ne recompte ni ne trie.
//   2. LA ZONE QUALIFICATIVE : rang en couleur d'accent et trait sous la
//      dernière place qualifiée ; `qualify=0` la masque, une disqualifiée n'y
//      entre jamais.
//   3. LES NOMS NE SONT JAMAIS TRONQUÉS (règle des overlays : ils passent à la
//      ligne).
//   4. RIEN À L'ÉCRAN plutôt qu'un cadre vide quand il n'y a pas de table.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  StandingsSource,
  formatMapDiff,
} from '@/components/overlay/match/StandingsSource';
import type {
  OverlayStandingsResponse,
  OverlayStandingsRowView,
} from '@/utils/overlay/standingsOverlay';

afterEach(cleanup);

function row(
  rank: number,
  name: string,
  over: Partial<OverlayStandingsRowView> = {}
): OverlayStandingsRowView {
  return {
    rank,
    team: { id: `t-${rank}`, name, shortName: null, logoUrl: null },
    played: 7,
    wins: 7 - rank,
    losses: rank - 1,
    draws: 0,
    points: (7 - rank) * 3,
    mapDiff: 8 - rank * 2,
    form: ['W', 'L', 'W'],
    disqualified: false,
    ...over,
  };
}

function payload(
  over: Partial<OverlayStandingsResponse> = {}
): OverlayStandingsResponse {
  return {
    tables: [
      {
        key: 'stage-1',
        stageName: 'Saison régulière',
        groupKey: null,
        rows: [
          row(1, 'Hinode Sparkles'),
          row(2, 'Chocomates'),
          row(3, 'LVN EMBERS'),
          row(4, 'Venom Valkyries'),
          row(5, 'LVN ASHES'),
          row(6, 'Éclypse', { disqualified: true }),
        ],
      },
    ],
    qualifiers: 4,
    tournament: {
      id: 'tour',
      slug: 'cup',
      name: 'Cup',
      shortName: null,
      game: 'overwatch',
    },
    branding: { name: null, logoUrl: null, accent: '#b467d1' },
    serverTime: '2026-10-17T18:00:00.000Z',
    ...over,
  };
}

function renderSource(
  p: OverlayStandingsResponse | null,
  opts: {
    limit?: number | null;
    stageKey?: string | null;
    qualify?: number | null;
  } = {}
) {
  return render(
    <StandingsSource
      payload={p}
      scale={1}
      limit={opts.limit ?? null}
      stageKey={opts.stageKey ?? null}
      qualify={opts.qualify ?? null}
    />
  );
}

const rankCell = (tr: HTMLElement) => tr.querySelector('td') as HTMLElement;

describe('StandingsSource', () => {
  it('affiche les lignes de l’API dans son ordre, noms entiers', () => {
    renderSource(payload());
    const rows = screen.getAllByTestId('standings-row');
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Hinode Sparkles'),
      expect.stringContaining('Chocomates'),
      expect.stringContaining('LVN EMBERS'),
      expect.stringContaining('Venom Valkyries'),
      expect.stringContaining('LVN ASHES'),
      expect.stringContaining('Éclypse'),
    ]);
    // Jamais de troncature : le nom passe à la ligne.
    const name = screen.getByText('Venom Valkyries');
    expect(name.className).toContain('break-words');
    expect(name.className).not.toMatch(/truncate|line-clamp|text-ellipsis/);
  });

  it('marque la zone qualificative et tire le trait sous la dernière place', () => {
    renderSource(payload());
    const rows = screen.getAllByTestId('standings-row');
    expect(rankCell(rows[0]).style.color).not.toBe('');
    expect(rankCell(rows[3]).style.color).not.toBe('');
    expect(rankCell(rows[4]).style.color).toBe('');
    expect(rankCell(rows[3]).className).toContain('border-b-2');
    expect(rankCell(rows[2]).className).not.toContain('border-b-2');
  });

  it('`qualify=0` masque la zone, `qualify=2` la déplace', () => {
    renderSource(payload(), { qualify: 0 });
    let rows = screen.getAllByTestId('standings-row');
    expect(rows.every((r) => rankCell(r).style.color === '')).toBe(true);
    expect(rows.some((r) => rankCell(r).className.includes('border-b-2'))).toBe(
      false
    );
    cleanup();

    renderSource(payload(), { qualify: 2 });
    rows = screen.getAllByTestId('standings-row');
    expect(rankCell(rows[1]).className).toContain('border-b-2');
    expect(rankCell(rows[2]).style.color).toBe('');
  });

  it('met une disqualifiée en retrait avec sa puce, hors zone', () => {
    renderSource(payload({ qualifiers: 6 }));
    const last = screen.getAllByTestId('standings-row').at(-1)!;
    expect(last.className).toContain('opacity-50');
    expect(last.textContent).toContain('DNF');
    expect(rankCell(last).style.color).toBe('');
  });

  it('n’affiche la colonne des nuls que s’il y en a', () => {
    renderSource(payload());
    expect(screen.queryByRole('columnheader', { name: 'N' })).toBeNull();
    cleanup();
    const p = payload();
    p.tables[0].rows[2] = row(3, 'LVN EMBERS', { draws: 1 });
    renderSource(p);
    expect(screen.getByRole('columnheader', { name: 'N' })).toBeTruthy();
  });

  it('respecte `limit` et `stage`', () => {
    renderSource(payload(), { limit: 3 });
    expect(screen.getAllByTestId('standings-row')).toHaveLength(3);
    cleanup();

    const p = payload();
    p.tables.push({
      key: 'pool-b',
      stageName: 'Poule B',
      groupKey: 'B',
      rows: [row(1, 'Équipe B1', { played: 0 })],
    });
    renderSource(p, { stageKey: 'pool-b' });
    expect(screen.getAllByTestId('standings-row')).toHaveLength(1);
    expect(screen.getByText('Équipe B1')).toBeTruthy();
  });

  it('ne rend rien sans données ni table', () => {
    const { container } = renderSource(null);
    expect(container.innerHTML).toBe('');
    cleanup();
    const empty = renderSource(payload({ tables: [] }));
    expect(empty.container.innerHTML).toBe('');
  });

  it('écrit l’écart de maps avec un vrai signe', () => {
    expect(formatMapDiff(11)).toBe('+11');
    expect(formatMapDiff(0)).toBe('0');
    expect(formatMapDiff(-8)).toBe('−8');
  });
});
