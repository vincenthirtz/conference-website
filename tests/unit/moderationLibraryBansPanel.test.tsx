// @vitest-environment happy-dom
//
// Onglet « Library » de /admin/moderation — côté écran, contre des réponses
// figées de `/api/admin/library/bans` (la route est testée dans
// conference-api ; formes de `features/admin/library/model.ts`, copie
// synchronisée).
//
// Ce que ces cas protègent : la liste dit qui est bannie, jusqu'à quand et par
// qui, même quand l'avatar n'existe plus ; un identifiant qui n'est pas un
// UUID ne part jamais ; la durée choisie devient l'échéance `until` envoyée
// (ou `null`, définitif) ; un bannissement et une levée passent par une
// confirmation, et rien ne part si on l'annule.

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
import nsAdminModerationLibrary from '@/lib/i18n/locales/admin-fr/adminModerationLibrary';
import type {
  LibraryBanItem,
  LibraryBanListResponse,
} from '@/features/admin/library/model';

const { adminRequest, addToast } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  addToast: vi.fn(),
}));
vi.mock('@/utils/admin/adminHttp', () => ({
  adminRequest,
  adminErrorMessage: (_err: unknown, fallback: string) => fallback,
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));

import LibraryBansPanel from '@/components/admin/moderation/LibraryBansPanel';

const t = nsAdminModerationLibrary.fr;

const ME = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_STAFF = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LOLA_ID = '11111111-1111-4111-8111-111111111111';
const GONE_ID = '22222222-2222-4222-8222-222222222222';
const DAY_MS = 24 * 3_600_000;

const LOLA: LibraryBanItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  userId: LOLA_ID,
  nickname: 'Lola',
  reason: 'Insultes répétées dans le hall',
  until: null,
  createdAt: '2026-10-19T20:00:00.000Z',
  byStaffId: ME,
  active: true,
};

const GONE: LibraryBanItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  userId: GONE_ID,
  nickname: null,
  reason: null,
  until: '2026-10-26T20:00:00.000Z',
  createdAt: '2026-10-19T19:00:00.000Z',
  byStaffId: null,
  active: true,
};

const OTHER: LibraryBanItem = {
  ...LOLA,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
  userId: '33333333-3333-4333-8333-333333333333',
  nickname: 'Mira',
  byStaffId: OTHER_STAFF,
};

type Init = { method?: string; json?: unknown; idempotent?: boolean };

/** Aiguille le mock selon la méthode : GET liste, POST bannit, DELETE lève. */
function routeApi(handlers: {
  list: () => Promise<LibraryBanListResponse>;
  ban?: (body: unknown) => Promise<unknown>;
  lift?: (url: string) => Promise<unknown>;
}) {
  adminRequest.mockImplementation((url: string, init?: Init) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return handlers.list();
    if (method === 'POST' && handlers.ban) return handlers.ban(init?.json);
    if (method === 'DELETE' && handlers.lift) return handlers.lift(url);
    return Promise.reject(new Error(`inattendu : ${method} ${url}`));
  });
}

const listOf = (items: LibraryBanItem[]) => () =>
  Promise.resolve({ items, total: items.length });

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <LibraryBansPanel currentStaffId={ME} />
    </QueryClientProvider>
  );
}

const callsWith = (method: string) =>
  adminRequest.mock.calls.filter(
    (c) => ((c[1] as Init | undefined)?.method ?? 'GET') === method
  );

const targetInput = () =>
  screen.getByRole('textbox', { name: t.libTargetByUserId });
const reasonInput = () =>
  screen.getByRole('textbox', { name: t.libReasonLabel });

beforeEach(() => {
  adminRequest.mockReset();
  addToast.mockReset();
});
afterEach(cleanup);

describe('LibraryBansPanel — liste', () => {
  it('lit les bannissements EN COURS et dit qui, jusqu’à quand, par qui', async () => {
    routeApi({ list: listOf([LOLA, GONE, OTHER]) });
    renderPanel();

    const rows = await screen.findAllByTestId('library-ban-row');
    expect(rows).toHaveLength(3);
    expect(String(adminRequest.mock.calls[0][0])).toMatch(
      /^\/api\/admin\/library\/bans\?active=true/
    );

    // Définitif, décidé par soi : « Vous ».
    const lola = within(rows[0]);
    expect(lola.getByRole('rowheader').textContent).toBe('Lola');
    expect(rows[0].textContent).toContain(LOLA_ID);
    expect(rows[0].textContent).toContain('Insultes répétées dans le hall');
    expect(rows[0].textContent).toContain(t.libPermanent);
    expect(rows[0].textContent).toContain(t.libByYou);

    // Avatar disparu, sans motif, staff parti : la ligne reste lisible.
    const gone = within(rows[1]);
    expect(gone.getByRole('rowheader').textContent).toBe(t.libNoAvatar);
    expect(rows[1].textContent).toContain(GONE_ID);
    expect(rows[1].textContent).toContain(t.libNoReason);
    expect(rows[1].textContent).toContain(t.libByFormerStaff);
    expect(rows[1].textContent).not.toContain(t.libPermanent);
    expect(
      rows[1].querySelector(`time[datetime="${GONE.until}"]`)
    ).not.toBeNull();

    // Un autre membre du staff : son identifiant abrégé.
    expect(rows[2].textContent).toContain(`${OTHER_STAFF.slice(0, 8)}…`);

    expect(screen.getByText(/3 bannissements en cours/)).toBeTruthy();
    // Sémantique de tableau : en-têtes de colonnes et légende.
    expect(screen.getByRole('table', { name: t.libListCaption })).toBeTruthy();
    expect(
      screen.getByRole('columnheader', { name: t.libColUntil })
    ).toBeTruthy();
  });

  it('copie l’identifiant de compte', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    routeApi({ list: listOf([LOLA]) });
    renderPanel();

    fireEvent.click(
      await screen.findByRole('button', {
        name: `Copier l’identifiant de compte de Lola`,
      })
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LOLA_ID));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(t.libCopied, 'success')
    );
  });

  it('liste vide : un état vide, pas un tableau', async () => {
    routeApi({ list: listOf([]) });
    renderPanel();

    expect(await screen.findByText(t.libEmptyTitle)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('erreur de lecture : un message et « Réessayer » relit', async () => {
    let fail = true;
    routeApi({
      list: () =>
        fail
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ items: [LOLA], total: 1 }),
    });
    renderPanel();

    expect(await screen.findByText(t.libLoadError)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: t.libRetry }));
    expect(await screen.findAllByTestId('library-ban-row')).toHaveLength(1);
  });
});

describe('LibraryBansPanel — bannir', () => {
  it('refuse un identifiant qui n’est pas un UUID, sans rien envoyer', async () => {
    routeApi({ list: listOf([]) });
    renderPanel();
    await screen.findByText(t.libEmptyTitle);

    fireEvent.change(targetInput(), { target: { value: 'lola-1234' } });
    fireEvent.change(reasonInput(), { target: { value: 'Mineure présumée' } });
    fireEvent.click(screen.getByRole('button', { name: t.libSubmit }));

    expect(await screen.findByText(t.libUserIdInvalid)).toBeTruthy();
    expect(targetInput().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(targetInput());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(callsWith('POST')).toHaveLength(0);
  });

  it('exige un motif', async () => {
    routeApi({ list: listOf([]) });
    renderPanel();
    await screen.findByText(t.libEmptyTitle);

    fireEvent.change(targetInput(), { target: { value: LOLA_ID } });
    fireEvent.change(reasonInput(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: t.libSubmit }));

    expect(await screen.findByText(t.libReasonRequired)).toBeTruthy();
    expect(document.activeElement).toBe(reasonInput());
    expect(callsWith('POST')).toHaveLength(0);
  });

  it('7 jours → `until` à J+7, après confirmation, et relit la liste', async () => {
    let listed: LibraryBanItem[] = [];
    const ban = vi.fn((body: unknown) => {
      listed = [LOLA];
      return Promise.resolve({ ban: { ...LOLA, ...(body as object) } });
    });
    routeApi({ list: () => Promise.resolve({ items: listed, total: 0 }), ban });
    renderPanel();
    await screen.findByText(t.libEmptyTitle);

    // Un identifiant collé avec des espaces (copie depuis le ticket) passe.
    fireEvent.change(targetInput(), { target: { value: `  ${LOLA_ID} ` } });
    fireEvent.change(reasonInput(), { target: { value: 'Harcèlement' } });
    fireEvent.click(screen.getByRole('radio', { name: t.libDuration7d }));
    fireEvent.click(screen.getByRole('button', { name: t.libSubmit }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(LOLA_ID);
    expect(dialog.textContent).toContain(t.libDuration7d);
    expect(callsWith('POST')).toHaveLength(0);

    const before = Date.now();
    fireEvent.click(
      within(dialog).getByRole('button', { name: t.libConfirmBanLabel })
    );
    await waitFor(() => expect(ban).toHaveBeenCalledTimes(1));
    const after = Date.now();

    const [url, init] = callsWith('POST')[0] as [string, Init];
    expect(url).toBe('/api/admin/library/bans');
    expect(init.idempotent).toBe(true);
    const body = init.json as { userId: string; reason: string; until: string };
    expect(body.userId).toBe(LOLA_ID);
    expect(body).not.toHaveProperty('nickname');
    expect(body.reason).toBe('Harcèlement');
    const until = Date.parse(body.until);
    expect(until).toBeGreaterThanOrEqual(before + 7 * DAY_MS);
    expect(until).toBeLessThanOrEqual(after + 7 * DAY_MS);

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        '« Lola » est bannie de la Library.',
        'success'
      )
    );
    // Formulaire vidé, liste relue.
    expect((targetInput() as HTMLInputElement).value).toBe('');
    expect(await screen.findAllByTestId('library-ban-row')).toHaveLength(1);
  });

  it('« Définitif » envoie `until: null` ; par pseudo, sans identifiant', async () => {
    const ban = vi.fn(() => Promise.resolve({ ban: LOLA }));
    routeApi({ list: listOf([]), ban });
    renderPanel();
    await screen.findByText(t.libEmptyTitle);

    fireEvent.click(screen.getByRole('radio', { name: t.libTargetByNickname }));
    fireEvent.change(
      screen.getByRole('textbox', { name: t.libTargetByNickname }),
      { target: { value: 'Lola' } }
    );
    fireEvent.change(reasonInput(), { target: { value: 'Mineure présumée' } });
    fireEvent.click(
      screen.getByRole('radio', { name: t.libDurationPermanent })
    );
    fireEvent.click(screen.getByRole('button', { name: t.libSubmit }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: t.libConfirmBanLabel })
    );

    await waitFor(() => expect(ban).toHaveBeenCalledTimes(1));
    expect(ban).toHaveBeenCalledWith({
      nickname: 'Lola',
      reason: 'Mineure présumée',
      until: null,
    });
  });

  it('confirmation annulée : rien ne part', async () => {
    routeApi({ list: listOf([]), ban: vi.fn() });
    renderPanel();
    await screen.findByText(t.libEmptyTitle);

    fireEvent.change(targetInput(), { target: { value: LOLA_ID } });
    fireEvent.change(reasonInput(), { target: { value: 'Spam' } });
    fireEvent.click(screen.getByRole('button', { name: t.libSubmit }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /annuler/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(callsWith('POST')).toHaveLength(0);
  });

  it('joueuse introuvable (`player_not_found`) : l’erreur se pose sur le champ', async () => {
    const notFound = Object.assign(new Error('Aucune joueuse.'), {
      status: 404,
      code: 'player_not_found',
    });
    routeApi({ list: listOf([]), ban: () => Promise.reject(notFound) });
    renderPanel();
    await screen.findByText(t.libEmptyTitle);

    fireEvent.change(targetInput(), { target: { value: LOLA_ID } });
    fireEvent.change(reasonInput(), { target: { value: 'Spam' } });
    fireEvent.click(screen.getByRole('button', { name: t.libSubmit }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: t.libConfirmBanLabel,
      })
    );

    expect(await screen.findByText(t.libErrorNotFound)).toBeTruthy();
    expect(targetInput().getAttribute('aria-invalid')).toBe('true');
    // La saisie reste là, pour corriger.
    expect((targetInput() as HTMLInputElement).value).toBe(LOLA_ID);
  });
});

describe('LibraryBansPanel — lever', () => {
  it('confirme, puis DELETE ?userId= et relit la liste', async () => {
    let listed: LibraryBanItem[] = [LOLA];
    const lift = vi.fn(() => {
      listed = [];
      return Promise.resolve({ userId: LOLA_ID, lifted: 1 });
    });
    routeApi({
      list: () => Promise.resolve({ items: listed, total: listed.length }),
      lift,
    });
    renderPanel();

    const liftBtn = await screen.findByRole('button', {
      name: 'Lever le bannissement de Lola',
    });

    // Annuler : rien ne part.
    fireEvent.click(liftBtn);
    let dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Lola');
    fireEvent.click(within(dialog).getByRole('button', { name: /annuler/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(lift).not.toHaveBeenCalled();

    // Confirmer.
    fireEvent.click(liftBtn);
    dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: t.libConfirmLiftLabel })
    );
    await waitFor(() => expect(lift).toHaveBeenCalledTimes(1));
    const [url, init] = callsWith('DELETE')[0] as [string, Init];
    expect(url).toBe(`/api/admin/library/bans?userId=${LOLA_ID}`);
    expect(init.idempotent).toBe(true);

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Bannissement levé pour « Lola ».',
        'success'
      )
    );
    expect(await screen.findByText(t.libEmptyTitle)).toBeTruthy();
  });

  it('compte supprimé (lot 14b) : « Compte supprimé », pas d’identifiant à copier, levée par `?id=`', async () => {
    const DELETED: LibraryBanItem = {
      ...GONE,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009',
      userId: null,
      nickname: null,
      until: null,
    };
    let listed: LibraryBanItem[] = [DELETED];
    const lift = vi.fn(() => {
      listed = [];
      return Promise.resolve({ userId: null, lifted: 1 });
    });
    routeApi({
      list: () => Promise.resolve({ items: listed, total: listed.length }),
      lift,
    });
    renderPanel();

    const [row] = await screen.findAllByTestId('library-ban-row');
    expect(within(row).getByRole('rowheader').textContent).toBe(
      t.libAccountDeleted
    );
    expect(row.textContent).toContain(t.libAccountDeletedHint);
    expect(row.textContent).toContain(t.libPermanent);
    expect(within(row).queryByRole('button', { name: /Copier/ })).toBeNull();

    fireEvent.click(
      within(row).getByRole('button', {
        name: `Lever le bannissement de ${t.libAccountDeleted}`,
      })
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(t.libConfirmLiftDeletedSubtitle);
    fireEvent.click(
      within(dialog).getByRole('button', { name: t.libConfirmLiftLabel })
    );
    await waitFor(() => expect(lift).toHaveBeenCalledTimes(1));
    const [url] = callsWith('DELETE')[0] as [string, Init];
    expect(url).toBe(`/api/admin/library/bans?id=${DELETED.id}`);
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        `Bannissement levé pour « ${t.libAccountDeleted} ».`,
        'success'
      )
    );
  });

  it('rien à lever (`lifted: 0`) : on le dit, sans prétendre l’avoir fait', async () => {
    routeApi({
      list: listOf([LOLA]),
      lift: () => Promise.resolve({ userId: LOLA_ID, lifted: 0 }),
    });
    renderPanel();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Lever le bannissement de Lola',
      })
    );
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: t.libConfirmLiftLabel,
      })
    );
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(t.libLiftedNone, 'info')
    );
  });
});
