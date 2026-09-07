import { describe, it, expect } from 'vitest';
import { isEliminationShape } from '../../utils/bracket/shape';

/** Un tour de `n` matchs, sans lien vers un match suivant. */
const r = (n: number) => ({
  matches: Array.from({ length: n }, () => ({ next_match_win_id: null })),
});

/** Un tour de `n` matchs qui désignent leur match suivant. */
const linked = (n: number) => ({
  matches: Array.from({ length: n }, () => ({ next_match_win_id: 'suivant' })),
});

describe('isEliminationShape', () => {
  it('reconnaît un tableau à élimination qui divise par deux', () => {
    expect(isEliminationShape([r(4), r(2), r(1)])).toBe(true);
    expect(isEliminationShape([r(8), r(4), r(2), r(1)])).toBe(true);
  });

  it('absorbe un tableau impair (byes)', () => {
    // 5 → 3 → 2 → 1 : chaque tour tient dans la moitié arrondie au supérieur.
    expect(isEliminationShape([r(5), r(3), r(2), r(1)])).toBe(true);
  });

  it('REFUSE le round robin de la Cup 2026', () => {
    // Sept journées à quatre matchs, puis petite et grande finale. Le premier
    // tour est plus gros que le dernier — l'ancienne heuristique concluait
    // « arbre » et dessinait des connecteurs entre des matchs qui ne
    // s'enchaînent pas.
    const cup2026 = [r(4), r(4), r(4), r(4), r(4), r(4), r(4), r(1), r(1)];
    expect(isEliminationShape(cup2026)).toBe(false);
  });

  it('refuse une poule à taille constante', () => {
    expect(isEliminationShape([r(3), r(3), r(3)])).toBe(false);
  });

  it('refuse une décroissance trop lente pour un arbre', () => {
    // 8 → 6 : un tour d'élimination laisserait au plus 4.
    expect(isEliminationShape([r(8), r(6), r(4)])).toBe(false);
  });

  it('refuse une suite de matchs isolés', () => {
    // 1,1,1 divise « par deux » au sens large, mais ce sont trois finales
    // côte à côte, pas un arbre.
    expect(isEliminationShape([r(1), r(1), r(1)])).toBe(false);
  });

  it('tranche sur le LIEN dès qu’il existe, quelle que soit la forme', () => {
    // Un vrai arbre dont les tours ne décroissent pas visiblement (poule qui
    // alimente une finale, matchs de classement…) reste un arbre si les matchs
    // désignent leur suite.
    expect(isEliminationShape([linked(4), r(4), r(4)])).toBe(true);
  });

  it('ne dit rien d’un tournoi à un seul tour', () => {
    expect(isEliminationShape([r(4)])).toBe(false);
    expect(isEliminationShape([])).toBe(false);
  });

  it('ne divise pas par zéro sur un tour vide', () => {
    expect(isEliminationShape([r(0), r(1)])).toBe(false);
  });
});
