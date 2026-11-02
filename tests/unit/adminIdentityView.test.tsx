// @vitest-environment happy-dom
//
// /admin/connexion — la page owner « Comptes et connexion » (Better Auth), côté écran, contre des
// réponses figées de `/api/admin/identity/**` (les routes sont testées dans conference-api ;
// formes de `features/admin/identity/model.ts`, copie synchronisée).
//
// Ce que ces cas protègent : les chiffres et le staff à relancer sont dits ; sans la migration,
// rien ne s'enregistre ; un interrupteur part en UN PUT de ce seul réglage ; couper Discord demande
// confirmation et l'annuler n'envoie rien ; un geste sur un compte est confirmé puis envoyé avec le
// bon identifiant ; l'urgence exige la phrase exacte.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import nsAdminIdentity from '@/lib/i18n/locales/admin-fr/adminIdentity';
import { format } from '@/lib/i18n/useAdminT';
import type { IdentityOverview } from '@/features/admin/identity/model';

const { adminRequest, addToast } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  addToast: vi.fn(),
}));
vi.mock('@/utils/admin/adminHttp', () => ({
  adminRequest,
  adminErrorMessage: (_err: unknown, fallback: string) => fallback,
  AdminHttpError: class AdminHttpError extends Error {},
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));

import IdentityView, {
  SIGN_OUT_EVERYONE_CONFIRMATION,
} from '@/features/admin/identity/ui/IdentityView';

const t = nsAdminIdentity.fr;
const USER = '11111111-1111-4111-8111-111111111111';

type Init = { method?: string; json?: unknown };

function overview(over: Partial<IdentityOverview> = {}): IdentityOverview {
  return {
    available: true,
    settingsStored: true,
    settings: {
      signupOpen: true,
      discordSignIn: true,
      magicLink: true,
      sessionDays: 30,
      updatedAt: '2026-11-02T15:00:00.000Z',
    },
    stats: {
      accounts: 118,
      unverified: 2,
      banned: 1,
      twoFactor: 3,
      withPassword: 91,
      withDiscord: 74,
      discordOnly: 27,
      activeSessions: 12,
      signedInPeople: 9,
      aal2Sessions: 2,
      sessions24h: 4,
      sessions7d: 15,
      signedIn7d: 8,
      throttled: 0,
    },
    staff: {
      active: 3,
      withoutTwoFactor: [
        { staffId: 's2', displayName: 'Plume', role: 'caster' },
      ],
    },
    fixed: {
      staffMfaEnforced: true,
      tokenMinutes: 5,
      sessionCacheSeconds: 60,
      settingsDelaySeconds: 60,
      signInAttemptsPerFiveMinutes: 30,
    },
    ...over,
  };
}

function show(data: IdentityOverview) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IdentityView overview={data} />
    </QueryClientProvider>
  );
}

const calls = (method: string) =>
  adminRequest.mock.calls.filter(
    ([, init]) => (init as Init | undefined)?.method === method
  );

beforeEach(() => {
  adminRequest.mockReset();
  addToast.mockReset();
  adminRequest.mockImplementation(async (url: string, init?: Init) => {
    if (url.startsWith('/api/admin/identity/accounts?')) {
      return {
        accounts: [
          {
            id: USER,
            email: 'lune@example.com',
            displayName: 'Lune',
            role: 'admin',
            emailVerified: true,
            twoFactorEnabled: true,
            activeSessions: 2,
            providers: ['credential', 'discord'],
            lastSignInAt: '2026-11-02T14:00:00.000Z',
            bannedUntil: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      };
    }
    if (url === `/api/admin/identity/accounts/${USER}`) {
      return { action: 'remove_two_factor', hadTwoFactor: true, revoked: true };
    }
    if (url === '/api/admin/identity/sign-out-everyone') return { revoked: 12 };
    if (url === '/api/admin/identity' && init?.method === 'PUT') {
      return { settings: overview().settings };
    }
    throw new Error(`appel inattendu : ${url}`);
  });
});

afterEach(() => cleanup());

describe('état et chiffres', () => {
  it('dit les chiffres et le staff à relancer', () => {
    show(overview());
    expect(screen.getByText('118')).toBeTruthy();
    expect(
      screen.getByText(format(t.statMethodsHint, { discordOnly: 27 }))
    ).toBeTruthy();
    expect(screen.getByText('Plume · caster')).toBeTruthy();
  });

  it('Better Auth indisponible : dit, ni recherche ni urgence', () => {
    show(overview({ available: false, stats: null }));
    expect(screen.getByText(t.unavailable)).toBeTruthy();
    expect(screen.queryByText(t.accountsTitle)).toBeNull();
    expect(screen.queryByText(t.signOutAllTitle)).toBeNull();
  });
});

describe('réglages', () => {
  it('un interrupteur part en un PUT de ce seul réglage', async () => {
    show(overview());
    fireEvent.click(screen.getByRole('switch', { name: t.magicLink }));
    await waitFor(() => expect(calls('PUT')).toHaveLength(1));
    expect(calls('PUT')[0]).toEqual([
      '/api/admin/identity',
      expect.objectContaining({ json: { magicLink: false } }),
    ]);
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(t.saved, 'success')
    );
  });

  it('couper Discord demande confirmation ; annuler n’envoie rien', async () => {
    show(overview());
    fireEvent.click(screen.getByRole('switch', { name: t.discordSignIn }));
    expect(await screen.findByText(t.confirmDiscordOffTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
    await waitFor(() =>
      expect(screen.queryByText(t.confirmDiscordOffTitle)).toBeNull()
    );
    expect(calls('PUT')).toHaveLength(0);
  });

  it('sans la migration : dit, et rien ne se change', () => {
    show(overview({ settingsStored: false }));
    expect(screen.getByText(t.settingsMissing)).toBeTruthy();
    const toggle = screen.getByRole('switch', {
      name: t.signupOpen,
    }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
  });
});

describe('un compte', () => {
  it('retirer la double authentification : confirmé, envoyé pour ce compte', async () => {
    show(overview());
    fireEvent.change(screen.getByLabelText(t.searchLabel), {
      target: { value: 'lune' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.search }));
    expect(await screen.findByText('lune@example.com')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: t.actionRemoveTwoFactor })
    );
    expect(
      await screen.findByText(
        format(t.confirmRemoveTitle, { email: 'lune@example.com' })
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.confirmAction }));
    await waitFor(() =>
      expect(calls('POST')).toEqual([
        [
          `/api/admin/identity/accounts/${USER}`,
          expect.objectContaining({ json: { action: 'remove_two_factor' } }),
        ],
      ])
    );
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(t.doneRemove, 'success')
    );
  });
});

describe('urgence', () => {
  it('le bouton n’agit qu’avec la phrase exacte', async () => {
    show(overview());
    fireEvent.click(screen.getByRole('button', { name: t.signOutAllAction }));
    const input = screen.getByLabelText(
      t.typeToConfirm.replace('{name}', SIGN_OUT_EVERYONE_CONFIRMATION)
    );
    const run = () =>
      screen
        .getAllByRole('button', { name: t.signOutAllAction })
        .at(-1) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: 'deconnecter' } });
    expect(run().disabled).toBe(true);
    fireEvent.change(input, {
      target: { value: SIGN_OUT_EVERYONE_CONFIRMATION },
    });
    expect(run().disabled).toBe(false);
    fireEvent.click(run());
    await waitFor(() =>
      expect(calls('POST')).toEqual([
        [
          '/api/admin/identity/sign-out-everyone',
          expect.objectContaining({
            json: { confirm: SIGN_OUT_EVERYONE_CONFIRMATION },
          }),
        ],
      ])
    );
  });
});
