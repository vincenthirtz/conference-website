// @vitest-environment happy-dom
//
// Women's Library, bêta fermée — côté site :
//   * 403 `LIBRARY_CLOSED` (API, `LIBRARY_ACCESS`) → l'écran « pas encore
//     ouverte » : calme, un lien vers l'espace joueuse, AUCUN bouton de réessai
//     (la réponse ne changera pas dans la minute) ;
//   * les points d'entrée — le lien du menu compte (`PLAYER_LINKS`) et la
//     tuile de l'écran TCG — n'apparaissent que si `NEXT_PUBLIC_LIBRARY_ENTRY`
//     vaut `1`. La propriétaire passe par l'adresse directe `/player/library`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import LibraryGate from '@/features/player/library/ui/gate/LibraryGate';
import { libraryGateOf } from '@/features/player/library/model';
import { isLibraryEntryEnabled } from '@/features/player/library/entry';
import { LIBRARY_ACCESS_CODES } from '@/features/player/library/responses';
import TcgLibraryTile from '@/features/player/tcg/ui/TcgLibraryTile';
import { buildPlayerLinks } from '@/components/Navbar/playerLinks';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

const t = nsPlayerLibrary.fr;
const tTcg = nsPlayerTcg.fr;

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function httpError(status: number, payload: Record<string, unknown>) {
  return Object.assign(new Error('http'), {
    status,
    code: (payload.code as string) ?? null,
    payload,
  });
}

/* ------------------------------------------------- « pas encore ouverte » --- */

describe('Library fermée (LIBRARY_CLOSED)', () => {
  it('le code de l’API donne l’écran `closed`', () => {
    expect(LIBRARY_ACCESS_CODES.closed).toBe('LIBRARY_CLOSED');
    expect(
      libraryGateOf({
        isPending: false,
        error: httpError(403, { code: 'LIBRARY_CLOSED' }),
      })
    ).toBe('closed');
  });

  it('écran calme : titre, phrase, lien vers l’espace joueuse, pas de réessai', () => {
    const onRetry = vi.fn();
    const onAttest = vi.fn();
    const { container } = render(
      <LibraryGate
        gate="closed"
        attesting={false}
        onAttest={onAttest}
        onRetry={onRetry}
      />
    );
    expect(screen.getByRole('heading', { name: t.closedTitle })).toBeTruthy();
    expect(screen.getByText(t.closedBody)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: t.closedBackLink }).getAttribute('href')
    ).toBe('/player');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(container.querySelector('[data-gate="closed"]')).not.toBeNull();
    expect(onRetry).not.toHaveBeenCalled();
    expect(onAttest).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------ points d'entrée --- */

describe('NEXT_PUBLIC_LIBRARY_ENTRY', () => {
  it('seul `1` ouvre les entrées', () => {
    expect(isLibraryEntryEnabled('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'yes', ' 1']) {
      expect(isLibraryEntryEnabled(v)).toBe(false);
    }
  });

  it('lit la variable à l’appel', () => {
    vi.stubEnv('NEXT_PUBLIC_LIBRARY_ENTRY', '1');
    expect(isLibraryEntryEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_LIBRARY_ENTRY', '0');
    expect(isLibraryEntryEnabled()).toBe(false);
  });

  it('menu compte : la Library seulement quand l’entrée est ouverte', () => {
    const base = [
      'dashboard',
      'matches',
      'discovery',
      'notifications',
      'profile',
    ];
    expect(buildPlayerLinks(false).map((l) => l.key)).toEqual(base);
    expect(buildPlayerLinks(true).map((l) => l.key)).toEqual([
      ...base,
      'library',
    ]);
    expect(buildPlayerLinks(true).at(-1)).toEqual({
      key: 'library',
      ref: '/player/library',
    });
  });

  it('PLAYER_LINKS suit la variable (évaluée au chargement)', async () => {
    vi.stubEnv('NEXT_PUBLIC_LIBRARY_ENTRY', '');
    vi.resetModules();
    const closed = await import('@/components/Navbar/playerLinks');
    expect(closed.PLAYER_LINKS.some((l) => l.key === 'library')).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_LIBRARY_ENTRY', '1');
    vi.resetModules();
    const open = await import('@/components/Navbar/playerLinks');
    expect(open.PLAYER_LINKS.some((l) => l.key === 'library')).toBe(true);
  });

  it('tuile TCG : rien sans la variable', () => {
    vi.stubEnv('NEXT_PUBLIC_LIBRARY_ENTRY', '');
    const { container } = render(<TcgLibraryTile />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('tuile TCG : le lien vers /player/library avec `1`', () => {
    vi.stubEnv('NEXT_PUBLIC_LIBRARY_ENTRY', '1');
    render(<TcgLibraryTile />);
    expect(
      screen.getByRole('heading', { name: tTcg.libraryTileTitle })
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: tTcg.libraryTileLink })
        .getAttribute('href')
    ).toBe('/player/library');
  });
});
