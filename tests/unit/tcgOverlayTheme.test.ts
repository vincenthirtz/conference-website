// Habillage de l'overlay TCG : la moitié PURE (formes, défauts, validation).
// Target: utils/tcg/overlayThemeShape.ts
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LE PATCH EST PARTIEL. Une clé ABSENTE n'est pas écrite ; une clé à
//      `null` l'est, avec la valeur `null`. La distinction porte tout
//      l'éditeur : sans elle, régler la couleur effacerait la position, et on
//      ne saurait jamais REVENIR au défaut — seulement changer de valeur.
//
//   2. LES ESPACES SURVIVENT AU NETTOYAGE. Écrite avec une plage mal échappée,
//      la regex de `cleanOverlayLine` supprime les espaces au lieu des
//      caractères de contrôle : « Carte pour {name} » partirait
//      « Cartepour{name} » à l'antenne. La faute est invisible en relecture —
//      les deux versions se ressemblent — et ce test est le seul filet.
//
//   3. LA BASE N'EST PAS LE PREMIER REMPART. Couleur, position et longueur sont
//      refusées ICI, avec un `code` que l'interface sait traduire, plutôt que
//      de laisser remonter un message Postgres brut.

import { describe, it, expect } from 'vitest';

import {
  cleanOverlayLine,
  validateThemePatch,
  DEFAULT_OVERLAY_THEME,
  OVERLAY_LINE_MAX,
  OVERLAY_POSITIONS,
} from '../../utils/tcg/overlayThemeShape';

describe('cleanOverlayLine', () => {
  it('PRÉSERVE LES ESPACES — la régression à ne jamais réintroduire', () => {
    // Avec la plage écrite en caractères littéraux, cette assertion tombe :
    // le résultat devient « Cartepour{name} ». Cf. l'en-tête du fichier.
    expect(cleanOverlayLine('Carte pour {name}')).toBe('Carte pour {name}');
  });

  it('retire les caractères de contrôle, y compris le NUL', () => {
    expect(cleanOverlayLine('a\u0000b\u001fc\u007fd')).toBe('abcd');
  });

  it('retire un saut de ligne plutôt que de casser la mise en page', () => {
    expect(cleanOverlayLine('haut\nbas')).toBe('hautbas');
  });

  it('rend null pour une chaîne vide ou blanche — « reviens au défaut »', () => {
    // Vider le champ ne doit pas afficher une ligne vide en direct : c'est la
    // demande de revenir à la phrase traduite.
    expect(cleanOverlayLine('')).toBeNull();
    expect(cleanOverlayLine('   ')).toBeNull();
  });

  it('rend null pour ce qui n’est pas une chaîne', () => {
    expect(cleanOverlayLine(undefined)).toBeNull();
    expect(cleanOverlayLine(42)).toBeNull();
    expect(cleanOverlayLine(null)).toBeNull();
  });

  it('tronque à la borne plutôt que de faire refuser par le CHECK', () => {
    const long = 'a'.repeat(OVERLAY_LINE_MAX + 50);
    expect(cleanOverlayLine(long)).toHaveLength(OVERLAY_LINE_MAX);
  });
});

describe('validateThemePatch — patch partiel', () => {
  it('n’écrit RIEN pour un corps vide', () => {
    const result = validateThemePatch({});
    expect(result).toEqual({ ok: true, row: {} });
  });

  it('n’écrit que les clés PRÉSENTES', () => {
    // Le point vital : régler la couleur ne doit pas emporter la position.
    const result = validateThemePatch({ accentColor: '#ABCDEF' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toEqual({ accent_color: '#ABCDEF' });
    expect('position' in result.row).toBe(false);
    expect('drop_line' in result.row).toBe(false);
  });

  it('distingue « absent » de « null » — null EST une valeur', () => {
    const absent = validateThemePatch({});
    const explicit = validateThemePatch({ accentColor: null });
    expect(absent.ok && 'accent_color' in absent.row).toBe(false);
    expect(explicit.ok && explicit.row.accent_color).toBeNull();
  });

  it('traite la chaîne vide comme un retour au défaut', () => {
    // Un `<input type="color">` vidé rend '' et non null : les deux doivent
    // vouloir dire la même chose, sans quoi l'interface devrait le savoir.
    const result = validateThemePatch({ accentColor: '', position: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.accent_color).toBeNull();
    expect(result.row.position).toBeNull();
  });
});

describe('validateThemePatch — refus', () => {
  it('refuse une couleur qui n’est pas un hexadécimal à six chiffres', () => {
    // Cette valeur part dans un attribut `style` : une chaîne arbitraire n'y a
    // pas sa place.
    for (const bad of ['red', '#FFF', '#GGGGGG', 'javascript:alert(1)']) {
      expect(validateThemePatch({ accentColor: bad })).toEqual({
        ok: false,
        code: 'invalid_color',
      });
    }
  });

  it('accepte l’hexadécimal dans les deux casses', () => {
    expect(validateThemePatch({ accentColor: '#abcdef' }).ok).toBe(true);
    expect(validateThemePatch({ accentColor: '#ABCDEF' }).ok).toBe(true);
  });

  it('refuse une position hors de la liste close', () => {
    expect(validateThemePatch({ position: 'middle' })).toEqual({
      ok: false,
      code: 'invalid_position',
    });
  });

  it('accepte chacune des positions annoncées', () => {
    for (const position of OVERLAY_POSITIONS) {
      const result = validateThemePatch({ position });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.row.position).toBe(position);
    }
  });

  it('nettoie les formulations au lieu de les refuser', () => {
    // Une phrase trop longue n'est pas une faute de la régie : on la borne.
    const result = validateThemePatch({
      dropLine: 'x'.repeat(200),
      winLine: '  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.drop_line).toHaveLength(OVERLAY_LINE_MAX);
    expect(result.row.win_line).toBeNull();
  });
});

describe('DEFAULT_OVERLAY_THEME', () => {
  it('laisse les formulations à null — le défaut est TRADUIT, pas écrit ici', () => {
    // Y écrire une phrase française la figerait dans une langue : le défaut
    // doit rester la clé i18n de l'overlay.
    expect(DEFAULT_OVERLAY_THEME.dropLine).toBeNull();
    expect(DEFAULT_OVERLAY_THEME.winLine).toBeNull();
  });

  it('propose une position figurant dans la liste close', () => {
    expect(OVERLAY_POSITIONS).toContain(DEFAULT_OVERLAY_THEME.position);
  });

  it('porte une couleur valide au sens du validateur', () => {
    // Le défaut doit passer sa propre validation, sinon un aller-retour par
    // l'éditeur le refuserait.
    expect(
      validateThemePatch({ accentColor: DEFAULT_OVERLAY_THEME.accentColor }).ok
    ).toBe(true);
  });
});
