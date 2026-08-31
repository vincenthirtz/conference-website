import { describe, expect, it } from 'vitest';
import {
  readTeamLogo,
  isLogoAsset,
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

describe('isLogoAsset', () => {
  it('reconnaît le dossier des logos, pas le nom du fichier', () => {
    expect(isLogoAsset('/img/logos/2026-logo.png')).toBe(true);
    expect(isLogoAsset('https://owwomenscup.fr/img/logos/pogtv.png')).toBe(true);
    // Un fichier qui s'appelle « logo » sans être rangé là n'en est pas un.
    expect(isLogoAsset('/img/teams-images/logo-eclypse.png')).toBe(false);
    expect(isLogoAsset('https://cdn.test/cover.jpg')).toBe(false);
    expect(isLogoAsset(null)).toBe(false);
  });
});

describe('resolveNewsImage', () => {
  it('signale une bannière d’article comme recadrable', () => {
    expect(
      resolveNewsImage('https://cdn.test/cover.jpg', { logo_url: LOGO })
    ).toEqual({ url: 'https://cdn.test/cover.jpg', fitContain: false });
  });

  // La régression qui a motivé le drapeau : une actu illustrée À LA MAIN avec
  // le logo du tournoi passait pour une bannière et se faisait rogner.
  it('cadre en contain un logo choisi éditorialement', () => {
    expect(resolveNewsImage('/img/logos/2026-logo.png', null)).toEqual({
      url: '/img/logos/2026-logo.png',
      fitContain: true,
    });
  });

  it('signale le repli logo d’équipe, pour que le cadrage passe en contain', () => {
    // Une bannière se recadre volontiers ; un logo carré s'y fait massacrer.
    expect(resolveNewsImage(null, { logo_url: LOGO })).toEqual({
      url: LOGO,
      fitContain: true,
    });
  });

  it('sans image ni logo : rien, et pas de faux drapeau', () => {
    expect(resolveNewsImage('', null)).toEqual({
      url: null,
      fitContain: false,
    });
  });
});
