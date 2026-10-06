// @vitest-environment happy-dom
//
// Écran « Mon profil » (lot P9) : module features/player/profile, rendu dans
// le harnais joueuse + cache. Garde le comportement visible d'avant la
// migration : corps du PATCH (Twitch envoyé seulement s'il change), messages
// de succès / d'avertissement roster, hôte d'avatar traduit, contrôle du mot
// de passe AVANT toute ré-authentification, suppression derrière sa
// confirmation (et idempotente), rien en inspection.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';

const auth = vi.hoisted(() => ({
  getSession: async () => ({ data: { session: { access_token: 't' } } }),
  refreshSession: vi.fn(async () => ({})),
  signInWithPassword: vi.fn(async () => ({ error: null })),
  updateUser: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({})),
}));
vi.mock('@/utils/supabaseBrowser', () => ({ supabaseClient: { auth } }));
const replace = vi.hoisted(() => vi.fn(async () => true));
vi.mock('next/router', () => ({
  default: { asPath: '/player/profile', replace },
  useRouter: () => ({ asPath: '/player/profile', query: {}, replace }),
}));

import ProfileEditPanel from '../../features/player/profile/ui/ProfileEditPanel';
import { PasswordChangePanel } from '../../features/player/profile/ui/AccountSecurityPanels';
import DataRightsPanel from '../../features/player/profile/ui/DataRightsPanel';
import ProfileScreen from '../../features/player/profile/ui/ProfileScreen';
import { PlayerQueryProvider } from '../../features/player/_shared/query';
import { renderPlayer } from './__helpers__/playerHarness';

const USER = '4f1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e7f';

type Call = {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
};
let calls: Call[] = [];
let patchReply: { status: number; body: unknown };
let deleteReply: { status: number; body: unknown };

beforeEach(() => {
  calls = [];
  patchReply = { status: 200, body: { success: true, rosterSynced: true } };
  deleteReply = { status: 200, body: { success: true } };
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body, headers: new Headers(init?.headers) });
    const r =
      method === 'PATCH'
        ? patchReply
        : method === 'DELETE'
          ? deleteReply
          : {
              status: 200,
              body: { twitch: 'nova_tv', twitchOrigin: 'roster' },
            };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

function render(ui: ReactElement, scope = {}) {
  return renderPlayer(<PlayerQueryProvider>{ui}</PlayerQueryProvider>, scope);
}

function editPanel() {
  return render(
    <ProfileEditPanel
      userId={USER}
      displayName="Nova"
      meta={{ battle_tag: 'Nova#1234' }}
      needsBattleTagSetup={false}
    />
  );
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('ProfileEditPanel', () => {
  it('montre la chaîne publiée par le roster et n’envoie pas Twitch inchangé', async () => {
    editPanel();
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Chaîne Twitch') as HTMLInputElement).value
      ).toBe('nova_tv')
    );
    expect(screen.getByText(/Renseignée par ta capitaine/)).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('BattleTag'), {
        target: { value: 'Nouveau#4242' },
      });
    });
    await click('Enregistrer');
    await screen.findByText('Profil mis a jour.');
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toBe('/api/player/update-profile');
    expect(patch.body).toEqual({
      display_name: 'Nova',
      battle_tag: 'Nouveau#4242',
      skill_rating: null,
      specialty: null,
      avatar_url: '',
    });
    expect(auth.refreshSession).toHaveBeenCalled();
  });

  it('avertit quand le roster n’a pas suivi, traduit l’hôte d’avatar refusé', async () => {
    patchReply = { status: 200, body: { success: true, rosterSynced: false } };
    editPanel();
    await click('Enregistrer');
    await screen.findByText(/fiche d'équipe n'a pas pu être mise à jour/);

    patchReply = {
      status: 400,
      body: { error: 'x', code: 'AVATAR_HOST_UNSUPPORTED' },
    };
    await click('Enregistrer');
    await screen.findByText(/Cet hébergeur d'image n'est pas pris en charge/);
  });

  it('« Retirer ce lien » envoie clear_twitch seul', async () => {
    editPanel();
    await screen.findByRole('button', { name: 'Retirer ce lien' });
    await click('Retirer ce lien');
    await screen.findByText(/Le lien Twitch a été retiré/);
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      clear_twitch: true,
    });
  });
});

describe('PasswordChangePanel', () => {
  it('refuse une confirmation différente AVANT toute ré-authentification', async () => {
    render(<PasswordChangePanel email="nova@example.com" />);
    const fill = async (label: RegExp, value: string) =>
      act(async () => {
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
      });
    await fill(/^Mot de passe actuel/, 'old-password');
    await fill(/^Nouveau mot de passe/, 'Password123!');
    await fill(/^Confirmer le mot de passe/, 'Different123!');
    await click('Changer mon mot de passe');
    expect(screen.getByText(/ne correspondent pas/)).toBeTruthy();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe('DataRightsPanel', () => {
  it('supprime seulement après confirmation, avec une clé d’idempotence', async () => {
    render(<DataRightsPanel />);
    await click('Supprimer mon compte');
    expect(screen.getByText(/irréversible/)).toBeTruthy();
    await click('Annuler');
    expect(calls).toHaveLength(0);

    await click('Supprimer mon compte');
    await click('Confirmer la suppression');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    const del = calls.find((c) => c.method === 'DELETE')!;
    expect(del.url).toBe('/api/player/delete-account');
    expect(del.headers.get('Idempotency-Key')).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('capitaine d’une équipe avec d’autres membres : bloque et renvoie vers le transfert', async () => {
    deleteReply = {
      status: 409,
      body: {
        error: 'Tu es capitaine…',
        code: 'captain_must_transfer',
        teams: [{ id: 't1', name: 'Les Aurores' }],
      },
    };
    render(<DataRightsPanel />);
    await click('Supprimer mon compte');
    await click('Confirmer la suppression');
    const block = await screen.findByTestId('delete-account-captain-block');
    expect(block.textContent).toContain('Transfère d’abord ton capitanat');
    expect(block.textContent).toContain('Les Aurores');
    const link = screen.getByRole('link', { name: 'Transférer le capitanat' });
    expect(link.getAttribute('href')).toBe('/player/manage-team');
    // Le compte n'est pas supprimé : ni déconnexion ni redirection.
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('ProfileScreen en inspection', () => {
  it('ne rend rien et ne lit rien (routes « soi seulement »)', () => {
    const { container } = render(<ProfileScreen />, { subjectId: USER });
    expect(container.textContent).toBe('');
    expect(calls).toHaveLength(0);
  });
});
