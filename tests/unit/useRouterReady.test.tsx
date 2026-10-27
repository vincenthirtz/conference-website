// @vitest-environment happy-dom
//
// hooks/useRouterReady.ts — `router.isReady` sans écart d'hydratation.
//
// Rejoue ce que fait Next sur une page pré-rendue ouverte SANS query : le
// serveur rend avec `isReady` à false, le navigateur hydrate avec `isReady`
// déjà à true. Un composant qui branche son rendu sur `router.isReady` produit
// alors l'erreur React #418 (constaté sur /overlay/day, finales, standings,
// don-alert le 2026-10-27). Le témoin prouve que ce test sait la voir.

import { act, createElement } from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ isReady: false }));
vi.mock('next/router', () => ({ useRouter: () => router }));

import { useRouter } from 'next/router';
import { useRouterReady } from '@/hooks/useRouterReady';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function WithHook() {
  return createElement('p', null, useRouterReady() ? 'prêt' : 'attente');
}

/** Témoin : le motif d'avant, `router.isReady` lu directement au rendu. */
function WithIsReady() {
  return createElement('p', null, useRouter().isReady ? 'prêt' : 'attente');
}

/** Rendu serveur avec isReady=false, puis hydratation avec isReady=true. */
async function hydrateLikeNext(
  component: () => ReturnType<typeof createElement>
) {
  router.isReady = false;
  const html = renderToString(createElement(component));
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  router.isReady = true;
  const errors: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, createElement(component), {
      onRecoverableError: (e) => errors.push(e),
    });
  });
  return { html, container, errors };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useRouterReady', () => {
  it('hydrate sans écart, puis passe à « prêt »', async () => {
    const { html, container, errors } = await hydrateLikeNext(WithHook);
    expect(html).toContain('attente');
    expect(errors).toEqual([]);
    expect(container.textContent).toBe('prêt');
  });

  it('témoin : `router.isReady` lu au rendu provoque bien l’écart d’hydratation', async () => {
    const { errors } = await hydrateLikeNext(WithIsReady);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('hors hydratation (navigation côté client), suit isReady dès le premier rendu', async () => {
    for (const [isReady, text] of [
      [true, 'prêt'],
      [false, 'attente'],
    ] as const) {
      router.isReady = isReady;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(createElement(WithHook));
      });
      expect(container.textContent).toBe(text);
      await act(async () => root.unmount());
    }
  });
});
