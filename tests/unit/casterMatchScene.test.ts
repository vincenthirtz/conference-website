import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAPS,
  castersLine,
  defaultMatchData,
  formatHashtag,
  mapOptions,
  normalizeBan,
  normalizeMatchData,
  parseCastersInput,
  seriesDotsModel,
  teamInitial,
} from '@/utils/caster/matchScene';

describe('normalizeBan', () => {
  it('accepte un objet héros complet', () => {
    expect(
      normalizeBan({
        key: 'bastion',
        name: 'Bastion',
        portrait: 'https://x/p.png',
      })
    ).toEqual({ name: 'Bastion', portrait: 'https://x/p.png' });
  });

  it('retombe sur key quand name manque', () => {
    expect(normalizeBan({ key: 'ana' })).toEqual({ name: 'ana', portrait: '' });
  });

  it('tolère une chaîne nue (legacy)', () => {
    expect(normalizeBan('  Sombra ')).toEqual({ name: 'Sombra', portrait: '' });
  });

  it('rend null pour vide / invalide', () => {
    expect(normalizeBan(null)).toBeNull();
    expect(normalizeBan('')).toBeNull();
    expect(normalizeBan('   ')).toBeNull();
    expect(normalizeBan({})).toBeNull();
    expect(normalizeBan(42)).toBeNull();
  });
});

describe('seriesDotsModel', () => {
  it('BO5 avec score 2-1 → pastilles gagnées correspondantes', () => {
    const model = seriesDotsModel({
      bestOf: 5,
      score1: 2,
      score2: 1,
      seriesDots: true,
    });
    expect(model).not.toBeNull();
    expect(model!.t1).toEqual([true, true, false, false, false]);
    expect(model!.t2).toEqual([true, false, false, false, false]);
  });

  it('masqué quand seriesDots === false', () => {
    expect(
      seriesDotsModel({ bestOf: 5, score1: 0, score2: 0, seriesDots: false })
    ).toBeNull();
  });

  it('masqué quand le BO est absent ou < 2', () => {
    expect(
      seriesDotsModel({ bestOf: 0, score1: 0, score2: 0, seriesDots: true })
    ).toBeNull();
    expect(
      seriesDotsModel({ bestOf: 1, score1: 0, score2: 0, seriesDots: true })
    ).toBeNull();
  });

  it('plafonne à 9 pastilles', () => {
    const model = seriesDotsModel({
      bestOf: 15,
      score1: 0,
      score2: 0,
      seriesDots: true,
    });
    expect(model!.t1).toHaveLength(9);
  });
});

describe('formatHashtag', () => {
  it('préfixe # quand absent et le conserve quand présent', () => {
    expect(formatHashtag('WomensCup')).toBe('#WomensCup');
    expect(formatHashtag('#WomensCup')).toBe('#WomensCup');
    expect(formatHashtag('')).toBe('');
  });
});

describe('castersLine', () => {
  it('joint le tableau avec « · » et ignore les entrées vides', () => {
    expect(castersLine(['A', '', 'B'])).toBe('A · B');
    expect(castersLine([])).toBe('');
    expect(castersLine('Solo')).toBe('Solo');
    expect(castersLine(null)).toBe('');
  });
});

describe('teamInitial', () => {
  it('prend la première lettre en capitale, ? par défaut', () => {
    expect(teamInitial('chocolat')).toBe('C');
    expect(teamInitial('')).toBe('?');
  });
});

describe('parseCastersInput', () => {
  it('découpe sur la virgule en trimant', () => {
    expect(parseCastersInput(' Caster A ,Caster B,, ')).toEqual([
      'Caster A',
      'Caster B',
    ]);
    expect(parseCastersInput('')).toEqual([]);
  });
});

describe('mapOptions', () => {
  it('utilise les maps du tournoi quand fournies', () => {
    expect(
      mapOptions([{ map_name: 'Oasis' }, { map_name: 'Busan' }], 'Busan')
    ).toEqual(['Oasis', 'Busan']);
  });

  it('retombe sur le pool par défaut sinon', () => {
    expect(mapOptions(null, '')).toEqual([...DEFAULT_MAPS]);
    expect(mapOptions([], '')).toEqual([...DEFAULT_MAPS]);
  });

  it('préserve une valeur courante hors liste (map custom / renommée)', () => {
    const opts = mapOptions([{ map_name: 'Oasis' }], 'Vieille Map');
    expect(opts[0]).toBe('Vieille Map');
    expect(opts).toContain('Oasis');
  });
});

describe('normalizeMatchData', () => {
  it('fusionne une data partielle avec les défauts', () => {
    const d = normalizeMatchData({ team1: 'Chocolat', score1: '2' });
    expect(d.team1).toBe('Chocolat');
    expect(d.score1).toBe(2);
    expect(d.bestOf).toBe(5);
    expect(d.seriesDots).toBe(true);
    expect(d.overwatchHud).toBe(false);
    expect(d.socials.twitch).toBe('');
  });

  it('data vide → défauts complets', () => {
    expect(normalizeMatchData(null)).toEqual(defaultMatchData());
  });

  it('préserve les bans objets et les socials partiels', () => {
    const d = normalizeMatchData({
      ban1: { key: 'bastion', name: 'Bastion', portrait: 'p' },
      socials: { twitch: 'twitch.tv/womens_cup' },
    });
    expect(d.ban1).toEqual({ key: 'bastion', name: 'Bastion', portrait: 'p' });
    expect(d.socials.twitch).toBe('twitch.tv/womens_cup');
    expect(d.socials.discord).toBe('');
  });
});
