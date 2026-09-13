// tests/unit/recommendCardHero.test.ts
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LA JOUEUSE PASSE AVANT LA DÉDUCTION. Ses picks priment toujours sur son
//      rôle : elle a dit ce qui la représente, on n'a pas à le deviner.
//   2. UN BAN EST RESPECTÉ MÊME SUR UN REPLI. Bannir un héros veut dire « pas
//      celui-là pour moi » ; le proposer quand même parce qu'il correspond au
//      rôle viderait le ban de son sens.
//   3. ON NE TIRE JAMAIS AU HASARD. Sans préférence ni rôle exploitable, on ne
//      rend rien — attribuer un personnage à quelqu'un qui n'a rien demandé est
//      exactement ce que le socle refuse.
//   4. LE RÉSULTAT EST STABLE. Deux appels identiques rendent le même héros,
//      sans quoi la carte changerait de visage d'une visite à l'autre.

import { describe, it, expect } from 'vitest';

import { recommendCardHero } from '../../utils/heroes/recommendCardHero';

describe('recommendCardHero', () => {
  it('rend le premier pick, marqué comme un CHOIX', () => {
    const r = recommendCardHero({ picks: ['Kiriko', 'Ana'] });
    expect(r?.hero.name).toBe('Kiriko');
    expect(r?.source).toBe('pick');
  });

  it('respecte l’ordre de préférence', () => {
    const r = recommendCardHero({ picks: ['Ana', 'Kiriko'] });
    expect(r?.hero.name).toBe('Ana');
  });

  it('saute un pick banni plutôt que de contredire le ban', () => {
    // La base interdit déjà cette contradiction, mais une donnée ancienne ou
    // une écriture hors API pourrait la porter : on tranche en faveur du ban.
    const r = recommendCardHero({ picks: ['Ana', 'Kiriko'], bans: ['Ana'] });
    expect(r?.hero.name).toBe('Kiriko');
  });

  it('ignore un héros inconnu au lieu d’échouer', () => {
    // Héros retiré du jeu, ou saisie d'une version antérieure du référentiel.
    const r = recommendCardHero({ picks: ['Zzzz', 'Mercy'] });
    expect(r?.hero.name).toBe('Mercy');
  });

  it('retombe sur le rôle, marqué comme une SUGGESTION', () => {
    const r = recommendCardHero({ specialty: 'support' });
    expect(r?.source).toBe('role');
    expect(r?.hero.role).toBe('Support');
  });

  it('traduit « dps » vers le vocabulaire du jeu', () => {
    // Le site dit `dps`, Overwatch dit `Damage` : la traduction vit dans le
    // référentiel, pas ici.
    const r = recommendCardHero({ specialty: 'dps' });
    expect(r?.hero.role).toBe('Damage');
  });

  it('ne suggère RIEN pour une joueuse flex', () => {
    // « N'importe quel héros du jeu » n'est pas une suggestion.
    expect(recommendCardHero({ specialty: 'flex' })).toBeNull();
  });

  it('ne suggère RIEN sans préférence ni rôle', () => {
    expect(recommendCardHero({})).toBeNull();
    expect(
      recommendCardHero({ picks: [], bans: [], specialty: null })
    ).toBeNull();
  });

  it('n’enfreint pas un ban sur le repli par rôle', () => {
    const first = recommendCardHero({ specialty: 'tank' })!;
    const withBan = recommendCardHero({
      specialty: 'tank',
      bans: [first.hero.name],
    });
    expect(withBan?.hero.name).not.toBe(first.hero.name);
    expect(withBan?.hero.role).toBe('Tank');
  });

  it('rend un résultat STABLE d’un appel à l’autre', () => {
    const a = recommendCardHero({ specialty: 'support' });
    const b = recommendCardHero({ specialty: 'support' });
    expect(a?.hero.name).toBe(b?.hero.name);
  });
});
