// @vitest-environment happy-dom
//
// Hub /admin/moderation : l'onglet « Library » (bannissements de la Women's
// Library) suit le droit EXACT de sa route, `moderate_support`, lu sur les
// permissions effectives que `withStaffPage` pose sur `staff`.
//
// Ce que ces cas protègent : un caster ne voit pas l'onglet, et un lien
// `?tab=library` ne lui monte pas le panneau (il retombe sur « Litiges ») ;
// owner et admin le voient, comme l'onglet Support ; un droit accordé à
// l'unité l'ouvre aussi.

import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import nsAdminModeration from '@/lib/i18n/locales/admin-fr/adminModeration';

const { router, stubPanel } = vi.hoisted(() => ({
  router: {
    pathname: '/admin/moderation',
    query: {} as Record<string, string>,
    replace: vi.fn(),
    push: vi.fn(),
  },
  /** Fabrique de mock : un panneau réduit à un repère `data-testid`. */
  stubPanel: (testId: string) => async () => {
    const React = await import('react');
    return {
      default: (props: { currentStaffId?: string }) =>
        React.createElement(
          'div',
          { 'data-testid': testId },
          props.currentStaffId ?? ''
        ),
    };
  },
}));
vi.mock('next/router', () => ({ useRouter: () => router }));
// La garde SSR n'est pas le sujet ici (cf. adminPageGuards) : seul le rendu.
vi.mock('@/utils/staff', () => ({
  withStaffPage: () => async () => ({ props: {} }),
}));
// Les panneaux lourds sont remplacés par des repères ; `lazyPanel` par
// `React.lazy`, pour que le hub charge VRAIMENT le module de l'onglet.
vi.mock('@/components/admin/lazyPanel', async () => {
  const React = await import('react');
  return {
    lazyPanel: (
      loader: () => Promise<{ default: React.ComponentType<object> }>
    ) => React.lazy(loader),
  };
});
vi.mock(
  '@/components/admin/moderation/LibraryBansPanel',
  stubPanel('library-panel')
);
// Chat de la Library (lot 6) : mêmes repères, dans le même onglet.
vi.mock(
  '@/components/admin/moderation/LibraryChatSwitch',
  stubPanel('library-chat-switch')
);
vi.mock(
  '@/components/admin/moderation/LibraryChatMessagesPanel',
  stubPanel('library-chat-messages')
);
vi.mock(
  '@/components/admin/moderation/LibraryChatMutesList',
  stubPanel('library-chat-mutes')
);
vi.mock('@/components/admin/moderation/SupportPanel', stubPanel('support'));
vi.mock('@/components/admin/moderation/BlacklistPanel', stubPanel('bl'));
vi.mock('@/components/admin/moderation/EntityBlacklistPanel', stubPanel('ebl'));
vi.mock('@/components/admin/moderation/CommentsPanel', stubPanel('comments'));
vi.mock(
  '@/components/admin/moderation/DisputesPanel',
  stubPanel('disputes-panel')
);

import AdminModerationPage from '@/pages/admin/moderation/index';

const t = nsAdminModeration.fr;

function renderHub(staff: { role: string; permissions?: string[] }) {
  return render(
    <Suspense fallback={null}>
      <AdminModerationPage
        staff={{ id: 'staff-1', display_name: 'Modo', ...staff }}
      />
    </Suspense>
  );
}

const libraryTab = () => screen.queryByRole('tab', { name: t.tabLibrary });

afterEach(() => {
  cleanup();
  router.query = {};
});

describe('hub de modération — onglet Library', () => {
  it('admin (moderate_support par son rôle) : l’onglet, comme Support', async () => {
    router.query = { tab: 'library' };
    renderHub({
      role: 'admin',
      permissions: ['moderate_support', 'manage_tcg'],
    });

    // D'abord le panneau : tant que son module charge, `Suspense` masque tout.
    const panel = await screen.findByTestId('library-panel');
    // Le panneau reçoit l'identifiant du staff (« Vous » dans la liste).
    expect(panel.textContent).toBe('staff-1');
    expect(libraryTab()).not.toBeNull();
    expect(libraryTab()?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: t.tabSupport })).toBeTruthy();
    // Le chat (lot 6) vit dans le même onglet, au-dessus des bannissements.
    expect(screen.getByTestId('library-chat-switch')).toBeTruthy();
    expect(screen.getByTestId('library-chat-messages')).toBeTruthy();
    expect(screen.getByTestId('library-chat-mutes')).toBeTruthy();
  });

  it('owner, même sans permissions lues : le rôle suffit', async () => {
    router.query = { tab: 'library' };
    renderHub({ role: 'owner' });

    expect(await screen.findByTestId('library-panel')).toBeTruthy();
    expect(libraryTab()).not.toBeNull();
  });

  it('caster : ni onglet, ni panneau par lien direct', async () => {
    router.query = { tab: 'library' };
    renderHub({ role: 'caster', permissions: ['use_cast_cockpit'] });

    // `?tab=library` retombe sur le premier onglet permis : les litiges.
    expect(await screen.findByTestId('disputes-panel')).toBeTruthy();
    expect(screen.queryByTestId('library-panel')).toBeNull();
    expect(screen.queryByTestId('library-chat-switch')).toBeNull();
    expect(libraryTab()).toBeNull();
    expect(screen.queryByRole('tab', { name: t.tabSupport })).toBeNull();
  });

  it('caster à qui `moderate_support` est accordé à l’unité : l’onglet s’ouvre', async () => {
    router.query = { tab: 'library' };
    renderHub({
      role: 'caster',
      permissions: ['use_cast_cockpit', 'moderate_support'],
    });

    expect(await screen.findByTestId('library-panel')).toBeTruthy();
    expect(libraryTab()).not.toBeNull();
  });
});
