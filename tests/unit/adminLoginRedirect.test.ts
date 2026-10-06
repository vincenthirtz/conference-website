import { describe, it, expect } from 'vitest';
import type { GetServerSidePropsContext } from 'next';

import { getServerSideProps } from '../../pages/admin/login';

// /admin/login est désormais un alias historique : il redirige (SSR) vers la
// page de connexion unifiée /login en préservant la query (?next=…).
function run(query: Record<string, string | string[]>) {
  return getServerSideProps({ query } as unknown as GetServerSidePropsContext);
}

describe('/admin/login → redirection vers /login', () => {
  it('redirige vers /login (temporaire) sans query', async () => {
    const result: any = await run({});
    expect(result.redirect.destination).toBe('/login');
    expect(result.redirect.permanent).toBe(false);
  });

  it('préserve le paramètre next', async () => {
    const result: any = await run({ next: '/team/abc/edit' });
    // URLSearchParams encode la valeur ; next doit être transmis.
    const url = new URL(result.redirect.destination, 'https://x');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe('/team/abc/edit');
  });

  it('préserve plusieurs paramètres', async () => {
    const result: any = await run({ next: '/player', error: 'expired' });
    const url = new URL(result.redirect.destination, 'https://x');
    expect(url.searchParams.get('next')).toBe('/player');
    expect(url.searchParams.get('error')).toBe('expired');
  });
});
