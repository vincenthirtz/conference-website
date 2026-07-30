import { describe, expect, it } from 'vitest';

import {
  normalizeThemeData,
  positionStyle,
  templateClass,
  themeCssVars,
} from '@/utils/caster/theme';
import { DEFAULT_CASTER_THEME } from '@/types/casterTheme';

describe('normalizeThemeData', () => {
  it('data vide → thème par défaut complet', () => {
    expect(normalizeThemeData(null)).toEqual(DEFAULT_CASTER_THEME);
  });

  it('fusionne des couleurs partielles avec les défauts', () => {
    const t = normalizeThemeData({ colors: { accent1: '#ff0000' } });
    expect(t.colors.accent1).toBe('#ff0000');
    expect(t.colors.accent2).toBe(DEFAULT_CASTER_THEME.colors.accent2);
    expect(t.colors.bg).toBe(DEFAULT_CASTER_THEME.colors.bg);
  });

  it('rejette un template inconnu et retombe sur default', () => {
    expect(normalizeThemeData({ template: 'nope' }).template).toBe('default');
    expect(normalizeThemeData({ template: 'compact' }).template).toBe(
      'compact'
    );
  });

  it('ne pose les champs optionnels que s’ils sont fournis', () => {
    const bare = normalizeThemeData({});
    expect(bare.headingFont).toBeUndefined();
    expect(bare.fontWeight).toBeUndefined();
    expect(bare.fontScale).toBeUndefined();

    const rich = normalizeThemeData({
      headingFont: 'Anton',
      fontWeight: '600',
      fontScale: 1.2,
    });
    expect(rich.headingFont).toBe('Anton');
    expect(rich.fontWeight).toBe('600');
    expect(rich.fontScale).toBe(1.2);
  });

  it('ignore un fontScale non numérique', () => {
    expect(
      normalizeThemeData({ fontScale: 'grand' }).fontScale
    ).toBeUndefined();
  });

  it('conserve les positions fournies en complétant les manquantes', () => {
    const t = normalizeThemeData({
      positions: { owTeam1: { x: 100, y: 20 } },
    });
    expect(t.positions?.owTeam1).toEqual({ x: 100, y: 20 });
    expect(t.positions?.scoreboard).toEqual(
      DEFAULT_CASTER_THEME.positions?.scoreboard
    );
  });
});

describe('themeCssVars', () => {
  it('mappe les couleurs sur les variables de shared.css', () => {
    const vars = themeCssVars(DEFAULT_CASTER_THEME);
    expect(vars['--accent1']).toBe('#00f0ff');
    expect(vars['--bg-card']).toBe('#1b1130');
    expect(vars['--text-muted']).toBe('#8888aa');
    expect(vars['--winner']).toBe('#10b981');
    expect(vars['--font']).toBe('Segoe UI, system-ui, sans-serif');
  });

  it('n’émet les variables optionnelles que si le thème les porte', () => {
    const vars = themeCssVars(DEFAULT_CASTER_THEME);
    expect(vars['--font-heading']).toBeUndefined();
    expect(vars['--font-scale']).toBeUndefined();

    const rich = themeCssVars(
      normalizeThemeData({ headingFont: 'Anton', fontScale: 1.5 })
    );
    expect(rich['--font-heading']).toBe('Anton, system-ui, sans-serif');
    expect(rich['--font-scale']).toBe(1.5);
  });
});

describe('templateClass', () => {
  it('préfixe le gabarit', () => {
    expect(templateClass(DEFAULT_CASTER_THEME)).toBe('template-default');
    expect(templateClass(normalizeThemeData({ template: 'full' }))).toBe(
      'template-full'
    );
  });
});

describe('positionStyle', () => {
  it('bloc centré → left/top + translateX(-50%)', () => {
    expect(
      positionStyle({ scoreboard: { x: 500, y: 40 } }, 'scoreboard')
    ).toEqual({
      left: '500px',
      top: '40px',
      transform: 'translateX(-50%)',
    });
  });

  it('branding → converti en right/bottom sur le canvas 1920×1080', () => {
    expect(
      positionStyle({ branding: { x: 1896, y: 1040 } }, 'branding')
    ).toEqual({
      left: 'auto',
      top: 'auto',
      right: '24px',
      bottom: '40px',
    });
  });

  it('position absente → null (placement CSS par défaut)', () => {
    expect(positionStyle(undefined, 'scoreboard')).toBeNull();
    expect(positionStyle({}, 'owTeam1')).toBeNull();
  });
});
