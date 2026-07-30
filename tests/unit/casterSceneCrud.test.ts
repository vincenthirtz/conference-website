import { describe, expect, it } from 'vitest';

import {
  defaultOverlayFile,
  defaultSceneData,
  defaultSceneName,
  dropInList,
  duplicateName,
  moveInList,
} from '@/utils/caster/sceneCrud';
import { CASTER_SCENE_TYPES } from '@/types/caster';

const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('moveInList', () => {
  it('échange avec la voisine du dessus / dessous', () => {
    expect(moveInList(list, 'b', -1)?.map((s) => s.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(moveInList(list, 'b', 1)?.map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('null hors bornes ou id inconnu', () => {
    expect(moveInList(list, 'a', -1)).toBeNull();
    expect(moveInList(list, 'c', 1)).toBeNull();
    expect(moveInList(list, 'zz', 1)).toBeNull();
  });

  it('ne mute pas la liste d’origine', () => {
    moveInList(list, 'b', -1);
    expect(list.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('dropInList', () => {
  it('dépose avant la cible', () => {
    expect(dropInList(list, 'c', 'a', false)?.map((s) => s.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('dépose après la cible', () => {
    expect(dropInList(list, 'a', 'c', true)?.map((s) => s.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('gère le décalage d’un glissement vers le bas', () => {
    // 'a' retiré → ['b','c'] ; avant 'c' ⇒ index 1.
    expect(dropInList(list, 'a', 'c', false)?.map((s) => s.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('null sur no-op ou cible/source inconnue', () => {
    expect(dropInList(list, 'a', 'a', false)).toBeNull();
    expect(dropInList(list, '', 'a', false)).toBeNull();
    expect(dropInList(list, 'zz', 'a', false)).toBeNull();
    expect(dropInList(list, 'a', 'zz', false)).toBeNull();
  });
});

describe('duplicateName', () => {
  it('suffixe « (copie) » puis numérote', () => {
    expect(duplicateName('Match', [])).toBe('Match (copie)');
    expect(duplicateName('Match', ['Match (copie)'])).toBe('Match (copie 2)');
    expect(duplicateName('Match', ['Match (copie)', 'Match (copie 2)'])).toBe(
      'Match (copie 3)'
    );
  });
});

describe('defaultSceneName / defaultOverlayFile', () => {
  it('couvre les 12 types', () => {
    for (const type of CASTER_SCENE_TYPES) {
      expect(defaultSceneName(type)).toBeTruthy();
      expect(defaultOverlayFile(type)).toBe(`${type}.html`);
    }
  });
});

describe('defaultSceneData', () => {
  it('rend une data non vide pour chacun des 12 types', () => {
    for (const type of CASTER_SCENE_TYPES) {
      const data = defaultSceneData(type);
      expect(Object.keys(data).length).toBeGreaterThan(0);
    }
  });

  it('rend un objet NEUF à chaque appel (pas de template partagé)', () => {
    const a = defaultSceneData('match');
    const b = defaultSceneData('match');
    expect(a).not.toBe(b);
    expect(a.socials).not.toBe(b.socials);
    (a.socials as Record<string, string>).twitch = 'muté';
    expect((b.socials as Record<string, string>).twitch).toBe(
      'twitch.tv/womens_cup'
    );
  });

  it('respecte les contrats par type', () => {
    const match = defaultSceneData('match');
    expect(match.matchId).toBeNull();
    expect(match.overwatchHud).toBe(false);
    expect(match.seriesDots).toBe(true);

    const mvp = defaultSceneData('mvp');
    expect(mvp.isOpen).toBe(false);
    expect(mvp.candidates).toEqual([]);

    const scrim = defaultSceneData('scrim');
    expect(scrim.mode).toBe('next');
    expect(scrim.scrimId).toBeNull();

    const leaderboard = defaultSceneData('leaderboard');
    expect(leaderboard.mode).toBe('leaderboard');
    expect(leaderboard.topN).toBe(8); // dans les bornes 3..20

    const webcam = defaultSceneData('webcam');
    expect(webcam.mode).toBe('solo');
    expect(webcam.cam1).toEqual({ label: '', deviceId: '' });

    // La scène end n'a pas de hashtag (parité éditeur desktop).
    expect(defaultSceneData('end').hashtag).toBeUndefined();
  });
});
