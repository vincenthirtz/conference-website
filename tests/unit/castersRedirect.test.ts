// Les anciennes adresses de la liste des casteuses redirigent vers
// Diffusion › Casteuses — utils/castersRedirect.ts, pages/admin/cast-members/*.

import { describe, it, expect } from 'vitest';
import { CASTERS_PATH, castersRedirect } from '../../utils/castersRedirect';
import { getServerSideProps as newRedirect } from '../../pages/admin/cast-members/new';

const dest = (r: any) => r.redirect.destination as string;

describe('castersRedirect', () => {
  it('redirige de façon permanente, sans paramètre', () => {
    const r: any = castersRedirect({});
    expect(dest(r)).toBe(CASTERS_PATH);
    expect(r.redirect.permanent).toBe(true);
  });

  it('garde les paramètres utiles et oublie l’onglet du hub', () => {
    expect(dest(castersRedirect({ tab: 'cast', new: '1', q: 'mira' }))).toBe(
      `${CASTERS_PATH}?new=1&q=mira`
    );
  });

  it('ne garde que la première valeur d’un paramètre répété', () => {
    expect(dest(castersRedirect({ q: ['a', 'b'] }))).toBe(
      `${CASTERS_PATH}?q=a`
    );
  });

  it('« nouvelle casteuse » arrive en UN saut, modale ouverte', async () => {
    const r: any = await newRedirect({} as any);
    expect(dest(r)).toBe(`${CASTERS_PATH}?new=1`);
  });
});
