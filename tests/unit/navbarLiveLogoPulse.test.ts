// Unit tests — le FX « pulse » du logo de la navbar pendant un direct Twitch.
//
// DEUX GARDES, pour deux pannes silencieuses :
//
// 1. Les fichiers. Le FX est lu depuis `public/overlay/tcg/` ; renommé ou
//    déplacé (il appartient d'abord à l'overlay TCG), la vidéo ne charge rien
//    et le logo reste nu pendant le direct — sans erreur ni log.
//
// 2. Le détourage. La navbar est un groupe isolé (`fixed` + `z-index` +
//    `backdrop-filter`) : le `mix-blend-mode: screen` de l'overlay y peint un
//    RECTANGLE NOIR autour du logo. `keyOutBlack` remplace ce mode de fusion ;
//    s'il laisse le noir opaque, le rectangle revient.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  PULSE_SOURCES,
  keyOutBlack,
} from '../../components/Navbar/LiveLogoPulse';
import { parseGap, parseLogo, parseSize } from '../../pages/overlay/logo';

function pixel(r: number, g: number, b: number) {
  const data = new Uint8ClampedArray([r, g, b, 255]);
  keyOutBlack(data);
  return Array.from(data);
}

describe('FX pulse du logo — sources', () => {
  it('propose le WebM avant le MP4', () => {
    expect(PULSE_SOURCES.map((s) => s.type)).toEqual([
      'video/webm',
      'video/mp4',
    ]);
  });

  it('sert réellement les deux fichiers depuis public/', () => {
    for (const { src } of PULSE_SOURCES) {
      const path = resolve(__dirname, '../../public', src.replace(/^\//, ''));
      expect(existsSync(path), `${src} manquant dans public/`).toBe(true);
    }
  });
});

describe('keyOutBlack', () => {
  it('rend le noir pur totalement transparent', () => {
    expect(pixel(0, 0, 0)[3]).toBe(0);
  });

  it('efface aussi le bruit de compression du fond', () => {
    expect(pixel(6, 3, 8)[3]).toBe(0);
    // …et le halo diffus, qui dessinait un voile rectangulaire une fois détouré.
    expect(pixel(22, 8, 26)[3]).toBe(0);
  });

  it('garde le néon vif opaque, couleur intacte', () => {
    expect(pixel(200, 80, 255)).toEqual([200, 80, 255, 255]);
  });

  it('fait d’un halo sombre une couleur vive peu opaque', () => {
    const [r, g, b, a] = pixel(60, 15, 90);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(120);
    // Couleur ramenée à pleine intensité : c'est l'alpha qui porte la
    // faiblesse du halo, sinon il virerait au gris sale sur un fond clair.
    expect(b).toBe(255);
    expect(r).toBeCloseTo(170, -1);
    expect(g).toBeCloseTo(42, -1);
  });
});

/* ── La source OBS autonome ────────────────────────────────────────────────
 *
 * Le même pulse, mais SANS condition de direct : une source d'habillage n'a pas
 * à deviner l'état du stream, c'est OBS qui décide quand la scène est à
 * l'écran. Les paramètres viennent d'une URL collée à la main dans OBS, donc
 * personne ne les valide à la saisie.
 */

describe('/overlay/logo — paramètres', () => {
  it('borne la taille et retombe sur le défaut', () => {
    expect(parseSize('480')).toBe(480);
    expect(parseSize(undefined)).toBe(256);
    expect(parseSize('abc')).toBe(256);
    expect(parseSize('5000')).toBe(720);
    expect(parseSize('1')).toBe(64);
  });

  it('accepte un enchaînement sans pause, borne le reste', () => {
    expect(parseGap('0')).toBe(0);
    expect(parseGap('1500')).toBe(1500);
    expect(parseGap(undefined)).toBe(3600);
    expect(parseGap('999999')).toBe(60000);
  });

  it('refuse une image hors du site', () => {
    // La page est publique : une URL libre en paramètre afficherait n'importe
    // quoi à l'antenne.
    expect(parseLogo('/img/logos/2025-logo.png')).toBe(
      '/img/logos/2025-logo.png'
    );
    expect(parseLogo('https://exemple.test/pub.png')).toBe(
      '/img/logos/2026-logo.png'
    );
    expect(parseLogo('/img/../../etc/passwd')).toBe('/img/logos/2026-logo.png');
    expect(parseLogo(undefined)).toBe('/img/logos/2026-logo.png');
  });
});
