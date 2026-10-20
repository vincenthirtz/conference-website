// @vitest-environment happy-dom
//
// Onglet « Library » de /admin/moderation — l'ACCÈS à la Women's Library
// (lot 14c, une bêta par liste), côté écran, contre des réponses figées de
// `/api/admin/library/access` et `/api/admin/teams` (les routes sont testées
// dans conference-api ; formes de `features/admin/library/accessModel.ts`,
// copie synchronisée).
//
// Ce que ces cas protègent : le panneau ne s'affiche qu'avec
// `manage_settings` ; il dit ce que la porte applique (dérogation, valeur
// illisible) ; le brouillon (mode, équipe cherchée, joueuse par identifiant
// ou par pseudo, retraits) part en UN PUT à la version lue ; ouvrir à toutes
// demande confirmation ; un conflit (409) est dit et la version à jour relue.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import nsAdminLibraryAccess from '@/lib/i18n/locales/admin-fr/adminLibraryAccess';
import { format } from '@/lib/i18n/useAdminT';
import type { LibraryAccessResponse } from '@/features/admin/library/accessModel';

const { adminRequest, addToast } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  addToast: vi.fn(),
}));
vi.mock('@/utils/admin/adminHttp', () => ({
  adminRequest,
  adminErrorMessage: (_err: unknown, fallback: string) => fallback,
  // Lu par le socle de formulaire (`useAdminForm`) quand l'envoi échoue.
  AdminHttpError: class AdminHttpError extends Error {},
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));

import LibraryAccessPanel from '@/components/admin/moderation/LibraryAccessPanel';

const t = nsAdminLibraryAccess.fr;
const TEAM_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const TEAM_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const LUNE = '11111111-1111-4111-8111-111111111111';
const NEW_ID = '33333333-3333-4333-8333-333333333333';

const ADMIN = { id: 's1', role: 'admin', display_name: null };

type Init = { method?: string; json?: any };

let state: LibraryAccessResponse;
let putReply: ((body: any) => Promise<unknown>) | null = null;

function base(
  over: Partial<LibraryAccessResponse> = {}
): LibraryAccessResponse {
  return {
    mode: 'beta',
    rev: 4,
    invalid: false,
    envOverride: null,
    effectiveMode: 'beta',
    teams: [
      { id: TEAM_A, name: 'Les Lunes', deleted: false, acceptedMembers: 5 },
    ],
    players: [{ userId: LUNE, nickname: 'Lune' }],
    ...over,
  };
}

function routeApi() {
  adminRequest.mockImplementation((url: string, init?: Init) => {
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/admin/library/access')) {
      if (method === 'PUT') {
        if (putReply) return putReply(init?.json);
        state = {
          ...state,
          mode: init?.json?.mode,
          rev: state.rev + 1,
          effectiveMode: init?.json?.mode,
        };
        return Promise.resolve(state);
      }
      return Promise.resolve(state);
    }
    if (url.startsWith('/api/admin/teams?')) {
      return Promise.resolve({
        teams: [
          { id: TEAM_A, name: 'Les Lunes', short_name: 'LUN' },
          { id: TEAM_B, name: 'Les Brumes', short_name: null },
        ],
      });
    }
    return Promise.reject(new Error(`inattendu : ${method} ${url}`));
  });
}

function wrap(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

const calls = (method: string, prefix: string) =>
  adminRequest.mock.calls.filter(
    (c) =>
      ((c[1] as Init | undefined)?.method ?? 'GET') === method &&
      String(c[0]).startsWith(prefix)
  );
const puts = () => calls('PUT', '/api/admin/library/access');

beforeEach(() => {
  state = base();
  putReply = null;
  adminRequest.mockReset();
  addToast.mockReset();
  routeApi();
});
afterEach(cleanup);

describe('LibraryAccessPanel — garde', () => {
  it('sans manage_settings (caster qui modère) : rien n’est affiché ni lu', () => {
    wrap(
      <LibraryAccessPanel
        staff={{
          id: 's2',
          role: 'caster',
          display_name: null,
          permissions: ['use_cast_cockpit', 'moderate_support'],
        }}
      />
    );
    expect(screen.queryByTestId('library-access-panel')).toBeNull();
    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('un droit manage_settings accordé l’affiche', async () => {
    wrap(
      <LibraryAccessPanel
        staff={{
          id: 's3',
          role: 'caster',
          display_name: null,
          permissions: ['use_cast_cockpit', 'manage_settings'],
        }}
      />
    );
    expect(await screen.findByTestId('library-access-panel')).toBeTruthy();
  });
});

describe('LibraryAccessPanel — état', () => {
  it('dit le mode appliqué, les équipes (membres acceptées) et les joueuses', async () => {
    wrap(<LibraryAccessPanel staff={ADMIN} />);
    const team = await screen.findByTestId('library-access-team');
    expect(team.textContent).toContain('Les Lunes');
    expect(team.textContent).toContain(format(t.teamMembersMany, { count: 5 }));
    const player = screen.getByTestId('library-access-player');
    expect(player.textContent).toContain('Lune');
    expect(player.textContent).toContain(LUNE);
    expect(
      (
        screen.getByRole('radio', {
          name: new RegExp(t.modeBeta),
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    // Rien de modifié : on n'enregistre pas.
    expect(
      (screen.getByRole('button', { name: t.save }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('dérogation LIBRARY_ACCESS et valeur illisible : signalées', async () => {
    state = base({
      envOverride: 'staff',
      effectiveMode: 'staff',
      invalid: true,
    });
    wrap(<LibraryAccessPanel staff={ADMIN} />);
    expect(
      await screen.findByText(format(t.envOverride, { mode: t.modeStaff }))
    ).toBeTruthy();
    expect(screen.getByText(t.invalidSetting)).toBeTruthy();
  });

  it('une équipe supprimée se voit', async () => {
    state = base({
      teams: [
        { id: TEAM_A, name: 'Les Lunes', deleted: true, acceptedMembers: 1 },
      ],
    });
    wrap(<LibraryAccessPanel staff={ADMIN} />);
    const team = await screen.findByTestId('library-access-team');
    expect(team.textContent).toContain(t.teamDeleted);
    expect(team.textContent).toContain(t.teamMembersOne);
  });
});

describe('LibraryAccessPanel — brouillon et enregistrement', () => {
  it('équipe cherchée, joueuse par identifiant et par pseudo, retrait : un seul PUT à la version lue', async () => {
    wrap(<LibraryAccessPanel staff={ADMIN} />);
    await screen.findByTestId('library-access-team');

    // Équipe : recherche (l'équipe déjà listée n'est pas proposée).
    fireEvent.change(
      screen.getByRole('searchbox', { name: t.teamSearchLabel }),
      { target: { value: 'les' } }
    );
    const results = await screen.findAllByTestId(
      'library-access-team-result',
      {},
      { timeout: 2000 }
    );
    expect(results[0].textContent).toContain(t.teamAlreadyListed);
    fireEvent.click(
      within(results[1]).getByRole('button', {
        name: format(t.teamAddAria, { name: 'Les Brumes' }),
      })
    );
    expect(screen.getAllByTestId('library-access-team')).toHaveLength(2);

    // Joueuses : saisie invalide refusée, puis UUID et pseudo.
    const entry = screen.getByRole('textbox', { name: t.playerAddLabel });
    const addForm = screen.getByTestId('library-access-player-form');
    fireEvent.change(entry, { target: { value: 'x' } });
    fireEvent.submit(addForm);
    expect(await within(addForm).findByText(t.playerAddInvalid)).toBeTruthy();
    fireEvent.change(entry, { target: { value: NEW_ID } });
    fireEvent.submit(addForm);
    await waitFor(() =>
      expect(screen.getAllByTestId('library-access-player')).toHaveLength(2)
    );
    fireEvent.change(entry, { target: { value: 'Soleil' } });
    fireEvent.submit(addForm);
    await waitFor(() =>
      expect(screen.getAllByTestId('library-access-player')).toHaveLength(3)
    );
    // Doublon refusé.
    fireEvent.change(entry, { target: { value: NEW_ID } });
    fireEvent.submit(addForm);
    expect(await within(addForm).findByText(t.playerAddDuplicate)).toBeTruthy();

    // Retirer Lune.
    fireEvent.click(
      screen.getByRole('button', {
        name: format(t.playerRemoveAria, { name: 'Lune' }),
      })
    );
    expect(screen.getByText(t.unsaved)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][1].json).toEqual({
      mode: 'beta',
      teamIds: [TEAM_A, TEAM_B],
      userIds: [NEW_ID],
      nicknames: ['Soleil'],
      rev: 4,
    });
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(t.saved, 'success')
    );
  });

  it('retirer une équipe : elle ne part plus', async () => {
    wrap(<LibraryAccessPanel staff={ADMIN} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: format(t.teamRemoveAria, { name: 'Les Lunes' }),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][1].json).toMatchObject({ teamIds: [], userIds: [LUNE] });
  });

  it('ouvrir à toutes : confirmation, et rien sans elle', async () => {
    wrap(<LibraryAccessPanel staff={ADMIN} />);
    await screen.findByTestId('library-access-team');
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t.modeAll) }));

    fireEvent.click(screen.getByRole('button', { name: t.save }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /annuler/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(puts()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: t.save }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: t.confirmAllLabel })
    );
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][1].json.mode).toBe('all');
  });

  it('passer en staff : pas de confirmation', async () => {
    wrap(<LibraryAccessPanel staff={ADMIN} />);
    await screen.findByTestId('library-access-team');
    fireEvent.click(
      screen.getByRole('radio', { name: new RegExp(t.modeStaff) })
    );
    expect(screen.getByText(t.listsInactive)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(puts()[0][1].json.mode).toBe('staff');
  });

  it('conflit (409) : dit, puis la version à jour est relue', async () => {
    putReply = () =>
      Promise.reject(
        Object.assign(new Error('conflit'), {
          status: 409,
          code: 'library_access_conflict',
        })
      );
    wrap(<LibraryAccessPanel staff={ADMIN} />);
    await screen.findByTestId('library-access-team');
    const getsBefore = calls('GET', '/api/admin/library/access').length;
    state = base({ rev: 5, players: [] });
    fireEvent.click(
      screen.getByRole('button', {
        name: format(t.playerRemoveAria, { name: 'Lune' }),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText(t.errorConflict)).toBeTruthy();
    await waitFor(() =>
      expect(calls('GET', '/api/admin/library/access').length).toBeGreaterThan(
        getsBefore
      )
    );
    expect(addToast).not.toHaveBeenCalledWith(t.saved, 'success');
  });

  it('pseudo inconnu (404) : dit dans la langue de l’écran', async () => {
    putReply = () =>
      Promise.reject(
        Object.assign(new Error('x'), { status: 404, code: 'player_not_found' })
      );
    wrap(<LibraryAccessPanel staff={ADMIN} />);
    await screen.findByTestId('library-access-team');
    const entry = screen.getByRole('textbox', { name: t.playerAddLabel });
    fireEvent.change(entry, { target: { value: 'Inconnue' } });
    fireEvent.submit(screen.getByTestId('library-access-player-form'));
    await waitFor(() =>
      expect(screen.getAllByTestId('library-access-player')).toHaveLength(2)
    );
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText(t.errorPlayerNotFound)).toBeTruthy();
  });
});
