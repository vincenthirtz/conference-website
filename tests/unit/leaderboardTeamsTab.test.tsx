// @vitest-environment happy-dom
//
// L'onglet « Équipes » de la page Classement, une fois cliqué (demande de la
// propriétaire du 2026-11-05) : le classement final des équipes, un tableau par
// édition, chaque équipe liée à sa fiche et chaque édition à son résultat complet.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import LeaderboardPage from '../../pages/leaderboard';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mover = {
  userId: 'u1',
  displayName: 'Alice',
  battleTag: null,
  avatarUrl: null,
  teamName: null,
  teamSlug: null,
  teamLogoUrl: null,
  rating: 1600,
  delta: 20,
  matches: 1,
  wins: 1,
  losses: 0,
  rank: 1,
};

function renderPage() {
  // La première page du rating n'est pas en props : le hook la redemande.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ players: [] })))
  );
  render(
    <LeaderboardPage
      initialPlayers={[]}
      movers={[]}
      season={null}
      seasonPlayers={[]}
      tournaments={[
        {
          slug: 'ow-womens-cup-2026',
          label: 'OWWC 2026',
          name: "OW Women's Cup 2026",
          players: [mover],
        },
      ]}
      teamBoards={[
        {
          slug: 'ow-womens-cup-2026',
          name: "OW Women's Cup 2026",
          resultsHref: '/tournament/ow-womens-cup-2026/podium',
          teams: [
            { rank: 1, name: 'Chocomates', slug: 'chocomates', logoUrl: null },
            { rank: 2, name: 'Sans fiche', slug: null, logoUrl: null },
          ],
        },
        {
          slug: 'ow-womens-cup-2025',
          name: "OW Women's Cup 2025",
          resultsHref: '/tournoi',
          teams: [
            {
              rank: 1,
              name: 'Hinode Sparkles',
              slug: 'hinode-sparkles',
              logoUrl: null,
            },
          ],
        },
      ]}
      moversWindowDays={30}
      seo={{ title: { fr: 'Classement', en: 'Leaderboard' } }}
    />
  );
}

describe('page Classement — onglet « Équipes »', () => {
  it('montre un tableau par édition, la plus récente d’abord', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Équipes' }));

    const y2026 = screen.getByRole('region', { name: "OW Women's Cup 2026" });
    const y2025 = screen.getByRole('region', { name: "OW Women's Cup 2025" });
    expect(
      y2026.compareDocumentPosition(y2025) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    expect(
      within(y2026).getByRole('link', { name: /Chocomates/ })
    ).toHaveProperty('pathname', '/team/chocomates');
    // Une équipe sans fiche reste listée, sans lien.
    expect(within(y2026).getByText('Sans fiche').closest('a')).toBeNull();
    expect(
      within(y2026).getByRole('link', { name: /résultat complet/ })
    ).toHaveProperty('pathname', '/tournament/ow-womens-cup-2026/podium');
    expect(
      within(y2025).getByRole('link', { name: /résultat complet/ })
    ).toHaveProperty('pathname', '/tournoi');
  });
});
