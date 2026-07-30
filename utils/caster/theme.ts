// Application d'un thème caster aux overlays — logique PURE (zéro DOM, zéro
// réseau) : ces fonctions rendent des objets de variables CSS que les
// composants overlay posent sur leur élément racine.
//
// Équivalent web de l'applyTheme() des overlays desktop
// (womenscup-caster/src/overlays/*.html), à une différence près : le desktop
// écrit sur `document.documentElement` en impératif, ici on rend un style
// React. Les noms de variables sont IDENTIQUES à ceux de shared.css, donc les
// mêmes valeurs de thème produisent le même rendu.

import {
  CASTER_TEMPLATES,
  DEFAULT_CASTER_THEME,
  type CasterTemplate,
  type CasterThemeData,
  type CasterThemePositions,
} from '@/types/casterTheme';

/** Fusionne une `data` brute de thème avec les défauts (tolérant au partiel). */
export function normalizeThemeData(
  raw: Record<string, unknown> | null | undefined
): CasterThemeData {
  const d = (raw || {}) as Partial<CasterThemeData>;
  const template = isTemplate(d.template)
    ? d.template
    : DEFAULT_CASTER_THEME.template;
  return {
    template,
    colors: { ...DEFAULT_CASTER_THEME.colors, ...(d.colors || {}) },
    font: d.font || DEFAULT_CASTER_THEME.font,
    ...(d.headingFont ? { headingFont: d.headingFont } : {}),
    ...(d.fontWeight ? { fontWeight: d.fontWeight } : {}),
    ...(Number.isFinite(d.fontScale) ? { fontScale: Number(d.fontScale) } : {}),
    positions: { ...DEFAULT_CASTER_THEME.positions, ...(d.positions || {}) },
  };
}

function isTemplate(value: unknown): value is CasterTemplate {
  return (
    typeof value === 'string' &&
    (CASTER_TEMPLATES as readonly string[]).includes(value)
  );
}

/**
 * Variables CSS d'un thème, à poser sur l'élément racine d'un overlay. Les
 * tokens dérivés de shared.css (--panel, --muted-2, --glow…) se recalculent
 * automatiquement : ils sont définis en `color-mix()` de ces variables-ci.
 *
 * Rend un objet compatible `style={...}` de React (clés `--*` acceptées).
 */
export function themeCssVars(
  theme: CasterThemeData
): Record<string, string | number> {
  const vars: Record<string, string | number> = {
    '--bg': theme.colors.bg,
    '--bg-card': theme.colors.bgCard,
    '--accent1': theme.colors.accent1,
    '--accent2': theme.colors.accent2,
    '--accent3': theme.colors.accent3,
    '--text': theme.colors.text,
    '--text-muted': theme.colors.textMuted,
    '--winner': theme.colors.winner,
  };
  if (theme.font) {
    vars['--font'] = `${theme.font}, system-ui, sans-serif`;
  }
  if (theme.headingFont) {
    vars['--font-heading'] = `${theme.headingFont}, system-ui, sans-serif`;
  }
  if (theme.fontWeight) vars['--font-weight'] = theme.fontWeight;
  if (theme.fontScale) vars['--font-scale'] = theme.fontScale;
  return vars;
}

/** Classe de gabarit à ajouter à la racine (`template-compact`, …). */
export function templateClass(theme: CasterThemeData): string {
  return `template-${theme.template}`;
}

/**
 * Style de repositionnement d'un bloc, quand le thème surcharge sa position.
 * `null` = laisser le placement par défaut du CSS de l'overlay.
 *
 * Convention reprise du desktop : les blocs centrés gardent leur
 * `translateX(-50%)` ; `branding`, ancré en bas à droite, est converti en
 * right/bottom sur le canvas 1920×1080.
 */
export function positionStyle(
  positions: CasterThemePositions | undefined,
  key: keyof CasterThemePositions
): React.CSSProperties | null {
  const pos = positions?.[key];
  if (!pos) return null;
  if (key === 'branding') {
    return {
      left: 'auto',
      top: 'auto',
      right: `${1920 - pos.x}px`,
      bottom: `${1080 - pos.y}px`,
    };
  }
  return {
    left: `${pos.x}px`,
    top: `${pos.y}px`,
    transform: 'translateX(-50%)',
  };
}
