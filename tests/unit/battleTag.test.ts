import { describe, it, expect } from 'vitest';
import { maskBattleTag } from '../../utils/battleTag';

describe('maskBattleTag — anonymat public des BattleTags', () => {
  it('retire l’ID numérique après le #', () => {
    expect(maskBattleTag('Akira#4422')).toBe('Akira');
    expect(maskBattleTag('Yumi#1188')).toBe('Yumi');
  });

  it('gère les pseudos contenant des caractères spéciaux', () => {
    expect(maskBattleTag('La Reine#12345')).toBe('La Reine');
    expect(maskBattleTag('xX_n0va_Xx#0001')).toBe('xX_n0va_Xx');
  });

  it('renvoie la valeur telle quelle sans #', () => {
    expect(maskBattleTag('SansTag')).toBe('SansTag');
  });

  it('coupe au PREMIER # (cas pathologique)', () => {
    expect(maskBattleTag('a#b#c')).toBe('a');
  });

  it('préserve null / undefined / chaîne vide', () => {
    expect(maskBattleTag(null)).toBeNull();
    expect(maskBattleTag(undefined)).toBeUndefined();
    expect(maskBattleTag('')).toBe('');
  });
});
