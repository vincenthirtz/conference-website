// Pure mapping helpers for the LoL / Dota 2 hero sync — no network, no DB.
// The actual fetch/upsert orchestration is exercised at integration level.

import { describe, it, expect } from 'vitest';

import {
  mapLolChampionToRow,
  mapDotaHeroToRow,
  dotaShortName,
  dotaPrimaryAttrToAttribute,
} from '../../utils/gameHeroesSync';

const NOW = '2026-05-26T12:00:00.000Z';

describe('mapLolChampionToRow', () => {
  it('maps a typical Data Dragon champion payload', () => {
    const row = mapLolChampionToRow(
      {
        key: '266',
        id: 'Aatrox',
        name: 'Aatrox',
        title: 'the Darkin Blade',
        tags: ['Fighter', 'Tank'],
        image: { full: 'Aatrox.png' },
      },
      '15.10.1',
      NOW
    );

    expect(row).toMatchObject({
      game: 'lol',
      external_id: '266',
      key: 'Aatrox',
      name: 'Aatrox',
      title: 'the Darkin Blade',
      roles: ['Fighter', 'Tank'],
      attribute: null,
      image_url:
        'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_0.jpg',
      icon_url:
        'https://ddragon.leagueoflegends.com/cdn/15.10.1/img/champion/Aatrox.png',
      enabled: true,
      fetched_at: NOW,
      updated_at: NOW,
    });
    expect(row.data).toEqual({ version: '15.10.1', image: 'Aatrox.png' });
  });

  it('tolerates missing tags + missing image gracefully', () => {
    const row = mapLolChampionToRow(
      {
        key: '999',
        id: 'Mystery',
        name: 'Mystery',
        title: '',
      },
      '15.10.1',
      NOW
    );
    expect(row.roles).toEqual([]);
    expect(row.title).toBe('');
    expect(row.data).toEqual({ version: '15.10.1', image: null });
  });

  it('URL-encodes the champion id for splash + icon', () => {
    const row = mapLolChampionToRow(
      { key: '1', id: 'Kha Zix', name: 'Kha Zix', title: '' },
      '15.10.1',
      NOW
    );
    expect(row.image_url).toContain('Kha%20Zix_0.jpg');
    expect(row.icon_url).toContain('Kha%20Zix.png');
  });
});

describe('dotaShortName', () => {
  it('strips the npc_dota_hero_ prefix', () => {
    expect(dotaShortName('npc_dota_hero_antimage')).toBe('antimage');
    expect(dotaShortName('npc_dota_hero_phantom_assassin')).toBe(
      'phantom_assassin'
    );
  });
  it('returns the input unchanged when prefix is absent', () => {
    expect(dotaShortName('antimage')).toBe('antimage');
  });
});

describe('dotaPrimaryAttrToAttribute', () => {
  it('maps the four canonical OpenDota values', () => {
    expect(dotaPrimaryAttrToAttribute('str')).toBe('strength');
    expect(dotaPrimaryAttrToAttribute('agi')).toBe('agility');
    expect(dotaPrimaryAttrToAttribute('int')).toBe('intelligence');
    expect(dotaPrimaryAttrToAttribute('all')).toBe('universal');
  });
  it('returns null for unknown attribute codes', () => {
    expect(dotaPrimaryAttrToAttribute('foo')).toBeNull();
    expect(dotaPrimaryAttrToAttribute('')).toBeNull();
  });
});

describe('mapDotaHeroToRow', () => {
  it('maps a typical OpenDota hero payload', () => {
    const row = mapDotaHeroToRow(
      {
        id: 1,
        name: 'npc_dota_hero_antimage',
        localized_name: 'Anti-Mage',
        primary_attr: 'agi',
        attack_type: 'Melee',
        roles: ['Carry', 'Escape', 'Nuker'],
        legs: 2,
      },
      NOW
    );

    expect(row).toMatchObject({
      game: 'dota2',
      external_id: '1',
      key: 'antimage',
      name: 'Anti-Mage',
      title: null,
      roles: ['Carry', 'Escape', 'Nuker'],
      attribute: 'agility',
      image_url:
        'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/antimage.png',
      icon_url:
        'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/antimage.png',
      enabled: true,
      fetched_at: NOW,
      updated_at: NOW,
    });
    expect(row.data).toEqual({
      npc_name: 'npc_dota_hero_antimage',
      attack_type: 'Melee',
      legs: 2,
    });
  });

  it('handles universal heroes (primary_attr = "all")', () => {
    const row = mapDotaHeroToRow(
      {
        id: 138,
        name: 'npc_dota_hero_marci',
        localized_name: 'Marci',
        primary_attr: 'all',
        roles: ['Carry', 'Support'],
      },
      NOW
    );
    expect(row.attribute).toBe('universal');
    expect(row.key).toBe('marci');
  });

  it('defaults missing roles to empty array', () => {
    const row = mapDotaHeroToRow(
      {
        id: 2,
        name: 'npc_dota_hero_axe',
        localized_name: 'Axe',
        primary_attr: 'str',
      },
      NOW
    );
    expect(row.roles).toEqual([]);
    expect(row.attribute).toBe('strength');
    expect(row.data).toMatchObject({ attack_type: null, legs: null });
  });
});
