import { describe, expect, it } from 'vitest';
import {
  readTeamLogo,
  resolveNewsImage,
  resolveNewsImageUrl,
} from '../../utils/news/newsImage';

const LOGO = 'https://cdn.test/eclypse.png';

describe('readTeamLogo', () => {
  it('lit un embed objet', () => {
    expect(readTeamLogo({ logo_url: LOGO })).toBe(LOGO);
  });

  it('lit un embed tableau (PostgREST rend les deux formes)', () => {
    expect(readTeamLogo([{ logo_url: LOGO }])).toBe(LOGO);
  });

  it('renvoie null sur un embed absent, vide ou sans logo', () => {
    expect(readTeamLogo(null)).toBeNull();
    expect(readTeamLogo(undefined)).toBeNull();
    expect(readTeamLogo([])).toBeNull();
    expect(readTeamLogo({})).toBeNull();
    expect(readTeamLogo({ logo_url: null })).toBeNull();
  });

  it('traite une chaîne vide ou blanche comme absente', () => {
    expect(readTeamLogo({ logo_url: '' })).toBeNull();
    expect(readTeamLogo({ logo_url: '   ' })).toBeNull();
  });
});

describe('resolveNewsImageUrl', () => {
  it('le choix éditorial explicite l’emporte sur le logo', () => {
    // Une actu illustrée à la main garde SON visuel, même rattachée à une équipe.
    expect(
      resolveNewsImageUrl('https://cdn.test/cover.jpg', { logo_url: LOGO })
    ).toBe('https://cdn.test/cover.jpg');
  });

  it('retombe sur le logo de l’équipe quand l’article n’a pas d’image', () => {
    // Le cœur du correctif : le logo posé APRÈS la publication remonte enfin.
    expect(resolveNewsImageUrl(null, { logo_url: LOGO })).toBe(LOGO);
    expect(resolveNewsImageUrl(undefined, [{ logo_url: LOGO }])).toBe(LOGO);
  });

  it('traite une image_url vide comme absente', () => {
    // Plusieurs chemins d'écriture déposent '' plutôt que NULL, et un src=""
    // casse le rendu.
    expect(resolveNewsImageUrl('', { logo_url: LOGO })).toBe(LOGO);
    expect(resolveNewsImageUrl('  ', { logo_url: LOGO })).toBe(LOGO);
  });

  it('renvoie null quand il n’y a ni image ni logo (dégradé de repli)', () => {
    expect(resolveNewsImageUrl(null, null)).toBeNull();
    expect(resolveNewsImageUrl('', { logo_url: null })).toBeNull();
    expect(resolveNewsImageUrl(undefined, [])).toBeNull();
  });

  it('garde l’image même sans équipe liée', () => {
    expect(resolveNewsImageUrl('https://cdn.test/cover.jpg', null)).toBe(
      'https://cdn.test/cover.jpg'
    );
  });
});

describe('resolveNewsImage', () => {
  it('signale une image d’article comme NON dérivée du logo', () => {
    expect(
      resolveNewsImage('https://cdn.test/cover.jpg', { logo_url: LOGO })
    ).toEqual({ url: 'https://cdn.test/cover.jpg', fromTeamLogo: false });
  });

  it('signale le repli logo, pour que le cadrage passe en contain', () => {
    // Une bannière se recadre volontiers ; un logo carré s'y fait massacrer.
    expect(resolveNewsImage(null, { logo_url: LOGO })).toEqual({
      url: LOGO,
      fromTeamLogo: true,
    });
  });

  it('sans image ni logo : rien, et pas de faux drapeau', () => {
    expect(resolveNewsImage('', null)).toEqual({
      url: null,
      fromTeamLogo: false,
    });
  });
});
