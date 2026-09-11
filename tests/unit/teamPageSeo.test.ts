import { describe, it, expect } from 'vitest';
import {
  buildTeamSeo,
  teamCanonicalPath,
  teamRedirectDestination,
  TEAM_SEO_BASE_URL,
} from '@/components/Team/teamPageSeo';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('teamRedirectDestination', () => {
  const team = { id: ID, slug: 'les-lionnes' };

  it('ne redirige pas quand le paramètre est déjà le slug', () => {
    expect(teamRedirectDestination('les-lionnes', team)).toBeNull();
  });

  it('redirige un UUID vers le slug', () => {
    expect(teamRedirectDestination(ID, team)).toBe('/team/les-lionnes');
  });

  it('redirige un nom ou un short_name vers le slug', () => {
    expect(teamRedirectDestination('Les Lionnes', team)).toBe(
      '/team/les-lionnes'
    );
    expect(teamRedirectDestination('LNS', team)).toBe('/team/les-lionnes');
  });

  it('redirige un slug de mauvaise casse', () => {
    expect(teamRedirectDestination('Les-Lionnes', team)).toBe(
      '/team/les-lionnes'
    );
  });

  it("équipe sans slug : l'id est le canonique, un nom y redirige", () => {
    const noSlug = { id: ID, slug: null };
    expect(teamRedirectDestination(ID, noSlug)).toBeNull();
    expect(teamRedirectDestination('Les Lionnes', noSlug)).toBe(`/team/${ID}`);
  });

  it('pas de boucle : la destination, relue comme paramètre, ne redirige plus', () => {
    const dest = teamRedirectDestination(ID, team)!;
    const param = decodeURIComponent(dest.replace('/team/', ''));
    expect(teamRedirectDestination(param, team)).toBeNull();
  });
});

describe('buildTeamSeo', () => {
  it('titre = nom, JSON-LD SportsTeam sur l’URL canonique', () => {
    const seo = buildTeamSeo({
      id: ID,
      slug: 'les-lionnes',
      name: 'Les Lionnes',
      logo_url: '/img/teams-images/lionnes.png',
    });
    expect(seo.title).toBe('Les Lionnes');
    const ld = seo.jsonLd as Record<string, unknown>;
    expect(ld['@type']).toBe('SportsTeam');
    expect(ld.url).toBe(`${TEAM_SEO_BASE_URL}/team/les-lionnes`);
    expect(ld.logo).toBe(`${TEAM_SEO_BASE_URL}/img/teams-images/lionnes.png`);
  });

  it('description saisie : tronquée à 155, telle quelle', () => {
    const seo = buildTeamSeo({
      id: ID,
      name: 'X',
      description: 'a'.repeat(400),
    });
    expect(typeof seo.description).toBe('string');
    expect((seo.description as string).length).toBe(155);
  });

  it('sans description : générique bilingue', () => {
    const seo = buildTeamSeo({ id: ID, name: 'X' });
    expect(seo.description).toEqual({
      fr: expect.stringContaining('X'),
      en: expect.stringContaining('X'),
    });
  });

  it('image : bannière en priorité, sinon logo, sinon rien', () => {
    expect(
      buildTeamSeo({
        id: ID,
        name: 'X',
        banner_url: 'https://cdn.example/b.png',
        logo_url: '/l.png',
      }).image
    ).toBe('https://cdn.example/b.png');
    expect(buildTeamSeo({ id: ID, name: 'X', logo_url: '/l.png' }).image).toBe(
      `${TEAM_SEO_BASE_URL}/l.png`
    );
    expect('image' in buildTeamSeo({ id: ID, name: 'X' })).toBe(false);
  });

  it('teamCanonicalPath retombe sur l’id', () => {
    expect(teamCanonicalPath({ id: ID, slug: '' })).toBe(`/team/${ID}`);
  });
});
