// tests/unit/adminLoginRedirect.test.ts — 401 admin : `?next=` vers la page
// courante (lot A2), sans jamais produire de cible externe ni de boucle.

import { describe, it, expect } from 'vitest';
import { loginPathWithNext } from '../../utils/admin/loginRedirect';

describe('loginPathWithNext', () => {
  it('ajoute le chemin courant encodé', () => {
    expect(
      loginPathWithNext('/admin/login', '/admin/teams/42/edit?tab=roster')
    ).toBe(
      `/admin/login?next=${encodeURIComponent('/admin/teams/42/edit?tab=roster')}`
    );
  });

  it('ignore un chemin absent ou externe', () => {
    expect(loginPathWithNext('/admin/login', null)).toBe('/admin/login');
    expect(loginPathWithNext('/admin/login', undefined)).toBe('/admin/login');
    expect(loginPathWithNext('/admin/login', '//evil.example')).toBe(
      '/admin/login'
    );
    expect(loginPathWithNext('/admin/login', '/\\evil.example')).toBe(
      '/admin/login'
    );
    expect(loginPathWithNext('/admin/login', 'https://evil.example')).toBe(
      '/admin/login'
    );
  });

  it('ne renvoie pas vers une page de connexion (boucle)', () => {
    expect(loginPathWithNext('/admin/login', '/login?next=/admin')).toBe(
      '/admin/login'
    );
    expect(loginPathWithNext('/admin/login', '/admin/login')).toBe(
      '/admin/login'
    );
  });

  it('respecte un loginPath qui porte déjà sa query', () => {
    expect(loginPathWithNext('/login?next=/player', '/admin/x')).toBe(
      '/login?next=/player'
    );
  });
});
