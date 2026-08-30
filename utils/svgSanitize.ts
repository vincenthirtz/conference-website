// utils/svgSanitize.ts
//
// Un SVG n'est pas une image, c'est un DOCUMENT : il peut porter du
// `<script>`, des attributs `onload=`, un `<foreignObject>` contenant du HTML,
// des références externes qui pistent le visiteur, ou une bombe d'entités XML.
// On ne stocke donc JAMAIS la source telle qu'envoyée — les uploads passent
// tous par `sanitizeSvg`, qui reconstruit le document à partir d'une liste
// BLANCHE d'éléments et d'attributs.
//
// Choix : on NETTOIE plutôt qu'on ne refuse, parce qu'un export Illustrator /
// Figma traîne souvent des métadonnées inoffensives qu'il serait absurde de
// rejeter. Deux exceptions rejetées franchement, car elles signalent autre
// chose qu'un logo maladroitement exporté :
//   - un `<!ENTITY>` (XXE / « billion laughs ») : le mal est fait à l'analyse,
//     pas au rendu, donc on refuse AVANT de parser ;
//   - un document dont la racine n'est pas `<svg>`.
//
// Le module est PUR (aucun accès réseau/disque) et testé unitairement :
// tests/unit/svgSanitize.test.ts.

import * as cheerio from 'cheerio';

export const SVG_MIME = 'image/svg+xml';

/** Un SVG est du texte : 512 Ko est déjà très large pour un logo. */
export const SVG_MAX_BYTES = 512 * 1024;

/**
 * Éléments conservés. Couvre ce qu'un logo utilise réellement (formes,
 * dégradés, masques, filtres, texte). Tout le reste — `script`, `a`,
 * `foreignObject`, `animate`, `set`, `handler`, `image` — disparaît avec son
 * sous-arbre.
 */
const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'title',
  'desc',
  'style',
  'switch',
  'marker',
  // formes
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  // texte
  'text',
  'tspan',
  'textPath',
  // peinture
  'linearGradient',
  'radialGradient',
  'stop',
  'pattern',
  'clipPath',
  'mask',
  // filtres
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
]);

/**
 * Attributs conservés. Volontairement large côté PRÉSENTATION (un logo se
 * décrit avec ça) et fermé côté comportement : aucun `on*` ne peut entrer
 * puisqu'il faut être listé ici, pas seulement échapper à une liste noire.
 */
const ALLOWED_ATTRIBUTES = new Set([
  // structure & géométrie
  'id',
  'class',
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'dx',
  'dy',
  'transform',
  'gradientTransform',
  'patternTransform',
  'preserveAspectRatio',
  'version',
  'xmlns',
  'xmlns:xlink',
  'xml:space',
  // peinture
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'color',
  'stop-color',
  'stop-opacity',
  'offset',
  'style',
  'display',
  'visibility',
  'paint-order',
  'mix-blend-mode',
  'isolation',
  'shape-rendering',
  'vector-effect',
  // dégradés / motifs / masques
  'gradientUnits',
  'patternUnits',
  'patternContentUnits',
  'spreadMethod',
  'clipPathUnits',
  'clip-path',
  'clip-rule',
  'mask',
  'maskUnits',
  'maskContentUnits',
  'markerWidth',
  'markerHeight',
  'markerUnits',
  'refX',
  'refY',
  'orient',
  'marker-start',
  'marker-mid',
  'marker-end',
  // filtres
  'filter',
  'filterUnits',
  'primitiveUnits',
  'in',
  'in2',
  'result',
  'stdDeviation',
  'mode',
  'type',
  'values',
  'operator',
  'k1',
  'k2',
  'k3',
  'k4',
  'radius',
  'scale',
  'baseFrequency',
  'numOctaves',
  'seed',
  'flood-color',
  'flood-opacity',
  'surfaceScale',
  'specularConstant',
  'specularExponent',
  'diffuseConstant',
  'azimuth',
  'elevation',
  'tableValues',
  'slope',
  'intercept',
  'amplitude',
  'exponent',
  // texte
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-stretch',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'text-decoration',
  'dominant-baseline',
  'alignment-baseline',
  'baseline-shift',
  'writing-mode',
  // références (valeur re-validée par `isSafeReference`)
  'href',
  'xlink:href',
]);

/**
 * Attributs dont la valeur est une référence. Seuls un fragment interne
 * (`#gradient-1`) ou une image en `data:` sont acceptés : tout http(s) ferait
 * du SVG un mouchard (le visiteur tape un serveur tiers au rendu), et
 * `javascript:` parle de lui-même.
 */
const REFERENCE_ATTRIBUTES = new Set(['href', 'xlink:href']);

const SAFE_DATA_URI =
  /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

function isSafeReference(value: string): boolean {
  const v = value.trim();
  if (v.startsWith('#')) return true;
  return SAFE_DATA_URI.test(v);
}

/**
 * CSS dangereux, qu'il vienne d'un attribut `style` ou d'un bloc `<style>` :
 * `@import` et `url(http…)` vont chercher dehors, `javascript:` et
 * `expression()` exécutent. On tolère `url(#…)` — c'est ainsi qu'un dégradé
 * interne se référence.
 */
const DANGEROUS_CSS =
  /(@import|expression\s*\(|javascript\s*:|behavior\s*:|url\s*\(\s*['"]?\s*(?!#))/i;

function isSafeCss(value: string): boolean {
  return !DANGEROUS_CSS.test(value);
}

export type SvgSanitizeResult =
  | { ok: true; svg: string }
  | { ok: false; reason: string };

/**
 * Nettoie un SVG et renvoie sa source réécrite, ou la raison du refus.
 * `reason` est un message FR destiné à l'uploadeuse (il remonte tel quel en
 * 400), pas un code technique.
 */
export function sanitizeSvg(source: string): SvgSanitizeResult {
  const raw = String(source ?? '').replace(/^﻿/, '');

  if (!raw.trim()) return { ok: false, reason: 'Le fichier SVG est vide.' };

  // Refus AVANT parsing : une entité personnalisée peut faire exploser
  // l'analyseur (expansion récursive) ou lire un fichier local.
  if (/<!ENTITY/i.test(raw)) {
    return {
      ok: false,
      reason:
        'Ce SVG déclare des entités XML (<!ENTITY>) : réexporte-le sans, ou envoie un PNG.',
    };
  }

  if (!/<svg[\s>]/i.test(raw)) {
    return { ok: false, reason: "Ce fichier n'est pas un SVG." };
  }

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(raw, { xml: true });
  } catch {
    return { ok: false, reason: 'SVG illisible (XML invalide).' };
  }

  const root = $('svg').first();
  if (root.length === 0) {
    return { ok: false, reason: "Ce fichier n'a pas de racine <svg>." };
  }

  // Commentaires et instructions de traitement : sans valeur pour un logo, et
  // c'est là que se cachent les charges utiles conditionnelles.
  $.root()
    .find('*')
    .addBack()
    .contents()
    .filter((_, node) => node.type === 'comment' || node.type === 'directive')
    .remove();

  // Parcours descendant : on retire d'abord les éléments interdits (avec leur
  // sous-arbre), puis on filtre les attributs de ce qui reste.
  root
    .find('*')
    .toArray()
    .forEach((node) => {
      const el = $(node);
      const tag = node.tagName;
      if (!tag || !ALLOWED_ELEMENTS.has(tag)) {
        el.remove();
        return;
      }
      if (tag === 'style') {
        if (!isSafeCss(el.text())) el.remove();
      }
    });

  root
    .find('*')
    .addBack()
    .toArray()
    .forEach((node) => {
      if (!('attribs' in node)) return;
      const el = $(node);
      const attribs = node.attribs ?? {};
      for (const name of Object.keys(attribs)) {
        const value = attribs[name] ?? '';
        if (!ALLOWED_ATTRIBUTES.has(name)) {
          el.removeAttr(name);
          continue;
        }
        if (REFERENCE_ATTRIBUTES.has(name) && !isSafeReference(value)) {
          el.removeAttr(name);
          continue;
        }
        if (name === 'style' && !isSafeCss(value)) {
          el.removeAttr(name);
        }
      }
    });

  // Un SVG sans dimensions intrinsèques ni viewBox se rend en 0×0 dans un
  // <img> : on n'invente pas de taille, on le dit.
  if (!root.attr('viewBox') && !(root.attr('width') && root.attr('height'))) {
    return {
      ok: false,
      reason: 'Ce SVG n’a ni viewBox ni dimensions : il ne s’affichera pas.',
    };
  }

  root.attr('xmlns', 'http://www.w3.org/2000/svg');

  return { ok: true, svg: $.xml(root) };
}
