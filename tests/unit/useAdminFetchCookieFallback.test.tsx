// @vitest-environment happy-dom
//
// Sans session LISIBLE côté navigateur (cookies `sb-*` forcés HttpOnly après un
// rafraîchissement serveur), useAdminFetch abandonnait localement : la liste
// admin restait bloquée sur « Chargement… » (e2e admin-listings, HttpOnly).
// Désormais la requête part sans Bearer et le serveur authentifie par cookies.
// Un visiteur réellement anonyme garde l'ancien comportement : erreur 401
// locale, sans redirection.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

const { replace, getSession, asPath } = vi.hoisted(() => ({
  asPath: { value: undefined as string | undefined },
  replace: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: null } })),
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ replace, asPath: asPath.value }),
}));
vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: { auth: { getSession } },
}));

import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';

const fetchMock = vi.fn();

beforeEach(() => {
  replace.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useAdminFetch — repli cookies', () => {
  it('sans jeton lisible, envoie la requête (cookies) sans Bearer', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [1] }), { status: 200 })
    );
    const { result } = renderHook(() => useAdminFetch());
    const json = await result.current.adminFetchJson<{ items: number[] }>(
      '/api/admin/users/manage'
    );
    expect(json.items).toEqual([1]);
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(init.credentials).toBe('same-origin');
  });

  it('anonyme (401 sans jeton) : erreur locale, aucune redirection', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const { result } = renderHook(() => useAdminFetch());
    await expect(result.current.adminFetch('/api/x')).rejects.toBeInstanceOf(
      AdminFetchError
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('avec jeton : Bearer posé, 401 redirige vers la connexion', async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
    } as never);
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const { result } = renderHook(() => useAdminFetch());
    await result.current.adminFetch('/api/x');
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
    expect(replace).toHaveBeenCalledWith('/admin/login');
  });

  it('401 avec jeton : ?next= vers la page courante', async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
    } as never);
    asPath.value = '/admin/tournament/3/edit';
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const { result } = renderHook(() => useAdminFetch());
    await result.current.adminFetch('/api/x');
    expect(replace).toHaveBeenCalledWith(
      `/admin/login?next=${encodeURIComponent('/admin/tournament/3/edit')}`
    );
    asPath.value = undefined;
  });
});
