// @vitest-environment happy-dom
//
// Éditeur de page publique `/team/[slug]/edit` (lot P10) : archétype Fiche,
// formulaire sur schéma. Garde le comportement visible d'avant : corps du
// PATCH (même forme, annonce en ISO), couleur / intégration invalides
// bloquées avant l'envoi (toast), message de succès ; et la portée act-as
// (`?as=…&act=1`) portée par l'enregistrement.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  getSession: async () => ({ data: { session: { access_token: 't' } } }),
  refreshSession: vi.fn(async () => ({})),
}));
vi.mock('@/utils/supabaseBrowser', () => ({ supabaseClient: { auth } }));
vi.mock('next/router', () => ({
  default: { asPath: '/team/alpha/edit', replace: vi.fn() },
  useRouter: () => ({
    asPath: '/team/alpha/edit',
    query: {},
    replace: vi.fn(),
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

import TeamPageEditorScreen from '../../features/player/team/ui/pageEditor/TeamPageEditorScreen';
import type { EditableTeamDto } from '../../features/player/team/schemas';
import { renderPlayer } from './__helpers__/playerHarness';

const TEAM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUBJECT = 'c0000000-0000-4000-8000-00000000000a';

const team: EditableTeamDto = {
  id: TEAM_ID,
  slug: 'alpha',
  name: 'Alpha',
  short_name: 'ALP',
  logo_url: null,
  tcg_image_path: null,
  banner_url: null,
  description: 'Bio',
  public_content: null,
  accent_color: null,
  secondary_color: null,
  banner_overlay: null,
  banner_focal: null,
  twitter: null,
  discord: null,
  website: null,
  youtube: null,
  twitch: null,
  instagram: null,
  tiktok: null,
  achievements: null,
  sponsors: null,
  embed_provider: null,
  embed_id: null,
  pinned_announcement: null,
  pinned_announcement_until: null,
  captain_id: null,
};

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({ updatedFields: ['description'] }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

const render = (scope = {}) =>
  renderPlayer(
    <TeamPageEditorScreen team={team} tcgImageUrl={null} members={[]} />,
    scope
  );

const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

describe('éditeur de page publique', () => {
  it('enregistre le corps attendu et annonce le succès', async () => {
    render();
    fireEvent.change(screen.getByLabelText('Description courte'), {
      target: { value: 'Nouvelle bio' },
    });
    save();
    await waitFor(() => expect(calls).toHaveLength(1));
    const call = calls[0];
    expect(call.method).toBe('PATCH');
    expect(call.url).toBe(`/api/teams/${TEAM_ID}/public-page`);
    expect(call.body).toMatchObject({
      description: 'Nouvelle bio',
      embed_url: null,
      pinned_announcement_until: null,
      achievements: [],
      sponsors: [],
    });
    expect(call.body).not.toHaveProperty('pinned_until');
    expect(
      await screen.findByText('Page mise à jour (1 champ modifié).')
    ).toBeTruthy();
  });

  it('couleur invalide : rien n’est envoyé, toast d’erreur', async () => {
    render();
    fireEvent.change(screen.getByLabelText("Couleur d'accent"), {
      target: { value: 'pas-une-couleur' },
    });
    save();
    expect(
      await screen.findByText(
        'Couleur invalide — utilise un hex (#rgb ou #rrggbb).'
      )
    ).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('act-as staff : bandeau affiché, enregistrement au nom du sujet', async () => {
    render({ subjectId: SUBJECT, actAs: true });
    expect(screen.getByText(/agir en tant que/)).toBeTruthy();
    save();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe(
      `/api/teams/${TEAM_ID}/public-page?as=${SUBJECT}&act=1`
    );
  });
});
